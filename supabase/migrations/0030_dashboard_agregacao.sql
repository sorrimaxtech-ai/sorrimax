-- ============================================================================
-- 0030 — Agregação do gráfico do Dashboard no banco (corrige truncamento)
-- ----------------------------------------------------------------------------
-- Superauditoria: o Dashboard baixava as consultas cruas e contava no cliente.
-- Sem .limit(), o PostgREST corta em 1000 linhas — clínica movimentada tinha o
-- gráfico de crescimento SILENCIOSAMENTE subcontado. Agregar por mês no SQL
-- elimina o problema (não trafega linha nenhuma, não há teto).
--
-- SECURITY INVOKER (padrão): a RLS de `consultas` já restringe ao tenant do
-- usuário, então a função não vira anon-definer (não alarma a auditoria).
-- ============================================================================

begin;

create or replace function public.dashboard_crescimento(p_meses int default 6)
returns table (ano int, mes int, total bigint)
language sql
stable
set search_path to 'public'
as $$
  select extract(year from inicio)::int as ano,
         extract(month from inicio)::int as mes,
         count(*)::bigint as total
    from consultas
   where inicio >= date_trunc('month', now()) - make_interval(months => greatest(p_meses, 1) - 1)
   group by 1, 2
$$;

grant execute on function public.dashboard_crescimento(int) to authenticated;

commit;
