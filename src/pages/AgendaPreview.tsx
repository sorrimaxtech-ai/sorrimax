import { useMemo, useState } from "react";
import { startOfDay, addWeeks, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgendaPainel } from "@/components/agenda/AgendaPainel";
import {
  CalendarioGrade, type AgrupamentoDia, type VisaoAgenda,
} from "@/components/agenda/CalendarioGrade";
import type {
  CadeiraAgenda, ConsultaAgenda, ProfissionalAgenda,
} from "@/services/agenda";

// ============================================================================
// /agenda-preview — bancada isolada da agenda (SEM banco, SEM login)
// ----------------------------------------------------------------------------
// Monta o painel + a grade com dados de exemplo estáticos para calibrar o
// visual contra a referência do segmento. O que aparece aqui é exatamente o que
// a Agenda real renderiza (mesmos componentes), sem risco de mexer no caminho
// de dados real.
// ============================================================================

const TODOS = "__todos__";

const CADEIRAS: CadeiraAgenda[] = [
  { id: "c1", nome: "Cadeira 01", cor: "#00b4d8" },
  { id: "c2", nome: "Cadeira 02", cor: "#0077b6" },
];

const PROFISSIONAIS: ProfissionalAgenda[] = [
  { id: "p1", full_name: "Dra. Paula Mendes", especialidade: "Ortodontia" },
  { id: "p2", full_name: "Dr. Rafael Lima", especialidade: "Implantodontia" },
];

function consulta(
  id: string, h: number, m: number, dur: number,
  nome: string, prof: string, cad: string, status: ConsultaAgenda["status"],
): ConsultaAgenda {
  const ini = startOfDay(new Date()); ini.setHours(h, m, 0, 0);
  const fim = new Date(ini.getTime() + dur * 60000);
  return {
    id, tipo: "consulta", inicio: ini.toISOString(), fim: fim.toISOString(),
    status, modalidade: "presencial", titulo: null, observacoes: null,
    valor: 0, desconto: 0, total: 0, paciente_id: id, profissional_id: prof,
    servico_id: null, cadeira_id: cad, orcamento_id: null,
    pacientes: { nome_completo: nome }, rotulos: [],
  };
}

const CONSULTAS: ConsultaAgenda[] = [
  consulta("a", 8, 0, 60, "Ana Souza", "p1", "c1", "confirmado"),
  consulta("b", 9, 30, 30, "Bruno Lima", "p1", "c1", "agendado"),
  consulta("c", 10, 0, 90, "Carla Dias", "p2", "c2", "em_atendimento"),
  consulta("d", 14, 0, 45, "Diego Rocha", "p2", "c2", "agendado"),
  consulta("e", 15, 30, 30, "Elena Martins", "p1", "c1", "confirmado"),
];

const FAIXA = { inicioMin: 7 * 60, fimMin: 20 * 60, slotMin: 30 };

export default function AgendaPreview() {
  const [visao, setVisao] = useState<VisaoAgenda>("semana");
  const [referencia, setReferencia] = useState(() => startOfDay(new Date()));
  const [agrupamentoDia, setAgrupamentoDia] = useState<AgrupamentoDia>("nenhum");
  const [filtroCadeira, setFiltroCadeira] = useState(TODOS);
  const [filtroProfissional, setFiltroProfissional] = useState(TODOS);

  const consultasFiltradas = useMemo(() => CONSULTAS.filter((c) =>
    (filtroCadeira === TODOS || c.cadeira_id === filtroCadeira) &&
    (filtroProfissional === TODOS || c.profissional_id === filtroProfissional)
  ), [filtroCadeira, filtroProfissional]);

  const rotulo = visao === "semana"
    ? `${format(referencia, "MMMM yyyy", { locale: ptBR })}`
    : format(referencia, "EEEE, dd 'de' MMMM", { locale: ptBR });

  const navegar = (d: number) =>
    setReferencia((r) => (visao === "semana" ? addWeeks(r, d) : new Date(r.getTime() + d * 864e5)));

  return (
    <div className="flex h-screen bg-background dashboard-theme">
      <AgendaPainel
        referencia={referencia}
        onSelecionarDia={(d) => { setReferencia(startOfDay(d)); if (visao === "mes") setVisao("dia"); }}
        cadeiras={CADEIRAS}
        profissionais={PROFISSIONAIS}
        filtroCadeira={filtroCadeira}
        onFiltroCadeira={setFiltroCadeira}
        filtroProfissional={filtroProfissional}
        onFiltroProfissional={setFiltroProfissional}
      />
      <main className="flex-1 min-w-0 overflow-auto p-6">
        <div className="mb-4 flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-brand-600" />
          <h1 className="text-2xl font-bold">Agenda (preview)</h1>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => navegar(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="h-9" onClick={() => setReferencia(startOfDay(new Date()))}>Hoje</Button>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => navegar(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <p className="min-w-[170px] text-base font-semibold capitalize text-gray-900">{rotulo}</p>
          <div className="ml-auto inline-flex rounded-xl bg-muted p-1">
            {([
              { rot: "Semana", ativo: visao === "semana", set: () => setVisao("semana") },
              { rot: "Dia", ativo: visao === "dia" && agrupamentoDia !== "cadeira", set: () => { setVisao("dia"); setAgrupamentoDia("nenhum"); } },
              { rot: "Cadeira", ativo: visao === "dia" && agrupamentoDia === "cadeira", set: () => { setVisao("dia"); setAgrupamentoDia("cadeira"); } },
              { rot: "Mês", ativo: visao === "mes", set: () => setVisao("mes") },
            ] as const).map((v) => (
              <button key={v.rot} onClick={v.set}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                  v.ativo ? "bg-card text-brand-700 shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}>
                {v.rot}
              </button>
            ))}
          </div>
        </div>
        <CalendarioGrade
          visao={visao}
          referencia={referencia}
          faixa={FAIXA}
          consultas={consultasFiltradas}
          bloqueios={[]}
          procedimentosPorId={{}}
          profissionaisPorId={Object.fromEntries(PROFISSIONAIS.map((p) => [p.id, p]))}
          profissionais={PROFISSIONAIS}
          cadeiras={CADEIRAS}
          agrupamentoDia={agrupamentoDia}
          onSlotVazio={() => {}}
          onAbrirConsulta={() => {}}
          onSelecionarDia={(d) => { setReferencia(startOfDay(d)); setVisao("dia"); }}
        />
      </main>
    </div>
  );
}
