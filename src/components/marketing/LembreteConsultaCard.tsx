import { traduzErro } from "@/lib/erros";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, Loader2, PencilLine } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { obterConfigLembrete, salvarConfigLembrete, type ConfigLembrete } from "@/services/campanhas";
import { toast } from "sonner";

// ============================================================================
// Confirmação automática de consulta — o toggle da clínica
// ----------------------------------------------------------------------------
// Liga/desliga o lembrete que pede confirmação pelo WhatsApp N horas antes da
// consulta (o motor roda no banco de hora em hora). Opt-in: nasce desligado.
// ============================================================================

export function LembreteConsultaCard() {
  const { clinicaId } = useTenant();
  const [cfg, setCfg] = useState<ConfigLembrete | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [horas, setHoras] = useState(24);
  const [template, setTemplate] = useState("");

  useEffect(() => {
    if (!clinicaId) { setCarregando(false); return; }
    (async () => {
      const c = await obterConfigLembrete(clinicaId);
      setCfg(c);
      if (c) { setHoras(c.horas_antes); setTemplate(c.template); }
      setCarregando(false);
    })();
  }, [clinicaId]);

  const alternar = async (ativo: boolean) => {
    if (!clinicaId) return;
    setSalvando(true);
    try {
      await salvarConfigLembrete(clinicaId, { lembrete_consulta_ativo: ativo });
      setCfg((c) => (c ? { ...c, ativo } : c));
      toast.success(ativo ? "Confirmação automática ligada" : "Confirmação automática desligada");
    } catch (e: any) {
      toast.error("Não foi possível salvar", { description: traduzErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  const salvarTexto = async () => {
    if (!clinicaId) return;
    setSalvando(true);
    try {
      await salvarConfigLembrete(clinicaId, { lembrete_horas_antes: horas, lembrete_template: template });
      setCfg((c) => (c ? { ...c, horas_antes: horas, template } : c));
      setEditando(false);
      toast.success("Mensagem salva");
    } catch (e: any) {
      toast.error("Não foi possível salvar", { description: traduzErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <Card><CardContent className="flex justify-center p-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </CardContent></Card>
    );
  }

  return (
    <Card className={cfg?.ativo ? "ring-2 ring-brand-500/40" : ""}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
              <CalendarCheck className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <p className="font-semibold">Confirmação automática de consulta</p>
              <p className="text-sm text-muted-foreground">
                Pede confirmação pelo WhatsApp {horas}h antes — corta a falta.
              </p>
            </div>
          </div>
          <Switch
            checked={cfg?.ativo ?? false}
            disabled={salvando}
            onCheckedChange={alternar}
            aria-label="Ativar confirmação automática"
          />
        </div>

        {cfg?.ativo && (
          <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-3">
            <Badge className="border-0 bg-emerald-100 text-emerald-800">Ativa</Badge>
            <span className="text-xs text-muted-foreground">Envia {horas}h antes · respeita quem optou por não receber</span>
            <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={() => setEditando((v) => !v)}>
              <PencilLine className="h-3.5 w-3.5" /> Editar
            </Button>
          </div>
        )}

        {editando && (
          <div className="mt-4 space-y-3">
            <div className="w-40">
              <Label className="text-xs">Horas antes da consulta</Label>
              <Input type="number" min={1} max={72} value={horas} onChange={(e) => setHoras(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Mensagem — variáveis {"{nome} {clinica} {data} {hora}"}</Label>
              <Textarea rows={4} value={template} onChange={(e) => setTemplate(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={salvarTexto} disabled={salvando}>Salvar</Button>
              <Button size="sm" variant="outline" onClick={() => setEditando(false)}>Cancelar</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
