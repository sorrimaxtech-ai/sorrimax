#!/usr/bin/env bash
# ============================================================================
# sync-pull.sh — PUXADOR SEGURO
#
# Traz o que o outro dev subiu SEM sobrepor o seu trabalho. Usa rebase: o
# codigo dele entra por baixo, o seu e reaplicado por cima. Nada e descartado.
#
#   bash scripts/sync-pull.sh            # so puxa se o vigia disser SEGURO
#   bash scripts/sync-pull.sh --forcar   # tenta mesmo com risco de colisao
#   bash scripts/sync-pull.sh --check    # depois de puxar, roda o typecheck
#
# Rede de seguranca (nesta ordem):
#   1. marca um backup do seu estado atual antes de encostar em qualquer coisa
#   2. --autostash guarda e devolve o que estava sem commitar
#   3. se o rebase sujar, ABORTA sozinho e devolve tudo como estava
#
# Nunca faz push, nunca faz reset --hard no seu trabalho, nunca usa --force.
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

FORCAR=0; CHECK=0
for a in "$@"; do
  case "$a" in
    --forcar) FORCAR=1 ;;
    --check)  CHECK=1 ;;
    *) echo "flag desconhecida: $a"; exit 64 ;;
  esac
done

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
STATUS=$(bash scripts/sync-check.sh --quiet | grep '^STATUS=' | cut -d= -f2)

case "$STATUS" in
  ERRO)  echo "❌ vigia falhou (rede/credencial). Nao mexi em nada."; exit 3 ;;
  LIMPO)    echo "✅ Ja esta em dia. Nada pra puxar."; exit 0 ;;
  NOVIDADE) echo "✅ Os commits novos ja estao no seu disco (mesma pasta). Nada pra puxar."; exit 0 ;;
  RISCO)
    if [[ "$FORCAR" -eq 0 ]]; then
      echo "⛔ Tem colisao de arquivo. Nao vou puxar no automatico."
      echo "   Veja o detalhe:  bash scripts/sync-check.sh"
      echo "   Se quiser tentar assim mesmo (aborta sozinho se sujar):"
      echo "     bash scripts/sync-pull.sh --forcar"
      exit 1
    fi
    echo "⚠️  Colisao detectada, mas voce mandou --forcar. Backup feito, seguindo."
    ;;
esac

# ---- 1. backup do estado atual -------------------------------------------
CARIMBO="$(date +%Y%m%d-%H%M%S)"
BACKUP="refs/sorrimax-sync/backup-$CARIMBO"
git update-ref "$BACKUP" HEAD
echo "🛟 backup do seu HEAD: $BACKUP  ($(git rev-parse --short HEAD))"
echo "   pra voltar tudo:  git reset --hard $BACKUP"

# stash EXPLICITO (nao --autostash: quando o pull e fast-forward, o conflito do
# autostash nao muda o exit code do git pull e o script acharia que deu certo)
SUJO=$(git status --porcelain | wc -l | tr -d ' ')
STASH=""
if [[ "$SUJO" -gt 0 ]]; then
  STASH="sync-$CARIMBO"
  echo "📦 guardando $SUJO arquivo(s) sem commit (stash: $STASH)"
  git stash push -u -q -m "$STASH" || { echo "❌ nao consegui guardar seu trabalho. Parei aqui."; exit 3; }
fi

devolve_stash_ou_avisa() {
  [[ -z "$STASH" ]] && return 0
  if git stash pop -q 2>/dev/null; then
    echo "📦 seu trabalho voltou pro lugar."
    return 0
  fi
  # pop conflitou: o stash NAO foi apagado (git preserva), entao e seguro limpar
  # os marcadores do working tree — 100% do seu trabalho segue dentro do stash
  git reset -q --hard HEAD 2>/dev/null
  echo
  echo "⚡ O seu trabalho e o dele mexem nas MESMAS linhas — nao da pra juntar sozinho."
  echo "   Nada foi perdido: seu trabalho esta guardado em '$STASH'."
  echo "     git stash list          # ver"
  echo "     git stash pop           # tentar de novo e resolver na mao"
  echo "   👉 Isso e caso pro agente: peca 'junta meu stash $STASH com o que veio do dev'."
  return 2
}

# ---- 2. rebase -----------------------------------------------------------
echo "⬇️  puxando origin/$BRANCH por baixo do seu trabalho..."
if ! git pull --rebase -q origin "$BRANCH"; then
  echo
  echo "💥 O rebase bateu em conflito nos COMMITS. Desfazendo..."
  git rebase --abort 2>/dev/null
  devolve_stash_ou_avisa
  echo
  echo "🔙 Repo voltou como estava (HEAD = $(git rev-parse --short HEAD))."
  echo "   Rode:  bash scripts/sync-check.sh   pra ver quais arquivos disputam."
  exit 2
fi

echo "✅ commits do outro dev entraram."
git log --format="   %h  %s" "$BACKUP..HEAD" | head -20

devolve_stash_ou_avisa || exit 2

echo
echo "✅ Tudo junto: o dele por baixo, o seu por cima. Nada sobrescrito."

# ---- 3. checagem opcional ------------------------------------------------
if [[ "$CHECK" -eq 1 ]]; then
  echo
  echo "🔍 typecheck (leva ~1 min)..."
  if ./node_modules/.bin/tsc --noEmit -p tsconfig.app.json; then
    echo "✅ typecheck limpo."
  else
    echo "⚠️  typecheck acusou erro. Pode ser coisa que ja existia — compare com:"
    echo "     git stash list  /  git reset --hard $BACKUP"
  fi
fi

echo
echo "💡 Se o outro dev mexeu no banco (supabase/migrations/), rode tambem:"
echo "     bash scripts/db.sh -c 'select * from auditoria_saude()'"
