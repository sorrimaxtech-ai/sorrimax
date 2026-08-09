import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  addDays, addMinutes, addMonths, addWeeks, endOfDay, endOfMonth, endOfWeek,
  format, startOfDay, startOfMonth, startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Loader2,
  Plus, Receipt, Trash2, Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CampoMoeda } from "@/components/ui/campo-moeda";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { toast } from "sonner";

import { useTenant } from "@/hooks/useTenant";
import { CalendarioGrade, type AgrupamentoDia, type VisaoAgenda } from "@/components/agenda/CalendarioGrade";
import { AgendaPainel } from "@/components/agenda/AgendaPainel";
import { VendaNaConsulta } from "@/components/agenda/VendaNaConsulta";
import {
  atualizarConsulta, bloqueioNoIntervalo, conflitoDeProfissional, criarConsulta, excluirConsulta,
  faixaDeDisponibilidades, listarBloqueios, listarCadeiras, listarConsultas,
  listarDisponibilidades, listarPacientesOpcoes,
  listarProcedimentosAgenda, listarRotulosAgenda,
  listarProfissionaisAgenda, MODALIDADE_LABEL, STATUS_CONSULTA_CLASSE,
  STATUS_CONSULTA_COR, STATUS_CONSULTA_LABEL, STATUS_CONSULTA_ORDEM, STATUS_INATIVOS,
  type BloqueioAgenda, type CadeiraAgenda, type ConsultaAgenda, type DisponibilidadeAgenda,
  type ModalidadeAtendimento, type PacienteOpcao, type ProcedimentoAgenda,
  type RotuloAgenda, type TipoAgendamento,
  type ProfissionalAgenda, type StatusConsulta,
} from "@/services/agenda";
// o banco tem DOIS EXCLUDE de sobreposição (profissional e cadeira). A checagem
// local só cobre o profissional; o choque de cadeira só aparece como 23P01 cru.
// Reusa o tradutor que já existe em vez de duplicar a tabela de códigos.
import { mensagemErroConsulta } from "@/services/consultas";

// ============================================================================
// Agenda — calendário real sobre a tabela `consultas`
// ----------------------------------------------------------------------------
// Três visões: Dia, Semana e Mês. A visão de Mês é decisão de produto: o padrão
// do mercado para em Dia/Semana, e quem administra a clínica precisa enxergar
// ocupação do MÊS pra decidir campanha, férias e contratação.
//
// A faixa horária da grade não é constante: vem das `disponibilidades` da
// clínica (a menor hora de início e a maior de fim). Clínica que atende só à
// tarde não rola 8 horas de grade vazia. Sem disponibilidade cadastrada, cai
// no padrão 07:00–21:00.
// ============================================================================

const TODOS = "__todos__";
const NENHUM = "__nenhum__";

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

interface Formulario {
  id: string | null;
  tipo: TipoAgendamento;
  pacienteId: string;
  profissionalId: string;
  servicoId: string;
  cadeiraId: string;
  data: string;
  hora: string;
  duracao: number;
  modalidade: ModalidadeAtendimento;
  status: StatusConsulta;
  valor: string;
  titulo: string;
  observacoes: string;
  rotuloIds: string[];
  /** só leitura: existe quando o atendimento já gerou venda */
  orcamentoId: string | null;
}

const FORM_VAZIO: Formulario = {
  id: null, tipo: "consulta", pacienteId: "", profissionalId: "", servicoId: NENHUM,
  cadeiraId: NENHUM, data: "", hora: "", duracao: 30, modalidade: "presencial",
  status: "agendado", valor: "0", titulo: "", observacoes: "", rotuloIds: [],
  orcamentoId: null,
};

const Agenda = () => {
  const { clinicaId, carregando: carregandoCtx } = useTenant();

  const [searchParams, setSearchParams] = useSearchParams();
  const [visao, setVisao] = useState<VisaoAgenda>("semana");
  const [referencia, setReferencia] = useState<Date>(() => startOfDay(new Date()));
  const [agrupamentoDia, setAgrupamentoDia] = useState<AgrupamentoDia>("nenhum");
  const [filtroProfissional, setFiltroProfissional] = useState<string>(TODOS);
  const [filtroCadeira, setFiltroCadeira] = useState<string>(TODOS);

  const [profissionais, setProfissionais] = useState<ProfissionalAgenda[]>([]);
  const [cadeiras, setCadeiras] = useState<CadeiraAgenda[]>([]);
  const [procedimentos, setProcedimentos] = useState<ProcedimentoAgenda[]>([]);
  const [pacientes, setPacientes] = useState<PacienteOpcao[]>([]);
  const [disponibilidades, setDisponibilidades] = useState<DisponibilidadeAgenda[]>([]);
  const [rotulos, setRotulos] = useState<RotuloAgenda[]>([]);
  const [carregandoBase, setCarregandoBase] = useState(true);

  const [consultas, setConsultas] = useState<ConsultaAgenda[]>([]);
  const [bloqueios, setBloqueios] = useState<BloqueioAgenda[]>([]);
  const [carregandoGrade, setCarregandoGrade] = useState(true);

  const [dialogAberto, setDialogAberto] = useState(false);
  const [form, setForm] = useState<Formulario>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [vendaAberta, setVendaAberta] = useState(false);

  const semClinica = !clinicaId && !carregandoCtx;

  // ------------------------------------------------------------ dados fixos
  useEffect(() => {
    if (!clinicaId) { if (!carregandoCtx) setCarregandoBase(false); return; }
    let vivo = true;
    (async () => {
      setCarregandoBase(true);
      try {
        const [prof, cad, proc, pac, disp, rot] = await Promise.all([
          listarProfissionaisAgenda(clinicaId),
          listarCadeiras(clinicaId),
          listarProcedimentosAgenda(clinicaId),
          listarPacientesOpcoes(clinicaId),
          listarDisponibilidades(clinicaId),
          listarRotulosAgenda(clinicaId),
        ]);
        if (!vivo) return;
        setProfissionais(prof);
        setCadeiras(cad);
        setProcedimentos(proc);
        setPacientes(pac);
        setDisponibilidades(disp);
        setRotulos(rot);
      } catch (e: any) {
        if (vivo) toast.error("Erro ao carregar dados da agenda", { description: mensagemErroConsulta(e) });
      } finally {
        if (vivo) setCarregandoBase(false);
      }
    })();
    return () => { vivo = false; };
  }, [clinicaId, carregandoCtx]);

  // veio da ficha do paciente (?novo=<id>): abre o dialog ja com o paciente
  useEffect(() => {
    const novo = searchParams.get("novo");
    if (!novo || carregandoBase || !pacientes.some((p) => p.id === novo)) return;
    abrirNovaConsulta(undefined, { pacienteId: novo });
    searchParams.delete("novo");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, carregandoBase, pacientes]);

  // ------------------------------------------------------------- intervalo
  const intervalo = useMemo(() => {
    if (visao === "dia") return { ini: startOfDay(referencia), fim: endOfDay(referencia) };
    if (visao === "semana") {
      return {
        ini: startOfWeek(referencia, { weekStartsOn: 1 }),
        fim: endOfWeek(referencia, { weekStartsOn: 1 }),
      };
    }
    return {
      ini: startOfWeek(startOfMonth(referencia), { weekStartsOn: 1 }),
      fim: endOfWeek(endOfMonth(referencia), { weekStartsOn: 1 }),
    };
  }, [visao, referencia]);

  const iniISO = intervalo.ini.toISOString();
  const fimISO = intervalo.fim.toISOString();

  // clicar rápido em ">" dispara várias buscas; a rede não garante ordem de
  // chegada. Sem este selo, a resposta de uma semana antiga podia aterrissar
  // depois e pintar a grade com os dados do período errado.
  const requisicaoAtual = useRef(0);

  const carregarGrade = useCallback(async () => {
    if (!clinicaId) { if (!carregandoCtx) setCarregandoGrade(false); return; }
    const selo = ++requisicaoAtual.current;
    setCarregandoGrade(true);
    try {
      const ini = new Date(iniISO);
      const fim = new Date(fimISO);
      const [cs, bs] = await Promise.all([
        listarConsultas(clinicaId, ini, fim, {
          profissionalId: filtroProfissional === TODOS ? null : filtroProfissional,
          cadeiraId: filtroCadeira === TODOS ? null : filtroCadeira,
        }),
        listarBloqueios(clinicaId, ini, fim, filtroProfissional === TODOS ? null : filtroProfissional),
      ]);
      if (selo !== requisicaoAtual.current) return;
      setConsultas(cs);
      setBloqueios(bs);
    } catch (e: any) {
      if (selo !== requisicaoAtual.current) return;
      toast.error("Erro ao carregar a agenda", { description: mensagemErroConsulta(e) });
      setConsultas([]);
      setBloqueios([]);
    } finally {
      if (selo === requisicaoAtual.current) setCarregandoGrade(false);
    }
  }, [clinicaId, carregandoCtx, iniISO, fimISO, filtroProfissional, filtroCadeira]);

  useEffect(() => { carregarGrade(); }, [carregarGrade]);

  // --------------------------------------------------------------- derivados
  const faixa = useMemo(() => faixaDeDisponibilidades(
    filtroProfissional === TODOS
      ? disponibilidades
      : disponibilidades.filter((d) => d.profissional_id === filtroProfissional),
  ), [disponibilidades, filtroProfissional]);

  const procedimentosPorId = useMemo(
    () => Object.fromEntries(procedimentos.map((p) => [p.id, p])) as Record<string, ProcedimentoAgenda>,
    [procedimentos],
  );
  const profissionaisPorId = useMemo(
    () => Object.fromEntries(profissionais.map((p) => [p.id, p])) as Record<string, ProfissionalAgenda>,
    [profissionais],
  );

  // a legenda descreve o que está NA TELA. Listar status que não aparecem em
  // nenhum bloco é inventar informação: período vazio fica sem legenda de status.
  const statusPresentes = useMemo(() => {
    const vistos = new Set(consultas.map((c) => c.status));
    return STATUS_CONSULTA_ORDEM.filter((s) => vistos.has(s));
  }, [consultas]);

  const totais = useMemo(() => {
    const ativas = consultas.filter((c) => !STATUS_INATIVOS.includes(c.status));
    return { ativas: ativas.length, canceladas: consultas.length - ativas.length };
  }, [consultas]);

  const rotuloPeriodo = useMemo(() => {
    if (visao === "dia") return format(referencia, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    if (visao === "mes") return format(referencia, "MMMM 'de' yyyy", { locale: ptBR });
    const ini = startOfWeek(referencia, { weekStartsOn: 1 });
    const fim = addDays(ini, 6);
    return `${format(ini, "dd 'de' MMM", { locale: ptBR })} – ${format(fim, "dd 'de' MMM 'de' yyyy", { locale: ptBR })}`;
  }, [visao, referencia]);

  const navegar = (direcao: 1 | -1) => setReferencia((r) =>
    visao === "dia" ? addDays(r, direcao)
      : visao === "semana" ? addWeeks(r, direcao)
        : addMonths(r, direcao));

  // ------------------------------------------------------------- formulário
  const abrirNovaConsulta = (
    inicio?: Date,
    ctx?: { profissionalId?: string | null; cadeiraId?: string | null; tipo?: TipoAgendamento; pacienteId?: string },
  ) => {
    const quando = inicio ?? addMinutes(startOfDay(referencia), faixa.inicioMin);
    const profSugerido = ctx?.profissionalId
      ?? (filtroProfissional !== TODOS ? filtroProfissional : profissionais[0]?.id ?? "");
    const cadSugerida = ctx?.cadeiraId ?? (filtroCadeira !== TODOS ? filtroCadeira : NENHUM);
    setForm({
      ...FORM_VAZIO,
      tipo: ctx?.tipo ?? "consulta",
      pacienteId: ctx?.pacienteId ?? "",
      profissionalId: profSugerido,
      cadeiraId: cadSugerida || NENHUM,
      data: format(quando, "yyyy-MM-dd"),
      hora: format(quando, "HH:mm"),
      duracao: faixa.slotMin || 30,
    });
    setDialogAberto(true);
  };

  const abrirConsultaExistente = (c: ConsultaAgenda) => {
    const ini = new Date(c.inicio);
    const fim = new Date(c.fim);
    setForm({
      id: c.id,
      tipo: c.tipo ?? "consulta",
      pacienteId: c.paciente_id ?? "",
      profissionalId: c.profissional_id,
      servicoId: c.servico_id ?? NENHUM,
      cadeiraId: c.cadeira_id ?? NENHUM,
      data: format(ini, "yyyy-MM-dd"),
      hora: format(ini, "HH:mm"),
      duracao: Math.max(5, Math.round((fim.getTime() - ini.getTime()) / 60000)),
      modalidade: c.modalidade,
      status: c.status,
      valor: String(c.valor ?? 0),
      titulo: c.titulo ?? "",
      observacoes: c.observacoes ?? "",
      rotuloIds: (c.rotulos ?? []).map((r) => r.id),
      orcamentoId: c.orcamento_id ?? null,
    });
    setDialogAberto(true);
  };

  const alternarRotulo = (id: string) =>
    setForm((f) => ({
      ...f,
      rotuloIds: f.rotuloIds.includes(id)
        ? f.rotuloIds.filter((r) => r !== id)
        : [...f.rotuloIds, id],
    }));

  /** Trocar o procedimento reescreve duração e valor — é o preço/tempo de tabela. */
  const escolherProcedimento = (id: string) => {
    if (id === NENHUM) { setForm((f) => ({ ...f, servicoId: NENHUM })); return; }
    const p = procedimentosPorId[id];
    setForm((f) => ({
      ...f,
      servicoId: id,
      duracao: p?.duracao_min || f.duracao,
      valor: p ? String(p.valor ?? 0) : f.valor,
    }));
  };

  const salvar = async () => {
    if (!clinicaId) return;
    const ehCompromisso = form.tipo === "compromisso";
    if (ehCompromisso) {
      if (!form.titulo.trim()) { toast.error("Dê um nome ao compromisso"); return; }
    } else if (!form.pacienteId) {
      toast.error("Selecione o paciente"); return;
    }
    if (!form.profissionalId) { toast.error("Selecione o profissional"); return; }
    if (!form.data || !form.hora) { toast.error("Informe data e horário"); return; }
    if (!form.duracao || form.duracao < 5) { toast.error("Duração mínima de 5 minutos"); return; }

    const inicio = new Date(`${form.data}T${form.hora}:00`);
    if (Number.isNaN(inicio.getTime())) { toast.error("Data ou horário inválido"); return; }
    const fim = addMinutes(inicio, form.duracao);
    const valor = Number(String(form.valor).replace(",", "."));
    if (Number.isNaN(valor) || valor < 0) { toast.error("Valor inválido"); return; }

    setSalvando(true);
    try {
      // agenda de profissional é recurso exclusivo: duas consultas vivas no mesmo
      // horário significam que uma delas não vai ser atendida
      if (!STATUS_INATIVOS.includes(form.status)) {
        const choque = await conflitoDeProfissional(
          clinicaId, form.profissionalId, inicio, fim, form.id ?? undefined,
        );
        if (choque) {
          toast.error("Conflito de horário", {
            description: `${profissionaisPorId[form.profissionalId]?.full_name ?? "O profissional"} já tem "${
              choque.pacientes?.nome_completo ?? "outra consulta"
            }" das ${new Date(choque.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} às ${
              new Date(choque.fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`,
          });
          setSalvando(false);
          return;
        }

        // a grade pinta o bloqueio como intocável; gravar por cima faria a tela
        // mentir duas vezes — no dia bloqueado e no relatório de ocupação
        const bloqueio = await bloqueioNoIntervalo(clinicaId, form.profissionalId, inicio, fim);
        if (bloqueio) {
          toast.error("Horário bloqueado", {
            description: `${bloqueio.motivo ?? "Bloqueio de agenda"} — das ${
              new Date(bloqueio.inicio).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
            } às ${
              new Date(bloqueio.fim).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
            }. Remova o bloqueio ou escolha outro horário.`,
          });
          setSalvando(false);
          return;
        }
      }

      const entrada = {
        clinicaId,
        tipo: form.tipo,
        pacienteId: ehCompromisso ? null : form.pacienteId,
        profissionalId: form.profissionalId,
        servicoId: form.servicoId === NENHUM ? null : form.servicoId,
        cadeiraId: form.cadeiraId === NENHUM ? null : form.cadeiraId,
        inicio,
        fim,
        modalidade: form.modalidade,
        status: form.status,
        valor,
        titulo: form.titulo.trim() || null,
        observacoes: form.observacoes.trim() || null,
        rotuloIds: form.rotuloIds,
      };

      if (form.id) {
        await atualizarConsulta(clinicaId, form.id, entrada);
        toast.success(ehCompromisso ? "Compromisso atualizado" : "Consulta atualizada");
      } else {
        await criarConsulta(entrada);
        toast.success(ehCompromisso ? "Compromisso criado" : "Consulta agendada");
      }
      setDialogAberto(false);
      await carregarGrade();
    } catch (e: any) {
      toast.error("Erro ao salvar a consulta", { description: mensagemErroConsulta(e) });
    } finally {
      setSalvando(false);
    }
  };

  const remover = async () => {
    if (!form.id || !clinicaId) return;
    setExcluindo(true);
    try {
      await excluirConsulta(clinicaId, form.id);
      toast.success("Consulta excluída");
      setConfirmarExclusao(false);
      setDialogAberto(false);
      await carregarGrade();
    } catch (e: any) {
      toast.error("Erro ao excluir", { description: mensagemErroConsulta(e) });
    } finally {
      setExcluindo(false);
    }
  };

  // ------------------------------------------------------------------- view
  const semCadastroBasico = !carregandoBase && (pacientes.length === 0 || profissionais.length === 0);

  return (
    <div className="flex min-h-full bg-background dashboard-theme">
      {!semClinica && (
        <AgendaPainel
          referencia={referencia}
          onSelecionarDia={(d) => { setReferencia(startOfDay(d)); if (visao === "mes") setVisao("dia"); }}
          cadeiras={cadeiras}
          profissionais={profissionais}
          filtroCadeira={filtroCadeira}
          onFiltroCadeira={setFiltroCadeira}
          filtroProfissional={filtroProfissional}
          onFiltroProfissional={setFiltroProfissional}
        />
      )}
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-4 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <CalendarDays className="h-6 w-6 text-brand-600" /> Agenda
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                Cadeira vazia é receita que não volta. Veja o dia, a semana e o mês inteiro em um só lugar.
              </p>
            </div>
            <div className="flex gap-2">
              {/* Compromisso não depende de paciente cadastrado — por isso o
                  botão não usa `semCadastroBasico`: dá pra bloquear a agenda
                  para uma reunião antes de cadastrar o primeiro paciente. */}
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => abrirNovaConsulta(undefined, { tipo: "compromisso" })}
                disabled={semClinica || profissionais.length === 0}
              >
                <CalendarClock className="h-4 w-4" /> Compromisso
              </Button>
              <Button
                className="bg-brand-600 hover:bg-brand-700 gap-2"
                onClick={() => abrirNovaConsulta()}
                disabled={semClinica || semCadastroBasico}
              >
                <Plus className="h-4 w-4" /> Nova consulta
              </Button>
            </div>
          </div>

          {semClinica ? (
            <Card className="border-gray-100">
              <CardContent className="p-12 flex flex-col items-center gap-2 text-center">
                <CalendarDays className="h-10 w-10 text-gray-300" />
                <p className="font-medium text-gray-800">Nenhuma clínica vinculada a este usuário</p>
                <p className="text-sm text-gray-500 max-w-md">
                  A agenda é sempre de uma clínica. Conclua o cadastro da clínica para começar a agendar.
                </p>
                <Button asChild variant="outline" className="mt-2">
                  <Link to="/configurar-clinica">Configurar clínica</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {semCadastroBasico && (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    Falta {pacientes.length === 0 ? "cadastrar pacientes" : ""}
                    {pacientes.length === 0 && profissionais.length === 0 ? " e " : ""}
                    {profissionais.length === 0 ? "cadastrar a equipe" : ""} para conseguir agendar.
                  </span>
                  {pacientes.length === 0 && (
                    <Link to="/pacientes" className="font-medium underline underline-offset-2">Pacientes</Link>
                  )}
                  {profissionais.length === 0 && (
                    <Link to="/profissionais" className="font-medium underline underline-offset-2">Equipe</Link>
                  )}
                </div>
              )}

              {/* controles — barra da agenda no estilo do segmento (Semana/Dia/Cadeira/Mês) */}
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => navegar(-1)} aria-label="Período anterior">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" className="h-9" onClick={() => setReferencia(startOfDay(new Date()))}>
                    Hoje
                  </Button>
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => navegar(1)} aria-label="Próximo período">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <p className="text-base font-semibold capitalize text-gray-900 min-w-[170px]">{rotuloPeriodo}</p>

                {/* toggle segmentado: Cadeira = dia agrupado por cadeira */}
                <div className="ml-auto inline-flex rounded-xl bg-muted p-1">
                  {([
                    { id: "semana", rot: "Semana", ativo: visao === "semana", set: () => setVisao("semana") },
                    { id: "dia", rot: "Dia", ativo: visao === "dia" && agrupamentoDia !== "cadeira", set: () => { setVisao("dia"); setAgrupamentoDia("nenhum"); } },
                    { id: "cadeira", rot: "Cadeira", ativo: visao === "dia" && agrupamentoDia === "cadeira", set: () => { setVisao("dia"); setAgrupamentoDia("cadeira"); } },
                    { id: "mes", rot: "Mês", ativo: visao === "mes", set: () => setVisao("mes") },
                  ] as const).map((v) => (
                    <button
                      key={v.id}
                      onClick={v.set}
                      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                        v.ativo ? "bg-card text-brand-700 shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {v.rot}
                    </button>
                  ))}
                </div>
              </div>

              {/* legenda */}
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600">
                <span className="font-medium text-gray-500">Legenda:</span>
                {statusPresentes.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_CONSULTA_COR[s] }} />
                    {STATUS_CONSULTA_LABEL[s]}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-4 rounded-sm border border-gray-300"
                    style={{ backgroundImage: "repeating-linear-gradient(45deg, #e5e7eb 0 4px, #f3f4f6 4px 8px)" }}
                  />
                  Bloqueio
                </span>
                <span className="ml-auto text-gray-500">
                  {totais.ativas} {totais.ativas === 1 ? "consulta ativa" : "consultas ativas"}
                  {totais.canceladas > 0 && ` · ${totais.canceladas} cancelada(s)`}
                </span>
              </div>

              <Card className="border-gray-100">
                <CardContent className="p-0">
                  {carregandoGrade || carregandoBase ? (
                    <div className="flex justify-center p-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <CalendarioGrade
                      visao={visao}
                      referencia={referencia}
                      faixa={faixa}
                      consultas={consultas}
                      bloqueios={bloqueios}
                      procedimentosPorId={procedimentosPorId}
                      profissionaisPorId={profissionaisPorId}
                      profissionais={profissionais}
                      cadeiras={cadeiras}
                      agrupamentoDia={agrupamentoDia}
                      onSlotVazio={(inicio, ctx) => abrirNovaConsulta(inicio, ctx)}
                      onAbrirConsulta={abrirConsultaExistente}
                      onSelecionarDia={(d) => { setReferencia(startOfDay(d)); setVisao("dia"); }}
                    />
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>

      <VendaNaConsulta
        aberto={vendaAberta}
        onFechar={() => setVendaAberta(false)}
        consultaId={form.id}
        pacienteNome={pacientes.find((p) => p.id === form.pacienteId)?.nome_completo ?? "este paciente"}
        procedimentos={procedimentos}
        servicoIdSugerido={form.servicoId === NENHUM ? null : form.servicoId}
        jaTemOrcamento={!!form.orcamentoId}
        onLancado={() => { setDialogAberto(false); carregarGrade(); }}
      />

      {/* ----------------------------------------------------- nova / editar */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {form.id
                ? (form.tipo === "compromisso" ? "Editar compromisso" : "Editar consulta")
                : (form.tipo === "compromisso" ? "Novo compromisso" : "Nova consulta")}
            </DialogTitle>
            <DialogDescription>
              {form.tipo === "compromisso"
                ? "Bloco interno da agenda: reunião, manutenção, visita de protético. Ocupa o horário do profissional, mas não tem paciente nem procedimento."
                : "O horário é validado contra a agenda do profissional antes de salvar."}
            </DialogDescription>
          </DialogHeader>

          {/* Tipo — decide a natureza do bloco e o que o formulário pede.
              Trocar depois de criado mexeria em paciente/venda já vinculados,
              então só aparece na criação. */}
          {!form.id && (
            <div className="inline-flex rounded-lg border border-border p-1 bg-gray-100 self-start">
              {([
                { v: "consulta" as const, t: "Consulta", i: Users, d: "Atendimento de paciente" },
                { v: "compromisso" as const, t: "Compromisso", i: CalendarClock, d: "Bloco interno, sem paciente" },
              ]).map((o) => {
                const sel = form.tipo === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    title={o.d}
                    aria-pressed={sel}
                    onClick={() => setForm((f) => ({ ...f, tipo: o.v }))}
                    // O estado selecionado precisa vencer o anel de foco do
                    // navegador: sem preenchimento sólido, o item focado parece
                    // o escolhido e o usuário erra o tipo do agendamento.
                    className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm transition-colors ${
                      sel
                        ? "bg-brand-600 text-white font-medium shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <o.i className="h-4 w-4" />
                    {o.t}
                  </button>
                );
              })}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {form.tipo === "compromisso" ? (
              <div className="sm:col-span-2">
                <Label>Título *</Label>
                <Input
                  className="mt-1"
                  placeholder="Reunião de equipe, manutenção do compressor, visita do protético…"
                  value={form.titulo}
                  onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                />
              </div>
            ) : (
              <div className="sm:col-span-2">
                <Label>Paciente *</Label>
                <Select value={form.pacienteId} onValueChange={(v) => setForm((f) => ({ ...f, pacienteId: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={pacientes.length ? "Selecione o paciente" : "Nenhum paciente cadastrado"} />
                  </SelectTrigger>
                  <SelectContent>
                    {pacientes.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome_completo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.pacienteId && (
                  <Link
                    to={`/pacientes/${form.pacienteId}`}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    <Users className="h-3 w-3" /> Ver ficha do paciente
                  </Link>
                )}
              </div>
            )}

            <div>
              <Label>Profissional *</Label>
              <Select value={form.profissionalId} onValueChange={(v) => setForm((f) => ({ ...f, profissionalId: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={profissionais.length ? "Selecione" : "Nenhum profissional"} />
                </SelectTrigger>
                <SelectContent>
                  {profissionais.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name ?? "Sem nome"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.tipo === "consulta" && (
              <div>
                <Label>Procedimento</Label>
                <Select value={form.servicoId} onValueChange={escolherProcedimento}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Sem procedimento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUM}>Sem procedimento</SelectItem>
                    {procedimentos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.cor }} />
                          {p.nome} · {p.duracao_min} min
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Cadeira</Label>
              <Select value={form.cadeiraId} onValueChange={(v) => setForm((f) => ({ ...f, cadeiraId: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Sem cadeira" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NENHUM}>Sem cadeira</SelectItem>
                  {cadeiras.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Modalidade</Label>
              <Select
                value={form.modalidade}
                onValueChange={(v) => setForm((f) => ({ ...f, modalidade: v as ModalidadeAtendimento }))}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(MODALIDADE_LABEL) as ModalidadeAtendimento[]).map((m) => (
                    <SelectItem key={m} value={m}>{MODALIDADE_LABEL[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="data">Data *</Label>
              <Input
                id="data" type="date" className="mt-1" value={form.data}
                onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="hora">Início *</Label>
              <Input
                id="hora" type="time" step={300} className="mt-1" value={form.hora}
                onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="duracao">Duração (min) *</Label>
              <Input
                id="duracao" type="number" min={5} step={5} className="mt-1" value={form.duracao}
                onChange={(e) => setForm((f) => ({ ...f, duracao: Number(e.target.value) }))}
              />
            </div>

            {form.tipo === "consulta" && (
              <div>
                <Label htmlFor="valor">Valor</Label>
                <CampoMoeda
                  id="valor" className="mt-1" value={form.valor === "" ? null : Number(form.valor)}
                  onChange={(r) => setForm((f) => ({ ...f, valor: r == null ? "" : String(r) }))}
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  {brl(Number(String(form.valor).replace(",", ".")) || 0)} · estimativa. A venda é lançada no atendimento.
                </p>
              </div>
            )}

            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as StatusConsulta }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_CONSULTA_ORDEM.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_CONSULTA_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge className={`mt-2 ${STATUS_CONSULTA_CLASSE[form.status]}`}>
                {STATUS_CONSULTA_LABEL[form.status]}
              </Badge>
            </div>

            {/* Rótulos — classificam o bloco sem virar campo obrigatório.
                É o que permite a recepção enxergar "urgência" e "primeira
                consulta" na grade sem abrir o agendamento. */}
            <div className="sm:col-span-2">
              <Label>Rótulos</Label>
              {rotulos.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Nenhum rótulo cadastrado.{" "}
                  <Link to="/rotulos" className="text-brand-700 underline underline-offset-2">
                    Criar rótulos
                  </Link>
                </p>
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {rotulos.map((r) => {
                    const ativo = form.rotuloIds.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        aria-pressed={ativo}
                        onClick={() => alternarRotulo(r.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                          ativo
                            ? "border-transparent text-white"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                        style={ativo ? { backgroundColor: r.cor } : undefined}
                      >
                        {!ativo && (
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.cor }} />
                        )}
                        {r.nome}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="obs">Observações</Label>
              <Textarea
                id="obs" className="mt-1" rows={3} value={form.observacoes}
                placeholder="Anotações internas sobre este agendamento"
                onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {form.id ? (
              <Button
                variant="outline"
                className="text-red-600 hover:text-red-700 gap-2"
                onClick={() => setConfirmarExclusao(true)}
              >
                <Trash2 className="h-4 w-4" /> Excluir
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              {/* Só em consulta já gravada: a venda precisa de um atendimento
                  existente para se pendurar. */}
              {form.id && form.tipo === "consulta" && (
                <Button variant="outline" className="gap-2" onClick={() => setVendaAberta(true)}>
                  <Receipt className="h-4 w-4" />
                  {form.orcamentoId ? "Ver / somar venda" : "Lançar venda"}
                </Button>
              )}
              <Button variant="outline" onClick={() => setDialogAberto(false)}>Cancelar</Button>
              <Button className="bg-brand-600 hover:bg-brand-700 gap-2" onClick={salvar} disabled={salvando}>
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                {form.id ? "Salvar alterações" : "Agendar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarExclusao} onOpenChange={setConfirmarExclusao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta consulta?</AlertDialogTitle>
            <AlertDialogDescription>
              A consulta some da agenda e do histórico. Se o paciente apenas desmarcou, prefira mudar o
              status para "Desmarcado" — assim o indicador de faltas continua correto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Manter</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => { e.preventDefault(); remover(); }}
              disabled={excluindo}
            >
              {excluindo ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Agenda;
