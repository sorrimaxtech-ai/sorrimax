import { traduzErro } from "@/lib/erros";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Check, Loader2, Copy, CheckCircle2, ArrowLeft } from "lucide-react";
import { PLANOS, obterAssinatura, assinarPlano, type Plano, type Assinatura } from "@/services/asaas";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ============================================================================
// Planos — a página "com mais claridade" pra onde o CTA de desbloqueio leva.
// Aqui vivem os valores e o fluxo de assinatura (Asaas). A tela de Plano
// (Assinatura) só mostra o contador do teste + o CTA, sem expor preço direto.
// Base a refinar: divisão de usuários/funções por plano ainda será definida.
// ============================================================================

export default function Planos() {
  const navigate = useNavigate();
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null);
  const [escolhido, setEscolhido] = useState<Plano | null>(null);
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [metodo, setMetodo] = useState<"PIX" | "BOLETO">("PIX");
  const [assinando, setAssinando] = useState(false);
  const [fatura, setFatura] = useState<{ invoiceUrl?: string; pixPayload?: string | null } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const carregar = async () => setAssinatura(await obterAssinatura());
  useEffect(() => { carregar(); }, []);

  const statusAtual = assinatura?.status ?? "trial";

  const confirmar = async () => {
    if (!escolhido) return;
    if (cpfCnpj.replace(/\D/g, "").length < 11) { toast.error("Informe um CPF ou CNPJ válido"); return; }
    setAssinando(true);
    try {
      const r = await assinarPlano(escolhido.id, escolhido.valor, cpfCnpj, metodo);
      setFatura({ invoiceUrl: r.invoiceUrl, pixPayload: r.pixPayload });
      toast.success("Assinatura criada", { description: "Pague a primeira fatura para ativar." });
      await carregar();
    } catch (e: any) {
      toast.error("Não foi possível assinar", { description: traduzErro(e) });
    } finally {
      setAssinando(false);
    }
  };

  const fecharDialog = () => { setEscolhido(null); setFatura(null); setCpfCnpj(""); };

  return (
    <div className="flex min-h-full bg-background dashboard-theme">
      <main className="mx-auto w-full max-w-5xl flex-1 p-6 lg:p-8">
        <button onClick={() => navigate("/assinatura")} className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>

        <header className="mb-6">
          <h1 className="text-2xl font-bold">Escolha seu plano</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Continue com o Sorrimax sem interrupção quando o teste acabar.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {PLANOS.map((p) => (
            <Card key={p.id} className={cn(p.destaque && "ring-2 ring-brand-500/40")}>
              <CardContent className="flex h-full flex-col p-5">
                {p.destaque && (
                  <span className="mb-2 w-fit rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Mais popular
                  </span>
                )}
                <p className="text-lg font-bold">{p.nome}</p>
                <p className="mt-1 text-3xl font-bold">
                  R$ {p.valor}<span className="text-sm font-normal text-muted-foreground">/mês</span>
                </p>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{p.descricao}</p>
                <Button
                  className={cn("mt-4 w-full", p.destaque ? "bg-brand-600 hover:bg-brand-700" : "")}
                  variant={p.destaque ? "default" : "outline"}
                  onClick={() => setEscolhido(p)}
                >
                  {assinatura?.plano === p.id && statusAtual === "ativa" ? "Plano atual" : "Assinar"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Dialog de assinatura */}
        <Dialog open={escolhido !== null} onOpenChange={(o) => !o && fecharDialog()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Assinar {escolhido?.nome} — R$ {escolhido?.valor}/mês</DialogTitle>
              <DialogDescription>Cobrança mensal automática. A primeira fatura é gerada agora.</DialogDescription>
            </DialogHeader>

            {!fatura ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="doc">CPF ou CNPJ do responsável</Label>
                  <Input id="doc" placeholder="Para a nota fiscal" value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["PIX", "BOLETO"] as const).map((m) => (
                    <button key={m} onClick={() => setMetodo(m)}
                      className={cn("rounded-lg border p-2 text-sm font-medium transition",
                        metodo === m ? "border-brand-500 bg-brand-50 text-brand-700" : "border-border hover:bg-muted/50")}>
                      {m === "PIX" ? "Pix" : "Boleto"}
                    </button>
                  ))}
                </div>
                <Button className="w-full bg-brand-600 hover:bg-brand-700" disabled={assinando} onClick={confirmar}>
                  {assinando ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando…</> : "Confirmar assinatura"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
                <p className="font-semibold">Assinatura criada!</p>
                <p className="text-sm text-muted-foreground">Pague a primeira fatura para ativar o plano.</p>
                {fatura.pixPayload && (
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs">{fatura.pixPayload}</code>
                    <Button size="icon" variant="outline" className="shrink-0"
                      onClick={async () => { await navigator.clipboard.writeText(fatura.pixPayload!); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}>
                      {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                )}
                {fatura.invoiceUrl && (
                  <a href={fatura.invoiceUrl} target="_blank" rel="noopener noreferrer"
                     className="block rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm font-semibold text-brand-700 hover:bg-brand-100">
                    Abrir fatura
                  </a>
                )}
                <Button variant="outline" className="w-full" onClick={fecharDialog}>Fechar</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
