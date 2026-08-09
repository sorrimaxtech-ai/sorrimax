import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  UserCog, Loader2, AlertTriangle, CalendarCheck, UserX, Clock, Wallet, HandCoins,
  BarChart3, RotateCcw, Info,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import {
  listarProfissionais, carregarDesempenhoProfissional, unirMesesProfissional,
  intervaloDoPeriodo, recorteParcialDeMes, brl, pct, mensagemErro, PERIODO_LABEL,
  type PeriodoChave, type ProfissionalOpcao, type DesempenhoProfissional,
  type Intervalo,
} from "@/services/relatorios";

// ============================================================================
// Relatório por profissional — produtividade e repasse lado a lado
// ----------------------------------------------------------------------------
// A comparação que importa aqui é entre HORAS AGENDADAS e FATURAMENTO. Duas
// agendas com o mesmo número de consultas podem render valores muito diferentes;
// é isso que revela se a cadeira está sendo ocupada com procedimento que paga.
//
// Faturamento vem de consultas CONCLUÍDAS (trabalho entregue), e comissão vem de
// `vw_comissoes_profissional`, que segue o ciclo do dinheiro (prevista até o
// paciente pagar). São bases diferentes de propósito — por isso não batem, e a
// tela diz isso na cara em vez de esconder.
// ============================================================================

const PERIODO_PERSONALIZADO = "custom";

interface MetricaProps {
  rotulo: string;
  valor: string;
  sub: string;
  Icone: React.ElementType;
  cor?: "neutro" | "alerta" | "positivo";
}

const COR = {
  neutro: "text-gray-900",
  alerta: "text-amber-600",
  positivo: "text-emerald-600",
} as const;

const Metrica = ({ rotulo, valor, sub, Icone, cor = "neutro" }: MetricaProps) => (
  <Card className="border-gray-100">
    <CardContent className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">{rotulo}</p>
          <p className={`text-xl font-bold mt-1 ${COR[cor]}`}>{valor}</p>
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

/** Data local → primeiro instante do dia em ISO. */
const inicioDoDiaISO = (d: string) => new Date(`${d}T00:00:00`).toISOString();
/** Data local → primeiro instante do dia SEGUINTE: o `até` do usuário é inclusivo. */
function fimDoDiaISO(d: string) {
  const dt = new Date(`${d}T00:00:00`);
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString();
}

const horas = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;

const RelatorioProfissional = () => {
  const { clinicaId, carregando: carregandoCtx } = useTenant();

  const [profissionais, setProfissionais] = useState<ProfissionalOpcao[]>([]);
  const [profissionalId, setProfissionalId] = useState("");
  const [periodo, setPeriodo] = useState<PeriodoChave | typeof PERIODO_PERSONALIZADO>("6m");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const [carregandoLista, setCarregandoLista] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [dados, setDados] = useState<DesempenhoProfissional | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const personalizado = periodo === PERIODO_PERSONALIZADO;
  const faltaData = personalizado && (!de || !ate);
  const ordemInvalida = personalizado && Boolean(de && ate && de > ate);
  const periodoInvalido = faltaData || ordemInvalida;

  const intervalo: Intervalo | null = useMemo(() => {
    if (!personalizado) return intervaloDoPeriodo(periodo as PeriodoChave);
    if (faltaData || ordemInvalida) return null;
    return { inicio: inicioDoDiaISO(de), fim: fimDoDiaISO(ate) };
  }, [personalizado, periodo, de, ate, faltaData, ordemInvalida]);

  // ------------------------------------------------------------- profissionais
  useEffect(() => {
    if (!clinicaId) { if (!carregandoCtx) setCarregandoLista(false); return; }
    let vivo = true;
    (async () => {
      try {
        const lista = await listarProfissionais(clinicaId);
        if (!vivo) return;
        setProfissionais(lista);
        // Pré-seleciona o primeiro: uma tela de relatório que abre vazia por
        // falta de escolha parece quebrada, não vazia.
        setProfissionalId((atual) => atual || lista[0]?.id || "");
      } catch (e) {
        if (vivo) toast.error("Erro ao carregar profissionais", { description: mensagemErro(e) });
      } finally {
        if (vivo) setCarregandoLista(false);
      }
    })();
    return () => { vivo = false; };
  }, [clinicaId, carregandoCtx]);

  // ------------------------------------------------------------------- dados
  const carregar = useCallback(async () => {
    if (!clinicaId || !profissionalId || !intervalo) { setDados(null); setErro(null); return; }
    setCarregando(true);
    setErro(null);
    try {
      setDados(await carregarDesempenhoProfissional(clinicaId, profissionalId, intervalo));
    } catch (e) {
      // Sem `dados` a tela cairia no vazio "sem movimento no período", que afirma
      // algo sobre a agenda do profissional. Erro de consulta não autoriza essa
      // afirmação — por isso o estado de falha é explícito.
      setDados(null);
      setErro(mensagemErro(e));
      toast.error("Erro ao carregar o desempenho", { description: mensagemErro(e) });
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, profissionalId, intervalo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const linhas = useMemo(() => (dados ? unirMesesProfissional(dados) : []), [dados]);

  const grafico = useMemo(
    () => linhas.map((l) => ({
      mes: l.rotulo,
      concluidas: l.concluidas,
      faltas: l.noShow,
      faturamento: Number(l.faturamento.toFixed(2)),
    })),
    [linhas],
  );

  const profissional = profissionais.find((p) => p.id === profissionalId) ?? null;
  const semClinica = !carregandoCtx && !clinicaId;
  // Comissão vem de orçamento aprovado, não da agenda: um profissional pode ter
  // repasse a receber num mês sem nenhuma consulta lançada. Se "sem movimento"
  // olhasse só as linhas de agenda, esse dinheiro sumiria da tela.
  const semMovimento = dados !== null && linhas.length === 0 && dados.comissao.qtd === 0;
  const avisoMesParcial = intervalo ? recorteParcialDeMes(intervalo) : false;

  /** Faturamento por hora de cadeira ocupada — o número que compara agendas desiguais. */
  const porHora =
    dados && dados.totais.horasAgendadas > 0 ? dados.faturamento / dados.totais.horasAgendadas : null;

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-4 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <UserCog className="h-6 w-6 text-brand-600" /> Relatório por profissional
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                Quanto cada profissional entregou de agenda, quanto isso faturou e quanto virou comissão.
              </p>
            </div>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/relatorios">
                <BarChart3 className="h-4 w-4" /> Ver indicadores gerais
              </Link>
            </Button>
          </div>

          {semClinica ? (
            <Card className="border-gray-100">
              <CardContent className="p-5">
                <Vazio
                  Icone={AlertTriangle}
                  titulo="Nenhuma clínica vinculada ao seu usuário"
                  texto="O relatório é calculado por clínica. Conclua o cadastro da clínica para acompanhar o desempenho da equipe."
                />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* ------------------------------------------------- filtros */}
              <Card className="border-gray-100">
                <CardContent className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
                    <div className="space-y-1.5">
                      <Label htmlFor="prof">Profissional</Label>
                      <Select
                        value={profissionalId}
                        onValueChange={setProfissionalId}
                        disabled={carregandoLista || profissionais.length === 0}
                      >
                        <SelectTrigger id="prof">
                          <SelectValue placeholder={carregandoLista ? "Carregando…" : "Selecione"} />
                        </SelectTrigger>
                        <SelectContent>
                          {profissionais.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome}{p.especialidade ? ` · ${p.especialidade}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="periodo">Período</Label>
                      <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoChave)}>
                        <SelectTrigger id="periodo">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(PERIODO_LABEL) as PeriodoChave[]).map((k) => (
                            <SelectItem key={k} value={k}>{PERIODO_LABEL[k]}</SelectItem>
                          ))}
                          <SelectItem value={PERIODO_PERSONALIZADO}>Personalizado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {personalizado ? (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor="de">De</Label>
                          <Input id="de" type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="ate">Até</Label>
                          <Input id="ate" type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} />
                        </div>
                      </>
                    ) : (
                      <div className="xl:col-span-2 flex sm:justify-end">
                        <Button variant="outline" className="gap-2" onClick={() => void carregar()} disabled={carregando || !profissionalId}>
                          <RotateCcw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar
                        </Button>
                      </div>
                    )}
                  </div>

                  {ordemInvalida && (
                    <p className="text-sm text-red-600 mt-3">A data inicial não pode ser posterior à data final.</p>
                  )}
                  {faltaData && !ordemInvalida && (
                    <p className="text-sm text-amber-600 mt-3">Informe as duas datas para aplicar o período personalizado.</p>
                  )}
                  {avisoMesParcial && (
                    <p className="text-[11px] text-gray-500 flex items-start gap-1.5 mt-3">
                      <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
                      Agenda e comissão são apuradas pelo banco em blocos mensais fechados. Como a data inicial
                      não cai em virada de mês, o mês de início entra inteiro no cálculo — não recortado no dia.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* ------------------------------------------------- conteúdo */}
              {carregandoLista ? (
                <div className="flex justify-center p-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : profissionais.length === 0 ? (
                <Card className="border-gray-100">
                  <CardContent className="p-5">
                    <Vazio
                      Icone={UserCog}
                      titulo="Nenhum profissional cadastrado"
                      texto="Cadastre profissionais na tela de Profissionais para acompanhar produtividade, faltas e comissão individualmente."
                    />
                  </CardContent>
                </Card>
              ) : periodoInvalido ? (
                <Card className="border-gray-100">
                  <CardContent className="p-5">
                    <Vazio
                      Icone={AlertTriangle}
                      titulo="Período incompleto"
                      texto="Ajuste as datas acima para que o relatório seja calculado."
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
                      titulo="Não foi possível carregar o desempenho"
                      texto={`${erro} Nenhum número é exibido enquanto a consulta falhar — zero aqui seria confundido com "não produziu".`}
                    />
                    <div className="flex justify-center">
                      <Button variant="outline" className="gap-2" onClick={() => void carregar()}>
                        <RotateCcw className="h-4 w-4" /> Tentar de novo
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : !dados ? (
                <Card className="border-gray-100">
                  <CardContent className="p-5">
                    <Vazio
                      Icone={UserCog}
                      titulo="Selecione um profissional"
                      texto="Escolha quem você quer analisar no seletor acima."
                    />
                  </CardContent>
                </Card>
              ) : semMovimento ? (
                <Card className="border-gray-100">
                  <CardContent className="p-5">
                    <Vazio
                      Icone={CalendarCheck}
                      titulo={`Sem movimento de ${profissional?.nome ?? "profissional"} no período`}
                      texto="Nenhuma consulta agendada nem comissão gerada nesse intervalo. Amplie o período ou verifique se a agenda está sendo lançada no sistema."
                    />
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                    <Metrica
                      rotulo="Consultas realizadas"
                      valor={String(dados.totais.concluidas)}
                      sub={`de ${dados.totais.totalConsultas} agendadas`}
                      Icone={CalendarCheck}
                      cor="positivo"
                    />
                    <Metrica
                      rotulo="Taxa de no-show"
                      valor={pct(dados.totais.taxaNoShowPct)}
                      sub={`${dados.totais.noShow} falta(s) · ${dados.totais.canceladas} cancelamento(s)`}
                      Icone={UserX}
                      cor={(dados.totais.taxaNoShowPct ?? 0) > 0 ? "alerta" : "neutro"}
                    />
                    <Metrica
                      rotulo="Horas agendadas"
                      valor={horas(dados.totais.horasAgendadas)}
                      sub={porHora ? `${brl(porHora)} por hora de agenda` : "Sem horas para calcular"}
                      Icone={Clock}
                    />
                    <Metrica
                      rotulo="Faturamento gerado"
                      valor={brl(dados.faturamento)}
                      sub="Somatório das consultas concluídas"
                      Icone={Wallet}
                      cor="positivo"
                    />
                    <Metrica
                      rotulo="Comissão no período"
                      valor={brl(dados.comissao.total)}
                      sub={`${brl(dados.comissao.paga)} já repassado`}
                      Icone={HandCoins}
                    />
                  </div>

                  <Card className="border-gray-100">
                    <CardContent className="p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1">
                        <h2 className="text-base font-semibold text-gray-900">Status da comissão</h2>
                        <span className="text-xs text-gray-500">{dados.comissao.qtd} comissão(ões) no período</span>
                      </div>
                      <p className="text-sm text-gray-600 mb-4">
                        Comissão só é liberada quando o paciente paga a parcela — repassar previsão é adiantar
                        dinheiro que ainda não entrou.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-4">
                          <p className="text-xs text-gray-500">Prevista</p>
                          <p className="text-xl font-bold text-amber-700 mt-1">{brl(dados.comissao.prevista)}</p>
                          <p className="text-[11px] text-gray-400 mt-1">Paciente ainda não pagou</p>
                        </div>
                        <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-4">
                          <p className="text-xs text-gray-500">Liberada</p>
                          <p className="text-xl font-bold text-sky-700 mt-1">{brl(dados.comissao.liberada)}</p>
                          <p className="text-[11px] text-gray-400 mt-1">Pronta para repasse</p>
                        </div>
                        <div className="rounded-lg border border-brand-100 bg-brand-50/50 p-4">
                          <p className="text-xs text-gray-500">Paga</p>
                          <p className="text-xl font-bold text-emerald-700 mt-1">{brl(dados.comissao.paga)}</p>
                          <p className="text-[11px] text-gray-400 mt-1">Repasse já efetuado</p>
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-500 flex items-start gap-1.5 mt-3">
                        <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
                        Faturamento conta consultas concluídas no período; comissão conta o que foi gerado a partir
                        de orçamentos aprovados. São recortes diferentes — os dois valores não se anulam.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-gray-100">
                    <CardContent className="p-5">
                      <h2 className="text-base font-semibold text-gray-900">Mês a mês</h2>
                      <p className="text-sm text-gray-600 mt-0.5 mb-4">
                        Consultas concluídas e faltas (eixo à esquerda) contra o faturamento (eixo à direita).
                      </p>
                      {linhas.length === 0 ? (
                        <Vazio
                          Icone={CalendarCheck}
                          titulo="Nenhuma consulta lançada neste período"
                          texto="Há comissão registrada, mas nenhuma consulta na agenda do período — a comissão nasce do orçamento aprovado, que pode ter sido lançado sem consulta vinculada."
                        />
                      ) : (
                      <>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={grafico} margin={{ left: 4, right: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="mes" stroke="#666" fontSize={12} />
                          <YAxis yAxisId="qtd" stroke="#666" fontSize={12} allowDecimals={false} />
                          <YAxis
                            yAxisId="rs"
                            orientation="right"
                            stroke="#00b4d8"
                            fontSize={12}
                            tickFormatter={(v: number) => brl(v)}
                            width={90}
                          />
                          <Tooltip
                            formatter={(v: number, n) => (n === "Faturamento" ? [brl(v), n] : [v, n])}
                          />
                          <Legend />
                          <Bar isAnimationActive={false} yAxisId="qtd" dataKey="concluidas" name="Concluídas" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                          <Bar isAnimationActive={false} yAxisId="qtd" dataKey="faltas" name="Faltas" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                          <Bar isAnimationActive={false} yAxisId="rs" dataKey="faturamento" name="Faturamento" fill="#00b4d8" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>

                      <div className="overflow-x-auto mt-6">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="text-left font-medium px-3 py-2">Mês</th>
                              <th className="text-right font-medium px-3 py-2">Agendadas</th>
                              <th className="text-right font-medium px-3 py-2">Realizadas</th>
                              <th className="text-right font-medium px-3 py-2">Faltas</th>
                              <th className="text-right font-medium px-3 py-2">No-show</th>
                              <th className="text-right font-medium px-3 py-2">Horas</th>
                              <th className="text-right font-medium px-3 py-2">Faturamento</th>
                            </tr>
                          </thead>
                          <tbody>
                            {linhas.map((l) => (
                              <tr key={l.mes} className="border-b border-border/50 hover:bg-muted/40">
                                <td className="px-3 py-2 font-medium text-gray-800">{l.rotulo}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{l.totalConsultas}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{l.concluidas}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-amber-700">{l.noShow}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{pct(l.taxaNoShowPct)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{horas(l.horasAgendadas)}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium text-brand-700">{brl(l.faturamento)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-muted/30 font-semibold">
                              <td className="px-3 py-2">Total</td>
                              <td className="px-3 py-2 text-right tabular-nums">{dados.totais.totalConsultas}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{dados.totais.concluidas}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{dados.totais.noShow}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{pct(dados.totais.taxaNoShowPct)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{horas(dados.totais.horasAgendadas)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-brand-700">{brl(dados.faturamento)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      </>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default RelatorioProfissional;
