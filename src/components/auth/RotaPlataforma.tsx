import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { carregarContexto } from "@/hooks/useTenant";
import { Loader2 } from "lucide-react";

// ============================================================================
// RotaPlataforma — porta do painel do SaaS
// ----------------------------------------------------------------------------
// Guard próprio, e não `ProtectedRoute somenteAdmin`: "admin" ali quer dizer
// dono da CLÍNICA (todo cliente tem um). Quem entra aqui é o time Sorrimax,
// definido em plataforma_membros e conferido no banco por is_plataforma().
//
// Este componente é conveniência de navegação, não a tranca. A tranca são as
// próprias RPCs: toda uma delas começa por plataforma_exigir(), que levanta
// exceção para quem não é do time. Burlar a tela não dá acesso a nada.
// ============================================================================

type Estado = "verificando" | "liberado" | "sem-sessao" | "sem-acesso";

export const RotaPlataforma = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const [estado, setEstado] = useState<Estado>("verificando");

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!vivo) return;
      if (!session) { setEstado("sem-sessao"); return; }

      const ctx = await carregarContexto(true);
      if (!vivo) return;
      setEstado(ctx?.plataforma ? "liberado" : "sem-acesso");
    })();
    return () => { vivo = false; };
  }, [location.pathname]);

  if (estado === "verificando") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (estado === "sem-sessao") {
    return <Navigate to="/auth" replace state={{ de: location.pathname }} />;
  }
  // quem não é do time volta para o próprio sistema, sem tela de erro: para
  // ele esta rota simplesmente não existe.
  if (estado === "sem-acesso") return <Navigate to="/agenda" replace />;

  return <>{children}</>;
};
