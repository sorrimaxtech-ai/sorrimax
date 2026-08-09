import { Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { ModuloTabs } from "./ModuloTabs";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { FloatingChat } from "@/components/chat/FloatingChat";

// ============================================================================
// AppShell — moldura única do app autenticado
// ----------------------------------------------------------------------------
// Antes cada uma das 33 páginas montava a própria moldura (`min-h-screen flex`
// + `<Sidebar />` + `<main>`). Consequência: barra superior e abas de módulo
// eram impossíveis de adicionar sem editar as 33, e qualquer divergência de
// classe entre páginas virava inconsistência visível.
//
// Navegação sem "recarregar branco": o <Suspense> das rotas lazy vive AQUI,
// em volta do <Outlet> — só a ÁREA DE CONTEÚDO suspende ao trocar de página; o
// trilho e as abas ficam parados. Um <PreloadRotas> aquece os chunks quentes no
// tempo ocioso, então a troca normalmente nem mostra o loader — só um fade.
// ============================================================================

/** Loader discreto dentro do painel (não ocupa a tela toda). */
const CarregandoConteudo = () => (
  <div className="flex h-full items-center justify-center py-16">
    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
  </div>
);

/** Aquece no ocioso os chunks das telas mais usadas — mata o flash da 1ª visita. */
function PreloadRotas() {
  useEffect(() => {
    const preload = () => {
      void import("@/pages/Agenda");
      void import("@/pages/Consultas");
      void import("@/pages/HorariosAtendimento");
      void import("@/pages/Cadeiras");
      void import("@/pages/Pacientes");
      void import("@/pages/PacienteFicha");
      void import("@/pages/Dashboard");
      void import("@/pages/Relatorios");
      void import("@/pages/Orcamentos");
      void import("@/pages/Conversas");
      void import("@/pages/FluxoCaixa");
    };
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(preload);
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(preload, 1200);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}

export const AppShell = () => {
  const { pathname } = useLocation();
  return (
    // "Mesa" cinza. O trilho flutua à esquerda; o conteúdo é um PAINEL flutuante
    // (margem + cantos + borda sutil) — dá respiro e cria a divisão que faltava,
    // em vez de tudo colado na parede.
    <div className="dashboard-theme h-screen flex bg-muted overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-w-0 my-2 mr-2 flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-sm">
        <ModuloTabs />
        <div className="flex-1 min-h-0 min-w-0 overflow-auto">
          <Suspense fallback={<CarregandoConteudo />}>
            {/* key por rota: cada troca remonta e entra com um fade rápido.
                Chunk em cache = sem loader, só o fade.
                h-full (NÃO min-h-full): páginas como Conversas usam `h-full` e
                dependem de altura DEFINIDA no pai; min-h-full colapsava e sobrava
                mesa cinza embaixo. h-full mantém a cadeia de altura; conteúdo
                mais alto ainda rola pelo overflow-auto do container acima. */}
            <div key={pathname} className="h-full animate-in fade-in duration-150">
              <Outlet />
            </div>
          </Suspense>
        </div>
      </main>
      {/* Chat que acompanha todas as telas (some em /conversas) */}
      <FloatingChat />
      <PreloadRotas />
    </div>
  );
};
