-- ============================================================================
-- VITTALHUB · 0019 · Tirar toda função privilegiada do alcance de anon
-- ----------------------------------------------------------------------------
-- Postgres concede EXECUTE a PUBLIC por padrão em toda função criada. Para
-- SECURITY DEFINER isso é ruim: a função roda como owner e ignora RLS.
-- Funções de trigger não precisam de EXECUTE do chamador (o Postgres as invoca
-- como dona da tabela), então revogar é seguro e correto.
-- ============================================================================
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       -- estas 3 são o alicerce da própria RLS: precisam ficar acessíveis
       and p.proname not in ('current_clinica_id','current_role','is_admin')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
  end loop;
end $$;

-- devolve o que o app logado legitimamente usa
grant execute on function public.criar_clinica_para_usuario(text,text,text) to authenticated;
grant execute on function public.meu_contexto()                            to authenticated;
grant execute on function public.slots_disponiveis(uuid,date,uuid)         to authenticated;
grant execute on function public.gerar_debitos_orcamento(uuid, public.forma_pagamento, smallint, date, uuid) to authenticated;
grant execute on function public.wa_enfileirar_texto(uuid,text,timestamptz) to authenticated;
grant execute on function public.wa_marcar_chat_lido(uuid)                  to authenticated;
grant execute on function public.auditoria_saude()                          to authenticated;

-- service_role para as rotinas de backend
grant execute on function public.marcar_parcelas_atrasadas() to service_role;
grant execute on function public.wa_outbox_claim(int)        to service_role;
grant execute on function public.wa_outbox_reaper(int)       to service_role;
grant execute on function public.wa_ingerir_eco(uuid,text)   to service_role;

-- corrige o falso positivo: o auditor casava com o próprio regex no seu corpo
create or replace function public.auditoria_guard_null()
returns table(fn text) language sql stable security definer set search_path = public as $$
  select p.proname::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and p.proname not like 'auditoria%'
     and p.prosrc ~ '<>\s*(public\.)?current_clinica_id\(\)'
$$;
revoke all on function public.auditoria_guard_null() from public, anon;
grant execute on function public.auditoria_guard_null() to authenticated, service_role;
