import { 
  Calendar, 
  MessageCircle, 
  Users, 
  Bot, 
  CreditCard, 
  Clock,
  CheckCircle,
  ArrowRight,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useDemoMode } from "@/hooks/useDemoMode";
import heroDashboard from "@/assets/hero-dashboard.png";

const Header = () => {
  return (
    <header className="fixed top-6 left-0 right-0 z-50 flex justify-center pointer-events-none">
      <div className="bg-white/80 backdrop-blur-md border border-white/20 shadow-sm rounded-full px-4 py-2 flex items-center gap-2 pointer-events-auto">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Sparkles className="h-3 w-3" />
        </div>
        <span className="font-display text-sm font-bold tracking-tight text-foreground">VITTALHUB</span>
        <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse ml-1" />
      </div>
    </header>
  );
};

const HeroSection = () => {
  const navigate = useNavigate();
  const { enableDemoMode } = useDemoMode();
  
  return (
    <section className="relative min-h-screen bg-gradient-hero pt-16 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-glow pointer-events-none" />
      <div className="container relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] py-20">
        <div className="animate-fade-up text-center max-w-4xl mx-auto" style={{ animationFillMode: 'forwards' }}>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm text-primary font-medium mb-8">
            <Sparkles className="h-4 w-4" />
            <span>Gestão médica 10x mais inteligente</span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-8 text-slate-900 leading-[1.1]">
            VITTALHUB: gestão médica inteligente a partir de <span className="text-primary">R$ 97/mês</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Substitua planilhas, agenda de papel e sistemas complexos por uma plataforma simples, bonita e eficiente.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button variant="default" size="xl" className="font-semibold text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300" onClick={() => navigate("/auth")}>
              Começar Agora
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
            <Button variant="outline" size="xl" className="bg-white hover:bg-slate-50 border-slate-200" onClick={() => navigate("/demo")}>
              Ver Demonstração
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-6 flex items-center justify-center gap-2">
            <CheckCircle className="h-4 w-4 text-primary" /> Teste grátis por 7 dias sem compromisso
          </p>
        </div>
        <div className="animate-fade-up mt-16 w-full max-w-5xl" style={{ animationDelay: '300ms', animationFillMode: 'forwards' }}>
          <div className="relative rounded-2xl shadow-elevated overflow-hidden border border-border/50">
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent z-10 pointer-events-none" />
            <img 
              src={heroDashboard} 
              alt="Dashboard VITTALHUB" 
              className="w-full h-auto"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

const problems = [
  {
    icon: Clock,
    title: "Tempo perdido",
    description: "WhatsApp, planilhas e sistemas que não conversam entre si roubam horas do seu dia."
  },
  {
    icon: Calendar,
    title: "Agenda confusa",
    description: "Pacientes que somem sem aviso e encaixes que viram um caos administrativo."
  },
  {
    icon: Users,
    title: "Falta de acompanhamento",
    description: "Pacientes entram e saem sem um fluxo organizado de atendimento."
  }
];

const ProblemsSection = () => (
  <section id="problemas" className="py-24 bg-background">
    <div className="container">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
          O que mais atrapalha o dia a dia?
        </h2>
        <p className="text-muted-foreground text-lg">
          Custos administrativos altos com tarefas que poderiam ser automatizadas
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-8">
        {problems.map((problem, index) => (
          <div 
            key={problem.title}
            className="animate-fade-up group relative p-8 rounded-2xl bg-card shadow-card border border-border/50 hover:shadow-elevated transition-all duration-300"
            style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'forwards' }}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-destructive/10 text-destructive mb-6 group-hover:scale-110 transition-transform">
              <problem.icon className="h-7 w-7" />
            </div>
            <h3 className="font-display text-xl font-semibold mb-3">{problem.title}</h3>
            <p className="text-muted-foreground">{problem.description}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const solutions = [
  {
    icon: Users,
    title: "CRM médico integrado",
    description: "Histórico completo de pacientes, pipeline de atendimento e documentos organizados em um só lugar.",
    color: "bg-primary/10 text-primary"
  },
  {
    icon: Calendar,
    title: "Agenda inteligente",
    description: "Múltiplos profissionais, tipos de consulta, cores personalizadas, preparações e lembretes automáticos.",
    color: "bg-accent text-accent-foreground"
  },
  {
    icon: Bot,
    title: "Assistente de IA personalizável",
    description: "Agenda, reagenda, responde dúvidas e sabe a hora de passar para você ou sua secretária.",
    color: "bg-primary/10 text-primary"
  },
  {
    icon: MessageCircle,
    title: "WhatsApp conectado",
    description: "Comunicação direta com pacientes sem perder o histórico de conversas.",
    color: "bg-accent text-accent-foreground"
  },
  {
    icon: CreditCard,
    title: "Gestão financeira",
    description: "Formas de pagamento, convênios, descontos e parcelamentos configuráveis.",
    color: "bg-primary/10 text-primary"
  },
  {
    icon: CheckCircle,
    title: "Tudo integrado",
    description: "Um sistema único que conecta todos os pontos da jornada do paciente.",
    color: "bg-accent text-accent-foreground"
  }
];

const PricingSection = () => (
  <section className="py-24 bg-slate-50">
    <div className="container">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
          Planos simples e transparentes
        </h2>
        <p className="text-muted-foreground text-lg">
          Escolha o plano ideal para o tamanho da sua clínica
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {[
          {
            name: "Essencial",
            price: "R$ 97",
            period: "/mês",
            description: "Para profissionais liberais que querem organização.",
            features: ["Agenda Inteligente", "Prontuário Eletrônico", "Lembretes via WhatsApp", "Gestão Financeira Básica"]
          },
          {
            name: "Profissional",
            price: "R$ 197",
            period: "/mês",
            popular: true,
            description: "Para clínicas em crescimento que precisam de mais recursos.",
            features: ["Tudo do Essencial", "Confirmação Automática", "Disparo de Mensagens em Massa", "Múltiplos Profissionais", "Relatórios Avançados"]
          },
          {
            name: "VITTALHUB AI",
            price: "R$ 297",
            period: "/mês",
            description: "Automação total com nossa Inteligência Artificial.",
            features: ["Tudo do Profissional", "Assistente de IA 24/7", "Reagendamento Automático", "Análise Preditiva de Faltas", "Suporte Prioritário"]
          }
        ].map((plan, index) => (
          <div 
            key={plan.name}
            className={`relative p-8 rounded-2xl bg-white border ${plan.popular ? 'border-primary ring-2 ring-primary/20 shadow-xl' : 'border-slate-200 shadow-sm'} flex flex-col`}
          >
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                Mais Popular
              </div>
            )}
            <h3 className="font-display text-xl font-bold mb-2">{plan.name}</h3>
            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-4xl font-bold">{plan.price}</span>
              <span className="text-muted-foreground">{plan.period}</span>
            </div>
            <p className="text-muted-foreground text-sm mb-8">{plan.description}</p>
            <ul className="space-y-3 mb-8 flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-5 w-5 text-primary shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Button className={`w-full ${plan.popular ? '' : 'bg-slate-100 text-slate-900 hover:bg-slate-200'}`} variant={plan.popular ? 'default' : 'ghost'}>
              Começar Agora
            </Button>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const FAQSection = () => (
  <section className="py-24 bg-white">
    <div className="container max-w-3xl">
      <div className="text-center mb-16">
        <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
          Perguntas Frequentes
        </h2>
      </div>
      <div className="space-y-4">
        {[
          {
            q: "Preciso instalar algum programa?",
            a: "Não! O VITTALHUB é 100% online. Você pode acessar de qualquer lugar, pelo computador, tablet ou celular."
          },
          {
            q: "Como funciona o teste grátis?",
            a: "Você tem 7 dias para usar todas as funcionalidades do sistema sem custo algum. Não pedimos cartão de crédito para começar."
          },
          {
            q: "É difícil migrar meus dados?",
            a: "Temos ferramentas de importação simples para trazer seus dados de outros sistemas ou planilhas. Nossa equipe também pode ajudar nesse processo."
          },
          {
            q: "Tem fidelidade?",
            a: "Não. Você pode cancelar a qualquer momento sem multa. Acreditamos que você deve ficar porque o sistema é bom, não porque está preso a um contrato."
          }
        ].map((faq, i) => (
          <div key={i} className="p-6 rounded-xl bg-slate-50 border border-slate-100">
            <h3 className="font-semibold text-lg mb-2">{faq.q}</h3>
            <p className="text-muted-foreground">{faq.a}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const SolutionsSection = () => (
  <section id="solucoes" className="py-24 bg-white">
    <div className="container">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm text-primary font-medium mb-4">
          <CheckCircle className="h-4 w-4" />
          <span>A solução completa</span>
        </div>
        <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
          Tudo que você precisa em um só lugar
        </h2>
        <p className="text-muted-foreground text-lg">
          Funcionalidades pensadas para otimizar cada minuto do seu dia
        </p>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {solutions.map((solution, index) => (
          <div 
            key={solution.title}
            className="animate-fade-up group p-6 rounded-2xl bg-white shadow-sm border border-slate-200 hover:shadow-md transition-all duration-300 hover:-translate-y-1"
            style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'forwards' }}
          >
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-5 group-hover:scale-110 transition-transform`}>
              <solution.icon className="h-6 w-6" />
            </div>
            <h3 className="font-display text-lg font-bold mb-2">{solution.title}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">{solution.description}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const CTASection = () => {
  const navigate = useNavigate();
  
  return (
    <section className="py-24 bg-background">
      <div className="container">
        <div className="relative rounded-3xl overflow-hidden p-12 md:p-16 text-center" style={{ background: 'var(--gradient-primary)' }}>
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-foreground rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-primary-foreground rounded-full blur-3xl" />
          </div>
          <div className="relative z-10 max-w-2xl mx-auto">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
              Pronto para transformar sua clínica?
            </h2>
            <p className="text-primary-foreground/80 text-lg mb-8">
              Junte-se a centenas de profissionais que já automatizaram sua gestão com VITTALHUB
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button 
                size="xl" 
                className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 shadow-elevated"
                onClick={() => navigate("/auth")}
              >
                Começar Agora
                <ArrowRight className="h-5 w-5" />
              </Button>
              <Button 
                size="xl" 
                variant="ghost" 
                className="text-primary-foreground hover:bg-primary-foreground/10"
              >
                Falar com Especialista
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const Footer = () => (
  <footer className="py-12 border-t border-border bg-muted/30">
    <div className="container">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-bold">VITTALHUB</span>
        </div>
        <p className="text-sm text-muted-foreground">
          © 2024 VITTALHUB. Todos os direitos reservados.
        </p>
        <div className="flex items-center gap-6">
          <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Termos</a>
          <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacidade</a>
          <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Contato</a>
        </div>
      </div>
    </div>
  </footer>
);

const Index = () => {
  return (
    <main className="min-h-screen">
      <Header />
      <HeroSection />
      <ProblemsSection />
      <SolutionsSection />
      <PricingSection />
      <FAQSection />
      <CTASection />
      <Footer />
    </main>
  );
};

export default Index;
