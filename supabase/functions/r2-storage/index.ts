import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
import { cors } from "../_shared/cors.ts";

// ============================================================================
// r2-storage — anexos de paciente no Cloudflare R2, pelo SERVIDOR
// ----------------------------------------------------------------------------
// O navegador nunca vê a secret do R2. Ele pede a esta função uma URL
// PRÉ-ASSINADA (curta) e fala direto com o R2 — os bytes não passam por aqui.
//
// Isolamento multi-tenant: a `r2_key` é SEMPRE derivada aqui
// (`clinica/<clinica_id>/<arquivo_id>/<nome>`) a partir da clínica do JWT —
// o cliente não escolhe a chave. Toda leitura/remoção é autorizada contra o
// `clinica_id` da linha em `arquivos`.
//
// Ações: criar (URL de upload) · url (URL de download) · excluir
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const R2_ACCOUNT = Deno.env.get("R2_ACCOUNT_ID") ?? "";
const R2_BUCKET = Deno.env.get("R2_BUCKET") ?? "sorrimax";
const R2_ENDPOINT = `https://${R2_ACCOUNT}.r2.cloudflarestorage.com`;

const aws = new AwsClient({
  accessKeyId: Deno.env.get("R2_ACCESS_KEY") ?? "",
  secretAccessKey: Deno.env.get("R2_SECRET_KEY") ?? "",
  service: "s3",
  region: "auto",
});

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB por arquivo
const CATEGORIAS = ["documento", "exame", "foto", "raio-x", "outro"];

// tipos aceitos: imagens comuns + PDF (exame, raio-x, foto, laudo)
function tipoPermitido(ct: string): boolean {
  return ct.startsWith("image/") || ct === "application/pdf";
}

// nome só cosmético (a pasta já é única pelo arquivo_id); tira caminho e lixo
function nomeSeguro(nome: string): string {
  const base = (nome.split(/[\\/]/).pop() ?? "arquivo").trim();
  const limpo = base.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  return limpo || "arquivo";
}

async function presign(method: string, key: string, segundos: number, params?: Record<string, string>): Promise<string> {
  const u = new URL(`${R2_ENDPOINT}/${R2_BUCKET}/${key}`);
  u.searchParams.set("X-Amz-Expires", String(segundos));
  for (const [k, v] of Object.entries(params ?? {})) u.searchParams.set(k, v);
  const signed = await aws.sign(u.toString(), { method, aws: { signQuery: true } });
  return signed.url;
}

// o wrapper no fim aplica os cabeçalhos CORS em TODA resposta; aqui só o corpo
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const c = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: c });

  const res = await (async () => {
    if (req.method !== "POST") return json({ erro: "Método não suportado." }, 405);
    if (!R2_ACCOUNT || !Deno.env.get("R2_ACCESS_KEY")) {
      return json({ erro: "Storage não configurado no servidor." }, 500);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // ---------------------------------------------------------------- quem é
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ erro: "Não autenticado." }, 401);
    const { data: userData, error: erroUser } = await admin.auth.getUser(jwt);
    if (erroUser || !userData?.user) return json({ erro: "Sessão inválida." }, 401);
    const userId = userData.user.id;

    // a clínica vem do PERFIL, nunca do corpo
    const { data: perfil } = await admin.from("profiles").select("clinica_id").eq("id", userId).maybeSingle();
    const clinicaId = perfil?.clinica_id;
    if (!clinicaId) return json({ erro: "Usuário sem clínica." }, 403);

    const body = await req.json().catch(() => ({}));
    const acao = String(body?.acao ?? "");

    // ---------------------------------------------------------------- criar
    if (acao === "criar") {
      const nome = String(body?.nome ?? "").trim();
      const contentType = String(body?.contentType ?? "application/octet-stream");
      const tamanho = Number(body?.tamanho ?? 0);
      const categoria = CATEGORIAS.includes(String(body?.categoria)) ? String(body.categoria) : "documento";
      const pacienteId = body?.pacienteId ? String(body.pacienteId) : null;
      const consultaId = body?.consultaId ? String(body.consultaId) : null;

      if (!nome) return json({ erro: "Nome do arquivo é obrigatório." }, 400);
      if (!tipoPermitido(contentType)) return json({ erro: "Tipo de arquivo não permitido (só imagem ou PDF)." }, 400);
      if (!tamanho || tamanho <= 0) return json({ erro: "Tamanho inválido." }, 400);
      if (tamanho > MAX_BYTES) return json({ erro: "Arquivo acima do limite de 25 MB." }, 400);

      // paciente/consulta precisam ser DA MESMA clínica (senão daria pra anexar
      // em prontuário alheio só trocando o id no corpo)
      if (pacienteId) {
        const { data: p } = await admin.from("pacientes").select("id").eq("id", pacienteId).eq("clinica_id", clinicaId).maybeSingle();
        if (!p) return json({ erro: "Paciente não encontrado nesta clínica." }, 404);
      }
      if (consultaId) {
        const { data: k } = await admin.from("consultas").select("id").eq("id", consultaId).eq("clinica_id", clinicaId).maybeSingle();
        if (!k) return json({ erro: "Consulta não encontrada nesta clínica." }, 404);
      }

      const arquivoId = crypto.randomUUID();
      const key = `clinica/${clinicaId}/${arquivoId}/${nomeSeguro(nome)}`;

      const { error: erroIns } = await admin.from("arquivos").insert({
        id: arquivoId,
        clinica_id: clinicaId,
        paciente_id: pacienteId,
        consulta_id: consultaId,
        categoria,
        nome_original: nome.slice(0, 200),
        r2_key: key,
        content_type: contentType,
        tamanho_bytes: tamanho,
        criado_por: userId,
      });
      if (erroIns) return json({ erro: "Falha ao registrar o arquivo.", detalhe: erroIns.message }, 500);

      const uploadUrl = await presign("PUT", key, 600); // 10 min pra subir
      return json({ arquivoId, uploadUrl });
    }

    // ---------------------------------------------------------------- url (download/view)
    if (acao === "url") {
      const arquivoId = String(body?.arquivoId ?? "");
      if (!arquivoId) return json({ erro: "arquivoId é obrigatório." }, 400);
      const { data: arq } = await admin
        .from("arquivos").select("r2_key, nome_original, content_type, clinica_id")
        .eq("id", arquivoId).maybeSingle();
      if (!arq || arq.clinica_id !== clinicaId) return json({ erro: "Arquivo não encontrado." }, 404);

      const url = await presign("GET", arq.r2_key, 300, {
        "response-content-type": arq.content_type ?? "application/octet-stream",
      });
      return json({ url, nome: arq.nome_original, contentType: arq.content_type });
    }

    // ---------------------------------------------------------------- excluir
    if (acao === "excluir") {
      const arquivoId = String(body?.arquivoId ?? "");
      if (!arquivoId) return json({ erro: "arquivoId é obrigatório." }, 400);
      const { data: arq } = await admin
        .from("arquivos").select("r2_key, clinica_id").eq("id", arquivoId).maybeSingle();
      if (!arq || arq.clinica_id !== clinicaId) return json({ erro: "Arquivo não encontrado." }, 404);

      // remove o objeto no R2; 204/404 os dois são "não está mais lá"
      const del = await aws.fetch(`${R2_ENDPOINT}/${R2_BUCKET}/${arq.r2_key}`, { method: "DELETE" });
      if (!del.ok && del.status !== 404) {
        return json({ erro: "Falha ao remover no storage." }, 502);
      }
      await admin.from("arquivos").delete().eq("id", arquivoId);
      return json({ ok: true });
    }

    return json({ erro: `Ação desconhecida: ${acao}` }, 400);
  })();

  for (const [k, v] of Object.entries(c)) res.headers.set(k, v);
  return res;
});
