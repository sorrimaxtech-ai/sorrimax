import { Outlet } from "react-router-dom";
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
// Aqui a moldura é uma só e as páginas voltam a ser só conteúdo.
// A altura é travada em `h-screen` e a rolagem acontece SÓ na área de conteúdo:
// barra superior e abas ficam fixas, como em software de agenda de verdade.
// ============================================================================

// O tema fica aqui, na moldura, e não página a página: assim o app inteiro herda
// o fundo cinza com card branco por cima (a "mesa" que faz o card se destacar),
// em vez de cada página escolher o próprio cinza.

export const AppShell = () => (
  // "Mesa" cinza. O trilho flutua à esquerda; o conteúdo é um PAINEL flutuante
  // (margem + cantos + borda sutil) — dá respiro e cria a divisão que faltava,
  // em vez de tudo colado na parede.
  <div className="dashboard-theme h-screen flex bg-muted overflow-hidden">
    <Sidebar />
    <main className="flex-1 min-w-0 my-2 mr-2 flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-sm">
      <ModuloTabs />
      <div className="flex-1 min-w-0 overflow-auto">
        <Outlet />
      </div>
    </main>
    {/* Chat que acompanha todas as telas (some em /conversas) */}
    <FloatingChat />
  </div>
);
