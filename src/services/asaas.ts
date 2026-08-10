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
  /** Teste sem data de fim, concedido pelo painel da plataforma. */
  trial_infinito: boolean;
  /** Usa de graça por decisão comercial — não é trial vencendo. */
  cortesia: boolean;
}

const DIAS_TRIAL = 7;

export async function obterAssinatura(): Promise<Assinatura | null> {
  // A linha em asaas_assinaturas passou a existir para TODA clínica (trigger da
  // 0044), então este é o caminho normal — e é dele que saem o prazo real do
  // teste e a cortesia. Antes o front chutava `created_at + 7`, o que ignorava
  // qualquer prazo combinado e mostrava "vencido" para quem tinha 90 dias.
  const { data } = await supabase
    .from("asaas_assinaturas")
    .select("plano, status, proximo_vencimento, trial_termina_em, trial_infinito, cortesia")
    .maybeSingle();

  if (data) {
    const d = data as Record<string, unknown>;
    return {
      plano: String(d.plano ?? "trial"),
      status: (d.status as Assinatura["status"]) ?? "trial",
      proximo_vencimento: (d.proximo_vencimento as string) ?? null,
      trial_termina_em: (d.trial_termina_em as string) ?? null,
      trial_infinito: d.trial_infinito === true,
      cortesia: d.cortesia === true,
    };
  }

  // Fallback para base antiga que ainda não recebeu a 0044.
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
    trial_infinito: false,
    cortesia: false,
  };
}

export function assinarPlano(
  plano: PlanoSaas, valor: number, cpfCnpj: string, billingType: "BOLETO" | "PIX",
) {
  return chamar<{ ok: boolean; plano: string; invoiceUrl?: string; pixPayload?: string | null }>({
    acao: "assinar-plano", plano, valor, cpfCnpj, billingType,
  });
}
