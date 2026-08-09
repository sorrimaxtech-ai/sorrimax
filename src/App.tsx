import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppShell } from "@/components/shell/AppShell";

// públicas
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import DemoLoader from "./pages/DemoLoader";
import CadastroClinica from "./pages/CadastroClinica";
import ConfigurarClinica from "./pages/ConfigurarClinica";
import Feedback from "./pages/Feedback";
import OnboardingPreview from "./pages/OnboardingPreview";
import NotFound from "./pages/NotFound";
import EmConstrucao from "./pages/EmConstrucao";

// inteligência
import Dashboard from "./pages/Dashboard";
import Relatorios from "./pages/Relatorios";
import RelatorioProfissional from "./pages/RelatorioProfissional";

// pacientes
import Pacientes from "./pages/Pacientes";
import PacienteFicha from "./pages/PacienteFicha";
import AnamneseModelos from "./pages/AnamneseModelos";
import AnamneseEditor from "./pages/AnamneseEditor";
import AnamnesePreencher from "./pages/AnamnesePreencher";
import Documentos from "./pages/Documentos";
import DocumentoEditor from "./pages/DocumentoEditor";

// agenda
import Agenda from "./pages/Agenda";
import Consultas from "./pages/Consultas";
import HorariosAtendimento from "./pages/HorariosAtendimento";
import Cadeiras from "./pages/Cadeiras";

// vendas
import Orcamentos from "./pages/Orcamentos";
import OrcamentoEditor from "./pages/OrcamentoEditor";
import CRM from "./pages/CRM";

// conversas
import Conversas from "./pages/Conversas";

// financeiro
import FluxoCaixa from "./pages/FluxoCaixa";
import FinanceiroReceber from "./pages/FinanceiroReceber";
import FinanceiroPagar from "./pages/FinanceiroPagar";
import Comissoes from "./pages/Comissoes";

// operação
import Estoque from "./pages/Estoque";
import Protese from "./pages/Protese";
import PaginaPublica from "./pages/PaginaPublica";

// ajustes
import Profissionais from "./pages/Profissionais";
import Procedimentos from "./pages/Procedimentos";
import Especialidades from "./pages/Especialidades";
import RotulosAgenda from "./pages/RotulosAgenda";
import Permissoes from "./pages/Permissoes";
import Integracoes from "./pages/Integracoes";
import Anotacoes from "./pages/Anotacoes";

const queryClient = new QueryClient();

/** Guarda de administrador dentro do shell (o shell já garantiu sessão). */
const Adm = ({ e }: { e: React.ReactNode }) => (
  <ProtectedRoute somenteAdmin>{e}</ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* ---------------- públicas (sem moldura) ---------------- */}
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/demo" element={<DemoLoader />} />
          <Route path="/cadastro" element={<CadastroClinica />} />
          <Route path="/configurar-clinica" element={<ConfigurarClinica />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/onboarding-preview" element={<OnboardingPreview />} />

          {/* ---------------- app autenticado ----------------
              A sessão é verificada UMA vez, no layout. As páginas filhas
              entram pelo <Outlet /> do AppShell já dentro da moldura. */}
          <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            {/* inteligência */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/relatorios" element={<Relatorios />} />
            <Route path="/relatorios/profissional" element={<RelatorioProfissional />} />

            {/* pacientes */}
            <Route path="/pacientes" element={<Pacientes />} />
            <Route path="/pacientes/:id" element={<PacienteFicha />} />
            <Route path="/anamnese" element={<AnamneseModelos />} />
            <Route path="/anamnese/modelos" element={<AnamneseModelos />} />
            <Route path="/anamnese/modelos/:id" element={<AnamneseEditor />} />
            <Route path="/anamnese/preencher/:pacienteId" element={<AnamnesePreencher />} />
            <Route path="/documentos" element={<Documentos />} />
            <Route path="/documentos/:id" element={<DocumentoEditor />} />

            {/* agenda */}
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/consultas" element={<Consultas />} />
            <Route path="/horarios" element={<HorariosAtendimento />} />
            <Route path="/cadeiras" element={<Cadeiras />} />

            {/* vendas */}
            <Route path="/orcamentos" element={<Orcamentos />} />
            <Route path="/orcamentos/:id" element={<OrcamentoEditor />} />
            <Route path="/crm" element={<CRM />} />

            {/* conversas */}
            <Route path="/conversas" element={<Conversas />} />

            {/* financeiro (admin) */}
            <Route path="/financeiro" element={<Adm e={<FluxoCaixa />} />} />
            <Route path="/financeiro/receber" element={<Adm e={<FinanceiroReceber />} />} />
            <Route path="/financeiro/pagar" element={<Adm e={<FinanceiroPagar />} />} />
            <Route path="/financeiro/comissoes" element={<Adm e={<Comissoes />} />} />

            {/* operação */}
            <Route path="/estoque" element={<Estoque />} />
            <Route path="/protese" element={<Protese />} />
            <Route path="/pagina-publica" element={<Adm e={<PaginaPublica />} />} />

            {/* ajustes */}
            <Route path="/configuracoes" element={<Adm e={<ConfigurarClinica />} />} />
            <Route path="/profissionais" element={<Profissionais />} />
            <Route path="/procedimentos" element={<Procedimentos />} />
            <Route path="/especialidades" element={<Especialidades />} />
            <Route path="/rotulos" element={<RotulosAgenda />} />
            <Route path="/permissoes" element={<Adm e={<Permissoes />} />} />
            <Route path="/integracoes" element={<Adm e={<Integracoes />} />} />
            <Route path="/anotacoes" element={<Anotacoes />} />

            {/* ainda sem interface própria */}
            <Route path="/loja" element={<EmConstrucao />} />
            <Route path="/suporte" element={<EmConstrucao />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
