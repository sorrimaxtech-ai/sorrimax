import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  FileSignature, Plus, Loader2, Sparkles, Trash2, Pencil, Search, Copy,
  Printer, ShieldCheck, Braces, FileText,
} from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "sonner";
import {
  listarModelos, listarEmitidos, contarEmitidos, criarModelo, duplicarModelo, excluirModelo,
  excluirEmitido, semearModelosPadrao, imprimirHtml, dataHoraBr,
  TIPOS_DOCUMENTO, ROTULO_TIPO, CLASSE_TIPO,
  type ModeloComContagem, type EmitidoComRelacoes, type TipoDocumento,
} from "@/services/documentos";

// ============================================================================
// Documentos — modelos e emissões
// ----------------------------------------------------------------------------
// O valor da tela não é "guardar texto", é o modelo já vir com merge field:
// atestado, declaração e recibo saem preenchidos com dado do cadastro em vez
// da linha "______" preenchida à mão. Por isso o card mostra quantas variáveis
// o modelo usa — é o indicador de que ele está automatizado de verdade.
// ============================================================================

const Documentos = () => {
  const navigate = useNavigate();
  const { clinicaId, carregando: carregandoCtx } = useTenant();

  const [modelos, setModelos] = useState<ModeloComContagem[]>([]);
  const [emitidos, setEmitidos] = useState<EmitidoComRelacoes[]>([]);
  // KPIs vêm de count no banco: a lista é limitada e contar em cima dela mente.
  const [totalEmitidos, setTotalEmitidos] = useState(0);
  const [emitidosNoMes, setEmitidosNoMes] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [semeando, setSemeando] = useState(false);
  const [busca, setBusca] = useState("");

  const [abrirNovo, setAbrirNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoDocumento>("atestado");
  const [salvando, setSalvando] = useState(false);

  const [modeloAExcluir, setModeloAExcluir] = useState<ModeloComContagem | null>(null);
  const [emitidoAExcluir, setEmitidoAExcluir] = useState<EmitidoComRelacoes | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; }
    setCarregando(true);
    try {
      const agora = new Date();
      const inicioDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
      const [ms, es, total, doMes] = await Promise.all([
        listarModelos(clinicaId),
        listarEmitidos(clinicaId),
        contarEmitidos(clinicaId),
        contarEmitidos(clinicaId, inicioDoMes),
      ]);
      setModelos(ms);
      setEmitidos(es);
      setTotalEmitidos(total);
      setEmitidosNoMes(doMes);
    } catch (e: any) {
      toast.error("Erro ao carregar documentos", { description: e.message });
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, carregandoCtx]);

  useEffect(() => { carregar(); }, [carregar]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return modelos;
    return modelos.filter((m) => `${m.nome} ${ROTULO_TIPO[m.tipo] ?? m.tipo}`.toLowerCase().includes(t));
  }, [modelos, busca]);

  const totalVariaveis = useMemo(
    () => modelos.reduce((s, m) => s + m.variaveis.length, 0),
    [modelos],
  );

  const semear = async () => {
    if (!clinicaId) return;
    setSemeando(true);
    try {
      await semearModelosPadrao(clinicaId);
      await carregar();
      toast.success("Modelos padrão prontos", {
        description: "Atestado, declaração, recibo, encaminhamento e termo de consentimento.",
      });
    } catch (e: any) {
      toast.error("Erro ao trazer os modelos padrão", { description: e.message });
    } finally {
      setSemeando(false);
    }
  };

  const criar = async () => {
    if (!clinicaId) return;
    if (nome.trim().length < 3) {
      toast.error("Nome muito curto", { description: "Use pelo menos 3 caracteres." });
      return;
    }
    setSalvando(true);
    try {
      const m = await criarModelo(clinicaId, nome.trim(), tipo);
      toast.success("Modelo criado", { description: "Agora escreva o texto e insira as variáveis." });
      setAbrirNovo(false); setNome(""); setTipo("atestado");
      navigate(`/documentos/modelos/${m.id}`);
    } catch (e: any) {
      toast.error("Erro ao criar modelo", { description: e.message });
    } finally {
      setSalvando(false);
    }
  };

  const duplicar = async (m: ModeloComContagem) => {
    if (!clinicaId) return;
    try {
      const copia = await duplicarModelo(clinicaId, m);
      toast.success("Cópia criada", { description: copia.nome });
      navigate(`/documentos/modelos/${copia.id}`);
    } catch (e: any) {
      toast.error("Erro ao duplicar", { description: e.message });
    }
  };

  const confirmarExclusaoModelo = async () => {
    if (!modeloAExcluir || !clinicaId) return;
    setExcluindo(true);
    try {
      await excluirModelo(clinicaId, modeloAExcluir.id);
      setModelos((ant) => ant.filter((m) => m.id !== modeloAExcluir.id));
      toast.success("Modelo excluído");
    } catch (e: any) {
      toast.error("Erro ao excluir", { description: e.message });
    } finally {
      setExcluindo(false);
      setModeloAExcluir(null);
    }
  };

  const confirmarExclusaoEmitido = async () => {
    if (!emitidoAExcluir || !clinicaId) return;
    setExcluindo(true);
    try {
      await excluirEmitido(clinicaId, emitidoAExcluir.id);
      setEmitidos((ant) => ant.filter((e) => e.id !== emitidoAExcluir.id));
      setTotalEmitidos((n) => Math.max(0, n - 1));
      setEmitidosNoMes((n) => {
        const d = new Date(emitidoAExcluir.emitido_em);
        const agora = new Date();
        const noMes = d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
        return noMes ? Math.max(0, n - 1) : n;
      });
      toast.success("Documento removido do histórico");
    } catch (e: any) {
      toast.error("Erro ao excluir", { description: e.message });
    } finally {
      setExcluindo(false);
      setEmitidoAExcluir(null);
    }
  };

  const semClinica = !carregandoCtx && !clinicaId;

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-4 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <FileSignature className="h-6 w-6 text-emerald-600" /> Documentos
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                Atestado, declaração e recibo saem preenchidos com o dado do cadastro — sem linha em branco.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2" onClick={semear}
                      disabled={semeando || !clinicaId}>
                {semeando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Trazer modelos padrão
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                      onClick={() => setAbrirNovo(true)} disabled={!clinicaId}>
                <Plus className="h-4 w-4" /> Novo modelo
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {[
              { rot: "Modelos", val: String(modelos.length), sub: "prontos pra emitir" },
              { rot: "Variáveis automatizadas", val: String(totalVariaveis), sub: "campos preenchidos sozinhos" },
              { rot: "Emitidos no mês", val: String(emitidosNoMes), sub: `${totalEmitidos} no histórico` },
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

          {carregando ? (
            <Card className="border-gray-100">
              <CardContent className="flex justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : semClinica ? (
            <Card className="border-gray-100">
              <CardContent className="text-center p-12">
                <FileSignature className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="font-medium text-gray-800">Sem clínica no contexto</p>
                <p className="text-sm text-gray-500 mt-1">
                  Entre com um usuário vinculado a uma clínica para ver os modelos de documento.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="modelos">
              <TabsList className="mb-4">
                <TabsTrigger value="modelos">Modelos ({modelos.length})</TabsTrigger>
                <TabsTrigger value="emitidos">Emitidos ({totalEmitidos})</TabsTrigger>
              </TabsList>

              <TabsContent value="modelos">
                {modelos.length > 0 && (
                  <div className="relative mb-4 max-w-md">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Buscar modelo por nome ou tipo"
                           value={busca} onChange={(e) => setBusca(e.target.value)} />
                  </div>
                )}

                {modelos.length === 0 ? (
                  <Card className="border-gray-100">
                    <CardContent className="text-center p-12">
                      <FileSignature className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                      <p className="font-medium text-gray-800">Nenhum modelo de documento ainda</p>
                      <p className="text-sm text-gray-500 mt-1 max-w-lg mx-auto">
                        Clique em “Trazer modelos padrão” para começar com atestado, declaração de
                        comparecimento, recibo, encaminhamento e termo de consentimento — todos já com
                        as variáveis do paciente e da clínica. Depois é só ajustar o texto.
                      </p>
                      <div className="flex flex-wrap justify-center gap-2 mt-4">
                        <Button variant="outline" className="gap-2" onClick={semear} disabled={semeando}>
                          {semeando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                          Trazer modelos padrão
                        </Button>
                        <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                                onClick={() => setAbrirNovo(true)}>
                          <Plus className="h-4 w-4" /> Criar do zero
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : visiveis.length === 0 ? (
                  <Card className="border-gray-100">
                    <CardContent className="text-center p-12">
                      <Search className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                      <p className="font-medium text-gray-800">Nada encontrado para “{busca}”</p>
                      <p className="text-sm text-gray-500 mt-1">Ajuste a busca para ver os modelos.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {visiveis.map((m) => (
                      <Card key={m.id} className="border-gray-100 flex flex-col">
                        <CardContent className="p-5 flex flex-col gap-3 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <button className="text-left font-medium text-gray-900 hover:text-emerald-700"
                                    onClick={() => navigate(`/documentos/modelos/${m.id}`)}>
                              {m.nome}
                            </button>
                            <Badge className={CLASSE_TIPO[m.tipo] ?? CLASSE_TIPO.outro}>
                              {ROTULO_TIPO[m.tipo] ?? m.tipo}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Braces className="h-3.5 w-3.5" /> {m.variaveis.length} variáveis
                            </span>
                            <span className="flex items-center gap-1">
                              <Printer className="h-3.5 w-3.5" /> {m.qtd_emitidos} emitidos
                            </span>
                            {m.sistema && (
                              <span className="flex items-center gap-1 text-emerald-700">
                                <ShieldCheck className="h-3.5 w-3.5" /> padrão
                              </span>
                            )}
                          </div>

                          {m.variaveis.length === 0 && (
                            <p className="text-[11px] text-amber-600">
                              Sem variáveis: esse modelo ainda precisa ser preenchido à mão.
                            </p>
                          )}

                          <div className="flex flex-wrap gap-1 mt-auto pt-2">
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1"
                                    onClick={() => navigate(`/documentos/modelos/${m.id}?emitir=1`)}>
                              <Printer className="h-4 w-4" /> Emitir
                            </Button>
                            <Button size="sm" variant="ghost" className="gap-1"
                                    onClick={() => navigate(`/documentos/modelos/${m.id}`)}>
                              <Pencil className="h-4 w-4" /> Editar
                            </Button>
                            <Button size="sm" variant="ghost" className="gap-1" onClick={() => duplicar(m)}>
                              <Copy className="h-4 w-4" /> Duplicar
                            </Button>
                            <Button size="sm" variant="ghost"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 ml-auto"
                                    onClick={() => setModeloAExcluir(m)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="emitidos">
                <Card className="border-gray-100">
                  <CardContent className="p-0">
                    {emitidos.length === 0 ? (
                      <div className="text-center p-12">
                        <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                        <p className="font-medium text-gray-800">Nenhum documento emitido ainda</p>
                        <p className="text-sm text-gray-500 mt-1 max-w-lg mx-auto">
                          Abra um modelo, escolha o paciente e clique em “Emitir e imprimir”. O documento
                          fica guardado aqui com o texto exato que foi impresso.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="text-left font-medium px-5 py-3">Paciente</th>
                              <th className="text-left font-medium px-5 py-3">Documento</th>
                              <th className="text-left font-medium px-5 py-3">Emitido em</th>
                              <th className="text-left font-medium px-5 py-3">Integridade</th>
                              <th className="px-5 py-3" />
                            </tr>
                          </thead>
                          <tbody>
                            {emitidos.map((e) => (
                              <tr key={e.id} className="border-b border-border/50 hover:bg-muted/40">
                                <td className="px-5 py-3 font-medium text-gray-900">
                                  {e.paciente_nome ?? "Paciente removido"}
                                </td>
                                <td className="px-5 py-3">
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-700">{e.modelo_nome ?? "Modelo removido"}</span>
                                    {e.modelo_tipo && (
                                      <Badge className={CLASSE_TIPO[e.modelo_tipo] ?? CLASSE_TIPO.outro}>
                                        {ROTULO_TIPO[e.modelo_tipo] ?? e.modelo_tipo}
                                      </Badge>
                                    )}
                                  </div>
                                </td>
                                <td className="px-5 py-3 text-gray-600">{dataHoraBr(e.emitido_em)}</td>
                                <td className="px-5 py-3">
                                  {e.hash ? (
                                    <span className="font-mono text-[11px] text-gray-500"
                                          title={`SHA-256: ${e.hash}`}>
                                      {e.hash.slice(0, 12)}…
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-gray-400">sem hash</span>
                                  )}
                                </td>
                                <td className="px-5 py-3">
                                  <div className="flex justify-end gap-1">
                                    <Button size="sm" variant="ghost" className="gap-1"
                                            onClick={() => imprimirHtml(
                                              e.conteudo_final_html,
                                              `${e.modelo_nome ?? "Documento"} - ${e.paciente_nome ?? ""}`,
                                            )}>
                                      <Printer className="h-4 w-4" /> Imprimir
                                    </Button>
                                    <Button size="sm" variant="ghost"
                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                            onClick={() => setEmitidoAExcluir(e)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {totalEmitidos > emitidos.length && (
                          <p className="px-5 py-3 text-xs text-gray-500 border-t border-border/50">
                            Mostrando os {emitidos.length} documentos mais recentes de {totalEmitidos}.
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </main>

      {/* novo modelo */}
      <Dialog open={abrirNovo} onOpenChange={setAbrirNovo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo modelo de documento</DialogTitle>
            <DialogDescription>
              Depois de criar você escreve o texto e clica nas variáveis pra inserir os dados automáticos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="doc-nome">Nome do modelo</Label>
              <Input id="doc-nome" value={nome} onChange={(e) => setNome(e.target.value)}
                     placeholder="Ex: Atestado de comparecimento — 1 dia" />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoDocumento)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_DOCUMENTO.map((t) => (
                    <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbrirNovo(false)}>Cancelar</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={criar} disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Criar modelo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* excluir modelo */}
      <AlertDialog open={!!modeloAExcluir} onOpenChange={(o) => !o && setModeloAExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{modeloAExcluir?.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>
              O modelo some da lista. Os {modeloAExcluir?.qtd_emitidos ?? 0} documentos já emitidos
              continuam guardados como foram impressos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
                               onClick={(ev) => { ev.preventDefault(); confirmarExclusaoModelo(); }}
                               disabled={excluindo}>
              {excluindo ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* excluir emitido */}
      <AlertDialog open={!!emitidoAExcluir} onOpenChange={(o) => !o && setEmitidoAExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover documento do histórico?</AlertDialogTitle>
            <AlertDialogDescription>
              O documento emitido para {emitidoAExcluir?.paciente_nome ?? "o paciente"} some do
              prontuário. Se já foi entregue assinado, a via impressa continua valendo — só o registro
              digital é apagado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
                               onClick={(ev) => { ev.preventDefault(); confirmarExclusaoEmitido(); }}
                               disabled={excluindo}>
              {excluindo ? "Removendo…" : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Documentos;
