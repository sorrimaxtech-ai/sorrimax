#!/usr/bin/env bash
# ============================================================================
# sync-check.sh — VIGIA (somente leitura, nao muda nada no seu repo)
#
# Olha o GitHub e responde: entrou coisa nova do outro dev? Isso bate no que
# EU estou mexendo agora?
#
#   bash scripts/sync-check.sh          # relatorio pra humano
#   bash scripts/sync-check.sh --quiet  # so as variaveis (pra script/agente)
#
# Status possiveis:
#   LIMPO   -> nada novo no remoto. Nao faz nada.
#   SEGURO  -> tem commit novo, e NAO toca em nenhum arquivo que voce mexeu.
#              Pode puxar no automatico: bash scripts/sync-pull.sh
#   RISCO   -> tem commit novo em arquivo que voce tambem mexeu. NAO puxar no
#              automatico — precisa de gente/agente pra juntar os dois lados.
#
# Nunca faz merge, rebase, checkout, stash nem push. So `git fetch`.
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
UPSTREAM="origin/${BRANCH}"
QUIET=0
[[ "${1:-}" == "--quiet" ]] && QUIET=1

git fetch -q origin "$BRANCH" 2>/dev/null || {
  echo "STATUS=ERRO"; echo "MOTIVO=falhou o fetch (sem rede ou sem credencial)"; exit 3;
}

if ! git rev-parse --verify -q "$UPSTREAM" >/dev/null; then
  echo "STATUS=ERRO"; echo "MOTIVO=branch $BRANCH nao existe no origin"; exit 3
fi

ATRAS=$(git rev-list --count "HEAD..$UPSTREAM")
FRENTE=$(git rev-list --count "$UPSTREAM..HEAD")

# arquivos que o outro lado mexeu nos commits que eu ainda nao tenho
ARQ_DELES=$(git diff --name-only "HEAD...$UPSTREAM" 2>/dev/null | sort -u)

# meu trabalho em andamento: working tree sujo + commits meus ainda nao pushados
ARQ_MEUS=$( { git diff --name-only HEAD;
              git diff --name-only --cached;
              git ls-files --others --exclude-standard;
              [[ "$FRENTE" -gt 0 ]] && git diff --name-only "$UPSTREAM...HEAD"; } 2>/dev/null | sort -u )

COLISAO=$(comm -12 <(echo "$ARQ_DELES") <(echo "$ARQ_MEUS") | grep -v '^$' || true)

if [[ "$ATRAS" -eq 0 ]]; then
  STATUS=LIMPO
elif [[ -n "$COLISAO" ]]; then
  STATUS=RISCO
else
  STATUS=SEGURO
fi

N_COLISAO=$(echo "$COLISAO" | grep -c . || true)

echo "STATUS=$STATUS"
echo "BRANCH=$BRANCH"
echo "COMMITS_NOVOS=$ATRAS"
echo "MEUS_NAO_PUSHADOS=$FRENTE"
echo "ARQUIVOS_EM_COLISAO=$N_COLISAO"

if [[ "$QUIET" -eq 1 ]]; then
  [[ -n "$COLISAO" ]] && echo "$COLISAO" | sed 's/^/COLIDE=/'
  exit 0
fi

echo
case "$STATUS" in
  LIMPO)
    echo "✅ Nada novo no GitHub. Segue o baile."
    ;;
  SEGURO)
    echo "🔄 $ATRAS commit(s) novo(s) no GitHub, e nenhum toca no que voce esta mexendo."
    echo
    git log --format="   %h  %s" "HEAD..$UPSTREAM"
    echo
    echo "   Arquivos que vieram:"
    echo "$ARQ_DELES" | sed 's/^/     /'
    echo
    echo "   👉 Pode puxar sem medo:  bash scripts/sync-pull.sh"
    ;;
  RISCO)
    echo "⚠️  $ATRAS commit(s) novo(s) MEXEM em arquivo que voce tambem mexeu."
    echo
    git log --format="   %h  %s" "HEAD..$UPSTREAM"
    echo
    echo "   Arquivos disputados (os dois lados mexeram):"
    echo "$COLISAO" | sed 's/^/     ⚡ /'
    echo
    echo "   👉 NAO puxe no automatico. Duas saidas:"
    echo "      1. commite/guarde seu trabalho e chame o agente pra juntar os dois lados"
    echo "      2. bash scripts/sync-pull.sh --forcar   (tenta rebase; aborta sozinho se sujar)"
    ;;
esac
