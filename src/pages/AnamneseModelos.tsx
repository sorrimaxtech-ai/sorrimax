import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList, Plus, Loader2, Sparkles, Trash2, Pencil, FileText, Search, UserPlus,
} from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "sonner";
import {
  listarModelos, criarModelo, excluirModelo, atualizarModelo, semearModeloOdonto,
  listarPacientes, formatarData, TOTAL_BANCO, type ModeloComContagem,
} from "@/services/anamnese";

// ============================================================================
// Anamnese — modelos
// ----------------------------------------------------------------------------
// Um modelo só aparece na hora de preencher quando está PUBLICADO. É o que
// separa "estou montando" de "a recepção já pode usar" — sem isso a clínica
// preenche ficha meio pronta e descobre depois que faltou pergunta.
// ============================================================================

const AnamneseModelos = () => {
  const navigate = useNavigate();
  const { clinicaId, carregando: carregandoCtx } = useTenant();

  const [modelos, setModelos] = useState<ModeloComContagem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [semeando, setSemeando] = useState(false);
  const [busca, setBusca] = useState("");

  const [abrirNovo, setAbrirNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [aExcluir, setAExcluir] = useState<ModeloComContagem | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const [abrirPreencher, setAbrirPreencher] = useState(false);
  const [pacientes, setPacientes] = useState<{ id: string; nome_completo: string }[]>([]);
  const [carregandoPacientes, setCarregandoPacientes] = useState(false);
  const [pacienteId, setPacienteId] = useState("");

  const carregar = useCallback(async () => {
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; }
    setCarregando(true);
    try {
      setModelos(await listarModelos(clinicaId));
    } catch (e: any) {
      toast.error("Erro ao carregar modelos", { description: e.message });
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, carregandoCtx]);

  useEffect(() => { carregar(); }, [carregar]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return modelos;
    return modelos.filter((m) =>
      `${m.nome} ${m.especialidade ?? ""}`.toLowerCase().includes(t));
  }, [modelos, busca]);

  const publicados = useMemo(() => modelos.filter((m) => m.publicado).length, [modelos]);
  const respostas = useMemo(() => modelos.reduce((s, m) => s + m.qtd_respostas, 0), [modelos]);

  const criar = async () => {
    if (!clinicaId) return;
    if (!nome.trim()) { toast.error("Dê um nome ao modelo"); return; }
    setSalvando(true);
    try {
      const m = await criarModelo(clinicaId, nome.trim(), especialidade.trim() || null);
      toast.success("Modelo criado", { description: "Agora escolha as perguntas do banco." });
      setAbrirNovo(false); setNome(""); setEspecialidade("");
      navigate(`/anamnese/modelos/${m.id}`);
    } catch (e: any) {
      toast.error("Erro ao criar modelo", { description: e.message });
    } finally {
      setSalvando(false);
    }
  };

  const semear = async () => {
    if (!clinicaId) return;
    setSemeando(true);
    try {
      const id = await semearModeloOdonto(clinicaId);
      const jaExistia = modelos.some((m) => m.id === id);
      toast.success(jaExistia ? "Modelo pronto já estava na clínica" : "Anamnese odontológica padrão criada");
      await carregar();
      navigate(`/anamnese/modelos/${id}`);
    } catch (e: any) {
      toast.error("Erro ao trazer o modelo pronto", { description: e.message });
    } finally {
      setSemeando(false);
    }
  };

  const alternarPublicado = async (m: ModeloComContagem, valor: boolean) => {
    if (!clinicaId) return;
    if (valor && m.qtd_perguntas === 0) {
      toast.error("Modelo sem perguntas", { description: "Selecione perguntas antes de publicar." });
      return;
    }
    setModelos((ant) => ant.map((x) => (x.id === m.id ? { ...x, publicado: valor } : x)));
    try {
      await atualizarModelo(clinicaId, m.id, { publicado: valor });
      toast.success(valor ? "Modelo publicado" : "Modelo despublicado");
    } catch (e: any) {
      setModelos((ant) => ant.map((x) => (x.id === m.id ? { ...x, publicado: !valor } : x)));
      toast.error("Erro ao mudar status", { description: e.message });
    }
  };

  const confirmarExclusao = async () => {
    if (!aExcluir || !clinicaId) return;
    setExcluindo(true);
    try {
      await excluirModelo(clinicaId, aExcluir.id);
      setModelos((ant) => ant.filter((m) => m.id !== aExcluir.id));
      toast.success("Modelo excluído");
    } catch (e: any) {
      toast.error("Erro ao excluir", { description: e.message });
    } finally {
      setExcluindo(false);
      setAExcluir(null);
    }
  };

  const abrirDialogPreencher = async () => {
    setAbrirPreencher(true);
    if (!clinicaId || pacientes.length) return;
    // sem esse estado o diálogo abre já dizendo "nenhum paciente cadastrado"
    // enquanto a query ainda está no ar — empty state falso
    setCarregandoPacientes(true);
    try {
      setPacientes(await listarPacientes(clinicaId) as any);
    } catch (e: any) {
      toast.error("Erro ao carregar pacientes", { description: e.message });
    } finally {
      setCarregandoPacientes(false);
    }
  };

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <ClipboardList className="h-6 w-6 text-brand-600" /> Anamnese
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                Monte a ficha marcando perguntas de um banco pronto. Publicado é o que a recepção consegue usar.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2" onClick={abrirDialogPreencher}>
                <UserPlus className="h-4 w-4" /> Preencher para paciente
              </Button>
              <Button variant="outline" className="gap-2" onClick={semear} disabled={semeando}>
                {semeando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Usar modelo pronto
              </Button>
              <Button className="bg-brand-600 hover:bg-brand-700 gap-2" onClick={() => setAbrirNovo(true)}>
                <Plus className="h-4 w-4" /> Novo Modelo
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {[
              { rot: "Modelos", val: String(modelos.length), sub: "fichas configuradas" },
              { rot: "Publicados", val: String(publicados), sub: "disponíveis pra preencher" },
              { rot: "Anamneses preenchidas", val: String(respostas), sub: "respostas guardadas" },
            ].map((k) => (
              <Card key={k.rot} className="border-gray-100">
                <CardContent className="p-5">
                  <p className="text-xs text-gray-500">{k.rot}</p>
                  <p className="text-xl font-bold mt-0.5 text-gray-900">{k.val}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {modelos.length > 0 && (
            <div className="relative mb-4 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar modelo por nome ou especialidade"
                     value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          )}

          <Card className="border-gray-100">
            <CardContent className="p-0">
              {carregando ? (
                <div className="flex justify-center p-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !clinicaId ? (
                <div className="text-center p-12">
                  <ClipboardList className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="font-medium text-gray-800">Sem clínica no contexto</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Entre com um usuário vinculado a uma clínica para ver os modelos de anamnese.
                  </p>
                </div>
              ) : modelos.length === 0 ? (
                <div className="text-center p-12">
                  <ClipboardList className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="font-medium text-gray-800">Nenhum modelo de anamnese ainda</p>
                  <p className="text-sm text-gray-500 mt-1 max-w-lg mx-auto">
                    Comece por “Usar modelo pronto” para trazer a anamnese odontológica padrão,
                    ou crie um modelo do zero e selecione perguntas do banco ({TOTAL_BANCO} disponíveis).
                  </p>
                  <div className="flex justify-center gap-2 mt-4">
                    <Button variant="outline" className="gap-2" onClick={semear} disabled={semeando}>
                      {semeando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Usar modelo pronto
                    </Button>
                    <Button className="bg-brand-600 hover:bg-brand-700 gap-2" onClick={() => setAbrirNovo(true)}>
                      <Plus className="h-4 w-4" /> Novo Modelo
                    </Button>
                  </div>
                </div>
              ) : visiveis.length === 0 ? (
                <div className="text-center p-12">
                  <Search className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="font-medium text-gray-800">Nada encontrado para “{busca}”</p>
                  <p className="text-sm text-gray-500 mt-1">Ajuste a busca para ver os modelos.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="text-left font-medium px-5 py-3">Modelo</th>
                        <th className="text-left font-medium px-5 py-3">Especialidade</th>
                        <th className="text-right font-medium px-5 py-3">Perguntas</th>
                        <th className="text-right font-medium px-5 py-3">Preenchidas</th>
                        <th className="text-left font-medium px-5 py-3">Criado</th>
                        <th className="text-left font-medium px-5 py-3">Publicado</th>
                        <th className="px-5 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {visiveis.map((m) => (
                        <tr key={m.id} className="border-b border-border/50 hover:bg-muted/40">
                          <td className="px-5 py-3">
                            <button className="font-medium text-gray-900 hover:text-brand-700 text-left"
                                    onClick={() => navigate(`/anamnese/modelos/${m.id}`)}>
                              {m.nome}
                            </button>
                            {m.qtd_perguntas === 0 && (
                              <p className="text-[11px] text-amber-600 mt-0.5">sem perguntas selecionadas</p>
                            )}
                          </td>
                          <td className="px-5 py-3 text-gray-600">{m.especialidade ?? "—"}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{m.qtd_perguntas}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{m.qtd_respostas}</td>
                          <td className="px-5 py-3 text-gray-600">{formatarData(m.created_at)}</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <Switch checked={m.publicado} onCheckedChange={(v) => alternarPublicado(m, v)} />
                              <Badge className={m.publicado
                                ? "bg-brand-100 text-brand-800 border-0"
                                : "bg-gray-100 text-gray-700 border-0"}>
                                {m.publicado ? "Publicado" : "Rascunho"}
                              </Badge>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" className="gap-1"
                                      onClick={() => navigate(`/anamnese/modelos/${m.id}`)}>
                                <Pencil className="h-4 w-4" /> Editar
                              </Button>
                              <Button size="sm" variant="ghost"
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => setAExcluir(m)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-gray-400 mt-4 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            O banco traz {TOTAL_BANCO} perguntas prontas, incluindo PHQ-9, GAD-7 e escala de dor.
          </p>
        </div>
      </main>

      {/* novo modelo */}
      <Dialog open={abrirNovo} onOpenChange={setAbrirNovo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo modelo de anamnese</DialogTitle>
            <DialogDescription>
              Depois de criar você escolhe as perguntas no banco — leva poucos minutos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="nome-modelo">Nome do modelo</Label>
              <Input id="nome-modelo" value={nome} onChange={(e) => setNome(e.target.value)}
                     placeholder="Ex: Anamnese de Ortodontia" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="esp-modelo">Especialidade (opcional)</Label>
              <Input id="esp-modelo" value={especialidade} onChange={(e) => setEspecialidade(e.target.value)}
                     placeholder="Ex: Ortodontia" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbrirNovo(false)}>Cancelar</Button>
            <Button className="bg-brand-600 hover:bg-brand-700 gap-2" onClick={criar} disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Criar modelo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* escolher paciente pra preencher */}
      <Dialog open={abrirPreencher} onOpenChange={setAbrirPreencher}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preencher anamnese</DialogTitle>
            <DialogDescription>Escolha o paciente que vai responder.</DialogDescription>
          </DialogHeader>
          {carregandoPacientes ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : pacientes.length === 0 ? (
            <p className="text-sm text-gray-500">
              Nenhum paciente ativo cadastrado. Cadastre o paciente antes de preencher a anamnese.
            </p>
          ) : (
            <Select value={pacienteId} onValueChange={setPacienteId}>
              <SelectTrigger><SelectValue placeholder="Selecione o paciente" /></SelectTrigger>
              <SelectContent>
                {pacientes.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome_completo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbrirPreencher(false)}>Cancelar</Button>
            <Button className="bg-brand-600 hover:bg-brand-700" disabled={!pacienteId}
                    onClick={() => navigate(`/anamnese/preencher/${pacienteId}`)}>
              Abrir formulário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!aExcluir} onOpenChange={(o) => !o && setAExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{aExcluir?.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>
              As {aExcluir?.qtd_perguntas ?? 0} perguntas do modelo saem junto.
              {(aExcluir?.qtd_respostas ?? 0) > 0 && (
                <> Este modelo já tem {aExcluir?.qtd_respostas} anamnese(s) preenchida(s) —
                  o histórico do paciente perde a referência do formulário.</>
              )} Não dá pra desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={(e) => { e.preventDefault(); confirmarExclusao(); }}>
              {excluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AnamneseModelos;
