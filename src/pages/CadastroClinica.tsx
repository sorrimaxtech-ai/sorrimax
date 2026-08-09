import { traduzErro } from "@/lib/erros";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { User, Mail, Lock, Phone, Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { Logo } from "@/components/brand/Logo";

const CadastroClinica = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    telefone: "",
    senha: "",
    confirmarSenha: ""
  });

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCadastro = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.nome || !formData.email || !formData.telefone || !formData.senha) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    if (formData.senha !== formData.confirmarSenha) {
      toast.error("As senhas não coincidem");
      return;
    }

    setLoading(true);

    // ========================================================================
    // ORDEM CORRETA: usuário PRIMEIRO, clínica depois.
    // ------------------------------------------------------------------------
    // O fluxo antigo criava a clínica como ANÔNIMO antes do signUp. Isso exigia
    // INSERT público em `clinicas` (qualquer um criava clínica em massa) e, se
    // o signUp falhasse no meio, sobrava clínica órfã + usuário sem tenant —
    // que loga e não enxerga nada, para sempre.
    // Agora: signUp → RPC atômica no servidor cria a clínica E vincula o
    // profile na mesma transação. Falhou? Nada fica pela metade. É idempotente.
    // ========================================================================
    try {
      // 1. Cria o usuário. O trigger handle_new_user já cria o profile.
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.senha,
        options: {
          data: { full_name: formData.nome },
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });

      if (authError) throw new Error(authError.message);
      if (!authData.user) throw new Error("Não foi possível criar o usuário.");

      // 2. Sem sessão = confirmação de email ligada. A clínica será criada no
      //    primeiro login (Auth.tsx cuida disso). Nada é criado agora.
      if (!authData.session) {
        toast.success("Conta criada!");
        toast.info("Confirme seu email para ativar a conta", {
          description: `Enviamos um link para ${formData.email}`,
          duration: 8000,
        });
        localStorage.setItem("pending_clinic_name", `Clínica de ${formData.nome}`);
        localStorage.setItem("pending_clinic_phone", formData.telefone);
        setTimeout(() => navigate("/auth"), 2500);
        return;
      }

      // 3. Com sessão: cria clínica + vincula profile atomicamente.
      const { data: clinicaId, error: rpcError } = await supabase.rpc(
        "criar_clinica_para_usuario",
        {
          p_nome_clinica: `Clínica de ${formData.nome}`,
          p_telefone: formData.telefone,
          p_email: formData.email,
        },
      );

      if (rpcError) throw new Error(rpcError.message);

      toast.success("Conta criada com sucesso!", {
        description: "Agora configure sua clínica.",
      });
      setTimeout(() => navigate("/configurar-clinica"), 1200);
      return;
    } catch (error: any) {
      console.error("Erro no cadastro:", error);
      toast.error("Erro ao criar conta", {
        description: traduzErro(error) || "Tente novamente mais tarde",
      });
      return;
    } finally {
      setLoading(false);
    }

  };

  const formatPhone = (value: string) => {
    // Remove tudo que não é dígito
    const numbers = value.replace(/\D/g, "");
    
    // Limita a 11 dígitos
    const limited = numbers.substring(0, 11);
    
    // Aplica a máscara
    if (limited.length <= 2) return limited;
    if (limited.length <= 7) return `(${limited.substring(0, 2)}) ${limited.substring(2)}`;
    return `(${limited.substring(0, 2)}) ${limited.substring(2, 7)}-${limited.substring(7)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setFormData(prev => ({ ...prev, telefone: formatted }));
  };

  return (
    <AuthShell>
      <div>
        {/* Logo e Título */}
        <div className="mb-8 text-center">
          <Logo className="justify-center" iconClassName="h-8 w-8" />
          <p className="mt-2 text-gray-600">Gestão para clínicas odontológicas</p>
        </div>

        <Card className="border-gray-100 bg-white shadow-xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl font-bold text-gray-900">Criar nova conta</CardTitle>
            <CardDescription>Cadastre-se para gerenciar sua clínica</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCadastro} className="space-y-4">
              
              <div className="space-y-1">
                <Label htmlFor="nome" className="text-gray-700 font-medium">Nome completo</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={(e) => handleChange('nome', e.target.value)}
                    placeholder="Seu nome completo"
                    className="pl-10 h-10 border-gray-200 focus:border-brand-500 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="email" className="text-gray-700 font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    placeholder="seu@email.com"
                    className="pl-10 h-10 border-gray-200 focus:border-brand-500 focus:ring-brand-500 bg-brand-50/30"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="telefone" className="text-gray-700 font-medium">Telefone (WhatsApp)</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="telefone"
                    value={formData.telefone}
                    onChange={handlePhoneChange}
                    placeholder="(11) 99999-9999"
                    className="pl-10 h-10 border-gray-200 focus:border-brand-500 focus:ring-brand-500"
                    maxLength={15}
                  />
                </div>
                <p className="text-xs text-gray-500">Informe um número de WhatsApp válido para contato</p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="senha" className="text-gray-700 font-medium">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="senha"
                    type={showPassword ? "text" : "password"}
                    value={formData.senha}
                    onChange={(e) => handleChange('senha', e.target.value)}
                    placeholder="••••••••"
                    className="pl-10 pr-10 h-10 border-gray-200 focus:border-brand-500 focus:ring-brand-500 bg-brand-50/30"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="confirmarSenha" className="text-gray-700 font-medium">Confirmar senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="confirmarSenha"
                    type={showConfirmPassword ? "text" : "password"}
                    value={formData.confirmarSenha}
                    onChange={(e) => handleChange('confirmarSenha', e.target.value)}
                    placeholder="Digite a senha novamente"
                    className="pl-10 pr-10 h-10 border-gray-200 focus:border-brand-500 focus:ring-brand-500"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="mt-2 h-11 w-full bg-brand-600 font-semibold text-white shadow-sm transition-all duration-150 hover:bg-brand-700 hover:shadow-md active:scale-[0.98] disabled:opacity-90"
                disabled={loading}
              >
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando conta...</>
                ) : (
                  "Criar conta grátis"
                )}
              </Button>

            </form>

            {/* Link para Login */}
            <div className="text-center mt-6 pt-4 border-t border-gray-100">
              <p className="text-sm text-gray-600">
                Já tem uma conta?{' '}
                <button
                  onClick={() => navigate('/auth')}
                  className="text-brand-600 hover:text-brand-700 font-semibold"
                >
                  Fazer login
                </button>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AuthShell>
  );
};

export default CadastroClinica;
