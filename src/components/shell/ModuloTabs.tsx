import { useNavigate, useLocation } from "react-router-dom";
import { moduloDaRota, abaDaRota } from "@/config/navegacao";
import { useTenant } from "@/hooks/useTenant";
import { useDemoMode } from "@/hooks/useDemoMode";
import { cn } from "@/lib/utils";

// ============================================================================
// ModuloTabs — sub-navegação do módulo
// ----------------------------------------------------------------------------
// É o que substitui os 30 itens da barra lateral. As opções de um módulo ficam
// ao lado do conteúdo, não misturadas com as de todos os outros módulos.
// Some sozinho quando o módulo só tem uma tela (Pacientes, Estoque, Conversas).
// ============================================================================

export const ModuloTabs = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { contexto } = useTenant();
  const { isDemo } = useDemoMode();

  const isAdmin = isDemo || contexto?.role === "admin";
  const modulo = moduloDaRota(location.pathname);
  const ativa = abaDaRota(modulo, location.pathname);

  const abas = (modulo?.abas ?? []).filter((a) => !a.soAdmin || isAdmin);
  if (abas.length < 2) return null;

  return (
    <div className="shrink-0 bg-white border-b border-border">
      {/* rola no eixo X em telas estreitas — a página nunca rola na horizontal */}
      <nav className="flex gap-1 px-4 overflow-x-auto" aria-label={`Seções de ${modulo?.label}`}>
        {abas.map((a) => {
          const atual = ativa?.href === a.href;
          const emBreve = a.pronto === undefined;
          return (
            <button
              key={a.href}
              onClick={() => navigate(a.href)}
              aria-current={atual ? "page" : undefined}
              className={cn(
                "relative whitespace-nowrap px-3 py-3 text-sm transition-colors border-b-2 -mb-px",
                atual
                  ? "border-brand-600 text-brand-700 font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {a.label}
              {emBreve && (
                <span className="ml-1.5 text-[9px] leading-none px-1 py-[3px] rounded bg-muted text-muted-foreground/80 align-middle">
                  breve
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
