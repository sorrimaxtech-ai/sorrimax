import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Check, ChevronsUpDown, Loader2, Repeat, User } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "sonner";
import {
import { traduzErro } from "@/lib/erros";
  DIAS_SEMANA, MODALIDADE_LABEL, STATUS_LABEL, STATUS_ORDEM, TIPO_RECORRENCIA_LABEL,
  atualizarConsulta, brl, buscarPacientes, criarConsulta, criarSerieRecorrente,
  gerarDatasRecorrencia, inputLocalParaIso, isoParaInputLocal, listarCadeiras,
  listarProcedimentos, listarProfissionais, obterPaciente,
  type ConsultaLinha, type Modalidade, type StatusConsulta, type TipoRecorrencia,
} from "@/services/consultas";

interface Props {
  aberto: boolean;
  onFechar: () => void;
  onSalvo: () => void;
  /** Quando presente, o diálogo edita em vez de criar (recorrência fica indisponível). */
  consulta?: ConsultaLinha | null;
  pacienteIdFixo?: string;
}

const SEM_VALOR = "__nenhum__";

interface OpcaoPaciente { id: string; nome_completo: string; celular: string | null }

/**
 * Formulário único de consulta (criar/editar).
 *
 * O `fim` é derivado da duração do procedimento, mas para de ser recalculado assim
 * que o usuário digita um horário final — quem opera a recepção sabe mais sobre o
 * caso concreto do que o cadastro do procedimento.
 */
export const ConsultaDialog = ({ aberto, onFechar, onSalvo, consulta, pacienteIdFixo }: Props) => {
  const { clinicaId, contexto } = useTenant();
  const editando = !!consulta;

  const [pacientes, setPacientes] = useState<OpcaoPaciente[]>([]);
  const [buscaPaciente, setBuscaPaciente] = useState("");
  const [buscandoPacientes, setBuscandoPacientes] = useState(false);
  const [popoverPaciente, setPopoverPaciente] = useState(false);
  const [profissionais, setProfissionais] = useState<any[]>([]);
  const [procedimentos, setProcedimentos] = useState<any[]>([]);
  const [cadeiras, setCadeiras] = useState<any[]>([]);
  const [carregandoApoio, setCarregandoApoio] = useState(false);

  const [pacienteId, setPacienteId] = useState("");
  const [pacienteNome, setPacienteNome] = useState("");
  const [profissionalId, setProfissionalId] = useState("");
  const [servicoId, setServicoId] = useState("");
  const [cadeiraId, setCadeiraId] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [modalidade, setModalidade] = useState<Modalidade>("presencial");
  const [status, setStatus] = useState<StatusConsulta>("agendado");
  const [valor, setValor] = useState("0");
  const [desconto, setDesconto] = useState("0");
  const [observacoes, setObservacoes] = useState("");

  const [comRecorrencia, setComRecorrencia] = useState(false);
  const [tipoRec, setTipoRec] = useState<TipoRecorrencia>("semanal");
  const [intervaloRec, setIntervaloRec] = useState("1");
  const [qtdRec, setQtdRec] = useState("4");
  const [diasSemana, setDiasSemana] = useState<number[]>([]);

  const [salvando, setSalvando] = useState(false);
  const fimManual = useRef(false);

  // ------------------------------------------------------------ carga inicial
  useEffect(() => {
    if (!aberto || !clinicaId) return;
    let vivo = true;
    setCarregandoApoio(true);
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
        if (vivo) toast.error("Erro ao carregar cadastros", { description: traduzErro(e) });
      } finally {
        if (vivo) setCarregandoApoio(false);
      }
    })();
    return () => { vivo = false; };
  }, [aberto, clinicaId]);

  // reidrata o formulário a cada abertura, para não herdar estado da consulta anterior
  useEffect(() => {
    if (!aberto) return;
    fimManual.current = editando;
    if (consulta) {
      setPacienteId(consulta.paciente_id);
      setPacienteNome(consulta.pacientes?.nome_completo ?? "");
      setProfissionalId(consulta.profissional_id);
      setServicoId(consulta.servico_id ?? "");
      setCadeiraId(consulta.cadeira_id ?? "");
      setInicio(isoParaInputLocal(consulta.inicio));
      setFim(isoParaInputLocal(consulta.fim));
      setModalidade(consulta.modalidade);
      setStatus(consulta.status);
      setValor(String(consulta.valor ?? 0));
      setDesconto(String(consulta.desconto ?? 0));
      setObservacoes(consulta.observacoes ?? "");
    } else {
      setPacienteId(pacienteIdFixo ?? "");
      setPacienteNome("");
      setProfissionalId("");
      setServicoId("");
      setCadeiraId("");
      setInicio("");
      setFim("");
      setModalidade("presencial");
      setStatus("agendado");
      setValor("0");
      setDesconto("0");
      setObservacoes("");
    }
    setComRecorrencia(false);
    setTipoRec("semanal");
    setIntervaloRec("1");
    setQtdRec("4");
    setDiasSemana([]);
    setBuscaPaciente("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, consulta?.id, pacienteIdFixo]);

  // paciente pré-fixado por outra tela: precisa do nome para exibir no gatilho
  useEffect(() => {
    if (!aberto || !pacienteIdFixo || pacienteNome) return;
    obterPaciente(pacienteIdFixo, clinicaId)
      .then((p) => p && setPacienteNome(p.nome_completo))
      .catch((e: any) => console.error("[ConsultaDialog] obterPaciente:", e?.message));
  }, [aberto, pacienteIdFixo, pacienteNome, clinicaId]);

  // busca de pacientes com debounce — a lista pode ter milhares de nomes
  useEffect(() => {
    if (!aberto || !clinicaId) return;
    let vivo = true;
    setBuscandoPacientes(true);
    const t = setTimeout(async () => {
      try {
        const r = await buscarPacientes(clinicaId, buscaPaciente);
        if (vivo) setPacientes(r);
      } catch (e: any) {
        if (vivo) toast.error("Erro ao buscar pacientes", { description: traduzErro(e) });
      } finally {
        if (vivo) setBuscandoPacientes(false);
      }
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [aberto, clinicaId, buscaPaciente]);

  // ------------------------------------------------------------ derivações
  const procedimentoSel = useMemo(
    () => procedimentos.find((p) => p.id === servicoId),
    [procedimentos, servicoId],
  );

  /** Recalcula o fim pela duração do procedimento enquanto o usuário não assumiu o campo. */
  useEffect(() => {
    if (fimManual.current || !inicio || !procedimentoSel) return;
    const d = new Date(inicio);
    if (Number.isNaN(d.getTime())) return;
    d.setMinutes(d.getMinutes() + (procedimentoSel.duracao_min ?? 30));
    setFim(isoParaInputLocal(d.toISOString()));
  }, [inicio, procedimentoSel]);

  const aoTrocarProcedimento = (id: string) => {
    setServicoId(id === SEM_VALOR ? "" : id);
    const p = procedimentos.find((x) => x.id === id);
    // preço do procedimento como ponto de partida; só sobrescreve valor ainda zerado
    if (p && (!valor || Number(valor) === 0)) setValor(String(p.valor ?? 0));
  };

  const valorNum = Number(valor.replace(",", ".")) || 0;
  const descontoNum = Number(desconto.replace(",", ".")) || 0;
  const totalNum = Math.max(0, valorNum - descontoNum);

  const previaRecorrencia = useMemo(() => {
    if (!comRecorrencia || !inicio) return [];
    const base = new Date(inicio);
    if (Number.isNaN(base.getTime())) return [];
    return gerarDatasRecorrencia(base, {
      tipo: tipoRec,
      intervalo: Number(intervaloRec) || 1,
      qtdRepeticoes: Number(qtdRec) || 1,
      diasSemana,
    });
  }, [comRecorrencia, inicio, tipoRec, intervaloRec, qtdRec, diasSemana]);

  // ------------------------------------------------------------ validação
  const erro = useMemo(() => {
    if (!pacienteId) return "Selecione o paciente.";
    if (!profissionalId) return "Selecione o profissional.";
    if (!inicio) return "Informe o início.";
    if (!fim) return "Informe o término.";
    const i = new Date(inicio).getTime();
    const f = new Date(fim).getTime();
    if (Number.isNaN(i) || Number.isNaN(f)) return "Data ou hora inválida.";
    if (f <= i) return "O término precisa ser depois do início.";
    if (valorNum < 0 || descontoNum < 0) return "Valor e desconto não podem ser negativos.";
    if (descontoNum > valorNum) return "O desconto não pode ser maior que o valor.";
    if (comRecorrencia) {
      const q = Number(qtdRec);
      if (!q || q < 2) return "A recorrência precisa de pelo menos 2 consultas.";
      if (q > 120) return "Máximo de 120 consultas por série.";
      if ((Number(intervaloRec) || 0) < 1) return "O intervalo precisa ser no mínimo 1.";
    }
    return null;
  }, [pacienteId, profissionalId, inicio, fim, valorNum, descontoNum, comRecorrencia, qtdRec, intervaloRec]);

  // ------------------------------------------------------------ salvar
  const salvar = async () => {
    if (!clinicaId) { toast.error("Clínica não identificada"); return; }
    if (erro) { toast.error(erro); return; }

    const entrada = {
      clinicaId,
      pacienteId,
      profissionalId,
      servicoId: servicoId || null,
      cadeiraId: cadeiraId || null,
      inicio: inputLocalParaIso(inicio),
      fim: inputLocalParaIso(fim),
      modalidade,
      status,
      valor: valorNum,
      desconto: descontoNum,
      observacoes: observacoes.trim() || null,
      criadoPor: contexto?.user_id ?? null,
    };

    setSalvando(true);
    try {
      if (editando && consulta) {
        await atualizarConsulta(consulta.id, entrada);
        toast.success("Consulta atualizada");
      } else if (comRecorrencia) {
        const r = await criarSerieRecorrente(entrada, {
          tipo: tipoRec,
          intervalo: Number(intervaloRec) || 1,
          qtdRepeticoes: Number(qtdRec) || 1,
          diasSemana,
        });
        if (r.conflitos.length > 0) {
          toast.warning(`${r.criadas} consulta(s) criada(s), ${r.conflitos.length} com conflito`, {
            description: `Horário ocupado em: ${r.conflitos.slice(0, 4).join(" · ")}${r.conflitos.length > 4 ? "…" : ""}`,
          });
        } else {
          toast.success(`Série criada com ${r.criadas} consultas`);
        }
      } else {
        await criarConsulta(entrada);
        toast.success("Consulta agendada");
      }
      onSalvo();
    } catch (e: any) {
      toast.error("Não foi possível salvar", { description: traduzErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  const alternarDia = (d: number) =>
    setDiasSemana((atual) => (atual.includes(d) ? atual.filter((x) => x !== d) : [...atual, d]));

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !salvando) onFechar(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar consulta" : "Nova consulta"}</DialogTitle>
          <DialogDescription>
            {editando
              ? "Alterações de horário respeitam a agenda do profissional e da cadeira."
              : "O horário é bloqueado para o profissional e para a cadeira escolhidos."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Paciente ------------------------------------------------------ */}
          <div className="space-y-1.5">
            <Label>Paciente *</Label>
            <Popover open={popoverPaciente} onOpenChange={setPopoverPaciente}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  disabled={!!pacienteIdFixo}
                  className="w-full justify-between font-normal"
                >
                  <span className={`flex items-center gap-2 truncate ${pacienteNome ? "" : "text-muted-foreground"}`}>
                    <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {pacienteNome || "Buscar paciente pelo nome"}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                {/* shouldFilter=false: quem filtra é o Postgres, não o cmdk */}
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Digite o nome…"
                    value={buscaPaciente}
                    onValueChange={setBuscaPaciente}
                  />
                  <CommandList>
                    <CommandEmpty>
                      {buscandoPacientes ? "Buscando…" : "Nenhum paciente encontrado."}
                    </CommandEmpty>
                    <CommandGroup>
                      {pacientes.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={p.id}
                          onSelect={() => {
                            setPacienteId(p.id);
                            setPacienteNome(p.nome_completo);
                            setPopoverPaciente(false);
                          }}
                        >
                          <Check className={`mr-2 h-4 w-4 ${pacienteId === p.id ? "opacity-100" : "opacity-0"}`} />
                          <span className="truncate">{p.nome_completo}</span>
                          {p.celular && (
                            <span className="ml-auto text-xs text-muted-foreground">{p.celular}</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Procedimento / profissional ----------------------------------- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Procedimento</Label>
              <Select value={servicoId || SEM_VALOR} onValueChange={aoTrocarProcedimento}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_VALOR}>Sem procedimento definido</SelectItem>
                  {procedimentos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome} · {p.duracao_min}min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!carregandoApoio && procedimentos.length === 0 && (
                <p className="text-[11px] text-gray-400">
                  Nenhum procedimento ativo cadastrado ainda.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Profissional *</Label>
              <Select value={profissionalId} onValueChange={setProfissionalId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {profissionais.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name ?? "Sem nome"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!carregandoApoio && profissionais.length === 0 && (
                <p className="text-[11px] text-gray-400">
                  Nenhum profissional na equipe desta clínica.
                </p>
              )}
            </div>
          </div>

          {/* Cadeira / modalidade ------------------------------------------ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cadeira / sala</Label>
              <Select
                value={cadeiraId || SEM_VALOR}
                onValueChange={(v) => setCadeiraId(v === SEM_VALOR ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="Sem cadeira" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_VALOR}>Sem cadeira</SelectItem>
                  {cadeiras.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Modalidade</Label>
              <Select value={modalidade} onValueChange={(v) => setModalidade(v as Modalidade)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(MODALIDADE_LABEL) as Modalidade[]).map((m) => (
                    <SelectItem key={m} value={m}>{MODALIDADE_LABEL[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Horário / status ---------------------------------------------- */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Início *</Label>
              <Input
                type="datetime-local"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Término *</Label>
              <Input
                type="datetime-local"
                value={fim}
                onChange={(e) => { fimManual.current = true; setFim(e.target.value); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusConsulta)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_ORDEM.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dinheiro ------------------------------------------------------- */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input type="number" min="0" step="0.01" value={valor}
                     onChange={(e) => setValor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Desconto (R$)</Label>
              <Input type="number" min="0" step="0.01" value={desconto}
                     onChange={(e) => setDesconto(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Total</Label>
              {/* readonly: no banco `total` é coluna gerada (valor - desconto) */}
              <Input readOnly tabIndex={-1} value={brl(totalNum)}
                     className="bg-muted/50 font-medium tabular-nums" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={2} value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)}
                      placeholder="Anotações da recepção sobre este atendimento" />
          </div>

          {/* Recorrência ---------------------------------------------------- */}
          {!editando && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label className="flex items-center gap-2">
                    <Repeat className="h-4 w-4 text-brand-600" /> Repetir consulta
                  </Label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Cria a série inteira de uma vez. Horários ocupados são avisados e pulados.
                  </p>
                </div>
                <Switch checked={comRecorrencia} onCheckedChange={setComRecorrencia} />
              </div>

              {comRecorrencia && (
                <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label>Frequência</Label>
                      <Select value={tipoRec} onValueChange={(v) => setTipoRec(v as TipoRecorrencia)}>
                        <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(TIPO_RECORRENCIA_LABEL) as TipoRecorrencia[]).map((t) => (
                            <SelectItem key={t} value={t}>{TIPO_RECORRENCIA_LABEL[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>A cada</Label>
                      <Input type="number" min="1" max="12" className="bg-white"
                             value={intervaloRec} onChange={(e) => setIntervaloRec(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Nº de consultas</Label>
                      <Input type="number" min="2" max="120" className="bg-white"
                             value={qtdRec} onChange={(e) => setQtdRec(e.target.value)} />
                    </div>
                  </div>

                  {tipoRec === "semanal" && (
                    <div className="space-y-1.5">
                      <Label>Dias da semana</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {DIAS_SEMANA.map((d) => {
                          const ativo = diasSemana.includes(d.valor);
                          return (
                            <button
                              key={d.valor}
                              type="button"
                              onClick={() => alternarDia(d.valor)}
                              aria-pressed={ativo}
                              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                                ativo
                                  ? "bg-brand-600 text-white border-brand-600"
                                  : "bg-white text-gray-600 border-gray-200 hover:border-brand-300"
                              }`}
                            >
                              {d.curto}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-gray-400">
                        Sem dias marcados, repete no mesmo dia da semana do início.
                      </p>
                    </div>
                  )}

                  {previaRecorrencia.length > 1 && (
                    <p className="text-xs text-gray-600">
                      <span className="font-medium">{previaRecorrencia.length} consultas</span>
                      {" · de "}
                      {previaRecorrencia[0].toLocaleDateString("pt-BR")}
                      {" até "}
                      {previaRecorrencia[previaRecorrencia.length - 1].toLocaleDateString("pt-BR")}
                      {" · "}
                      {brl(totalNum * previaRecorrencia.length)} no total
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {erro && <p className="text-xs text-red-600">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || !!erro}
                  className="bg-brand-600 hover:bg-brand-700 gap-2">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {editando ? "Salvar alterações" : comRecorrencia ? "Criar série" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
