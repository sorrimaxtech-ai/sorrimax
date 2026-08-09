import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BarChart3, Loader2, AlertTriangle, FileText, CalendarHeart, Wallet, TrendingUp,
  Filter, MessageCircle, UserX, RotateCcw, Users, Target, Info,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import { FunilJornada } from "@/components/relatorios/FunilJornada";
import {
  carregarKpis, faturamentoPorProcedimento, ocupacaoPorMes, listarPacientesInativos,
  carregarFunil, intervaloDoPeriodo, brl, pct, dataBR, linkWhatsApp, mensagemErro,
  PERIODO_LABEL,
  type PeriodoChave, type KpisDinheiro, type FaturamentoProcedimento,
  type OcupacaoMes, type PacienteInativo, type Funil,
} from "@/services/relatorios";

// ============================================================================
// Indicadores — o painel que responde "onde está o dinheiro parado"
// ----------------------------------------------------------------------------
// Duas decisões que valem explicação:
//
// 1. Os KPIs do topo NÃO respeitam o seletor de período. `vw_dashboard_kpis` é
//    uma foto do agora (atraso hoje, orçamento aberto hoje, mês corrente). Um
//    "débito em atraso de março" não existe — ou está em atraso agora, ou não.
//    O período filtra o que é série histórica: faturamento, ocupação e funil.
//
// 2. Paciente inativo também ignora o período: a view já define inativo como
//    ">6 meses sem vir". Cruzar isso com "últimos 3 meses" devolveria lista
//    vazia por construção.
// ============================================================================

const TOPO_PROCEDIMENTOS = 12;

/** Mensagem de reativação. Sai como rascunho no WhatsApp — quem envia é a pessoa. */
function mensagemReativacao(nome: string, temAberto: boolean) {
  const primeiro = nome.trim().split(/\s+/)[0] || nome;
  const base = `Olá, ${primeiro}! Aqui é da clínica. Notamos que faz um tempo desde a sua última consulta e queremos saber como você está.`;
  return temAberto
    ? `${base} Você tem um tratamento em aberto por aqui — quer que eu veja um horário pra retomarmos?`
    : `${base} Quer que eu veja um horário pra sua avaliação de retorno?`;
}

interface KpiProps {
  rotulo: string;
  valor: string;
  sub: string;
  Icone: React.ElementType;
  destaque?: "alerta" | "neutro" | "positivo";
}

const CLASSE_DESTAQUE = {
  alerta: "text-red-600",
  neutro: "text-gray-900",
  positivo: "text-emerald-600",
} as const;

const KpiCard = ({ rotulo, valor, sub, Icone, destaque = "neutro" }: KpiProps) => (
  <Card className="border-gray-100">
    <CardContent className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">{rotulo}</p>
          <p className={`text-xl font-bold mt-1 ${CLASSE_DESTAQUE[destaque]}`}>{valor}</p>
          <p className="text-[11px] text-gray-400 mt-1">{sub}</p>
        </div>
        <Icone className="h-5 w-5 text-brand-600 shrink-0" />
      </div>
    </CardContent>
  </Card>
);

const Vazio = ({ Icone, titulo, texto }: { Icone: React.ElementType; titulo: string; texto: string }) => (
  <div className="flex flex-col items-center text-center py-10 px-4">
    <Icone className="h-10 w-10 text-gray-300" />
    <p className="font-medium text-gray-800 mt-3">{titulo}</p>
    <p className="text-sm text-gray-500 mt-1 max-w-md">{texto}</p>
  </div>
);

const Relatorios = () => {
  const { clinicaId, carregando: carregandoCtx } = useTenant();

  const [periodo, setPeriodo] = useState<PeriodoChave>("6m");
  const [carregando, setCarregando] = useState(true);
  const [kpis, setKpis] = useState<KpisDinheiro | null>(null);
  const [faturamento, setFaturamento] = useState<FaturamentoProcedimento[]>([]);
  const [ocupacao, setOcupacao] = useState<OcupacaoMes[]>([]);
  const [inativos, setInativos] = useState<PacienteInativo[]>([]);
  const [funil, setFunil] = useState<Funil | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aContatar, setAContatar] = useState<PacienteInativo | null>(null);

  const intervalo = useMemo(() => intervaloDoPeriodo(periodo), [periodo]);

  const carregar = useCallback(async () => {
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; }
    setCarregando(true);
    setErro(null);
    try {
      const [k, f, o, i, fn] = await Promise.all([
        carregarKpis(clinicaId),
        faturamentoPorProcedimento(clinicaId, intervalo),
        ocupacaoPorMes(clinicaId, intervalo),
        listarPacientesInativos(clinicaId),
        carregarFunil(clinicaId, intervalo),
      ]);
      setKpis(k);
      setFaturamento(f);
      setOcupacao(o);
      setInativos(i);
      setFunil(fn);
    } catch (e) {
      // Falha NÃO pode cair nos vazios da tela: "Nenhum paciente cadastrado no
      // período" é uma afirmação sobre o negócio, e aqui não se sabe nada sobre
      // o negócio — só que a consulta quebrou. Estado antigo também é zerado
      // para não sobrar número de outro período debaixo da mensagem de erro.
      setKpis(null); setFaturamento([]); setOcupacao([]); setInativos([]); setFunil(null);
      setErro(mensagemErro(e));
      toast.error("Erro ao carregar indicadores", { description: mensagemErro(e) });
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, carregandoCtx, intervalo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const dadosFaturamento = useMemo(
    () => faturamento.slice(0, TOPO_PROCEDIMENTOS).map((f) => ({
      nome: f.procedimento.length > 22 ? `${f.procedimento.slice(0, 21)}…` : f.procedimento,
      completo: f.procedimento,
      valor: Number(f.valorAprovado.toFixed(2)),
      qtd: f.qtd,
    })),
    [faturamento],
  );

  const dadosOcupacao = useMemo(
    () => ocupacao.map((m) => ({
      mes: m.rotulo,
      consultas: m.totalConsultas,
      concluidas: m.concluidas,
      noShow: m.taxaNoShowPct ?? 0,
    })),
    [ocupacao],
  );

  const totalInativosAberto = useMemo(
    () => inativos.reduce((s, p) => s + p.valorEmAberto, 0),
    [inativos],
  );

  const semClinica = !carregandoCtx && !clinicaId;

  const abrirWhatsApp = (p: PacienteInativo) => {
    const url = linkWhatsApp(p.celular, mensagemReativacao(p.nome, p.temTratamentoPendente));
    if (!url) {
      toast.error("Celular inválido", {
        description: "Cadastre um celular com DDD na ficha do paciente para usar o WhatsApp.",
      });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-4 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-brand-600" /> Indicadores
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                Onde está o dinheiro parado, o que a agenda entregou e quanto do que foi orçado virou caixa.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoChave)}>
                <SelectTrigger className="w-[190px]">
                  <Filter className="h-4 w-4 mr-1 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PERIODO_LABEL) as PeriodoChave[]).map((k) => (
                    <SelectItem key={k} value={k}>{PERIODO_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" className="gap-2" onClick={() => void carregar()} disabled={carregando}>
                <RotateCcw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar
              </Button>
              <Button asChild className="bg-brand-600 hover:bg-brand-700 gap-2">
                <Link to="/relatorios/profissional">
                  <Users className="h-4 w-4" /> Por profissional
                </Link>
              </Button>
            </div>
          </div>

          {semClinica ? (
            <Card className="border-gray-100">
              <CardContent className="p-5">
                <Vazio
                  Icone={AlertTriangle}
                  titulo="Nenhuma clínica vinculada ao seu usuário"
                  texto="Os indicadores são calculados por clínica. Conclua o cadastro da clínica para que os dados apareçam aqui."
                />
              </CardContent>
            </Card>
          ) : carregando ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : erro ? (
            <Card className="border-red-200 bg-red-50/40">
              <CardContent className="p-5">
                <Vazio
                  Icone={AlertTriangle}
                  titulo="Não foi possível carregar os indicadores"
                  texto={`${erro} Os números não são exibidos enquanto a consulta falhar — mostrar zero aqui seria inventar um resultado.`}
                />
                <div className="flex justify-center">
                  <Button variant="outline" className="gap-2" onClick={() => void carregar()}>
                    <RotateCcw className="h-4 w-4" /> Tentar de novo
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* ---------------------------------------- dinheiro parado */}
              <section>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">
                  Dinheiro parado <span className="font-normal text-gray-400">· foto de agora, independe do período</span>
                </h2>
                {!kpis ? (
                  <Card className="border-gray-100">
                    <CardContent className="p-5">
                      <Vazio
                        Icone={Wallet}
                        titulo="Ainda não há movimento financeiro nesta clínica"
                        texto="Assim que existir um orçamento ou um lançamento a receber, os valores em atraso e a receber aparecem aqui."
                      />
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                    <KpiCard
                      rotulo="Débitos em atraso"
                      valor={brl(kpis.debitosEmAtraso)}
                      sub="Parcelas vencidas e não pagas"
                      Icone={AlertTriangle}
                      destaque={kpis.debitosEmAtraso > 0 ? "alerta" : "neutro"}
                    />
                    <KpiCard
                      rotulo="Orçamentos não fechados"
                      valor={brl(kpis.orcamentosNaoFechados)}
                      sub="Propostas abertas aguardando decisão"
                      Icone={FileText}
                      destaque={kpis.orcamentosNaoFechados > 0 ? "alerta" : "neutro"}
                    />
                    <KpiCard
                      rotulo="A receber no mês"
                      valor={brl(kpis.aReceberMes)}
                      sub="Parcelas com vencimento neste mês"
                      Icone={TrendingUp}
                    />
                    <KpiCard
                      rotulo="Recebido no mês"
                      valor={brl(kpis.recebidoMes)}
                      sub="Já entrou no caixa neste mês"
                      Icone={Wallet}
                      destaque={kpis.recebidoMes > 0 ? "positivo" : "neutro"}
                    />
                    <KpiCard
                      rotulo="Aniversariantes (30d)"
                      valor={String(kpis.aniversariantes30d)}
                      sub="Motivo pronto para uma abordagem"
                      Icone={CalendarHeart}
                    />
                  </div>
                )}
              </section>

              {/* ---------------------------------------- funil completo */}
              <section>
                <Card className="border-brand-200 bg-brand-50/40">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-2 mb-1">
                      <Target className="h-5 w-5 text-brand-600 shrink-0 mt-0.5" />
                      <div>
                        <h2 className="text-base font-semibold text-gray-900">Funil completo — do lead ao caixa</h2>
                        <p className="text-sm text-gray-600 mt-0.5">
                          De cada R$ 100 orçados, quantos reais viraram tratamento pago? Agenda mostra volume e
                          financeiro mostra saldo, mas nenhum dos dois liga a origem do paciente ao dinheiro que
                          efetivamente entrou. Este bloco liga.
                        </p>
                      </div>
                    </div>

                    {!funil || funil.resumo.pacientes === 0 ? (
                      <Vazio
                        Icone={Target}
                        titulo="Nenhum paciente cadastrado no período selecionado"
                        texto="O funil parte dos pacientes criados no período. Cadastre pacientes (ou converta leads do CRM) para acompanhar a jornada até o recebimento."
                      />
                    ) : (
                      <>
                        <div className="mt-4">
                          <FunilJornada resumo={funil.resumo} />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                          <div className="bg-white rounded-lg border border-brand-100 p-4">
                            <p className="text-xs text-gray-500">Taxa de aprovação</p>
                            <p className="text-xl font-bold text-brand-700 mt-1">{pct(funil.resumo.taxaAprovacaoPct)}</p>
                            <p className="text-[11px] text-gray-400 mt-1">Do orçado, quanto o paciente aprovou</p>
                          </div>
                          <div className="bg-white rounded-lg border border-brand-100 p-4">
                            <p className="text-xs text-gray-500">Taxa de recebimento</p>
                            <p className="text-xl font-bold text-brand-700 mt-1">{pct(funil.resumo.taxaRecebimentoPct)}</p>
                            <p className="text-[11px] text-gray-400 mt-1">Do aprovado, quanto entrou no caixa</p>
                          </div>
                          <div className="bg-white rounded-lg border border-brand-100 p-4">
                            <p className="text-xs text-gray-500">Orçado que virou caixa</p>
                            <p className="text-xl font-bold text-brand-700 mt-1">{pct(funil.resumo.taxaOrcadoParaCaixaPct)}</p>
                            <p className="text-[11px] text-gray-400 mt-1">A conta final: aprovação × recebimento</p>
                          </div>
                        </div>

                        <p className="text-[11px] text-gray-500 flex items-start gap-1.5 mt-3">
                          <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
                          As taxas consolidadas são recalculadas sobre a soma dos valores do período — não é a média
                          das taxas mensais, que daria a um mês de R$ 500 o mesmo peso de um de R$ 80 mil.
                        </p>

                        {funil.porOrigem.length > 0 && (
                          <div className="mt-4 overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                  <th className="text-left font-medium px-3 py-2">Origem</th>
                                  <th className="text-right font-medium px-3 py-2">Pacientes</th>
                                  <th className="text-right font-medium px-3 py-2">Orçado</th>
                                  <th className="text-right font-medium px-3 py-2">Aprovado</th>
                                  <th className="text-right font-medium px-3 py-2">Recebido</th>
                                  <th className="text-right font-medium px-3 py-2">Aprovação</th>
                                  <th className="text-right font-medium px-3 py-2">Recebimento</th>
                                </tr>
                              </thead>
                              <tbody>
                                {funil.porOrigem.map((o) => (
                                  <tr key={o.origem} className="border-b border-border/50 hover:bg-muted/40">
                                    <td className="px-3 py-2 font-medium text-gray-800 capitalize">{o.origem}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{o.pacientes}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{brl(o.valorOrcado)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{brl(o.valorAprovado)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-700">{brl(o.valorRecebido)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{pct(o.taxaAprovacaoPct)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{pct(o.taxaRecebimentoPct)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </section>

              {/* ---------------------------------------- gráficos */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Card className="border-gray-100">
                  <CardContent className="p-5">
                    <h2 className="text-base font-semibold text-gray-900">Faturamento por procedimento</h2>
                    <p className="text-sm text-gray-600 mt-0.5 mb-4">
                      Valor aprovado em orçamentos, {PERIODO_LABEL[periodo].toLowerCase()}.
                      {faturamento.length > TOPO_PROCEDIMENTOS && ` Exibindo os ${TOPO_PROCEDIMENTOS} maiores de ${faturamento.length}.`}
                    </p>
                    {dadosFaturamento.length === 0 ? (
                      <Vazio
                        Icone={FileText}
                        titulo="Nenhum procedimento aprovado no período"
                        texto="Este gráfico usa itens de orçamento aprovados. Aprove um orçamento para ver quais procedimentos sustentam o faturamento."
                      />
                    ) : (
                      <ResponsiveContainer width="100%" height={Math.max(260, dadosFaturamento.length * 34)}>
                        <BarChart data={dadosFaturamento} layout="vertical" margin={{ left: 8, right: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                          <XAxis type="number" stroke="#666" fontSize={12} tickFormatter={(v: number) => brl(v)} />
                          <YAxis dataKey="nome" type="category" stroke="#666" fontSize={12} width={140} />
                          <Tooltip
                            formatter={(v: number) => [brl(v), "Aprovado"]}
                            labelFormatter={(_l, p) => (p?.[0]?.payload as { completo?: string })?.completo ?? ""}
                          />
                          <Bar isAnimationActive={false} dataKey="valor" fill="#059669" radius={[0, 4, 4, 0]} name="Aprovado" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-gray-100">
                  <CardContent className="p-5">
                    <h2 className="text-base font-semibold text-gray-900">Ocupação e faltas por mês</h2>
                    <p className="text-sm text-gray-600 mt-0.5 mb-4">
                      Consultas agendadas, concluídas e a taxa de não comparecimento (eixo à direita).
                    </p>
                    {dadosOcupacao.length === 0 ? (
                      <Vazio
                        Icone={CalendarHeart}
                        titulo="Nenhuma consulta no período"
                        texto="Agende consultas para acompanhar quanto da agenda foi de fato entregue e quanto virou falta."
                      />
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={dadosOcupacao} margin={{ left: 4, right: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="mes" stroke="#666" fontSize={12} />
                          <YAxis yAxisId="qtd" stroke="#666" fontSize={12} allowDecimals={false} />
                          <YAxis yAxisId="pct" orientation="right" stroke="#f59e0b" fontSize={12} unit="%" />
                          <Tooltip
                            formatter={(v: number, n) => (n === "No-show" ? [`${v}%`, n] : [v, n])}
                          />
                          <Legend />
                          <Line isAnimationActive={false} yAxisId="qtd" type="monotone" dataKey="consultas" name="Agendadas" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} />
                          <Line isAnimationActive={false} yAxisId="qtd" type="monotone" dataKey="concluidas" name="Concluídas" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
                          <Line isAnimationActive={false} yAxisId="pct" type="monotone" dataKey="noShow" name="No-show" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* ---------------------------------------- pacientes inativos */}
              <Card className="border-gray-100">
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-4">
                    <div>
                      <h2 className="text-base font-semibold text-gray-900">Pacientes inativos</h2>
                      <p className="text-sm text-gray-600 mt-0.5">
                        Mais de 6 meses sem comparecer. É a lista mais acionável do painel: já são pacientes da casa.
                      </p>
                    </div>
                    {inativos.length > 0 && (
                      <div className="text-left sm:text-right shrink-0">
                        <p className="text-xs text-gray-500">Em aberto nesta lista</p>
                        <p className="text-xl font-bold text-brand-700">{brl(totalInativosAberto)}</p>
                        <p className="text-[11px] text-gray-400">{inativos.length} paciente(s)</p>
                      </div>
                    )}
                  </div>

                  {inativos.length === 0 ? (
                    <Vazio
                      Icone={UserX}
                      titulo="Nenhum paciente inativo"
                      texto="Todos os pacientes ativos passaram pela clínica nos últimos 6 meses. Quando alguém sumir, ele aparece aqui com o valor em aberto e o botão de WhatsApp."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="text-left font-medium px-3 py-2">Paciente</th>
                            <th className="text-left font-medium px-3 py-2">Última consulta</th>
                            <th className="text-right font-medium px-3 py-2">Sem vir há</th>
                            <th className="text-right font-medium px-3 py-2">Em aberto</th>
                            <th className="text-left font-medium px-3 py-2">Situação</th>
                            <th className="text-right font-medium px-3 py-2">Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inativos.map((p) => (
                            <tr key={p.pacienteId ?? p.nome} className="border-b border-border/50 hover:bg-muted/40">
                              <td className="px-3 py-2 font-medium text-gray-800">{p.nome}</td>
                              <td className="px-3 py-2 text-gray-600">
                                {p.ultimaConsulta ? dataBR(p.ultimaConsulta) : "Nunca compareceu"}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                                {p.diasSemVir != null ? `${p.diasSemVir} dias` : "—"}
                              </td>
                              <td className={`px-3 py-2 text-right tabular-nums ${p.valorEmAberto > 0 ? "font-semibold text-brand-700" : "text-gray-500"}`}>
                                {brl(p.valorEmAberto)}
                              </td>
                              <td className="px-3 py-2">
                                {p.temTratamentoPendente ? (
                                  <Badge className="bg-amber-100 text-amber-800 border-0">Tratamento pendente</Badge>
                                ) : (
                                  <Badge className="bg-gray-100 text-gray-600 border-0">Sem pendência clínica</Badge>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Button
                                  size="sm"
                                  className="bg-brand-600 hover:bg-brand-700 gap-2"
                                  onClick={() => setAContatar(p)}
                                  disabled={!p.celular}
                                  title={p.celular ? "Abrir conversa no WhatsApp" : "Paciente sem celular cadastrado"}
                                >
                                  <MessageCircle className="h-4 w-4" /> WhatsApp
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>

      {/* Confirmação antes de abrir o WhatsApp: a mensagem some da tela assim que
          a aba abre, então ela é mostrada aqui pra ninguém disparar às cegas. */}
      <AlertDialog open={aContatar !== null} onOpenChange={(o) => { if (!o) setAContatar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar mensagem de retorno?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <span className="block">
                  O WhatsApp abre em outra aba com o texto abaixo já digitado para{" "}
                  <strong>{aContatar?.nome}</strong>. Nada é enviado automaticamente — você revisa e envia.
                </span>
                <span className="block rounded-md bg-muted/50 p-3 text-sm text-gray-700">
                  {aContatar ? mensagemReativacao(aContatar.nome, aContatar.temTratamentoPendente) : ""}
                </span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-brand-600 hover:bg-brand-700"
              onClick={() => { if (aContatar) abrirWhatsApp(aContatar); setAContatar(null); }}
            >
              Abrir WhatsApp
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Relatorios;
