import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// Agendamento público — o front (anônimo) chama as RPCs booking_* do banco.
// Todas escopadas ao slug de um perfil publicado que aceita agenda.
// ============================================================================

export interface ProfissionalPublico {
  id: string;
  nome: string | null;
  especialidade: string | null;
}

export interface PerfilBooking {
  encontrado: boolean;
  clinica_id?: string;
  nome_clinica?: string;
  bio?: string | null;
  foto_url?: string | null;
  capa_url?: string | null;
  especialidades?: string[] | null;
  profissionais?: ProfissionalPublico[];
}

export interface SlotPublico {
  inicio: string;   // ISO
  fim: string;      // ISO
}

export async function perfilBooking(slug: string): Promise<PerfilBooking> {
  const { data, error } = await supabase.rpc("booking_perfil", { p_slug: slug });
  if (error) throw error;
  return (data ?? { encontrado: false }) as PerfilBooking;
}

export async function slotsBooking(
  slug: string, profissionalId: string, data: string, servicoId?: string | null,
): Promise<SlotPublico[]> {
  const { data: linhas, error } = await supabase.rpc("booking_slots", {
    p_slug: slug, p_profissional_id: profissionalId, p_data: data, p_servico_id: servicoId ?? null,
  });
  if (error) throw error;
  // slots_disponiveis retorna { inicio, fim } por linha
  return ((linhas ?? []) as any[]).map((s) => ({ inicio: s.inicio, fim: s.fim }));
}

export async function agendarBooking(input: {
  slug: string;
  profissionalId: string;
  inicio: string;      // ISO
  nome: string;
  celular: string;
  nascimento: string;  // YYYY-MM-DD
  servicoId?: string | null;
}): Promise<{ ok: boolean; erro?: string; consulta_id?: string }> {
  const { data, error } = await supabase.rpc("booking_agendar", {
    p_slug: input.slug,
    p_profissional_id: input.profissionalId,
    p_inicio: input.inicio,
    p_nome: input.nome,
    p_celular: input.celular,
    p_nascimento: input.nascimento,
    p_servico_id: input.servicoId ?? null,
  });
  if (error) throw error;
  return data as { ok: boolean; erro?: string; consulta_id?: string };
}
