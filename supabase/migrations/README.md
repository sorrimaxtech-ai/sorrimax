# Migrations VITTALHUB

Migrations versionadas e ordenadas. Substituem a pasta solta de `.sql` da raiz de
`supabase/`, que tinha 15 arquivos de RLS sobrepostos e conflitantes.

> ⚠️ **Estas migrations ainda NÃO foram executadas contra um Postgres.** Foram escritas
> e revisadas, mas não havia Docker/psql na máquina para validar. Aplique primeiro no
> **projeto Supabase de desenvolvimento**, confira a saída de cada bloco, e só depois
> promova para produção.

## Ordem de aplicação

| # | Arquivo | O que faz |
|---|---|---|
| 0001 | `0001_foundation_rls.sql` | Extensões (`pgcrypto`, `btree_gist`), helpers `current_clinica_id()` / `current_role()` / `is_admin()`, `touch_updated_at()`, `apply_tenant_rls()`, e **reescrita completa do RLS** de `clinicas`, `profiles`, `especialidades` e das 9 tabelas com `clinica_id`. |
| 0002 | `0002_core_pacientes_servicos.sql` | `convenios`, `pacientes`, `servicos`, `servico_profissional` + índices (trigram para busca por nome, aniversariantes do mês) + RLS. |
| 0003 | `0003_agenda_consultas.sql` | `disponibilidades`, `bloqueios_agenda`, `recorrencias`, `consultas` + **EXCLUDE anti double-booking** + trigger de carimbo de status + `slots_disponiveis()`. |
| 0004 | `0004_seed_catalogos.sql` | Seed idempotente de 32 especialidades. |
| 0005 | `0005_odonto_procedimentos_odontograma.sql` | **Núcleo odontológico**: `servicos`→`procedimentos` (com granularidade dente/face/arcada), preço por convênio, **cadeiras** como recurso agendável (+ EXCLUDE anti-conflito), **odontograma FDI** permanente e decíduo, `evolucoes` **append-only**. |
| 0006 | `0006_orcamentos_funil.sql` | **Orçamento como entidade central**: itens por dente/face com **aprovação parcial**, numeração por clínica, recálculo e status derivado por trigger, item aprovado → odontograma, e **`oportunidades` = funil unificado (lead + orçamento)**. |
| 0007 | `0007_financeiro_comissoes.sql` | Contas, categorias, **taxas de cartão**, lançamentos + **parcelas** com `valor_liquido`, despesas fixas, **comissões** liberadas só quando a parcela é paga, e `gerar_debitos_orcamento()`. |
| 0008 | `0008_views_indicadores.sql` | Views com **`security_invoker = on`**: KPIs do dashboard, **`vw_funil_completo`**, faturamento por procedimento, ocupação/no-show, **`vw_pacientes_inativos`**, comissões, fluxo de caixa. |

Rodar em ordem, um por vez, no SQL Editor do Supabase (ou `supabase db push`).

## Verificações depois de aplicar

```sql
-- 1. nenhuma tabela pública sem RLS
select tablename from pg_tables
 where schemaname = 'public' and rowsecurity = false;
-- esperado: 0 linhas

-- 2. o helper de tenant responde (rodar autenticado)
select public.current_clinica_id();

-- 3. double-booking é mesmo bloqueado — o 2º insert DEVE falhar
--    com "conflicting key value violates exclusion constraint"
insert into consultas (clinica_id, paciente_id, profissional_id, inicio, fim)
values ('<clinica>', '<paciente>', '<prof>', now() + interval '1 day',
                                             now() + interval '1 day 1 hour');
insert into consultas (clinica_id, paciente_id, profissional_id, inicio, fim)
values ('<clinica>', '<paciente>', '<prof>', now() + interval '1 day 30 minutes',
                                             now() + interval '1 day 90 minutes');

-- 4. slots livres de um profissional
select * from public.slots_disponiveis('<prof>', current_date + 1, '<servico>');

-- 5. teste de isolamento multi-tenant (o mais importante):
--    logado como clínica A, isto tem que voltar 0 linhas
select count(*) from pacientes where clinica_id <> public.current_clinica_id();
```

## Arquivos a aposentar

Depois que 0001 estiver validado, estes ficam obsoletos — mover para
`supabase/_legacy/` (não apagar antes de confirmar que produção está migrada):

```
allow_update_clinicas.sql      fix_registration.sql        rls_completo.sql
complete_rls_solution.sql      fix_registration_v2.sql     rls_geral.sql
debug_login.sql                fix_rls.sql                 rls_policies.sql
disable_profiles_rls.sql       fix_rls_anon_setup.sql      seed_debug_data.sql
fix_crm_rls.sql                fix_rls_definitive.sql      test_data.sql
fix_insert_policy.sql          fix_rls_especialidades.sql
                               fix_rls_final.sql
                               fix_rls_profiles_login.sql
```

`disable_profiles_rls.sql` é o mais perigoso do lote: desliga RLS de `profiles`,
o que expõe a tabela inteira entre clínicas. Confirmar que não está aplicado em produção.

## Pendências de segurança (antes de qualquer deploy)

1. **`.env` versionado com `SUPABASE_SERVICE_ROLE_KEY`** — rotacionar a chave e tirar do repo.
   A service_role ignora RLS por definição; vazada, o isolamento multi-tenant não vale nada.
2. **Ambiente de trabalho apontando para produção** — separar dev/prod.
3. `clinicas_insert_signup` permite INSERT anônimo (necessário no cadastro). Proteger com
   rate limit / captcha na borda, ou mover a criação de clínica para uma Edge Function.

## Próximas migrations (não escritas ainda)

- `0005` prontuários (append-only: sem UPDATE/DELETE por policy) + anamnese (modelos, perguntas com escala e skip logic, respostas)
- `0006` documentos (modelos com merge fields + emitidos com hash)
- `0007` financeiro (lançamentos, despesas fixas, categorias) + views de relatório
- `0008` perfil público, booking tokens, RBAC, checklist de ativação
