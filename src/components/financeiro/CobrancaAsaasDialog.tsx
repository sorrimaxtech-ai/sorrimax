import { traduzErro } from "@/lib/erros";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Loader2, QrCode, FileText, Check, MessageCircle } from "lucide-react";
import { cobrarParcela, type BillingType, type CobrancaGerada } from "@/services/asaas";
import { enqueueText } from "@/services/whatsapp/send";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ============================================================================
// Cobrança por Pix/Boleto (Asaas) sobre uma parcela
// ----------------------------------------------------------------------------
// A recepção escolhe Pix ou boleto; o edge gera a cobrança na conta Asaas da
// clínica e devolve copia-e-cola + QR + link. O pagamento cai por webhook e a
// parcela baixa sozinha — a recepção não confere extrato. Se o paciente tem
// chat de WhatsApp aberto, manda a cobrança por lá num clique (canal nosso).
// ============================================================================

interface Props {
  parcela: { id: string; valor: number; contato_phone?: string | null } | null;
  onFechar: () => void;
  onGerada?: () => void;
}

export function CobrancaAsaasDialog({ parcela, onFechar, onGerada }: Props) {
  const [tipo, setTipo] = useState<BillingType>("PIX");
  const [gerando, setGerando] = useState(false);
  const [cobranca, setCobranca] = useState<CobrancaGerada | null>(null);
  const [copiado, setCopiado] = useState(false);

  const aberto = parcela !== null;

  const fechar = () => {
    setCobranca(null);
    setCopiado(false);
    setTipo("PIX");
    onFechar();
  };

  const gerar = async () => {
    if (!parcela) return;
    setGerando(true);
    try {
      const c = await cobrarParcela(parcela.id, tipo);
      setCobranca(c);
      onGerada?.();
    } catch (e: any) {
      toast.error("Não foi possível gerar a cobrança", { description: traduzErro(e) });
    } finally {
      setGerando(false);
    }
  };

  const copiarPix = async () => {
    if (!cobranca?.pixPayload) return;
    await navigator.clipboard.writeText(cobranca.pixPayload);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  // envia o link/copia-e-cola pelo chat de WhatsApp do paciente, se existir
  const enviarWhats = async () => {
    if (!parcela || !cobranca) return;
    try {
      const { data: chat } = await supabase
        .from("whatsapp_chats").select("id")
        .eq("contact_phone", (parcela.contato_phone ?? "").replace(/\D/g, ""))
        .limit(1).maybeSingle();
      if (!chat?.id) {
        toast.error("Sem conversa de WhatsApp com este paciente", {
          description: "Abra um chat com ele primeiro, ou copie o link e envie manualmente.",
        });
        return;
      }
      const corpo = tipo === "PIX"
        ? `Olá! Segue o Pix para o pagamento (R$ ${parcela.valor.toFixed(2)}):\n\n${cobranca.pixPayload}\n\nOu acesse: ${cobranca.invoiceUrl ?? ""}`
        : `Olá! Segue o boleto para pagamento (R$ ${parcela.valor.toFixed(2)}): ${cobranca.bankSlipUrl ?? cobranca.invoiceUrl ?? ""}`;
      await enqueueText(chat.id, corpo);
      toast.success("Cobrança enviada pelo WhatsApp");
    } catch (e: any) {
      toast.error("Não foi possível enviar", { description: traduzErro(e) });
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cobrar por Pix ou Boleto</DialogTitle>
          <DialogDescription>
            {parcela && <>Valor: <strong>R$ {parcela.valor.toFixed(2)}</strong>. </>}
            O pagamento dá baixa sozinho quando cair.
          </DialogDescription>
        </DialogHeader>

        {!cobranca ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {(["PIX", "BOLETO"] as BillingType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTipo(t)}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition",
                    tipo === t ? "border-brand-500 bg-brand-50 text-brand-700" : "border-border hover:bg-muted/50",
                  )}
                >
                  {t === "PIX" ? <QrCode className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  {t === "PIX" ? "Pix" : "Boleto"}
                </button>
              ))}
            </div>
            <Button className="w-full bg-brand-600 hover:bg-brand-700" disabled={gerando} onClick={gerar}>
              {gerando ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando…</> : "Gerar cobrança"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {tipo === "PIX" && cobranca.pixQrImage && (
              <img
                src={`data:image/png;base64,${cobranca.pixQrImage}`}
                alt="QR Code Pix"
                className="mx-auto h-48 w-48 rounded-lg border"
              />
            )}
            {tipo === "PIX" && cobranca.pixPayload && (
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs">
                  {cobranca.pixPayload}
                </code>
                <Button size="icon" variant="outline" className="shrink-0" onClick={copiarPix}>
                  {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            )}
            {tipo === "BOLETO" && (
              <a
                href={cobranca.bankSlipUrl ?? cobranca.invoiceUrl}
                target="_blank" rel="noopener noreferrer"
                className="block rounded-lg border border-brand-200 bg-brand-50 p-3 text-center text-sm font-semibold text-brand-700 hover:bg-brand-100"
              >
                Abrir boleto
              </a>
            )}
            <Button variant="outline" className="w-full gap-2" onClick={enviarWhats}>
              <MessageCircle className="h-4 w-4" /> Enviar pelo WhatsApp
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              A parcela some das pendências assim que o Asaas confirmar o pagamento.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
