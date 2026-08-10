import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// useTenant — fonte ÚNICA de "quem sou eu e de qual clínica"
// ----------------------------------------------------------------------------
// Substitui `localStorage.getItem("user_session")`, que era lido em 15 lugares
// do app e NUNCA era escrito em lugar nenhum. Efeito: todo `if (!session) return`
// abortava silenciosamente e as telas ficavam vazias, sem erro na tela.
//
// Além de quebrado, era o desenho errado: tenant em localStorage é gravável
// pelo usuário. Aqui o contexto vem do servidor, via RPC meu_contexto(), que
// lê o profile do auth.uid() da sessão — não dá pra forjar pelo DevTools.
// ============================================================================

export interface Contexto {
  user_id: string;
  email: string | null;
  nome: string | null;
  role: string | null;
  clinica_id: string | null;
  clinica_nome: string | null;
  clinica_codigo: string | null;
  // vindos da 0044: quem é do time do SaaS, e a situação comercial da clínica.
  // Ficam aqui porque as três telas que dependem disso (porta do painel, aviso
  // de bloqueio, contador do teste) precisam do dado antes de qualquer query.
  plataforma: boolean;
  plataforma_papel: string | null;
  plano: string | null;
  assinatura_status: string | null;
  trial_termina_em: string | null;
  trial_infinito: boolean;
  cortesia: boolean;
  bloqueada: boolean;
  bloqueio_motivo: string | null;
}

let cache: Contexto | null = null;
let inflight: Promise<Contexto | null> | null = null;

/** Busca (com cache em memória) o contexto do usuário logado. */
export async function carregarContexto(forcar = false): Promise<Contexto | null> {
  if (!forcar && cache) return cache;
  if (!forcar && inflight) return inflight;

  inflight = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { cache = null; return null; }

    const { data, error } = await supabase.rpc("meu_contexto");
    if (error) { console.error("[useTenant] meu_contexto:", error.message); return null; }

    const ctx = (Array.isArray(data) ? data[0] : data) as Contexto | undefined;
    cache = ctx ?? null;
    return cache;
  })();

  try { return await inflight; } finally { inflight = null; }
}

export function limparContexto() { cache = null; }

export function useTenant() {
  const [contexto, setContexto] = useState<Contexto | null>(cache);
  const [carregando, setCarregando] = useState(!cache);

  useEffect(() => {
    let vivo = true;

    carregarContexto().then((ctx) => {
      if (!vivo) return;
      setContexto(ctx);
      setCarregando(false);
    });

    // mantém em sincronia com login/logout
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        limparContexto();
        if (vivo) setContexto(null);
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        carregarContexto(true).then((ctx) => { if (vivo) setContexto(ctx); });
      }
    });

    return () => { vivo = false; sub.subscription.unsubscribe(); };
  }, []);

  return {
    contexto,
    carregando,
    clinicaId: contexto?.clinica_id ?? null,
    isAdmin: contexto?.role === "admin",
    /** Membro do time Sorrimax — quem enxerga o painel da plataforma. */
    isPlataforma: contexto?.plataforma === true,
    isPlataformaDono: contexto?.plataforma_papel === "dono",
    recarregar: () => carregarContexto(true).then(setContexto),
  };
}
