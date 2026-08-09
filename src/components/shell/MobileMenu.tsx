import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { MODULOS, MODULOS_RODAPE, moduloDaRota, type Modulo } from "@/config/navegacao";
import { useDemoMode } from "@/hooks/useDemoMode";
import { useTenant } from "@/hooks/useTenant";

// ============================================================================
// MobileMenu — a navegação da sidebar como drawer no celular
// ----------------------------------------------------------------------------
// A recepção mexe no sistema pelo celular; a sidebar fixa de 228px quebrava a
// tela. Aqui um hambúrguer (só < lg) abre os mesmos módulos num Sheet.
// ============================================================================

export function MobileMenu() {
  const [aberto, setAberto] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isDemo } = useDemoMode();
  const { contexto } = useTenant();

  const isAdmin = isDemo || contexto?.role === "admin";
  const atual = moduloDaRota(location.pathname);
  const visivel = (m: Modulo) => !m.soAdmin || isAdmin;

  const ir = (href: string) => { navigate(href); setAberto(false); };

  const Item = ({ m }: { m: Modulo }) => {
    const ativo = atual?.label === m.label;
    const emBreve = m.pronto === undefined;
    return (
      <button
        onClick={() => ir(m.href)}
        aria-current={ativo ? "page" : undefined}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-colors",
          ativo ? "bg-brand-50 text-brand-700 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <m.icon className="h-5 w-5 shrink-0" />
        <span className="flex-1 text-left truncate">{m.label}</span>
        {m.badge && (
          <span className="text-[9px] leading-none px-1 py-[3px] rounded bg-brand-100 text-brand-700 font-medium shrink-0">
            {m.badge}
          </span>
        )}
        {emBreve && (
          <span className="text-[9px] leading-none px-1 py-[3px] rounded bg-muted text-muted-foreground/80 shrink-0">
            breve
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        aria-label="Abrir menu"
        className="lg:hidden rounded-md p-1.5 hover:bg-white/10 transition-colors"
      >
        <Menu className="h-5 w-5" />
      </button>

      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent side="left" className="w-72 p-0">
          <nav className="flex h-full flex-col gap-0.5 overflow-y-auto p-3">
            <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Menu
            </p>
            {MODULOS.filter(visivel).map((m) => <Item key={m.label} m={m} />)}
            <div className="my-2 border-t border-border" />
            {MODULOS_RODAPE.filter(visivel).map((m) => <Item key={m.label} m={m} />)}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
