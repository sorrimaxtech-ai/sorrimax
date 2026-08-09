import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Loader2, CheckCircle2, Copy, Check } from "lucide-react";
import { statusAsaas, conectarAsaas, type StatusAsaas } from "@/services/asaas";
import { toast } from "sonner";

// ============================================================================
// Conectar Asaas — a clínica cola a PRÓPRIA chave de API (o código nunca a vê
// em texto; vai direto pro edge, que valida em /myAccount e guarda no banco).
// Com o Asaas ligado, a clínica cobra pacientes por Pix/boleto no Financeiro,
// e o pagamento dá baixa sozinho.
// ============================================================================

// URL pública do webhook que a clínica configura no painel do Asaas.
const WEBHOOK_URL =
  (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "") + "/functions/v1/asaas-webhook";

export function AsaasCard() {
  const [status, setStatus] = useState<StatusAsaas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [chave, setChave] = useState("");
  const [ambiente, setAmbiente] = useState<"sandbox" | "production">("production");
  const [conectando, setConectando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    try {
      setStatus(await statusAsaas());
    } catch {
      setStatus({ conectado: false });
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const conectar = async () => {
    if (!chave.trim()) {
      toast.error("Cole a chave de API do Asaas");
      return;
    }
    setConectando(true);
    try {
      const r = await conectarAsaas(chave.trim(), ambiente);
      toast.success("Asaas conectado", { description: r.conta ? `Conta: ${r.conta}` : undefined });
      setChave("");
      await carregar();
    } catch (e: any) {
      toast.error("Não foi possível conectar", { description: e.message });
    } finally {
      setConectando(false);
    }
  };

  const copiarWebhook = async () => {
    await navigator.clipboard.writeText(WEBHOOK_URL);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <Card className="border-gray-100">
      <CardContent className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
              <CreditCard className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <p className="font-semibold">Pagamentos (Asaas)</p>
              <p className="text-sm text-muted-foreground">
                Cobre pacientes por Pix/boleto com baixa automática.
              </p>
            </div>
          </div>
          {status?.conectado && (
            <Badge className="border-0 bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Conectado
            </Badge>
          )}
        </div>

        {carregando ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : status?.conectado ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
              <span className="text-muted-foreground">Chave</span>
              <code className="text-xs">{status.apiKeyMascarada}</code>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
              <span className="text-muted-foreground">Ambiente</span>
              <span className="font-medium">{status.ambiente === "production" ? "Produção" : "Sandbox"}</span>
            </div>
            <div className="rounded-lg border border-brand-100 bg-brand-50/50 p-3">
              <p className="mb-1 text-xs font-semibold text-brand-800">
                No painel do Asaas, configure este webhook:
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-[11px]">{WEBHOOK_URL}</code>
                <Button size="icon" variant="outline" className="h-7 w-7 shrink-0" onClick={copiarWebhook}>
                  {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Access token do webhook: <code>{status.webhookToken}</code>
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setStatus({ conectado: false })}>
              Trocar chave
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="asaas-key">Chave de API do Asaas</Label>
              <Input
                id="asaas-key" type="password" placeholder="$aact_…"
                value={chave} onChange={(e) => setChave(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                No Asaas: Configurações → Integrações → Chave de API. A chave fica só no servidor.
              </p>
            </div>
            <div className="flex gap-2">
              {(["production", "sandbox"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setAmbiente(a)}
                  className={`flex-1 rounded-lg border p-2 text-sm font-medium transition ${
                    ambiente === a ? "border-brand-500 bg-brand-50 text-brand-700" : "border-border hover:bg-muted/50"
                  }`}
                >
                  {a === "production" ? "Produção" : "Sandbox (teste)"}
                </button>
              ))}
            </div>
            <Button className="w-full bg-brand-600 hover:bg-brand-700" disabled={conectando} onClick={conectar}>
              {conectando ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Validando…</> : "Conectar Asaas"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
