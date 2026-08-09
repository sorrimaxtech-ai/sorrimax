-- ============================================================================
-- 0025 — Dados de exemplo no onboarding ("conta viva no primeiro login")
-- ----------------------------------------------------------------------------
-- Fecha o A1 da auditoria pelo caminho estrutural: em vez de manter demo fake
-- em 39 telas, a clínica nasce com UM paciente de exemplo ligado ao grafo
-- inteiro — consulta passada e futura na agenda, orçamento com item aprovado e
-- pendente, parcelas (uma vencida → acende Financeiro e o preview da campanha
-- de cobrança). Truque do benchmark: o paciente leva o telefone do PRÓPRIO
-- dono, então testar campanha/confirmação manda mensagem para ele mesmo — a
-- demo de WhatsApp vira real e ninguém de fora é incomodado.
--
-- Reversível: limpar_dados_exemplo() apaga a cadeia na ordem certa.
-- ============================================================================

begin;

create or replace function public.seed_dados_exemplo(p_clinica uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_prof     uuid;
  v_fone     text;
  v_pac      uuid;
  v_proc1    uuid;
  v_proc2    uuid;
  v_orc      uuid;
  v_item1    uuid;
begin
  -- só em clínica virgem: nunca poluir base que já tem paciente de verdade
  if exists (select 1 from pacientes where clinica_id = p_clinica) then
    return;
  end if;

  select id into v_prof from profiles
   where clinica_id = p_clinica and role = 'admin'
   order by created_at limit 1;
  if v_prof is null then return; end if;

  select telefone into v_fone from clinicas where id = p_clinica;

  -- ------------------------------------------------------------ paciente
  insert into pacientes (clinica_id, nome_completo, apelido, celular, data_nascimento,
                         genero, observacoes, aceita_lembretes)
  values (p_clinica, 'Paciente de Exemplo', 'Exemplo',
          coalesce(nullif(btrim(v_fone), ''), '(00) 00000-0000'),
          -- aniversário daqui a 2 dias (badge de aniversário + campanha testável)
          (date_trunc('day', now()) + interval '2 days' - interval '29 years')::date,
          'outro',
          'Criado automaticamente para você explorar o sistema. '
          'Este paciente usa o telefone da clínica: campanhas e confirmações de teste chegam no SEU WhatsApp. '
          'Para removê-lo, use "Limpar dados de exemplo" em Pacientes.',
          true)
  returning id into v_pac;

  -- ------------------------------------------------------------ procedimentos
  select id into v_proc1 from procedimentos where clinica_id = p_clinica order by created_at limit 1;
  if v_proc1 is null then
    insert into procedimentos (clinica_id, nome, valor, duracao_min)
    values (p_clinica, 'Limpeza (profilaxia)', 180, 40) returning id into v_proc1;
  end if;
  select id into v_proc2 from procedimentos
   where clinica_id = p_clinica and id <> v_proc1 order by created_at limit 1;
  if v_proc2 is null then
    insert into procedimentos (clinica_id, nome, valor, duracao_min)
    values (p_clinica, 'Restauração em resina', 350, 60) returning id into v_proc2;
  end if;

  -- ------------------------------------------------------------ consultas
  -- uma concluída semana passada (alimenta "última consulta" e histórico)…
  insert into consultas (clinica_id, paciente_id, profissional_id, servico_id, titulo,
                         inicio, fim, status, valor)
  values (p_clinica, v_pac, v_prof, v_proc1, 'Limpeza — exemplo',
          date_trunc('day', now()) - interval '7 days' + interval '10 hours',
          date_trunc('day', now()) - interval '7 days' + interval '10 hours 40 minutes',
          'concluido', 180);
  -- …e uma agendada para amanhã 10h (aparece na agenda logo no primeiro acesso)
  insert into consultas (clinica_id, paciente_id, profissional_id, servico_id, titulo,
                         inicio, fim, status, valor)
  values (p_clinica, v_pac, v_prof, v_proc2, 'Restauração — exemplo',
          date_trunc('day', now()) + interval '1 day 10 hours',
          date_trunc('day', now()) + interval '1 day 11 hours',
          'agendado', 350);

  -- ------------------------------------------------------------ orçamento
  insert into orcamentos (clinica_id, paciente_id, profissional_id, titulo, status)
  values (p_clinica, v_pac, v_prof, 'Plano de tratamento de exemplo', 'aberto')
  returning id into v_orc;

  insert into orcamento_itens (clinica_id, orcamento_id, procedimento_id, denticao,
                               dente, faces, quantidade, valor_unitario, desconto, status, ordem)
  values (p_clinica, v_orc, v_proc2, 'permanente', 16, '{}', 1, 570, 0, 'pendente', 0)
  returning id into v_item1;
  insert into orcamento_itens (clinica_id, orcamento_id, procedimento_id, denticao,
                               dente, faces, quantidade, valor_unitario, desconto, status, ordem)
  values (p_clinica, v_orc, v_proc1, 'permanente', 26, '{}', 1, 180, 0, 'pendente', 1);

  -- aprovar o primeiro item via UPDATE dispara os triggers reais
  -- (odontograma + funil + totais) — o mesmo caminho do clique na UI
  update orcamento_itens set status = 'aprovado' where id = v_item1;

  -- ------------------------------------------------------------ financeiro
  -- gerar_debitos_orcamento exige auth.uid() (contexto de usuário) — o seed
  -- roda sem JWT, então o lançamento entra direto: 2 parcelas do item
  -- aprovado, a primeira vencida há 8 dias → o Financeiro e o preview da
  -- campanha de cobrança já nascem com conteúdo.
  declare v_lanc uuid;
  begin
    insert into lancamentos (clinica_id, tipo, descricao, paciente_id, orcamento_id,
                             profissional_id, valor_total, forma_pagamento, qtd_parcelas)
    values (p_clinica, 'receber', 'Plano de tratamento de exemplo', v_pac, v_orc,
            v_prof, 570, 'pix', 2)
    returning id into v_lanc;

    insert into lancamento_parcelas (clinica_id, lancamento_id, numero, valor, vencimento, status)
    values (p_clinica, v_lanc, 1, 285, current_date - 8, 'pendente'),
           (p_clinica, v_lanc, 2, 285, current_date + 22, 'pendente');
  end;
end $$;

-- ---------------------------------------------------------------- limpeza
create or replace function public.limpar_dados_exemplo()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_clinica uuid := public.current_clinica_id();
  v_pac uuid;
begin
  if v_clinica is null then raise exception 'Não autenticado'; end if;

  select id into v_pac from pacientes
   where clinica_id = v_clinica
     and nome_completo = 'Paciente de Exemplo'
     and observacoes like 'Criado automaticamente%';
  if v_pac is null then return; end if;

  -- ordem respeita as FKs RESTRICT (consultas/orçamentos seguram o paciente)
  delete from lancamentos where clinica_id = v_clinica and paciente_id = v_pac;
  delete from consultas   where clinica_id = v_clinica and paciente_id = v_pac;
  delete from oportunidades where clinica_id = v_clinica and paciente_id = v_pac;
  delete from orcamentos  where clinica_id = v_clinica and paciente_id = v_pac;
  delete from pacientes   where clinica_id = v_clinica and id = v_pac;
end $$;

revoke all on function public.seed_dados_exemplo(uuid) from public, anon, authenticated;
revoke all on function public.limpar_dados_exemplo() from public, anon;
grant execute on function public.limpar_dados_exemplo() to authenticated;

-- ---------------------------------------------------------------- gancho
-- criar_clinica_para_usuario passa a semear a conta viva no fim
create or replace function public.criar_clinica_para_usuario(
  p_nome_clinica text,
  p_telefone     text default null,
  p_email        text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_email   text;
  v_atual   uuid;
  v_clinica uuid;
begin
  if v_uid is null then
    raise exception 'Não autenticado: faça login antes de criar a clínica';
  end if;

  select clinica_id into v_atual from public.profiles where id = v_uid;
  if v_atual is not null then
    return v_atual;
  end if;

  if coalesce(trim(p_nome_clinica), '') = '' then
    raise exception 'Nome da clínica é obrigatório';
  end if;

  select coalesce(p_email, email) into v_email from auth.users where id = v_uid;

  insert into public.clinicas (nome_clinica, email_clinica, telefone)
  values (trim(p_nome_clinica), v_email, p_telefone)
  returning id into v_clinica;

  insert into public.profiles (id, clinica_id, email, full_name, telefone, role, status)
  values (v_uid, v_clinica, v_email,
          coalesce((select raw_user_meta_data->>'full_name' from auth.users where id = v_uid), v_email),
          p_telefone, 'admin', 'active')
  on conflict (id) do update
     set clinica_id = excluded.clinica_id,
         telefone   = coalesce(excluded.telefone, public.profiles.telefone),
         role       = 'admin',
         status     = 'active';

  -- conta viva: paciente exemplo + agenda + orçamento + parcelas.
  -- Falha aqui não pode derrubar o cadastro — o seed é bônus, não requisito.
  begin
    perform public.seed_dados_exemplo(v_clinica);
  exception when others then
    null;
  end;

  return v_clinica;
end $$;

commit;
