# Asaas — passos de go-live (o que depende de você)

A integração está **construída e testada no banco**. Falta só o que envolve credencial e deploy —
que é sua ação, porque eu não digito chave de pagamento nem faço deploy que movimenta dinheiro real.
São ~15 minutos.

## O que já está pronto (no código)

- **Schema** (`migration 0027`, aplicada): tabelas de conexão, cobranças, assinaturas, log de webhook;
  RPC de baixa idempotente. `auditoria_saude()` verde.
- **2 edge functions**: `asaas` (proxy) e `asaas-webhook` (baixa automática + status de assinatura).
- **UI**: cobrança de paciente (Pix/boleto em Financeiro → Receber), card de conectar (Integrações →
  Pagamentos), página de plano (Ajustes → Plano).
- **Notificações do Asaas desligadas** (`notificationDisabled: true`) — nosso WhatsApp é o canal, o
  Asaas não dispara nem cobra por avisos redundantes.

---

## Fluxo A — Cobrança de paciente (dinheiro vai pra CLÍNICA)

Cada clínica usa a **própria conta Asaas**. Nada de chave global aqui.

1. **Deploy das funções** (uma vez):
   ```bash
   supabase functions deploy asaas
   supabase functions deploy asaas-webhook --no-verify-jwt
   ```
2. **Cada clínica conecta a si mesma**: em *Ajustes → Integrações → Pagamentos*, cola a chave de API
   do Asaas dela (Asaas: Configurações → Integrações → Chave de API) e escolhe Produção. O sistema
   valida a chave em `/myAccount` antes de salvar.
3. **Cada clínica configura o webhook no painel do Asaas dela**: a tela de conexão mostra a URL
   (`.../functions/v1/asaas-webhook`) e o **access-token** (o `webhook_token` da clínica) para colar em
   Asaas → Configurações → Webhooks. Eventos: pelo menos `PAYMENT_RECEIVED` e `PAYMENT_CONFIRMED`.

Pronto: na parcela pendente aparece **Cobrar** → gera Pix/boleto → o pagamento dá baixa sozinho.

---

## Fluxo B — Assinatura do SaaS (dinheiro vem pra SORRIMAX)

Usa a **conta Asaas da Sorrimax** (uma só, global). Configure como *secrets* das edge functions:

```bash
supabase secrets set ASAAS_SORRIMAX_KEY="<chave de produção da conta Sorrimax>"
supabase secrets set ASAAS_SORRIMAX_AMBIENTE="production"
supabase secrets set ASAAS_SORRIMAX_WEBHOOK_TOKEN="<invente um token forte>"
```

No painel Asaas **da Sorrimax**, configure um webhook apontando para a mesma função
`asaas-webhook`, com o **access-token = `ASAAS_SORRIMAX_WEBHOOK_TOKEN`** e os eventos
`PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `SUBSCRIPTION_DELETED`.

O webhook separa os dois fluxos pelo `externalReference` (`saas:<clinica>` = assinatura; UUID cru =
paciente), então **um endpoint só** serve os dois.

### Decisões suas antes de ligar o Fluxo B
- **Plano "SORRIMAX AI" R$297**: a superauditoria apontou que ele vende IA que ainda não existe. Ou
  entregue a IA, ou renomeie/rebaixe antes de cobrar por ela. Na página de plano ele está como
  "Premium" (genérico) de propósito.
- **Gating**: hoje é *soft* — a página mostra o status, mas nada bloqueia o app quando o trial vence
  ou a assinatura atrasa. Ligar bloqueio duro é decisão sua (e precisa de teste E2E de login pra não
  trancar ninguém). O status já está em `clinicas.assinatura_status` pronto pra consultar.

---

## Variáveis de ambiente (resumo)

| Secret | Onde | Para quê |
|---|---|---|
| `ASAAS_SORRIMAX_KEY` | edge secret | assinatura SaaS (conta Sorrimax) |
| `ASAAS_SORRIMAX_AMBIENTE` | edge secret | `production` / `sandbox` |
| `ASAAS_SORRIMAX_WEBHOOK_TOKEN` | edge secret + painel Asaas Sorrimax | validar webhook de assinatura |
| `ASAAS_BASE_PROD` / `ASAAS_BASE_SANDBOX` | edge secret (opcional) | override da URL base da API |
| chave da clínica | digitada na UI, guardada em `clinica_integracao_asaas` | cobrança de paciente |

## Teste rápido (sandbox)
1. Conecte uma clínica com a chave **sandbox** do Asaas.
2. Gere uma cobrança Pix numa parcela; pague pelo simulador do sandbox.
3. Confira que a parcela vira **pago** sozinha (o webhook chamou `asaas_baixar_cobranca`).
4. Veja o evento em `asaas_webhook_eventos` com `processado_em` preenchido e `erro = null`.
