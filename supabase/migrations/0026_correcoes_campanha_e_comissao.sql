-- ============================================================================
-- 0026 — Correções da superauditoria (09/08/2026)
-- ----------------------------------------------------------------------------
-- Bugs confirmados por verificação adversarial na migration 0024 (campanhas,
-- minha, de ontem) + um bug de dinheiro antigo (comissão no estorno).
--
--  C1  aniversário parabeniza 1 paciente por CLÍNICA por ano (dedup sem paciente)
--  C2  inadimplência: dedup por CONJUNTO de parcelas → 2ª cobrança quando paga 1
--  C3  campanha envia telefone sem DDI 55 → uazapi fala com número errado
--  C4  campanha_envios trava em 'enfileirado' pra sempre (histórico mente)
--  C5  1 clínica com dado venenoso aborta o batch de TODAS no dia
--  C6  estornar parcela paga não devolve a comissão liberada (dinheiro real)
-- ============================================================================

begin;

-- ---------------------------------------------------------------- C1+C2+C3
-- campanha_publico: chave de dedup por PACIENTE, filtro de atraso tolerante,
-- e telefone normalizado com 55. A normalização mora aqui (não no worker)
-- porque o chat já manda to_number com 55 e a campanha não — dois produtores,
-- formatos diferentes; corrigir na origem da campanha não mexe no chat.
create or replace function public.campanha_publico(
  p_clinica uuid,
  p_tipo    public.tipo_campanha,
  p_config  jsonb default '{}'::jsonb,
  p_horizonte_dias int default 0
) returns table (
  paciente_id uuid,
  telefone    text,
  primeiro_nome text,
  valor_devido numeric,
  chave_dedup text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with base as (
    select p.id,
           -- DDI 55 na frente quando não vier (cadastro salva 10-11 dígitos)
           case
             when regexp_replace(coalesce(p.celular,''), '\D', '', 'g') ~ '^55'
               then regexp_replace(p.celular, '\D', '', 'g')
             else '55' || regexp_replace(coalesce(p.celular,''), '\D', '', 'g')
           end as fone,
           split_part(btrim(p.nome_completo), ' ', 1) as primeiro_nome,
           p.data_nascimento
      from pacientes p
     where p.clinica_id = p_clinica
       and coalesce(p.ativo, true)
       and p.aceita_lembretes
       and length(regexp_replace(coalesce(p.celular,''), '\D', '', 'g')) >= 10
  )
  -- ----------------------------------------------------------- aniversário
  select b.id, b.fone, b.primeiro_nome, null::numeric,
         -- C1: chave inclui o paciente — senão o 1º aniversariante do ano
         -- consome a chave e todos os outros caem em unique_violation
         b.id::text || ':' || extract(year from now())::text
    from base b
   where p_tipo = 'aniversario'
     and b.data_nascimento is not null
     and case
           when p_horizonte_dias <= 0 then
             to_char(b.data_nascimento, 'MM-DD') = to_char(now(), 'MM-DD')
           else (
             select min(d) from generate_series(0, p_horizonte_dias) g(off)
              cross join lateral (select to_char(now() + make_interval(days => g.off), 'MM-DD') d) x
              where x.d = to_char(b.data_nascimento, 'MM-DD')
           ) is not null
         end

  union all
  -- ----------------------------------------------------------- retorno
  select u.id, u.fone, u.primeiro_nome, null::numeric,
         u.ultima_consulta_id::text
    from (
      select b.id, b.fone, b.primeiro_nome,
             (select c.id from consultas c
               where c.clinica_id = p_clinica and c.paciente_id = b.id
                 and c.status = 'concluido'
               order by c.inicio desc limit 1) as ultima_consulta_id,
             (select max(c.inicio) from consultas c
               where c.clinica_id = p_clinica and c.paciente_id = b.id
                 and c.status = 'concluido') as ultima_concluida,
             (select count(*) from consultas c
               where c.clinica_id = p_clinica and c.paciente_id = b.id
                 and c.inicio > now()
                 and c.status in ('pendente','agendado','confirmado')) as futuras
        from base b
    ) u
   where p_tipo = 'retorno'
     and u.ultima_concluida is not null
     and u.futuras = 0
     and u.ultima_concluida
         <= now()
            - make_interval(months => coalesce((p_config->>'meses')::int, 6))
            + make_interval(days => greatest(p_horizonte_dias, 0))

  union all
  -- ----------------------------------------------------------- inadimplência
  select b.id, b.fone, b.primeiro_nome, d.total,
         -- C2: 1 cobrança por paciente por mês, independe de quantas parcelas
         -- ou de o paciente pagar uma no meio do mês
         b.id::text || ':' || to_char(now(), 'YYYY-MM')
    from base b
    join lateral (
      select sum(lp.valor - coalesce(lp.valor_pago, 0)) as total
        from lancamento_parcelas lp
        join lancamentos l on l.id = lp.lancamento_id
       where lp.clinica_id = p_clinica
         and l.paciente_id = b.id
         and l.tipo = 'receber'
         -- C2b: tolera 'atrasado' — o job marcar_parcelas_atrasadas pode ligar
         -- a qualquer momento e viraria o status sem a campanha perceber
         and lp.status in ('pendente','atrasado')
         and lp.vencimento < current_date
    ) d on d.total > 0
   where p_tipo = 'inadimplencia'
$$;

revoke all on function public.campanha_publico(uuid, public.tipo_campanha, jsonb, int) from public, anon, authenticated;

-- ---------------------------------------------------------------- C4
-- Trigger que espelha o destino da mensagem na outbox de volta pro histórico
-- de campanha: 'sent' → enviado, 'dead' → erro. Casa por outbox_id (índice já
-- criado na 0024). É o único ponto observável de sucesso do módulo.
create or replace function public.campanha_envio_sincronizar_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = old.status then return new; end if;
  if new.status = 'sent' then
    update campanha_envios set status = 'enviado', updated_at = now()
     where outbox_id = new.id and status <> 'enviado';
  elsif new.status = 'dead' then
    update campanha_envios set status = 'erro', motivo = new.last_error, updated_at = now()
     where outbox_id = new.id and status <> 'erro';
  end if;
  return new;
end $$;

revoke all on function public.campanha_envio_sincronizar_status() from public, anon, authenticated;

drop trigger if exists trg_campanha_envio_status on public.whatsapp_outbox;
create trigger trg_campanha_envio_status
  after update of status on public.whatsapp_outbox
  for each row execute function public.campanha_envio_sincronizar_status();

-- ---------------------------------------------------------------- C5
-- Runner com isolamento por clínica: erro numa clínica não derruba o dia das
-- outras. Também grava 'erro' no envio quando dá pra saber qual foi.
create or replace function public.campanhas_executar()
returns table (campanha uuid, enfileirados int)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_camp record;
  v_alvo record;
  v_inst uuid;
  v_msg  text;
  v_outbox uuid;
  v_n int;
begin
  for v_camp in
    select c.*, cl.nome_clinica
      from campanhas c
      join clinicas cl on cl.id = c.clinica_id
     where c.ativa
  loop
    -- C5: cada clínica num savepoint — dado venenoso de uma não reverte as outras
    begin
      select i.id into v_inst
        from whatsapp_instances i
       where i.clinica_id = v_camp.clinica_id and i.status = 'connected'
       order by i.connected_at desc nulls last
       limit 1;
      if v_inst is null then continue; end if;

      v_n := 0;
      for v_alvo in
        select * from campanha_publico(v_camp.clinica_id, v_camp.tipo, v_camp.config, 0)
      loop
        begin
          v_msg := replace(replace(replace(v_camp.mensagem,
                     '{nome}', coalesce(v_alvo.primeiro_nome, '')),
                     '{clinica}', coalesce(v_camp.nome_clinica, '')),
                     '{valor}', coalesce(to_char(v_alvo.valor_devido, 'FM999G999G990D00'), ''));

          insert into campanha_envios
            (clinica_id, campanha_id, paciente_id, telefone, mensagem, chave_dedup)
          values
            (v_camp.clinica_id, v_camp.id, v_alvo.paciente_id, v_alvo.telefone, v_msg, v_alvo.chave_dedup);
        exception when unique_violation then
          continue;  -- já enviado neste ciclo de dedup
        end;

        insert into whatsapp_outbox
          (clinica_id, instance_id, to_number, kind, payload, scheduled_at, next_attempt_at)
        values
          (v_camp.clinica_id, v_inst, v_alvo.telefone, 'text',
           jsonb_build_object('text', v_msg), now(), now())
        returning id into v_outbox;

        update campanha_envios set outbox_id = v_outbox
         where campanha_id = v_camp.id and chave_dedup = v_alvo.chave_dedup;

        v_n := v_n + 1;
      end loop;

      if v_n > 0 then
        campanha := v_camp.id; enfileirados := v_n; return next;
      end if;

    exception when others then
      raise warning 'campanha % (clínica %): %', v_camp.id, v_camp.clinica_id, sqlerrm;
    end;
  end loop;
end $$;

revoke all on function public.campanhas_executar() from public, anon, authenticated;

-- ---------------------------------------------------------------- C6
-- Comissão liberada por baixa precisa VOLTAR pra prevista quando a baixa é
-- desfeita (estorno). Sem isto a clínica paga o dentista sobre dinheiro que
-- saiu do caixa — o próprio código admitia o buraco em comentário.
create or replace function public.parcela_reverter_comissoes()
returns trigger
language plpgsql
as $$
begin
  -- baixa desfeita: 'pago' → pendente/estornado/atrasado. 'paga' (dentista já
  -- recebeu) fica intocada de propósito — reverter aí seria calote no dentista.
  if old.status = 'pago' and new.status in ('pendente','estornado','atrasado') then
    update comissoes
       set status = 'prevista', liberada_em = null, updated_at = now()
     where parcela_id = new.id and status = 'liberada';
  end if;
  return new;
end $$;

drop trigger if exists trg_parcela_reverter_comissoes on public.lancamento_parcelas;
create trigger trg_parcela_reverter_comissoes
  after update of status on public.lancamento_parcelas
  for each row execute function public.parcela_reverter_comissoes();

commit;
