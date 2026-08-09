import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  CalendarDays, CheckCircle2, ChevronDown, Filter, ListFilter, Loader2, LogIn,
  MoreHorizontal, Pencil, Plus, Repeat, Trash2, Users, XCircle,
} from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "sonner";
import { traduzErro } from "@/lib/erros";
import { ConsultaDialog } from "@/components/consultas/ConsultaDialog";
import {
  MODALIDADE_LABEL, STATUS_CANCELAMENTO, STATUS_CLASSE, STATUS_EM_ABERTO,
  STATUS_ENCERRADOS, STATUS_LABEL, STATUS_ORDEM, brl, dataBR, definirStatus,
  excluirConsulta, filtrosPadrao, horaBR, listarCadeiras, listarConsultas,
  listarProcedimentos, listarProfissionais,
  type ConsultaLinha, type FiltrosConsulta, type Modalidade, type StatusConsulta,
} from "@/services/consultas";

// ============================================================================
// Consultas — a lista operacional da recepção
// ----------------------------------------------------------------------------
// O filtro é o produto aqui: o dia a dia da recepção é "quem chega hoje, quem
// ainda não confirmou, quem faltou". Por isso o período já vem nos próximos 7
// dias e o macro "Em aberto" (pendente + agendado + confirmado) fica a um clique.
// Filtro só vale depois de "Aplicar" — digitar não deve disparar consulta.
// ============================================================================

const TODOS = "__todos__";

/**
 * Cabeçalho e linha ficam FORA do componente da página de propósito: definidos
 * dentro, o React trocaria o tipo do componente a cada render e desmontaria a
 * tabela inteira (fechando dropdown aberto) sempre que um status mudasse.
 */
const CabecalhoTabela = ({ comPaciente = true }: { comPaciente?: boolean }) => (
  <thead className="border-b border-border bg-muted/30">
    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
      <th className="px-4 py-2.5 font-medium">Data / Hora</th>
      {comPaciente && <th className="px-4 py-2.5 font-medium">Paciente</th>}
      <th className="px-4 py-2.5 font-medium">Procedimento</th>
      <th className="px-4 py-2.5 font-medium">Profissional</th>
      <th className="px-4 py-2.5 font-medium">Cadeira</th>
      <th className="px-4 py-2.5 font-medium">Modalidade</th>
      <th className="px-4 py-2.5 font-medium">Status</th>
      <th className="px-4 py-2.5 font-medium text-right">Valor</th>
      <th className="px-4 py-2.5 font-medium text-right">Ações</th>
    </tr>
  </thead>
);

interface LinhaProps {
  c: ConsultaLinha;
  mostrarPaciente?: boolean;
  onEditar: (c: ConsultaLinha) => void;
  onStatus: (c: ConsultaLinha, s: StatusConsulta) => void;
  onCancelar: (c: ConsultaLinha) => void;
  onExcluir: (c: ConsultaLinha) => void;
}

const LinhaConsulta = ({
  c, mostrarPaciente = true, onEditar, onStatus, onCancelar, onExcluir,
}: LinhaProps) => (
  <tr className="border-b border-border/50 hover:bg-muted/40">
    <td className="px-4 py-3 whitespace-nowrap">
      <span className="font-medium">{dataBR(c.inicio)}</span>
      <span className="text-muted-foreground"> · {horaBR(c.inicio)}–{horaBR(c.fim)}</span>
    </td>
    {mostrarPaciente && (
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="font-medium">{c.pacientes?.nome_completo ?? "—"}</span>
          {c.recorrencia_id && (
            <Repeat className="h-3 w-3 text-brand-600 shrink-0" aria-label="Parte de uma série" />
          )}
        </div>
        {c.pacientes?.celular && (
          <span className="text-xs text-muted-foreground">{c.pacientes.celular}</span>
        )}
      </td>
    )}
    <td className="px-4 py-3 text-muted-foreground">{c.procedimentos?.nome ?? "—"}</td>
    <td className="px-4 py-3 text-muted-foreground">{c.profissional?.full_name ?? "—"}</td>
    <td className="px-4 py-3 text-muted-foreground">{c.cadeiras?.nome ?? "—"}</td>
    <td className="px-4 py-3 text-muted-foreground">{MODALIDADE_LABEL[c.modalidade]}</td>
    <td className="px-4 py-3">
      <Badge className={`${STATUS_CLASSE[c.status]} font-medium hover:opacity-100`}>
        {STATUS_LABEL[c.status]}
      </Badge>
    </td>
    <td className="px-4 py-3 text-right tabular-nums">{brl(Number(c.total ?? 0))}</td>
    <td className="px-4 py-3 text-right">
      <div className="flex items-center justify-end gap-1">
        {!STATUS_ENCERRADOS.includes(c.status) && c.status !== "em_atendimento" && (
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-purple-700 hover:text-purple-800"
                  onClick={() => onStatus(c, "em_atendimento")}>
            <LogIn className="h-3.5 w-3.5" /> Check-in
          </Button>
        )}
        {c.status === "em_atendimento" && (
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-brand-700 hover:text-brand-800"
                  onClick={() => onStatus(c, "concluido")}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Concluir
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Ações da consulta">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => onEditar(c)}>
              <Pencil className="h-4 w-4 mr-2" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatus(c, "confirmado")}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Confirmar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatus(c, "concluido")}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Concluir
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ListFilter className="h-4 w-4 mr-2" /> Mudar status
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {STATUS_ORDEM.map((s) => (
                  <DropdownMenuItem key={s} disabled={s === c.status} onClick={() => onStatus(c, s)}>
                    {STATUS_LABEL[s]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onCancelar(c)}>
              <XCircle className="h-4 w-4 mr-2" /> Cancelar com motivo
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => onExcluir(c)}>
              <Trash2 className="h-4 w-4 mr-2" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </td>
  </tr>
);

const Consultas = () => {
  const { clinicaId, carregando: carregandoCtx } = useTenant();

  const [rascunho, setRascunho] = useState<FiltrosConsulta>(filtrosPadrao);
  const [filtros, setFiltros] = useState<FiltrosConsulta>(filtrosPadrao);
  const [lista, setLista] = useState<ConsultaLinha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [visao, setVisao] = useState<"lista" | "paciente">("lista");

  const [profissionais, setProfissionais] = useState<any[]>([]);
  const [procedimentos, setProcedimentos] = useState<any[]>([]);
  const [cadeiras, setCadeiras] = useState<any[]>([]);

  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<ConsultaLinha | null>(null);
  const [paraExcluir, setParaExcluir] = useState<ConsultaLinha | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [paraCancelar, setParaCancelar] = useState<ConsultaLinha | null>(null);
  const [statusCancel, setStatusCancel] = useState<StatusConsulta>("cancelado");
  const [motivoCancel, setMotivoCancel] = useState("");
  const [cancelando, setCancelando] = useState(false);

  // ------------------------------------------------------------ dados
  const carregar = useCallback(async () => {
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; }
    setCarregando(true);
    try {
      setLista(await listarConsultas(clinicaId, filtros));
    } catch (e: any) {
      toast.error("Erro ao carregar consultas", { description: traduzErro(e) });
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, carregandoCtx, filtros]);

  useEffect(() => { carregar(); }, [carregar]);

  // cadastros de apoio só para popular os selects de filtro
  useEffect(() => {
    if (!clinicaId) return;
    let vivo = true;
    (async () => {
      try {
        const [prof, proc, cad] = await Promise.all([
          listarProfissionais(clinicaId),
          listarProcedimentos(clinicaId),
          listarCadeiras(clinicaId),
        ]);
        if (!vivo) return;
        setProfissionais(prof);
        setProcedimentos(proc);
        setCadeiras(cad);
      } catch (e: any) {
        if (vivo) toast.error("Erro ao carregar filtros", { description: traduzErro(e) });
      }
    })();
    return () => { vivo = false; };
  }, [clinicaId]);

  // ------------------------------------------------------------ ações
  const mudarStatus = useCallback(async (c: ConsultaLinha, status: StatusConsulta) => {
    if (c.status === status) return;
    const anterior = c.status;
    // atualização otimista: a recepção clica em sequência, esperar o round-trip trava o fluxo
    setLista((l) => l.map((x) => (x.id === c.id ? { ...x, status } : x)));
    try {
      await definirStatus(c.id, status);
      toast.success(`Status alterado para ${STATUS_LABEL[status]}`);
    } catch (e: any) {
      setLista((l) => l.map((x) => (x.id === c.id ? { ...x, status: anterior } : x)));
      toast.error("Não foi possível mudar o status", { description: traduzErro(e) });
    }
  }, []);

  const confirmarCancelamento = async () => {
    if (!paraCancelar) return;
    setCancelando(true);
    try {
      await definirStatus(paraCancelar.id, statusCancel, motivoCancel.trim() || null);
      setLista((l) => l.map((x) => (x.id === paraCancelar.id
        ? { ...x, status: statusCancel, motivo_cancelamento: motivoCancel.trim() || null }
        : x)));
      toast.success(`Consulta marcada como ${STATUS_LABEL[statusCancel]}`);
      setParaCancelar(null);
      setMotivoCancel("");
    } catch (e: any) {
      toast.error("Não foi possível cancelar", { description: traduzErro(e) });
    } finally {
      setCancelando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!paraExcluir) return;
    setExcluindo(true);
    try {
      await excluirConsulta(paraExcluir.id);
      setLista((l) => l.filter((x) => x.id !== paraExcluir.id));
      toast.success("Consulta excluída");
      setParaExcluir(null);
    } catch (e: any) {
      toast.error("Não foi possível excluir", { description: traduzErro(e) });
    } finally {
      setExcluindo(false);
    }
  };

  // ------------------------------------------------------------ derivações
  const resumo = useMemo(() => {
    const emAberto = lista.filter((c) => STATUS_EM_ABERTO.includes(c.status)).length;
    const concluidas = lista.filter((c) => c.status === "concluido").length;
    const faltas = lista.filter((c) => c.status === "nao_compareceu").length;
    // receita prevista ignora o que já caiu fora da agenda — não é dinheiro esperado
    const previsto = lista
      .filter((c) => !["cancelado", "cancelado_pelo_cliente", "recusado", "desmarcado", "nao_compareceu"].includes(c.status))
      .reduce((s, c) => s + Number(c.total ?? 0), 0);
    return { total: lista.length, emAberto, concluidas, faltas, previsto };
  }, [lista]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, { nome: string; itens: ConsultaLinha[] }>();
    for (const c of lista) {
      const chave = c.paciente_id;
      if (!mapa.has(chave)) {
        mapa.set(chave, { nome: c.pacientes?.nome_completo ?? "Paciente removido", itens: [] });
      }
      mapa.get(chave)!.itens.push(c);
    }
    return [...mapa.entries()]
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [lista]);

  const rotuloStatus = rascunho.status.length === 0
    ? "Todos os status"
    : rascunho.status.length === 1
      ? STATUS_LABEL[rascunho.status[0]]
      : `${rascunho.status.length} status`;

  const alternarStatus = (s: StatusConsulta) =>
    setRascunho((f) => ({
      ...f,
      status: f.status.includes(s) ? f.status.filter((x) => x !== s) : [...f.status, s],
    }));

  const emAbertoAtivo = STATUS_EM_ABERTO.every((s) => rascunho.status.includes(s))
    && rascunho.status.length === STATUS_EM_ABERTO.length;

  const aplicar = () => setFiltros({ ...rascunho });
  const limpar = () => { const p = filtrosPadrao(); setRascunho(p); setFiltros(p); };

  // handlers estáveis passados para a linha (definida fora deste componente)
  const abrirEdicao = useCallback((c: ConsultaLinha) => { setEmEdicao(c); setDialogAberto(true); }, []);
  const abrirCancelamento = useCallback((c: ConsultaLinha) => {
    setParaCancelar(c);
    setStatusCancel("cancelado");
    setMotivoCancel(c.motivo_cancelamento ?? "");
  }, []);
  const abrirExclusao = useCallback((c: ConsultaLinha) => setParaExcluir(c), []);

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-8">
          <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <CalendarDays className="h-6 w-6 text-brand-600" /> Consultas
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                Confirme, faça check-in e conclua os atendimentos do período.
              </p>
            </div>
            <Button
              onClick={() => { setEmEdicao(null); setDialogAberto(true); }}
              className="bg-brand-600 hover:bg-brand-700 gap-2"
            >
              <Plus className="h-4 w-4" /> Nova consulta
            </Button>
          </div>

          {/* Resumo do período filtrado */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { rot: "Consultas no período", val: String(resumo.total), cor: "text-gray-900", sub: `${resumo.emAberto} em aberto` },
              { rot: "Concluídas", val: String(resumo.concluidas), cor: "text-emerald-600", sub: "atendimentos finalizados" },
              { rot: "Não compareceram", val: String(resumo.faltas), cor: "text-pink-600", sub: "faltas registradas" },
              { rot: "Receita prevista", val: brl(resumo.previsto), cor: "text-sky-600", sub: "exclui cancelados e faltas" },
            ].map((k) => (
              <Card key={k.rot} className="border-gray-100">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500">{k.rot}</p>
                  <p className={`text-xl font-bold mt-0.5 ${k.cor}`}>{k.val}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filtros */}
          <Card className="border-gray-100 mb-4">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Filter className="h-4 w-4 text-brand-600" /> Filtros
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Status (multi) */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Status</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between font-normal">
                        <span className="truncate">{rotuloStatus}</span>
                        <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-60">
                      <DropdownMenuLabel className="text-xs">Atalhos</DropdownMenuLabel>
                      <DropdownMenuCheckboxItem
                        checked={emAbertoAtivo}
                        onCheckedChange={(v) =>
                          setRascunho((f) => ({ ...f, status: v ? [...STATUS_EM_ABERTO] : [] }))}
                      >
                        Em aberto (pendente + agendado + confirmado)
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuSeparator />
                      {STATUS_ORDEM.map((s) => (
                        <DropdownMenuCheckboxItem
                          key={s}
                          checked={rascunho.status.includes(s)}
                          onCheckedChange={() => alternarStatus(s)}
                        >
                          {STATUS_LABEL[s]}
                        </DropdownMenuCheckboxItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setRascunho((f) => ({ ...f, status: [] }))}>
                        Limpar seleção
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Modalidade */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Modalidade</Label>
                  <Select
                    value={rascunho.modalidade ?? TODOS}
                    onValueChange={(v) =>
                      setRascunho((f) => ({ ...f, modalidade: v === TODOS ? null : (v as Modalidade) }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>Todas</SelectItem>
                      {(Object.keys(MODALIDADE_LABEL) as Modalidade[]).map((m) => (
                        <SelectItem key={m} value={m}>{MODALIDADE_LABEL[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Profissional */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Profissional</Label>
                  <Select
                    value={rascunho.profissionalId ?? TODOS}
                    onValueChange={(v) =>
                      setRascunho((f) => ({ ...f, profissionalId: v === TODOS ? null : v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>Todos</SelectItem>
                      {profissionais.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name ?? "Sem nome"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Procedimento */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Procedimento</Label>
                  <Select
                    value={rascunho.servicoId ?? TODOS}
                    onValueChange={(v) =>
                      setRascunho((f) => ({ ...f, servicoId: v === TODOS ? null : v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>Todos</SelectItem>
                      {procedimentos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Cadeira */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Cadeira</Label>
                  <Select
                    value={rascunho.cadeiraId ?? TODOS}
                    onValueChange={(v) =>
                      setRascunho((f) => ({ ...f, cadeiraId: v === TODOS ? null : v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>Todas</SelectItem>
                      {cadeiras.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Paciente */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Paciente</Label>
                  <Input
                    placeholder="Nome do paciente"
                    value={rascunho.paciente}
                    onChange={(e) => setRascunho((f) => ({ ...f, paciente: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && aplicar()}
                  />
                </div>

                {/* Período */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">De</Label>
                  <Input
                    type="date"
                    value={rascunho.dataInicial}
                    onChange={(e) => setRascunho((f) => ({ ...f, dataInicial: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Até</Label>
                  <Input
                    type="date"
                    value={rascunho.dataFinal}
                    onChange={(e) => setRascunho((f) => ({ ...f, dataFinal: e.target.value }))}
                  />
                </div>
              </div>

              <Separator />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => setVisao("lista")}
                    className={`px-3 py-1.5 text-xs font-medium rounded ${
                      visao === "lista" ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    Lista
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisao("paciente")}
                    className={`px-3 py-1.5 text-xs font-medium rounded inline-flex items-center gap-1.5 ${
                      visao === "paciente" ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <Users className="h-3.5 w-3.5" /> Por paciente
                  </button>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={limpar}>Limpar</Button>
                  <Button onClick={aplicar} className="bg-brand-600 hover:bg-brand-700">
                    Aplicar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resultado */}
          <Card className="border-gray-100">
            <CardContent className="p-0">
              {carregandoCtx || carregando ? (
                <div className="p-12 flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !clinicaId ? (
                <div className="p-12 text-center">
                  <CalendarDays className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                  <p className="font-medium text-gray-800">Clínica não identificada</p>
                  <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                    Entre com um usuário vinculado a uma clínica para ver a agenda de consultas.
                  </p>
                </div>
              ) : lista.length === 0 ? (
                <div className="p-12 text-center">
                  <CalendarDays className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                  <p className="font-medium text-gray-800">Nenhuma consulta neste filtro</p>
                  <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                    O período começa nos próximos 7 dias. Amplie as datas, limpe os filtros ou
                    agende a primeira consulta em "Nova consulta".
                  </p>
                </div>
              ) : visao === "lista" ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[1000px]">
                    <CabecalhoTabela />
                    <tbody>
                      {lista.map((c) => <LinhaConsulta key={c.id} c={c} onEditar={abrirEdicao} onStatus={mudarStatus} onCancelar={abrirCancelamento} onExcluir={abrirExclusao} />)}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {grupos.map((g) => {
                    const totalGrupo = g.itens.reduce((s, c) => s + Number(c.total ?? 0), 0);
                    return (
                      <div key={g.id}>
                        <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{g.nome}</span>
                            <Badge variant="secondary" className="text-[11px]">
                              {g.itens.length} consulta{g.itens.length > 1 ? "s" : ""}
                            </Badge>
                          </div>
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {brl(totalGrupo)}
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm min-w-[900px]">
                            <CabecalhoTabela comPaciente={false} />
                            <tbody>
                              {g.itens.map((c) => (
                                <LinhaConsulta key={c.id} c={c} mostrarPaciente={false}
                                  onEditar={abrirEdicao} onStatus={mudarStatus} onCancelar={abrirCancelamento} onExcluir={abrirExclusao} />
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <ConsultaDialog
        aberto={dialogAberto}
        consulta={emEdicao}
        onFechar={() => { setDialogAberto(false); setEmEdicao(null); }}
        onSalvo={() => { setDialogAberto(false); setEmEdicao(null); carregar(); }}
      />

      {/* Cancelamento com motivo */}
      <Dialog open={!!paraCancelar} onOpenChange={(o) => { if (!o && !cancelando) setParaCancelar(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar consulta</DialogTitle>
            <DialogDescription>
              {paraCancelar
                ? `${paraCancelar.pacientes?.nome_completo ?? "Paciente"} · ${dataBR(paraCancelar.inicio)} às ${horaBR(paraCancelar.inicio)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Motivo do cancelamento</Label>
              <Select value={statusCancel} onValueChange={(v) => setStatusCancel(v as StatusConsulta)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_CANCELAMENTO.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Textarea
                rows={3}
                value={motivoCancel}
                onChange={(e) => setMotivoCancel(e.target.value)}
                placeholder="Ex.: paciente pediu para remarcar por motivo de trabalho"
              />
              <p className="text-[11px] text-gray-400">
                O horário volta a ficar livre na agenda assim que o cancelamento é salvo.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setParaCancelar(null)} disabled={cancelando}>
              Voltar
            </Button>
            <Button onClick={confirmarCancelamento} disabled={cancelando}
                    className="bg-red-600 hover:bg-red-700 gap-2">
              {cancelando && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exclusão definitiva */}
      <AlertDialog open={!!paraExcluir} onOpenChange={(o) => { if (!o && !excluindo) setParaExcluir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta consulta?</AlertDialogTitle>
            <AlertDialogDescription>
              {paraExcluir
                ? `${paraExcluir.pacientes?.nome_completo ?? "Paciente"} · ${dataBR(paraExcluir.inicio)} às ${horaBR(paraExcluir.inicio)}. `
                : ""}
              A exclusão é permanente e some do histórico. Se o atendimento não aconteceu,
              prefira cancelar — o registro fica para consulta futura.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmarExclusao(); }}
                               disabled={excluindo}
                               className="bg-red-600 hover:bg-red-700">
              {excluindo && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Consultas;
