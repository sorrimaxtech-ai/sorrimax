import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, MessageCircle, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { carregarContexto, limparContexto, type Contexto } from "@/hooks/useTenant";

// ============================================================================
// Conta suspensa
// ----------------------------------------------------------------------------
// O que a clínica vê quando o acesso foi bloqueado no painel. Regras da tela:
//
//  · mostra o motivo escrito por quem bloqueou (por isso o motivo é obrigatório
//    lá) — "entre em contato com o suporte" sem dizer por quê é o pior tipo de
//    parede;
//  · oferece uma saída imediata (WhatsApp), porque quem chega aqui quer
//    resolver, não ler;
//  · nada de jargão: nenhum "RLS", "assinatura_status" ou código de erro.
//
// Se a conta for desbloqueada enquanto a pessoa está nesta tela, o botão
// "Tentar de novo" reconsulta o servidor e devolve ela ao sistema.
// ============================================================================

export default function ContaSuspensa() {
  const navigate = useNavigate();
  const [ctx, setCtx] = useState<Contexto | null>(null);
  const [verificando, setVerificando] = useState(true);

  const conferir = async (redirecionar: boolean) => {
    setVerificando(true);
    const c = await carregarContexto(true);
    setCtx(c);
    setVerificando(false);
    // liberou (ou nem estava bloqueada): volta pro sistema
    if (redirecionar && c && !c.bloqueada) navigate("/agenda", { replace: true });
  };

  useEffect(() => { conferir(false); }, []);

  const sair = async () => {
    await supabase.auth.signOut();
    limparContexto();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md border-gray-200 shadow-sm">
        <CardContent className="space-y-5 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
            <Lock className="h-7 w-7 text-amber-600" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold text-gray-900">Acesso pausado</h1>
            <p className="text-sm text-gray-600">
              O acesso de {ctx?.clinica_nome ?? "sua clínica"} ao Sorrimax está pausado no momento.
            </p>
          </div>

          {ctx?.bloqueio_motivo && (
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {ctx.bloqueio_motivo}
            </p>
          )}

          <p className="text-sm text-gray-600">
            Seus dados continuam guardados e intactos. Assim que resolvermos, tudo volta
            exatamente como estava.
          </p>

          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => window.open("https://wa.me/5511999999999?text=" +
                encodeURIComponent(`Olá! Sou da ${ctx?.clinica_nome ?? "minha clínica"} e quero regularizar o acesso ao Sorrimax.`), "_blank")}
            >
              <MessageCircle className="mr-2 h-4 w-4" />Falar com a gente
            </Button>

            <Button variant="outline" className="w-full" onClick={() => conferir(true)} disabled={verificando}>
              {verificando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Já resolvi — tentar de novo
            </Button>

            <Button variant="ghost" className="w-full text-gray-500" onClick={sair}>
              <LogOut className="mr-2 h-4 w-4" />Sair
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
