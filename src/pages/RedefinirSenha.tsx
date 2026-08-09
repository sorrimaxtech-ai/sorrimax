import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ============================================================================
// Redefinir senha — rota pública de destino do e-mail de recuperação
// ----------------------------------------------------------------------------
// O link do e-mail chega com um token de recovery na URL; o supabase-js troca
// por uma sessão temporária (evento PASSWORD_RECOVERY) que só serve para
// updateUser({password}). Sem sessão de recovery, a tela avisa e manda voltar.
// ============================================================================

export default function RedefinirSenha() {
  const navigate = useNavigate();
  const [pronto, setPronto] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    // a sessão de recovery entra via hash da URL; ouvimos o evento e também
    // checamos sessão já existente (caso o supabase-js tenha processado antes)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setPronto(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setPronto(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha.length < 8) {
      toast.error("Senha muito curta", { description: "Use pelo menos 8 caracteres." });
      return;
    }
    if (senha !== confirma) {
      toast.error("As senhas não conferem");
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      setOk(true);
      toast.success("Senha redefinida");
      setTimeout(() => navigate("/agenda"), 1500);
    } catch (error: any) {
      toast.error("Não foi possível redefinir", { description: error.message });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-brand-50/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg">
              <Sparkles className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-brand-600 to-brand-500 bg-clip-text text-transparent">
              SORRIMAX
            </h1>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          {ok ? (
            <div className="text-center py-4">
              <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500 mb-3" />
              <p className="font-semibold">Senha redefinida!</p>
              <p className="text-sm text-gray-600 mt-1">Levando você para a agenda…</p>
            </div>
          ) : !pronto ? (
            <div className="text-center py-4">
              <p className="font-semibold">Link inválido ou expirado</p>
              <p className="text-sm text-gray-600 mt-1 mb-4">
                Abra o link mais recente do e-mail de recuperação, ou peça um novo.
              </p>
              <Button variant="outline" onClick={() => navigate("/auth")}>Voltar ao login</Button>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold mb-2">Nova senha</h2>
              <p className="text-gray-600 mb-6">Escolha uma senha para entrar na sua conta.</p>
              <form onSubmit={salvar} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="senha">Nova senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input id="senha" type="password" placeholder="••••••••" className="pl-10"
                           value={senha} onChange={(e) => setSenha(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirma">Confirme a senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input id="confirma" type="password" placeholder="••••••••" className="pl-10"
                           value={confirma} onChange={(e) => setConfirma(e.target.value)} />
                  </div>
                </div>
                <Button type="submit" className="w-full bg-brand-600 hover:bg-brand-700" size="lg" disabled={salvando}>
                  {salvando ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Salvando…</> : "Redefinir senha"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
