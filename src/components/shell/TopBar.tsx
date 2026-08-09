import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useDemoMode } from "@/hooks/useDemoMode";
import { useTenant } from "@/hooks/useTenant";
import { moduloDaRota, abaDaRota } from "@/config/navegacao";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronRight, LogOut, Settings, User, MessageSquare, X, Stethoscope,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ============================================================================
// TopBar — barra de identidade + localização
// ----------------------------------------------------------------------------
// O app não tinha barra superior: o usuário não sabia em que módulo estava nem
// tinha acesso rápido à própria conta sem varrer a lateral. Aqui ficam as três
// coisas que precisam estar sempre visíveis: onde estou (trilha), quem sou
// (conta) e o atalho para o canal do paciente (conversas).
// ============================================================================

export const TopBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { isDemo, disableDemoMode } = useDemoMode();
  const { contexto } = useTenant();

  const modulo = moduloDaRota(location.pathname);
  const aba = abaDaRota(modulo, location.pathname);

  const sair = async () => {
    if (isDemo) { disableDemoMode(); return; }
    await supabase.auth.signOut();
    toast({ title: "Até logo!", description: "Você saiu da sua conta." });
    navigate("/");
  };

  const nome = contexto?.nome ?? contexto?.email ?? "";
  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

  return (
    <header className="h-14 shrink-0 bg-brand-600 text-white flex items-center gap-3 px-4">
      <button
        onClick={() => navigate("/dashboard")}
        className="flex items-center gap-2 shrink-0 rounded-md px-1 py-1 hover:bg-white/10 transition-colors"
      >
        <Stethoscope className="h-5 w-5" />
        <span className="font-display text-lg font-bold tracking-tight">SORRIMAX</span>
      </button>

      {/* Trilha: módulo › aba. Some no mobile para não competir com o logo. */}
      {modulo && (
        <nav aria-label="Trilha de navegação" className="hidden md:flex items-center gap-1 min-w-0 text-sm">
          <ChevronRight className="h-4 w-4 text-white/50 shrink-0" />
          <span className="text-white/90 truncate">{modulo.label}</span>
          {aba && aba.label !== modulo.label && (
            <>
              <ChevronRight className="h-4 w-4 text-white/50 shrink-0" />
              <span className="font-medium truncate">{aba.label}</span>
            </>
          )}
        </nav>
      )}

      <div className="flex-1" />

      {isDemo && (
        <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-1 rounded">
          Modo demo
        </span>
      )}

      <button
        onClick={() => navigate("/conversas")}
        title="Conversas do WhatsApp"
        aria-label="Conversas do WhatsApp"
        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
      >
        <MessageSquare className="h-[18px] w-[18px]" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-white/10 transition-colors">
          <span className="h-7 w-7 rounded-full bg-white/20 text-xs font-semibold flex items-center justify-center">
            {iniciais}
          </span>
          <span className="hidden sm:block text-sm max-w-[140px] truncate">{nome || "Minha conta"}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium truncate">{nome || "Sem nome"}</p>
            <p className="text-xs text-muted-foreground truncate">
              {contexto?.clinica_nome ?? "Sem clínica"}
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate("/profissionais")}>
            <User className="h-4 w-4 mr-2" /> Equipe
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/configuracoes")}>
            <Settings className="h-4 w-4 mr-2" /> Ajustes da clínica
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={sair} className="text-destructive focus:text-destructive">
            {isDemo ? <X className="h-4 w-4 mr-2" /> : <LogOut className="h-4 w-4 mr-2" />}
            {isDemo ? "Sair da demo" : "Sair"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
};
