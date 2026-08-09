// ============================================================================
// Edge Function: asaas (proxy autenticado)
// ----------------------------------------------------------------------------
// O navegador NUNCA fala com a API do Asaas direto — a chave viveria no bundle.
// Aqui: o front chama com o JWT do usuário; resolvemos a clínica dele, lemos a
// chave Asaas DA CLÍNICA no banco (service role) e falamos com o Asaas em nome
// dela. O dinheiro das cobranças de paciente cai na conta da própria clínica.
//
// Ações:
//   conectar          — salva/valida a chave da clínica (testa GET /myAccount)
//   cobrar-parcela    — cria cliente + cobrança Pix/Boleto de uma parcela
//   pix-de-cobranca   — busca o copia-e-cola + QR de uma cobrança já criada
//   status            — devolve a conexão (mascarada) da clínica
//
// Deploy: supabase functions deploy asaas
// Env:    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (padrão do projeto)
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // server-side: ignora RLS de propósito
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const erro = (msg: string, status = 400, detalhe?: string) => json({ erro: msg, detalhe }, status);

function baseUrl(ambiente: string): string {
  return ambiente === "production"
    ? (Deno.env.get("ASAAS_BASE_PROD") ?? "https://api.asaas.com/v3")
    : (Deno.env.get("ASAAS_BASE_SANDBOX") ?? "https://api-sandbox.asaas.com/v3");
}

// chamada crua à API Asaas com a chave da clínica
async function asaas(
  chave: string, ambiente: string, metodo: string, caminho: string, corpo?: unknown,
): Promise<{ ok: boolean; status: number; data: any }> {
  const resp = await fetch(`${baseUrl(ambiente)}${caminho}`, {
    method: metodo,
    headers: { access_token: chave, "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  let data: any = null;
  try { data = await resp.json(); } catch { /* corpo vazio */ }
  return { ok: resp.ok, status: resp.status, data };
}

// mensagem de erro legível a partir da resposta do Asaas
function erroAsaas(r: { data: any }): string {
  const e = r.data?.errors?.[0];
  return e?.description ?? "Falha na comunicação com o Asaas";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erro("Método não suportado", 405);

  // --- autenticação: quem é o usuário e de qual clínica ---
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return erro("Não autenticado", 401);

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return erro("Sessão inválida", 401);

  const { data: perfil } = await admin
    .from("profiles").select("clinica_id, role").eq("id", userData.user.id).single();
  if (!perfil?.clinica_id) return erro("Usuário sem clínica", 403);
  const clinicaId = perfil.clinica_id as string;
  const ehAdmin = perfil.role === "admin";

  let payload: any;
  try { payload = await req.json(); } catch { return erro("JSON inválido"); }
  const acao = payload?.acao as string;

  // ---------------------------------------------------------------- conectar
  if (acao === "conectar") {
    if (!ehAdmin) return erro("Só administrador conecta o Asaas", 403);
    const chave = String(payload.apiKey ?? "").trim();
    const ambiente = payload.ambiente === "production" ? "production" : "sandbox";
    if (!chave) return erro("Informe a chave de API do Asaas");

    // valida a chave batendo em /myAccount antes de salvar
    const teste = await asaas(chave, ambiente, "GET", "/myAccount");
    if (!teste.ok) return erro("Chave recusada pelo Asaas", 400, erroAsaas(teste));

    const { error: upErr } = await admin.from("clinica_integracao_asaas").upsert({
      clinica_id: clinicaId,
      api_key: chave,
      ambiente,
      asaas_wallet_id: teste.data?.walletId ?? null,
      conectado: true,
      ultima_erro: null,
    }, { onConflict: "clinica_id" });
    if (upErr) return erro("Falha ao salvar a conexão", 500, upErr.message);

    const { data: conexao } = await admin
      .from("clinica_integracao_asaas").select("webhook_token").eq("clinica_id", clinicaId).single();
    return json({ ok: true, conta: teste.data?.name ?? null, webhookToken: conexao?.webhook_token });
  }

  // carrega a conexão da clínica para as ações que falam com o Asaas
  const { data: conexao } = await admin
    .from("clinica_integracao_asaas").select("*").eq("clinica_id", clinicaId).single();

  // ---------------------------------------------------------------- status
  if (acao === "status") {
    if (!conexao) return json({ conectado: false });
    return json({
      conectado: conexao.conectado,
      ambiente: conexao.ambiente,
      apiKeyMascarada: mascarar(conexao.api_key),
      walletId: conexao.asaas_wallet_id,
      webhookToken: conexao.webhook_token,
    });
  }

  if (!conexao?.conectado) return erro("Asaas não conectado nesta clínica", 400);

  // ---------------------------------------------------------------- cobrar parcela
  if (acao === "cobrar-parcela") {
    const parcelaId = String(payload.parcelaId ?? "");
    const billingType = payload.billingType === "BOLETO" ? "BOLETO" : "PIX";
    if (!parcelaId) return erro("parcelaId obrigatório");

    // dados da parcela + paciente (na clínica do usuário)
    const { data: parcela } = await admin
      .from("lancamento_parcelas")
      .select("id, valor, vencimento, clinica_id, lancamentos(descricao, paciente_id, pacientes(nome_completo, cpf, email, celular))")
      .eq("id", parcelaId).eq("clinica_id", clinicaId).single();
    if (!parcela) return erro("Parcela não encontrada", 404);

    const pac: any = (parcela as any).lancamentos?.pacientes;
    if (!pac) return erro("Parcela sem paciente vinculado — cobrança precisa de um paciente");

    // cliente Asaas (idempotente por externalReference = paciente_id)
    const pacienteId = (parcela as any).lancamentos?.paciente_id;
    const criaCli = await asaas(conexao.api_key, conexao.ambiente, "POST", "/customers", {
      name: pac.nome_completo,
      cpfCnpj: soDigitos(pac.cpf) || undefined,
      email: pac.email || undefined,
      mobilePhone: soDigitos(pac.celular) || undefined,
      externalReference: pacienteId,
    });
    if (!criaCli.ok) return erro("Falha ao criar cliente no Asaas", 400, erroAsaas(criaCli));
    const customerId = criaCli.data?.id;

    // cobrança com externalReference = parcela_id (o webhook usa isso pra baixar)
    const venc = String((parcela as any).vencimento);
    const hoje = new Date().toISOString().slice(0, 10);
    const criaPag = await asaas(conexao.api_key, conexao.ambiente, "POST", "/payments", {
      customer: customerId,
      billingType,
      value: Number((parcela as any).valor),
      dueDate: venc >= hoje ? venc : hoje, // Asaas recusa vencimento no passado
      description: (parcela as any).lancamentos?.descricao ?? "Cobrança da clínica",
      externalReference: parcelaId,
    });
    if (!criaPag.ok) return erro("Falha ao criar cobrança no Asaas", 400, erroAsaas(criaPag));
    const pg = criaPag.data;

    // Pix: busca copia-e-cola + QR
    let pixPayload: string | null = null, pixImg: string | null = null;
    if (billingType === "PIX") {
      const qr = await asaas(conexao.api_key, conexao.ambiente, "GET", `/payments/${pg.id}/pixQrCode`);
      if (qr.ok) { pixPayload = qr.data?.payload ?? null; pixImg = qr.data?.encodedImage ?? null; }
    }

    // grava o vínculo parcela ↔ cobrança Asaas (upsert: recobrar substitui)
    await admin.from("asaas_cobrancas").upsert({
      clinica_id: clinicaId,
      parcela_id: parcelaId,
      asaas_payment_id: pg.id,
      asaas_customer_id: customerId,
      billing_type: billingType,
      status: pg.status ?? "PENDING",
      valor: Number((parcela as any).valor),
      invoice_url: pg.invoiceUrl ?? null,
      bank_slip_url: pg.bankSlipUrl ?? null,
      pix_payload: pixPayload,
      pix_qr_image: pixImg,
      due_date: pg.dueDate ?? null,
    }, { onConflict: "parcela_id" });

    return json({
      ok: true,
      billingType,
      invoiceUrl: pg.invoiceUrl,
      bankSlipUrl: pg.bankSlipUrl,
      pixPayload,
      pixQrImage: pixImg,
    });
  }

  return erro("Ação desconhecida", 400);
});

function soDigitos(x: unknown): string { return String(x ?? "").replace(/\D/g, ""); }
function mascarar(chave: string): string {
  if (!chave || chave.length < 12) return "••••";
  return `${chave.slice(0, 8)}…${chave.slice(-4)}`;
}
