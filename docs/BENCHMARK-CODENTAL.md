# Benchmark Codental — levantamento completo (09/08/2026, sessão logada)

Percorrido módulo a módulo no trial real (conta própria, dados de exemplo do onboarding).
Complementa [[ONBOARDING-CLARA-REFERENCIA]] (o fluxo de cadastro já está lá). O que segue é o
**produto por dentro** e o que cada lógica ensina pro Sorrimax.

---

## 1. Arquitetura de navegação (a resposta pra "sidebar ou não")

O Codental **não tem sidebar de módulos**. A estrutura é:

```
TOPBAR:  [logo]  Agenda | Pacientes | Financeiro | [⋮⋮ grid] | 👋 Chamar especialista   🔍 🔔 💬 ✓ ⚙️ [Conta]
```

- **3 módulos primários** na topbar — o ciclo diário: Agenda, Pacientes, Financeiro.
- **7 módulos secundários** num grid dropdown: Controle de Estoque, Campanhas automáticas,
  Relatórios de Inteligência, Galeria de Vídeos, Site da Clínica, Controle de Prótese,
  Extensão para WhatsApp.
- Sidebar esquerda existe **só dentro da Agenda**, e é contextual: mini-calendário, lista de
  Cadeiras (filtro), lista de Agendas/profissionais (filtro). Em Relatórios idem (sub-navegação
  local).
- Botão de suporte visível o tempo todo ("Chamar especialista" + bolha flutuante).

**Leitura**: o app assume que 90% do tempo o usuário vive na agenda. Módulo raro não polui o
caminho diário. A sidebar do Sorrimax (Diamond-style, 12 itens) é mais navegável para produto
amplo; o modelo Codental é mais focado. Híbrido possível: manter sidebar Diamond, mas com os
3 do ciclo diário no topo dela e o resto agrupado/colapsado.

## 2. Agenda (a home)

- **Login cai na agenda**, não em dashboard. Título da aba: "Agenda - Codental".
- Vistas: **Semana | Dia | Cadeira** (cadeira = colunas por cadeira, vista de ocupação física).
- Mini-calendário navegável; filtros por cadeira e por profissional (criados no onboarding:
  respondi "2 cadeiras" → Cadeira 01/02 já existiam).
- Fim de semana esmaecido (fora da jornada); **feriado rotulado no dia** ("Dia dos Pais").
- Botão WhatsApp na toolbar da agenda (extensão).

### Modal de agendamento (o coração)

- Tabs: **Consulta | Compromisso | Tarefa** — a agenda aceita os três; compromisso pessoal e
  tarefa vivem no mesmo calendário.
- Dentista + Cadeira (selects).
- Paciente: busca por nome/telefone/CPF com **cadastro inline** ("Cadastrar" do lado — não sai
  do fluxo pra criar paciente novo).
- Data + Horário + Duração + botão **"Encontrar horário"** (acha a próxima vaga livre).
- Validação **soft**: "Horário da consulta fora da jornada do profissional" — avisa, não trava.
- **"Enviar mensagem de confirmação? Sim/Não"** — a confirmação por WhatsApp é decidida na
  marcação (consome crédito de "Confirmações").
- **"Retornar em"** (Sem retorno / períodos) — o retorno é semeado no ato da marcação; é isso
  que alimenta a campanha "Retorno semestral" depois.
- Etiqueta (rótulo colorido).

**Pro Sorrimax**: nosso ConsultaDialog precisa de: cadastro inline de paciente, "encontrar
horário", aviso de fora-da-jornada, toggle de confirmação, campo "retornar em". A agenda como
home e a vista por cadeira nós já temos parcialmente.

## 3. Pacientes

- Lista simples: busca nome/telefone/CPF, filtro por categoria, **export Excel/CSV**.
- **Abas = segmentos de campanha**: Buscar | Aniversariantes | Retornos semestrais. O público
  da automação é também uma lista navegável — mesma query, dois usos.
- Linha mostra "Última consulta: dd/mm — em N dias".

### Ficha do paciente (deles)

- Header: foto, nome + **badges contextuais**: "⚠️ 1 Alerta de Saúde" (vermelho, vem da
  anamnese) e "🎂 Aniversário depois de amanhã". WhatsApp, CPF, idade ("29 anos e 11 meses"),
  botão Categorizar.
- Tabs: Visão Geral | Anamneses | Orçamentos | Tratamentos | **Pagamentos (badge com nº de
  pendências)** | Evoluções | Documentos | Arquivos.
- Visão Geral: widget **Tarefas do paciente** (+Nova), Informações (código, **"Preferência de
  lembretes: Não receber"** — opt-out LGPD por paciente, respeitado pelas campanhas), celular,
  email, observações, e o **odontograma como peça central** (Permanentes/Decíduos, numeração
  FDI, legenda Finalizado=verde / Em aberto=laranja, dente extraído com X).
- Tratamentos: odontograma + lista (Data, badge Orç. #id, procedimento, Particular/convênio,
  valor repasse, Dr(a), dente, faces, valor, **botão "Finalizar"** de 1 clique → pinta o dente).
- Pagamentos: cards Total pago / A receber, filtro por período, chips Todos/Pagos/Aguardando/
  Em aberto/Em atraso, linha = parcela ("1/3") com vencimento, link pro orçamento, botão
  **"Pagar"** na linha, seleção em lote.

**A cadeia inteira**: orçamento aprovado → tratamentos por dente → "Finalizar" por sessão →
odontograma pinta → parcelas vencem → inadimplência aparece no Financeiro **e** na campanha de
Inadimplentes. Um grafo só — igual à nossa tese do funil unificado.

## 4. Financeiro

Tabs: **Painel | Fluxo de caixa | Boletos | Comissões**.

- Painel: seletor mês/ano; 3 colunas Entradas / Saídas / Resultados, cada uma com
  **Realizado / A realizar / Total previsto** (previsto vs. realizado em tudo);
  cards Aguardando repasse, **Total de inadimplência** (R$ + nº pacientes + "Ver todos"),
  Próximas despesas.
- Fluxo de caixa: Receitas/Despesas/Saldo por período + lançamentos + "Adicionar despesa".
- **Boletos: emissão com "baixa automática do pagamento"** — o boleto compensa e o sistema dá
  baixa sozinho. É o "ouvindo o que está batendo".
- **Taxas de maquininhas** (em Configurações): cadastra cada máquina e suas taxas "para o
  Codental te ajudar a controlar **quanto e quando** você recebe" — cartão vira valor líquido
  + data prevista de repasse; o card "Aguardando repasse" acompanha.
- Comissões: regras por profissional ("Configurar regras"), estado vazio até configurar.

**Pro Sorrimax**: nós temos fluxo/receber/pagar/comissões. Os gaps de lógica: previsto vs.
realizado lado a lado, repasse de maquininha (taxa+prazo → líquido+data), baixa automática
(boleto/Pix), inadimplência como card com link direto pra ação.

## 5. Campanhas automáticas ⭐ (a "Central de mensagens")

- Header permanente: **saldo de créditos por categoria** — "30 Marketing 🟢 | 100 Confirmações
  🟢 | 30 SMS 💬" + botão "Comprar mais". Mensageria é monetizada por pacote, separada por uso.
- Tabs: **Mensagens** (inbox de respostas) | **Campanhas automáticas** | **Histórico de envio**.
- Aviso: campanhas só disparam após seleção de plano (trial não envia).

### Catálogo (6 campanhas prontas, toggle "Ativar")

| Campanha | Gatilho | Insight |
|---|---|---|
| **Aniversariantes** | data de nascimento | relacionamento barato |
| **Retorno semestral** | última consulta > 6 meses | reativação clínica (alimentada pelo "Retornar em" da agenda) |
| **Inadimplentes** | parcela em atraso | cobrança automática — liga financeiro→mensagem |
| **Alinhadores Invisíveis** | prazo de troca do alinhador | nicho orto, recorrência |
| **Pesquisa de satisfação** | pós-consulta | NPS automático |
| **Personalizada** | filtros de público | campanha ad-hoc |

### Config de campanha (modal)

- Canal: **SMS** (texto editável, 150 chars, sem emoji/acento — restrição técnica explicada) ou
  **WhatsApp** (template **travado** — API oficial, não editável; mensagem mais longa/formatada).
- Template já vem preenchido **com o nome da clínica** do onboarding.
- **Preview de alcance: "Ao ativar essa campanha você atingirá aproximadamente N pacientes nos
  próximos 30 dias"** — projeção com dados reais antes de ligar. É o detalhe que converte.
- Aba Mensagens = chat com quem respondeu à campanha (não é WhatsApp completo; é central de
  respostas).

**Vantagem nossa**: usamos uazapi (não-oficial) → **mensagem de campanha 100% editável, com
emoji, mídia e variáveis**, sem template travado. E nosso chat é WhatsApp completo, não só
respostas de campanha.

## 6. Galeria de Vídeos

Modal com biblioteca de **vídeos educativos indexados por procedimento** (Ortodontia:
Alinhadores, Aparelho fixo convencional, Elásticos, Expansão de maxila, Mordida aberta,
Prognatismo, Sobremordida...). Busca por nome do procedimento. Uso: mostrar na cadeira ou
enviar ao paciente — ferramenta de **fechamento de orçamento** (paciente entende o tratamento
→ aprova).

**Pro Sorrimax**: anexar vídeo explicativo ao orçamento enviado por WhatsApp (temos o canal!)
é a versão melhor disso.

## 7. Relatórios de Inteligência

- Sub-navegação: Visão geral | Prontuário (Análise de Orçamentos / de Tratamentos) | Agenda
  (Análise de Consultas / **Pacientes sem Consultas**) | Pacientes (Análise de Cadastros) |
  Assinaturas digitais.
- "Atualizado a cada 10 minutos".
- Cards com **meta e veredito**: "Percentual de comparecimento: **EXCELENTE 100%** (Objetivo
  > 85%)" — não é número cru, é número + julgamento. "Dia com mais atendimento: **Terça**" —
  insight de padrão, não métrica.

**Pro Sorrimax**: nosso Dashboard/Relatórios pode adotar meta+veredito por KPI e 2–3 insights
de padrão ("seu dia mais forte é X", "N pacientes sem retorno marcado").

## 8. Site da Clínica / Convênios / Outros

- **Site da Clínica**: wizard 4 passos, site hospedado com **agendamento online pelo paciente**
  (nosso PaginaPublica cobre — paridade).
- **Configurações**: clínica, profissionais (convite + permissões + **horários de trabalho**,
  que alimentam a validação de jornada da agenda), taxas de maquininhas, mensagens de
  confirmação, **convênios com tabela de tratamentos e valores por convênio** (gap nosso),
  modelos de anamnese.
- **Extensão para WhatsApp**: extensão de navegador que gruda o Codental no WhatsApp Web (não
  precisamos — nosso chat é nativo).
- Suporte onipresente: "Chamar especialista" (ligação/WhatsApp/chat) + bolha flutuante em toda
  tela + link "Acesse nosso guia" no rodapé de cada módulo.

---

## 9. Síntese — o que copiar, o que já ganhamos, o que nos diferencia

**Copiar (modelo de interação, prioridade alta):**
1. Campanhas prontas com toggle + **preview de alcance** + créditos visíveis.
2. Agenda como home; modal com confirmação, "retornar em", encontrar horário, cadastro inline.
3. Badges contextuais na ficha (alerta de saúde, aniversário) e opt-out de lembretes.
4. Financeiro previsto vs. realizado + inadimplência como card acionável.
5. Métricas com meta+veredito nos relatórios.
6. Segmento de campanha = aba navegável em Pacientes.

**Já temos paridade ou melhor:**
- Chat WhatsApp completo (eles: só respostas de campanha) · página pública com agendamento ·
  odontograma · orçamento como entidade central · funil de vendas/CRM (eles não têm CRM de
  captação!) · estoque · prótese.

**Diferenciais nossos a explorar:**
- **CRM de captação + funil** — Codental começa no paciente; nós começamos no lead.
- **Campanha por WhatsApp livre** (uazapi): editável, mídia, variáveis — sem template travado.
- Chat nativo global (botão flutuante em toda tela — decisão desta sessão).

**Gaps reais que eles expõem:**
- Repasse/taxas de maquininha; baixa automática de boleto/Pix; convênios com tabela por
  convênio; galeria de vídeos por procedimento; assinatura digital de documentos; extensão/
  integração WhatsApp Web (irrelevante pra nós); "Pacientes sem Consultas" como relatório.
