import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useDemoMode } from "@/hooks/useDemoMode";
import { carregarContexto } from "@/hooks/useTenant";
import { Loader2 } from "lucide-react";

// ============================================================================
// ProtectedRoute
// ----------------------------------------------------------------------------
// Antes NENHUMA rota era protegida: /crm, /financeiro, /pacientes e /agenda
// abriam sem login e disparavam as queries. Só o Dashboard checava sessão, por
// conta própria. Aqui a checagem é única e cobre o grupo autenticado.
//
// Também trata o caso do usuário autenticado SEM clínica (cadastro interrompido
// ou convite pendente): manda para o onboarding em vez de deixá-lo num app vazio
// sem entender por quê.
// ============================================================================

interface Props {
  children: ReactNode;
  /** Rota que exige papel de administrador (ex.: financeiro, permissões). */
  somenteAdmin?: boolean;
}

type Estado = "verificando" | "liberado" | "sem-sessao" | "sem-clinica" | "sem-permissao";

export const ProtectedRoute = ({ children, somenteAdmin }: Props) => {
  const { isDemo } = useDemoMode();
  const location = useLocation();
  const [estado, setEstado] = useState<Estado>("verificando");

  useEffect(() => {
    let vivo = true;

    // o modo demo é uma vitrine pública e não toca em dado real
    if (isDemo) { setEstado("liberado"); return; }

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!vivo) return;
      if (!session) { setEstado("sem-sessao"); return; }

      const ctx = await carregarContexto(true);
      if (!vivo) return;
      if (!ctx?.clinica_id) { setEstado("sem-clinica"); return; }
      if (somenteAdmin && ctx.role !== "admin") { setEstado("sem-permissao"); return; }
      setEstado("liberado");
    })();

    return () => { vivo = false; };
  }, [isDemo, somenteAdmin, location.pathname]);

  if (estado === "verificando") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (estado === "sem-sessao") {
    // guarda o destino para voltar depois do login
    return <Navigate to="/auth" replace state={{ de: location.pathname }} />;
  }
  if (estado === "sem-clinica") return <Navigate to="/configurar-clinica" replace />;
  if (estado === "sem-permissao") return <Navigate to="/agenda" replace />;

  return <>{children}</>;
};
