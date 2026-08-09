import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Wallet, Loader2, BarChart3, ArrowLeftRight } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/services/orcamentos";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

// ============================================================================
// Fluxo de Caixa — previsto x realizado, mês a mês
// ----------------------------------------------------------------------------
// A fonte é a view vw_fluxo_caixa_mensal, que agrega PARCELAS por mês de
// vencimento. Duas leituras diferentes saem daí e não podem ser confundidas:
//   • previsto  = tudo que vence no mês (compromisso assumido)
//   • realizado = só o que tem status 'pago' (dinheiro que de fato circulou)
// A clínica quebra exatamente na distância entre os dois — por isso os KPIs
// mostram os dois números juntos, nunca só um.
// ============================================================================

type TipoLancamento = Database["public"]["Enums"]["tipo_lancamento"];
type StatusParcela = Database["public"]["Enums"]["status_parcela"];

interface LinhaView {
  mes: string | null;
  tipo: TipoLancamento | null;
  previsto: number | null;
  realizado: number | null;
  liquido: number | null;
  taxas: number | null;
  em_aberto: number | null;
}

interface Movimento {
  id: string;
  numero: number;
  valor: number;
  vencimento: string;
  status: StatusParcela;
  valor_pago: number | null;
  lancamentos: {
    descricao: string;
    tipo: TipoLancamento;
    categoria_id: string | null;
  } | null;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const MESES_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

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

const COR_RECEITA = "#00b4d8"; // azul Diamond — identidade do produto
const COR_DESPESA = "#dc2626"; // red-600

const dataBR = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");
const ultimoDiaDoMes = (ano: number, mes1a12: number) => new Date(ano, mes1a12, 0).getDate();
const compacto = (v: number) =>
  new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(v);

const FluxoCaixa = () => {
  const { clinicaId, carregando: carregandoCtx } = useTenant();

  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1); // 1..12
  const [modo, setModo] = useState<"realizado" | "previsto">("realizado");

  const [linhas, setLinhas] = useState<LinhaView[]>([]);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([]);
  const [carregando, setCarregando] = useState(true);

  const catNome = useMemo(() => new Map(categorias.map((c) => [c.id, c.nome])), [categorias]);

  const mesRef = `${ano}-${String(mes).padStart(2, "0")}`;
  const iniMes = `${mesRef}-01`;
  const fimMes = `${mesRef}-${String(ultimoDiaDoMes(ano, mes)).padStart(2, "0")}`;

  // Ano inteiro: alimenta o gráfico. O ano seguinte serve de limite superior exclusivo.
  useEffect(() => {
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; } // evita spinner eterno
    let vivo = true;
    setCarregando(true);
    (async () => {
      const [view, mov, cat] = await Promise.all([
        supabase.from("vw_fluxo_caixa_mensal")
          .select("mes, tipo, previsto, realizado, liquido, taxas, em_aberto")
          .eq("clinica_id", clinicaId)
          .gte("mes", `${ano}-01-01`)
          .lt("mes", `${ano + 1}-01-01`),
        supabase.from("lancamento_parcelas")
          .select("id, numero, valor, vencimento, status, valor_pago, lancamentos!inner(descricao, tipo, categoria_id)")
          .eq("clinica_id", clinicaId)
          .gte("vencimento", iniMes)
          .lte("vencimento", fimMes)
          .order("vencimento", { ascending: true }),
        supabase.from("categorias_financeiras").select("id, nome").eq("clinica_id", clinicaId),
      ]);
      if (!vivo) return;
      if (view.error) toast.error("Erro ao carregar fluxo de caixa", { description: view.error.message });
      if (mov.error) toast.error("Erro ao carregar movimentação", { description: mov.error.message });
      if (cat.error) toast.error("Erro ao carregar categorias", { description: cat.error.message });
      setLinhas((view.data ?? []) as unknown as LinhaView[]);
      setMovimentos((mov.data ?? []) as unknown as Movimento[]);
      setCategorias(cat.data ?? []);
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [clinicaId, carregandoCtx, ano, iniMes, fimMes]);

  // Série de 12 meses sempre completa: mês sem movimento vira zero, não some do eixo.
  const serie = useMemo(() => {
    const base = MESES_CURTO.map((rot, i) => ({
      rotulo: rot,
      chave: `${ano}-${String(i + 1).padStart(2, "0")}`,
      receita: 0,
      despesa: 0,
    }));
    const porChave = new Map(base.map((b) => [b.chave, b]));
    for (const l of linhas) {
      if (!l.mes || !l.tipo) continue;
      const alvo = porChave.get(String(l.mes).slice(0, 7));
      if (!alvo) continue;
      const v = Number((modo === "realizado" ? l.realizado : l.previsto) ?? 0);
      if (l.tipo === "receber") alvo.receita += v;
      else alvo.despesa += v;
    }
    return base;
  }, [linhas, ano, modo]);

  // "Sem movimentação" só é verdade quando NENHUM dos dois olhares tem número. Medir
  // isso pela série (que segue o `modo`) escondia o gráfico inteiro de uma clínica que
  // só tem parcelas a vencer — e afirmava "sem movimentação" com dinheiro comprometido.
  const temDadoNoAno = useMemo(
    () => linhas.some((l) => Number(l.previsto ?? 0) > 0 || Number(l.realizado ?? 0) > 0),
    [linhas],
  );
  const modoVazio = useMemo(
    () => !serie.some((s) => s.receita > 0 || s.despesa > 0),
    [serie],
  );

  const kpis = useMemo(() => {
    const doMes = linhas.filter((l) => String(l.mes ?? "").slice(0, 7) === mesRef);
    const agrega = (tipo: TipoLancamento) => {
      const ls = doMes.filter((l) => l.tipo === tipo);
      return {
        previsto: ls.reduce((s, l) => s + Number(l.previsto ?? 0), 0),
        realizado: ls.reduce((s, l) => s + Number(l.realizado ?? 0), 0),
        emAberto: ls.reduce((s, l) => s + Number(l.em_aberto ?? 0), 0),
      };
    };
    const receitas = agrega("receber");
    const despesas = agrega("pagar");
    return {
      receitas,
      despesas,
      saldo: {
        previsto: receitas.previsto - despesas.previsto,
        realizado: receitas.realizado - despesas.realizado,
        emAberto: receitas.emAberto - despesas.emAberto,
      },
    };
  }, [linhas, mesRef]);

  const anos = useMemo(() => {
    const atual = agora.getFullYear();
    return [atual + 1, atual, atual - 1, atual - 2];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ocupado = carregandoCtx || carregando;

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Wallet className="h-6 w-6 text-brand-600" /> Fluxo de Caixa
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                O que entrou, o que saiu e o que ainda vai vencer — previsto contra realizado.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!clinicaId && !carregandoCtx ? (
            <Card className="border-gray-100">
              <CardContent className="p-12 text-center">
                <Wallet className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                <p className="font-medium text-gray-800">Clínica não identificada</p>
                <p className="text-sm text-gray-500 mt-1">
                  Faça login novamente ou finalize o cadastro da clínica para ver o fluxo de caixa.
                </p>
              </CardContent>
            </Card>
          ) : ocupado ? (
            <Card className="border-gray-100">
              <CardContent className="p-12 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : (
            <>
              {/* KPIs do mês — previsto e realizado lado a lado, de propósito */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {[
                  {
                    rot: "Receitas", dados: kpis.receitas, cor: "text-brand-600",
                    sub: "recebido no mês",
                  },
                  {
                    rot: "Despesas", dados: kpis.despesas, cor: "text-red-600",
                    sub: "pago no mês",
                  },
                  {
                    rot: "Saldo", dados: kpis.saldo,
                    cor: kpis.saldo.realizado >= 0 ? "text-brand-600" : "text-red-600",
                    sub: "receitas menos despesas",
                  },
                ].map((k) => (
                  <Card key={k.rot} className="border-gray-100">
                    <CardContent className="p-5">
                      <p className="text-xs text-gray-500">{k.rot}</p>
                      <p className={`text-xl font-bold mt-0.5 ${k.cor}`}>{brl(k.dados.realizado)}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>
                      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs">
                        <span className="text-gray-500">
                          Previsto <span className="font-medium text-gray-700">{brl(k.dados.previsto)}</span>
                        </span>
                        <span className="text-gray-500">
                          Em aberto <span className="font-medium text-gray-700">{brl(k.dados.emAberto)}</span>
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Gráfico anual */}
              <Card className="border-gray-100 mb-6">
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-900">Receita x Despesa em {ano}</h2>
                      <p className="text-[11px] text-gray-400">
                        Parcelas agrupadas pelo mês de vencimento.
                      </p>
                    </div>
                    <Select value={modo} onValueChange={(v) => setModo(v as "realizado" | "previsto")}>
                      <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="realizado">Realizado (pago)</SelectItem>
                        <SelectItem value="previsto">Previsto (vencimento)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {!temDadoNoAno ? (
                    <div className="p-12 text-center">
                      <BarChart3 className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                      <p className="font-medium text-gray-800">Sem movimentação em {ano}</p>
                      <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                        O gráfico se preenche sozinho conforme orçamentos aprovados viram contas a
                        receber e despesas são lançadas em Contas a Pagar.
                      </p>
                    </div>
                  ) : (
                    <>
                    {modoVazio && (
                      <p className="text-[11px] text-amber-600 mb-2">
                        {modo === "realizado"
                          ? `Nada foi pago ainda em ${ano} — troque para "Previsto" para ver o que está comprometido.`
                          : `Nenhuma parcela vence em ${ano}.`}
                      </p>
                    )}
                    <div className="h-[320px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis dataKey="rotulo" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false}
                                 tickFormatter={(v: number) => compacto(v)} width={56} />
                          <Tooltip
                            formatter={(v: number, nome: string) => [brl(Number(v)), nome]}
                            labelFormatter={(l: string) => `${l}/${ano}`}
                            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          {/* animação desligada: com ela a barra some no primeiro render */}
                          <Bar dataKey="receita" name="Receita" fill={COR_RECEITA} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                          <Bar dataKey="despesa" name="Despesa" fill={COR_DESPESA} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Movimentação do período */}
              <Card className="border-gray-100">
                <CardContent className="p-0">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900">
                      Movimentação de {MESES[mes - 1]} de {ano}
                    </h2>
                    <p className="text-[11px] text-gray-400">
                      Cada parcela que vence no período, entrando ou saindo.
                    </p>
                  </div>

                  {movimentos.length === 0 ? (
                    <div className="p-12 text-center">
                      <ArrowLeftRight className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                      <p className="font-medium text-gray-800">Nenhuma movimentação neste mês</p>
                      <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                        Nenhuma parcela vence entre {dataBR(iniMes)} e {dataBR(fimMes)}. Troque o
                        período ou lance uma despesa em Contas a Pagar.
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
                            <th className="text-left font-medium px-4 py-3">Tipo</th>
                            <th className="text-right font-medium px-4 py-3">Valor</th>
                            <th className="text-left font-medium px-4 py-3">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {movimentos.map((m) => {
                            const receita = m.lancamentos?.tipo === "receber";
                            const cat = m.lancamentos?.categoria_id
                              ? catNome.get(m.lancamentos.categoria_id) ?? "—"
                              : "—";
                            return (
                              <tr key={m.id} className="border-b border-border/50 hover:bg-muted/40">
                                <td className="px-4 py-3 whitespace-nowrap">{dataBR(m.vencimento)}</td>
                                <td className="px-4 py-3 text-gray-900">{m.lancamentos?.descricao ?? "—"}</td>
                                <td className="px-4 py-3 text-gray-600">{cat}</td>
                                <td className="px-4 py-3">
                                  <Badge className={receita
                                    ? "bg-brand-100 text-brand-800 border-0"
                                    : "bg-red-100 text-red-800 border-0"}>
                                    {receita ? "Receita" : "Despesa"}
                                  </Badge>
                                </td>
                                <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${receita ? "text-brand-700" : "text-red-600"}`}>
                                  {receita ? "+" : "-"} {brl(Number(m.valor))}
                                </td>
                                <td className="px-4 py-3">
                                  <Badge className={STATUS_CLASSE[m.status]}>{STATUS_LABEL[m.status]}</Badge>
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
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default FluxoCaixa;
