#!/usr/bin/env bash
# ============================================================================
# Sorrimax — aplica o schema completo num projeto Supabase VAZIO.
#
#   bash scripts/aplicar-schema.sh
#
# Pede a connection string do Postgres e roda MIGRACAO_PROJETO_NOVO.sql inteiro,
# depois a auditoria de saúde. A string é lida com eco desligado e NUNCA é
# gravada em arquivo, histórico do shell ou log.
#
# Onde pegar: Supabase → Connect → Connection string → URI (modo Session).
# Formato: postgresql://postgres.<ref>:<SENHA>@<host>:5432/postgres
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
SQL="supabase/MIGRACAO_PROJETO_NOVO.sql"
[[ -f "$SQL" ]] || { echo "erro: $SQL não encontrado (rode a partir do repo)"; exit 1; }

# psql: usa o do PATH; se não houver, cai no do Homebrew.
PSQL="$(command -v psql || true)"
[[ -z "$PSQL" && -x /opt/homebrew/opt/postgresql@16/bin/psql ]] && PSQL=/opt/homebrew/opt/postgresql@16/bin/psql
[[ -n "$PSQL" ]] || { echo "erro: psql não encontrado. brew install postgresql@16"; exit 1; }

echo "Connection string do Postgres (Supabase → Connect → URI):"
read -rs CONN; echo
[[ -n "$CONN" ]] || { echo "erro: string vazia"; exit 1; }

# Erro mais comum: colar a URL da API em vez do DSN do Postgres.
if [[ "$CONN" == https://* || "$CONN" == *.supabase.co ]]; then
  cat <<'AJUDA'

erro: isso é a URL da API REST, não a connection string do Postgres.

  o que você colou   →  https://<ref>.supabase.co
  o que é preciso    →  postgresql://postgres.<ref>:<SENHA>@<host>:5432/postgres

Onde achar: no painel do projeto, botão "Connect" (topo da página) →
aba "Connection string" → "URI". Copie a linha inteira.

A string vem com [YOUR-PASSWORD] no lugar da senha — troque pela senha do
banco. Não é a sua senha do Supabase; é a do Postgres, definida na criação do
projeto. Esqueceu? Settings → Database → Reset database password.
AJUDA
  exit 1
fi

if [[ "$CONN" != postgres://* && "$CONN" != postgresql://* ]]; then
  echo "erro: a string precisa começar com postgresql:// (Connect → Connection string → URI)."
  exit 1
fi

if [[ "$CONN" == *"[YOUR-PASSWORD]"* || "$CONN" == *"YOUR-PASSWORD"* ]]; then
  echo "erro: a string ainda tem o placeholder [YOUR-PASSWORD] — troque pela senha real do banco."
  exit 1
fi

echo
echo "▸ Verificando se o banco está vazio…"
EXISTENTES="$("$PSQL" "$CONN" -tAc \
  "select count(*) from pg_tables where schemaname='public'" 2>/dev/null)" || {
  echo "erro: não consegui conectar. Confira a string e a senha."; exit 1; }

if [[ "$EXISTENTES" != "0" ]]; then
  echo "  ⚠ o schema public já tem $EXISTENTES tabela(s)."
  echo "  Este script foi feito para projeto VAZIO. Rodar por cima pode falhar"
  echo "  em objetos duplicados e deixar o banco pela metade."
  read -rp "  Continuar mesmo assim? (digite SIM) " OK
  [[ "$OK" == "SIM" ]] || { echo "abortado."; exit 1; }
fi

echo "▸ Aplicando o schema…"
# ON_ERROR_STOP: para no primeiro erro em vez de seguir e deixar meio schema.
if ! "$PSQL" "$CONN" -v ON_ERROR_STOP=1 -q -f "$SQL"; then
  echo
  echo "✗ falhou. Nada além do ponto de erro foi aplicado."
  echo "  Se reclamou de schema 'cron': ligue pg_cron em Database → Extensions."
  exit 1
fi

echo
echo "▸ Auditoria de saúde:"
"$PSQL" "$CONN" -c "select * from auditoria_saude();"

FALHAS="$("$PSQL" "$CONN" -tAc \
  "select count(*) from auditoria_saude() where status='FALHA'")"

echo
if [[ "$FALHAS" == "0" ]]; then
  echo "✓ schema aplicado, 0 falhas."
  echo "  Falta: ligar pg_cron (Database → Extensions) e agendar o reaper do outbox."
else
  echo "⚠ aplicado, mas com $FALHAS falha(s) acima. Corrija antes de usar em produção."
  exit 1
fi
