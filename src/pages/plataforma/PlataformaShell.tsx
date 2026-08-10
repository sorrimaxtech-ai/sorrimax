import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Suspense } from "react";
import { ArrowLeft, Loader2, Building2, LineChart, UserPlus, Map, History } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { cn } from "@/lib/utils";

// ============================================================================
// Painel da Plataforma — moldura
// ----------------------------------------------------------------------------
// De propósito NÃO usa o AppShell da clínica. São dois produtos: lá dentro o
// usuário é a recepção de uma clínica; aqui é o time Sorrimax olhando todas.
// Misturar as duas molduras faria alguém achar que "Clínicas" é uma tela do
// sistema odontológico. O topo escuro é o sinal de que se está do lado de
// dentro — e o "Voltar ao sistema" é a porta de saída sempre visível.
// ============================================================================

const ABAS = [
  { href: "/plataforma",            label: "Visão geral",  icon: LineChart, fim: true },
  { href: "/plataforma/contas",     label: "Clínicas",     icon: Building2 },
  { href: "/plataforma/potenciais", label: "Potenciais",   icon: UserPlus },
  { href: "/plataforma/mercado",    label: "Mercado",      icon: Map },
  { href: "/plataforma/registro",   label: "Registro",     icon: History },
];

export default function PlataformaShell() {
  const { contexto } = useTenant();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand-950 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/agenda")}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao sistema
            </button>
            <span className="h-4 w-px bg-white/20" />
            <div>
              <h1 className="text-base font-semibold leading-tight">Painel Sorrimax</h1>
              <p className="text-xs text-white/60">Todas as clínicas, assinaturas e contatos</p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-sm font-medium">{contexto?.nome ?? contexto?.email}</p>
            <p className="text-xs text-white/60">
              {contexto?.plataforma_papel === "dono" ? "Responsável" : "Suporte"}
            </p>
          </div>
        </div>

        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 lg:px-8">
          {ABAS.map(({ href, label, icon: Icon, fim }) => (
            <NavLink
              key={href}
              to={href}
              end={fim}
              className={({ isActive }) => cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors",
                isActive
                  ? "border-brand-400 font-medium text-white"
                  : "border-transparent text-white/60 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <Suspense fallback={
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
