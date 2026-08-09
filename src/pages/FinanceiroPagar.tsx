import { traduzErro } from "@/lib/erros";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowDownCircle, Plus, Loader2, Receipt, Check, Undo2, Trash2, Pencil,
  RefreshCw, Repeat,
} from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/services/orcamentos";
import { DespesaFixaDialog, type DespesaFixa } from "@/components/financeiro/DespesaFixaDialog";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

// ============================================================================
// Contas a Pagar — o lado que ninguém quer olhar e que quebra a clínica
// ----------------------------------------------------------------------------
// Duas naturezas de despesa convivem aqui e NÃO são a mesma coisa:
//   • lançamento avulso  → compra pontual, pode ter N parcelas (fornecedor, equipamento)
//   • despesa fixa       → molde recorrente (aluguel, salário); não é dinheiro até
//                          ser "gerada" como lançamento+parcela do mês
// A tabela de cima mostra SÓ parcelas reais. A aba de despesas fixas mostra moldes.
// ============================================================================

type StatusParcela = Database["public"]["Enums"]["status_parcela"];
type FormaPagamento = Database["public"]["Enums"]["forma_pagamento"];

interface ParcelaPagar {
  id: string;
  lancamento_id: string;
  numero: number;
  valor: number;
  vencimento: string;
  status: StatusParcela;
  pago_em: string | null;
  valor_pago: number | null;
  lancamentos: {
    descricao: string;
    categoria_id: string | null;
    qtd_parcelas: number;
  } | null;
}

const STATUS_LABEL: Record<StatusParcela, string> = {
  pendente: "Pendente",
  pago: "Pago",
  atrasado: "Atrasado",
  cancelado: "Cancelado",
  estornado: "Estornado",
};

// Mapa literal: Tailwind não gera classe montada em runtime.
const STATUS_CLASSE: Record<StatusParcela, string> = {
  pendente: "bg-amber-100 text-amber-800 border-0",
  pago: "bg-emerald-100 text-emerald-800 border-0",
  atrasado: "bg-red-100 text-red-800 border-0",
  cancelado: "bg-gray-100 text-gray-700 border-0",
  estornado: "bg-sky-100 text-sky-800 border-0",
};

const FORMAS: { valor: FormaPagamento; rotulo: string }[] = [
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "pix", rotulo: "PIX" },
  { valor: "debito", rotulo: "Cartão de débito" },
  { valor: "credito", rotulo: "Cartão de crédito" },
  { valor: "boleto", rotulo: "Boleto" },
  { valor: "transferencia", rotulo: "Transferência" },
  { valor: "cheque", rotulo: "Cheque" },
];

const NENHUMA = "__nenhuma__"; // Select do shadcn rejeita value=""

/** UPDATE/DELETE barrado por RLS no PostgREST NÃO retorna erro — afeta 0 linhas em silêncio.
 *  Sem conferir as linhas devolvidas, a tela dizia "pago" para algo que nunca mudou no banco. */
const SEM_PERMISSAO = "O registro não existe mais ou você não tem permissão nesta clínica.";

/** Data de HOJE no fuso do usuário, em YYYY-MM-DD.
 *  `toISOString()` devolve UTC: em BRT (UTC-3), das 21h em diante ele já retorna o dia
 *  seguinte — o que gravava `pago_em` no futuro e marcava como "em atraso" parcela que
 *  vence hoje. Data financeira tem que seguir o calendário de quem opera a clínica. */
const hojeISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const mesAtual = () => hojeISO().slice(0, 7);
const dataBR = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");

const ultimoDiaDoMes = (ym: string) => {
  const [ano, mes] = ym.split("-").map(Number);
  return new Date(ano, mes, 0).getDate(); // dia 0 do mês seguinte = último deste
};
const inicioDoMes = (ym: string) => `${ym}-01`;
const fimDoMes = (ym: string) => `${ym}-${String(ultimoDiaDoMes(ym)).padStart(2, "0")}`;

/** Soma meses preservando o dia, encolhendo para o último dia quando não existe (31 → 30/28). */
const somarMeses = (iso: string, n: number) => {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const alvo = new Date(ano, mes - 1 + n, 1);
  const ym = `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}`;
  return `${ym}-${String(Math.min(dia, ultimoDiaDoMes(ym))).padStart(2, "0")}`;
};

/**
 * Divide o total em N parcelas em centavos e joga a sobra na última.
 * Dividir em float faz 100/3 virar 3x 33,33 = 99,99 — some 1 centavo por lançamento.
 */
const dividirParcelas = (total: number, n: number): number[] => {
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / n);
  const parcelas = Array(n).fill(base);
  parcelas[n - 1] = centavos - base * (n - 1);
  return parcelas.map((c) => c / 100);
};

/** Marca de origem gravada em `lancamentos.observacoes`. Não existe FK despesa_fixa→lançamento,
 *  então é essa tag que impede gerar o mesmo aluguel duas vezes no mesmo mês. */
const tagDespesaFixa = (despesaId: string, ym: string) => `[despesa_fixa:${despesaId}:${ym}]`;

const FinanceiroPagar = () => {
  const { clinicaId, carregando: carregandoCtx } = useTenant();

  const [mesRef, setMesRef] = useState(mesAtual());
  const [parcelas, setParcelas] = useState<ParcelaPagar[]>([]);
  const [despesasFixas, setDespesasFixas] = useState<DespesaFixa[]>([]);
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([]);
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const [abrirNova, setAbrirNova] = useState(false);
  const [abrirFixa, setAbrirFixa] = useState(false);
  const [fixaEditando, setFixaEditando] = useState<DespesaFixa | null>(null);
  const [gerando, setGerando] = useState(false);
  const [excluirLancamento, setExcluirLancamento] = useState<ParcelaPagar | null>(null);
  const [excluirFixa, setExcluirFixa] = useState<DespesaFixa | null>(null);

  const catNome = useMemo(
    () => new Map(categorias.map((c) => [c.id, c.nome])),
    [categorias],
  );

  const carregarParcelas = useCallback(async () => {
    if (!clinicaId) return;
    const { data, error } = await supabase
      .from("lancamento_parcelas")
      .select("id, lancamento_id, numero, valor, vencimento, status, pago_em, valor_pago, lancamentos!inner(descricao, categoria_id, qtd_parcelas, tipo)")
      .eq("clinica_id", clinicaId)
      .eq("lancamentos.tipo", "pagar")
      .gte("vencimento", inicioDoMes(mesRef))
      .lte("vencimento", fimDoMes(mesRef))
      .order("vencimento", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar contas a pagar", { description: traduzErro(error) });
      return;
    }
    setParcelas((data ?? []) as unknown as ParcelaPagar[]);
  }, [clinicaId, mesRef]);

  const carregarFixas = useCallback(async () => {
    if (!clinicaId) return;
    const { data, error } = await supabase
      .from("despesas_fixas")
      .select("id, descricao, valor, dia_vencimento, categoria_id, conta_id, inicio, fim, ativo")
      .eq("clinica_id", clinicaId)
      .order("descricao");
    if (error) {
      toast.error("Erro ao carregar despesas fixas", { description: traduzErro(error) });
      return;
    }
    setDespesasFixas((data ?? []) as DespesaFixa[]);
  }, [clinicaId]);

  useEffect(() => {
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; } // evita spinner eterno
    let vivo = true;
    setCarregando(true);
    (async () => {
      const [cat, ct] = await Promise.all([
        supabase.from("categorias_financeiras").select("id, nome")
          .eq("clinica_id", clinicaId).eq("tipo", "pagar").eq("ativo", true).order("nome"),
        supabase.from("contas_financeiras").select("id, nome")
          .eq("clinica_id", clinicaId).eq("ativo", true).order("nome"),
      ]);
      if (!vivo) return;
      if (cat.error) toast.error("Erro ao carregar categorias", { description: traduzErro(cat.error) });
      if (ct.error) toast.error("Erro ao carregar contas", { description: traduzErro(ct.error) });
      setCategorias(cat.data ?? []);
      setContas(ct.data ?? []);
      await Promise.all([carregarParcelas(), carregarFixas()]);
      if (vivo) setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [clinicaId, carregandoCtx, carregarParcelas, carregarFixas]);

  // ------------------------------------------------------------------ KPIs
  const kpis = useMemo(() => {
    const hoje = hojeISO();
    const vivas = parcelas.filter((p) => p.status !== "cancelado" && p.status !== "estornado");
    const pago = vivas.filter((p) => p.status === "pago")
      .reduce((s, p) => s + Number(p.valor_pago ?? p.valor), 0);
    const aPagar = vivas.filter((p) => p.status !== "pago")
      .reduce((s, p) => s + Number(p.valor), 0);
    const atraso = vivas.filter((p) => p.status !== "pago" && p.vencimento < hoje)
      .reduce((s, p) => s + Number(p.valor), 0);
    const previsto = vivas.reduce((s, p) => s + Number(p.valor), 0);
    return { pago, aPagar, atraso, previsto };
  }, [parcelas]);

  const visiveis = useMemo(() => {
    if (filtroStatus === "todos") return parcelas;
    if (filtroStatus === "atraso") {
      const hoje = hojeISO();
      return parcelas.filter((p) => p.status !== "pago" && p.status !== "cancelado" && p.vencimento < hoje);
    }
    // "Em aberto" precisa incluir 'atrasado': o cron marcar_parcelas_atrasadas() vira
    // pendente→atrasado no banco, e filtrar só por 'pendente' sumiria com as vencidas.
    if (filtroStatus === "aberto") {
      return parcelas.filter((p) => p.status === "pendente" || p.status === "atrasado");
    }
    return parcelas.filter((p) => p.status === filtroStatus);
  }, [parcelas, filtroStatus]);

  // --------------------------------------------------------------- ações
  const marcarPago = async (p: ParcelaPagar) => {
    if (!clinicaId) return;
    const { data, error } = await supabase.from("lancamento_parcelas")
      .update({ status: "pago", pago_em: hojeISO(), valor_pago: p.valor })
      .eq("id", p.id).eq("clinica_id", clinicaId).select("id");
    if (error) { toast.error("Erro ao marcar como pago", { description: traduzErro(error) }); return; }
    if (!data?.length) { toast.error("Nada foi alterado", { description: SEM_PERMISSAO }); return; }
    toast.success("Parcela marcada como paga");
    carregarParcelas();
  };

  const desfazerPagamento = async (p: ParcelaPagar) => {
    if (!clinicaId) return;
    const { data, error } = await supabase.from("lancamento_parcelas")
      .update({ status: "pendente", pago_em: null, valor_pago: null })
      .eq("id", p.id).eq("clinica_id", clinicaId).select("id");
    if (error) { toast.error("Erro ao desfazer pagamento", { description: traduzErro(error) }); return; }
    if (!data?.length) { toast.error("Nada foi alterado", { description: SEM_PERMISSAO }); return; }
    toast.success("Pagamento desfeito");
    carregarParcelas();
  };

  const confirmarExclusaoLancamento = async () => {
    if (!clinicaId || !excluirLancamento) return;
    const { data, error } = await supabase.from("lancamentos")
      .delete().eq("id", excluirLancamento.lancamento_id).eq("clinica_id", clinicaId).select("id");
    setExcluirLancamento(null);
    if (error) { toast.error("Erro ao excluir lançamento", { description: traduzErro(error) }); return; }
    if (!data?.length) { toast.error("Nada foi excluído", { description: SEM_PERMISSAO }); return; }
    toast.success("Lançamento excluído");
    carregarParcelas();
  };

  const confirmarExclusaoFixa = async () => {
    if (!clinicaId || !excluirFixa) return;
    const { data, error } = await supabase.from("despesas_fixas")
      .delete().eq("id", excluirFixa.id).eq("clinica_id", clinicaId).select("id");
    setExcluirFixa(null);
    if (error) { toast.error("Erro ao excluir despesa fixa", { description: traduzErro(error) }); return; }
    if (!data?.length) { toast.error("Nada foi excluído", { description: SEM_PERMISSAO }); return; }
    toast.success("Despesa fixa excluída");
    carregarFixas();
  };

  /** Materializa as despesas fixas vigentes do mês selecionado como lançamento + parcela. */
  const gerarDoMes = async () => {
    if (!clinicaId) return;
    const ini = inicioDoMes(mesRef);
    const fim = fimDoMes(mesRef);

    const candidatas = despesasFixas.filter(
      (d) => d.ativo && d.inicio <= fim && (!d.fim || d.fim >= ini),
    );
    if (candidatas.length === 0) {
      toast.info("Nada a gerar", { description: "Nenhuma despesa fixa ativa vigente neste mês." });
      return;
    }

    setGerando(true);
    try {
      const { data: existentes, error: erroExist } = await supabase
        .from("lancamentos").select("observacoes")
        .eq("clinica_id", clinicaId).eq("tipo", "pagar")
        .like("observacoes", `%:${mesRef}]%`);
      if (erroExist) throw erroExist;

      const jaGerados = new Set((existentes ?? []).map((l) => l.observacoes ?? ""));
      const pendentes = candidatas.filter(
        (d) => ![...jaGerados].some((obs) => obs.includes(tagDespesaFixa(d.id, mesRef))),
      );
      if (pendentes.length === 0) {
        toast.info("Tudo já gerado", { description: "As despesas fixas deste mês já viraram contas a pagar." });
        return;
      }

      const ultimo = ultimoDiaDoMes(mesRef);
      const novos = pendentes.map((d) => ({
        clinica_id: clinicaId,
        tipo: "pagar" as const,
        descricao: d.descricao,
        categoria_id: d.categoria_id,
        conta_id: d.conta_id,
        valor_total: Number(d.valor),
        qtd_parcelas: 1,
        observacoes: tagDespesaFixa(d.id, mesRef),
      }));

      const { data: criados, error: erroIns } = await supabase
        .from("lancamentos").insert(novos).select("id, observacoes");
      if (erroIns) throw erroIns;

      const idsCriados = (criados ?? []).map((l) => l.id);
      const parcelasNovas = (criados ?? []).flatMap((l) => {
        const origem = pendentes.find((d) => l.observacoes === tagDespesaFixa(d.id, mesRef));
        if (!origem) return []; // nunca deveria acontecer; melhor pular que estourar a tela
        const dia = Math.min(origem.dia_vencimento, ultimo);
        return [{
          clinica_id: clinicaId,
          lancamento_id: l.id,
          numero: 1,
          valor: Number(origem.valor),
          vencimento: `${mesRef}-${String(dia).padStart(2, "0")}`,
          conta_id: origem.conta_id,
        }];
      });

      const { error: erroParc } = await supabase.from("lancamento_parcelas").insert(parcelasNovas);
      // Órfão aqui é pior que no avulso: o lançamento carrega a marca de idempotência,
      // então o próximo clique responderia "tudo já gerado" e o aluguel do mês sumiria
      // sem nunca ter virado parcela. Desfaz os lançamentos criados neste clique.
      if (erroParc) {
        if (idsCriados.length) {
          await supabase.from("lancamentos").delete().in("id", idsCriados).eq("clinica_id", clinicaId);
        }
        throw erroParc;
      }

      toast.success(`${pendentes.length} lançamento(s) gerado(s)`, {
        description: "As parcelas já aparecem na lista de contas a pagar.",
      });
      carregarParcelas();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao gerar lançamentos", { description: msg });
    } finally {
      setGerando(false);
    }
  };

  const emAtraso = (p: ParcelaPagar) =>
    p.status !== "pago" && p.status !== "cancelado" && p.status !== "estornado" && p.vencimento < hojeISO();

  const ocupado = carregandoCtx || carregando;

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <ArrowDownCircle className="h-6 w-6 text-brand-600" /> Contas a Pagar
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                Tudo que sai do caixa: compras pontuais e as despesas fixas do mês.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input type="month" value={mesRef} onChange={(e) => setMesRef(e.target.value || mesAtual())}
                     className="w-[160px]" aria-label="Mês de referência" />
              <Button onClick={() => setAbrirNova(true)} className="bg-brand-600 hover:bg-brand-700 gap-2">
                <Plus className="h-4 w-4" /> Nova despesa
              </Button>
            </div>
          </div>

          {!clinicaId && !carregandoCtx ? (
            <Card className="border-gray-100">
              <CardContent className="p-12 text-center">
                <Receipt className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                <p className="font-medium text-gray-800">Clínica não identificada</p>
                <p className="text-sm text-gray-500 mt-1">
                  Faça login novamente ou finalize o cadastro da clínica para usar o financeiro.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[
                  { rot: "Pago no mês", val: brl(kpis.pago), cor: "text-emerald-600", sub: "já saiu do caixa" },
                  { rot: "A pagar no mês", val: brl(kpis.aPagar), cor: "text-amber-600", sub: "ainda em aberto" },
                  { rot: "Em atraso", val: brl(kpis.atraso), cor: "text-red-600", sub: "vencidas e não pagas" },
                  { rot: "Total previsto", val: brl(kpis.previsto), cor: "text-gray-900", sub: "compromisso do mês" },
                ].map((k) => (
                  <Card key={k.rot} className="border-gray-100">
                    <CardContent className="p-5">
                      <p className="text-xs text-gray-500">{k.rot}</p>
                      <p className={`text-xl font-bold mt-0.5 ${k.cor}`}>{k.val}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Tabs defaultValue="parcelas">
                <TabsList className="mb-4">
                  <TabsTrigger value="parcelas">Contas do mês</TabsTrigger>
                  <TabsTrigger value="fixas">Despesas fixas</TabsTrigger>
                </TabsList>

                {/* ------------------------------------------------ parcelas */}
                <TabsContent value="parcelas">
                  <div className="flex justify-end mb-3">
                    <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                      <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos os status</SelectItem>
                        <SelectItem value="aberto">Em aberto</SelectItem>
                        <SelectItem value="pago">Pago</SelectItem>
                        <SelectItem value="atraso">Vencidas em aberto</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Card className="border-gray-100">
                    <CardContent className="p-0">
                      {ocupado ? (
                        <div className="p-12 flex justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : visiveis.length === 0 ? (
                        <div className="p-12 text-center">
                          <Receipt className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                          <p className="font-medium text-gray-800">
                            {parcelas.length === 0 ? "Nenhuma conta a pagar neste mês" : "Nada com esse filtro"}
                          </p>
                          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                            {parcelas.length === 0
                              ? "Cadastre uma despesa avulsa ou gere as despesas fixas do mês na aba ao lado."
                              : "Troque o status ou o mês de referência."}
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                              <tr>
                                <th className="text-left font-medium px-4 py-3">Vencimento</th>
                                <th className="text-left font-medium px-4 py-3">Descrição</th>
                                <th className="text-left font-medium px-4 py-3">Categoria</th>
                                <th className="text-right font-medium px-4 py-3">Valor</th>
                                <th className="text-left font-medium px-4 py-3">Status</th>
                                <th className="text-right font-medium px-4 py-3">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visiveis.map((p) => {
                                const atrasada = emAtraso(p);
                                const status: StatusParcela = atrasada ? "atrasado" : p.status;
                                const cat = p.lancamentos?.categoria_id
                                  ? catNome.get(p.lancamentos.categoria_id) ?? "—"
                                  : "—";
                                const total = p.lancamentos?.qtd_parcelas ?? 1;
                                return (
                                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/40">
                                    <td className={`px-4 py-3 whitespace-nowrap ${atrasada ? "text-red-600 font-medium" : ""}`}>
                                      {dataBR(p.vencimento)}
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className="text-gray-900">{p.lancamentos?.descricao ?? "—"}</span>
                                      {total > 1 && (
                                        <span className="text-xs text-gray-400 ml-1.5">{p.numero}/{total}</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">{cat}</td>
                                    <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                                      {brl(Number(p.valor))}
                                    </td>
                                    <td className="px-4 py-3">
                                      <Badge className={STATUS_CLASSE[status]}>{STATUS_LABEL[status]}</Badge>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center justify-end gap-1">
                                        {p.status === "pago" ? (
                                          <Button size="sm" variant="ghost" className="gap-1.5"
                                                  onClick={() => desfazerPagamento(p)}>
                                            <Undo2 className="h-3.5 w-3.5" /> Desfazer
                                          </Button>
                                        ) : (
                                          <Button size="sm" variant="ghost"
                                                  className="gap-1.5 text-brand-700 hover:text-brand-800"
                                                  onClick={() => marcarPago(p)}>
                                            <Check className="h-3.5 w-3.5" /> Marcar pago
                                          </Button>
                                        )}
                                        <Button size="sm" variant="ghost"
                                                className="text-red-600 hover:text-red-700"
                                                onClick={() => setExcluirLancamento(p)}
                                                aria-label="Excluir lançamento">
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* -------------------------------------------- despesas fixas */}
                <TabsContent value="fixas">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                    <p className="text-sm text-gray-600">
                      Moldes recorrentes. Só viram dinheiro quando geradas como conta do mês.
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" className="gap-2" onClick={gerarDoMes}
                              disabled={gerando || ocupado}>
                        {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Gerar lançamentos do mês
                      </Button>
                      <Button className="bg-brand-600 hover:bg-brand-700 gap-2"
                              onClick={() => { setFixaEditando(null); setAbrirFixa(true); }}>
                        <Plus className="h-4 w-4" /> Nova despesa fixa
                      </Button>
                    </div>
                  </div>

                  <Card className="border-gray-100">
                    <CardContent className="p-0">
                      {ocupado ? (
                        <div className="p-12 flex justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : despesasFixas.length === 0 ? (
                        <div className="p-12 text-center">
                          <Repeat className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                          <p className="font-medium text-gray-800">Nenhuma despesa fixa cadastrada</p>
                          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                            Aluguel, salários, software, contador. Cadastre uma vez e gere as contas
                            do mês com um clique, sem digitar de novo.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                              <tr>
                                <th className="text-left font-medium px-4 py-3">Descrição</th>
                                <th className="text-left font-medium px-4 py-3">Categoria</th>
                                <th className="text-center font-medium px-4 py-3">Dia</th>
                                <th className="text-right font-medium px-4 py-3">Valor</th>
                                <th className="text-left font-medium px-4 py-3">Situação</th>
                                <th className="text-right font-medium px-4 py-3">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {despesasFixas.map((d) => (
                                <tr key={d.id} className="border-b border-border/50 hover:bg-muted/40">
                                  <td className="px-4 py-3 text-gray-900">{d.descricao}</td>
                                  <td className="px-4 py-3 text-gray-600">
                                    {d.categoria_id ? catNome.get(d.categoria_id) ?? "—" : "—"}
                                  </td>
                                  <td className="px-4 py-3 text-center text-gray-600">{d.dia_vencimento}</td>
                                  <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                                    {brl(Number(d.valor))}
                                  </td>
                                  <td className="px-4 py-3">
                                    <Badge className={d.ativo
                                      ? "bg-brand-100 text-brand-800 border-0"
                                      : "bg-gray-100 text-gray-700 border-0"}>
                                      {d.ativo ? "Ativa" : "Inativa"}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center justify-end gap-1">
                                      <Button size="sm" variant="ghost" aria-label="Editar despesa fixa"
                                              onClick={() => { setFixaEditando(d); setAbrirFixa(true); }}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button size="sm" variant="ghost" aria-label="Excluir despesa fixa"
                                              className="text-red-600 hover:text-red-700"
                                              onClick={() => setExcluirFixa(d)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </main>

      <NovaDespesaDialog
        aberto={abrirNova}
        onFechar={() => setAbrirNova(false)}
        onCriado={() => { setAbrirNova(false); carregarParcelas(); }}
        categorias={categorias}
        contas={contas}
      />

      <DespesaFixaDialog
        aberto={abrirFixa}
        despesa={fixaEditando}
        onFechar={() => { setAbrirFixa(false); setFixaEditando(null); }}
        onSalvo={carregarFixas}
      />

      <AlertDialog open={!!excluirLancamento} onOpenChange={(o) => { if (!o) setExcluirLancamento(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              "{excluirLancamento?.lancamentos?.descricao}" será removido junto com TODAS as suas
              parcelas, inclusive de outros meses. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={confirmarExclusaoLancamento}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!excluirFixa} onOpenChange={(o) => { if (!o) setExcluirFixa(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir despesa fixa?</AlertDialogTitle>
            <AlertDialogDescription>
              "{excluirFixa?.descricao}" deixa de existir como molde. Os lançamentos já gerados nos
              meses anteriores continuam intactos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={confirmarExclusaoFixa}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ============================================================================
// Nova despesa avulsa — lançamento + N parcelas mensais
// ============================================================================
interface NovaDespesaProps {
  aberto: boolean;
  onFechar: () => void;
  onCriado: () => void;
  categorias: { id: string; nome: string }[];
  contas: { id: string; nome: string }[];
}

const NovaDespesaDialog = ({ aberto, onFechar, onCriado, categorias, contas }: NovaDespesaProps) => {
  const { clinicaId } = useTenant();
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [qtdParcelas, setQtdParcelas] = useState("1");
  const [vencimento, setVencimento] = useState(hojeISO());
  const [categoriaId, setCategoriaId] = useState(NENHUMA);
  const [contaId, setContaId] = useState(NENHUMA);
  const [forma, setForma] = useState<string>(NENHUMA);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setDescricao(""); setValor(""); setQtdParcelas("1"); setVencimento(hojeISO());
    setCategoriaId(NENHUMA); setContaId(NENHUMA); setForma(NENHUMA);
  }, [aberto]);

  const salvar = async () => {
    if (!clinicaId) { toast.error("Clínica não identificada"); return; }
    const total = Number(valor.replace(",", "."));
    const n = Number(qtdParcelas);
    if (!descricao.trim()) { toast.error("Revise o formulário", { description: "Informe a descrição da despesa." }); return; }
    if (!Number.isFinite(total) || total <= 0) { toast.error("Revise o formulário", { description: "Valor deve ser maior que zero." }); return; }
    if (!Number.isInteger(n) || n < 1 || n > 60) { toast.error("Revise o formulário", { description: "Parcelas entre 1 e 60." }); return; }
    if (!vencimento) { toast.error("Revise o formulário", { description: "Informe o vencimento da 1ª parcela." }); return; }

    setSalvando(true);
    try {
      const { data: lanc, error: erroLanc } = await supabase.from("lancamentos").insert({
        clinica_id: clinicaId,
        tipo: "pagar" as const,
        descricao: descricao.trim(),
        categoria_id: categoriaId === NENHUMA ? null : categoriaId,
        conta_id: contaId === NENHUMA ? null : contaId,
        valor_total: total,
        qtd_parcelas: n,
        forma_pagamento: forma === NENHUMA ? null : (forma as FormaPagamento),
      }).select("id").maybeSingle();
      if (erroLanc) throw erroLanc;
      if (!lanc) throw new Error("O lançamento não foi criado — verifique suas permissões na clínica.");

      const valores = dividirParcelas(total, n);
      const { error: erroParc } = await supabase.from("lancamento_parcelas").insert(
        valores.map((v, i) => ({
          clinica_id: clinicaId,
          lancamento_id: lanc.id,
          numero: i + 1,
          valor: v,
          vencimento: somarMeses(vencimento, i),
          conta_id: contaId === NENHUMA ? null : contaId,
          forma_pagamento: forma === NENHUMA ? null : (forma as FormaPagamento),
        })),
      );
      // Sem transação no PostgREST: se as parcelas falharem, o lançamento órfão fica
      // invisível (a tela lista PARCELAS) e nunca mais é editável. Desfaz na mão.
      if (erroParc) {
        await supabase.from("lancamentos").delete().eq("id", lanc.id).eq("clinica_id", clinicaId);
        throw erroParc;
      }

      toast.success("Despesa lançada", { description: n > 1 ? `${n} parcelas criadas.` : undefined });
      onCriado();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao lançar despesa", { description: msg });
    } finally {
      setSalvando(false);
    }
  };

  const previa = useMemo(() => {
    const total = Number(valor.replace(",", "."));
    const n = Number(qtdParcelas);
    if (!Number.isFinite(total) || total <= 0 || !Number.isInteger(n) || n < 1) return null;
    const vs = dividirParcelas(total, n);
    return n === 1 ? null : `${n}x de ${brl(vs[0])} (última ${brl(vs[n - 1])})`;
  }, [valor, qtdParcelas]);

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova despesa</DialogTitle>
          <DialogDescription>
            Compra ou conta pontual. Para algo que se repete todo mês, use "Despesas fixas".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nd-desc">Descrição *</Label>
            <Input id="nd-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)}
                   placeholder="Ex.: Compra de resina composta" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoriaId} onValueChange={setCategoriaId}>
                <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NENHUMA}>Sem categoria</SelectItem>
                  {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Conta de saída</Label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger><SelectValue placeholder="Sem conta" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NENHUMA}>Sem conta</SelectItem>
                  {contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nd-valor">Valor total (R$) *</Label>
              <Input id="nd-valor" inputMode="decimal" value={valor}
                     onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nd-parcelas">Parcelas *</Label>
              <Input id="nd-parcelas" type="number" min={1} max={60} value={qtdParcelas}
                     onChange={(e) => setQtdParcelas(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nd-venc">1º vencimento *</Label>
              <Input id="nd-venc" type="date" value={vencimento}
                     onChange={(e) => setVencimento(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Forma de pagamento</Label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger><SelectValue placeholder="Não informada" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUMA}>Não informada</SelectItem>
                {FORMAS.map((f) => <SelectItem key={f.valor} value={f.valor}>{f.rotulo}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {previa && <p className="text-xs text-gray-500">Serão criadas {previa}, uma por mês.</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="bg-brand-600 hover:bg-brand-700 gap-2">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Lançar despesa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FinanceiroPagar;
