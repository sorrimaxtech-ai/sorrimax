# Trabalhando em dois na mesma `main`

Dois devs, duas máquinas, cada um com seu `npm run dev` local, os dois commitando direto na
`main`. Isso funciona — desde que ninguém fique horas sem olhar o que o outro subiu. Este doc é
o combinado.

> O banco é **o mesmo** para os dois (Supabase `vcaloytujryxaqutxpgy`). Dado é tempo real de
> graça: o que um cadastra, o outro vê na hora. O que **não** é tempo real é o **código** — é
> disso que o resto deste doc trata.

---

## Os dois comandos

```bash
bash scripts/sync-check.sh    # 👀 tem coisa nova do outro? (só lê, não muda nada)
bash scripts/sync-pull.sh     # ⬇️  traz sem sobrepor o meu trabalho
```

### `sync-check.sh` — o vigia
Faz só um `git fetch` e compara. Nunca faz merge, rebase, checkout ou push. Três respostas:

| Status | Significa | O que fazer |
|---|---|---|
| `LIMPO` | nada novo no GitHub | nada |
| `NOVIDADE` | entrou commit **que já está no seu disco** | nada a puxar — é só aviso (ver abaixo) |
| `SEGURO` | entrou commit, e **não toca em nenhum arquivo que você mexeu** | `sync-pull.sh` sem medo |
| `RISCO` | entrou commit **no mesmo arquivo que você está mexendo** | não puxa no automático — ver abaixo |

### Por que existe o status `NOVIDADE`
Comparar só *local × remoto* não basta. Se o outro dev commita **na mesma pasta** que você (outro
terminal ou outro agente na mesma máquina), o commit já nasce local — `HEAD` nunca fica atrás do
`origin`, e um vigia ingênuo diz "nada novo" para sempre, mesmo com 3 commits recém-criados.

Por isso o script também guarda **o ponto que já foi reportado**, na ref `refs/sorrimax-sync/visto`,
e responde "o que entrou desde a última vez que eu te avisei". Funciona nos dois arranjos: dev em
outra máquina (`SEGURO`/`RISCO`) e dev na mesma pasta (`NOVIDADE`).

A colisão é calculada de verdade: arquivos que os commits dele tocaram × arquivos que você tem
modificados (working tree, staged, untracked e commits seus ainda não pushados).

### `sync-pull.sh` — o puxador
Usa **rebase**, não merge: o código dele entra **por baixo**, o seu é reaplicado **por cima**.
É isso que garante que ele não sobrescreve o teu.

Rede de segurança, nesta ordem:
1. **Backup do seu HEAD** antes de encostar em qualquer coisa → `refs/sorrimax-sync/backup-<data>`.
   Voltar tudo é `git reset --hard refs/sorrimax-sync/backup-<data>`.
2. **Stash explícito** do que está sem commit (não `--autostash`: num pull fast-forward o
   conflito do autostash não muda o exit code do git e o script acharia que deu certo).
3. **Se conflitar, aborta e devolve.** O repo nunca fica no meio de um rebase, e o seu trabalho
   fica guardado no stash — que o git **não apaga** quando o `pop` falha.

Nunca faz `push`, nunca `--force`, nunca joga trabalho fora.

Flags:
- `--forcar` — tenta mesmo com status `RISCO` (continua abortando sozinho se sujar)
- `--check` — roda `tsc --noEmit` depois de puxar, pra ver se a junção quebrou tipo

---

## O caso que você tem medo: "ele mexeu no design, eu na aba de conversas"

Esse é o caso **fácil**, e é o que mais acontece. Arquivos diferentes → git junta sozinho, sem
perder nada dos dois lados:

```
sync-check.sh  →  SEGURO
sync-pull.sh   →  ✅ o design dele entra, sua aba de Conversas continua exatamente como estava
```

Testado nos três cenários antes de entrar no repo (arquivos diferentes / mesmo arquivo linhas
diferentes / mesma linha).

O caso **difícil** é só quando os dois editam **a mesma linha do mesmo arquivo**. Aí não existe
resposta automática — alguém tem que decidir qual versão vale. O script para, avisa e preserva:

```
⚡ O seu trabalho e o dele mexem nas MESMAS linhas — nao da pra juntar sozinho.
   Nada foi perdido: seu trabalho esta guardado em 'sync-<data>'.
   👉 peca ao agente: "junta meu stash sync-<data> com o que veio do dev"
```

Nesse ponto o repo está **limpo** (com o código dele aplicado) e 100% do seu trabalho está no
stash. Nada de marcador de conflito espalhado pelo projeto.

---

## O ritual (custa 10 segundos)

**Antes de começar a mexer** e **antes de dar push**:

```bash
bash scripts/sync-check.sh && bash scripts/sync-pull.sh
```

Commits **pequenos e frequentes** valem mais do que qualquer script: o que está commitado e
pushado não entra em colisão. O que fica 3 horas parado no seu working tree, entra.

**Combinado de território** — o jeito mais barato de nunca ter conflito é não editar o mesmo
arquivo ao mesmo tempo. Avisem um ao outro antes de entrar em arquivo grande e compartilhado
(`src/pages/Conversas.tsx`, `src/components/dashboard/Sidebar.tsx`, `src/index.css`).

---

## Duas armadilhas que o git não pega

1. **Migration.** O banco é compartilhado. Se ele rodou uma migration, o schema mudou **para os
   dois na mesma hora** — inclusive antes de você dar `git pull`. Depois de puxar código que
   mexeu em `supabase/migrations/`, rode:
   ```bash
   bash scripts/db.sh -c 'select * from auditoria_saude()'
   ```
   Ver `docs/SUPERAUDITORIA-2026-08-09.md`.

2. **`types.ts` desatualizado.** É gerado a partir do schema. Se o banco mudou e o arquivo não
   foi regerado, o TypeScript acusa tabela/coluna "que não existe" — mas existe no banco. Quem
   roda a migration é quem regera e commita o `src/integrations/supabase/types.ts`.

---

## Se o GitHub recusar seu push

```
! [rejected] main -> main (non-fast-forward)
```

Quer dizer que ele subiu algo enquanto você trabalhava. **Nunca resolva isso com `--force`** —
`--force` apaga o commit dele do servidor. O certo é:

```bash
bash scripts/sync-pull.sh   # traz o dele por baixo do seu
git push origin main
```
