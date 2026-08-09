import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// Instâncias de WhatsApp — o cliente só conversa com a Edge Function
// ----------------------------------------------------------------------------
// Nenhuma função daqui escreve em `whatsapp_instances`. Toda mutação passa por
// `whatsapp-instances`, que roda com service role: é lá que mora o token do
// provedor, e ele não pode existir no bundle do navegador.
//
// A leitura também vem da função, e não de um `select` direto, para a tela
// receber exatamente o mesmo formato nos dois caminhos (listar e depois de
// cada operação) — evita a lista divergir do resultado da ação.
// ============================================================================

export type ProviderWa = "uazapi" | "evolution";
export type StatusInstancia = "connected" | "connecting" | "disconnected" | string;

export interface InstanciaWa {
  id: string;
  name: string;
  instance_id: string;
  provider: ProviderWa | null;
  status: StatusInstancia;
  shared_external: boolean;
  external_system: string | null;
  webhook_mode: string | null;
  owner_number: string | null;
  profile_name: string | null;
  connected_at: string | null;
  last_seen_at: string | null;
  degraded: boolean | null;
  created_at: string;
}

export interface EventoInstancia {
  id: string;
  instancia_id: string | null;
  nome: string | null;
  acao: string;
  detalhe: string | null;
  created_at: string;
}

/** Erro do servidor com o detalhe técnico separado da mensagem ao usuário. */
export class ErroInstancia extends Error {
  detalhe?: string;
  constructor(mensagem: string, detalhe?: string) {
    super(mensagem);
    this.detalhe = detalhe;
  }
}

/**
 * Traduz falha de transporte para frase de gente.
 *
 * O caso mais comum na prática — e o mais confuso — é o serviço de conexão
 * ainda não ter sido publicado no servidor: o navegador nem chega a falar com
 * ele e o SDK devolve "Failed to send a request to the Edge Function". Jogar
 * isso num toast para a recepção não diz nada e ainda passa amadorismo.
 */
function mensagemDeTransporte(bruta: string): { msg: string; det: string } {
  const b = bruta.toLowerCase();
  if (b.includes("failed to send a request") || b.includes("failed to fetch") ||
      b.includes("networkerror") || b.includes("load failed")) {
    return {
      msg: "O WhatsApp ainda não foi ativado neste sistema.",
      det: "O serviço de conexão não respondeu. Se o problema persistir, avise o suporte.",
    };
  }
  if (b.includes("timeout") || b.includes("timed out")) {
    return {
      msg: "O serviço de conexão demorou demais para responder.",
      det: "Tente de novo em alguns instantes.",
    };
  }
  return { msg: "Não foi possível falar com o serviço de conexão.", det: bruta };
}

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("whatsapp-instances", { body: corpo });

  // `functions.invoke` devolve erro de transporte em `error`, mas o corpo com
  // 4xx/5xx vem em `data`. Sem checar os dois, um 502 do provedor apareceria
  // como sucesso silencioso.
  if (error) {
    const ctx = (error as any)?.context;
    let msg: string | undefined;
    let det: string | undefined;
    try {
      const corpoErro = typeof ctx?.body === "string" ? JSON.parse(ctx.body) : ctx?.body;
      if (corpoErro?.erro) { msg = corpoErro.erro; det = corpoErro.detalhe; }
    } catch { /* sem corpo utilizável: cai na tradução de transporte */ }
    if (!msg) {
      const t = mensagemDeTransporte(error.message ?? "");
      msg = t.msg;
      det = det ?? t.det;
    }
    throw new ErroInstancia(msg, det);
  }
  if (data && typeof data === "object" && "erro" in (data as any)) {
    throw new ErroInstancia((data as any).erro, (data as any).detalhe);
  }
  return data as T;
}

export const listarInstanciasWa = () =>
  chamar<{ instancias: InstanciaWa[] }>({ acao: "listar" }).then((r) => r.instancias);

export const criarInstanciaWa = (nome: string, provider: ProviderWa) =>
  chamar<{ instancia: InstanciaWa }>({ acao: "criar", nome, provider }).then((r) => r.instancia);

/** Devolve o QR do momento (ou o código de pareamento, se informou telefone). */
export const conectarInstanciaWa = (id: string, telefone?: string) =>
  chamar<{ status: StatusInstancia; qrcode: string | null; codigo: string | null }>({
    acao: "conectar", id, telefone: telefone || undefined,
  });

export const sincronizarInstanciaWa = (id: string) =>
  chamar<{ status: StatusInstancia; owner_number: string | null }>({ acao: "sincronizar", id });

export const desconectarInstanciaWa = (id: string) =>
  chamar<{ status: StatusInstancia }>({ acao: "desconectar", id });

export const excluirInstanciaWa = (id: string) =>
  chamar<{ ok: boolean }>({ acao: "excluir", id });

/** Histórico — leitura direta, é a única parte sem segredo envolvido. */
export async function listarEventosInstancia(clinicaId: string): Promise<EventoInstancia[]> {
  const { data, error } = await supabase
    .from("whatsapp_instance_eventos")
    .select("id, instancia_id, nome, acao, detalhe, created_at")
    .eq("clinica_id", clinicaId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as EventoInstancia[];
}

// ------------------------------------------------------------------ rótulos

export const STATUS_WA_LABEL: Record<string, string> = {
  connected: "Conectado",
  connecting: "Conectando",
  disconnected: "Desconectado",
};

export const STATUS_WA_CLASSE: Record<string, string> = {
  connected: "bg-brand-100 text-brand-800 border-0",
  connecting: "bg-amber-100 text-amber-800 border-0",
  disconnected: "bg-gray-100 text-gray-700 border-0",
};

export const ACAO_LABEL: Record<string, string> = {
  criada: "Instância criada",
  conectada: "Conectada",
  qr_gerado: "QR gerado",
  desconectada: "Desconectada",
  excluida: "Excluída",
  sincronizada: "Sincronizada",
  falha: "Falha",
};

export function formatarNumeroWa(n: string | null): string {
  if (!n) return "—";
  const d = n.replace(/\D/g, "");
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : d;
}

export const dataHoraWa = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
