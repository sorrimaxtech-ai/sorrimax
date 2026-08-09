import { traduzErro } from "@/lib/erros";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Plus, Trash2, Check, X, Loader2, Send, Wallet, Receipt, Ban,
} from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { Odontograma } from "@/components/odontograma/Odontograma";
import type { FaceDental, RegistroOdontograma, Denticao } from "@/types/odonto";
import {
  obterOrcamento, listarItens, adicionarItem, removerItem, definirStatusItem,
  publicarOrcamento, definirDesconto, gerarDebitos, listarProcedimentos,
  cancelarOrcamento, excluirOrcamento,
  listarRegioesFaciais, precoDoProcedimento, brl, type RegiaoFacial,
  STATUS_LABEL, STATUS_CLASSE, type StatusOrcamento,
} from "@/services/orcamentos";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

// ============================================================================
// Editor de Orçamento
// ----------------------------------------------------------------------------
// Aqui o odontograma sai do papel: clicar num dente/face preenche o alvo do
// procedimento. Cada item é aprovado ou recusado INDIVIDUALMENTE — é assim que
// a decisão acontece na cadeira ("faço a restauração, o implante fica pra depois").
// Aprovar dispara, no servidor: odontograma + funil de vendas + financeiro.
// ============================================================================

type Aba = "permanente" | "decidua" | "hof";

const OrcamentoEditor = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { clinicaId } = useTenant();

  const [orc, setOrc] = useState<any>(null);
  const [itens, setItens] = useState<any[]>([]);
  const [procedimentos, setProcedimentos] = useState<any[]>([]);
  const [regioes, setRegioes] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // formulário de novo item
  const [aba, setAba] = useState<Aba>("permanente");
  const [procId, setProcId] = useState("");
  const [valor, setValor] = useState("");
  const [dente, setDente] = useState<number | null>(null);
  const [faces, setFaces] = useState<FaceDental[]>([]);
  const [regiao, setRegiao] = useState("");
  const [regiaoFacial, setRegiaoFacial] = useState<RegiaoFacial | "">("");

  // parcelamento
  const [forma, setForma] = useState("pix");
  const [parcelas, setParcelas] = useState("1");

  const recarregar = useCallback(async () => {
    if (!id) return;
    setCarregando(true);
    try {
      const [o, i] = await Promise.all([obterOrcamento(id), listarItens(id)]);
      setOrc(o);
      setItens(i);
    } catch (e: any) {
      toast.error("Erro ao carregar", { description: traduzErro(e) });
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => { recarregar(); }, [recarregar]);

  useEffect(() => {
    if (!clinicaId) return;
    listarProcedimentos(clinicaId).then(setProcedimentos).catch(() => {});
    listarRegioesFaciais().then(setRegioes).catch(() => {});
  }, [clinicaId]);

  // preço sugerido = tabela do convênio, com fallback no valor padrão
  useEffect(() => {
    if (!procId) return;
    const p = procedimentos.find((x) => x.id === procId);
    if (!p) return;
    precoDoProcedimento(procId, orc?.convenio_id ?? null, Number(p.valor ?? 0))
      .then((v) => setValor(String(v)))
      .catch(() => setValor(String(p.valor ?? 0)));
  }, [procId, procedimentos, orc?.convenio_id]);

  // itens aprovados viram marcações no odontograma (feedback visual imediato)
  const registros: RegistroOdontograma[] = useMemo(() => itens
    .filter((i) => i.dente != null)
    .map((i) => ({
      id: i.id,
      paciente_id: orc?.paciente_id ?? "",
      denticao: i.denticao as Denticao,
      dente: i.dente,
      faces: (i.faces ?? []) as FaceDental[],
      regiao: i.regiao,
      procedimento_id: i.procedimento_id,
      procedimento_nome: i.procedimentos?.nome,
      estado: i.status === "aprovado" ? "finalizado" : i.status === "recusado" ? "condicao" : "planejado",
      condicao: i.status === "recusado" ? "Recusado" : null,
      anotacao: null,
      executado_em: null,
    })), [itens, orc?.paciente_id]);

  const somaAprovada = itens.filter((i) => i.status === "aprovado")
    .reduce((s, i) => s + Number(i.total ?? 0), 0);

  const alvoDescricao = (i: any) => {
    if (i.dente) return `Dente ${i.dente}${i.faces?.length ? ` · ${i.faces.join(", ")}` : ""}`;
    if (i.regiao_facial) return regioes.find((r) => r.codigo === i.regiao_facial)?.rotulo ?? i.regiao_facial;
    if (i.regiao) return i.regiao;
    return "Geral";
  };

  const adicionar = async () => {
    if (!clinicaId || !id || !procId) { toast.error("Escolha o procedimento"); return; }
    const v = Number(String(valor).replace(",", "."));
    if (!Number.isFinite(v) || v < 0) { toast.error("Valor inválido"); return; }
    setSalvando(true);
    try {
      await adicionarItem({
        clinicaId, orcamentoId: id, procedimentoId: procId, valorUnitario: v,
        denticao: aba === "decidua" ? "decidua" : "permanente",
        dente: aba === "hof" ? null : dente,
        faces: aba === "hof" ? [] : faces,
        regiao: aba === "hof" ? null : (regiao || null),
        regiaoFacial: aba === "hof" ? ((regiaoFacial || null) as RegiaoFacial | null) : null,
        ordem: itens.length,
      });
      setProcId(""); setValor(""); setDente(null); setFaces([]); setRegiao(""); setRegiaoFacial("");
      await recarregar();
      toast.success("Tratamento adicionado");
    } catch (e: any) {
      toast.error("Erro ao adicionar", { description: traduzErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  const mudarItem = async (itemId: string, status: "aprovado" | "recusado" | "pendente") => {
    try {
      await definirStatusItem(itemId, status);
      await recarregar();
    } catch (e: any) {
      toast.error("Erro ao atualizar item", { description: traduzErro(e) });
    }
  };

  const publicar = async () => {
    if (!id) return;
    try {
      await publicarOrcamento(id);
      await recarregar();
      toast.success("Orçamento enviado", {
        description: "Entrou no funil de vendas como oportunidade em aberto.",
      });
    } catch (e: any) {
      toast.error("Erro ao publicar", { description: traduzErro(e) });
    }
  };

  const [confirmando, setConfirmando] = useState<"excluir" | "cancelar" | null>(null);

  const confirmarAcao = async () => {
    if (!id || !confirmando) return;
    const excluindo = confirmando === "excluir";
    setConfirmando(null);
    try {
      if (excluindo) {
        await excluirOrcamento(id);
        toast.success("Rascunho excluído");
        navigate("/orcamentos");
      } else {
        await cancelarOrcamento(id);
        await recarregar();
        toast.success("Orçamento cancelado");
      }
    } catch (e: any) {
      toast.error(excluindo ? "Não foi possível excluir" : "Não foi possível cancelar", {
        description: traduzErro(e),
      });
    }
  };

  const faturar = async () => {
    if (!id) return;
    setSalvando(true);
    try {
      await gerarDebitos({ orcamentoId: id, forma, parcelas: Number(parcelas) });
      await recarregar();
      toast.success("Contas a receber geradas", {
        description: `${parcelas}x — comissões do profissional já previstas.`,
      });
    } catch (e: any) {
      toast.error("Não foi possível faturar", { description: traduzErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex min-h-full bg-gray-50">
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!orc) {
    return (
      <div className="flex min-h-full bg-gray-50">
        <main className="flex-1 min-w-0 flex flex-col items-center justify-center gap-3">
          <p className="text-gray-700">Orçamento não encontrado.</p>
          <Button variant="outline" onClick={() => navigate("/orcamentos")}>Voltar</Button>
        </main>
      </div>
    );
  }

  const podeFaturar = ["aprovado", "aprovado_parcial"].includes(orc.status) && somaAprovada > 0;

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-8 max-w-6xl">
          {/* Cabeçalho */}
          <div className="flex items-start gap-3 mb-6">
            <Button variant="ghost" size="icon" onClick={() => navigate("/orcamentos")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900">
                  Orçamento #{orc.numero}
                </h1>
                <Badge className={`${STATUS_CLASSE[orc.status as StatusOrcamento]} border-0`}>
                  {STATUS_LABEL[orc.status as StatusOrcamento]}
                </Badge>
              </div>
              <p className="text-sm text-gray-600 mt-0.5">
                {orc.pacientes?.nome_completo} · {orc.convenios?.nome ?? "Particular"}
                {orc.titulo ? ` · ${orc.titulo}` : ""}
              </p>
            </div>
            {orc.status === "rascunho" && (
              <Button onClick={publicar} className="bg-brand-600 hover:bg-brand-700 gap-2">
                <Send className="h-4 w-4" /> Enviar ao paciente
              </Button>
            )}
            {/* Ciclo de vida completo: rascunho errado se exclui; proposta morta
                se cancela (débito/funil ficam intactos — auditoria A2). */}
            {orc.status === "rascunho" ? (
              <Button variant="outline" className="gap-2 text-destructive hover:text-destructive"
                      onClick={() => setConfirmando("excluir")}>
                <Trash2 className="h-4 w-4" /> Excluir rascunho
              </Button>
            ) : !["cancelado", "reprovado", "expirado"].includes(orc.status) && (
              <Button variant="outline" className="gap-2 text-destructive hover:text-destructive"
                      onClick={() => setConfirmando("cancelar")}>
                <Ban className="h-4 w-4" /> Cancelar
              </Button>
            )}
          </div>

          <AlertDialog open={confirmando !== null} onOpenChange={(v) => !v && setConfirmando(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {confirmando === "excluir" ? "Excluir este rascunho?" : "Cancelar este orçamento?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirmando === "excluir"
                    ? "O rascunho e seus itens somem de vez. Só é possível porque ele ainda não gerou débitos nem entrou no funil."
                    : "O orçamento fica marcado como cancelado e sai das pendências. Débitos já gerados continuam no financeiro."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Voltar</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                   onClick={confirmarAcao}>
                  {confirmando === "excluir" ? "Excluir" : "Cancelar orçamento"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Adicionar tratamento */}
          <Card className="border-gray-100 mb-6">
            <CardContent className="p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Adicionar tratamento</h2>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Procedimento *</Label>
                  <Select value={procId} onValueChange={setProcId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o procedimento" /></SelectTrigger>
                    <SelectContent>
                      {procedimentos.length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          Cadastre procedimentos primeiro
                        </div>
                      )}
                      {procedimentos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome}{p.especialidade ? ` · ${p.especialidade}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Valor *</Label>
                  <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
                </div>
                <div className="space-y-1.5">
                  <Label>Alvo</Label>
                  <Input
                    readOnly
                    value={
                      aba === "hof"
                        ? (regioes.find((r) => r.codigo === regiaoFacial)?.rotulo ?? "—")
                        : dente
                          ? `Dente ${dente}${faces.length ? ` (${faces.join(", ")})` : ""}`
                          : regiao || "—"
                    }
                    className="bg-muted/40"
                  />
                </div>
              </div>

              {/* abas do mapa */}
              <div className="flex gap-1 border-b border-border mb-3">
                {([
                  { k: "permanente", r: "Permanentes" },
                  { k: "decidua", r: "Decíduos" },
                  { k: "hof", r: "HOF (facial)" },
                ] as const).map((t) => (
                  <button key={t.k} onClick={() => setAba(t.k)}
                    className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                      aba === t.k ? "border-brand-600 text-brand-700" : "border-transparent text-muted-foreground hover:text-foreground")}>
                    {t.r}
                  </button>
                ))}
              </div>

              {aba === "hof" ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-2">
                  {regioes.map((r) => (
                    <button key={r.codigo} onClick={() => setRegiaoFacial(r.codigo as RegiaoFacial)}
                      className={cn("text-left text-sm px-3 py-2 rounded-lg border transition-colors",
                        regiaoFacial === r.codigo
                          ? "border-brand-500 bg-brand-50 text-brand-800"
                          : "border-border hover:bg-muted/50")}>
                      <span className="block">{r.rotulo}</span>
                      <span className="block text-[10px] text-muted-foreground">{r.grupo}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <Odontograma
                  registros={registros}
                  denticaoInicial={aba === "decidua" ? "decidua" : "permanente"}
                  onSelecionarDente={(d) => { setDente(d); setFaces([]); setRegiao(""); }}
                  onSelecionarFace={(d, f) => {
                    setDente(d);
                    setRegiao("");
                    setFaces((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]);
                  }}
                  onSelecionarRegiao={(r) => { setRegiao(r); setDente(null); setFaces([]); }}
                />
              )}

              <div className="flex justify-end mt-4">
                <Button onClick={adicionar} disabled={salvando || !procId}
                        className="bg-brand-600 hover:bg-brand-700 gap-2">
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Adicionar tratamento
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Itens */}
          <Card className="border-gray-100 mb-6">
            <CardContent className="p-0">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Tratamentos do orçamento</h2>
                <p className="text-sm text-muted-foreground">
                  Aprovado: <span className="font-semibold text-emerald-700">{brl(somaAprovada)}</span>
                  {" de "}{brl(Number(orc.total_itens ?? 0))}
                </p>
              </div>

              {itens.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  Nenhum tratamento ainda. Escolha o procedimento e clique no dente acima.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr className="text-left">
                      <th className="px-5 py-2 font-medium">Procedimento</th>
                      <th className="px-5 py-2 font-medium">Alvo</th>
                      <th className="px-5 py-2 font-medium text-right">Valor</th>
                      <th className="px-5 py-2 font-medium text-center">Decisão do paciente</th>
                      <th className="px-5 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((i) => (
                      <tr key={i.id} className="border-t border-border/50">
                        <td className="px-5 py-3 font-medium">{i.procedimentos?.nome ?? "—"}</td>
                        <td className="px-5 py-3 text-muted-foreground">{alvoDescricao(i)}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{brl(Number(i.total))}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <Button size="sm" variant={i.status === "aprovado" ? "default" : "outline"}
                              onClick={() => mudarItem(i.id, i.status === "aprovado" ? "pendente" : "aprovado")}
                              className={cn("h-7 gap-1 text-xs",
                                i.status === "aprovado" && "bg-emerald-600 hover:bg-emerald-700")}>
                              <Check className="h-3 w-3" /> Aprovar
                            </Button>
                            <Button size="sm" variant={i.status === "recusado" ? "destructive" : "outline"}
                              onClick={() => mudarItem(i.id, i.status === "recusado" ? "pendente" : "recusado")}
                              className="h-7 gap-1 text-xs">
                              <X className="h-3 w-3" /> Recusar
                            </Button>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Button size="icon" variant="ghost" className="h-7 w-7"
                                  onClick={async () => { await removerItem(i.id); await recarregar(); }}>
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Faturamento */}
          {podeFaturar && (
            <Card className="border-brand-200 bg-brand-50/40">
              <CardContent className="p-5">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-1">
                  <Wallet className="h-4 w-4 text-emerald-600" /> Faturar o aprovado
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Gera as contas a receber de {brl(somaAprovada)} e já prevê a comissão do profissional.
                  A comissão só é liberada quando a parcela for efetivamente paga.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label>Forma de pagamento</Label>
                    <Select value={forma} onValueChange={setForma}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["pix","dinheiro","debito","credito","boleto","transferencia","convenio","financiamento"].map((f) => (
                          <SelectItem key={f} value={f}>{f[0].toUpperCase() + f.slice(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Parcelas</Label>
                    <Select value={parcelas} onValueChange={setParcelas}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((n) => (
                          <SelectItem key={n} value={n}>{n}x</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={faturar} disabled={salvando}
                          className="bg-brand-600 hover:bg-brand-700 gap-2">
                    {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                    Gerar contas a receber
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default OrcamentoEditor;
