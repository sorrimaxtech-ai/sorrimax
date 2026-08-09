import { useState } from "react";
import { 
  MessageCircle, 
  Send, 
  Star, 
  ThumbsUp, 
  Lightbulb, 
  AlertCircle, 
  CheckCircle2,
  Sparkles,
  ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const Feedback = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    content: "",
    rating: 0
  });

  const categories = [
    { value: "uso", label: "Uso do sistema", icon: ThumbsUp },
    { value: "melhoria", label: "Sugestão de melhoria", icon: Star },
    { value: "ideia", label: "Nova ideia", icon: Lightbulb },
    { value: "deixa-a-desejar", label: "Deixou a desejar", icon: AlertCircle },
    { value: "outro", label: "Outro", icon: MessageCircle },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.category || !formData.content) {
      toast.error("Por favor, preencha a categoria e seu feedback.");
      return;
    }

    setIsSubmitting(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsSubmitting(false);
    setSubmitted(true);
    toast.success("Feedback enviado com sucesso! Obrigado por nos ajudar a melhorar.");
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4">
        <Card className="max-w-md w-full animate-scale-in border-primary/20 shadow-elevated glass">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-display font-bold">Obrigado!</CardTitle>
            <CardDescription className="text-lg">
              Seu feedback é fundamental para o crescimento do Meu Auxiliar.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex justify-center">
            <Button onClick={() => navigate("/")} variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Voltar ao Início
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-hero py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-2xl mx-auto relative z-10">
        <header className="mb-12 text-center animate-fade-in">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/80 backdrop-blur-md border border-white/20 shadow-sm px-4 py-2 mb-6">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Sparkles className="h-3 w-3" />
            </div>
            <span className="font-display text-sm font-bold text-foreground uppercase tracking-widest">Meu Auxiliar</span>
          </div>
          <h1 className="text-4xl font-display font-extrabold text-slate-900 mb-4">
            Como estamos indo?
          </h1>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto">
            Queremos ouvir você. Suas sugestões e críticas ajudam a construir uma ferramenta cada vez melhor.
          </p>
        </header>

        <Card className="animate-fade-up border-white/50 shadow-elevated glass">
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                Sua Opinião
              </CardTitle>
              <CardDescription>
                Conte-nos sobre sua experiência com o Meu Auxiliar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Nome (Opcional)</label>
                <Input 
                  placeholder="Seu nome" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="bg-white/50 border-slate-200 focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">O que você quer nos dizer?</label>
                <Select 
                  onValueChange={(value) => setFormData({...formData, category: value})}
                >
                  <SelectTrigger className="bg-white/50 border-slate-200 focus:bg-white transition-all">
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        <div className="flex items-center gap-2">
                          <cat.icon className="w-4 h-4 text-primary" />
                          {cat.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Seu feedback</label>
                <Textarea 
                  placeholder="Como foi o uso? O que podemos melhorar? Alguma ideia ou algo que deixou a desejar?" 
                  className="min-h-[150px] bg-white/50 border-slate-200 focus:bg-white transition-all resize-none"
                  value={formData.content}
                  onChange={(e) => setFormData({...formData, content: e.target.value})}
                  required
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-700">Como você avalia o Meu Auxiliar hoje?</label>
                <div className="flex justify-between items-center gap-2 px-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFormData({...formData, rating: star})}
                      className={`p-2 rounded-xl transition-all duration-300 ${
                        formData.rating >= star 
                        ? 'bg-primary/10 text-primary scale-110 shadow-sm' 
                        : 'text-slate-300 hover:text-primary/50'
                      }`}
                    >
                      <Star className={`w-8 h-8 ${formData.rating >= star ? 'fill-primary' : ''}`} />
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                type="submit" 
                className="w-full h-12 text-lg font-semibold gap-2 shadow-glow" 
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>Processando...</>
                ) : (
                  <>
                    Enviar Feedback
                    <Send className="w-4 h-4" />
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <footer className="mt-12 text-center text-muted-foreground text-sm animate-fade-in animation-delay-500">
          © 2024 Meu Auxiliar — Inteligência que Cuida da sua Clínica.
        </footer>
      </div>
    </div>
  );
};

export default Feedback;
