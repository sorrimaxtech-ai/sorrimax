import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Check, ArrowRight } from "lucide-react";
import { obterAssinatura, type Assinatura } from "@/services/asaas";
import { cn } from "@/lib/utils";

// ============================================================================
// Plano e assinatura — contador do teste + CTA de desbloqueio
// ----------------------------------------------------------------------------
// Não expomos preço/planos direto aqui (a divisão de usuários/funções por plano
// ainda está sendo definida). A tela mostra quanto falta do teste e um CTA
// pessoal "Desbloquear acesso total", que leva pra /planos — onde os valores e
// a assinatura vivem (página a refinar). O gating é SOFT: aviso, nunca bloqueio.
// ============================================================================

const STATUS_BADGE: Record<Assinatura["status"], { rotulo: string; classe: string }> = {
  trial: { rotulo: "Em teste", classe: "bg-brand-100 text-brand-800" },
  ativa: { rotulo: "Ativa", classe: "bg-emerald-100 text-emerald-800" },
  atrasada: { rotulo: "Pagamento em atraso", classe: "bg-amber-100 text-amber-800" },
  cancelada: { rotulo: "Cancelada", classe: "bg-red-100 text-red-800" },
};

const TRIAL_DIAS = 7;

export default function Assinatura() {
  const navigate = useNavigate();
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    (async () => {
      setAssinatura(await obterAssinatura());
      setCarregando(false);
    })();
  }, []);

  const statusAtual = assinatura?.status ?? "trial";
  const trialFim = assinatura?.trial_termina_em ? new Date(assinatura.trial_termina_em) : null;
  const diasRestantes = trialFim ? Math.ceil((trialFim.getTime() - Date.now()) / 86_400_000) : null;
  const emTeste = statusAtual === "trial";

  return (
    <div className="flex min-h-full bg-background dashboard-theme">
      <main className="mx-auto w-full max-w-3xl flex-1 p-6 lg:p-8">
        <header className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Sparkles className="h-6 w-6 text-brand-600" /> Plano e assinatura
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe seu teste grátis e desbloqueie o acesso total quando quiser.
          </p>
        </header>

        {carregando ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Estado atual + contador do teste */}
            <Card className="mb-6">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Seu plano</p>
                    <p className="text-lg font-bold capitalize">{assinatura?.plano ?? "Trial"}</p>
                  </div>
                  <Badge className={cn("border-0", STATUS_BADGE[statusAtual].classe)}>
                    {STATUS_BADGE[statusAtual].rotulo}
                  </Badge>
                </div>

                {emTeste && diasRestantes !== null && (
                  diasRestantes > 0 ? (
                    <div className="mt-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-1">
                        <p className="text-sm font-medium text-gray-900">
                          {diasRestantes === 1 ? "Falta 1 dia" : `Faltam ${diasRestantes} dias`} de teste grátis
                        </p>
                        <p className="text-xs text-muted-foreground">termina em {trialFim!.toLocaleDateString("pt-BR")}</p>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-brand-500 transition-all"
                          style={{ width: `${Math.max(6, Math.min(100, (diasRestantes / TRIAL_DIAS) * 100))}%` }} />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      Seu teste grátis terminou. Desbloqueie o acesso total para continuar usando o Sorrimax.
                    </div>
                  )
                )}

                {assinatura?.proximo_vencimento && !emTeste && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Próximo vencimento: {new Date(assinatura.proximo_vencimento).toLocaleDateString("pt-BR")}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* CTA de desbloqueio (sem expor preço) — leva pra /planos */}
            {emTeste ? (
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b3b8c] via-[#1466c4] to-[#1E88E5] p-6 text-white shadow-md sm:p-8">
                <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
                <div className="relative">
                  <h2 className="text-2xl font-bold leading-tight">
                    Continue com tudo o que você montou.
                  </h2>
                  <p className="mt-2 max-w-xl text-white/90">
                    Agenda, prontuário, cobrança digital, WhatsApp e relatórios — sem limite de tempo,
                    sem perder nada do que você já cadastrou. Desbloqueie e siga em frente.
                  </p>
                  <ul className="mt-5 grid gap-2 text-sm text-white/90 sm:grid-cols-3">
                    {["Sem perder o acesso", "Todos os recursos", "Suporte prioritário"].map((b) => (
                      <li key={b} className="inline-flex items-center gap-1.5">
                        <Check className="h-4 w-4 shrink-0 text-cyan-200" /> {b}
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={() => navigate("/planos")}
                    size="lg"
                    className="mt-6 gap-2 bg-white font-semibold text-brand-700 shadow-sm transition-all hover:bg-white/90 active:scale-[0.98]"
                  >
                    Desbloquear acesso total <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-xl border bg-card p-5">
                <div>
                  <p className="font-medium">Gerenciar assinatura</p>
                  <p className="text-sm text-muted-foreground">Trocar de plano, ver faturas e forma de pagamento.</p>
                </div>
                <Button variant="outline" onClick={() => navigate("/planos")} className="gap-2">
                  Ver planos <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
