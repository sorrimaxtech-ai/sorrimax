-- ============================================================================
-- 0025 — A venda lançada na agenda tem que chegar no odontograma
-- ----------------------------------------------------------------------------
-- Achado por teste end-to-end da 0024: o dente vendido no atendimento não
-- aparecia no odontograma do paciente.
--
-- Causa: `trg_orc_item_odontograma` é AFTER **UPDATE** e só dispara na
-- TRANSIÇÃO de status para 'aprovado'. Isso cobria o caminho antigo (item nasce
-- pendente no orçamento e depois é aprovado), mas não cobre item que já NASCE
-- aprovado — que é exatamente o caso de procedimento executado na cadeira.
-- Resultado: prontuário mudo, mesmo com a venda faturada.
--
-- Correção em duas partes:
--   1. o gatilho passa a valer para INSERT também (fecha o buraco para
--      qualquer caminho que insira item já aprovado, não só o meu);
--   2. `consulta_lancar_venda` carimba o profissional do atendimento no
--      orçamento e marca os registros como 'finalizado' — o procedimento não
--      está planejado, ele já foi executado.
-- ============================================================================

create or replace function public.orcamento_item_para_odontograma()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- INSERT já aprovado (venda no atendimento) OU transição para aprovado
  -- (aprovação do orçamento). Os dois caminhos levam o dente ao prontuário.
  if (tg_op = 'INSERT' and new.status = 'aprovado')
     or (tg_op = 'UPDATE' and new.status = 'aprovado' and old.status is distinct from 'aprovado')
  then
    insert into public.odontograma_registros (
      clinica_id, paciente_id, denticao, dente, faces, regiao,
      procedimento_id, estado, orcamento_item_id, profissional_id
    )
    select new.clinica_id, o.paciente_id, new.denticao, new.dente, new.faces, new.regiao,
           new.procedimento_id, 'planejado', new.id, o.profissional_id
      from public.orcamentos o
     where o.id = new.orcamento_id
       -- odontograma exige alvo (`odonto_alvo_definido`: dente OU região).
       -- Procedimento de boca inteira ou sem dente — clareamento, profilaxia,
       -- taxa de consulta — é venda legítima e simplesmente não tem marcação
       -- no mapa dental. Sem esta guarda, a venda inteira falharia por causa
       -- de um item que nunca deveria virar registro.
       and (new.dente is not null or new.regiao is not null)
       and not exists (
         select 1 from public.odontograma_registros r where r.orcamento_item_id = new.id
       );
  end if;
  return new;
end $$;

revoke all on function public.orcamento_item_para_odontograma() from anon, public;

drop trigger if exists trg_orc_item_odontograma on public.orcamento_itens;
create trigger trg_orc_item_odontograma
  after insert or update on public.orcamento_itens
  for each row execute function public.orcamento_item_para_odontograma();

-- ---------------------------------------------------------------------------
-- A venda do atendimento: profissional correto + estado 'finalizado'
-- ---------------------------------------------------------------------------
create or replace function public.consulta_lancar_venda(
  p_consulta_id uuid,
  p_itens jsonb           -- [{procedimento_id, dente, faces[], quantidade, valor_unitario, desconto}]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_consulta   public.consultas%rowtype;
  v_clinica    uuid := public.current_clinica_id();
  v_orcamento  uuid;
  v_item       jsonb;
  v_valor      numeric;
  v_ids        uuid[] := '{}';
  v_novo       uuid;
begin
  if v_clinica is null then
    raise exception 'Sem clínica no contexto.';
  end if;

  select * into v_consulta from public.consultas where id = p_consulta_id;
  if not found or v_consulta.clinica_id is distinct from v_clinica then
    raise exception 'Atendimento não encontrado nesta clínica.';
  end if;
  if v_consulta.tipo <> 'consulta' or v_consulta.paciente_id is null then
    raise exception 'Compromisso interno não gera venda.';
  end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe ao menos um procedimento.';
  end if;

  v_orcamento := v_consulta.orcamento_id;

  if v_orcamento is null then
    -- o profissional do atendimento é quem executou: é ele que o gatilho do
    -- odontograma e o cálculo de comissão precisam enxergar.
    insert into public.orcamentos (clinica_id, paciente_id, profissional_id, titulo, status)
    values (v_clinica, v_consulta.paciente_id, v_consulta.profissional_id,
            'Atendimento de ' || to_char(v_consulta.inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
            'aberto')
    returning id into v_orcamento;

    update public.consultas set orcamento_id = v_orcamento where id = p_consulta_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    -- valor do procedimento vem do cadastro quando não for informado, para a
    -- recepção não precisar digitar preço (e não errar).
    v_valor := nullif(v_item->>'valor_unitario', '')::numeric;
    if v_valor is null then
      select valor into v_valor from public.procedimentos
       where id = (v_item->>'procedimento_id')::uuid and clinica_id = v_clinica;
    end if;

    insert into public.orcamento_itens (
      clinica_id, orcamento_id, procedimento_id, dente, faces,
      quantidade, valor_unitario, desconto, status
    ) values (
      v_clinica, v_orcamento,
      (v_item->>'procedimento_id')::uuid,
      nullif(v_item->>'dente','')::int,
      -- `faces` é NOT NULL default '{}': procedimento que não é por face
      -- (extração, profilaxia) precisa de array vazio, nunca NULL.
      coalesce(
        (select array_agg(x::public.face_dental)
           from jsonb_array_elements_text(coalesce(v_item->'faces', '[]'::jsonb)) x),
        '{}'::public.face_dental[]
      ),
      coalesce(nullif(v_item->>'quantidade','')::numeric, 1),
      coalesce(v_valor, 0),
      coalesce(nullif(v_item->>'desconto','')::numeric, 0),
      'aprovado'   -- foi executado no atendimento: já nasce aprovado
    )
    returning id into v_novo;

    v_ids := v_ids || v_novo;
  end loop;

  -- Executado na cadeira, não planejado. Só os itens DESTE lançamento — um
  -- orçamento pode misturar itens executados com itens ainda por fazer.
  update public.odontograma_registros
     set estado = 'finalizado', consulta_id = p_consulta_id
   where orcamento_item_id = any(v_ids);

  return v_orcamento;
end $$;

revoke all on function public.consulta_lancar_venda(uuid, jsonb) from anon, public;
grant execute on function public.consulta_lancar_venda(uuid, jsonb) to authenticated;
