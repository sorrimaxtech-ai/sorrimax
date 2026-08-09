import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
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
const DemoLoader = lazy(() => import("./pages/DemoLoader"));
const CadastroClinica = lazy(() => import("./pages/CadastroClinica"));
const ConfigurarClinica = lazy(() => import("./pages/ConfigurarClinica"));
const OnboardingClinica = lazy(() => import("./pages/OnboardingClinica"));
const Feedback = lazy(() => import("./pages/Feedback"));
const OnboardingPreview = lazy(() => import("./pages/OnboardingPreview"));
const RedefinirSenha = lazy(() => import("./pages/RedefinirSenha"));
const AgendamentoPublico = lazy(() => import("./pages/AgendamentoPublico"));
const Assinatura = lazy(() => import("./pages/Assinatura"));
const Atividades = lazy(() => import("./pages/Atividades"));
const AgendaPreview = lazy(() => import("./pages/AgendaPreview"));
const SiriTest = lazy(() => import("./pages/SiriTest"));
import NotFound from "./pages/NotFound";
const EmConstrucao = lazy(() => import("./pages/EmConstrucao"));

// inteligência
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const RelatorioProfissional = lazy(() => import("./pages/RelatorioProfissional"));

// pacientes
const Pacientes = lazy(() => import("./pages/Pacientes"));
const PacienteFicha = lazy(() => import("./pages/PacienteFicha"));
const AnamneseModelos = lazy(() => import("./pages/AnamneseModelos"));
const AnamneseEditor = lazy(() => import("./pages/AnamneseEditor"));
const AnamnesePreencher = lazy(() => import("./pages/AnamnesePreencher"));
const Documentos = lazy(() => import("./pages/Documentos"));
const DocumentoEditor = lazy(() => import("./pages/DocumentoEditor"));

// agenda
const Agenda = lazy(() => import("./pages/Agenda"));
const Consultas = lazy(() => import("./pages/Consultas"));
const HorariosAtendimento = lazy(() => import("./pages/HorariosAtendimento"));
const Cadeiras = lazy(() => import("./pages/Cadeiras"));

// vendas
const Orcamentos = lazy(() => import("./pages/Orcamentos"));
const OrcamentoEditor = lazy(() => import("./pages/OrcamentoEditor"));
const CRM = lazy(() => import("./pages/CRM"));

// conversas
const Conversas = lazy(() => import("./pages/Conversas"));

// financeiro
const FluxoCaixa = lazy(() => import("./pages/FluxoCaixa"));
const FinanceiroReceber = lazy(() => import("./pages/FinanceiroReceber"));
const FinanceiroPagar = lazy(() => import("./pages/FinanceiroPagar"));
const Comissoes = lazy(() => import("./pages/Comissoes"));

// operação
const Estoque = lazy(() => import("./pages/Estoque"));
const Protese = lazy(() => import("./pages/Protese"));
const PaginaPublica = lazy(() => import("./pages/PaginaPublica"));
const Marketing = lazy(() => import("./pages/Marketing"));

// ajustes
const Profissionais = lazy(() => import("./pages/Profissionais"));
const Procedimentos = lazy(() => import("./pages/Procedimentos"));
const Especialidades = lazy(() => import("./pages/Especialidades"));
const RotulosAgenda = lazy(() => import("./pages/RotulosAgenda"));
const Permissoes = lazy(() => import("./pages/Permissoes"));
const Integracoes = lazy(() => import("./pages/Integracoes"));
const Anotacoes = lazy(() => import("./pages/Anotacoes"));

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
        <Suspense fallback={
          <div className="flex h-screen items-center justify-center bg-background">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }>
        <Routes>
          {/* ---------------- públicas (sem moldura) ---------------- */}
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />
          <Route path="/c/:slug" element={<AgendamentoPublico />} />
          <Route path="/demo" element={<DemoLoader />} />
          <Route path="/cadastro" element={<CadastroClinica />} />
          <Route path="/configurar-clinica" element={<OnboardingClinica />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/onboarding-preview" element={<OnboardingPreview />} />
          <Route path="/siri-test" element={<SiriTest />} />
          <Route path="/agenda-preview" element={<AgendaPreview />} />

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
            <Route path="/marketing" element={<Adm e={<Marketing />} />} />
            <Route path="/pagina-publica" element={<Adm e={<PaginaPublica />} />} />

            {/* ajustes */}
            <Route path="/configuracoes" element={<Adm e={<ConfigurarClinica />} />} />
            <Route path="/profissionais" element={<Profissionais />} />
            <Route path="/procedimentos" element={<Procedimentos />} />
            <Route path="/especialidades" element={<Especialidades />} />
            <Route path="/rotulos" element={<RotulosAgenda />} />
            <Route path="/permissoes" element={<Adm e={<Permissoes />} />} />
            <Route path="/integracoes" element={<Adm e={<Integracoes />} />} />
            <Route path="/assinatura" element={<Adm e={<Assinatura />} />} />
            <Route path="/atividades" element={<Adm e={<Atividades />} />} />
            <Route path="/anotacoes" element={<Anotacoes />} />

            {/* ainda sem interface própria */}
            <Route path="/loja" element={<EmConstrucao />} />
            <Route path="/suporte" element={<EmConstrucao />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
