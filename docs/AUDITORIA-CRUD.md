# Auditoria de CRUD e lógicas — Sorrimax (09/08/2026, madrugada)

Método: mapa da camada de services (funções exportadas × uso na UI), inspeção dos deletes,
regras de FK direto no banco (pooler), `auditoria_saude()` e navegação nas telas.

## Estado geral: sólido

- **`auditoria_saude()` → OK** — nenhuma invariante violada (51 tabelas, 0 sem RLS).
- **Toda exclusão na UI passa por AlertDialog** (15 páginas conferidas), nenhuma exclui no
  clique direto.
- **FKs de `pacientes` são deliberadas**: consultas/orçamentos/documentos `RESTRICT` (histórico
  bloqueia hard delete), anamnese/evoluções/odontograma `CASCADE`, lançamentos/oportunidades/
  chats `SET NULL`. E a UI traduz o 23503: "Paciente tem histórico vinculado" + caminho de
  desativar (`definirAtivo`).
- CRUD completo confirmado em: pacientes, consultas (com máquina de status e recorrência),
  agenda (bloqueios, cadeiras, disponibilidade com validação de sobreposição), procedimentos
  (+preços por convênio/profissional), estoque (+movimentos), prótese (etapas), anamnese
  (modelos/perguntas/respostas com score), documentos (modelos/emitidos), financeiro
  (baixar/estornar/dividir/lançamento avulso), permissões (perfis), integrações (tokens,
  instâncias WhatsApp).
- Outbox WhatsApp pronta pra automação: retry (`attempts/max_attempts`), **`scheduled_at`**
  (agendamento nativo), DLQ, worker Edge + reaper pg_cron. Enfileiramento por RPC atômica.

## Buracos encontrados (por severidade)

### A1 — Demo mode cobre 4 de 43 páginas
`useDemoMode/demoData` só em Dashboard, CRM, Financeiro e Index. Agenda em demo mostra
"Nenhuma clínica vinculada". Para venda por tráfego pago (usuário explora sozinho), o demo
furado derruba a conversão exatamente onde o Codental brilha (dados de exemplo semeados no
onboarding). **Recomendação estrutural**: em vez de esticar o demo fake, semear dados reais
no onboarding (paciente exemplo + consulta + orçamento + débito), como o Codental faz.

### A2 — Orçamento não tem ciclo de vida completo
`orcamentos.ts`: cria (rascunho), publica, aprova/recusa **por item**, desconto, gera débitos.
Não existem: `excluirOrcamento` (rascunho errado fica pra sempre), cancelar/perder o orçamento
inteiro (funil de vendas sem "perdido" — o CRM tem, o orçamento não), nem editar cabeçalho
(profissional/convênio) depois de criado.

### A3 — `cancelarParcela` existe no service e nenhuma UI chama
Feature órfã em `financeiro.ts`. Ou expor (menu da parcela em FinanceiroReceber) ou remover.

### B1 — Consultas: `excluirConsulta` é hard delete
Existe máquina de status com cancelamentos (correto), mas o delete físico apaga histórico que
alimenta "última consulta" (campanha de retorno). Aceitável para erro de lançamento; ideal:
restringir a consultas sem venda vinculada.

### B2 — Sem trilha de auditoria de ações
Nenhum `audit_log` de quem excluiu/estornou/alterou. Para clínica com equipe, "quem apagou a
consulta do paciente X?" precisa de resposta.

### B3 — WhatsApp: envio 1-a-1 apenas
`enqueueText(chatId, texto)` exige chat existente. Campanha precisa enfileirar por
`to_number` sem chat prévio (a outbox aceita `chat_id NULL` — falta a RPC em lote).

### C — Menores
- `evolution.ts` vazio (resquício; remover).
- Órfãs de UI: `alternarAtivoCadeira` tem UI, ok; `duplicarModelo` (documentos) tem UI, ok.
- Faltas vs. Codental (não são bugs, são backlog): repasse/taxas de maquininha, baixa
  automática de boleto/Pix, convênios com tabela própria (temos preço por convênio em
  procedimentos — parcial), "encontrar horário" no agendamento, campo "retornar em",
  confirmação opt-in na marcação, relatório "pacientes sem consulta" (temos
  `listarPacientesInativos` no service de relatórios — falta destacar).

## Decisões desta sessão (aplicadas nas tarefas seguintes)
1. Agenda vira tela inicial pós-login (paridade Codental).
2. Chat flutuante global (diferencial nosso).
3. Campanhas automáticas com preview de alcance (A campanha usa outbox + `scheduled_at`;
   RPC em lote resolve B3).
