import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Clock, Loader2, Plus, Save, Trash2, Copy, CalendarOff, Sparkles, Users,
  Pencil, CalendarCheck, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import {
  listarProcedimentosAgenda, listarProfissionaisAgenda,
  type ProcedimentoAgenda, type ProfissionalAgenda,
} from "@/services/agenda";
import {
  DIAS_SEMANA, MODALIDADES, MODALIDADE_LABEL, SLOT_MAX, SLOT_MIN,
  atualizarBloqueio, buscarSlotsDisponiveis, criarBloqueio, deInputLocal, excluirBloqueio,
  faixaPadrao, faixasSobrepostas, formatarDataHora, formatarHora, hojeISO, listarBloqueios,
  listarDisponibilidades,
  paraFaixa, paraInputLocal, salvarGrade, traduzirErro, validarBloqueio, validarFaixa,
  type Bloqueio, type FaixaDisponibilidade, type ModalidadeAtendimento, type Slot,
} from "@/services/disponibilidade";

/** `<Select>` do Radix não aceita item com value "" — sentinela para "nenhum". */
const SEM_PROCEDIMENTO = "__sem_procedimento__";
const TODA_CLINICA = "__toda_clinica__";

/** Chave estável de React: faixa nova ainda não tem id no banco. */
interface FaixaUI extends FaixaDisponibilidade {
  chave: string;
}

let contadorChave = 0;
const novaChave = () => `f${++contadorChave}`;

interface FormBloqueio {
  profissional_id: string;
  inicio: string;
  fim: string;
  motivo: string;
}

/** Próxima hora cheia, em formato de `<input type="datetime-local">`. */
function proximaHoraLocal(horasAdiante: number): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + horasAdiante);
  return paraInputLocal(d.toISOString());
}

const bloqueioVazio = (): FormBloqueio => ({
  profissional_id: TODA_CLINICA,
  inicio: proximaHoraLocal(1),
  fim: proximaHoraLocal(2),
  motivo: "",
});

const HorariosAtendimento = () => {
  const { clinicaId, carregando: carregandoCtx } = useTenant();

  const [profissionais, setProfissionais] = useState<ProfissionalAgenda[]>([]);
  const [procedimentos, setProcedimentos] = useState<ProcedimentoAgenda[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [profissionalId, setProfissionalId] = useState<string>("");

  const [faixas, setFaixas] = useState<FaixaUI[]>([]);
  const [removidos, setRemovidos] = useState<string[]>([]);
  const [carregandoGrade, setCarregandoGrade] = useState(false);
  const [salvandoGrade, setSalvandoGrade] = useState(false);
  const [sujo, setSujo] = useState(false);
  const [errosFaixa, setErrosFaixa] = useState<Record<string, string>>({});

  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([]);
  const [carregandoBloqueios, setCarregandoBloqueios] = useState(false);
  const [incluirPassados, setIncluirPassados] = useState(false);
  const [dialogBloqueio, setDialogBloqueio] = useState(false);
  const [editandoBloqueio, setEditandoBloqueio] = useState<Bloqueio | null>(null);
  const [formBloqueio, setFormBloqueio] = useState<FormBloqueio>(bloqueioVazio());
  const [errosBloqueio, setErrosBloqueio] = useState<Record<string, string>>({});
  const [salvandoBloqueio, setSalvandoBloqueio] = useState(false);
  const [bloqueioAExcluir, setBloqueioAExcluir] = useState<Bloqueio | null>(null);
  const [excluindoBloqueio, setExcluindoBloqueio] = useState(false);

  const [dialogSlots, setDialogSlots] = useState(false);
  const [slotProfissional, setSlotProfissional] = useState("");
  const [slotData, setSlotData] = useState(hojeISO());
  const [slotProcedimento, setSlotProcedimento] = useState(SEM_PROCEDIMENTO);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [buscandoSlots, setBuscandoSlots] = useState(false);
  const [jaBuscouSlots, setJaBuscouSlots] = useState(false);

  const nomeProfissional = useCallback(
    (id: string | null) => {
      if (!id) return "Toda a clínica";
      return profissionais.find((p) => p.id === id)?.full_name || "Profissional removido";
    },
    [profissionais],
  );

  // ------------------------------------------------------------------ carga base
  useEffect(() => {
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; } // evita spinner eterno
    let vivo = true;
    setCarregando(true);
    (async () => {
      try {
        const [profs, procs] = await Promise.all([
          listarProfissionaisAgenda(clinicaId),
          listarProcedimentosAgenda(clinicaId),
        ]);
        if (!vivo) return;
        setProfissionais(profs);
        setProcedimentos(procs);
        if (profs.length) {
          setProfissionalId((atual) => atual || profs[0].id);
          setSlotProfissional((atual) => atual || profs[0].id);
        }
      } catch (e) {
        if (!vivo) return;
        toast.error("Erro ao carregar a equipe", { description: traduzirErro(e, "Tente novamente.") });
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [clinicaId, carregandoCtx]);

  // ------------------------------------------------------------------ grade
  const carregarGrade = useCallback(async () => {
    if (!clinicaId || !profissionalId) { setFaixas([]); return; }
    setCarregandoGrade(true);
    try {
      const linhas = await listarDisponibilidades(clinicaId, profissionalId);
      const porDia = new Map<number, FaixaUI[]>();
      for (const l of linhas) {
        const lista = porDia.get(l.dia_semana) ?? [];
        lista.push({ ...paraFaixa(l), chave: novaChave() });
        porDia.set(l.dia_semana, lista);
      }
      // todo dia existe na tela mesmo sem linha no banco: a faixa vazia é só um
      // rascunho local e só vira registro se o usuário ligar o dia.
      const montadas: FaixaUI[] = [];
      for (const dia of DIAS_SEMANA) {
        const lista = porDia.get(dia.valor);
        if (lista?.length) montadas.push(...lista);
        else montadas.push({ ...faixaPadrao(dia.valor), chave: novaChave() });
      }
      setFaixas(montadas);
      setRemovidos([]);
      setErrosFaixa({});
      setSujo(false);
    } catch (e) {
      toast.error("Erro ao carregar os horários", { description: traduzirErro(e, "Tente novamente.") });
    } finally {
      setCarregandoGrade(false);
    }
  }, [clinicaId, profissionalId]);

  useEffect(() => { carregarGrade(); }, [carregarGrade]);

  const alterarFaixa = (chave: string, mudanca: Partial<FaixaDisponibilidade>) => {
    setFaixas((lista) => lista.map((f) => (f.chave === chave ? { ...f, ...mudanca } : f)));
    setSujo(true);
  };

  const alternarModalidade = (chave: string, m: ModalidadeAtendimento, marcado: boolean) => {
    setFaixas((lista) =>
      lista.map((f) =>
        f.chave === chave
          ? { ...f, modalidades: marcado ? [...f.modalidades, m] : f.modalidades.filter((x) => x !== m) }
          : f,
      ),
    );
    setSujo(true);
  };

  const alternarDia = (dia: number, ativo: boolean) => {
    setFaixas((lista) => lista.map((f) => (f.dia_semana === dia ? { ...f, ativo } : f)));
    setSujo(true);
  };

  const adicionarFaixa = (dia: number) => {
    setFaixas((lista) => {
      const doDia = lista.filter((f) => f.dia_semana === dia);
      const ultima = doDia[doDia.length - 1];
      const nova: FaixaUI = {
        ...faixaPadrao(dia),
        chave: novaChave(),
        ativo: true,
        // encosta no fim da faixa anterior — o caso comum é dividir manhã/tarde
        hora_inicio: ultima?.hora_fim ?? "08:00",
        hora_fim: "18:00",
        intervalo_slot_min: ultima?.intervalo_slot_min ?? 30,
        modalidades: ultima?.modalidades ?? ["presencial"],
      };
      const indice = lista.findIndex((f) => f.dia_semana > dia);
      if (indice < 0) return [...lista, nova];
      return [...lista.slice(0, indice), nova, ...lista.slice(indice)];
    });
    setSujo(true);
  };

  const removerFaixa = (chave: string) => {
    const alvo = faixas.find((f) => f.chave === chave);
    if (!alvo) return;
    if (alvo.id) setRemovidos((r) => [...r, alvo.id as string]);
    setFaixas((lista) => lista.filter((f) => f.chave !== chave));
    setSujo(true);
  };

  /**
   * Replica a configuração de um dia nos outros seis. Reaproveita o id da faixa
   * que já existe em cada dia (mesma posição) para o salvamento virar UPDATE e
   * não delete+insert — assim a grade não troca de identidade a cada cópia.
   */
  const copiarParaTodos = (dia: number) => {
    const origem = faixas.filter((f) => f.dia_semana === dia);
    if (!origem.length) return;
    const aRemover: string[] = [];
    const resultado: FaixaUI[] = [];

    for (const d of DIAS_SEMANA) {
      if (d.valor === dia) {
        resultado.push(...origem);
        continue;
      }
      const destino = faixas.filter((f) => f.dia_semana === d.valor);
      origem.forEach((o, i) => {
        const antigo = destino[i];
        resultado.push({
          ...o,
          chave: antigo?.chave ?? novaChave(),
          id: antigo?.id ?? null,
          dia_semana: d.valor,
        });
      });
      destino.slice(origem.length).forEach((sobra) => {
        if (sobra.id) aRemover.push(sobra.id);
      });
    }

    setFaixas(resultado);
    if (aRemover.length) setRemovidos((r) => [...r, ...aRemover]);
    setSujo(true);
    toast.success("Configuração copiada para os outros dias", {
      description: "Revise e clique em Salvar grade para aplicar.",
    });
  };

  const salvar = async () => {
    if (!clinicaId || !profissionalId) return;
    const erros: Record<string, string> = {};
    for (const f of faixas) {
      if (!f.ativo && !f.id) continue; // rascunho desligado não vai pro banco
      const msg = validarFaixa(f);
      if (msg) erros[f.chave] = msg;
    }
    setErrosFaixa(erros);
    if (Object.keys(erros).length) {
      toast.error("Revise a grade", { description: Object.values(erros)[0] });
      return;
    }

    setSalvandoGrade(true);
    try {
      await salvarGrade(clinicaId, profissionalId, faixas, removidos);
      toast.success("Grade salva");
      await carregarGrade();
    } catch (e) {
      toast.error("Não foi possível salvar a grade", {
        description: traduzirErro(e, "Tente novamente."),
      });
    } finally {
      setSalvandoGrade(false);
    }
  };

  const diasAtivos = useMemo(
    () => new Set(faixas.filter((f) => f.ativo).map((f) => f.dia_semana)).size,
    [faixas],
  );

  // ------------------------------------------------------------------ bloqueios
  const carregarBloqueios = useCallback(async () => {
    if (!clinicaId) return;
    setCarregandoBloqueios(true);
    try {
      setBloqueios(await listarBloqueios(clinicaId, { desde: incluirPassados ? null : new Date() }));
    } catch (e) {
      toast.error("Erro ao carregar bloqueios", { description: traduzirErro(e, "Tente novamente.") });
    } finally {
      setCarregandoBloqueios(false);
    }
  }, [clinicaId, incluirPassados]);

  useEffect(() => { carregarBloqueios(); }, [carregarBloqueios]);

  const abrirNovoBloqueio = () => {
    setEditandoBloqueio(null);
    setFormBloqueio(bloqueioVazio());
    setErrosBloqueio({});
    setDialogBloqueio(true);
  };

  const abrirEdicaoBloqueio = (b: Bloqueio) => {
    setEditandoBloqueio(b);
    setFormBloqueio({
      profissional_id: b.profissional_id ?? TODA_CLINICA,
      inicio: paraInputLocal(b.inicio),
      fim: paraInputLocal(b.fim),
      motivo: b.motivo ?? "",
    });
    setErrosBloqueio({});
    setDialogBloqueio(true);
  };

  const salvarBloqueio = async () => {
    if (!clinicaId) return;
    const e = validarBloqueio(formBloqueio.inicio, formBloqueio.fim);
    setErrosBloqueio(e);
    if (Object.keys(e).length) return;

    const dados = {
      profissional_id: formBloqueio.profissional_id === TODA_CLINICA ? null : formBloqueio.profissional_id,
      inicio: deInputLocal(formBloqueio.inicio),
      fim: deInputLocal(formBloqueio.fim),
      motivo: formBloqueio.motivo,
    };

    setSalvandoBloqueio(true);
    try {
      if (editandoBloqueio) await atualizarBloqueio(clinicaId, editandoBloqueio.id, dados);
      else await criarBloqueio(clinicaId, dados);
      toast.success(editandoBloqueio ? "Bloqueio atualizado" : "Bloqueio criado");
      setDialogBloqueio(false);
      await carregarBloqueios();
    } catch (err) {
      toast.error("Não foi possível salvar o bloqueio", {
        description: traduzirErro(err, "Tente novamente."),
      });
    } finally {
      setSalvandoBloqueio(false);
    }
  };

  const confirmarExclusaoBloqueio = async () => {
    if (!bloqueioAExcluir || !clinicaId) return;
    setExcluindoBloqueio(true);
    try {
      await excluirBloqueio(clinicaId, bloqueioAExcluir.id);
      toast.success("Bloqueio removido");
      setBloqueioAExcluir(null);
      await carregarBloqueios();
    } catch (e) {
      toast.error("Não foi possível remover", { description: traduzirErro(e, "Tente novamente.") });
    } finally {
      setExcluindoBloqueio(false);
    }
  };

  // ------------------------------------------------------------------ slots
  const abrirTesteSlots = () => {
    setSlotProfissional((atual) => atual || profissionalId || (profissionais[0]?.id ?? ""));
    setSlots([]);
    setJaBuscouSlots(false);
    setDialogSlots(true);
  };

  const testarSlots = async () => {
    if (!slotProfissional || !slotData) {
      toast.error("Escolha o profissional e a data");
      return;
    }
    setBuscandoSlots(true);
    try {
      const lista = await buscarSlotsDisponiveis(
        slotProfissional,
        slotData,
        slotProcedimento === SEM_PROCEDIMENTO ? null : slotProcedimento,
      );
      setSlots(lista);
      setJaBuscouSlots(true);
    } catch (e) {
      toast.error("Erro ao consultar horários livres", {
        description: traduzirErro(e, "Tente novamente."),
      });
    } finally {
      setBuscandoSlots(false);
    }
  };

  // ------------------------------------------------------------------ render
  const agora = Date.now();

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-4 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Clock className="h-6 w-6 text-emerald-600" /> Horários de Atendimento
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                Defina a jornada semanal de cada profissional e as datas em que a agenda fica
                fechada. É daqui que saem os horários oferecidos no agendamento.
              </p>
            </div>
            <Button variant="outline" className="gap-2 shrink-0" onClick={abrirTesteSlots}>
              <Sparkles className="h-4 w-4 text-emerald-600" /> Ver horários livres
            </Button>
          </div>

          {carregando ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !clinicaId ? (
            <Card className="border-gray-100">
              <CardContent className="p-5">
                <div className="text-center p-12">
                  <Clock className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="font-medium text-gray-800">Clínica não identificada</p>
                  <p className="text-sm text-gray-500">
                    Entre novamente na sua conta para configurar os horários.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : profissionais.length === 0 ? (
            <Card className="border-gray-100">
              <CardContent className="p-5">
                <div className="text-center p-12">
                  <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="font-medium text-gray-800">Nenhum profissional cadastrado</p>
                  <p className="text-sm text-gray-500 max-w-md mx-auto">
                    A grade de horários pertence a um profissional. Cadastre a equipe em
                    Profissionais e volte aqui para definir a jornada de cada um.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="grade">
              <TabsList className="mb-4">
                <TabsTrigger value="grade">Grade semanal</TabsTrigger>
                <TabsTrigger value="bloqueios">Bloqueios</TabsTrigger>
              </TabsList>

              {/* ------------------------------------------------ grade semanal */}
              <TabsContent value="grade" className="space-y-4">
                <Card className="border-gray-100">
                  <CardContent className="p-5">
                    <div className="flex flex-col lg:flex-row lg:items-end gap-4">
                      <div className="flex-1 min-w-0">
                        <Label>Profissional</Label>
                        <Select value={profissionalId} onValueChange={setProfissionalId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Escolha o profissional" />
                          </SelectTrigger>
                          <SelectContent>
                            {profissionais.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.full_name || "Sem nome"}
                                {p.especialidade ? ` — ${p.especialidade}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="text-sm text-gray-600 lg:pb-2">
                        {diasAtivos > 0
                          ? `${diasAtivos} dia(s) de atendimento configurados`
                          : "Nenhum dia de atendimento ativo"}
                      </div>
                      <Button
                        className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                        onClick={salvar}
                        disabled={salvandoGrade || carregandoGrade || !sujo}
                      >
                        {salvandoGrade ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {sujo ? "Salvar grade" : "Grade salva"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {carregandoGrade ? (
                  <div className="flex justify-center p-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  DIAS_SEMANA.map((dia) => {
                    const doDia = faixas.filter((f) => f.dia_semana === dia.valor);
                    const ligado = doDia.some((f) => f.ativo);
                    const sobrepoe = faixasSobrepostas(doDia);
                    return (
                      <Card key={dia.valor} className="border-gray-100">
                        <CardContent className="p-5">
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <label className="flex items-center gap-3 cursor-pointer">
                              <Switch
                                checked={ligado}
                                onCheckedChange={(v) => alternarDia(dia.valor, v === true)}
                                aria-label={`Atender ${dia.rotulo}`}
                              />
                              <span className={ligado ? "font-medium text-gray-900" : "font-medium text-gray-400"}>
                                {dia.rotulo}
                              </span>
                            </label>
                            {ligado && (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1.5 text-xs"
                                  onClick={() => adicionarFaixa(dia.valor)}
                                >
                                  <Plus className="h-3.5 w-3.5" /> Faixa
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1.5 text-xs"
                                  onClick={() => copiarParaTodos(dia.valor)}
                                >
                                  <Copy className="h-3.5 w-3.5" /> Copiar para todos os dias
                                </Button>
                              </div>
                            )}
                          </div>

                          {ligado && sobrepoe && (
                            <p className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2 mb-3">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              <span>
                                Duas faixas deste dia se cruzam. O banco aceita, mas o mesmo horário
                                vai aparecer repetido para quem agenda. Ajuste o fim de uma ou o
                                início da outra.
                              </span>
                            </p>
                          )}

                          {!ligado ? (
                            <p className="text-sm text-gray-400">Não atende neste dia.</p>
                          ) : (
                            <div className="space-y-4">
                              {doDia.map((f, i) => (
                                <div key={f.chave}>
                                  {i > 0 && <Separator className="mb-4" />}
                                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                    <div>
                                      <Label className="text-xs">Início</Label>
                                      <Input
                                        type="time"
                                        value={f.hora_inicio}
                                        onChange={(e) => alterarFaixa(f.chave, { hora_inicio: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs">Fim</Label>
                                      <Input
                                        type="time"
                                        value={f.hora_fim}
                                        onChange={(e) => alterarFaixa(f.chave, { hora_fim: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs">Duração do encaixe (min)</Label>
                                      <Input
                                        type="number"
                                        min={SLOT_MIN}
                                        max={SLOT_MAX}
                                        step={5}
                                        value={f.intervalo_slot_min}
                                        onChange={(e) =>
                                          alterarFaixa(f.chave, { intervalo_slot_min: Number(e.target.value) })
                                        }
                                      />
                                      <p className="text-[11px] text-gray-400 mt-1">
                                        usado quando a busca não informa procedimento
                                      </p>
                                    </div>
                                    <div>
                                      <Label className="text-xs">Modalidades</Label>
                                      <div className="flex flex-wrap gap-3 mt-2">
                                        {MODALIDADES.map((m) => (
                                          <label key={m} className="flex items-center gap-1.5 text-sm cursor-pointer">
                                            <Checkbox
                                              checked={f.modalidades.includes(m)}
                                              onCheckedChange={(c) => alternarModalidade(f.chave, m, c === true)}
                                            />
                                            {MODALIDADE_LABEL[m]}
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-3">
                                    <div>
                                      <Label className="text-xs">Vigência — início (opcional)</Label>
                                      <Input
                                        type="date"
                                        value={f.vigencia_inicio ?? ""}
                                        onChange={(e) =>
                                          alterarFaixa(f.chave, { vigencia_inicio: e.target.value || null })
                                        }
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs">Vigência — fim (opcional)</Label>
                                      <Input
                                        type="date"
                                        value={f.vigencia_fim ?? ""}
                                        onChange={(e) =>
                                          alterarFaixa(f.chave, { vigencia_fim: e.target.value || null })
                                        }
                                      />
                                    </div>
                                    <div className="lg:col-span-2 flex items-end justify-between gap-3">
                                      <p className="text-[11px] text-gray-400">
                                        Sem vigência, a faixa vale para sempre. Use para jornada temporária.
                                      </p>
                                      {doDia.length > 1 && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="gap-1.5 text-xs text-red-600 hover:text-red-700 shrink-0"
                                          onClick={() => removerFaixa(f.chave)}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" /> Remover faixa
                                        </Button>
                                      )}
                                    </div>
                                  </div>

                                  {errosFaixa[f.chave] && (
                                    <p className="text-xs text-red-600 mt-2">{errosFaixa[f.chave]}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </TabsContent>

              {/* ---------------------------------------------------- bloqueios */}
              <TabsContent value="bloqueios">
                <Card className="border-gray-100">
                  <CardContent className="p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                      <div>
                        <p className="font-medium text-gray-900">Bloqueios de agenda</p>
                        <p className="text-sm text-gray-500">
                          Férias, feriados e almoço. Um bloqueio sem profissional fecha a agenda da
                          clínica inteira.
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                          <Switch checked={incluirPassados} onCheckedChange={setIncluirPassados} />
                          Incluir encerrados
                        </label>
                        <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={abrirNovoBloqueio}>
                          <Plus className="h-4 w-4" /> Novo bloqueio
                        </Button>
                      </div>
                    </div>

                    {carregandoBloqueios ? (
                      <div className="flex justify-center p-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : bloqueios.length === 0 ? (
                      <div className="text-center p-12">
                        <CalendarOff className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                        <p className="font-medium text-gray-800">
                          {incluirPassados ? "Nenhum bloqueio cadastrado" : "Nenhum bloqueio em vigor ou futuro"}
                        </p>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">
                          Cadastre férias, feriados e intervalos para que esses períodos deixem de
                          aparecer como horário livre no agendamento.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="text-left font-medium px-3 py-2">Motivo</th>
                              <th className="text-left font-medium px-3 py-2">Quem</th>
                              <th className="text-left font-medium px-3 py-2">Início</th>
                              <th className="text-left font-medium px-3 py-2">Fim</th>
                              <th className="text-left font-medium px-3 py-2">Situação</th>
                              <th className="text-right font-medium px-3 py-2">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bloqueios.map((b) => {
                              const ini = new Date(b.inicio).getTime();
                              const fim = new Date(b.fim).getTime();
                              const situacao =
                                fim < agora ? "Encerrado" : ini <= agora ? "Em vigor" : "Agendado";
                              const classe =
                                fim < agora
                                  ? "bg-gray-100 text-gray-600 border-0"
                                  : ini <= agora
                                    ? "bg-amber-100 text-amber-800 border-0"
                                    : "bg-emerald-100 text-emerald-800 border-0";
                              return (
                                <tr key={b.id} className="border-b border-border/50 hover:bg-muted/40">
                                  <td className="px-3 py-3 font-medium text-gray-900">
                                    {b.motivo || <span className="text-gray-400 font-normal">Sem motivo</span>}
                                  </td>
                                  <td className="px-3 py-3 text-gray-600">
                                    {b.profissional_id ? nomeProfissional(b.profissional_id) : (
                                      <Badge className="bg-sky-100 text-sky-800 border-0">Toda a clínica</Badge>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                                    {formatarDataHora(b.inicio)}
                                  </td>
                                  <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                                    {formatarDataHora(b.fim)}
                                  </td>
                                  <td className="px-3 py-3">
                                    <Badge className={classe}>{situacao}</Badge>
                                  </td>
                                  <td className="px-3 py-3">
                                    <div className="flex items-center justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => abrirEdicaoBloqueio(b)}
                                        aria-label="Editar bloqueio"
                                      >
                                        <Pencil className="h-4 w-4 text-gray-500" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setBloqueioAExcluir(b)}
                                        aria-label="Excluir bloqueio"
                                      >
                                        <Trash2 className="h-4 w-4 text-red-500" />
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
            </Tabs>
          )}
        </div>
      </main>

      {/* ------------------------------------------------------ bloqueio */}
      <Dialog open={dialogBloqueio} onOpenChange={setDialogBloqueio}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editandoBloqueio ? "Editar bloqueio" : "Novo bloqueio"}</DialogTitle>
            <DialogDescription>
              O período fica indisponível para agendamento, mesmo que a grade semanal diga o contrário.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Aplica-se a</Label>
              <Select
                value={formBloqueio.profissional_id}
                onValueChange={(v) => setFormBloqueio((f) => ({ ...f, profissional_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODA_CLINICA}>Toda a clínica</SelectItem>
                  {profissionais.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || "Sem nome"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="bloq-inicio">Início</Label>
                <Input
                  id="bloq-inicio"
                  type="datetime-local"
                  value={formBloqueio.inicio}
                  onChange={(e) => setFormBloqueio((f) => ({ ...f, inicio: e.target.value }))}
                />
                {errosBloqueio.inicio && <p className="text-xs text-red-600 mt-1">{errosBloqueio.inicio}</p>}
              </div>
              <div>
                <Label htmlFor="bloq-fim">Fim</Label>
                <Input
                  id="bloq-fim"
                  type="datetime-local"
                  value={formBloqueio.fim}
                  onChange={(e) => setFormBloqueio((f) => ({ ...f, fim: e.target.value }))}
                />
                {errosBloqueio.fim && <p className="text-xs text-red-600 mt-1">{errosBloqueio.fim}</p>}
              </div>
            </div>

            <div>
              <Label htmlFor="bloq-motivo">Motivo</Label>
              <Textarea
                id="bloq-motivo"
                value={formBloqueio.motivo}
                onChange={(e) => setFormBloqueio((f) => ({ ...f, motivo: e.target.value }))}
                placeholder="Ex.: Férias, Feriado municipal, Almoço"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogBloqueio(false)} disabled={salvandoBloqueio}>
              Cancelar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 gap-2"
              onClick={salvarBloqueio}
              disabled={salvandoBloqueio}
            >
              {salvandoBloqueio && <Loader2 className="h-4 w-4 animate-spin" />}
              {editandoBloqueio ? "Salvar" : "Criar bloqueio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!bloqueioAExcluir} onOpenChange={(a) => !a && setBloqueioAExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este bloqueio?</AlertDialogTitle>
            <AlertDialogDescription>
              {bloqueioAExcluir
                ? `${bloqueioAExcluir.motivo || "Bloqueio"} — de ${formatarDataHora(bloqueioAExcluir.inicio)} até ${formatarDataHora(bloqueioAExcluir.fim)}. O período volta a aceitar agendamento.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindoBloqueio}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmarExclusaoBloqueio(); }}
              disabled={excluindoBloqueio}
              className="bg-red-600 hover:bg-red-700"
            >
              {excluindoBloqueio ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ------------------------------------------------------ teste de slots */}
      <Dialog open={dialogSlots} onOpenChange={setDialogSlots}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-emerald-600" /> Horários livres
            </DialogTitle>
            <DialogDescription>
              Consulta a mesma função do banco que o agendamento usa — ela cruza a grade semanal,
              as consultas já marcadas (com o preparo do procedimento) e os bloqueios.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>Profissional</Label>
              <Select value={slotProfissional} onValueChange={setSlotProfissional}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o profissional" />
                </SelectTrigger>
                <SelectContent>
                  {profissionais.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || "Sem nome"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="slot-data">Data</Label>
                <Input
                  id="slot-data"
                  type="date"
                  value={slotData}
                  onChange={(e) => setSlotData(e.target.value)}
                />
              </div>
              <div>
                <Label>Procedimento (opcional)</Label>
                <Select value={slotProcedimento} onValueChange={setSlotProcedimento}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_PROCEDIMENTO}>Usar o encaixe da grade</SelectItem>
                    {procedimentos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome} ({p.duracao_min} min)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              className="bg-emerald-600 hover:bg-emerald-700 gap-2 w-full"
              onClick={testarSlots}
              disabled={buscandoSlots}
            >
              {buscandoSlots ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Buscar horários livres
            </Button>

            {buscandoSlots ? (
              <div className="flex justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !jaBuscouSlots ? (
              <p className="text-sm text-gray-500 text-center py-6">
                Escolha profissional e data e busque para conferir a configuração.
              </p>
            ) : slots.length === 0 ? (
              <div className="text-center py-8">
                <CalendarOff className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="font-medium text-gray-800">Nenhum horário livre nessa data</p>
                <p className="text-sm text-gray-500 mt-1">
                  Pode ser porque o profissional não atende neste dia da semana, a data/hora já
                  passou (a função só devolve horários futuros), existe bloqueio no período ou a
                  agenda está cheia.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-600 mb-2">
                  {slots.length} horário(s) livre(s) em{" "}
                  {new Date(`${slotData}T12:00:00`).toLocaleDateString("pt-BR")}
                </p>
                <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
                  {/* a chave leva o índice: duas faixas sobrepostas no mesmo dia
                      fazem a RPC devolver o mesmo horário duas vezes, e chave
                      repetida derruba a lista no React */}
                  {slots.map((s, i) => (
                    <span
                      key={`${s.inicio}-${i}`}
                      className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 text-xs font-medium border border-emerald-100"
                    >
                      {formatarHora(s.inicio)}–{formatarHora(s.fim)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HorariosAtendimento;
