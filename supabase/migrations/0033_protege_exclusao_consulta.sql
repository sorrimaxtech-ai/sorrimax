-- ============================================================================
-- 0033 — Protege a exclusão de consulta que virou histórico
-- ----------------------------------------------------------------------------
-- Superauditoria (B1): `excluirConsulta` é hard delete. Apagar uma consulta
-- que JÁ ACONTECEU (concluída, em atendimento, faltou) ou que tem registros
-- clínicos/financeiros vinculados destrói o histórico que alimenta a campanha
-- de retorno ("última consulta") e orfana odontograma, anamnese, documentos,
-- lançamentos e evoluções (todos com `on delete set null`).
--
-- Erro de lançamento (um agendamento futuro criado errado, sem nada anexado)
-- continua excluível. O resto: cancela, não apaga.
--
-- Vale pros dois caminhos de código (consultas.ts e agenda.ts) porque a regra
-- vive no banco, não na tela.
-- ============================================================================

begin;

create or replace function public.consulta_protege_exclusao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Exclusão em CASCADE da própria clínica (offboarding): o pai já se foi,
  -- deixa a linha seguir em vez de travar o desligamento da conta.
  if not exists (select 1 from public.clinicas where id = old.clinica_id) then
    return old;
  end if;

  -- Consulta que já aconteceu é histórico (retorno, faltas, faturamento):
  -- não se apaga, cancela — o status preserva o registro.
  if old.status in ('em_atendimento', 'concluido', 'nao_compareceu') then
    raise exception
      'Consulta já atendida (%). Cancele em vez de excluir, para preservar o histórico do paciente.',
      old.status;
  end if;

  -- Registros clínicos/financeiros vinculados? (rótulos da agenda são
  -- cosméticos e não contam — um agendamento errado pode ter cor/etiqueta.)
  if exists (select 1 from public.anamnese_respostas    where consulta_id = old.id)
     or exists (select 1 from public.documentos_emitidos  where consulta_id = old.id)
     or exists (select 1 from public.estoque_movimentos   where consulta_id = old.id)
     or exists (select 1 from public.odontograma_registros where consulta_id = old.id)
     or exists (select 1 from public.evolucoes            where consulta_id = old.id)
     or exists (select 1 from public.lancamentos          where consulta_id = old.id) then
    raise exception
      'Esta consulta tem registros clínicos ou financeiros vinculados. Cancele em vez de excluir.';
  end if;

  return old;
end $$;

revoke all on function public.consulta_protege_exclusao() from public, anon, authenticated;

drop trigger if exists trg_consulta_protege_exclusao on public.consultas;
create trigger trg_consulta_protege_exclusao
  before delete on public.consultas
  for each row execute function public.consulta_protege_exclusao();

-- ---------------------------------------------------------------- allow-list
-- consulta_protege_exclusao é SECURITY DEFINER (enxerga os vínculos ignorando
-- a RLS de quem apaga), mas é trigger — não chamável direto e já revogada de
-- anon. Entra na allow-list pro check FUNÇÃO-ANON não a alarmar por engano.
create or replace function public.auditoria_saude()
returns table(categoria text, item text, status text, detalhe text)
language plpgsql
security definer
set search_path to 'public'
as $af$
begin
  return query select * from public._auditoria_saude_impl() ai
    where not (ai.categoria = 'FUNÇÃO-ANON'
               and ai.item in ('booking_perfil','booking_slots','booking_agendar',
                               'registrar_auditoria','consulta_protege_exclusao'));
end $af$;
revoke all on function public.auditoria_saude() from public, anon;
grant execute on function public.auditoria_saude() to authenticated, service_role;

commit;
