# Migrations VITTALHUB

Migrations versionadas e ordenadas. Substituem a pasta solta de `.sql` da raiz de
`supabase/`, que tinha 15 arquivos de RLS sobrepostos e conflitantes.

> ✅ **Validadas contra Postgres 16 em 08/08/2026**, do zero, com stubs do ambiente
> Supabase (`auth.uid()/role()/jwt()`, roles `anon`/`authenticated`/`service_role`,
> publication `supabase_realtime`, `pgcrypto` no schema `extensions`). Rodam limpas
> de ponta a ponta e `auditoria_saude()` fecha sem falha.
>
> A validação revelou que elas assumiam uma base criada à mão pelo painel do Supabase
> (`clinicas`, `leads_sistema`) — daí os arquivos `0000_base_*`. Num projeto vazio,
> antes disso, a migração morria na primeira foreign key.
>
> Para projeto novo, prefira `../MIGRACAO_PROJETO_NOVO.sql` (tudo concatenado na ordem
> correta). Aplique primeiro em **desenvolvimento**, confira `select * from
> auditoria_saude()`, e só então promova para produção.

## Ordem de aplicação

| # | Arquivo | O que faz |
|---|---|---|
| 0000 | `0000_base_legado.sql` | Base estrutural que antes era aplicada à mão pelo painel: `01_schema_principal` + `crm_schema` + `whatsapp_schema`. Cria `clinicas`, a tabela-raiz do tenant. |
| 0000 | `0000_base_leads_sistema.sql` | `leads_sistema` (captação do site legado), reconstruída de `types.ts` e **já nascendo com RLS + FORCE**, só INSERT público. Referenciada por 0014/0015/0018/0023. |
| 0000 | `0000_bootstrap_base.sql` | Estrutura sem RLS (o RLS vem no 0001): `enderecos_clinica`, `profiles`, `assinaturas` etc. |
| 0001 | `0001_foundation_rls.sql` | Extensões (`pgcrypto`, `btree_gist`), helpers `current_clinica_id()` / `current_role()` / `is_admin()`, `touch_updated_at()`, `apply_tenant_rls()`, e **reescrita completa do RLS** de `clinicas`, `profiles`, `especialidades` e das 9 tabelas com `clinica_id`. |
| 0002 | `0002_core_pacientes_servicos.sql` | `convenios`, `pacientes`, `servicos`, `servico_profissional` + índices (trigram para busca por nome, aniversariantes do mês) + RLS. |
| 0003 | `0003_agenda_consultas.sql` | `disponibilidades`, `bloqueios_agenda`, `recorrencias`, `consultas` + **EXCLUDE anti double-booking** + trigger de carimbo de status + `slots_disponiveis()`. |
| 0004 | `0004_seed_catalogos.sql` | Seed idempotente de 32 especialidades. |
| 0005 | `0005_odonto_procedimentos_odontograma.sql` | **Núcleo odontológico**: `servicos`→`procedimentos` (com granularidade dente/face/arcada), preço por convênio, **cadeiras** como recurso agendável (+ EXCLUDE anti-conflito), **odontograma FDI** permanente e decíduo, `evolucoes` **append-only**. |
| 0006 | `0006_orcamentos_funil.sql` | **Orçamento como entidade central**: itens por dente/face com **aprovação parcial**, numeração por clínica, recálculo e status derivado por trigger, item aprovado → odontograma, e **`oportunidades` = funil unificado (lead + orçamento)**. |
| 0007 | `0007_financeiro_comissoes.sql` | Contas, categorias, **taxas de cartão**, lançamentos + **parcelas** com `valor_liquido`, despesas fixas, **comissões** liberadas só quando a parcela é paga, e `gerar_debitos_orcamento()`. |
| 0008 | `0008_views_indicadores.sql` | Views com **`security_invoker = on`**: KPIs do dashboard, **`vw_funil_completo`**, faturamento por procedimento, ocupação/no-show, **`vw_pacientes_inativos`**, comissões, fluxo de caixa. |

| 0009 | `0009_whatsapp_processos.sql` | Processos simultâneos do chat: atribuição de conversa, primeira resposta, arquivamento. |
| 0010 | `0010_whatsapp_provider.sql` | Provider por instância (**uazapi** ou evolution), com credencial e URL próprias. |
| 0011 | `0011_whatsapp_conta_compartilhada.sql` | Conta uazapi **compartilhada com o Diamond CRM** — separa o que é de cada sistema na mesma conta. |
| 0012 | `0012_hardening_funcoes.sql` | Corrige o bug do cadastro (trigger de seed rodava como INVOKER) e fixa `search_path` em toda função DEFINER. ALTERs **condicionais**. |
| 0013 | `0013_auditoria_saude.sql` | `auditoria_saude()` — invariantes permanentes do schema. |
| 0014 | `0014_correcoes_auditoria.sql` | Correções apontadas pela 0013. |
| 0015 | `0015_correcoes_criticas_seguranca.sql` | Grants mínimos para `anon`, policies duplicadas do rename `servicos`→`procedimentos`, `clinica_id NOT NULL` onde é seguro. |
| 0016 | `0016_rpc_onboarding_atomico.sql` | Onboarding atômico via RPC, substituindo o cadastro em múltiplos passos. |
| 0017 | `0017_blindagem_whatsapp_e_onboarding.sql` | Outbox de envio + reaper agendado (`pg_cron`, **condicional**) e destravamento do login. |
| 0018 | `0018_auditoria_v2.sql` | Auditoria v2 — fecha as lacunas do próprio auditor. |
| 0019 | `0019_revoke_funcoes_anon.sql` | Tira toda função privilegiada do alcance de `anon`. |
| 0020 | `0020_hof_regioes.sql` | Regiões faciais (Harmonização Orofacial). |
| 0021 | `0021_fix_comissao_parcela.sql` | Comissão ligada à **parcela**, não ao lançamento. |
| 0022 | `0022_anamnese_documentos.sql` | Anamnese digital e documentos com merge fields. |
| 0023 | `0023_estoque_protese_publico.sql` | Estoque, prótese, página pública e perfis de permissão. |
| 0024 | `0024_agenda_como_centro.sql` | Agenda vira o centro operacional; a venda passa a nascer no atendimento. |
| 0025 | `0025_venda_agenda_alimenta_odontograma.sql` | Achado em teste E2E da 0024: dente vendido não chegava ao odontograma. |
| 0026 | `0026_whatsapp_instancias_crud.sql` | Clínica passa a gerenciar a própria instância (tela de Integrações era read-only). |
| 0027 | `0027_remove_policies_permissivas_legado.sql` | **Segurança:** derruba `Enable all access for WA *` (`ALL`/`public`/`USING(true)`) nas 3 tabelas de WhatsApp — anulavam o isolamento por clínica — e põe `security_invoker` em `v_clinica_completa`. |

Rodar em ordem, um por vez, no SQL Editor do Supabase (ou `supabase db push`).
Para projeto vazio, o caminho curto é `../MIGRACAO_PROJETO_NOVO.sql`.

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
