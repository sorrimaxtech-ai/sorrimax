import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useDemoMode } from "@/hooks/useDemoMode";
import { cn } from "@/lib/utils";
import { MODULOS, MODULOS_RODAPE, moduloDaRota, type Modulo } from "@/config/navegacao";
import { useTenant } from "@/hooks/useTenant";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Settings, User, X } from "lucide-react";
import iconWhite from "@/assets/brand/sorrimax-icon-white.png";
import { useToast } from "@/hooks/use-toast";

// ============================================================================
// Sidebar — trilho de ícones no estilo Diamond CRM
// ----------------------------------------------------------------------------
// Trilho estreito, azul (gradiente), flutuante. Só ícones, com tooltip no hover.
// Substituiu a barra superior: identidade (logo) no topo, navegação no meio,
// conta do usuário (avatar → menu) no rodapé. Tudo que era da TopBar mora aqui.
// ============================================================================

export const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDemo, disableDemoMode } = useDemoMode();
  const { contexto } = useTenant();

  const isAdmin = isDemo || contexto?.role === "admin";
  const atual = moduloDaRota(location.pathname);
  const visivel = (m: Modulo) => !m.soAdmin || isAdmin;

  const sair = async () => {
    if (isDemo) { disableDemoMode(); return; }
    await supabase.auth.signOut();
    toast({ title: "Até logo!", description: "Você saiu da sua conta." });
    navigate("/");
  };
  const { toast } = useToast();

  const nome = contexto?.nome ?? contexto?.email ?? "";
  const iniciais = nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

  const Item = ({ m }: { m: Modulo }) => {
    const ativo = atual?.label === m.label;
    const emBreve = m.pronto === undefined;
    return (
      <button
        onClick={() => navigate(m.href)}
        aria-current={ativo ? "page" : undefined}
        aria-label={m.label}
        className={cn(
          "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
          ativo ? "bg-white text-brand-700 shadow-sm" : "text-white/80 hover:bg-white/15 hover:text-white",
          emBreve && "opacity-60",
        )}
      >
        <m.icon className="h-[20px] w-[20px] shrink-0" />
        {/* badge (WhatsApp) → pontinho */}
        {m.badge && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[#1B7FD4]" />}
        {/* tooltip no hover, à direita */}
        <span className="pointer-events-none absolute left-full ml-3 z-50 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5
                         text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
          {m.label}{emBreve && " · em breve"}
        </span>
      </button>
    );
  };

  return (
    <aside className="flex shrink-0 py-2 pl-2">
      <div className="flex h-full w-[68px] flex-col items-center rounded-[22px] bg-gradient-to-b from-[#2AA0E8] via-[#1B7FD4] to-[#1466C4] py-4 shadow-lg">
        {/* logo → dashboard */}
        <button onClick={() => navigate("/dashboard")} aria-label="Início" className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10 transition-colors">
          <img src={iconWhite} alt="Sorrimax" className="h-7 w-7" draggable={false} />
        </button>

        {/* navegação (rola se não couber) */}
        <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {MODULOS.filter(visivel).map((m) => <Item key={m.label} m={m} />)}
          <div className="my-1 h-px w-7 bg-white/20" />
          {MODULOS_RODAPE.filter(visivel).map((m) => <Item key={m.label} m={m} />)}
        </nav>

        {/* conta do usuário → menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Minha conta"
            className="mt-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white ring-2 ring-white/30 transition hover:bg-white/30"
          >
            {iniciais}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-medium">{nome || "Sem nome"}</p>
              <p className="truncate text-xs text-muted-foreground">{contexto?.clinica_nome ?? "Sem clínica"}</p>
              {isDemo && <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-brand-600">Modo demo</p>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/profissionais")}>
              <User className="mr-2 h-4 w-4" /> Equipe
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/configuracoes")}>
              <Settings className="mr-2 h-4 w-4" /> Ajustes da clínica
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={sair} className="text-destructive focus:text-destructive">
              {isDemo ? <X className="mr-2 h-4 w-4" /> : <LogOut className="mr-2 h-4 w-4" />}
              {isDemo ? "Sair da demo" : "Sair"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
};
