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

// ---------------------------------------------------------------- assinatura SaaS

export type PlanoSaas = "essencial" | "profissional" | "premium";

export interface Plano {
  id: PlanoSaas;
  nome: string;
  valor: number;
  descricao: string;
  destaque?: boolean;
}

export const PLANOS: Plano[] = [
  { id: "essencial", nome: "Essencial", valor: 97, descricao: "Para profissionais liberais que querem organização." },
  { id: "profissional", nome: "Profissional", valor: 197, destaque: true, descricao: "Para clínicas em crescimento." },
  { id: "premium", nome: "Premium", valor: 297, descricao: "Automação total, suporte prioritário." },
];

export interface Assinatura {
  plano: string;
  status: "trial" | "ativa" | "atrasada" | "cancelada";
  proximo_vencimento: string | null;
  trial_termina_em: string | null;
}

const DIAS_TRIAL = 7;

export async function obterAssinatura(): Promise<Assinatura | null> {
  // 1) já assinou? asaas_assinaturas tem a linha (plano/status/vencimento).
  const { data } = await supabase
    .from("asaas_assinaturas")
    .select("plano, status, proximo_vencimento, trial_termina_em")
    .maybeSingle();
  if (data) return data as Assinatura;

  // 2) sem assinatura → trial implícito da clínica: created_at + 7 dias.
  //    (o asaas_assinaturas só nasce quando a clínica escolhe um plano)
  const { data: cl } = await supabase
    .from("clinicas")
    .select("plano, assinatura_status, created_at")
    .maybeSingle();
  if (!cl) return null;

  const criada = cl.created_at ? new Date(cl.created_at) : null;
  const trialFim = criada ? new Date(criada.getTime() + DIAS_TRIAL * 86_400_000).toISOString() : null;
  const st = String(cl.assinatura_status ?? "trial");
  const status: Assinatura["status"] =
    st === "ativa" || st === "atrasada" || st === "cancelada" ? (st as Assinatura["status"]) : "trial";

  return {
    plano: String(cl.plano ?? "trial"),
    status,
    proximo_vencimento: null,
    trial_termina_em: trialFim,
  };
}

export function assinarPlano(
  plano: PlanoSaas, valor: number, cpfCnpj: string, billingType: "BOLETO" | "PIX",
) {
  return chamar<{ ok: boolean; plano: string; invoiceUrl?: string; pixPayload?: string | null }>({
    acao: "assinar-plano", plano, valor, cpfCnpj, billingType,
  });
}
