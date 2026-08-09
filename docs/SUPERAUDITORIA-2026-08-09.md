# Superauditoria Sorrimax — 09/08/2026

Auditoria multi-agente (Fable 5): 6 lentes independentes (performance, segurança, testes, UX/a11y,
padrões de mercado, estratégia) sobre o repo real, cada achado grave passado por um verificador
adversarial que confirmava evidência byte-a-byte no código. 36 agentes concluíram; a síntese
automática e 4 verificações finais foram cortadas pelo limite de cota do Fable — este documento
reconstrói a síntese a partir dos 61 achados já verificados. Nível: `high`.

> Nota de método: quase todos os achados abaixo saíram com veredito **CONFIRMADO** na verificação
> (grep/Read do arquivo:linha citado). Os 4 que ficaram sem verificação estão marcados `[não-verif.]`.

---

## Sumário executivo

O Sorrimax tem um **núcleo de produto acima da média do segmento** — grafo de dados unificado (lead →
orçamento por item → agenda → parcela → comissão), RLS multi-tenant sólida (`auditoria_saude()` verde),
odontograma, CRM de captação que nenhum concorrente tem, e infra de WhatsApp própria com retry/DLQ. Mas
está **abaixo do padrão de mercado em três eixos que decidem venda**: (1) o produto **não fatura** — 3
planos anunciados, zero billing/checkout no código; (2) **recursos que a landing vende não existem** —
confirmação automática de consulta, agendamento online (`/c/:slug` é link morto), IA do plano de R$297;
(3) **o trial se demonstra mal** — demo cobre 5 de 44 telas e a Agenda (o coração) abre vazia. Os três
riscos maiores: o **billing inexistente** (não há como cobrar quem converte), a **dependência da uazapi
não-oficial em conta compartilhada com o Diamond CRM** (risco existencial do moat), e a **exposição de
segurança** herdada (chaves do projeto violado no `.env`, PII de saúde em `leads_sistema`). A maior
alavanca isolada: ligar o que já existe no banco à interface — o funil unificado, a confirmação de
consulta (coluna e índice prontos, sem worker) e o agendamento público (serviço pronto, sem rota).

**Veredito:** núcleo **acima** da média; superfície de produto (billing, confirmação, mobile, trial)
**abaixo**. A aposta que muda o jogo não é construir mais — é **conectar e cobrar**.

---

## Achados por severidade

Legenda de esforço: **P** pequeno (horas) · **M** médio (dias) · **G** grande (semanas).
✅ = já corrigido nesta sessão.

### 🔴 Críticos

| # | Achado | Esf. | Ação |
|---|---|---|---|
| 1 | **Negócio não fatura** — 3 planos, zero billing/checkout/gate de plano | G | Integrar gateway de assinatura (Stripe/Iugu/Asaas); gate no trial |
| 2 | **Confirmação automática de consulta não existe** — e a landing vende | M | Coluna `lembrete_enviado_em` + índice de fila já existem; falta o job + template |
| 3 | **Agendamento online: `/c/:slug` é link morto** — clínica distribui link pro NotFound | M | Criar a rota pública (o serviço `urlPublica`/`carregarPerfilPublico` já existe) |
| 4 | **Plano "SORRIMAX AI" R$297 vende IA inexistente** no código | P | Remover da landing OU rebaixar a "em breve" até existir |
| 5 | **Mobile quebrado** — sidebar fixa 228px sem drawer/hambúrguer | M | Sidebar em `Sheet` no breakpoint mobile; recepção usa celular |
| 6 | **Bundle único 3,14 MB** (688 KB gzip) — 44 páginas estáticas, zero code-split | M | ✅ lazy por rota (feito nesta sessão) |
| 7 | **`.env` aponta pro projeto violado `irqlxtyvtpsnteqbdsix`** com chaves pré-vazamento | P | Rotacionar chaves; migrar `.env` pro projeto novo `vcaloytujryxaqutxpgy` |
| 8 | **Sem armazenamento de arquivos** — radiografia, foto clínica, anexo | M | Bucket Supabase Storage + aba Arquivos na ficha |
| 9 | **Sem recuperação de senha** — trial morre no 2º login | P | ✅ feito (`/redefinir-senha` + link no Auth) |
| 10 | **Fila de WhatsApp sem motor no repo** — nada invoca a Edge `whatsapp-outbox` | P | Documentado abaixo; live tem invocação externa, fresh env precisa do cron |
| 11 | **Aniversário parabeniza 1 paciente por clínica/ano** (dedup sem paciente) | P | ✅ migration 0026 |
| 12 | **Campanha sem DDI 55** — uazapi fala com número errado | P | ✅ migration 0026 |

### 🟠 Altos (22 — resumo)

- **Perf de dados**: Pacientes baixa a base inteira (`select *` + embed) sem paginação/virtualização;
  CRM faz polling 30s O(chats×leads) re-baixando tudo; React Query provido mas usado em 1 arquivo (todo
  o resto é `useEffect` manual sem cache → cada navegação re-baixa); Dashboard agrega no cliente e
  **trunca em 1000 consultas em silêncio** (gráfico fica errado). → **M cada**, alto retorno.
- **Dinheiro**: ✅ estornar parcela não devolvia comissão (0026); ✅ inadimplência re-cobrava quem pagou
  1 de N (0026); **baixa de parcela sem guarda de concorrência** — dupla baixa sobrescreve caixa e
  update com 0 linhas vira "sucesso" (M, pendente).
- **Mercado / deal-breakers**: sem import/export de pacientes (a migração do concorrente não tem porta de
  entrada); orçamento não sai do sistema (sem PDF/print/WhatsApp — é o momento de venda na cadeira);
  cobrança digital inexistente (financeiro só registra, não cobra boleto/Pix). → **M–G**.
- **Segurança**: `service_role` JWT em texto plano no `.env` de repo frontend; `leads_sistema` com PII de
  saúde e INSERT anônimo irrestrito, RLS via HOTFIX não-versionado (ANPD pendente).
- **UX**: fluxo diário **agenda↔paciente não existe** (nenhum link da Agenda pra ficha, nenhum "Agendar"
  na ficha); dois dialogs de criar consulta divergentes e a tela principal ficou com o pior; **98 toasts
  vazam erro cru do Postgres em inglês** pra recepcionista; trial cobre 5 de 44 telas; sem PWA/manifest.
- **Moat**: WhatsApp real, mas sobre uazapi **não-oficial em conta compartilhada com o Diamond CRM**;
  provider `meta` declarado sem implementação → risco existencial (G).

### 🟡 Médios (21 — destaques)

- three.js (930 KB) sustentando a orb decorativa (já é lazy, só na `/onboarding-preview`).
- ✅ `Conversas` re-assinava o canal Realtime a cada troca de chat (o `FloatingChat` desta sessão já nasce
  com o fix por `ref`); **o mesmo bug ainda vive em `Conversas.tsx`** (P, pendente).
- **Cor primária `#00b4d8` falha WCAG AA** (3,3:1 com texto branco) no app inteiro → escurecer o fundo dos
  botões para `brand-700` mantém a identidade e passa AA (decisão de marca, deixada para o Guilherme).
- Botões só-ícone sem nome acessível (voltar, fechar chat, reordenar anamnese).
- RLS a apertar: `clinicas` INSERT anon `WITH CHECK(true)`; `especialidades` catálogo global gravável por
  qualquer admin; `slots_disponiveis` permite enumeração cross-tenant.
- **Diferencial nº1 desconectado**: o kanban do CRM roda no schema legado; o funil unificado existe no
  banco e **nenhuma tela usa** (M) — a maior oportunidade de "conectar o que já existe".
- ✅ `campanha_envios` travava em "enfileirado" pra sempre (0026); ✅ runner sem isolamento por clínica
  (0026); **`marcar_parcelas_atrasadas` não agendada** (o front já deriva o atraso em `statusEfetivo`).
- `criarLancamentoAvulso`: 2 escritas sem transação (o repo já tem o padrão RPC pra isso).
- Chat "completo" é meia-verdade: recebe mídia, só envia texto.
- Sem trilha de auditoria (quem excluiu/estornou/alterou).

### ⚪ Baixos (6)

CORS `*` na edge `whatsapp-instances`; `whatsapp-webhook` devolve 200 em qualquer exceção e loga payload
cru (mascara falha + retém PII); assinatura digital com validade jurídica ausente; zero skeletons (29
telas piscam spinner); erro engolido na remoção de item de orçamento; munição de marketing comparativo
(paridades verificadas) não usada.

---

## Plano de aplicação em 3 ondas

### Onda 1 — Quick wins aplicáveis já (P) — parcialmente FEITA nesta sessão
- ✅ Correções de dinheiro/campanha (migration 0026): dedup de aniversário e inadimplência, DDI 55,
  status observável do envio, isolamento por clínica, reversão de comissão no estorno.
- ✅ Recuperação de senha (`/redefinir-senha`).
- ✅ Code-splitting por rota (bundle inicial).
- ✅ **Plano "SORRIMAX AI" rebaixado** → "Avançado" com recursos reais (cobrança Asaas, página pública,
  campanhas); card "Assistente de IA" → "Automação no WhatsApp" (fim do overclaim).
- ✅ **`aria-label`** nos 2 botões só-ícone restantes (o resto já tinha; 53 no total).
- ✅ **Guarda de concorrência na baixa de parcela** (`neq status='pago'` + checa linhas afetadas; a 2ª
  baixa simultânea avisa em vez de fingir sucesso).
- ✅ **Fix de Realtime no `Conversas.tsx`** (assina uma vez por clínica, usa refs — não re-assina por chat).
- ✅ **slots RLS** tolera contexto nulo pro agendamento público sem furar o isolamento (0031).
- **Pendente (decisão de produto)**: RLS de `clinicas`/`especialidades` — global vs por-clínica; documentado,
  não alterado às cegas.

### Onda 2 — Esta semana (M)
- Confirmação automática de consulta (coluna + índice já existem; falta job + template) — recurso nº1 do
  segmento e o mais vendido na landing.
- Rota pública `/c/:slug` (serviço pronto) — destrava o funil de tráfego pago.
- Orçamento sai por PDF/WhatsApp; import/export de pacientes (porta de entrada da migração).
- Mobile: sidebar em drawer; toasts em pt-BR (mapa de erro Postgres→humano, 1 helper cobre os 98).
- Perf: paginar/virtualizar Pacientes; adotar React Query nas telas quentes; teto do Dashboard honesto.
- Conectar o funil unificado à tela do CRM (matar o schema legado do kanban).

### Onda 3 — Estrutural (G)
- **Billing/checkout + gestão de assinatura** — sem isso não há negócio.
- Cobrança digital (boleto/Pix com baixa automática) — fecha mensagem→pagamento→baixa no mesmo grafo.
- Endurecer o moat de WhatsApp: instância dedicada (sair da conta compartilhada com o Diamond) e caminho
  para a API oficial como fallback; é o maior risco existencial.
- Storage de imagens clínicas; assinatura digital com validade jurídica; TISS/convênios.

---

## Fechamento da sessão noturna (08→09/08)

Além das Ondas 1–2 já marcadas ✅ acima, esta madrugada fechou:

- **Trilha de auditoria** (migration 0032): `audit_log` + trigger `registrar_auditoria` em
  consultas/parcelas/orçamentos/pacientes (loga DELETE e mudança de status), RLS admin, FK pro nome de
  quem agiu, e tela **Ajustes → Atividades**. Responde "quem apagou/estornou?".
- **CORS travável** nas edge functions autenticadas (`asaas`, `whatsapp-instances`): allow-list opt-in via
  secret `ALLOWED_ORIGINS`, com `*` de fallback pra não quebrar deploy. Documentado no go-live.
- **Honestidade comercial** na landing (achado P): fim do tier de IA fictício e do card de assistente
  autônomo.
- **a11y**, **guarda de concorrência na baixa**, **Realtime do Conversas** e **slots públicos** (acima).

Fora de escopo por decisão do dono: **storage** (aguardando ele indicar o provedor) e **deploy das edge
functions que movem dinheiro** (chaves + `supabase functions deploy` são passo dele).

---

## O motor da fila (achado 10) — decisão desta sessão

O `whatsapp-outbox-reaper` (pg_cron */5) só destrava itens presos em `sending`; **não invoca o worker**.
Em produção há invocação externa (senão o reaper marcaria tudo como `dead`), então **não auto-agendei um
`pg_net` competindo** — enviaria WhatsApp de verdade a pessoas reais e poderia duplicar. Fica como passo
de deploy documentado: ambiente novo precisa agendar `net.http_post` para a Edge `whatsapp-outbox` com o
`x-outbox-secret` do Vault. As campanhas enfileiram corretamente; o envio depende dessa peça.

---

## Veredito estratégico

O produto **faz sentido** e mira um segmento real (clínicas odonto 1-10 cadeiras, venda por tráfego pago).
O núcleo técnico está **acima** do padrão de mercado; a superfície comercial está **abaixo**. A cunha de
entrada mais forte não é um recurso novo — é **conectar o que já está no banco** (funil, confirmação,
agendamento público) e **fechar o loop de dinheiro** (billing + cobrança digital). O moat (WhatsApp livre
+ grafo unificado) é real e defensável, desde que saia da dependência da conta uazapi compartilhada. Ver
[[VISAO-INOVACAO]] para as 8 apostas de produto que capitalizam esse núcleo.
