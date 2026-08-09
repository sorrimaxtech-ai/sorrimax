import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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
  HandCoins, Loader2, ChevronRight, ChevronDown, Info, RotateCcw, CheckCheck, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import {
  listarComissoes, listarProfissionaisComComissao, totalDoMes, marcarComoPaga,
  agruparPorProfissional, resumir, brl, mensagemErro, dataBR, dataDiaBR,
  STATUS_COMISSAO_LABEL, STATUS_COMISSAO_CLASSE, STATUS_COMISSAO_AJUDA, STATUS_PARCELA_LABEL,
  type Comissao, type GrupoProfissional, type StatusComissao, type Resumo,
} from "@/services/comissoes";

// ============================================================================
// Comissões — quanto cada profissional tem a receber, e quando pode receber
// ----------------------------------------------------------------------------
// A tela existe pra separar duas coisas que costumam virar a mesma no Excel:
// comissão PREVISTA (o paciente ainda não pagou) e comissão LIBERADA (o
// dinheiro entrou). Repassar previsão é adiantar dinheiro que a clínica ainda
// não tem — por isso o botão de pagar só aparece em cima do que está liberado.
// ============================================================================

const RESUMO_ZERO: Resumo = { qtd: 0, prevista: 0, liberada: 0, paga: 0, total: 0 };

interface Confirmacao {
  ids: string[];
  titulo: string;
  detalhe: string;
}

const Comissoes = () => {
  const { clinicaId, carregando: carregandoCtx, isAdmin } = useTenant();

  const [lista, setLista] = useState<Comissao[]>([]);
  const [profissionais, setProfissionais] = useState<{ id: string; nome: string }[]>([]);
  const [mes, setMes] = useState<Resumo>(RESUMO_ZERO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);

  // filtros
  const [fProfissional, setFProfissional] = useState("todos");
  const [fStatus, setFStatus] = useState("todos");
  const [fDe, setFDe] = useState("");
  const [fAte, setFAte] = useState("");

  const periodoInvalido = Boolean(fDe && fAte && fDe > fAte);

  const carregar = useCallback(async () => {
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; }
    if (periodoInvalido) return; // não vai ao banco com filtro impossível
    setCarregando(true);
    try {
      const [comissoes, resumoMes] = await Promise.all([
        listarComissoes(clinicaId, {
          profissionalId: fProfissional === "todos" ? undefined : fProfissional,
          status: fStatus === "todos" ? undefined : (fStatus as StatusComissao),
          de: fDe || undefined,
          ate: fAte || undefined,
        }),
        totalDoMes(clinicaId),
      ]);
      setLista(comissoes);
      setMes(resumoMes);
    } catch (e) {
      toast.error("Erro ao carregar comissões", { description: mensagemErro(e) });
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, carregandoCtx, fProfissional, fStatus, fDe, fAte, periodoInvalido]);

  useEffect(() => { carregar(); }, [carregar]);

  // O select de profissional é carregado uma vez: ele não pode encolher
  // conforme o próprio filtro, senão o usuário fica preso na opção escolhida.
  useEffect(() => {
    if (!clinicaId) return;
    let vivo = true;
    listarProfissionaisComComissao(clinicaId)
      .then((p) => { if (vivo) setProfissionais(p); })
      .catch((e) => toast.error("Erro ao carregar profissionais", { description: mensagemErro(e) }));
    return () => { vivo = false; };
  }, [clinicaId]);

  const grupos = useMemo(() => agruparPorProfissional(lista), [lista]);
  const resumo = useMemo(() => resumir(lista), [lista]);
  const temFiltro = fProfissional !== "todos" || fStatus !== "todos" || Boolean(fDe) || Boolean(fAte);
  // Sem clínica no contexto a query nem sai. Dizer "nenhuma comissão registrada"
  // aqui seria mentira: o que faltou foi o vínculo do usuário com a clínica.
  const semClinica = !carregandoCtx && !clinicaId;

  const alternar = (id: string) =>
    setExpandidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const limparFiltros = () => {
    setFProfissional("todos"); setFStatus("todos"); setFDe(""); setFAte("");
  };

  const pedirConfirmacaoGrupo = (g: GrupoProfissional) =>
    setConfirmacao({
      ids: g.idsLiberados,
      titulo: `Registrar repasse a ${g.profissional}?`,
      detalhe: `${g.idsLiberados.length} comissão(ões) liberada(s), somando ${brl(g.liberada)}, serão marcadas como PAGAS. A ação não tem desfazer na tela.`,
    });

  const pedirConfirmacaoItem = (c: Comissao) =>
    setConfirmacao({
      ids: [c.id],
      titulo: "Registrar repasse desta comissão?",
      detalhe: `${brl(c.valor)} de ${c.procedimento ?? "procedimento"} para ${c.profissional} serão marcados como PAGOS. A ação não tem desfazer na tela.`,
    });

  const confirmarPagamento = async () => {
    if (!clinicaId || !confirmacao) return;
    setSalvando(true);
    try {
      const alterados = await marcarComoPaga(clinicaId, confirmacao.ids);
      if (alterados === 0) {
        toast.warning("Nada foi alterado", {
          description: "Essas comissões já não estavam liberadas. A tela será atualizada.",
        });
      } else {
        toast.success(`${alterados} comissão(ões) marcada(s) como paga(s)`);
      }
      setConfirmacao(null);
      await carregar();
    } catch (e) {
      toast.error("Erro ao registrar o repasse", { description: mensagemErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  const kpis = [
    { rot: "Prevista", val: brl(resumo.prevista), cor: "text-amber-600", sub: "paciente ainda não pagou" },
    { rot: "Liberada", val: brl(resumo.liberada), cor: "text-sky-600", sub: "dinheiro no caixa, a repassar" },
    { rot: "Paga", val: brl(resumo.paga), cor: "text-emerald-600", sub: "repasse já efetuado" },
    { rot: "Total do mês", val: brl(mes.total), cor: "text-gray-900", sub: `${mes.qtd} comissão(ões) geradas no mês` },
  ];

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-4 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <HandCoins className="h-6 w-6 text-brand-600" /> Comissões
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                Quanto cada profissional tem a receber — e o que já pode ser repassado.
              </p>
            </div>
            <Button variant="outline" className="gap-2" onClick={carregar} disabled={carregando}>
              <RotateCcw className="h-4 w-4" /> Atualizar
            </Button>
          </div>

          {/* A regra do negócio precisa estar na tela, não só na cabeça do gestor. */}
          <Card className="border-sky-100 bg-sky-50/60 mb-6">
            <CardContent className="p-4 flex gap-3">
              <Info className="h-5 w-5 text-sky-600 shrink-0 mt-0.5" />
              <div className="text-sm text-sky-900">
                <p className="font-medium">A comissão só é liberada quando o paciente paga.</p>
                <p className="text-sky-800/90 mt-1 leading-relaxed">
                  Ao aprovar um orçamento, a comissão nasce <strong>prevista</strong>. Ela vira{" "}
                  <strong>liberada</strong> automaticamente no instante em que a parcela correspondente
                  é baixada como paga no financeiro — dinheiro no caixa, não promessa. Só o que está
                  liberado pode ser marcado como <strong>paga</strong> (o repasse ao profissional).
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {kpis.map((k) => (
              <Card key={k.rot} className="border-gray-100">
                <CardContent className="p-5">
                  <p className="text-xs text-gray-500">{k.rot}</p>
                  <p className={`text-xl font-bold mt-0.5 ${k.cor}`}>{k.val}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filtros */}
          <Card className="border-gray-100 mb-4">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                <div className="lg:col-span-2">
                  <Label className="text-xs text-gray-500">Profissional</Label>
                  <Select value={fProfissional} onValueChange={setFProfissional}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os profissionais</SelectItem>
                      {profissionais.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Status</Label>
                  <Select value={fStatus} onValueChange={setFStatus}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os status</SelectItem>
                      {(Object.keys(STATUS_COMISSAO_LABEL) as StatusComissao[]).map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_COMISSAO_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500" htmlFor="de">De</Label>
                  <Input id="de" type="date" className="mt-1" value={fDe}
                         onChange={(e) => setFDe(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-gray-500" htmlFor="ate">Até</Label>
                  <Input id="ate" type="date" className="mt-1" value={fAte}
                         onChange={(e) => setFAte(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 mt-3">
                <p className={`text-xs ${periodoInvalido ? "text-red-600" : "text-gray-400"}`}>
                  {periodoInvalido
                    ? "A data inicial não pode ser maior que a final."
                    : "O período considera a data de geração da comissão."}
                </p>
                {temFiltro && (
                  <Button variant="ghost" size="sm" className="text-xs" onClick={limparFiltros}>
                    Limpar filtros
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {!isAdmin && !carregandoCtx && (
            <p className="text-xs text-gray-500 flex items-center gap-1.5 mb-3">
              <Lock className="h-3.5 w-3.5" />
              Somente o administrador da clínica registra repasses.
            </p>
          )}

          {/* Tabela agrupada por profissional */}
          <Card className="border-gray-100">
            <CardContent className="p-0">
              {carregandoCtx || carregando ? (
                <div className="p-12 flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : semClinica ? (
                <div className="p-12 text-center">
                  <Lock className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                  <p className="font-medium text-gray-800">Nenhuma clínica no seu acesso</p>
                  <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                    Seu usuário não está vinculado a uma clínica, então não há comissões para mostrar.
                    Entre novamente ou peça ao administrador para vincular seu acesso.
                  </p>
                </div>
              ) : grupos.length === 0 ? (
                <div className="p-12 text-center">
                  <HandCoins className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                  <p className="font-medium text-gray-800">
                    {temFiltro ? "Nenhuma comissão com esse filtro" : "Nenhuma comissão registrada ainda"}
                  </p>
                  <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                    {temFiltro
                      ? "Ajuste o profissional, o status ou o período."
                      : "As comissões nascem sozinhas quando um orçamento é aprovado e gera as parcelas. Configure o percentual em Procedimentos → preços por convênio e aprove um orçamento."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted/30">
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2.5 font-medium w-8" />
                        <th className="px-4 py-2.5 font-medium">Profissional</th>
                        <th className="px-4 py-2.5 font-medium text-right">Qtd</th>
                        <th className="px-4 py-2.5 font-medium text-right">Prevista</th>
                        <th className="px-4 py-2.5 font-medium text-right">Liberada</th>
                        <th className="px-4 py-2.5 font-medium text-right">Paga</th>
                        <th className="px-4 py-2.5 font-medium text-right">Total</th>
                        <th className="px-4 py-2.5 font-medium text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupos.map((g) => {
                        const aberto = expandidos.has(g.profissionalId);
                        return (
                          <Fragment key={g.profissionalId}>
                            <tr
                              className="border-b border-border/50 hover:bg-muted/40 cursor-pointer"
                              onClick={() => alternar(g.profissionalId)}
                            >
                              <td className="px-3 py-3 text-muted-foreground">
                                {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </td>
                              <td className="px-4 py-3 font-medium">{g.profissional}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{g.qtd}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-amber-600">{brl(g.prevista)}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-sky-600">{brl(g.liberada)}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{brl(g.paga)}</td>
                              <td className="px-4 py-3 text-right tabular-nums font-semibold">{brl(g.total)}</td>
                              <td className="px-4 py-3 text-right">
                                {isAdmin && g.idsLiberados.length > 0 ? (
                                  <Button
                                    size="sm"
                                    className="bg-brand-600 hover:bg-brand-700 gap-1.5 h-8"
                                    onClick={(e) => { e.stopPropagation(); pedirConfirmacaoGrupo(g); }}
                                  >
                                    <CheckCheck className="h-3.5 w-3.5" />
                                    Pagar {g.idsLiberados.length}
                                  </Button>
                                ) : (
                                  <span className="text-xs text-gray-400">—</span>
                                )}
                              </td>
                            </tr>

                            {aberto && (
                              <tr className="bg-muted/20">
                                <td colSpan={8} className="px-3 sm:px-6 py-4">
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm min-w-[880px]">
                                      <thead>
                                        <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                                          <th className="px-3 py-2 font-medium">Procedimento</th>
                                          <th className="px-3 py-2 font-medium">Paciente</th>
                                          <th className="px-3 py-2 font-medium text-right">Base</th>
                                          <th className="px-3 py-2 font-medium text-right">%</th>
                                          <th className="px-3 py-2 font-medium text-right">Valor</th>
                                          <th className="px-3 py-2 font-medium">Status</th>
                                          <th className="px-3 py-2 font-medium">Parcela</th>
                                          <th className="px-3 py-2 font-medium text-right">Ação</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {g.itens.map((c) => (
                                          <tr key={c.id} className="border-t border-border/50">
                                            <td className="px-3 py-2.5">
                                              <span className="font-medium text-gray-800">
                                                {c.procedimento ?? "Procedimento não informado"}
                                              </span>
                                              {c.dente != null && (
                                                <span className="text-xs text-muted-foreground ml-1.5">
                                                  dente {c.dente}
                                                </span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2.5">
                                              {c.paciente ?? <span className="text-muted-foreground">—</span>}
                                              {c.orcamentoNumero != null && (
                                                <span className="block text-[11px] text-muted-foreground font-mono">
                                                  orçamento #{c.orcamentoNumero}
                                                </span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                                              {brl(c.baseCalculo)}
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                                              {c.percentual != null
                                                ? `${c.percentual.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
                                                : "—"}
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                                              {brl(c.valor)}
                                            </td>
                                            <td className="px-3 py-2.5">
                                              <Badge
                                                className={`${STATUS_COMISSAO_CLASSE[c.status]} font-medium hover:opacity-100`}
                                                title={STATUS_COMISSAO_AJUDA[c.status]}
                                              >
                                                {STATUS_COMISSAO_LABEL[c.status]}
                                              </Badge>
                                              {c.status === "paga" && c.pagaEm && (
                                                <span className="block text-[11px] text-muted-foreground mt-0.5">
                                                  em {dataBR(c.pagaEm)}
                                                </span>
                                              )}
                                              {c.status === "liberada" && c.liberadaEm && (
                                                <span className="block text-[11px] text-muted-foreground mt-0.5">
                                                  desde {dataBR(c.liberadaEm)}
                                                </span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2.5 text-xs">
                                              {c.parcela ? (
                                                <>
                                                  <span className="text-gray-700">
                                                    Parcela {c.parcela.numero} · {brl(c.parcela.valor)}
                                                  </span>
                                                  <span className="block text-muted-foreground">
                                                    {STATUS_PARCELA_LABEL[c.parcela.status] ?? c.parcela.status}
                                                    {c.parcela.status === "pago"
                                                      ? ` em ${dataDiaBR(c.parcela.pagoEm)}`
                                                      : ` · vence ${dataDiaBR(c.parcela.vencimento)}`}
                                                  </span>
                                                </>
                                              ) : (
                                                <span className="text-muted-foreground">
                                                  Sem parcela vinculada
                                                </span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2.5 text-right">
                                              {isAdmin && c.status === "liberada" ? (
                                                <Button
                                                  size="sm" variant="outline"
                                                  className="h-7 text-xs border-brand-200 text-brand-700 hover:bg-brand-50"
                                                  onClick={() => pedirConfirmacaoItem(c)}
                                                >
                                                  Marcar paga
                                                </Button>
                                              ) : (
                                                <span className="text-xs text-gray-400">—</span>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <AlertDialog open={Boolean(confirmacao)} onOpenChange={(o) => { if (!o) setConfirmacao(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmacao?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{confirmacao?.detalhe}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-brand-600 hover:bg-brand-700"
              disabled={salvando}
              onClick={(e) => { e.preventDefault(); confirmarPagamento(); }}
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar repasse"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Comissoes;
