import { traduzErro } from "@/lib/erros";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Megaphone, PencilLine, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import {
  CATALOGO, garantirCampanha, listarCampanhas, listarEnvios, previewAlcance, salvarCampanha,
  type Campanha, type EnvioCampanha, type TipoCampanha,
} from "@/services/campanhas";
import { toast } from "sonner";
import { LembreteConsultaCard } from "@/components/marketing/LembreteConsultaCard";
import { cn } from "@/lib/utils";

// ============================================================================
// Marketing → Campanhas — a Central de mensagens do Sorrimax
// ----------------------------------------------------------------------------
// Modelo do benchmark (Codental §5): campanhas prontas com liga/desliga e
// preview de alcance ANTES de ativar. Diferença nossa: a mensagem é livre —
// emoji, quebra de linha, variáveis — porque o envio sai pela uazapi, sem
// template aprovado. Quem dispara é o pg_cron às 09h; aqui só se configura.
// ============================================================================

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const STATUS_ENVIO: Record<EnvioCampanha["status"], { rotulo: string; classe: string }> = {
  enfileirado: { rotulo: "Na fila", classe: "bg-brand-100 text-brand-800" },
  enviado: { rotulo: "Enviado", classe: "bg-emerald-100 text-emerald-800" },
  erro: { rotulo: "Erro", classe: "bg-red-100 text-red-800" },
  pulado: { rotulo: "Pulado", classe: "bg-muted text-muted-foreground" },
};

const Marketing = () => {
  const { clinicaId, carregando: carregandoCtx } = useTenant();
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [alcances, setAlcances] = useState<Partial<Record<TipoCampanha, number>>>({});
  const [envios, setEnvios] = useState<EnvioCampanha[]>([]);
  const [temInstancia, setTemInstancia] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<TipoCampanha | null>(null);
  const [editando, setEditando] = useState<TipoCampanha | null>(null);
  const [textoEdicao, setTextoEdicao] = useState("");

  const porTipo = useMemo(
    () => Object.fromEntries(campanhas.map((c) => [c.tipo, c])) as Partial<Record<TipoCampanha, Campanha>>,
    [campanhas],
  );

  const carregar = useCallback(async () => {
    // sem clínica resolvida (demo/sem sessão) não há o que carregar — e o
    // spinner não pode ficar eterno (mesma armadilha corrigida no Conversas)
    if (!clinicaId) { setCarregando(false); return; }
    setCarregando(true);
    try {
      const [lista, hist, inst] = await Promise.all([
        listarCampanhas(clinicaId),
        listarEnvios(clinicaId, 50),
        supabase
          .from("whatsapp_instances")
          .select("id")
          .eq("clinica_id", clinicaId)
          .eq("status", "connected")
          .limit(1),
      ]);
      setCampanhas(lista);
      setEnvios(hist);
      setTemInstancia((inst.data ?? []).length > 0);
      // preview de alcance por campanha do catálogo (em paralelo, tolerante a falha)
      const pares = await Promise.all(
        CATALOGO.map(async (c) => {
          try {
            const cfg = (lista.find((x) => x.tipo === c.tipo)?.config ?? c.config ?? {}) as Record<string, unknown>;
            return [c.tipo, await previewAlcance(c.tipo, cfg)] as const;
          } catch {
            return [c.tipo, 0] as const;
          }
        }),
      );
      setAlcances(Object.fromEntries(pares));
    } catch (e: any) {
      toast.error("Erro ao carregar campanhas", { description: traduzErro(e) });
    } finally {
      setCarregando(false);
    }
  }, [clinicaId]);

  useEffect(() => {
    if (!carregandoCtx) carregar();
  }, [carregandoCtx, carregar]);

  const alternar = async (tipo: TipoCampanha, ativa: boolean) => {
    if (!clinicaId) return;
    setSalvando(tipo);
    try {
      const camp = porTipo[tipo] ?? (await garantirCampanha(clinicaId, tipo));
      await salvarCampanha(camp.id, { ativa });
      toast.success(ativa ? "Campanha ativada — envios diários às 09h" : "Campanha pausada");
      await carregar();
    } catch (e: any) {
      toast.error("Não foi possível salvar", { description: traduzErro(e) });
    } finally {
      setSalvando(null);
    }
  };

  const abrirEdicao = async (tipo: TipoCampanha) => {
    if (!clinicaId) return;
    try {
      const camp = porTipo[tipo] ?? (await garantirCampanha(clinicaId, tipo));
      setTextoEdicao(camp.mensagem);
      setEditando(tipo);
      if (!porTipo[tipo]) await carregar();
    } catch (e: any) {
      toast.error("Erro ao abrir campanha", { description: traduzErro(e) });
    }
  };

  const salvarEdicao = async () => {
    const camp = editando ? porTipo[editando] : null;
    if (!camp || !textoEdicao.trim()) return;
    try {
      await salvarCampanha(camp.id, { mensagem: textoEdicao.trim() });
      toast.success("Mensagem salva");
      setEditando(null);
      await carregar();
    } catch (e: any) {
      toast.error("Não foi possível salvar", { description: traduzErro(e) });
    }
  };

  if (carregandoCtx || carregando) {
    return (
      <div className="flex min-h-full items-center justify-center bg-background dashboard-theme">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-full bg-background dashboard-theme">
      <main className="mx-auto w-full max-w-5xl flex-1 p-6 lg:p-8">
        <header className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Megaphone className="h-6 w-6 text-brand-600" /> Campanhas automáticas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            O sistema fala com o paciente certo, na hora certa — todos os dias às 09h, pelo WhatsApp
            da clínica. Você só escreve a mensagem uma vez.
          </p>
        </header>

        {!temInstancia && (
          <Card className="mb-6 border-amber-200 bg-amber-50">
            <CardContent className="p-4 text-sm text-amber-900">
              <strong>WhatsApp desconectado.</strong> As campanhas só disparam com uma instância
              conectada — vá em Ajustes → Integrações para ler o QR code.
            </CardContent>
          </Card>
        )}

        {/* Catálogo */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATALOGO.map((item) => {
            const camp = porTipo[item.tipo];
            const ativa = camp?.ativa ?? false;
            const alcance = alcances[item.tipo] ?? 0;
            return (
              <Card key={item.tipo} className={cn("transition-shadow", ativa && "ring-2 ring-brand-500/40")}>
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-3xl" aria-hidden>{item.emoji}</span>
                    <Switch
                      checked={ativa}
                      disabled={salvando === item.tipo}
                      onCheckedChange={(v) => alternar(item.tipo, v)}
                      aria-label={`Ativar ${item.nome}`}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{item.nome}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.descricao}</p>
                  </div>
                  {/* o número que convence: alcance projetado antes de ativar */}
                  <p className="flex items-center gap-1.5 text-xs font-medium text-brand-700">
                    <Users className="h-3.5 w-3.5" />
                    ~{alcance} paciente{alcance === 1 ? "" : "s"} nos próximos 30 dias
                  </p>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => abrirEdicao(item.tipo)}>
                    <PencilLine className="h-3.5 w-3.5" /> Editar mensagem
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Confirmação automática de consulta */}
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Confirmação de consultas</h2>
          <LembreteConsultaCard />
        </section>

        {/* Histórico */}
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold">Histórico de envios</h2>
          <Card>
            <CardContent className="p-0">
              {envios.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum envio ainda — ative uma campanha acima e o histórico aparece aqui.
                </p>
              ) : (
                <div className="divide-y divide-border/60">
                  {envios.map((e) => (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <span className="w-24 shrink-0 text-xs text-muted-foreground">{dataHora(e.created_at)}</span>
                      <span className="w-40 shrink-0 truncate font-medium">
                        {e.pacientes?.nome_completo ?? e.telefone}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {e.campanhas?.nome ?? "—"} · {e.mensagem}
                      </span>
                      <Badge className={cn("border-0 text-[11px]", STATUS_ENVIO[e.status].classe)}>
                        {STATUS_ENVIO[e.status].rotulo}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Edição de mensagem */}
        <Dialog open={editando !== null} onOpenChange={(v) => !v && setEditando(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {CATALOGO.find((c) => c.tipo === editando)?.nome ?? "Campanha"}
              </DialogTitle>
              <DialogDescription>
                Mensagem livre — com emoji, quebras de linha e as variáveis{" "}
                <code className="rounded bg-muted px-1">{"{nome}"}</code>{" "}
                <code className="rounded bg-muted px-1">{"{clinica}"}</code>
                {editando === "inadimplencia" && (
                  <>
                    {" "}
                    <code className="rounded bg-muted px-1">{"{valor}"}</code>
                  </>
                )}
                .
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={textoEdicao}
              onChange={(e) => setTextoEdicao(e.target.value)}
              rows={8}
              className="text-sm"
            />
            {editando && (
              <p className="text-xs text-muted-foreground">
                Alcance projetado: ~{alcances[editando] ?? 0} pacientes nos próximos 30 dias.
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button onClick={salvarEdicao} disabled={!textoEdicao.trim()}>Salvar mensagem</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default Marketing;
