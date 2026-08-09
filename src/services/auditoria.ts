import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// Trilha de auditoria — leitura (só admin, via RLS). Backend na migration 0032.
// ============================================================================

export interface RegistroAuditoria {
  id: string;
  tabela: string;
  registro_id: string | null;
  acao: "UPDATE" | "DELETE";
  usuario_id: string | null;
  status_antes: string | null;
  status_depois: string | null;
  created_at: string;
  profiles?: { full_name: string | null } | null;
}

export const ROTULO_TABELA: Record<string, string> = {
  consultas: "Consulta",
  lancamento_parcelas: "Parcela",
  orcamentos: "Orçamento",
  pacientes: "Paciente",
};

export async function listarAuditoria(clinicaId: string, limite = 100): Promise<RegistroAuditoria[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("*, profiles(full_name)")
    .eq("clinica_id", clinicaId)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as RegistroAuditoria[];
}
