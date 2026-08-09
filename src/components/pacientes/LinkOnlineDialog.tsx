import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link2, Loader2, Copy, Check, MessageCircle, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import { traduzErro } from "@/lib/erros";
import { criarLinkAnamnese, listarModelosAnamnese } from "@/services/pacientes";

// Link online de prontuário: a recepção escolhe um modelo de anamnese, gera o
// link público e manda ao paciente. O paciente preenche sem login; a resposta
// volta já vinculada (novo paciente ou o existente pelo celular).
export function LinkOnlineDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { clinicaId } = useTenant();
  const [modelos, setModelos] = useState<{ id: string; nome: string; especialidade: string | null }[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [modeloEscolhido, setModeloEscolhido] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!aberto || !clinicaId) return;
    setLink(""); setCopiado(false); setModeloEscolhido("");
    setCarregando(true);
    listarModelosAnamnese(clinicaId)
      .then(setModelos)
      .catch((e) => toast.error("Erro ao carregar modelos", { description: traduzErro(e) }))
      .finally(() => setCarregando(false));
  }, [aberto, clinicaId]);

  const gerar = async (modeloId: string, nome: string) => {
    if (!clinicaId) return;
    setGerando(modeloId);
    try {
      const url = await criarLinkAnamnese(clinicaId, modeloId);
      setLink(url);
      setModeloEscolhido(nome);
    } catch (e: any) {
      toast.error("Erro ao gerar link", { description: traduzErro(e) });
    } finally {
      setGerando(null);
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      toast.success("Link copiado");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não foi possível copiar — selecione e copie manualmente.");
    }
  };

  const linkWa = `https://wa.me/?text=${encodeURIComponent(
    `Olá! Para agilizar seu atendimento, preencha sua ficha por este link (leva poucos minutos): ${link}`,
  )}`;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-brand-600" /> Link online de prontuário
          </DialogTitle>
          <DialogDescription>
            Escolha o modelo de ficha, gere o link e envie ao paciente. Ele preenche pelo celular,
            sem precisar de login — a resposta chega automaticamente no cadastro.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : link ? (
          <div className="space-y-4 py-1">
            <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3">
              <p className="text-xs text-gray-500">Modelo escolhido</p>
              <p className="text-sm font-medium text-gray-900">{modeloEscolhido}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Link para enviar (válido por 7 dias, uso único)</Label>
              <div className="flex gap-2">
                <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="text-xs" />
                <Button variant="outline" onClick={copiar} className="shrink-0 gap-2">
                  {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  {copiado ? "Copiado" : "Copiar"}
                </Button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button asChild className="bg-emerald-600 hover:bg-emerald-700 gap-2 flex-1">
                <a href={linkWa} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-4 w-4" /> Enviar pelo WhatsApp
                </a>
              </Button>
              <Button variant="outline" onClick={() => setLink("")} className="flex-1">
                Gerar outro
              </Button>
            </div>
          </div>
        ) : modelos.length === 0 ? (
          <div className="py-8 text-center">
            <ClipboardList className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="font-medium text-gray-800">Nenhum modelo publicado</p>
            <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
              Crie e publique um modelo de anamnese em Anamnese › Modelos antes de gerar um link.
            </p>
          </div>
        ) : (
          <div className="space-y-2 py-1">
            <Label>Escolha o modelo de ficha</Label>
            {modelos.map((m) => (
              <button
                key={m.id}
                onClick={() => gerar(m.id, m.nome)}
                disabled={gerando !== null}
                className="w-full flex items-center gap-3 rounded-lg border border-gray-200 p-3 text-left hover:border-brand-300 hover:bg-brand-50/40 transition-colors disabled:opacity-60"
              >
                <ClipboardList className="h-5 w-5 text-brand-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.nome}</p>
                  {m.especialidade && <p className="text-xs text-gray-500">{m.especialidade}</p>}
                </div>
                {gerando === m.id
                  ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  : <Link2 className="h-4 w-4 text-gray-400" />}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
