import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowDownCircle, Plus, Loader2, Search, Trash2, Undo2, CheckCircle2,
  AlertTriangle, Wallet, TrendingUp, Info,
} from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import { ParcelaDialog, LancamentoAvulsoDialog } from "@/components/financeiro/ParcelaDialog";
import {
  listarParcelas, listarContasFinanceiras, listarCategorias, listarTaxasCartao,
  listarPacientesResumo, totalEmAtraso, calcularKpis, estornarParcela, excluirLancamento,
  statusEfetivo, brl, dataBR, hojeISO, mesCorrente, LIMITE_PARCELAS,
  STATUS_PARCELA_LABEL, STATUS_PARCELA_CLASSE, FORMA_PAGAMENTO_LABEL, FORMAS_PAGAMENTO,
  type ParcelaComLancamento, type ContaFinanceira, type CategoriaFinanceira,
  type TaxaCartao, type StatusParcela, type FormaPagamento,
} from "@/services/financeiro";

// ============================================================================
// Contas a Receber
// ----------------------------------------------------------------------------
// A tela é sobre PARCELAS, não sobre lançamentos: quem entra no caixa é a
// parcela. Um orçamento aprovado em 6x aparece como 6 linhas, porque são 6
// decisões de cobrança diferentes.
//
// "Em atraso" é medido fora do filtro de período de propósito — inadimplência
// de meses passados não pode sumir da tela quando o usuário filtra o mês atual.
// ============================================================================

const TODOS = "__todos__";

const STATUS_FILTRAVEIS: StatusParcela[] = ["pendente", "pago", "atrasado", "cancelado", "estornado"];

const FinanceiroReceber = () => {
  const { clinicaId, carregando: carregandoCtx } = useTenant();

  const inicial = mesCorrente();
  const [de, setDe] = useState(inicial.de);
  const [ate, setAte] = useState(inicial.ate);
  const [filtroStatus, setFiltroStatus] = useState<string>(TODOS);
  const [filtroPaciente, setFiltroPaciente] = useState<string>(TODOS);
  const [filtroForma, setFiltroForma] = useState<string>(TODOS);
  const [filtroConta, setFiltroConta] = useState<string>(TODOS);
  const [busca, setBusca] = useState("");

  const [parcelas, setParcelas] = useState<ParcelaComLancamento[]>([]);
  const [contas, setContas] = useState<ContaFinanceira[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([]);
  const [taxas, setTaxas] = useState<TaxaCartao[]>([]);
  const [pacientes, setPacientes] = useState<{ id: string; nome_completo: string }[]>([]);
  const [atraso, setAtraso] = useState({ total: 0, qtd: 0 });

  const [carregando, setCarregando] = useState(true);
  const [semContexto, setSemContexto] = useState(false);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const [parcelaBaixa, setParcelaBaixa] = useState<ParcelaComLancamento | null>(null);
  const [abrirAvulso, setAbrirAvulso] = useState(false);
  const [aExcluir, setAExcluir] = useState<ParcelaComLancamento | null>(null);
  const [aEstornar, setAEstornar] = useState<ParcelaComLancamento | null>(null);
  const [agindo, setAgindo] = useState(false);

  // cadastros auxiliares mudam pouco: carregam uma vez por clínica
  useEffect(() => {
    if (!clinicaId) return;
    let vivo = true;
    (async () => {
      try {
        const [c, cat, t, p] = await Promise.all([
          listarContasFinanceiras(clinicaId),
          listarCategorias(clinicaId, "receber"),
          listarTaxasCartao(clinicaId),
          listarPacientesResumo(clinicaId),
        ]);
        if (!vivo) return;
        setContas(c); setCategorias(cat); setTaxas(t); setPacientes(p);
      } catch (e: any) {
        if (vivo) toast.error("Erro ao carregar cadastros do financeiro", { description: e.message });
      }
    })();
    return () => { vivo = false; };
  }, [clinicaId]);

  const carregar = useCallback(async () => {
    if (!clinicaId) {
      if (!carregandoCtx) { setSemContexto(true); setCarregando(false); }
      return;
    }
    setSemContexto(false);
    setCarregando(true);
    setErroCarga(null);
    try {
      const [lista, emAtraso] = await Promise.all([
        listarParcelas(clinicaId, {
          tipo: "receber",
          de: de || null,
          ate: ate || null,
          status: filtroStatus === TODOS ? null : (filtroStatus as StatusParcela),
          forma: filtroForma === TODOS ? null : (filtroForma as FormaPagamento),
          contaId: filtroConta === TODOS ? null : filtroConta,
          pacienteId: filtroPaciente === TODOS ? null : filtroPaciente,
        }),
        totalEmAtraso(clinicaId, "receber"),
      ]);
      setParcelas(lista);
      setAtraso(emAtraso);
    } catch (e: any) {
      setErroCarga(e.message ?? "Falha desconhecida");
      toast.error("Erro ao carregar contas a receber", { description: e.message });
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, carregandoCtx, de, ate, filtroStatus, filtroForma, filtroConta, filtroPaciente]);

  useEffect(() => { carregar(); }, [carregar]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return parcelas;
    return parcelas.filter((p) => {
      const alvo = `${p.lancamentos?.descricao ?? ""} ${p.lancamentos?.pacientes?.nome_completo ?? ""} ${p.lancamentos?.categorias_financeiras?.nome ?? ""}`;
      return alvo.toLowerCase().includes(termo);
    });
  }, [parcelas, busca]);

  const kpis = useMemo(() => calcularKpis(visiveis), [visiveis]);

  // KPI é somado no cliente sobre a lista carregada. Se a consulta bateu no teto,
  // os totais abaixo são um recorte, não o período inteiro — e numa tela de dinheiro
  // um total silenciosamente menor que o real é pior que nenhum total.
  const truncado = parcelas.length >= LIMITE_PARCELAS;

  const limparFiltros = () => {
    const m = mesCorrente();
    setDe(m.de); setAte(m.ate);
    setFiltroStatus(TODOS); setFiltroPaciente(TODOS);
    setFiltroForma(TODOS); setFiltroConta(TODOS); setBusca("");
  };

  const aplicarPreset = (preset: "mes" | "anterior" | "proximos30" | "vencidos") => {
    const hoje = hojeISO();
    if (preset === "mes") { const m = mesCorrente(); setDe(m.de); setAte(m.ate); return; }
    if (preset === "anterior") {
      const d = new Date();
      const ini = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const fim = new Date(d.getFullYear(), d.getMonth(), 0);
      const fmt = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
      setDe(fmt(ini)); setAte(fmt(fim)); return;
    }
    if (preset === "proximos30") {
      const d = new Date(); d.setDate(d.getDate() + 30);
      setDe(hoje);
      setAte(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      return;
    }
    // vencidos: tudo que já passou, sem piso — é a régua de cobrança.
    // Status "atrasado" aqui é o EFETIVO: o serviço traduz isso para
    // (pendente OU atrasado) + vencimento < hoje, então a régua pega tanto a
    // parcela que o cron já virou quanto a que ainda está `pendente` no banco.
    setDe(""); setAte(hoje); setFiltroStatus("atrasado");
  };

  const confirmarEstorno = async () => {
    if (!aEstornar || !clinicaId) return;
    setAgindo(true);
    try {
      await estornarParcela(aEstornar.id, clinicaId);
      toast.success("Pagamento estornado", {
        description: "A parcela voltou para pendente. Se havia comissão liberada por esta baixa, revise-a na tela de comissões — ela não é revertida sozinha.",
      });
      setAEstornar(null);
      await carregar();
    } catch (e: any) {
      toast.error("Erro ao estornar", { description: e.message });
    } finally {
      setAgindo(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!aExcluir || !clinicaId) return;
    setAgindo(true);
    try {
      await excluirLancamento(aExcluir.lancamento_id, clinicaId);
      toast.success("Lançamento excluído");
      setAExcluir(null);
      await carregar();
    } catch (e: any) {
      toast.error("Não foi possível excluir", { description: e.message });
    } finally {
      setAgindo(false);
    }
  };

  const temFiltroAtivo =
    filtroStatus !== TODOS || filtroPaciente !== TODOS || filtroForma !== TODOS ||
    filtroConta !== TODOS || busca.trim() !== "";

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-4 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <ArrowDownCircle className="h-6 w-6 text-emerald-600" /> Contas a receber
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                Cada parcela a receber da clínica, com baixa de pagamento, taxa de cartão e valor líquido.
              </p>
            </div>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 gap-2"
              onClick={() => setAbrirAvulso(true)}
              disabled={!clinicaId}
            >
              <Plus className="h-4 w-4" /> Novo lançamento avulso
            </Button>
          </div>

          {truncado && (
            <div className="mb-5 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
              <p className="text-xs text-amber-900">
                O período filtrado tem mais de {LIMITE_PARCELAS} parcelas e a lista foi cortada nesse
                limite. Os totais abaixo somam só as parcelas carregadas — reduza o intervalo de
                vencimento para obter números fechados.
              </p>
            </div>
          )}

          {/* ---------------------------------------------------------- KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
            <Card className="border-gray-100">
              <CardContent className="p-5">
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Recebido no período
                </p>
                <p className="text-xl font-bold text-emerald-700 mt-1">{brl(kpis.liquidado)}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {kpis.qtdLiquidada} parcela(s) · líquido {brl(kpis.liquidadoLiquido)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-gray-100">
              <CardContent className="p-5">
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 text-amber-600" /> A receber no período
                </p>
                <p className="text-xl font-bold text-gray-900 mt-1">{brl(kpis.emAberto)}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{kpis.qtdEmAberto} parcela(s) em aberto</p>
              </CardContent>
            </Card>

            <Card className="border-gray-100">
              <CardContent className="p-5">
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-600" /> Em atraso
                </p>
                <p className="text-xl font-bold text-red-600 mt-1">{brl(atraso.total)}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {atraso.qtd} parcela(s) vencidas — todo o histórico, não só o período
                </p>
              </CardContent>
            </Card>

            <Card className="border-gray-100">
              <CardContent className="p-5">
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-sky-600" /> Total previsto
                </p>
                <p className="text-xl font-bold text-gray-900 mt-1">{brl(kpis.totalPeriodo)}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {visiveis.length} parcela(s) no período filtrado
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ------------------------------------------------------- filtros */}
          <Card className="border-gray-100 mb-5">
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => aplicarPreset("mes")}>Este mês</Button>
                <Button size="sm" variant="outline" onClick={() => aplicarPreset("anterior")}>Mês passado</Button>
                <Button size="sm" variant="outline" onClick={() => aplicarPreset("proximos30")}>Próximos 30 dias</Button>
                <Button size="sm" variant="outline" onClick={() => aplicarPreset("vencidos")}>Vencidas</Button>
                {temFiltroAtivo && (
                  <Button size="sm" variant="ghost" onClick={limparFiltros}>Limpar filtros</Button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Vencimento de</Label>
                  <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">até</Label>
                  <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Status</Label>
                  <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>Todos</SelectItem>
                      {STATUS_FILTRAVEIS.map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_PARCELA_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Paciente</Label>
                  <Select value={filtroPaciente} onValueChange={setFiltroPaciente}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>Todos</SelectItem>
                      {pacientes.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.nome_completo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Forma</Label>
                  <Select value={filtroForma} onValueChange={setFiltroForma}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>Todas</SelectItem>
                      {FORMAS_PAGAMENTO.map((f) => (
                        <SelectItem key={f} value={f}>{FORMA_PAGAMENTO_LABEL[f]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Conta</Label>
                  <Select value={filtroConta} onValueChange={setFiltroConta}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>Todas</SelectItem>
                      {contas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por descrição, paciente ou categoria"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* -------------------------------------------------------- tabela */}
          <Card className="border-gray-100">
            <CardContent className="p-0">
              {carregando ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : semContexto ? (
                <EstadoVazio
                  titulo="Nenhuma clínica vinculada ao seu usuário"
                  texto="O financeiro é isolado por clínica. Conclua o cadastro da clínica para começar a lançar recebimentos."
                />
              ) : erroCarga ? (
                <div className="p-12 text-center">
                  <AlertTriangle className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="font-medium text-gray-800">Não foi possível carregar as parcelas</p>
                  <p className="text-sm text-gray-500 mt-1">{erroCarga}</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={carregar}>
                    Tentar de novo
                  </Button>
                </div>
              ) : visiveis.length === 0 ? (
                <EstadoVazio
                  titulo={temFiltroAtivo ? "Nenhuma parcela com esses filtros" : "Nenhuma conta a receber no período"}
                  texto={
                    temFiltroAtivo
                      ? "Ajuste o período ou limpe os filtros para ver outras parcelas."
                      : "As parcelas nascem de duas formas: aprovando um orçamento (que gera os débitos automaticamente) ou criando um lançamento avulso aqui mesmo."
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="text-left font-medium px-4 py-3">Vencimento</th>
                        <th className="text-left font-medium px-4 py-3">Paciente</th>
                        <th className="text-left font-medium px-4 py-3">Descrição</th>
                        <th className="text-left font-medium px-4 py-3">Parcela</th>
                        <th className="text-right font-medium px-4 py-3">Valor</th>
                        <th className="text-left font-medium px-4 py-3">Forma</th>
                        <th className="text-left font-medium px-4 py-3">Status</th>
                        <th className="text-right font-medium px-4 py-3">Valor líquido</th>
                        <th className="text-right font-medium px-4 py-3">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiveis.map((p) => {
                        const status = statusEfetivo(p);
                        const forma = p.forma_pagamento ?? p.lancamentos?.forma_pagamento ?? null;
                        return (
                          <tr key={p.id} className="border-b border-border/50 hover:bg-muted/40">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={status === "atrasado" ? "text-red-600 font-medium" : "text-gray-800"}>
                                {dataBR(p.vencimento)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {p.lancamentos?.pacientes?.nome_completo ?? (
                                <span className="text-gray-400">Sem paciente</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-gray-800">{p.lancamentos?.descricao ?? "—"}</span>
                              {p.lancamentos?.categorias_financeiras?.nome && (
                                <span className="block text-[11px] text-gray-400">
                                  {p.lancamentos.categorias_financeiras.nome}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                              {p.numero}/{p.lancamentos?.qtd_parcelas ?? 1}
                            </td>
                            <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                              {brl(p.valor)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                              {forma ? FORMA_PAGAMENTO_LABEL[forma] : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <Badge className={STATUS_PARCELA_CLASSE[status]}>
                                {STATUS_PARCELA_LABEL[status]}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              {p.status === "pago" ? (
                                <>
                                  <span className="font-medium text-emerald-700">
                                    {brl(p.valor_liquido ?? p.valor_pago)}
                                  </span>
                                  {Number(p.taxa_valor) > 0 && (
                                    <span className="block text-[11px] text-gray-400">
                                      taxa {brl(p.taxa_valor)}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1.5">
                                {p.status === "pago" ? (
                                  <Button
                                    size="sm" variant="outline" className="gap-1.5"
                                    onClick={() => setAEstornar(p)}
                                  >
                                    <Undo2 className="h-3.5 w-3.5" /> Estornar
                                  </Button>
                                ) : p.status === "cancelado" || p.status === "estornado" ? (
                                  <span className="text-xs text-gray-400">Sem ação</span>
                                ) : (
                                  <Button
                                    size="sm"
                                    className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                                    onClick={() => setParcelaBaixa(p)}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Marcar pago
                                  </Button>
                                )}
                                <Button
                                  size="icon" variant="ghost"
                                  className="h-8 w-8 text-gray-400 hover:text-red-600"
                                  title="Excluir lançamento"
                                  onClick={() => setAExcluir(p)}
                                >
                                  <Trash2 className="h-4 w-4" />
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

          <p className="text-[11px] text-gray-500 mt-3 flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-gray-400" />
            Ao marcar uma parcela como paga, o banco calcula o valor líquido (valor pago menos a taxa)
            e, se houver comissão vinculada a ela, muda essa comissão de prevista para liberada.
            O estorno desfaz a baixa, mas não desfaz a liberação da comissão.
          </p>
        </div>
      </main>

      <ParcelaDialog
        aberto={!!parcelaBaixa}
        parcela={parcelaBaixa}
        contas={contas}
        taxas={taxas}
        onFechar={() => setParcelaBaixa(null)}
        onSalvo={carregar}
      />

      <LancamentoAvulsoDialog
        aberto={abrirAvulso}
        clinicaId={clinicaId}
        tipo="receber"
        contas={contas}
        categorias={categorias}
        onFechar={() => setAbrirAvulso(false)}
        onCriado={carregar}
      />

      <AlertDialog open={!!aEstornar} onOpenChange={(o) => !o && setAEstornar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar este pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              A parcela de {brl(aEstornar?.valor_pago ?? aEstornar?.valor)} volta para pendente e a
              taxa é zerada. Use só quando a baixa foi um erro ou o pagamento foi estornado de verdade.
              <span className="mt-2 block font-medium text-amber-700">
                A comissão liberada por esta baixa NÃO é revertida automaticamente: ela continua como
                liberada e precisa ser ajustada na mão em Comissões.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={agindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmarEstorno(); }} disabled={agindo}>
              {agindo ? "Estornando…" : "Estornar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!aExcluir} onOpenChange={(o) => !o && setAExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o lançamento inteiro?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga "{aExcluir?.lancamentos?.descricao}" e TODAS as suas{" "}
              {aExcluir?.lancamentos?.qtd_parcelas ?? 1} parcela(s), não só esta linha.
              A ação não pode ser desfeita. Lançamentos com parcela já paga são bloqueados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={agindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => { e.preventDefault(); confirmarExclusao(); }}
              disabled={agindo}
            >
              {agindo ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const EstadoVazio = ({ titulo, texto }: { titulo: string; texto: string }) => (
  <div className="p-12 text-center">
    <Wallet className="h-10 w-10 text-gray-300 mx-auto mb-3" />
    <p className="font-medium text-gray-800">{titulo}</p>
    <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">{texto}</p>
  </div>
);

export default FinanceiroReceber;
