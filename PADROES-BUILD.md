# Contrato de construção — VITTALHUB (leia ANTES de escrever código)

Projeto: `~/Downloads/vittalhub-master` · Vite + React 18 + TS + shadcn/ui + Supabase + TailwindCSS.
Idioma da UI: **português brasileiro**. Identidade: **verde esmeralda** (`emerald-600`).

## ⛔ REGRAS DURAS

1. **NÃO edite** `src/App.tsx`, `src/config/navegacao.ts`, `src/components/dashboard/Sidebar.tsx`,
   `src/integrations/supabase/types.ts`, `PADROES-BUILD.md`. O orquestrador cuida desses.
   Crie SOMENTE os arquivos da sua lista.
2. **PROIBIDO dado mockado/fictício.** Nada de "Maria Silva", array hardcoded, número inventado.
   Sem dado → **empty state honesto** explicando o que fazer.
3. **PROIBIDO segredo no cliente** (API key, token, senha). Credencial só em Edge Function.
4. Toda query filtra por `clinica_id` do `useTenant()`. Nunca `localStorage`.
5. Trate `error` de TODA chamada Supabase. Use `.maybeSingle()` (nunca `.single()` sem tratar).
6. `npx tsc --noEmit -p tsconfig.app.json` não pode ganhar erro novo nos SEUS arquivos.

## Esqueleto obrigatório de página

⚠️ **A moldura NÃO é da página.** `AppShell` (barra superior + barra lateral + abas do
módulo) envolve todas as rotas autenticadas via layout route. A página é só conteúdo —
**nunca** importe nem renderize `<Sidebar />`, e nunca use `min-h-screen`/`h-screen`
(some por baixo da barra superior e cria rolagem dupla). Use `min-h-full`/`h-full`.

Sub-navegação vira **aba** em `src/config/navegacao.ts`, não item novo na barra lateral.

```tsx
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const MinhaPagina = () => {
  const { clinicaId, carregando: carregandoCtx, isAdmin } = useTenant();
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; } // evita spinner eterno
    let vivo = true;
    (async () => {
      const { data, error } = await supabase.from("tabela").select("*").eq("clinica_id", clinicaId);
      if (!vivo) return;
      if (error) toast.error("Erro ao carregar", { description: error.message });
      else setLista(data ?? []);
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [clinicaId, carregandoCtx]);

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Icone className="h-6 w-6 text-emerald-600" /> Título
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">Subtítulo explicando o valor da tela.</p>
            </div>
            <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2">
              <Plus className="h-4 w-4" /> Ação principal
            </Button>
          </div>
          {/* conteúdo */}
        </div>
      </main>
    </div>
  );
};
export default MinhaPagina;
```

## Padrões visuais (siga à risca — consistência entre módulos)

- **Card**: `<Card className="border-gray-100">` + `<CardContent className="p-5">`
- **Botão primário**: `className="bg-emerald-600 hover:bg-emerald-700 gap-2"`
- **Tabela**: `<table className="w-full text-sm">`, thead `bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground`,
  linha `border-b border-border/50 hover:bg-muted/40`
- **KPI card**: rótulo `text-xs text-gray-500`, valor `text-xl font-bold`, sub `text-[11px] text-gray-400`
- **Badge de status**: `bg-{cor}-100 text-{cor}-800 border-0`
- **Loading**: `<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />` centralizado com `p-12`
- **Empty state**: ícone `h-10 w-10 text-gray-300` + título `font-medium text-gray-800` + explicação `text-sm text-gray-500`
- **Dinheiro**: `new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v ?? 0)`
- **Data**: `new Date(x).toLocaleDateString("pt-BR")`
- ⚠️ **Recharts**: SEMPRE `isAnimationActive={false}` (a animação trava a curva e o gráfico fica invisível)
- ⚠️ **Tailwind**: NUNCA classe montada em runtime (`bg-${cor}-500` não é gerada). Use mapa literal.

## Componentes shadcn disponíveis (`@/components/ui/*`)
`button card input label badge select dialog table tabs textarea checkbox switch popover calendar
dropdown-menu alert-dialog separator scroll-area sonner(toast) tooltip accordion avatar skeleton`

## Hooks e serviços existentes (REUSE, não recrie)
- `useTenant()` → `{ contexto, carregando, clinicaId, isAdmin, recarregar }`
- `useDemoMode()` → `{ isDemo, disableDemoMode }`
- `@/components/odontograma/Odontograma` → odontograma FDI clicável (props: `registros`, `denticaoInicial`,
  `onSelecionarDente`, `onSelecionarFace`, `onSelecionarRegiao`)
- `@/types/odonto` → `Denticao`, `FaceDental`, `RegistroOdontograma`, `DENTES_PERMANENTES`, `DENTES_DECIDUOS`
- `@/services/orcamentos` → `brl()`, `STATUS_LABEL`, `STATUS_CLASSE`, CRUD de orçamento
- `@/services/whatsapp/{realtime,send,status}` → chat
- `Database` type: `@/integrations/supabase/types` → `Database["public"]["Enums"]["nome_do_enum"]`

## Schema do banco (Supabase `irqlxtyvtpsnteqbdsix`) — TODAS as tabelas têm RLS por `clinica_id`

**Núcleo**: `clinicas` `profiles`(id=auth.uid, clinica_id, full_name, role admin|professional|receptionist)
`especialidades` `convenios`(nome,tipo particular|convenio) `pacientes`(nome_completo, celular, data_nascimento,
cpf, email, endereco…, convenio_id, alergias[], tags[], ativo)

**Clínico**: `procedimentos`(nome, codigo, especialidade, aplicacao dente|face|quadrante|arcada|boca|regiao|sem_dente,
duracao_min, valor, cor, buffer_antes_min, buffer_depois_min, modalidades[], ativo)
`procedimento_precos`(procedimento_id, convenio_id, valor, comissao_percentual, comissao_valor)
`procedimento_profissional`(procedimento_id, profissional_id, valor_override)
`cadeiras`(nome, cor, ativo) `disponibilidades`(profissional_id, dia_semana 0-6, hora_inicio, hora_fim,
intervalo_slot_min, vigencia_*) `bloqueios_agenda`(profissional_id?, inicio, fim, motivo)
`consultas`(paciente_id, profissional_id, servico_id→procedimentos, cadeira_id, inicio, fim, modalidade
presencial|online|domiciliar, status, valor, desconto, total, recorrencia_id, origem)
`recorrencias`(tipo diaria..anual, intervalo, qtd_repeticoes, dias_semana[])
`odontograma_registros`(paciente_id, denticao permanente|decidua, dente FDI, faces[], regiao, regiao_facial,
procedimento_id, estado planejado|em_execucao|finalizado|condicao, condicao, anotacao, orcamento_item_id)
`evolucoes`(paciente_id, consulta_id, profissional_id, conteudo, dentes[], **APPEND-ONLY**: só SELECT+INSERT)

**Comercial**: `orcamentos`(numero, paciente_id, convenio_id, status rascunho|aberto|aprovado_parcial|aprovado|
reprovado|expirado|cancelado, desconto, total_itens, total_aprovado) `orcamento_itens`(procedimento_id, dente,
faces[], regiao_facial, quantidade, valor_unitario, desconto, total, status pendente|aprovado|recusado)
`oportunidades`(origem lead|orcamento|manual|indicacao, lead_id, orcamento_id, etapa_id, valor, ganha_em, perdida_em)
`leads` `pipeline_stages` `regioes_faciais`(codigo, rotulo, grupo, ordem)

**Financeiro**: `contas_financeiras`(nome, tipo caixa|banco|carteira_digital, saldo_inicial, principal)
`categorias_financeiras`(nome, tipo receber|pagar, cor) `taxas_cartao`(adquirente, bandeira, parcelas_de/ate,
percentual, valor_fixo, prazo_dias) `lancamentos`(tipo receber|pagar, descricao, categoria_id, conta_id,
paciente_id, orcamento_id, consulta_id, profissional_id, valor_total, forma_pagamento, qtd_parcelas)
`lancamento_parcelas`(lancamento_id, numero, valor, vencimento, status pendente|pago|atrasado|cancelado|estornado,
pago_em, valor_pago, taxa_valor, valor_liquido, previsao_credito) `despesas_fixas`(descricao, valor,
dia_vencimento, categoria_id, ativo) `comissoes`(profissional_id, orcamento_item_id, parcela_id, base_calculo,
percentual, valor, status prevista|liberada|paga|cancelada)

**WhatsApp**: `whatsapp_instances`(provider uazapi|evolution|meta, instance_id, status, shared_external, webhook_mode)
`whatsapp_chats`(clinica_id, contact_phone, name, unread_count, assigned_to, tags[], archived_at)
`whatsapp_messages`(chat_id, content, from_me, status, message_type) `whatsapp_outbox`

**Views** (já com `security_invoker`): `vw_dashboard_kpis` `vw_funil_completo` `vw_faturamento_procedimento`
`vw_ocupacao_agenda` `vw_pacientes_inativos` `vw_comissoes_profissional` `vw_fluxo_caixa_mensal`

**RPCs**: `meu_contexto()` `criar_clinica_para_usuario(nome,tel,email)` `slots_disponiveis(prof,data,servico)`
`gerar_debitos_orcamento(orc,forma,parcelas,venc,conta)` `wa_enfileirar_texto(chat,texto)`
`wa_marcar_chat_lido(chat)` `auditoria_saude()`

## Como consultar/alterar o banco (só se sua tarefa pedir migration)

```bash
PAT="sbp_dd0433326eb64dde84af7941d9844327069a633d"
API="https://api.supabase.com/v1/projects/irqlxtyvtpsnteqbdsix/database/query"
q(){ python3 -c "import json,sys;print(json.dumps({'query':sys.argv[1]}))" "$1" > /tmp/q_$$.json
     curl -s "$API" -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
          -H "User-Agent: build/1" --data @/tmp/q_$$.json; }
q "select 1;"
```
⚠️ Cloudflare bloqueia `urllib` do Python — **use curl**. Toda tabela nova precisa de:
`select public.apply_tenant_rls('nome_tabela');` e `clinica_id uuid not null references clinicas(id) on delete cascade`.
Depois de criar tabela, rode `select * from public.auditoria_saude();` e garanta 0 FALHA.

## Definição de pronto
1. Arquivos criados conforme a lista da sua tarefa.
2. `npx tsc --noEmit -p tsconfig.app.json` sem erro NOVO nos seus arquivos.
3. `npx vite build` passa.
4. CRUD real contra o schema, com loading/empty/erro tratados.
5. Retorne um resumo curto: arquivos criados, tabelas usadas, o que ficou de fora.
