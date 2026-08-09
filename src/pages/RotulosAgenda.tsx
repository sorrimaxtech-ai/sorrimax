import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Tag, Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// Rótulos da agenda
// ----------------------------------------------------------------------------
// Rótulo é o que deixa a recepção ler a grade sem abrir agendamento: "urgência",
// "primeira consulta", "cortesia". Não é status (o status é do atendimento) nem
// procedimento — é classificação livre da clínica.
//
// Desativar em vez de excluir é o caminho padrão: excluir um rótulo apaga a
// marcação de todo o histórico de agendamentos que o usava.
// ============================================================================

interface Rotulo {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  ativo: boolean;
}

const PALETA = [
  "#0ea5e9", "#8b5cf6", "#ef4444", "#14b8a6", "#f59e0b",
  "#ec4899", "#22c55e", "#6366f1", "#f97316", "#64748b",
];

const VAZIO = { id: null as string | null, nome: "", cor: PALETA[0], ativo: true };

const RotulosAgenda = () => {
  const { clinicaId, carregando: carregandoCtx } = useTenant();
  const [lista, setLista] = useState<Rotulo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dialogo, setDialogo] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [excluir, setExcluir] = useState<Rotulo | null>(null);

  const carregar = async () => {
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; }
    setCarregando(true);
    const { data, error } = await supabase
      .from("agenda_rotulos")
      .select("id, nome, cor, ordem, ativo")
      .eq("clinica_id", clinicaId)
      .order("ordem");
    if (error) toast.error("Erro ao carregar rótulos", { description: error.message });
    else setLista((data ?? []) as Rotulo[]);
    setCarregando(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [clinicaId, carregandoCtx]);

  const salvar = async () => {
    if (!clinicaId) return;
    const nome = form.nome.trim();
    if (!nome) { toast.error("Dê um nome ao rótulo"); return; }

    setSalvando(true);
    try {
      if (form.id) {
        const { error } = await supabase
          .from("agenda_rotulos")
          .update({ nome, cor: form.cor, ativo: form.ativo })
          .eq("id", form.id)
          .eq("clinica_id", clinicaId);
        if (error) throw error;
        toast.success("Rótulo atualizado");
      } else {
        const { error } = await supabase.from("agenda_rotulos").insert({
          clinica_id: clinicaId,
          nome,
          cor: form.cor,
          ativo: form.ativo,
          ordem: (lista.at(-1)?.ordem ?? 0) + 1,
        });
        if (error) throw error;
        toast.success("Rótulo criado");
      }
      setDialogo(false);
      await carregar();
    } catch (e: any) {
      // índice único por (clinica_id, lower(nome))
      const dup = e.code === "23505";
      toast.error(dup ? "Já existe um rótulo com esse nome" : "Erro ao salvar", {
        description: dup ? undefined : e.message,
      });
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!excluir || !clinicaId) return;
    const { error } = await supabase
      .from("agenda_rotulos")
      .delete()
      .eq("id", excluir.id)
      .eq("clinica_id", clinicaId);
    if (error) toast.error("Erro ao excluir", { description: error.message });
    else { toast.success("Rótulo excluído"); await carregar(); }
    setExcluir(null);
  };

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Tag className="h-6 w-6 text-emerald-600" /> Rótulos da agenda
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                Classificam o agendamento na grade — urgência, retorno, cortesia — sem virar status.
              </p>
            </div>
            <Button
              onClick={() => { setForm(VAZIO); setDialogo(true); }}
              className="bg-emerald-600 hover:bg-emerald-700 gap-2"
            >
              <Plus className="h-4 w-4" /> Novo rótulo
            </Button>
          </div>

          <Card className="border-gray-100">
            <CardContent className="p-0">
              {carregandoCtx || carregando ? (
                <div className="p-12 flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : lista.length === 0 ? (
                <div className="p-12 text-center">
                  <Tag className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                  <p className="font-medium text-gray-800">Nenhum rótulo</p>
                  <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                    Crie rótulos para marcar os agendamentos e reconhecê-los de relance na grade.
                  </p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/30">
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Rótulo</th>
                      <th className="px-4 py-2.5 font-medium">Cor</th>
                      <th className="px-4 py-2.5 font-medium">Situação</th>
                      <th className="px-4 py-2.5 font-medium text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((r) => (
                      <tr key={r.id} className="border-b border-border/50 hover:bg-muted/40">
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-white"
                            style={{ backgroundColor: r.cor }}
                          >
                            {r.nome}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.cor}</td>
                        <td className="px-4 py-3">
                          <span className={r.ativo ? "text-emerald-700" : "text-muted-foreground"}>
                            {r.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost" size="icon" aria-label={`Editar ${r.nome}`}
                              onClick={() => {
                                setForm({ id: r.id, nome: r.nome, cor: r.cor, ativo: r.ativo });
                                setDialogo(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" aria-label={`Excluir ${r.nome}`}
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => setExcluir(r)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={dialogo} onOpenChange={setDialogo}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar rótulo" : "Novo rótulo"}</DialogTitle>
            <DialogDescription>
              O nome aparece na grade da agenda e no agendamento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome" className="mt-1" maxLength={40} value={form.nome}
                placeholder="Primeira consulta, urgência, cortesia…"
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              />
            </div>

            <div>
              <Label>Cor</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {PALETA.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Cor ${c}`}
                    aria-pressed={form.cor === c}
                    onClick={() => setForm((f) => ({ ...f, cor: c }))}
                    className={`h-7 w-7 rounded-full transition-transform ${
                      form.cor === c ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Ativo</p>
                <p className="text-xs text-muted-foreground">
                  Inativo some do agendamento, mas mantém o histórico já marcado.
                </p>
              </div>
              <Switch
                checked={form.ativo}
                onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))}
              />
            </div>

            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground mb-1.5">Prévia na grade</p>
              <span
                className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-white"
                style={{ backgroundColor: form.cor }}
              >
                {form.nome.trim() || "Nome do rótulo"}
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogo(false)}>Cancelar</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!excluir} onOpenChange={(o) => !o && setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{excluir?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              A marcação some de todos os agendamentos que já usavam este rótulo, inclusive os
              passados. Para tirá-lo apenas dos próximos, desative em vez de excluir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarExclusao}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RotulosAgenda;
