-- ============================================================================
-- SORRIMAX · 0027 · Remove policies permissivas legadas + tranca view
-- ----------------------------------------------------------------------------
-- ACHADO (auditoria_saude(), 08/08/2026, contra Postgres 16 real):
--
--   whatsapp_instances / "Enable all access for WA instances"  ALL public USING(true)
--   whatsapp_chats     / "Enable all access for WA chats"      ALL public USING(true)
--   whatsapp_messages  / "Enable all access for WA messages"   ALL public USING(true)
--
-- Essas policies vêm de `whatsapp_schema.sql` (arquivo solto, era aplicado à
-- mão). O problema: as policies corretas de tenant (whatsapp_*_tenant, que
-- filtram por current_clinica_id()) JÁ EXISTEM e convivem com elas. Policies
-- permissivas se somam por OR — basta uma com USING(true) para anular todo o
-- isolamento. E o role é `public`, que inclui `anon`: a chave anônima embutida
-- no bundle do site lê e escreve a conversa de WhatsApp de QUALQUER clínica.
-- Mesmo padrão do vazamento de leads_sistema (06/08/2026).
--
-- Também: `v_clinica_completa` (de 01_schema_principal.sql) é view sem
-- security_invoker — roda com o privilégio do dono e ignora o RLS de quem
-- consulta, virando porta lateral para os dados de outras clínicas.
--
-- Esta migration é idempotente e segura de reexecutar.
-- ============================================================================

begin;

-- ══ 1. Derruba as permissivas legadas ═══════════════════════════════════════
-- Nomeadas explicitamente: um DROP genérico por USING(true) removeria também
-- policies legítimas de INSERT público (ex.: leads_sistema_insert_publico).
drop policy if exists "Enable all access for WA instances" on public.whatsapp_instances;
drop policy if exists "Enable all access for WA chats"     on public.whatsapp_chats;
drop policy if exists "Enable all access for WA messages"  on public.whatsapp_messages;

-- ══ 2. Garante que o isolamento por tenant sobreviveu ═══════════════════════
-- Se a policy de tenant não existir, derrubar a permissiva deixaria a tabela
-- inacessível — falha barulhenta é melhor que exposição silenciosa.
do $verifica$
declare
  t text;
  faltando text[] := '{}';
begin
  foreach t in array array['whatsapp_instances','whatsapp_chats','whatsapp_messages'] loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = t and policyname = t || '_tenant'
    ) then
      faltando := faltando || t;
    end if;
  end loop;

  if array_length(faltando, 1) is not null then
    raise exception 'policy de tenant ausente em: % — abortando para nao deixar a tabela sem isolamento nem acesso', faltando;
  end if;
end
$verifica$;

-- ══ 3. View respeita o RLS de quem consulta ═════════════════════════════════
do $view$
begin
  if to_regclass('public.v_clinica_completa') is not null then
    execute 'alter view public.v_clinica_completa set (security_invoker = on)';
  end if;
end
$view$;

commit;

-- ══ Verificação ═════════════════════════════════════════════════════════════
-- select * from auditoria_saude() where status = 'FALHA';   -- esperado: 0 linhas
