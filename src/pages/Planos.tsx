import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles, MessageCircle } from "lucide-react";

// ============================================================================
// Planos — placeholder. A página definitiva (divisão de usuários e funções por
// plano, checkout com o token da loja) ainda será desenhada. Por enquanto NÃO
// expõe preço; o CTA de desbloqueio da tela de Plano cai aqui.
// ============================================================================

export default function Planos() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-full items-center justify-center bg-background dashboard-theme p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Sparkles className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold">Estamos preparando seus planos</h1>
        <p className="mt-2 text-muted-foreground">
          Em instantes você vai poder desbloquear o acesso total ao Sorrimax por aqui.
          Enquanto isso, é só falar com a gente que a gente resolve pra você.
        </p>

        <div className="mt-6 flex flex-col items-center gap-2">
          <Button className="w-full gap-2 bg-brand-600 hover:bg-brand-700 sm:w-auto" onClick={() => navigate("/conversas")}>
            <MessageCircle className="h-4 w-4" /> Falar com a gente
          </Button>
          <button
            onClick={() => navigate("/assinatura")}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
        </div>
      </div>
    </div>
  );
}
