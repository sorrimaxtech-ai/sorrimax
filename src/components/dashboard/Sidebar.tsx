import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useDemoMode } from "@/hooks/useDemoMode";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODULOS, MODULOS_RODAPE, moduloDaRota, type Modulo } from "@/config/navegacao";
import { useTenant } from "@/hooks/useTenant";

// ============================================================================
// Sidebar — lugares do sistema, não lista de telas
// ----------------------------------------------------------------------------
// Antes: 30 itens em 9 grupos rotulados, com "Fluxo de Caixa", "Contas a
// Receber", "Contas a Pagar" e "Comissões" todos disputando espaço no mesmo
// nível de "Agenda". O usuário lia o menu inteiro toda vez.
//
// Agora: 12 módulos, sem rótulo de grupo. O que era sub-item virou aba dentro
// do módulo (ModuloTabs), ao lado do conteúdo. Identidade SORRIMAX no topo
// ficou na TopBar — aqui é só navegação.
// ============================================================================

export const Sidebar = () => {
  const [recolhida, setRecolhida] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isDemo } = useDemoMode();
  const { contexto } = useTenant();

  const isAdmin = isDemo || contexto?.role === "admin";
  const atual = moduloDaRota(location.pathname);

  const visivel = (m: Modulo) => !m.soAdmin || isAdmin;

  const Item = ({ m }: { m: Modulo }) => {
    const ativo = atual?.label === m.label;
    const emBreve = m.pronto === undefined;
    return (
      <button
        onClick={() => navigate(m.href)}
        title={recolhida ? m.label : undefined}
        aria-current={ativo ? "page" : undefined}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
          ativo
            ? "bg-brand-50 text-brand-700 font-medium"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
          recolhida && "justify-center",
        )}
      >
        <m.icon className="h-[18px] w-[18px] shrink-0" />
        {!recolhida && (
          <>
            <span className="flex-1 text-left truncate">{m.label}</span>
            {m.badge && (
              <span className="text-[9px] leading-none px-1 py-[3px] rounded bg-brand-100 text-brand-700 font-medium shrink-0">
                {m.badge}
              </span>
            )}
            {emBreve && (
              <span
                title="Módulo em construção"
                className="text-[9px] leading-none px-1 py-[3px] rounded bg-muted text-muted-foreground/80 shrink-0"
              >
                breve
              </span>
            )}
          </>
        )}
      </button>
    );
  };

  return (
    <aside
      className={cn(
        // some no mobile — lá a navegação vira drawer (MobileMenu na TopBar)
        "bg-card border-r border-border hidden lg:flex flex-col shrink-0 transition-all duration-200",
        recolhida ? "w-16" : "w-[228px]",
      )}
    >
      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
        {MODULOS.filter(visivel).map((m) => <Item key={m.label} m={m} />)}
      </nav>

      <div className="px-2 py-2 border-t border-border space-y-0.5">
        {MODULOS_RODAPE.filter(visivel).map((m) => <Item key={m.label} m={m} />)}
        <button
          onClick={() => setRecolhida(!recolhida)}
          aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          {recolhida
            ? <ChevronRight className="h-[18px] w-[18px] shrink-0" />
            : <ChevronLeft className="h-[18px] w-[18px] shrink-0" />}
          {!recolhida && <span className="flex-1 text-left">Recolher</span>}
        </button>
      </div>
    </aside>
  );
};
