import { traduzErro } from "@/lib/erros";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, History, Trash2, RefreshCw } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { listarAuditoria, ROTULO_TABELA, type RegistroAuditoria } from "@/services/auditoria";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ============================================================================
// Ajustes → Atividades — a trilha de auditoria da equipe
// ----------------------------------------------------------------------------
// Responde "quem apagou/estornou/alterou?". Só admin lê (RLS). Backend na 0032.
// ============================================================================

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

function descreve(r: RegistroAuditoria): string {
  const alvo = ROTULO_TABELA[r.tabela] ?? r.tabela;
  if (r.acao === "DELETE") return `Excluiu ${alvo.toLowerCase()}`;
  if (r.status_antes && r.status_depois) return `${alvo}: ${r.status_antes} → ${r.status_depois}`;
  return `Alterou ${alvo.toLowerCase()}`;
}

export default function Atividades() {
  const { clinicaId, carregando: carregandoCtx } = useTenant();
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = async () => {
    if (!clinicaId) { setCarregando(false); return; }
    setCarregando(true);
    try {
      setRegistros(await listarAuditoria(clinicaId, 150));
    } catch (e) {
      toast.error("Erro ao carregar atividades", { description: traduzErro(e) });
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => { if (!carregandoCtx) carregar(); }, [carregandoCtx, clinicaId]);

  return (
    <div className="flex min-h-full bg-background dashboard-theme">
      <main className="mx-auto w-full max-w-3xl flex-1 p-6 lg:p-8">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <History className="h-6 w-6 text-brand-600" /> Atividades da equipe
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Quem excluiu, estornou ou mudou o status de consultas, parcelas, orçamentos e pacientes.
            </p>
          </div>
          <button onClick={carregar} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </button>
        </header>

        <Card>
          <CardContent className="p-0">
            {carregando ? (
              <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : registros.length === 0 ? (
              <p className="p-12 text-center text-sm text-muted-foreground">
                Nenhuma atividade registrada ainda. Exclusões e mudanças de status aparecem aqui.
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {registros.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      r.acao === "DELETE" ? "bg-red-50 text-red-600" : "bg-brand-50 text-brand-600",
                    )}>
                      {r.acao === "DELETE" ? <Trash2 className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{descreve(r)}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.profiles?.full_name ?? "Usuário removido"} · {dataHora(r.created_at)}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {ROTULO_TABELA[r.tabela] ?? r.tabela}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
