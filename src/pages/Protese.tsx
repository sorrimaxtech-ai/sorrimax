import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable,
  useSensor, useSensors, closestCorners,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Smile, Loader2, Plus, AlertTriangle, Pencil, Trash2, GripVertical,
  ChevronLeft, ChevronRight, CalendarClock, Building2, UserX,
} from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import { DENTES_PERMANENTES, DENTES_DECIDUOS, isArcadaSuperior } from "@/types/odonto";
import { CampoMoeda } from "@/components/ui/campo-moeda";
import {
  listarProteses, listarPacientesResumo, criarProtese, atualizarProtese, moverEtapa,
  excluirProtese, validarProtese, laboratoriosConhecidos, resumirProteses,
  mensagemErro, brl, dataBr, hojeISO,
  ETAPAS_PROTESE, ETAPA_LABEL, ETAPA_CLASSE, ETAPA_PONTO, ETAPA_AJUDA,
  type ProteseServico, type EtapaProtese, type ProteseInput,
} from "@/services/estoque";

// ============================================================================
// Controle de Prótese — onde cada peça está entre a moldagem e a instalação
// ----------------------------------------------------------------------------
// Kanban em vez de lista porque a pergunta que a clínica faz não é "quais
// próteses existem", é "o que está preso no laboratório e o que já devia ter
// voltado". Coluna = etapa, e o cartão vermelho é a peça atrasada.
//
// Arrastar (dnd-kit) E botões de avançar/voltar convivem de propósito: o mouse
// é rápido, mas em tablet — o aparelho que roda na cadeira — arrastar entre
// colunas com scroll horizontal é frustrante. Os botões são o caminho robusto.
//
// A mudança de etapa é OTIMISTA: o card pula de coluna antes do banco
// responder e volta sozinho se der erro. Com o board inteiro recarregando a
// cada movimento, o uso vira "arrasta e espera", que ninguém faz duas vezes.
// ============================================================================

const FORM_VAZIO: ProteseInput = {
  pacienteId: "", laboratorio: "", tipoPeca: "", dentes: [], cor: "",
  previsaoRetorno: "", valorCusto: null, observacoes: "",
};

/** Tipos de peça mais comuns — sugestão livre, o campo aceita qualquer texto. */
const TIPOS_PECA = [
  "Coroa unitária", "Coroa sobre implante", "Prótese fixa (ponte)",
  "Prótese total", "Prótese parcial removível", "Faceta", "Onlay/Inlay",
  "Placa de bruxismo", "Provisório", "Núcleo metálico",
];

// ---------------------------------------------------------------- card

interface CardProps {
  servico: ProteseServico;
  onEditar?: (s: ProteseServico) => void;
  onExcluir?: (s: ProteseServico) => void;
  onMover?: (s: ProteseServico, destino: EtapaProtese) => void;
  /** Pega o drag handle do `useDraggable`. Ausente = cartão estático (overlay). */
  handle?: ReactNode;
  esmaecido?: boolean;
}

/**
 * Corpo visual do cartão, sem nenhum vínculo com o dnd-kit. O overlay de
 * arrasto reusa este mesmo componente — registrar dois `useDraggable` com o
 * mesmo id (cartão + overlay) confunde o dnd-kit e o drop passa a falhar.
 */
const ConteudoCard = ({ servico, onEditar, onExcluir, onMover, handle, esmaecido }: CardProps) => {
  const indice = ETAPAS_PROTESE.indexOf(servico.etapa);
  const estatico = !onMover;

  return (
    <div
      className={`rounded-lg border bg-white p-3 shadow-sm transition-opacity ${
        servico.atrasado ? "border-red-300 ring-1 ring-red-200" : "border-gray-200"
      } ${esmaecido ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-1.5">
        {handle ?? <GripVertical className="h-4 w-4 mt-0.5 text-gray-300" />}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm text-gray-900 truncate">{servico.paciente}</p>
          <p className="text-xs text-gray-600 truncate">{servico.tipoPeca}</p>
        </div>
      </div>

      {servico.dentes.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {servico.dentes.slice(0, 8).map((d) => (
            <span
              key={d}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-gray-600"
            >
              {d}
            </span>
          ))}
          {servico.dentes.length > 8 && (
            <span className="text-[10px] text-gray-400">+{servico.dentes.length - 8}</span>
          )}
        </div>
      )}

      <div className="mt-2 space-y-1 text-[11px] text-gray-500">
        {servico.laboratorio && (
          <p className="flex items-center gap-1 truncate">
            <Building2 className="h-3 w-3 shrink-0" /> {servico.laboratorio}
          </p>
        )}
        {servico.cor && <p>Cor: {servico.cor}</p>}
        {servico.previsaoRetorno && (
          <p className={`flex items-center gap-1 ${servico.atrasado ? "text-red-600 font-medium" : ""}`}>
            {servico.atrasado
              ? <AlertTriangle className="h-3 w-3 shrink-0" />
              : <CalendarClock className="h-3 w-3 shrink-0" />}
            {dataBr(servico.previsaoRetorno)}
            {servico.atrasado && servico.diasParaRetorno !== null &&
              ` · ${Math.abs(servico.diasParaRetorno)}d de atraso`}
          </p>
        )}
        {servico.valorCusto !== null && <p>Custo: {brl(servico.valorCusto)}</p>}
      </div>

      {!estatico && (
        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-0.5">
            <Button
              size="icon" variant="ghost" className="h-7 w-7"
              title="Voltar etapa"
              disabled={indice <= 0}
              onClick={() => onMover?.(servico, ETAPAS_PROTESE[indice - 1])}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="icon" variant="ghost" className="h-7 w-7"
              title="Avançar etapa"
              disabled={indice === ETAPAS_PROTESE.length - 1}
              onClick={() => onMover?.(servico, ETAPAS_PROTESE[indice + 1])}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              size="icon" variant="ghost" className="h-7 w-7"
              title="Editar" onClick={() => onEditar?.(servico)}
            >
              <Pencil className="h-3.5 w-3.5 text-gray-500" />
            </Button>
            <Button
              size="icon" variant="ghost" className="h-7 w-7"
              title="Excluir" onClick={() => onExcluir?.(servico)}
            >
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

/** Cartão real do quadro: envolve o conteúdo com o draggable do dnd-kit. */
const CardArrastavel = (props: Required<Pick<CardProps, "servico" | "onEditar" | "onExcluir" | "onMover">>) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.servico.id });

  return (
    <div ref={setNodeRef}>
      <ConteudoCard
        {...props}
        esmaecido={isDragging}
        handle={
          <button
            type="button"
            className="mt-0.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none"
            aria-label="Arrastar cartão"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        }
      />
    </div>
  );
};

// -------------------------------------------------------------- coluna

const Coluna = ({
  etapa, servicos, children,
}: { etapa: EtapaProtese; servicos: ProteseServico[]; children: ReactNode }) => {
  const { setNodeRef, isOver } = useDroppable({ id: etapa });
  const atrasados = servicos.filter((s) => s.atrasado).length;

  return (
    <div className="w-72 shrink-0 flex flex-col">
      <div className={`rounded-t-lg px-3 py-2 ${ETAPA_CLASSE[etapa]}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${ETAPA_PONTO[etapa]}`} />
            {ETAPA_LABEL[etapa]}
          </span>
          <span className="text-xs font-medium tabular-nums">{servicos.length}</span>
        </div>
        <p className="text-[11px] opacity-80 mt-0.5 leading-tight">{ETAPA_AJUDA[etapa]}</p>
        {atrasados > 0 && (
          <p className="text-[11px] font-medium text-red-700 mt-1">
            {atrasados} atrasada(s)
          </p>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[180px] rounded-b-lg border border-t-0 p-2 space-y-2 transition-colors ${
          isOver ? "border-brand-400 bg-brand-50/60" : "border-gray-200 bg-gray-50/60"
        }`}
      >
        {children}
        {servicos.length === 0 && (
          <p className="text-[11px] text-gray-400 text-center py-6">
            Arraste um cartão para cá
          </p>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- página

const Protese = () => {
  const { clinicaId, carregando: carregandoCtx } = useTenant();

  const [lista, setLista] = useState<ProteseServico[]>([]);
  const [pacientes, setPacientes] = useState<{ id: string; nome: string }[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [dialogAberto, setDialogAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<ProteseInput>(FORM_VAZIO);
  const [denticaoDecidua, setDenticaoDecidua] = useState(false);
  const [excluindo, setExcluindo] = useState<ProteseServico | null>(null);
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);

  // distância mínima antes de virar arrasto: sem isso, clicar nos botões do
  // cartão inicia um drag e o clique nunca chega no handler
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  /**
   * `silencioso` recarrega sem trocar o quadro por spinner — usado nos refreshes
   * de fundo (mudança de etapa), onde o board já está correto pelo update
   * otimista e piscar o spinner desfaz justamente o ganho dele.
   */
  const carregar = useCallback(async (silencioso = false) => {
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; }
    if (!silencioso) setCarregando(true);
    try {
      const [servicos, pac] = await Promise.all([
        listarProteses(clinicaId),
        listarPacientesResumo(clinicaId),
      ]);
      setLista(servicos);
      setPacientes(pac);
    } catch (e) {
      toast.error("Erro ao carregar as próteses", { description: mensagemErro(e) });
    } finally {
      if (!silencioso) setCarregando(false);
    }
  }, [clinicaId, carregandoCtx]);

  useEffect(() => { carregar(); }, [carregar]);

  const resumo = useMemo(() => resumirProteses(lista), [lista]);
  const laboratorios = useMemo(() => laboratoriosConhecidos(lista), [lista]);

  const porEtapa = useMemo(() => {
    const mapa = Object.fromEntries(
      ETAPAS_PROTESE.map((e) => [e, [] as ProteseServico[]]),
    ) as Record<EtapaProtese, ProteseServico[]>;
    for (const s of lista) (mapa[s.etapa] ?? mapa.pre_laboratorio).push(s);
    // atrasado primeiro: a coluna já responde "o que resolver hoje"
    for (const e of ETAPAS_PROTESE) {
      mapa[e].sort((a, b) => {
        if (a.atrasado !== b.atrasado) return a.atrasado ? -1 : 1;
        const da = a.previsaoRetorno ?? "9999-12-31";
        const dbb = b.previsaoRetorno ?? "9999-12-31";
        return da.localeCompare(dbb);
      });
    }
    return mapa;
  }, [lista]);

  const arrastando = lista.find((s) => s.id === arrastandoId) ?? null;

  /**
   * O select só lista pacientes ATIVOS, mas um serviço antigo pode pertencer a
   * alguém já inativado. Sem reinjetar esse paciente, a edição abre com o campo
   * em branco — parece que o vínculo sumiu, e qualquer toque no select troca o
   * dono da peça em silêncio.
   */
  const opcoesPacientes = useMemo(() => {
    if (!form.pacienteId || pacientes.some((p) => p.id === form.pacienteId)) return pacientes;
    const dono = lista.find((s) => s.pacienteId === form.pacienteId);
    return [{ id: form.pacienteId, nome: `${dono?.paciente ?? "Paciente"} (inativo)` }, ...pacientes];
  }, [pacientes, form.pacienteId, lista]);

  // ------------------------------------------------------------- ações

  const mover = useCallback(
    async (servico: ProteseServico, destino: EtapaProtese) => {
      if (!clinicaId || destino === servico.etapa) return;
      const anterior = lista;
      setLista((atual) => atual.map((s) => (s.id === servico.id ? { ...s, etapa: destino } : s)));
      try {
        await moverEtapa(clinicaId, servico, destino);
      } catch (e) {
        setLista(anterior);
        toast.error("Não foi possível mudar a etapa", { description: mensagemErro(e) });
        return;
      }
      // A etapa JÁ está persistida. Esta releitura só traz as datas que o
      // serviço carimbou (envio/retorno) e o recálculo de atraso — por isso ela
      // é silenciosa (trocar o quadro por spinner a cada arrasto mata o update
      // otimista) e um erro aqui NÃO faz rollback: o board otimista já está
      // certo quanto à etapa.
      try {
        setLista(await listarProteses(clinicaId));
      } catch {
        // refresh de fundo falhou; a etapa nova continua correta na tela
      }
    },
    [clinicaId, lista],
  );

  const aoSoltar = (evento: DragEndEvent) => {
    setArrastandoId(null);
    const destino = evento.over?.id as EtapaProtese | undefined;
    if (!destino) return;
    const servico = lista.find((s) => s.id === evento.active.id);
    if (servico) mover(servico, destino);
  };

  const abrirNovo = () => {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setDenticaoDecidua(false);
    setDialogAberto(true);
  };

  const abrirEdicao = (s: ProteseServico) => {
    setEditandoId(s.id);
    setForm({
      pacienteId: s.pacienteId,
      laboratorio: s.laboratorio ?? "",
      tipoPeca: s.tipoPeca,
      dentes: s.dentes,
      cor: s.cor ?? "",
      previsaoRetorno: s.previsaoRetorno ?? "",
      valorCusto: s.valorCusto,
      observacoes: s.observacoes ?? "",
    });
    // dente decíduo começa em 5 no FDI — abre o dialog já na dentição certa
    setDenticaoDecidua(s.dentes.some((d) => d >= 50));
    setDialogAberto(true);
  };

  const alternarDente = (dente: number) =>
    setForm((f) => ({
      ...f,
      dentes: f.dentes.includes(dente)
        ? f.dentes.filter((d) => d !== dente)
        : [...f.dentes, dente].sort((a, b) => a - b),
    }));

  const salvar = async () => {
    if (!clinicaId) return;
    const erro = validarProtese(form);
    if (erro) { toast.error(erro); return; }
    setSalvando(true);
    try {
      if (editandoId) {
        await atualizarProtese(clinicaId, editandoId, form);
        toast.success("Serviço atualizado");
      } else {
        await criarProtese(clinicaId, form);
        toast.success("Serviço de prótese criado", { description: "Entrou em Pré-laboratório." });
      }
      setDialogAberto(false);
      await carregar();
    } catch (e) {
      toast.error("Não foi possível salvar", { description: mensagemErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!clinicaId || !excluindo) return;
    setSalvando(true);
    try {
      await excluirProtese(clinicaId, excluindo.id);
      toast.success("Serviço excluído");
      setExcluindo(null);
      await carregar();
    } catch (e) {
      toast.error("Não foi possível excluir", { description: mensagemErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  // ------------------------------------------------------------ render

  const semClinica = !carregandoCtx && !clinicaId;
  const grupos = denticaoDecidua ? DENTES_DECIDUOS : DENTES_PERMANENTES;

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-4 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Smile className="h-6 w-6 text-brand-600" /> Controle de prótese
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                Cada peça, da moldagem à instalação — com alerta do que já passou da previsão.
              </p>
            </div>
            <Button
              className="bg-brand-600 hover:bg-brand-700 gap-2"
              onClick={abrirNovo}
              disabled={semClinica}
            >
              <Plus className="h-4 w-4" /> Novo serviço
            </Button>
          </div>

          {semClinica ? (
            <Card className="border-gray-100">
              <CardContent className="p-12 text-center">
                <UserX className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                <p className="font-medium text-gray-800">Nenhuma clínica no seu perfil</p>
                <p className="text-sm text-gray-500 mt-1">
                  Conclua o cadastro da clínica para controlar as próteses.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Card className="border-gray-100">
                  <CardContent className="p-5">
                    <p className="text-xs text-gray-500">Em andamento</p>
                    <p className="text-xl font-bold">{resumo.emAndamento}</p>
                    <p className="text-[11px] text-gray-400">Peças ainda não instaladas</p>
                  </CardContent>
                </Card>
                <Card className={resumo.atrasados > 0 ? "border-red-200 bg-red-50/40" : "border-gray-100"}>
                  <CardContent className="p-5">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      {resumo.atrasados > 0 && <AlertTriangle className="h-3 w-3 text-red-600" />}
                      Atrasadas
                    </p>
                    <p className={`text-xl font-bold ${resumo.atrasados > 0 ? "text-red-700" : ""}`}>
                      {resumo.atrasados}
                    </p>
                    <p className="text-[11px] text-gray-400">Passaram da previsão de retorno</p>
                  </CardContent>
                </Card>
                <Card className="border-gray-100">
                  <CardContent className="p-5">
                    <p className="text-xs text-gray-500">Custo em aberto</p>
                    <p className="text-xl font-bold">{brl(resumo.custoEmAberto)}</p>
                    <p className="text-[11px] text-gray-400">Laboratório a pagar nas peças ativas</p>
                  </CardContent>
                </Card>
                <Card className="border-gray-100">
                  <CardContent className="p-5">
                    <p className="text-xs text-gray-500">Realizadas</p>
                    <p className="text-xl font-bold">{resumo.total - resumo.emAndamento}</p>
                    <p className="text-[11px] text-gray-400">{resumo.total} no total</p>
                  </CardContent>
                </Card>
              </div>

              {carregando ? (
                <Card className="border-gray-100">
                  <CardContent className="p-12 flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </CardContent>
                </Card>
              ) : lista.length === 0 ? (
                <Card className="border-gray-100">
                  <CardContent className="p-12 text-center">
                    <Smile className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                    <p className="font-medium text-gray-800">Nenhum serviço de prótese ainda</p>
                    <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                      {pacientes.length === 0
                        ? "Cadastre um paciente primeiro — todo serviço de prótese pertence a alguém."
                        : "Crie o primeiro serviço com paciente, tipo de peça e previsão de retorno. Ele nasce em Pré-laboratório e você move pelas etapas conforme a peça anda."}
                    </p>
                    {pacientes.length > 0 && (
                      <Button
                        className="bg-brand-600 hover:bg-brand-700 gap-2 mt-4"
                        onClick={abrirNovo}
                      >
                        <Plus className="h-4 w-4" /> Novo serviço
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <DndContext
                  sensors={sensores}
                  collisionDetection={closestCorners}
                  onDragStart={(e: DragStartEvent) => setArrastandoId(String(e.active.id))}
                  onDragCancel={() => setArrastandoId(null)}
                  onDragEnd={aoSoltar}
                >
                  <div className="flex gap-3 overflow-x-auto pb-4">
                    {ETAPAS_PROTESE.map((etapa) => (
                      <Coluna key={etapa} etapa={etapa} servicos={porEtapa[etapa]}>
                        {porEtapa[etapa].map((s) => (
                          <CardArrastavel
                            key={s.id}
                            servico={s}
                            onEditar={abrirEdicao}
                            onExcluir={setExcluindo}
                            onMover={mover}
                          />
                        ))}
                      </Coluna>
                    ))}
                  </div>
                  <DragOverlay>
                    {arrastando && (
                      <div className="w-64 rotate-2">
                        <ConteudoCard servico={arrastando} />
                      </div>
                    )}
                  </DragOverlay>
                </DndContext>
              )}
            </>
          )}
        </div>
      </main>

      {/* ------------------------------------------------ dialog de serviço */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editandoId ? "Editar serviço de prótese" : "Novo serviço de prótese"}</DialogTitle>
            <DialogDescription>
              A etapa não é editada aqui — mova o cartão no quadro (ou use as setas do cartão).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-1">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Paciente *</Label>
                <Select
                  value={form.pacienteId}
                  onValueChange={(v) => setForm({ ...form, pacienteId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={opcoesPacientes.length ? "Selecione" : "Nenhum paciente ativo"} />
                  </SelectTrigger>
                  <SelectContent>
                    {opcoesPacientes.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pr-lab">Laboratório</Label>
                <Input
                  id="pr-lab"
                  list="labs-conhecidos"
                  value={form.laboratorio ?? ""}
                  onChange={(e) => setForm({ ...form, laboratorio: e.target.value })}
                  placeholder="Nome do laboratório"
                />
                <datalist id="labs-conhecidos">
                  {laboratorios.map((l) => <option key={l} value={l} />)}
                </datalist>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="pr-peca">Tipo de peça *</Label>
                <Input
                  id="pr-peca"
                  list="tipos-peca"
                  value={form.tipoPeca}
                  onChange={(e) => setForm({ ...form, tipoPeca: e.target.value })}
                  placeholder="Ex.: Coroa unitária"
                />
                <datalist id="tipos-peca">
                  {TIPOS_PECA.map((t) => <option key={t} value={t} />)}
                </datalist>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pr-cor">Cor</Label>
                <Input
                  id="pr-cor"
                  value={form.cor ?? ""}
                  onChange={(e) =>
                    setForm({
                      // escala de cor (Vita) é código curto: A2, B1, BL3, A3,5.
                      // Normaliza pra maiúscula e barra caractere fora do padrão.
                      ...form,
                      cor: e.target.value.toUpperCase().replace(/[^A-Z0-9 .,/-]/g, "").slice(0, 16),
                    })
                  }
                  maxLength={16}
                  placeholder="Ex.: A2, B1, BL3"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label>Dentes {form.dentes.length > 0 && `(${form.dentes.length})`}</Label>
                <div className="flex items-center gap-2">
                  {form.dentes.length > 0 && (
                    <Button
                      type="button" variant="ghost" size="sm" className="h-7 text-xs"
                      onClick={() => setForm({ ...form, dentes: [] })}
                    >
                      Limpar
                    </Button>
                  )}
                  <Button
                    type="button" variant="outline" size="sm" className="h-7 text-xs"
                    onClick={() => setDenticaoDecidua((v) => !v)}
                  >
                    {denticaoDecidua ? "Ver permanentes" : "Ver decíduos"}
                  </Button>
                </div>
              </div>
              <div className="rounded-md border border-gray-200 p-2 space-y-1">
                {(["supDireito", "supEsquerdo", "infEsquerdo", "infDireito"] as const).map((q, idx) => (
                  <div key={q} className={`flex flex-wrap gap-1 ${idx === 2 ? "pt-1 border-t border-gray-100" : ""}`}>
                    {grupos[q].map((dente) => {
                      const marcado = form.dentes.includes(dente);
                      return (
                        <button
                          key={dente}
                          type="button"
                          onClick={() => alternarDente(dente)}
                          title={`Dente ${dente}`}
                          className={`flex w-[42px] flex-col items-center rounded-lg border p-1 transition-colors ${
                            marcado ? "border-brand-500 bg-brand-50" : "border-gray-200 bg-white hover:border-brand-400"
                          }`}
                        >
                          <img
                            src={`/dentes/${dente}.png`}
                            alt=""
                            loading="lazy"
                            onError={(e) => { (e.currentTarget.style.visibility = "hidden"); }}
                            className={`h-9 w-full object-contain ${isArcadaSuperior(dente) ? "object-bottom" : "object-top"}`}
                          />
                          <span className={`mt-0.5 text-[11px] font-medium tabular-nums ${marcado ? "text-brand-700" : "text-gray-500"}`}>
                            {dente}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-400">
                Notação FDI. Deixe vazio se a peça não é ligada a dente específico (placa, total).
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="pr-prev">Previsão de retorno</Label>
                <Input
                  id="pr-prev" type="date"
                  min={hojeISO()}
                  max="2100-12-31"
                  value={form.previsaoRetorno ?? ""}
                  onChange={(e) => setForm({ ...form, previsaoRetorno: e.target.value })}
                />
                <p className="text-[11px] text-gray-400">
                  É ela que aciona o alerta vermelho de atraso.
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pr-custo">Valor de custo</Label>
                <CampoMoeda
                  id="pr-custo"
                  value={form.valorCusto}
                  onChange={(reais) => setForm({ ...form, valorCusto: reais })}
                />
                <p className="text-[11px] text-gray-400">
                  Quanto o laboratório cobra pela peça.
                </p>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="pr-obs">Observações</Label>
              <Textarea
                id="pr-obs" rows={3}
                value={form.observacoes ?? ""}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                placeholder="Instruções ao laboratório, particularidades do caso…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              className="bg-brand-600 hover:bg-brand-700 gap-2"
              onClick={salvar}
              disabled={salvando || opcoesPacientes.length === 0}
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              {editandoId ? "Salvar" : "Criar serviço"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------- exclusão */}
      <AlertDialog open={Boolean(excluindo)} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este serviço de prótese?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluindo
                ? `${excluindo.tipoPeca} de ${excluindo.paciente} será removido do quadro. Não há desfazer.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => { e.preventDefault(); confirmarExclusao(); }}
              disabled={salvando}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Protese;
