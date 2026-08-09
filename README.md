# Sorrimax

Sistema de gestão para clínicas odontológicas: agenda, prontuário, odontograma,
orçamentos, financeiro e atendimento por WhatsApp. Multi-tenant — uma instalação
atende várias clínicas, isoladas no banco por `clinica_id`.

> Antes chamado **Vittalhub**. O nome antigo ainda aparece em comentários e na
> pasta local do projeto; trocar quando encostar no arquivo.

## Stack

React 18 + TypeScript + Vite 5 · Tailwind + shadcn/ui · TanStack Query ·
React Router 6 · Zod · Supabase (Postgres + Auth + Edge Functions)

Sem backend próprio: o front fala direto com o Supabase, e **toda a segurança
mora no RLS do Postgres**. Não existe camada de servidor para reforçar
permissão — se a policy estiver errada, o dado vaza.

## Rodando local

Precisa de Node 18+.

```bash
npm install
cp .env.example .env    # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev             # http://localhost:8080
```

| Script | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento (porta 8080) |
| `npm run build` | build de produção em `dist/` |
| `npm run lint` | ESLint |
| `npm run preview` | serve o build |

## Banco de dados

O schema vive em `supabase/migrations/`, numerado e ordenado. Rode **em ordem
alfabética de arquivo** — é ela que resolve a dependência.

**Projeto novo, do zero:** cole `supabase/MIGRACAO_PROJETO_NOVO.sql` inteiro no
SQL Editor do Supabase. É a concatenação de todas as migrations na ordem certa,
validada contra Postgres 16. Não envolva em `BEGIN` — cada migration já gere a
própria transação.

Depois de aplicar:

1. Ligue `pg_cron` em Database → Extensions. Sem ele o `0017` avisa e pula o
   agendamento do reaper do outbox de WhatsApp; ligue e rode o `cron.schedule`
   que o aviso imprime.
2. Confira a saúde do schema:

```sql
select * from auditoria_saude();   -- esperado: só a linha GERAL / OK
```

Essa função valida as invariantes que importam: tabela sem RLS, policy
permissiva que anula isolamento de tenant, view sem `security_invoker`, função
`SECURITY DEFINER` sem `search_path` fixo. **Rode depois de toda migration** —
foi ela que pegou três tabelas de WhatsApp expostas a `anon` (corrigido no
`0027`).

Os `.sql` soltos na raiz de `supabase/` são história: hotfixes de RLS
sobrepostos e conflitantes, aplicados à mão no projeto antigo. O que ainda
importava deles foi absorvido em `0000_base_legado.sql`. **Não aplique os
soltos** — vários se contradizem.

### Regras do schema

- Toda tabela com `clinica_id` precisa de RLS ligado e policy de tenant. Sem
  exceção: uma tabela destrancada é vazamento de dado de saúde de paciente.
- Policies permissivas somam por `OR`. Uma única policy `USING(true)` para o
  role `public` anula todo o isolamento das outras — foi exatamente esse o bug
  do `0027`.
- Função `SECURITY DEFINER` sempre com `set search_path = public`, senão vira
  vetor de escalonamento de privilégio.
- View que lê dado de tenant precisa de `security_invoker = on`.

## Estrutura

```
src/pages/         41 telas (Agenda, Orçamentos, Odontograma, Financeiro, …)
src/components/    83 componentes; ui/ é shadcn, não editar à mão
src/services/      18 módulos de acesso a dados (fala com o Supabase)
src/integrations/  client e types do Supabase — types.ts é GERADO, não editar
supabase/migrations/  schema versionado
supabase/functions/   Edge Functions (webhook e outbox do WhatsApp)
```

`src/integrations/supabase/types.ts` é gerado do banco. Depois de mudar o
schema, regenere em vez de editar à mão:

```bash
npx supabase gen types typescript --project-id SEU_PROJECT_ID > src/integrations/supabase/types.ts
```

## Segurança

A `anon key` é pública — vai no bundle, qualquer um lê. Isso é normal e
esperado; o que a torna segura é o RLS. Duas consequências práticas:

- `SUPABASE_SERVICE_ROLE_KEY` **nunca** em variável `VITE_*`. O prefixo faz o
  Vite embutir o valor no JavaScript do navegador. Ela ignora RLS por completo.
- Tabela nova nasce com `enable row level security` na mesma migration que a
  cria. Nunca "depois".

Este projeto já teve um vazamento por tabela sem RLS (`leads_sistema`, 06/08/2026:
CPF, RG, endereço e alergias legíveis pela anon key). O `0000_base_leads_sistema`
a recria trancada.
