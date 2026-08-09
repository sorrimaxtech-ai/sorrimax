-- ============================================================================
-- 0032 — Trilha de auditoria de ações da equipe
-- ----------------------------------------------------------------------------
-- Superauditoria: clínica com equipe não tinha como responder "quem apagou a
-- consulta do paciente X?" ou "quem estornou essa parcela?". Aqui um log de
-- ações sensíveis: DELETE (sempre) e UPDATE que muda status (baixa, estorno,
-- cancelamento, desmarque) — quem, quando, o quê.
--
-- Guarda o essencial (não a linha inteira, pra não reter PII de saúde além do
-- necessário): tabela, id do registro, ação, usuário, status antes/depois.
-- ============================================================================

begin;

create table if not exists public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  clinica_id    uuid,
  tabela        text not null,
  registro_id   uuid,
  acao          text not null,          -- DELETE | UPDATE
  usuario_id    uuid,                    -- auth.uid() de quem fez
  status_antes  text,
  status_depois text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_audit_log_clinica on public.audit_log (clinica_id, created_at desc);
create index if not exists idx_audit_log_registro on public.audit_log (tabela, registro_id);
-- FK p/ o PostgREST embutir o nome de quem fez a acao; SET NULL se o profile sair
alter table public.audit_log
  add constraint audit_log_usuario_fkey foreign key (usuario_id)
  references public.profiles(id) on delete set null;
create index if not exists idx_audit_log_usuario on public.audit_log (usuario_id);

-- leitura só admin da própria clínica; escrita só o trigger (definer)
alter table public.audit_log enable row level security;
drop policy if exists audit_log_admin_read on public.audit_log;
create policy audit_log_admin_read on public.audit_log
  for select to authenticated
  using (clinica_id = public.current_clinica_id() and public.is_admin());
-- sem policy de INSERT/UPDATE/DELETE p/ authenticated: só o trigger (definer) grava

-- ---------------------------------------------------------------- trigger
create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else null end;
begin
  -- não audita criação (ruído); UPDATE só quando o status muda
  if tg_op = 'INSERT' then return new; end if;
  if tg_op = 'UPDATE' and (v_old->>'status') is not distinct from (v_new->>'status') then
    return new;
  end if;

  insert into audit_log (clinica_id, tabela, registro_id, acao, usuario_id, status_antes, status_depois)
  values (
    coalesce((v_new->>'clinica_id')::uuid, (v_old->>'clinica_id')::uuid),
    tg_table_name,
    coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid),
    tg_op,
    auth.uid(),
    v_old->>'status',
    v_new->>'status'
  );

  return case when tg_op = 'DELETE' then old else new end;
end $$;

revoke all on function public.registrar_auditoria() from public, anon, authenticated;

-- ---------------------------------------------------------------- ligar nas tabelas sensíveis
do $$
declare t text;
begin
  foreach t in array array['consultas','lancamento_parcelas','orcamentos','pacientes'] loop
    execute format('drop trigger if exists trg_auditoria on public.%I', t);
    execute format(
      'create trigger trg_auditoria after update or delete on public.%I
         for each row execute function public.registrar_auditoria()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- allow-list da auditoria
-- registrar_auditoria é SECURITY DEFINER (grava ignorando a RLS do audit_log),
-- mas é trigger — não deve ser chamável direto. Já revogada de anon acima; entra
-- na allow-list do wrapper para o check FUNÇÃO-ANON não a alarmar por engano.
create or replace function public.auditoria_saude()
returns table(categoria text, item text, status text, detalhe text)
language plpgsql
security definer
set search_path to 'public'
as $af$
begin
  return query select * from public._auditoria_saude_impl() ai
    where not (ai.categoria = 'FUNÇÃO-ANON'
               and ai.item in ('booking_perfil','booking_slots','booking_agendar','registrar_auditoria'));
end $af$;
revoke all on function public.auditoria_saude() from public, anon;
grant execute on function public.auditoria_saude() to authenticated, service_role;

commit;
