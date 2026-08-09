import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cors } from "../_shared/cors.ts";

// ============================================================================
// whatsapp-instances — CRUD de instância pelo SERVIDOR
// ----------------------------------------------------------------------------
// Toda operação de instância passa por aqui porque o navegador não pode ver o
// token do provedor: quem tem o token manda mensagem em nome da clínica.
//
// A função:
//   1. identifica o usuário pelo JWT que ele mandou (nunca confia em clinica_id
//      vindo do corpo da requisição — seria trocar de clínica só editando o
//      JSON);
//   2. resolve a clínica dele no banco;
//   3. recusa qualquer operação em instância `shared_external` (são as do
//      Diamond, em produção com clientes reais);
//   4. fala com uazapi/Evolution com service role e devolve só o que é seguro.
//
// Ações: listar · criar · conectar · status · desconectar · excluir · sincronizar
// ============================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Conta do provedor onde a clínica cria instância. Ficam como secret da função:
// nunca no repositório, nunca no navegador.
const UAZAPI_URL = Deno.env.get("UAZAPI_URL") ?? "";
const UAZAPI_ADMIN_TOKEN = Deno.env.get("UAZAPI_ADMIN_TOKEN") ?? "";
const EVOLUTION_URL = Deno.env.get("EVOLUTION_URL") ?? "";
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_GLOBAL_KEY") ?? "";

type Provider = "uazapi" | "evolution";

async function api(
  url: string,
  init: RequestInit,
  timeoutMs = 25000,
): Promise<{ ok: boolean; status: number; data: any }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const txt = await res.text();
    let data: any = {};
    try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    // timeout do provedor não é "instância desconectada" — é indisponibilidade.
    // Confundir os dois faria a tela mentir sobre o estado da conexão.
    return { ok: false, status: 0, data: { error: String(e) } };
  } finally {
    clearTimeout(t);
  }
}

/** Normaliza o estado do provedor para o enum que o banco usa. */
function normalizarStatus(provider: Provider, data: any): string {
  const bruto = String(
    data?.instance?.status ?? data?.status ?? data?.state ??
    data?.instance?.state ?? data?.connectionStatus ?? "",
  ).toLowerCase();

  if (["connected", "open", "online", "authenticated"].includes(bruto)) return "connected";
  if (["connecting", "qrcode", "pairing", "close_pending", "syncing"].includes(bruto)) return "connecting";
  if (["disconnected", "close", "closed", "offline", "logout"].includes(bruto)) return "disconnected";
  return provider === "uazapi" && data?.instance ? "connecting" : "disconnected";
}

function extrairQr(data: any): string | null {
  const q = data?.instance?.qrcode ?? data?.qrcode ?? data?.base64 ??
            data?.qr ?? data?.instance?.qr ?? null;
  if (!q || typeof q !== "string") return null;
  return q.startsWith("data:") ? q : `data:image/png;base64,${q.replace(/^base64,/, "")}`;
}

function extrairNumero(data: any): string | null {
  const n = data?.instance?.owner ?? data?.owner ?? data?.instance?.wid ??
            data?.instance?.profileName ?? null;
  if (!n || typeof n !== "string") return null;
  const so = n.split("@")[0].replace(/\D/g, "");
  return so.length >= 10 ? so : null;
}

Deno.serve(async (req) => {
  const c = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: c });

  const res = await (async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  try {
    // ---------------------------------------------------------------- quem é
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ erro: "Não autenticado." }, 401);

    const { data: userData, error: erroUser } = await admin.auth.getUser(jwt);
    if (erroUser || !userData?.user) return json({ erro: "Sessão inválida." }, 401);
    const userId = userData.user.id;

    // A clínica vem do PERFIL, nunca do corpo da requisição.
    const { data: perfil } = await admin
      .from("profiles")
      .select("clinica_id, role")
      .eq("id", userId)
      .maybeSingle();

    const clinicaId = perfil?.clinica_id;
    if (!clinicaId) return json({ erro: "Usuário sem clínica." }, 403);

    const body = await req.json().catch(() => ({}));
    const acao = String(body?.acao ?? "");

    const registrar = (
      instancia_id: string | null, nome: string | null,
      a: string, detalhe?: string,
    ) => admin.from("whatsapp_instance_eventos").insert({
      clinica_id: clinicaId, instancia_id, nome, acao: a,
      detalhe: detalhe ?? null, ator: userId,
    });

    /** Carrega a instância COM credencial e garante que é gerenciável. */
    const carregar = async (id: string) => {
      const { data: inst } = await admin
        .from("whatsapp_instances")
        .select("*")
        .eq("id", id)
        .eq("clinica_id", clinicaId)
        .maybeSingle();

      if (!inst) return { erro: json({ erro: "Instância não encontrada." }, 404) };
      if (inst.shared_external) {
        // Estas são as instâncias do Diamond, com clientes reais atendendo.
        // Recusar aqui evita a chamada ao provedor — desfazer depois não é opção.
        return {
          erro: json({
            erro: "Esta instância pertence a outro sistema em produção e não pode ser gerenciada aqui.",
          }, 409),
        };
      }
      return { inst };
    };

    // ================================================================ listar
    if (acao === "listar") {
      const { data } = await admin
        .from("whatsapp_instances")
        .select("id, name, instance_id, provider, status, shared_external, external_system, " +
                "webhook_mode, owner_number, profile_name, connected_at, last_seen_at, degraded, created_at")
        .eq("clinica_id", clinicaId)
        .order("shared_external", { ascending: true })
        .order("created_at", { ascending: true });
      return json({ instancias: data ?? [] });
    }

    // ================================================================= criar
    if (acao === "criar") {
      if (perfil?.role !== "admin") {
        return json({ erro: "Só o administrador da clínica cria instância." }, 403);
      }
      const nome = String(body?.nome ?? "").trim();
      const provider = (body?.provider === "evolution" ? "evolution" : "uazapi") as Provider;
      if (nome.length < 2 || nome.length > 60) {
        return json({ erro: "Dê um nome de 2 a 60 caracteres à instância." }, 400);
      }

      const baseUrl = provider === "uazapi" ? UAZAPI_URL : EVOLUTION_URL;
      const adminKey = provider === "uazapi" ? UAZAPI_ADMIN_TOKEN : EVOLUTION_KEY;
      if (!baseUrl || !adminKey) {
        return json({
          erro: `O provedor ${provider} não está configurado no servidor.`,
          detalhe: `Defina ${provider === "uazapi" ? "UAZAPI_URL e UAZAPI_ADMIN_TOKEN" : "EVOLUTION_URL e EVOLUTION_GLOBAL_KEY"} nos secrets da Edge Function.`,
        }, 503);
      }

      let instanceId = "", token = "";
      if (provider === "uazapi") {
        const r = await api(`${baseUrl}/instance/init`, {
          method: "POST",
          headers: { admintoken: adminKey, "Content-Type": "application/json" },
          body: JSON.stringify({ name: nome }),
        });
        if (!r.ok) {
          await registrar(null, nome, "falha", `criar: ${r.data?.error ?? r.status}`);
          return json({
            erro: "O provedor recusou a criação da instância.",
            detalhe: r.data?.error ?? r.data?.message ?? `HTTP ${r.status}`,
          }, 502);
        }
        instanceId = r.data?.instance?.id ?? r.data?.id ?? r.data?.instance?.name ?? nome;
        token = r.data?.token ?? r.data?.instance?.token ?? "";
      } else {
        const r = await api(`${baseUrl}/instance/create`, {
          method: "POST",
          headers: { apikey: adminKey, "Content-Type": "application/json" },
          body: JSON.stringify({ instanceName: nome, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
        });
        if (!r.ok) {
          await registrar(null, nome, "falha", `criar: ${r.data?.message ?? r.status}`);
          return json({
            erro: "O provedor recusou a criação da instância.",
            detalhe: r.data?.message ?? `HTTP ${r.status}`,
          }, 502);
        }
        instanceId = r.data?.instance?.instanceName ?? nome;
        token = r.data?.hash?.apikey ?? r.data?.hash ?? adminKey;
      }

      if (!token) {
        return json({ erro: "O provedor não devolveu credencial para a instância." }, 502);
      }

      const webhookSecret = crypto.randomUUID();
      const { data: nova, error: erroInsert } = await admin
        .from("whatsapp_instances")
        .insert({
          clinica_id: clinicaId, name: nome, instance_id: instanceId,
          provider, api_url: baseUrl, api_token: token, apikey: token,
          status: "disconnected", webhook_secret: webhookSecret,
          shared_external: false,
          // valores aceitos pelo CHECK: direct | fanout_diamond | none.
          // Instância própria da clínica recebe o webhook direto.
          webhook_mode: "direct",
        })
        .select("id, name, provider, status")
        .maybeSingle();

      if (erroInsert || !nova) {
        // COMPENSAÇÃO: a instância já existe no provedor. Sem desfazer, ela fica
        // órfã — ocupando vaga do plano, possivelmente conectável, e sem
        // nenhum registro nosso capaz de encontrá-la depois.
        const rb = provider === "uazapi"
          ? await api(`${baseUrl}/instance`, {
              method: "DELETE",
              headers: { token, "Content-Type": "application/json" },
            })
          : await api(`${baseUrl}/instance/delete/${encodeURIComponent(instanceId)}`, {
              method: "DELETE",
              headers: { apikey: token, "Content-Type": "application/json" },
            });

        await registrar(null, nome, "falha",
          `gravação falhou (${erroInsert?.message}); desfeita no provedor: ${rb.ok ? "sim" : "NÃO"}`);

        return json({
          erro: "Não foi possível registrar a instância.",
          detalhe: rb.ok
            ? `${erroInsert?.message} — a instância foi removida do provedor, nada ficou pendente.`
            : `${erroInsert?.message} — ATENÇÃO: a instância ficou criada no provedor e precisa ser removida manualmente (${instanceId}).`,
        }, 500);
      }

      await registrar(nova.id, nome, "criada", `provedor ${provider}`);
      return json({ instancia: nova });
    }

    // ====================================================== órfãs no provedor
    // ATENÇÃO — este bloco opera numa conta de provedor COMPARTILHADA com outro
    // sistema em produção. A primeira versão listava tudo o que estava no
    // provedor e não batia com `instance_id` do banco, e classificou as três
    // instâncias do Diamond como órfãs: nosso banco guarda o NOME do provedor
    // em `instance_id` (wapp-solarmax-649) e a comparação era contra o ID dele
    // (reedb3e23133f1e). Um clique teria apagado cliente real.
    //
    // Por isso a lógica é invertida: em vez de deduzir o que é descartável,
    // só é removível o que ESTE sistema registrou ter tentado criar e falhado
    // (evento 'falha' em whatsapp_instance_eventos). Instância que este sistema
    // nunca tocou jamais entra na lista, por definição — não por comparação
    // bem-sucedida.
    if (acao === "orfas" || acao === "remover_orfa") {
      if (perfil?.role !== "admin") return json({ erro: "Ação restrita ao administrador." }, 403);
      if (!UAZAPI_URL || !UAZAPI_ADMIN_TOKEN) {
        return json({ erro: "Provedor uazapi não configurado no servidor." }, 503);
      }

      // nomes que ESTA clínica tentou criar e cuja gravação falhou
      const { data: falhas } = await admin
        .from("whatsapp_instance_eventos")
        .select("nome, detalhe, created_at")
        .eq("clinica_id", clinicaId)
        .eq("acao", "falha")
        .order("created_at", { ascending: false })
        .limit(50);

      const tentados = new Set(
        (falhas ?? [])
          .filter((f: any) => String(f.detalhe ?? "").includes("gravação falhou") || String(f.detalhe ?? "").startsWith("criar:"))
          .map((f: any) => String(f.nome ?? "").trim())
          .filter(Boolean),
      );

      // e qualquer nome/id já registrado no banco é intocável, de qualquer clínica
      const { data: todas } = await admin.from("whatsapp_instances").select("instance_id, name");
      const registrados = new Set<string>();
      for (const x of todas ?? []) {
        registrados.add(String((x as any).instance_id));
        registrados.add(String((x as any).name));
      }

      const r = await api(`${UAZAPI_URL}/instance/all`, {
        method: "GET",
        headers: { admintoken: UAZAPI_ADMIN_TOKEN, "Content-Type": "application/json" },
      });
      if (!r.ok) return json({ erro: "O provedor não listou as instâncias.", detalhe: `HTTP ${r.status}` }, 502);

      const doProvedor: any[] = Array.isArray(r.data) ? r.data : (r.data?.instances ?? []);
      const candidatas = doProvedor
        .map((i) => ({
          id: String(i?.id ?? i?.instance?.id ?? ""),
          nome: String(i?.name ?? i?.instance?.name ?? "").trim(),
          status: String(i?.status ?? i?.instance?.status ?? ""),
          token: String(i?.token ?? i?.instance?.token ?? ""),
        }))
        .filter((i) =>
          i.nome &&
          tentados.has(i.nome) &&                                   // nós tentamos criar
          !registrados.has(i.nome) && !registrados.has(i.id),       // e não virou registro
        );

      if (acao === "orfas") {
        return json({
          orfas: candidatas.map(({ token: _t, ...resto }) => resto),
          total_provedor: doProvedor.length,
          criterio: "somente instâncias que esta clínica tentou criar e cuja gravação falhou",
        });
      }

      // remoção exige nome E id conferindo — id sozinho não basta
      const alvo = candidatas.find(
        (o) => o.id === String(body?.instance_id ?? "") && o.nome === String(body?.nome ?? "").trim(),
      );
      if (!alvo) {
        return json({
          erro: "Essa instância não está na lista de órfãs desta clínica. Nada foi removido.",
        }, 404);
      }
      if (!alvo.token) return json({ erro: "O provedor não devolveu o token da instância." }, 502);

      const del = await api(`${UAZAPI_URL}/instance`, {
        method: "DELETE",
        headers: { token: alvo.token, "Content-Type": "application/json" },
      });
      if (!del.ok && del.status !== 404) {
        return json({ erro: "O provedor não confirmou a remoção.", detalhe: `HTTP ${del.status}` }, 502);
      }
      await registrar(null, alvo.nome, "excluida", `órfã removida do provedor (${alvo.id})`);
      return json({ ok: true, removida: alvo.nome });
    }

    // =============================================== conectar / status / etc.
    const id = String(body?.id ?? "");
    if (!id) return json({ erro: "Informe a instância." }, 400);

    const carga = await carregar(id);
    if (carga.erro) return carga.erro;
    const inst = carga.inst!;
    const provider = (inst.provider ?? "uazapi") as Provider;
    const baseUrl = inst.api_url;
    const token = inst.api_token ?? inst.apikey;

    if (!baseUrl || !token) {
      return json({ erro: "Instância sem credencial gravada. Recrie a conexão." }, 409);
    }

    const cabecalho = provider === "uazapi"
      ? { token, "Content-Type": "application/json" }
      : { apikey: token, "Content-Type": "application/json" };

    // -------------------------------------------------------------- conectar
    if (acao === "conectar") {
      const r = provider === "uazapi"
        ? await api(`${baseUrl}/instance/connect`, {
            method: "POST", headers: cabecalho,
            body: JSON.stringify(body?.telefone ? { phone: String(body.telefone).replace(/\D/g, "") } : {}),
          })
        : await api(`${baseUrl}/instance/connect/${encodeURIComponent(inst.instance_id)}`, {
            method: "GET", headers: cabecalho,
          });

      if (!r.ok) {
        await registrar(inst.id, inst.name, "falha", `conectar: ${r.data?.error ?? r.status}`);
        return json({ erro: "Não foi possível iniciar a conexão.", detalhe: r.data?.error ?? r.data?.message ?? `HTTP ${r.status}` }, 502);
      }

      const qr = extrairQr(r.data);
      const codigo = r.data?.instance?.paircode ?? r.data?.paircode ?? r.data?.pairingCode ?? null;
      const status = normalizarStatus(provider, r.data);

      await admin.from("whatsapp_instances")
        .update({ status, last_seen_at: new Date().toISOString() })
        .eq("id", inst.id);
      await registrar(inst.id, inst.name, qr || codigo ? "qr_gerado" : "conectada", null);

      // o QR vai na RESPOSTA, não é gravado em coluna legível pelo navegador:
      // ele vale poucos segundos e dá acesso à conta de quem escanear.
      return json({ status, qrcode: qr, codigo });
    }

    // ---------------------------------------------------------------- status
    if (acao === "status" || acao === "sincronizar") {
      const r = provider === "uazapi"
        ? await api(`${baseUrl}/instance/status`, { method: "GET", headers: cabecalho })
        : await api(`${baseUrl}/instance/connectionState/${encodeURIComponent(inst.instance_id)}`, { method: "GET", headers: cabecalho });

      if (!r.ok) {
        // NÃO grava "disconnected": provedor fora do ar não é instância caída.
        await registrar(inst.id, inst.name, "falha", `status: HTTP ${r.status}`);
        return json({ erro: "O provedor não respondeu.", detalhe: `HTTP ${r.status}` }, 502);
      }

      const status = normalizarStatus(provider, r.data);
      const numero = extrairNumero(r.data);
      const patch: Record<string, unknown> = {
        status, last_seen_at: new Date().toISOString(),
      };
      if (numero) patch.owner_number = numero;
      if (status === "connected" && inst.status !== "connected") {
        patch.connected_at = new Date().toISOString();
      }
      await admin.from("whatsapp_instances").update(patch).eq("id", inst.id);

      // Só registra MUDANÇA de estado. A tela consulta a cada 4s enquanto o QR
      // está aberto; registrar cada volta enterrava o histórico real embaixo de
      // dezenas de linhas idênticas ("sincronizada · disconnected").
      if (status !== inst.status) {
        await registrar(
          inst.id, inst.name,
          status === "connected" ? "conectada" : "sincronizada",
          `${inst.status} → ${status}`,
        );
      }

      return json({ status, owner_number: numero });
    }

    // ----------------------------------------------------------- desconectar
    if (acao === "desconectar") {
      const r = provider === "uazapi"
        ? await api(`${baseUrl}/instance/disconnect`, { method: "POST", headers: cabecalho })
        : await api(`${baseUrl}/instance/logout/${encodeURIComponent(inst.instance_id)}`, { method: "DELETE", headers: cabecalho });

      if (!r.ok) {
        await registrar(inst.id, inst.name, "falha", `desconectar: HTTP ${r.status}`);
        return json({ erro: "Não foi possível desconectar.", detalhe: r.data?.error ?? `HTTP ${r.status}` }, 502);
      }
      await admin.from("whatsapp_instances")
        .update({ status: "disconnected", connected_at: null, last_seen_at: new Date().toISOString() })
        .eq("id", inst.id);
      await registrar(inst.id, inst.name, "desconectada", null);
      return json({ status: "disconnected" });
    }

    // --------------------------------------------------------------- excluir
    if (acao === "excluir") {
      if (perfil?.role !== "admin") {
        return json({ erro: "Só o administrador da clínica exclui instância." }, 403);
      }

      // Apaga no provedor ANTES do banco. Se apagássemos a linha primeiro e o
      // provedor falhasse, a instância ficaria órfã lá — consumindo vaga do
      // plano, ainda conectada, e sem nenhum registro nosso para achá-la.
      const r = provider === "uazapi"
        ? await api(`${baseUrl}/instance`, { method: "DELETE", headers: cabecalho })
        : await api(`${baseUrl}/instance/delete/${encodeURIComponent(inst.instance_id)}`, { method: "DELETE", headers: cabecalho });

      if (!r.ok && r.status !== 404) {
        await registrar(inst.id, inst.name, "falha", `excluir: HTTP ${r.status}`);
        return json({
          erro: "O provedor não confirmou a exclusão. A instância foi mantida.",
          detalhe: r.data?.error ?? r.data?.message ?? `HTTP ${r.status}`,
        }, 502);
      }

      const { error: erroDel } = await admin.from("whatsapp_instances").delete().eq("id", inst.id);
      if (erroDel) return json({ erro: "Excluída no provedor, mas não no banco.", detalhe: erroDel.message }, 500);

      await registrar(inst.id, inst.name, "excluida", null);
      return json({ ok: true });
    }

    return json({ erro: `Ação desconhecida: ${acao}` }, 400);
  } catch (e) {
    return json({ erro: "Falha inesperada.", detalhe: String(e) }, 500);
  }
  })();
  for (const [k, v] of Object.entries(c)) res.headers.set(k, v);
  return res;
});
