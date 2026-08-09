import { useMemo, useState } from "react";
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay,
  isSameMonth, startOfMonth, startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, ChevronDown, Armchair, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { CadeiraAgenda, ProfissionalAgenda } from "@/services/agenda";

// ============================================================================
// AgendaPainel — coluna lateral da agenda (mini-calendário + filtros)
// ----------------------------------------------------------------------------
// Modelo de recepção de software odontológico: o dia se escolhe num mini-mês, e
// Cadeiras / Agendas viram listas-filtro em vez de dropdowns. Um clique numa
// cadeira ou num profissional filtra a grade; "Todas" limpa. Colapsável para
// dar mais espaço à grade em telas menores.
// ============================================================================

const TODOS = "__todos__";
const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

interface Props {
  referencia: Date;
  onSelecionarDia: (d: Date) => void;
  cadeiras: CadeiraAgenda[];
  profissionais: ProfissionalAgenda[];
  filtroCadeira: string;
  onFiltroCadeira: (id: string) => void;
  filtroProfissional: string;
  onFiltroProfissional: (id: string) => void;
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const [aberta, setAberta] = useState(true);
  return (
    <div className="border-t border-border/60 px-4 py-3">
      <button
        onClick={() => setAberta((v) => !v)}
        className="mb-1 flex w-full items-center justify-between text-sm font-semibold text-foreground"
      >
        {titulo}
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !aberta && "-rotate-90")} />
      </button>
      {aberta && <div className="mt-1 space-y-0.5">{children}</div>}
    </div>
  );
}

function ItemFiltro({
  ativo, onClick, children,
}: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
        ativo ? "bg-brand-50 font-semibold text-brand-700" : "text-foreground hover:bg-muted/60",
      )}
    >
      {children}
    </button>
  );
}

export function AgendaPainel({
  referencia, onSelecionarDia, cadeiras, profissionais,
  filtroCadeira, onFiltroCadeira, filtroProfissional, onFiltroProfissional,
}: Props) {
  const [mesRef, setMesRef] = useState(() => startOfMonth(referencia));

  // grade do mini-mês: semanas completas cobrindo o mês (domingo a sábado)
  const dias = useMemo(() => {
    const ini = startOfWeek(startOfMonth(mesRef), { weekStartsOn: 0 });
    const fim = endOfWeek(endOfMonth(mesRef), { weekStartsOn: 0 });
    return eachDayOfInterval({ start: ini, end: fim });
  }, [mesRef]);

  const hoje = new Date();

  return (
    <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-card lg:flex">
      {/* Mini-calendário */}
      <div className="px-4 py-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-bold capitalize">
            {format(mesRef, "MMMM yyyy", { locale: ptBR })}
          </span>
          <div className="flex gap-0.5">
            <button className="rounded p-1 hover:bg-muted" onClick={() => setMesRef((m) => addMonths(m, -1))} aria-label="Mês anterior">
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <button className="rounded p-1 hover:bg-muted" onClick={() => setMesRef((m) => addMonths(m, 1))} aria-label="Próximo mês">
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center">
          {DIAS_SEMANA.map((d, i) => (
            <span key={i} className="py-1 text-[11px] font-medium text-muted-foreground">{d}</span>
          ))}
          {dias.map((dia) => {
            const foraDoMes = !isSameMonth(dia, mesRef);
            const selecionado = isSameDay(dia, referencia);
            const ehHoje = isSameDay(dia, hoje);
            return (
              <button
                key={dia.toISOString()}
                onClick={() => onSelecionarDia(dia)}
                className={cn(
                  "mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs transition-colors",
                  foraDoMes && "text-muted-foreground/40",
                  !selecionado && !foraDoMes && "hover:bg-muted",
                  selecionado && "bg-brand-600 font-bold text-white",
                  !selecionado && ehHoje && "font-bold text-brand-600",
                )}
              >
                {format(dia, "d")}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cadeiras */}
      <Secao titulo="Cadeiras">
        {cadeiras.map((c) => (
          <ItemFiltro key={c.id} ativo={filtroCadeira === c.id} onClick={() => onFiltroCadeira(c.id)}>
            <span className="truncate">{c.nome}</span>
          </ItemFiltro>
        ))}
        <ItemFiltro ativo={filtroCadeira === TODOS} onClick={() => onFiltroCadeira(TODOS)}>
          <Armchair className="h-4 w-4" /> Todas
        </ItemFiltro>
        <Link
          to="/cadeiras"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60"
        >
          <Plus className="h-4 w-4" /> Adicionar cadeira
        </Link>
      </Secao>

      {/* Agendas (profissionais) */}
      <Secao titulo="Agendas">
        <ItemFiltro ativo={filtroProfissional === TODOS} onClick={() => onFiltroProfissional(TODOS)}>
          Todos os profissionais
        </ItemFiltro>
        {profissionais.map((p) => (
          <ItemFiltro key={p.id} ativo={filtroProfissional === p.id} onClick={() => onFiltroProfissional(p.id)}>
            <span className="truncate">{p.full_name ?? "Sem nome"}</span>
          </ItemFiltro>
        ))}
        <Link
          to="/profissionais"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60"
        >
          <Plus className="h-4 w-4" /> Adicionar profissional
        </Link>
      </Secao>
    </aside>
  );
}
