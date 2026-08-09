import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, Lock, ArrowLeft, Loader2 } from "lucide-react";
import { z } from "zod";
import { AuthShell } from "@/components/auth/AuthShell";
import { Logo } from "@/components/brand/Logo";
import { traduzErro } from "@/lib/erros";

const authSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check for active Supabase session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/agenda");
      }
    };
    
    checkSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session && session.user.email_confirmed_at) {
        // Verificar se há um token de clínica pendente (após confirmação de email)
        const pendingToken = localStorage.getItem('pending_clinic_token');
        
        if (pendingToken) {
          // Usuário confirmou email e tem clínica pendente de configuração
          localStorage.removeItem('pending_clinic_token');
          navigate(`/configurar-clinica?token=${pendingToken}`);
        } else {
          // Login normal — cai na agenda: o dia da clínica começa por ela
          navigate("/agenda");
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const validateForm = () => {
    try {
      authSchema.parse({ email, password });
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: { email?: string; password?: string } = {};
        error.errors.forEach((err) => {
          if (err.path[0] === "email") fieldErrors.email = err.message;
          if (err.path[0] === "password") fieldErrors.password = err.message;
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  };

  // Recuperação de senha: sem isso o trial de tráfego pago morre no 2º login
  // (dentista esquece a senha, não há vendedor pra ligar). Manda o e-mail do
  // Supabase apontando para /redefinir-senha, onde ele define a nova.
  const enviarReset = async () => {
    if (!email) {
      toast({ title: "Informe seu e-mail", description: "Digite o e-mail da conta acima e clique de novo.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      if (error) throw error;
      toast({ title: "Verifique seu e-mail", description: "Se houver conta com esse e-mail, enviamos um link para redefinir a senha." });
    } catch (error: any) {
      toast({ title: "Não foi possível enviar", description: traduzErro(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          throw new Error("Email ou senha incorretos");
        }
        throw error;
      }

      // Login success handled by onAuthStateChange listener
      toast({
        title: "Bem-vindo de volta!",
        description: "Login realizado com sucesso!",
      });
      
    } catch (error: any) {
      console.error('Erro no login:', error);
      toast({
        title: "Erro ao fazer login",
        description: traduzErro(error) || "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div>
        <button
          onClick={() => navigate("/")}
          className="mb-8 flex items-center gap-2 text-gray-600 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao início
        </button>

        {/* Logo e título */}
        <div className="mb-8 text-center">
          <Logo className="justify-center" iconClassName="h-9 w-9" textClassName="text-3xl" />
          <p className="mt-3 text-lg text-gray-600">Bem-vindo de volta</p>
        </div>

        {/* Card de Login */}
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-xl">
          <h2 className="text-2xl font-bold mb-2">Entrar na sua conta</h2>
          <p className="text-gray-600 mb-6">Digite suas credenciais para acessar o painel</p>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                />
              </div>
              {errors.email && (
                <p className="text-sm text-red-600">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                />
              </div>
              {errors.password && (
                <p className="text-sm text-red-600">{errors.password}</p>
              )}
            </div>

            <div className="text-right">
              <button
                type="button"
                onClick={enviarReset}
                disabled={loading}
                className="text-sm text-brand-600 hover:text-brand-700 transition-colors disabled:opacity-50"
              >
                Esqueci minha senha
              </button>
            </div>

            <Button
              type="submit"
              className="w-full bg-brand-600 shadow-sm transition-all duration-150 hover:bg-brand-700 hover:shadow-md active:scale-[0.98]"
              size="lg"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Aguarde...
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </form>

          {/* Link de cadastro */}
          <div className="mt-6 border-t border-gray-100 pt-6 text-center">
            <p className="mb-3 text-sm text-gray-600">Ainda não tem uma conta?</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/cadastro')}
              className="w-full border-brand-200 font-semibold text-brand-700 transition-all duration-150 hover:bg-brand-50 active:scale-[0.98]"
            >
              Criar conta grátis
            </Button>
          </div>
        </div>
      </div>
    </AuthShell>
  );
};

export default Auth;
