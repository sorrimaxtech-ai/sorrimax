import { Outlet } from "react-router-dom";
import { TopBar } from "./TopBar";
import { ModuloTabs } from "./ModuloTabs";
import { Sidebar } from "@/components/dashboard/Sidebar";

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
  <div className="dashboard-theme h-screen flex flex-col bg-background overflow-hidden">
    <TopBar />
    <div className="flex-1 flex min-h-0">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <ModuloTabs />
        <div className="flex-1 min-w-0 overflow-auto">
          <Outlet />
        </div>
      </div>
    </div>
  </div>
);
