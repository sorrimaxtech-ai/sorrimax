#!/usr/bin/env bash
# ============================================================================
# Sorrimax — roda SQL no banco sem senha na linha de comando nem no histórico.
#
#   bash scripts/db.sh -c "select * from auditoria_saude();"
#   bash scripts/db.sh -f supabase/alguma_coisa.sql
#
# A senha vem de um arquivo gitignored (.pgpass.local na raiz do repo), lido
# pelo psql via PGPASSFILE. Nunca aparece aqui, no histórico, nem em log.
# Configure UMA vez (veja o rodapé deste arquivo).
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="aws-0-us-east-1.pooler.supabase.com"   # região descoberta por sondagem
PORT=5432
USER="postgres.vcaloytujryxaqutxpgy"
DB="postgres"
PASSFILE="$(pwd)/.pgpass.local"
PSQL="$(command -v psql || echo /opt/homebrew/opt/postgresql@16/bin/psql)"
[[ -x "$PSQL" ]] || { echo "psql não encontrado (brew install postgresql@16)"; exit 1; }
[[ -f "$PASSFILE" ]] || { echo "erro: .pgpass.local não existe — rode o setup do rodapé de scripts/db.sh"; exit 1; }
chmod 600 "$PASSFILE" 2>/dev/null || true
exec env PGPASSFILE="$PASSFILE" "$PSQL" \
  "postgresql://$USER@$HOST:$PORT/$DB?sslmode=require" -v ON_ERROR_STOP=1 "$@"
# ----------------------------------------------------------------------------
# SETUP (uma vez). Troque SUA_SENHA_DO_BANCO pela senha do Postgres:
#
#   printf 'aws-0-us-east-1.pooler.supabase.com:5432:postgres:postgres.vcaloytujryxaqutxpgy:SUA_SENHA_DO_BANCO\n' > .pgpass.local
#   chmod 600 .pgpass.local
# ----------------------------------------------------------------------------
