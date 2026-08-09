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
// Sidebar — trilho de ícones no estilo Diamond CRM, com EXPAND ON HOVER
// ----------------------------------------------------------------------------
// Fininho (só ícones) por padrão; ao aproximar o mouse, cresce e revela os
// rótulos — SOBREPONDO o conteúdo (não empurra, pra nada reflowar). Azul
// gradiente, flutuante. Logo no topo, conta do usuário no rodapé (menu que
// migrou da antiga TopBar).
// ============================================================================

const LARGURA_FECHADA = 76;   // px — só ícone
const LARGURA_ABERTA = 236;   // px — ícone + rótulo

export const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDemo, disableDemoMode } = useDemoMode();
  const { contexto } = useTenant();
  const { toast } = useToast();

  const isAdmin = isDemo || contexto?.role === "admin";
  const atual = moduloDaRota(location.pathname);
  const visivel = (m: Modulo) => !m.soAdmin || isAdmin;

  const sair = async () => {
    if (isDemo) { disableDemoMode(); return; }
    await supabase.auth.signOut();
    toast({ title: "Até logo!", description: "Você saiu da sua conta." });
    navigate("/");
  };

  const nome = contexto?.nome ?? contexto?.email ?? "";
  const iniciais = nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

  // rótulo revela no hover do trilho (group). Ícone num slot fixo (não pula).
  const Rotulo = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={cn(
      "min-w-0 flex-1 truncate whitespace-nowrap text-left text-sm opacity-0 transition-opacity duration-150 group-hover:opacity-100",
      className,
    )}>
      {children}
    </span>
  );

  const Item = ({ m }: { m: Modulo }) => {
    const ativo = atual?.label === m.label;
    const emBreve = m.pronto === undefined;
    return (
      <button
        onClick={() => navigate(m.href)}
        aria-current={ativo ? "page" : undefined}
        aria-label={m.label}
        className={cn(
          "relative flex h-11 w-full items-center gap-2 rounded-xl px-3 transition-colors",
          ativo ? "bg-white font-medium text-brand-700 shadow-sm" : "text-white/85 hover:bg-white/15 hover:text-white",
          emBreve && "opacity-60",
        )}
      >
        <span className="grid w-7 shrink-0 place-items-center">
          <m.icon className="h-[22px] w-[22px]" />
          {m.badge && <span className="absolute left-[30px] top-2 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[#1B7FD4] group-hover:hidden" />}
        </span>
        <Rotulo>{m.label}</Rotulo>
        {m.badge && <span className="hidden rounded bg-emerald-400/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-50 opacity-0 transition-opacity group-hover:inline group-hover:opacity-100">{m.badge}</span>}
        {emBreve && <span className="hidden whitespace-nowrap text-[9px] uppercase text-white/60 opacity-0 transition-opacity group-hover:inline group-hover:opacity-100">breve</span>}
      </button>
    );
  };

  return (
    // reserva a largura fechada + folga no layout; o trilho FLUTUA e cresce por cima
    <aside className="relative shrink-0" style={{ width: LARGURA_FECHADA + 20 }}>
      <div
        className="group absolute inset-y-2 left-2 z-40 flex flex-col overflow-hidden rounded-[22px]
                   bg-gradient-to-b from-[#2AA0E8] via-[#1B7FD4] to-[#1466C4] px-2.5 py-4 shadow-lg
                   transition-[width] duration-200 ease-out hover:shadow-xl"
        style={{ width: LARGURA_FECHADA }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.width = `${LARGURA_ABERTA}px`; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.width = `${LARGURA_FECHADA}px`; }}
      >
        {/* logo → dashboard */}
        <button
          onClick={() => navigate("/dashboard")}
          aria-label="Início"
          className="mb-3 flex h-10 w-full items-center gap-2 rounded-xl px-3 transition-colors hover:bg-white/10"
        >
          <span className="grid w-7 shrink-0 place-items-center">
            <img src={iconWhite} alt="Sorrimax" className="h-7 w-7" draggable={false} />
          </span>
          <Rotulo className="text-lg font-extrabold tracking-tight text-white">SORRIMAX</Rotulo>
        </button>

        {/* navegação */}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {MODULOS.filter(visivel).map((m) => <Item key={m.label} m={m} />)}
          <div className="my-1 h-px w-full bg-white/20" />
          {MODULOS_RODAPE.filter(visivel).map((m) => <Item key={m.label} m={m} />)}
        </nav>

        {/* conta do usuário → menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Minha conta"
            className="mt-2 flex h-11 w-full items-center gap-2 rounded-xl px-2 text-white transition hover:bg-white/15"
          >
            <span className="grid w-7 shrink-0 place-items-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-xs font-semibold ring-2 ring-white/30">
                {iniciais}
              </span>
            </span>
            <span className="min-w-0 flex-1 truncate whitespace-nowrap text-left text-sm opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              {nome || "Minha conta"}
            </span>
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
