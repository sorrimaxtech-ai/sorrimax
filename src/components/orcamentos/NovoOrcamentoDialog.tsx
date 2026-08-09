import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { criarOrcamento, listarConvenios, listarProfissionais } from "@/services/orcamentos";
import { toast } from "sonner";

interface Props {
  aberto: boolean;
  onFechar: () => void;
  onCriado: (id: string) => void;
  pacienteIdFixo?: string;
}

/** Cabeçalho do orçamento. Os itens entram no editor, com o odontograma. */
export const NovoOrcamentoDialog = ({ aberto, onFechar, onCriado, pacienteIdFixo }: Props) => {
  const { clinicaId } = useTenant();
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [convenios, setConvenios] = useState<any[]>([]);
  const [profissionais, setProfissionais] = useState<any[]>([]);
  const [pacienteId, setPacienteId] = useState(pacienteIdFixo ?? "");
  const [convenioId, setConvenioId] = useState("");
  const [profissionalId, setProfissionalId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [validade, setValidade] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto || !clinicaId) return;
    (async () => {
      try {
        const [pac, conv, prof] = await Promise.all([
          supabase.from("pacientes").select("id, nome_completo")
            .eq("clinica_id", clinicaId).eq("ativo", true).order("nome_completo").limit(500),
          listarConvenios(clinicaId),
          listarProfissionais(clinicaId),
        ]);
        setPacientes(pac.data ?? []);
        setConvenios(conv);
        setProfissionais(prof);
        // "Particular" é o padrão de qualquer clínica
        const particular = conv.find((c: any) => c.tipo === "particular");
        if (particular && !convenioId) setConvenioId(particular.id);
      } catch (e: any) {
        toast.error("Erro ao carregar dados", { description: e.message });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, clinicaId]);

  // espelha o padrão do mercado: título já sugerido pelo nome do paciente
  useEffect(() => {
    if (!pacienteId) return;
    const p = pacientes.find((x) => x.id === pacienteId);
    if (p && !titulo) setTitulo(`Plano de tratamento — ${p.nome_completo}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacienteId, pacientes]);

  const salvar = async () => {
    if (!clinicaId || !pacienteId) {
      toast.error("Selecione o paciente");
      return;
    }
    setSalvando(true);
    try {
      const id = await criarOrcamento({
        clinicaId,
        pacienteId,
        titulo: titulo || null,
        profissionalId: profissionalId || null,
        convenioId: convenioId || null,
        validade: validade || null,
      });
      toast.success("Orçamento criado");
      onCriado(id);
    } catch (e: any) {
      toast.error("Erro ao criar orçamento", { description: e.message });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Orçamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!pacienteIdFixo && (
            <div className="space-y-1.5">
              <Label>Paciente *</Label>
              <Select value={pacienteId} onValueChange={setPacienteId}>
                <SelectTrigger><SelectValue placeholder="Selecione o paciente" /></SelectTrigger>
                <SelectContent>
                  {pacientes.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      Nenhum paciente cadastrado
                    </div>
                  )}
                  {pacientes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome_completo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)}
                   placeholder="Plano de tratamento" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Plano / Convênio</Label>
              <Select value={convenioId} onValueChange={setConvenioId}>
                <SelectTrigger><SelectValue placeholder="Particular" /></SelectTrigger>
                <SelectContent>
                  {convenios.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={profissionalId} onValueChange={setProfissionalId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {profissionais.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name ?? "—"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Válido até</Label>
            <Input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || !pacienteId}
                  className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar e adicionar tratamentos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
