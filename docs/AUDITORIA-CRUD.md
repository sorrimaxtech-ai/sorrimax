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

### A1 — Demo mode cobre 4 de 43 páginas ✅ ENDEREÇADO
Duas frentes resolvidas:
1. **Recomendação estrutural feita** (migration 0025): onboarding semeia "conta viva"
   (paciente exemplo + consulta + orçamento + débito) — dado REAL, não fake, como o Codental.
   A vitrine deixa de depender do demo furado.
2. **Bug sticky corrigido** (commit `bf5a2db`): o flag de demo em localStorage vazava pra
   conta real do dono. Agora sessão real sempre vence a demo e zera o flag.
O demo fake (`demoData`) fica só como vitrine leve pra visitante deslogado; não vale a pena
esticá-lo pras 43 páginas — o caminho é a conta viva semeada.

### A2 — Orçamento não tem ciclo de vida completo ✅ RESOLVIDO (lifecycle)
`cancelarOrcamento` marca `cancelado` (o "perdido" que faltava no funil) sem tocar débitos já
gerados; `excluirOrcamento` apaga **só rascunho sem vínculo** (senão manda cancelar — mesmo padrão
protetor da 0033), evitando levar junto o card do CRM (FK CASCADE). Ambos com UI em `OrcamentoEditor`.
Backlog menor: editar cabeçalho (profissional/convênio) depois de criado.

### A3 — `cancelarParcela` existe no service e nenhuma UI chama ✅ RESOLVIDO
Exposto no menu da parcela em `FinanceiroReceber.tsx`.

### B1 — Consultas: `excluirConsulta` é hard delete ✅ RESOLVIDO (migration 0033)
Trigger `consulta_protege_exclusao` (BEFORE DELETE) recusa apagar consulta já
atendida (em_atendimento/concluído/faltou) ou com registros clínicos/financeiros
vinculados, mandando **cancelar** para preservar histórico. Erro de lançamento
(agendamento futuro sem nada anexado) segue excluível. Vale pros dois code paths.

### B2 — Sem trilha de auditoria de ações ✅ RESOLVIDO (migration 0032)
`audit_log` + trigger `registrar_auditoria` em consultas/parcelas/orçamentos/pacientes
(DELETE e mudança de status), com tela **Ajustes → Atividades**. Responde "quem apagou?".

### B3 — WhatsApp: envio 1-a-1 apenas ✅ RESOLVIDO
O runner de campanha (migrations 0024/0026) insere direto em `whatsapp_outbox` com
`to_number` (clinica_id, instance_id, kind, payload, scheduled_at) — sem exigir chat
prévio. Envio em lote por número já é o caminho das campanhas e lembretes.

### C — Menores
- ~~`evolution.ts` vazio (resquício; remover).~~ **Falso alarme**: tem 406 linhas e é o
  `EvolutionService` usado por ConversationList, WhatsAppConnect, ChatWindow e CRM.tsx. Fica.
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
