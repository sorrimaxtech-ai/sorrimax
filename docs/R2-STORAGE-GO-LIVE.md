# Storage (Cloudflare R2) — go-live

Anexos de paciente (exames, raio-x, fotos, documentos) vivem no **Cloudflare R2**
(S3-compatível, sem taxa de egress). Os **bytes** ficam no R2; o banco guarda só o
metadado (`arquivos`) + a chave do objeto. O navegador **nunca** vê a secret do R2:
pede à edge `r2-storage` uma **URL pré-assinada** curta e fala direto com o R2.

## O que já está pronto (código + infra)

- **Migration 0034** (`arquivos`): metadado + RLS (leitura só da própria clínica; escrita só a edge).
- **Edge `r2-storage`**: gera URL de upload/download pré-assinada, autoriza contra a clínica do JWT,
  deriva a chave no servidor (`clinica/<id>/<arquivo_id>/<nome>`) — cliente não escolhe a chave.
- **Front**: aba **Arquivos** na ficha do paciente (`/pacientes/:id`) — enviar, ver, excluir.
- **Bucket `sorrimax`** criado no R2 e **CORS do bucket** já configurado (aceita PUT/GET do navegador).

## O que falta (seu passo — envolve segredo e deploy)

### 1. Setar os secrets da edge (valores no seu painel R2; **não** ficam no repo)

```bash
supabase secrets set R2_ACCOUNT_ID="<account id do R2>"
supabase secrets set R2_ACCESS_KEY="<access key id>"
supabase secrets set R2_SECRET_KEY="<secret access key>"
supabase secrets set R2_BUCKET="sorrimax"
# opcional, recomendado (trava CORS das edges — compartilhado com asaas/whatsapp):
supabase secrets set ALLOWED_ORIGINS="https://app.sorrimax.com.br,https://sorrimax.com.br"
```

### 2. Fazer deploy da função

```bash
supabase functions deploy r2-storage
```

## Teste rápido (pós-deploy)

1. Entre na sua conta, abra um paciente → aba **Arquivos**.
2. Escolha a categoria (Exame/Raio-X/Foto/Documento) e envie um JPG/PNG/PDF (até 25 MB).
3. A miniatura aparece; clicar abre o arquivo (URL pré-assinada de 5 min).
4. Excluir remove do R2 e da lista.

## Segurança

- **Rotacione a secret key do R2** se ela passou por canal não seguro (ex.: colada em chat). No painel
  R2 é gerar um novo token S3 e re-setar `R2_ACCESS_KEY`/`R2_SECRET_KEY`.
- O **CORS do bucket** está em `*` (o presigned URL já é a autorização; o `*` só libera o JS do navegador
  a usar a URL que já tem). Para apertar, edite a regra CORS do bucket restringindo `AllowedOrigin` aos
  domínios do app.
- **Limites**: 25 MB por arquivo; só imagem ou PDF (ajustável na edge — `MAX_BYTES`/`tipoPermitido`).
- **Isolamento**: todo acesso a objeto passa pela edge, que confere o `clinica_id` da linha contra a
  clínica do JWT. Um cliente não alcança arquivo de outra clínica nem escolhendo o id.

## Detalhe operacional

- Ao **excluir um paciente**, as linhas `arquivos` somem em cascata, mas o **objeto no R2 não** — fica
  órfão. Volume é baixo (exclusão de paciente já é restrita por consultas). Um reaper futuro pode varrer
  objetos sem linha; por ora, sem custo relevante.
