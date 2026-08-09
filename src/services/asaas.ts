import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// Asaas — service (front chama o edge, nunca a API do Asaas direto)
// ============================================================================

export type BillingType = "PIX" | "BOLETO";

export interface StatusAsaas {
  conectado: boolean;
  ambiente?: "sandbox" | "production";
  apiKeyMascarada?: string;
  walletId?: string | null;
  webhookToken?: string;
}

export interface CobrancaGerada {
  billingType: BillingType;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixPayload?: string | null;
  pixQrImage?: string | null; // base64 do PNG (sem prefixo data:)
}

/** Envelope comum: o edge devolve { erro, detalhe } em falha de negócio. */
async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("asaas", { body: corpo });
  if (error) {
    const ctx = (error as any)?.context;
    let msg = error.message, det: string | undefined;
    try {
      const c = typeof ctx?.body === "string" ? JSON.parse(ctx.body) : ctx?.body;
      if (c?.erro) { msg = c.erro; det = c.detalhe; }
    } catch { /* mantém msg de transporte */ }
    throw new Error(det ? `${msg} — ${det}` : msg);
  }
  if (data && typeof data === "object" && "erro" in (data as any)) {
    const d = data as any;
    throw new Error(d.detalhe ? `${d.erro} — ${d.detalhe}` : d.erro);
  }
  return data as T;
}

export function statusAsaas() {
  return chamar<StatusAsaas>({ acao: "status" });
}

export function conectarAsaas(apiKey: string, ambiente: "sandbox" | "production") {
  return chamar<{ ok: boolean; conta: string | null; webhookToken: string }>({
    acao: "conectar", apiKey, ambiente,
  });
}

export function cobrarParcela(parcelaId: string, billingType: BillingType) {
  return chamar<CobrancaGerada>({ acao: "cobrar-parcela", parcelaId, billingType });
}
