import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Loader2, Save, Trash2, Plus, X, ChevronUp, ChevronDown,
  ClipboardList, GitBranch, Star, Gauge, ListChecks,
} from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "sonner";
import {
  obterModelo, listarPerguntas, atualizarModelo, aplicarSelecaoDoBanco,
  criarPerguntas, excluirPerguntas, atualizarPergunta, trocarOrdem,
  BANCO_PERGUNTAS, ITENS_POR_ENUNCIADO, ITENS_POR_CHAVE, TOTAL_BANCO,
  TIPOS_PERGUNTA, ROTULO_TIPO, OPERADORES,
  type AnamneseModelo, type AnamnesePergunta, type TipoPergunta,
  type OperadorCondicional, type ValorResposta,
} from "@/services/anamnese";

// ============================================================================
// Editor de modelo de anamnese
// ----------------------------------------------------------------------------
// Construtor por BANCO + CHECKBOX (não drag-and-drop). A clínica não quer
// desenhar formulário, quer ter anamnese hoje: marca o que usa, salva, pronto.
// Quem precisa de algo fora do catálogo usa o bloco de pergunta personalizada,
// que é onde ficam os tipos avançados — escala, opções e condicional.
// ============================================================================

const CATEGORIA_PERSONALIZADA = "Perguntas personalizadas";

/** Tipos que podem servir de gatilho: precisam guardar uma resposta comparável. */
const TIPOS_GATILHO: TipoPergunta[] = [
  "sim_nao", "selecao_unica", "multipla_escolha", "numero", "escala", "texto",
];

const AnamneseEditor = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { clinicaId, carregando: carregandoCtx } = useTenant();

  const [modelo, setModelo] = useState<AnamneseModelo | null>(null);
  const [perguntas, setPerguntas] = useState<AnamnesePergunta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvandoModelo, setSalvandoModelo] = useState(false);
  const [salvandoSelecao, setSalvandoSelecao] = useState(false);
  const [reordenando, setReordenando] = useState(false);

  const [nome, setNome] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());

  const [aExcluir, setAExcluir] = useState<AnamnesePergunta | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  // ---------------------------------------------- formulário de pergunta nova
  const [novoEnunciado, setNovoEnunciado] = useState("");
  const [novoTipo, setNovoTipo] = useState<TipoPergunta>("texto");
  const [novaCategoria, setNovaCategoria] = useState(CATEGORIA_PERSONALIZADA);
  const [novaObrigatoria, setNovaObrigatoria] = useState(false);
  const [novoPeso, setNovoPeso] = useState("");
  const [novasOpcoes, setNovasOpcoes] = useState<string[]>(["", ""]);
  const [escMin, setEscMin] = useState("0");
  const [escMax, setEscMax] = useState("10");
  const [escRotMin, setEscRotMin] = useState("");
  const [escRotMax, setEscRotMax] = useState("");
  const [condAtiva, setCondAtiva] = useState(false);
  const [condGatilho, setCondGatilho] = useState("");
  const [condOperador, setCondOperador] = useState<OperadorCondicional>("igual");
  const [condValor, setCondValor] = useState("");
  const [criandoPergunta, setCriandoPergunta] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) { setCarregando(false); return; }
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; }
    setCarregando(true);
    try {
      const [m, ps] = await Promise.all([obterModelo(clinicaId, id), listarPerguntas(clinicaId, id)]);
      setModelo(m);
      setNome(m?.nome ?? "");
      setEspecialidade(m?.especialidade ?? "");
      setPerguntas(ps);
      // a seleção do banco é reconstruída do que já está salvo no modelo
      setSel(new Set(ps.map((p) => ITENS_POR_ENUNCIADO.get(p.enunciado)?.chave).filter(Boolean) as string[]));
    } catch (e: any) {
      toast.error("Erro ao carregar modelo", { description: e.message });
    } finally {
      setCarregando(false);
    }
  }, [id, clinicaId, carregandoCtx]);

  useEffect(() => { carregar(); }, [carregar]);

  const chavesSalvas = useMemo(
    () => new Set(perguntas.map((p) => ITENS_POR_ENUNCIADO.get(p.enunciado)?.chave).filter(Boolean) as string[]),
    [perguntas],
  );

  const alteracoes = useMemo(() => {
    let n = 0;
    sel.forEach((c) => { if (!chavesSalvas.has(c)) n++; });
    chavesSalvas.forEach((c) => { if (!sel.has(c)) n++; });
    return n;
  }, [sel, chavesSalvas]);

  const personalizadas = useMemo(
    () => perguntas.filter((p) => !ITENS_POR_ENUNCIADO.has(p.enunciado)),
    [perguntas],
  );

  const dadosMudaram = modelo
    ? nome.trim() !== modelo.nome || (especialidade.trim() || null) !== (modelo.especialidade ?? null)
    : false;

  // ---------------------------------------------------------------- seleção
  const alternar = (chave: string, marcado: boolean) => {
    setSel((ant) => {
      const nova = new Set(ant);
      if (marcado) {
        nova.add(chave);
        // pergunta condicional sem o gatilho vira pergunta solta — puxa o gatilho junto
        const dep = ITENS_POR_CHAVE.get(chave)?.depende_de?.chave;
        if (dep) nova.add(dep);
      } else {
        nova.delete(chave);
        // ao tirar o gatilho, quem dependia dele iria aparecer sempre: sai junto
        ITENS_POR_CHAVE.forEach((item, k) => {
          if (item.depende_de?.chave === chave) nova.delete(k);
        });
      }
      return nova;
    });
  };

  const marcarCategoria = (categoria: string, marcar: boolean) => {
    const chaves = BANCO_PERGUNTAS.find((c) => c.categoria === categoria)?.itens.map((i) => i.chave) ?? [];
    setSel((ant) => {
      const nova = new Set(ant);
      chaves.forEach((c) => (marcar ? nova.add(c) : nova.delete(c)));
      return nova;
    });
  };

  const marcarTudo = (marcar: boolean) => {
    setSel(marcar ? new Set(BANCO_PERGUNTAS.flatMap((c) => c.itens.map((i) => i.chave))) : new Set());
  };

  const salvarSelecao = async () => {
    if (!clinicaId || !id) return;
    setSalvandoSelecao(true);
    try {
      const r = await aplicarSelecaoDoBanco(clinicaId, id, sel, perguntas);
      setPerguntas(await listarPerguntas(clinicaId, id));
      toast.success("Perguntas atualizadas", {
        description: `${r.inseridas} adicionada(s), ${r.removidas} removida(s).`,
      });
    } catch (e: any) {
      toast.error("Erro ao salvar perguntas", { description: e.message });
    } finally {
      setSalvandoSelecao(false);
    }
  };

  // ------------------------------------------------------------ modelo (meta)
  const salvarModelo = async () => {
    if (!clinicaId || !id) return;
    if (!nome.trim()) { toast.error("O modelo precisa de um nome"); return; }
    setSalvandoModelo(true);
    try {
      await atualizarModelo(clinicaId, id, { nome: nome.trim(), especialidade: especialidade.trim() || null });
      setModelo((m) => (m ? { ...m, nome: nome.trim(), especialidade: especialidade.trim() || null } : m));
      toast.success("Modelo salvo");
    } catch (e: any) {
      toast.error("Erro ao salvar modelo", { description: e.message });
    } finally {
      setSalvandoModelo(false);
    }
  };

  const alternarPublicado = async (valor: boolean) => {
    if (!clinicaId || !id || !modelo) return;
    if (valor && perguntas.length === 0) {
      toast.error("Modelo sem perguntas", { description: "Selecione ao menos uma pergunta antes de publicar." });
      return;
    }
    const anterior = modelo.publicado;
    setModelo({ ...modelo, publicado: valor });
    try {
      await atualizarModelo(clinicaId, id, { publicado: valor });
      toast.success(valor ? "Modelo publicado" : "Modelo despublicado");
    } catch (e: any) {
      setModelo({ ...modelo, publicado: anterior });
      toast.error("Erro ao mudar status", { description: e.message });
    }
  };

  // ------------------------------------------------------- pergunta customizada
  const precisaOpcoes = novoTipo === "selecao_unica" || novoTipo === "multipla_escolha";
  const gatilhosDisponiveis = perguntas.filter((p) => TIPOS_GATILHO.includes(p.tipo));
  const gatilhoEscolhido = gatilhosDisponiveis.find((p) => p.id === condGatilho) ?? null;

  const limparFormulario = () => {
    setNovoEnunciado(""); setNovoTipo("texto"); setNovaCategoria(CATEGORIA_PERSONALIZADA);
    setNovaObrigatoria(false); setNovoPeso(""); setNovasOpcoes(["", ""]);
    setEscMin("0"); setEscMax("10"); setEscRotMin(""); setEscRotMax("");
    setCondAtiva(false); setCondGatilho(""); setCondOperador("igual"); setCondValor("");
  };

  const criarPersonalizada = async () => {
    if (!clinicaId || !id) return;
    if (!novoEnunciado.trim()) { toast.error("Escreva o enunciado da pergunta"); return; }

    const opcoes = novasOpcoes.map((o) => o.trim()).filter(Boolean);
    if (precisaOpcoes && opcoes.length < 2) {
      toast.error("Faltam opções", { description: "Esse tipo precisa de pelo menos duas opções." });
      return;
    }

    let escala = null as null | { min: number; max: number; passo: number; rotulo_min?: string; rotulo_max?: string };
    if (novoTipo === "escala") {
      const min = Number(escMin), max = Number(escMax);
      if (Number.isNaN(min) || Number.isNaN(max) || max <= min) {
        toast.error("Escala inválida", { description: "O máximo precisa ser maior que o mínimo." });
        return;
      }
      escala = { min, max, passo: 1, rotulo_min: escRotMin.trim() || undefined, rotulo_max: escRotMax.trim() || undefined };
    }

    let condicional = null as null | { pergunta_id: string; operador: OperadorCondicional; valor: ValorResposta };
    if (condAtiva) {
      if (!condGatilho) { toast.error("Escolha a pergunta-gatilho"); return; }
      const bruto = condValor.trim();
      if (!bruto) { toast.error("Informe o valor que dispara a pergunta"); return; }
      const numerico = gatilhoEscolhido?.tipo === "numero" || gatilhoEscolhido?.tipo === "escala";
      if (numerico && Number.isNaN(Number(bruto))) {
        // sem isso o NaN virava `null` no JSON e a condicional nunca mais batia
        toast.error("Valor inválido", { description: "O gatilho é numérico — informe um número." });
        return;
      }
      const valor: ValorResposta =
        gatilhoEscolhido?.tipo === "sim_nao" ? bruto === "true"
          : numerico ? Number(bruto)
            : bruto;
      condicional = { pergunta_id: condGatilho, operador: condOperador, valor };
    }

    const peso = novoPeso.trim() === "" ? null : Number(novoPeso);
    if (peso !== null && Number.isNaN(peso)) { toast.error("Peso de score inválido"); return; }

    setCriandoPergunta(true);
    try {
      await criarPerguntas(clinicaId, id, [{
        categoria: novaCategoria.trim() || CATEGORIA_PERSONALIZADA,
        enunciado: novoEnunciado.trim(),
        tipo: novoTipo,
        obrigatoria: novaObrigatoria,
        opcoes: precisaOpcoes ? opcoes : null,
        escala,
        condicional,
        peso_score: peso,
        ordem: (perguntas.reduce((m, p) => Math.max(m, p.ordem), 0) || 0) + 1,
      }]);
      setPerguntas(await listarPerguntas(clinicaId, id));
      limparFormulario();
      toast.success("Pergunta adicionada ao modelo");
    } catch (e: any) {
      toast.error("Erro ao criar pergunta", { description: e.message });
    } finally {
      setCriandoPergunta(false);
    }
  };

  // -------------------------------------------------------- ações por pergunta
  const alternarObrigatoria = async (p: AnamnesePergunta, valor: boolean) => {
    if (!clinicaId) return;
    setPerguntas((ant) => ant.map((x) => (x.id === p.id ? { ...x, obrigatoria: valor } : x)));
    try {
      await atualizarPergunta(clinicaId, p.id, { obrigatoria: valor });
    } catch (e: any) {
      setPerguntas((ant) => ant.map((x) => (x.id === p.id ? { ...x, obrigatoria: !valor } : x)));
      toast.error("Erro ao atualizar pergunta", { description: e.message });
    }
  };

  const mover = async (indice: number, direcao: -1 | 1) => {
    const alvo = indice + direcao;
    if (alvo < 0 || alvo >= perguntas.length || reordenando) return;
    const a = perguntas[indice], b = perguntas[alvo];
    const copia = [...perguntas];
    copia[indice] = { ...b, ordem: a.ordem };
    copia[alvo] = { ...a, ordem: b.ordem };
    setPerguntas(copia);
    setReordenando(true);
    try {
      await trocarOrdem(a, b);
    } catch (e: any) {
      setPerguntas(perguntas);
      toast.error("Erro ao reordenar", { description: e.message });
    } finally {
      setReordenando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!aExcluir || !clinicaId) return;
    setExcluindo(true);
    try {
      await excluirPerguntas(clinicaId, [aExcluir.id]);
      setPerguntas((ant) => ant.filter((p) => p.id !== aExcluir.id));
      const chave = ITENS_POR_ENUNCIADO.get(aExcluir.enunciado)?.chave;
      if (chave) setSel((ant) => { const n = new Set(ant); n.delete(chave); return n; });
      toast.success("Pergunta removida");
    } catch (e: any) {
      toast.error("Erro ao remover pergunta", { description: e.message });
    } finally {
      setExcluindo(false);
      setAExcluir(null);
    }
  };

  const enunciadoPorId = useMemo(
    () => new Map(perguntas.map((p) => [p.id, p.enunciado])),
    [perguntas],
  );

  // ------------------------------------------------------------------ render
  if (carregando) {
    return (
      <div className="flex min-h-full bg-gray-50">
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!modelo) {
    return (
      <div className="flex min-h-full bg-gray-50">
        <main className="flex-1 min-w-0 overflow-auto">
          <div className="p-8 text-center max-w-lg mx-auto mt-16">
            <ClipboardList className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="font-medium text-gray-800">Modelo não encontrado</p>
            <p className="text-sm text-gray-500 mt-1">
              Ele pode ter sido excluído ou pertence a outra clínica.
            </p>
            <Button variant="outline" className="mt-4 gap-2" onClick={() => navigate("/anamnese/modelos")}>
              <ArrowLeft className="h-4 w-4" /> Voltar para os modelos
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-8">
          <Button variant="ghost" className="gap-2 mb-3 -ml-2" onClick={() => navigate("/anamnese/modelos")}>
            <ArrowLeft className="h-4 w-4" /> Modelos de anamnese
          </Button>

          {/* cabeçalho / metadados */}
          <Card className="border-gray-100 mb-6">
            <CardContent className="p-5">
              <div className="flex flex-col lg:flex-row lg:items-end gap-4">
                <div className="flex-1">
                  <Label htmlFor="nome">Nome do modelo</Label>
                  <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} className="mt-1" />
                </div>
                <div className="flex-1">
                  <Label htmlFor="esp">Especialidade</Label>
                  <Input id="esp" value={especialidade} onChange={(e) => setEspecialidade(e.target.value)}
                         placeholder="Opcional" className="mt-1" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={modelo.publicado} onCheckedChange={alternarPublicado} />
                    <Badge className={modelo.publicado
                      ? "bg-emerald-100 text-emerald-800 border-0"
                      : "bg-gray-100 text-gray-700 border-0"}>
                      {modelo.publicado ? "Publicado" : "Rascunho"}
                    </Badge>
                  </div>
                  <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                          onClick={salvarModelo} disabled={salvandoModelo || !dadosMudaram}>
                    {salvandoModelo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar
                  </Button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Só modelo publicado aparece na tela de preencher. {perguntas.length} pergunta(s) no formulário.
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            {/* ------------------------------------------------ banco de perguntas */}
            <div className="xl:col-span-3 space-y-6">
              <Card className="border-gray-100">
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                        <ListChecks className="h-5 w-5 text-emerald-600" /> Banco de perguntas
                      </h2>
                      <p className="text-sm text-gray-600 mt-0.5">
                        <span className="font-medium text-emerald-700">{sel.size} de {TOTAL_BANCO} selecionadas</span>
                        {" · "}marque o que sua clínica usa e salve.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => marcarTudo(true)}>Selecionar tudo</Button>
                      <Button size="sm" variant="outline" onClick={() => marcarTudo(false)}>Limpar</Button>
                    </div>
                  </div>

                  <Accordion type="multiple" defaultValue={[BANCO_PERGUNTAS[0].categoria]} className="w-full">
                    {BANCO_PERGUNTAS.map((cat) => {
                      const marcadas = cat.itens.filter((i) => sel.has(i.chave)).length;
                      return (
                        <AccordionItem key={cat.categoria} value={cat.categoria}>
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center gap-3 text-left">
                              <span className="font-medium text-gray-900">{cat.categoria}</span>
                              <Badge className={marcadas > 0
                                ? "bg-emerald-100 text-emerald-800 border-0"
                                : "bg-gray-100 text-gray-600 border-0"}>
                                {marcadas} de {cat.itens.length}
                              </Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <p className="text-xs text-gray-500 mb-3">{cat.descricao}</p>
                            <div className="flex gap-2 mb-3">
                              <Button size="sm" variant="ghost" className="h-7 text-xs"
                                      onClick={() => marcarCategoria(cat.categoria, true)}>
                                Selecionar tudo
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs"
                                      onClick={() => marcarCategoria(cat.categoria, false)}>
                                Limpar
                              </Button>
                            </div>
                            <div className="space-y-2">
                              {cat.itens.map((item) => {
                                const marcado = sel.has(item.chave);
                                const gatilho = item.depende_de
                                  ? ITENS_POR_CHAVE.get(item.depende_de.chave)?.enunciado
                                  : null;
                                return (
                                  <label key={item.chave}
                                         className={`flex gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                                           marcado ? "border-emerald-200 bg-emerald-50/60" : "border-gray-100 hover:bg-muted/40"}`}>
                                    <Checkbox className="mt-0.5" checked={marcado}
                                              onCheckedChange={(v) => alternar(item.chave, v === true)} />
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm text-gray-900">{item.enunciado}</p>
                                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                        <Badge className="bg-gray-100 text-gray-700 border-0 text-[10px]">
                                          {ROTULO_TIPO[item.tipo]}
                                        </Badge>
                                        {item.obrigatoria && (
                                          <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px]">
                                            obrigatória
                                          </Badge>
                                        )}
                                        {!!item.peso_score && (
                                          <Badge className="bg-sky-100 text-sky-800 border-0 text-[10px]">
                                            peso {item.peso_score}
                                          </Badge>
                                        )}
                                        {gatilho && (
                                          <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                            <GitBranch className="h-3 w-3" /> aparece se: {gatilho}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>

                  <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-gray-100">
                    <p className="text-sm text-gray-600">
                      {alteracoes === 0 ? "Nenhuma alteração pendente." : `${alteracoes} alteração(ões) pendente(s).`}
                    </p>
                    <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                            onClick={salvarSelecao} disabled={salvandoSelecao || alteracoes === 0}>
                      {salvandoSelecao ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Salvar seleção
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* ------------------------------------------ pergunta personalizada */}
              <Card className="border-gray-100">
                <CardContent className="p-5">
                  <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-1">
                    <Plus className="h-5 w-5 text-emerald-600" /> Criar pergunta personalizada
                  </h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Para o que o banco não cobre. Salva direto no modelo, sem passar pela seleção.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="enunciado">Enunciado</Label>
                      <Textarea id="enunciado" value={novoEnunciado} rows={2} className="mt-1"
                                onChange={(e) => setNovoEnunciado(e.target.value)}
                                placeholder="Ex: Faz uso de placa de bruxismo fornecida por outra clínica?" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>Tipo de resposta</Label>
                        <Select value={novoTipo} onValueChange={(v) => setNovoTipo(v as TipoPergunta)}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TIPOS_PERGUNTA.map((t) => (
                              <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-gray-400 mt-1">
                          {TIPOS_PERGUNTA.find((t) => t.valor === novoTipo)?.ajuda}
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="cat">Categoria</Label>
                        <Input id="cat" value={novaCategoria} className="mt-1"
                               onChange={(e) => setNovaCategoria(e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <Switch checked={novaObrigatoria} onCheckedChange={setNovaObrigatoria} id="obr" />
                        <Label htmlFor="obr" className="cursor-pointer flex items-center gap-1.5">
                          <Star className="h-3.5 w-3.5 text-amber-500" /> Obrigatória
                        </Label>
                      </div>
                      <div>
                        <Label htmlFor="peso" className="flex items-center gap-1.5">
                          <Gauge className="h-3.5 w-3.5 text-sky-600" /> Peso no score (opcional)
                        </Label>
                        <Input id="peso" value={novoPeso} inputMode="decimal" className="mt-1"
                               onChange={(e) => setNovoPeso(e.target.value)} placeholder="Ex: 2" />
                      </div>
                    </div>

                    {/* opções */}
                    {precisaOpcoes && (
                      <div className="rounded-md border border-gray-100 p-3">
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Opções</Label>
                        <div className="space-y-2 mt-2">
                          {novasOpcoes.map((o, i) => (
                            <div key={i} className="flex gap-2">
                              <Input value={o} placeholder={`Opção ${i + 1}`}
                                     onChange={(e) => setNovasOpcoes((ant) => ant.map((x, j) => (j === i ? e.target.value : x)))} />
                              <Button size="icon" variant="ghost" className="shrink-0"
                                      onClick={() => setNovasOpcoes((ant) => ant.filter((_, j) => j !== i))}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <Button size="sm" variant="outline" className="mt-2 gap-1"
                                onClick={() => setNovasOpcoes((ant) => [...ant, ""])}>
                          <Plus className="h-3.5 w-3.5" /> Adicionar opção
                        </Button>
                      </div>
                    )}

                    {/* escala */}
                    {novoTipo === "escala" && (
                      <div className="rounded-md border border-gray-100 p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <Label htmlFor="min" className="text-xs">Mínimo</Label>
                          <Input id="min" value={escMin} inputMode="numeric" className="mt-1"
                                 onChange={(e) => setEscMin(e.target.value)} />
                        </div>
                        <div>
                          <Label htmlFor="max" className="text-xs">Máximo</Label>
                          <Input id="max" value={escMax} inputMode="numeric" className="mt-1"
                                 onChange={(e) => setEscMax(e.target.value)} />
                        </div>
                        <div>
                          <Label htmlFor="rmin" className="text-xs">Rótulo do mínimo</Label>
                          <Input id="rmin" value={escRotMin} className="mt-1" placeholder="Ex: Sem dor"
                                 onChange={(e) => setEscRotMin(e.target.value)} />
                        </div>
                        <div>
                          <Label htmlFor="rmax" className="text-xs">Rótulo do máximo</Label>
                          <Input id="rmax" value={escRotMax} className="mt-1" placeholder="Ex: Pior dor imaginável"
                                 onChange={(e) => setEscRotMax(e.target.value)} />
                        </div>
                      </div>
                    )}

                    {/* condicional */}
                    <div className="rounded-md border border-gray-100 p-3">
                      <div className="flex items-center gap-2">
                        <Switch checked={condAtiva} onCheckedChange={setCondAtiva} id="cond"
                                disabled={gatilhosDisponiveis.length === 0} />
                        <Label htmlFor="cond" className="cursor-pointer flex items-center gap-1.5">
                          <GitBranch className="h-3.5 w-3.5 text-emerald-600" /> Mostrar só em certa condição
                        </Label>
                      </div>
                      {gatilhosDisponiveis.length === 0 ? (
                        <p className="text-[11px] text-gray-400 mt-2">
                          Salve ao menos uma pergunta no modelo para usá-la como gatilho.
                        </p>
                      ) : condAtiva && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                          <div className="sm:col-span-3">
                            <Label className="text-xs">Pergunta-gatilho</Label>
                            <Select value={condGatilho} onValueChange={(v) => { setCondGatilho(v); setCondValor(""); }}>
                              <SelectTrigger className="mt-1"><SelectValue placeholder="Escolha a pergunta" /></SelectTrigger>
                              <SelectContent>
                                {gatilhosDisponiveis.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>{p.enunciado}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Operador</Label>
                            <Select value={condOperador} onValueChange={(v) => setCondOperador(v as OperadorCondicional)}>
                              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {OPERADORES.map((o) => (
                                  <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="sm:col-span-2">
                            <Label className="text-xs">Valor</Label>
                            {gatilhoEscolhido?.tipo === "sim_nao" ? (
                              <Select value={condValor} onValueChange={setCondValor}>
                                <SelectTrigger className="mt-1"><SelectValue placeholder="Sim ou Não" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="true">Sim</SelectItem>
                                  <SelectItem value="false">Não</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : gatilhoEscolhido?.opcoes?.length ? (
                              <Select value={condValor} onValueChange={setCondValor}>
                                <SelectTrigger className="mt-1"><SelectValue placeholder="Escolha a opção" /></SelectTrigger>
                                <SelectContent>
                                  {gatilhoEscolhido.opcoes.map((o) => (
                                    <SelectItem key={o} value={o}>{o}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input className="mt-1" value={condValor} onChange={(e) => setCondValor(e.target.value)}
                                     placeholder="Valor comparado" />
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={limparFormulario}>Limpar campos</Button>
                      <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                              onClick={criarPersonalizada} disabled={criandoPergunta}>
                        {criandoPergunta ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Adicionar ao modelo
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ------------------------------------------------ formulário montado */}
            <div className="xl:col-span-2">
              <Card className="border-gray-100 xl:sticky xl:top-6">
                <CardContent className="p-5">
                  <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-emerald-600" /> Formulário do modelo
                  </h2>
                  <p className="text-sm text-gray-600 mt-0.5 mb-4">
                    {perguntas.length} pergunta(s) · {personalizadas.length} personalizada(s)
                  </p>

                  {perguntas.length === 0 ? (
                    <div className="text-center py-10">
                      <ClipboardList className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                      <p className="font-medium text-gray-800">Formulário vazio</p>
                      <p className="text-sm text-gray-500 mt-1">
                        Marque perguntas no banco ao lado e clique em “Salvar seleção”.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                      {perguntas.map((p, i) => (
                        <div key={p.id} className="rounded-md border border-gray-100 p-3">
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-gray-400 tabular-nums mt-0.5 w-6">{i + 1}.</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-gray-900">{p.enunciado}</p>
                              <p className="text-[11px] text-gray-400 mt-0.5">{p.categoria ?? "Sem categoria"}</p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                <Badge className="bg-gray-100 text-gray-700 border-0 text-[10px]">
                                  {ROTULO_TIPO[p.tipo]}
                                </Badge>
                                {!!p.peso_score && (
                                  <Badge className="bg-sky-100 text-sky-800 border-0 text-[10px]">
                                    peso {p.peso_score}
                                  </Badge>
                                )}
                                {p.condicional && (
                                  <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                    <GitBranch className="h-3 w-3" />
                                    condicional a: {enunciadoPorId.get(p.condicional.pergunta_id) ?? "pergunta removida"}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <Switch checked={p.obrigatoria}
                                        onCheckedChange={(v) => alternarObrigatoria(p, v)} />
                                <span className="text-[11px] text-gray-500">Obrigatória</span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === 0 || reordenando}
                                      onClick={() => mover(i, -1)}>
                                <ChevronUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6"
                                      disabled={i === perguntas.length - 1 || reordenando}
                                      onClick={() => mover(i, 1)}>
                                <ChevronDown className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost"
                                      className="h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => setAExcluir(p)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <AlertDialog open={!!aExcluir} onOpenChange={(o) => !o && setAExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta pergunta?</AlertDialogTitle>
            <AlertDialogDescription>
              “{aExcluir?.enunciado}” sai do formulário. Anamneses já preenchidas mantêm a resposta
              guardada, mas ela deixa de ser exibida nos próximos preenchimentos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
                               onClick={(e) => { e.preventDefault(); confirmarExclusao(); }}>
              {excluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AnamneseEditor;
