# VISÃO-INOVACAO.md — Síntese do painel de estratégia (09/08/2026)

## Sumário executivo

As 4 lentes (dentista, UX, growth, técnico) produziram 20 propostas; após fusão de equivalentes, restaram **8 apostas** — e 3 lentes convergiram de forma independente na mesma aposta nº 1 (orçamento interativo), sinal mais forte do painel. O fio condutor: transformar nossa combinação irrepetível — **WhatsApp livre bidirecional (uazapi) + grafo único de dados (lead → orçamento por item → agenda → parcela) + outbox pronta** — em automações que fecham dinheiro sozinhas, enquanto o funil de trial aprende a converter sem vendedor. Quatro quick wins colhem diretamente o que foi entregue hoje: paywall sobre o preview de alcance, resumo diário no bolso do dono, seed de dados reais e demo WhatsApp ao vivo. Uma peça de infra compartilhada — o **Motor de Conversa com Estado** — destrava 4 das 8 apostas e deve nascer genérica na primeira que precisar dela. Nenhum concorrente copia o miolo: API oficial trava template e cobra por conversa; extensão Chrome não escreve na agenda.

---

## Mapa de fusão (dedupe)

| Aposta final | Propostas fundidas | Lentes |
|---|---|---|
| 1. Orçamento Vivo | "Orçamento Vivo — link que se vende sozinho" + "aprovação por item no celular" + "Orçamento interativo no WhatsApp" | dentista, ux, técnico |
| 2. Agenda que Conversa | "Agenda que Conversa (1, 2 ou 3)" + "Confirmação que remarca sozinha" + "Encaixe Automático" | ux, técnico, dentista |
| 3. Cobrança Invisível | "Régua Pix sem constrangimento" + "Cobrança que renegocia" | dentista, técnico |
| 4. Onboarding Vivo | "Clara mínima viável" + "Conta viva no primeiro login (seed)" + "Demo WhatsApp ao vivo" (×2) + "Presente que ativa" | growth (×4), técnico |
| 5. Paywall no Pico de Desejo | proposta única | growth |
| 6. Drip de Lead → Recepcionista 24h | "Drip de follow-up de lead" + "Recepcionista 24h" | técnico, dentista |
| 7. Fechamento de Bolso | proposta única | dentista |
| 8. Fila do Dia | proposta única | ux |
| Reserva | "Mesa da Secretária" (dock/drag-drop) e "Barra de Comando (cmd+K)" | ux |

Critério de priorização: (impacto na tese "engloba tudo e é fácil") × (vantagem estrutural nossa) ÷ esforço. Esforço: **P** pequeno / **M** médio / **G** grande. ⚡ = quick win.

---

## TOP 8

### 1. Orçamento Vivo — o link que se vende sozinho `[M]`

**O que é.** O orçamento vira link público (token) que o paciente abre no celular: itens com foto/vídeo explicativo do procedimento, aprovação item a item como carrinho (usando nossa aprovação POR ITEM que já existe no schema), escolha de parcelamento. A clínica vê o funil **enviado → visto → aprovado parcial → perdido** com R$ parado em cada estágio; sem resposta em X dias, follow-up automático pela outbox; quem preferir responde no próprio chat ("aprovo 1 e 3") e o webhook grava direto no item, gerando débitos.

**Por que só nós.** Exige três peças juntas que ninguém mais tem: orçamento granular por item (raridade no mercado — já é nossa entidade central), página pública própria e WhatsApp livre com mídia. Codental mostra vídeo na cadeira mas não amarra ao orçamento enviado (e o template da API oficial não carrega contexto rico); Capim só financia, não converte a decisão clínica. De quebra fecha o **A2 da auditoria** (ciclo de vida do orçamento: perdido/cancelado/expirado, excluir rascunho).

**Esforço.** M. **Dependências.** Resolver A2 primeiro (estados + exclusão); rota pública com token + evento de visualização; follow-up via outbox (pronta); Motor de Conversa v0 para a aprovação por resposta (opcional na v1 — o link sozinho já entrega).

### 2. Agenda que Conversa — anti no-show que remarca e encaixa `[M na v1 / G completa]`

**O que é.** Confirmação D-1 pela outbox; resposta "não posso" dispara oferta de **3 horários reais** lidos da disponibilidade ("responda 1, 2 ou 3") — a resposta do paciente remarca sozinha, pinta a agenda e notifica a secretária. Fase 2 (Encaixe Automático): cancelamento detectado pela máquina de status abre a vaga e o sistema oferece o horário via WhatsApp para a fila (retornos pendentes, orçamentos aprovados sem agendamento, pedidos de antecipação); o primeiro "SIM" ganha e o sistema agenda.

**Por que só nós.** Fecha o ciclo agenda → mensagem → agenda no mesmo banco. API oficial só permite botões estáticos de template aprovado — slots dinâmicos + remarcação na mesma conversa são inviáveis sem WhatsApp Flows caro; extensão Chrome (Codental, Simples Dental) não automatiza resposta nenhuma. Nossa máquina de status de consulta, validação de sobreposição de disponibilidade e outbox com retry/DLQ já estão auditadas.

**Esforço.** M (v1: só remarcação pós-"não posso") / G (encaixe + fila). **Dependências.** Motor de Conversa com Estado (nasce aqui); RPC em lote (B3, exigida pelas campanhas lançadas hoje); entidade fila de espera e tratamento de concorrência de slot (só na fase 2).

### 3. Cobrança Invisível — régua Pix sem constrangimento `[M]`

**O que é.** Régua por parcela: lembrete antes do vencimento, no dia, escalada suave depois — mensagem humanizada com valor exato e **Pix copia-e-cola daquela parcela específica**; o webhook do PSP dá baixa automática e o dentista nunca toca no assunto. Resposta "posso semana que vem?" cai no chat completo e vira conversa; "quer dividir em 2x? responda 1" executa `dividirParcela` via RPC no mesmo banco.

**Por que só nós.** A campanha de Inadimplentes do Codental é template genérico travado, crédito pago por mensagem, sem pagamento embutido, e a resposta morre numa central isolada do financeiro. Nós fechamos mensagem → Pix → baixa → renegociação num grafo só. Fecha o gap "baixa automática" apontado no benchmark e dá uso à `cancelarParcela` órfã (A3). É upgrade incremental da campanha de inadimplentes lançada hoje, não módulo novo.

**Esforço.** M. **Dependências.** **PSP de Pix (externa — iniciar cotação/homologação já, é o lead time mais longo do plano)**; webhook de conciliação; Motor de Conversa para a renegociação (reuso).

### 4. Onboarding Vivo — conta viva + momento uau, com Clara de container `[M, fatiável em quick wins]` ⚡

**O que é.** Três alavancas num container: (a) ⚡ **Seed de dados reais** ao fim do cadastro — paciente exemplo + consulta na agenda + orçamento com itens aprovados/pendentes + parcelas + lead no funil, rotulados "exemplo" com botão de limpar — mata o empty state das 43 páginas de uma vez e exibe o grafo inteiro do nosso pitch; (b) ⚡ **Demo WhatsApp ao vivo**: mensagem real no celular do prospect, ele responde como paciente e a resposta pinga NA TELA via Supabase realtime — prova o chat bidirecional que o Codental não tem; (c) **Presente que ativa**: 100 confirmações + 1 campanha livre com mídia, destravados ao cadastrar o primeiro paciente com telefone (prêmio = métrica de ativação). A **Clara** (orb CSS já especificada, 1 pergunta/tela, respostas configuram o setup real) é o container final que amarra os três.

**Por que só nós.** Para o Codental a demo custa template aprovado + créditos; para nós é `enqueueText` com custo marginal zero. Fecha o **A1 da auditoria** (demo cobre 4 de 43 páginas) pelo caminho estrutural certo — semear dados reais em vez de manter demo fake em 39 telas. 100% do tráfego pago passa por aqui: 1% de melhora multiplica o funil inteiro.

**Esforço.** Seed P ⚡, demo WhatsApp P/M ⚡, presente P, Clara shell M. **Dependências.** Nenhuma externa — outbox, webhook e realtime prontos; seed é composição de services já auditados. Seed e demo **não esperam a Clara**: shippar no cadastro atual.

### 5. Paywall no Pico de Desejo — gate de plano no disparo de campanha `[P]` ⚡

**O que é.** Trial monta a campanha e vê o preview de alcance ("~47 pacientes nos próximos 30 dias" — lançado hoje); o clique em "Ativar campanha" abre o modal de plano usando o próprio preview como argumento de venda. Mesma mecânica replicável depois nos outros picos: enviar orçamento por WhatsApp, ativar confirmação automática.

**Por que importa.** Não é diferencial — é a ponte trial → pagamento que hoje **não existe**. Sem vendedor, o segundo de máxima intenção é o único closer; o Codental valida exatamente isso (trial não dispara campanha, só monta).

**Esforço.** P. **Dependências.** Flag de plano/trial + modal de upgrade; preview de alcance (entregue hoje).

### 6. Drip de Lead → Recepcionista 24h `[P na v1 / G na visão]` ⚡

**O que é.** v1 ⚡: lead entra no funil → sequência automática D0/D2/D7 (INSERTs na outbox com `scheduled_at`; pg_cron detecta estagnação de etapa); qualquer resposta do lead cancela o resto da sequência e cai no chat completo. v2: menu estruturado oferece horários reais da agenda e marca a consulta sozinho (zero IA). v3: conversação por LLM — a recepcionista que trabalha de madrugada e devolve o dono com a agenda preenchida.

**Por que só nós.** Somos os únicos do comparativo com **entidade lead + CRM de captação + funil** — Codental começa no paciente; concorrente em API oficial pagaria template aprovado por passo e nem teria onde pendurar o lead. É a aposta que transforma o Sorrimax de sistema de gestão em funcionário — o motivo para nunca cancelar.

**Esforço.** P (drip) / M (menu de horários) / G (LLM). **Dependências.** RPC em lote (B3); `campanha_publico()` parametrizada; webhook de resposta (existe); Motor de Conversa a partir da v2.

### 7. Fechamento de Bolso — o dia da clínica no WhatsApp do dono `[P]` ⚡

**O que é.** Resumo diário às 20h no WhatsApp do dono, como um sócio informando: quanto entrou por forma de pagamento, quem faltou, orçamentos aprovados no dia, o que vence amanhã. v2 acrescenta líquido de maquininha e data prevista de repasse (gap do benchmark).

**Por que só nós.** Codental tem previsto vs. realizado — mas dentro do sistema: o dono precisa entrar e olhar. Gestão por **push** no canal que só nós temos; mata a noite de planilha. v1 é praticamente um relatório agendado sobre queries existentes.

**Esforço.** P (v1). **Dependências.** Outbox com `scheduled_at` + pg_cron (rodando); template de resumo; v2 depende do cadastro de taxas de maquininha (backlog do benchmark).

### 8. Fila do Dia — a amplitude colapsada em ações de 1 toque `[M; v1 em P]`

**O que é.** Inbox no topo da home-agenda: "3 confirmações sem resposta, 2 orçamentos vistos e não aprovados, 1 parcela venceu, 2 leads esfriando, 4 aniversariantes" — cada card resolve com 1 toque disparando mensagem pré-pronta pela outbox. Zerar a fila = clínica operada. É a camada de **julgamento humano** sobre as automações das apostas 1–3 e 6 (que são o piloto automático).

**Por que só nós.** Exige agenda + financeiro + funil + mensageria no MESMO grafo com canal de ação acoplado — concorrentes são silos e suas campanhas são batch cego. É o argumento definitivo da tese: a amplitude trabalha sem ser navegada, e o produto de 12 módulos fica mais simples de operar que o de 3.

**Esforço.** M (v1 com 3 cards sobre queries existentes = P). **Dependências.** Queries prontas (`inadimplentes`, `listarPacientesInativos`, aniversariantes); RPC em lote; o card mais valioso ("orçamento visto e não aprovado") depende dos eventos do Orçamento Vivo — por isso vem depois dele.

---

## Infra compartilhada — decisões do juiz

1. **Motor de Conversa com Estado (construir 1×, usar 4×).** Parser de resposta + tabela `conversa_estado` (contato, contexto ativo, expiração) + roteador que decide a qual fluxo a resposta pertence (confirmação? cobrança? orçamento? drip?). Serve as apostas 1, 2, 3 e 6. Nasce genérico na primeira que precisar (Agenda que Conversa v1); sem ele, cada feature reinventa parsing e duas réguas conflitam ao falar com o mesmo paciente.
2. **Guard de frequência na outbox.** Nenhuma lente levantou, mas com 5 automações ativas o mesmo paciente pode receber cobrança + confirmação + campanha no mesmo dia. Regra simples de prioridade e teto de mensagens/contato/dia na outbox antes de ligar a terceira régua. Barato agora, caríssimo como incêndio depois.
3. **RPC em lote (B3)** é dependência de 4 apostas e já era exigida pelas campanhas — garantir que saiu robusta (chat_id NULL, `to_number` direto).
4. **Higiene A2** (ciclo de vida do orçamento) não é aposta, é pré-requisito da aposta 1 — resolver na semana de preparação.

## Banco de reserva (cortadas do TOP 8, não do mapa)

- **Mesa da Secretária** (dock chat+agenda com drag-and-drop): o chat flutuante entregue hoje já dá metade do valor; o atalho consulta ↔ conversa é fiação barata que pode entrar junto com a Fila do Dia. O drag-and-drop completo espera o motor conversacional provar valor.
- **Barra de Comando (cmd+K)**: padrão excelente e barato (services expostos = fiação), mas zero defesa competitiva; a Fila do Dia ataca a mesma dor de eficiência com mais tese. Entra como polish no ciclo seguinte.

---

## Sequência recomendada

Já entregue hoje: campanhas com preview de alcance, chat flutuante global, agenda como home, tema azul. A sequência colhe isso primeiro e escala risco gradualmente.

**Semana 1 — colher o que foi plantado hoje (só quick wins ⚡).**
Paywall no disparo de campanha (o preview recém-lançado vira CTA) · Fechamento de Bolso v1 (relatório agendado 20h) · Seed de dados reais no cadastro atual (mata A1) · **abrir cotação do PSP Pix em paralelo** — é o lead time externo mais longo do plano.

**Semana 2 — funil de entrada + preparação.**
Demo WhatsApp ao vivo no cadastro (sem esperar Clara) · Drip de lead v1 (D0/D2/D7) · higiene A2 do orçamento (estados + exclusão) preparando a aposta 1.

**Semanas 3–4 — Aposta 1: Orçamento Vivo v1.**
Link público com token, evento "visto", aprovação por item, funil com R$ parado, follow-up automático. Motor de Conversa v0 nasce aqui se der folga (aprovação via resposta no chat); senão, o link sozinho já entrega a v1.

**Semanas 5–6 — Aposta 2: Agenda que Conversa v1.**
Confirmação D-1 + "não posso" → 3 slots reais → remarcação automática. Motor de Conversa vira genérico aqui (estado + roteador + guard de frequência). Encaixe/fila de espera fica para a fase 2, depois de medir a v1.

**Semanas 7–8 — Aposta 3: Cobrança Invisível.**
PSP homologado (cotado na semana 1): Pix copia-e-cola por parcela, régua, baixa automática via webhook; renegociação "responda 1 pra dividir" reusando o motor. Fila do Dia v1 (3 cards) entra aqui — o Orçamento Vivo já emite os eventos do card mais valioso.

**Contínuo / ciclo seguinte.**
Clara shell (orb já especificada) absorvendo seed + demo + presente nas telas finais · Fila do Dia completa · Recepcionista 24h v2 (menu de horários) · Mesa da Secretária e cmd+K como polish · Recepcionista v3 (LLM) quando o motor de conversa estiver maduro.

Regra de corte: cada entrega das semanas 1–2 é independente e shippável no dia; das semanas 3–8, cada v1 é fatiada para provar valor antes da fase 2. Nada no plano depende de módulo novo — tudo é composição sobre outbox, services auditados e o grafo que já existe.