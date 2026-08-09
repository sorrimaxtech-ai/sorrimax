import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Bold, Italic, Underline, List, ListOrdered, Heading, Loader2, Printer,
  Save, AlignLeft, AlignCenter, AlignRight, Eraser, FileSignature, TriangleAlert,
  Braces, Eye,
} from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "sonner";
import {
  obterModelo, atualizarModelo, listarPacientes, listarProfissionais,
  listarConsultasDoPaciente, montarContexto, emitirDocumento, imprimirHtml,
  TIPOS_DOCUMENTO, ROTULO_TIPO, CLASSE_TIPO, dataHoraBr,
  type DocumentoModelo, type PacienteOpcao, type ProfissionalOpcao,
  type ConsultaOpcao, type TipoDocumento,
} from "@/services/documentos";
import {
import { traduzErro } from "@/lib/erros";
  GRUPOS_MERGE_FIELDS, analisarMergeFields, montarDocumentoFinal, ROTULO_MERGE_FIELD,
  sanitizarHtmlDocumento, type ContextoMerge,
} from "@/lib/mergeFields";

// ============================================================================
// Editor de modelo de documento
// ----------------------------------------------------------------------------
// Decisões que não são óbvias no código:
//
// 1. O corpo é um `contentEditable` NÃO controlado por estado. Reescrever o
//    innerHTML a cada tecla joga o cursor pro início — bug clássico. Então o
//    React só planta o HTML uma vez (quando o modelo carrega) e daí em diante
//    lê o que o navegador editou.
//
// 2. A paleta de variáveis usa `onMouseDown` com `preventDefault`: sem isso o
//    clique tira o foco do editor, a seleção morre e o merge field cai sempre
//    no fim do texto em vez de onde o cursor estava.
//
// 3. `document.execCommand` é deprecado, sim — e é a única formatação rica que
//    não custa uma dependência nova. Para negrito/lista/alinhamento ele roda em
//    todos os navegadores atuais. Trocar por editor real é migração, não build.
//
// 4. O preview usa o MESMO `montarDocumentoFinal` da emissão, mudando só o modo
//    (`preview` marca o que falta, `final` deixa linha pra preencher à mão).
//    Assim é impossível a tela mostrar uma coisa e o papel sair outra.
// ============================================================================

const CSS_DOCUMENTO = `
.doc-rich { font-family: Georgia, "Times New Roman", serif; color: #111827; line-height: 1.7; }
.doc-rich h1, .doc-rich h2, .doc-rich h3 { font-weight: 700; margin: 0 0 12px; }
.doc-rich h1 { font-size: 1.4rem; } .doc-rich h2 { font-size: 1.2rem; } .doc-rich h3 { font-size: 1.05rem; }
.doc-rich p { margin: 0 0 10px; }
.doc-rich ul, .doc-rich ol { margin: 0 0 10px; padding-left: 24px; }
.doc-rich ul { list-style: disc; } .doc-rich ol { list-style: decimal; }
.doc-rich strong { font-weight: 700; } .doc-rich em { font-style: italic; }
.doc-editor:focus { outline: none; }
.doc-editor:empty::before { content: attr(data-placeholder); color: #9ca3af; }
`;

const NENHUMA = "__nenhuma__";

/** Texto puro só pra saber se o corpo tem conteúdo — validação, não render. */
const temTexto = (html: string) =>
  html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;

const DocumentoEditor = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { clinicaId, contexto: ctxUsuario, carregando: carregandoCtx } = useTenant();

  const editorRef = useRef<HTMLDivElement>(null);
  /** Id do modelo já plantado no contentEditable — troca de modelo replanta,
   *  recarregar o MESMO modelo não sobrescreve o que a pessoa está digitando. */
  const plantadoId = useRef<string | null>(null);

  const [modelo, setModelo] = useState<DocumentoModelo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [emitindo, setEmitindo] = useState(false);
  const [sujo, setSujo] = useState(false);

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoDocumento>("outro");
  const [corpoHtml, setCorpoHtml] = useState("");
  const [exibirAssinatura, setExibirAssinatura] = useState(true);
  const [exibirDataRodape, setExibirDataRodape] = useState(true);

  const [pacientes, setPacientes] = useState<PacienteOpcao[]>([]);
  const [profissionais, setProfissionais] = useState<ProfissionalOpcao[]>([]);
  const [consultas, setConsultas] = useState<ConsultaOpcao[]>([]);
  const [pacienteId, setPacienteId] = useState("");
  const [consultaId, setConsultaId] = useState(NENHUMA);
  const [profissionalId, setProfissionalId] = useState("");
  const [contextoMerge, setContextoMerge] = useState<ContextoMerge>({});

  const abaInicial = searchParams.get("emitir") === "1" ? "emitir" : "variaveis";

  // -------------------------------------------------------------- carga inicial

  useEffect(() => {
    // sem id na URL não há o que carregar — e o spinner NÃO pode ficar eterno
    if (!id) { setCarregando(false); return; }
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; }
    let vivo = true;
    (async () => {
      setCarregando(true);
      try {
        const [m, ps, profs] = await Promise.all([
          obterModelo(clinicaId, id), listarPacientes(clinicaId), listarProfissionais(clinicaId),
        ]);
        if (!vivo) return;
        setPacientes(ps);
        setProfissionais(profs);
        if (m) {
          setModelo(m);
          setNome(m.nome);
          setTipo(m.tipo);
          setCorpoHtml(m.corpo_html);
          setExibirAssinatura(m.exibir_assinatura);
          setExibirDataRodape(m.exibir_data_rodape);
        }
        // o próprio usuário logado assina por padrão — é o caso comum
        const eu = profs.find((p) => p.id === ctxUsuario?.user_id);
        if (eu) setProfissionalId(eu.id);
        else if (profs.length === 1) setProfissionalId(profs[0].id);
      } catch (e: any) {
        if (vivo) toast.error("Erro ao carregar o modelo", { description: traduzErro(e) });
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [id, clinicaId, carregandoCtx, ctxUsuario?.user_id]);

  // planta o HTML no contentEditable uma única vez por modelo (comentário 1)
  useEffect(() => {
    if (!modelo || !editorRef.current || plantadoId.current === modelo.id) return;
    editorRef.current.innerHTML = sanitizarHtmlDocumento(modelo.corpo_html || "");
    plantadoId.current = modelo.id;
  }, [modelo, carregando]);

  useEffect(() => {
    if (!clinicaId || !pacienteId) { setConsultas([]); setConsultaId(NENHUMA); return; }
    let vivo = true;
    (async () => {
      try {
        const cs = await listarConsultasDoPaciente(clinicaId, pacienteId);
        if (!vivo) return;
        setConsultas(cs);
        setConsultaId(NENHUMA);
      } catch (e: any) {
        if (vivo) toast.error("Erro ao carregar consultas", { description: traduzErro(e) });
      }
    })();
    return () => { vivo = false; };
  }, [clinicaId, pacienteId]);

  useEffect(() => {
    if (!clinicaId) return;
    let vivo = true;
    (async () => {
      try {
        const ctx = await montarContexto(clinicaId, {
          pacienteId: pacienteId || null,
          consultaId: consultaId === NENHUMA ? null : consultaId,
          profissionalId: profissionalId || null,
        });
        if (vivo) setContextoMerge(ctx);
      } catch (e: any) {
        if (vivo) toast.error("Erro ao montar a pré-visualização", { description: traduzErro(e) });
      }
    })();
    return () => { vivo = false; };
  }, [clinicaId, pacienteId, consultaId, profissionalId]);

  // ------------------------------------------------------------------ edição

  const sincronizar = useCallback(() => {
    if (!editorRef.current) return;
    setCorpoHtml(editorRef.current.innerHTML);
    setSujo(true);
  }, []);

  const comando = useCallback((cmd: string, valor?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, valor);
    sincronizar();
  }, [sincronizar]);

  /**
   * Colar entra como TEXTO. Colar do Word/de um site arrasta HTML inteiro
   * (script, iframe, imagem remota, estilo quebrado) pra dentro do documento —
   * o sanitizador cobre isso no save, mas colar limpo evita que a pessoa veja
   * na tela um layout que não vai existir no papel.
   */
  const colar = useCallback((ev: React.ClipboardEvent<HTMLDivElement>) => {
    ev.preventDefault();
    const texto = ev.clipboardData.getData("text/plain");
    if (texto) document.execCommand("insertText", false, texto);
    sincronizar();
  }, [sincronizar]);

  const inserirVariavel = useCallback((chave: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    // cursor fora do editor (primeira interação da sessão) → insere no fim
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    document.execCommand("insertText", false, `{{${chave}}}`);
    sincronizar();
  }, [sincronizar]);

  // ------------------------------------------------------------------ preview

  const htmlPreview = useMemo(
    () => montarDocumentoFinal(corpoHtml, contextoMerge, {
      exibirAssinatura, exibirDataRodape, modo: "preview",
    }),
    [corpoHtml, contextoMerge, exibirAssinatura, exibirDataRodape],
  );

  const analise = useMemo(
    () => analisarMergeFields(corpoHtml, contextoMerge),
    [corpoHtml, contextoMerge],
  );

  const pacienteEscolhido = useMemo(
    () => pacientes.find((p) => p.id === pacienteId) ?? null,
    [pacientes, pacienteId],
  );

  // ------------------------------------------------------------------- ações

  const validar = () => {
    if (nome.trim().length < 3) {
      toast.error("Nome muito curto", { description: "Use pelo menos 3 caracteres." });
      return false;
    }
    if (!temTexto(corpoHtml)) {
      toast.error("Documento vazio", { description: "Escreva o texto do documento antes de salvar." });
      return false;
    }
    return true;
  };

  const salvar = async (avisar = true) => {
    if (!modelo || !clinicaId || !validar()) return false;
    setSalvando(true);
    try {
      await atualizarModelo(clinicaId, modelo.id, {
        nome: nome.trim(), tipo, corpo_html: corpoHtml, exibir_assinatura: exibirAssinatura,
        exibir_data_rodape: exibirDataRodape,
      });
      setSujo(false);
      if (avisar) toast.success("Modelo salvo");
      return true;
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: traduzErro(e) });
      return false;
    } finally {
      setSalvando(false);
    }
  };

  const emitir = async () => {
    if (!clinicaId || !modelo) return;
    if (!pacienteId) {
      toast.error("Escolha o paciente", { description: "O documento é emitido para uma pessoa." });
      return;
    }
    if (!validar()) return;
    // salva antes de emitir: o documento arquivado precisa bater com o modelo
    // que gerou ele — senão o histórico aponta pra um texto que nunca existiu
    if (sujo && !(await salvar(false))) return;

    setEmitindo(true);
    try {
      const ctx = await montarContexto(clinicaId, {
        pacienteId,
        consultaId: consultaId === NENHUMA ? null : consultaId,
        profissionalId: profissionalId || null,
      });
      const html = montarDocumentoFinal(corpoHtml, ctx, {
        exibirAssinatura, exibirDataRodape, modo: "final",
      });
      const emitido = await emitirDocumento({
        clinicaId, modeloId: modelo.id, pacienteId,
        consultaId: consultaId === NENHUMA ? null : consultaId,
        html,
      });
      toast.success("Documento emitido", {
        description: `Guardado no histórico em ${dataHoraBr(emitido.emitido_em)}.`,
      });
      imprimirHtml(html, `${nome.trim()} - ${pacienteEscolhido?.nome_completo ?? ""}`);
    } catch (e: any) {
      toast.error("Erro ao emitir", { description: traduzErro(e) });
    } finally {
      setEmitindo(false);
    }
  };

  // -------------------------------------------------------------------- render

  if (carregando) {
    return (
      <div className="flex min-h-full bg-gray-50">
        <main className="flex-1 flex justify-center items-start p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!clinicaId) {
    return (
      <div className="flex min-h-full bg-gray-50">
        <main className="flex-1 p-8">
          <Card className="border-gray-100">
            <CardContent className="text-center p-12">
              <FileSignature className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="font-medium text-gray-800">Sem clínica no contexto</p>
              <p className="text-sm text-gray-500 mt-1">
                Entre com um usuário vinculado a uma clínica para editar modelos de documento.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!modelo) {
    return (
      <div className="flex min-h-full bg-gray-50">
        <main className="flex-1 p-8">
          <Card className="border-gray-100">
            <CardContent className="text-center p-12">
              <FileSignature className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="font-medium text-gray-800">Modelo não encontrado</p>
              <p className="text-sm text-gray-500 mt-1">
                Ele pode ter sido excluído ou pertence a outra clínica.
              </p>
              <Button className="mt-4 gap-2" variant="outline" onClick={() => navigate("/documentos")}>
                <ArrowLeft className="h-4 w-4" /> Voltar para Documentos
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const botoesFormato: { icone: typeof Bold; titulo: string; cmd: string; valor?: string }[] = [
    { icone: Bold, titulo: "Negrito", cmd: "bold" },
    { icone: Italic, titulo: "Itálico", cmd: "italic" },
    { icone: Underline, titulo: "Sublinhado", cmd: "underline" },
    { icone: Heading, titulo: "Título", cmd: "formatBlock", valor: "<h2>" },
    { icone: List, titulo: "Lista com marcadores", cmd: "insertUnorderedList" },
    { icone: ListOrdered, titulo: "Lista numerada", cmd: "insertOrderedList" },
    { icone: AlignLeft, titulo: "Alinhar à esquerda", cmd: "justifyLeft" },
    { icone: AlignCenter, titulo: "Centralizar", cmd: "justifyCenter" },
    { icone: AlignRight, titulo: "Alinhar à direita", cmd: "justifyRight" },
    { icone: Eraser, titulo: "Limpar formatação", cmd: "removeFormat" },
  ];

  return (
    <div className="flex min-h-full bg-gray-50">
      <style>{CSS_DOCUMENTO}</style>
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-4 sm:p-8">
          <button className="text-sm text-gray-500 hover:text-brand-700 flex items-center gap-1 mb-3"
                  onClick={() => navigate("/documentos")}>
            <ArrowLeft className="h-4 w-4" /> Documentos
          </button>

          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <FileSignature className="h-6 w-6 text-brand-600" /> {modelo.nome}
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                Escreva o texto uma vez, insira as variáveis e o sistema preenche com o dado real a cada emissão.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className={CLASSE_TIPO[tipo] ?? CLASSE_TIPO.outro}>
                {ROTULO_TIPO[tipo] ?? tipo}
              </Badge>
              {modelo.sistema && (
                <Badge className="bg-gray-100 text-gray-700 border-0">modelo padrão</Badge>
              )}
              <Button variant="outline" className="gap-2" onClick={() => salvar()} disabled={salvando || !sujo}>
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {sujo ? "Salvar" : "Salvo"}
              </Button>
              <Button className="bg-brand-600 hover:bg-brand-700 gap-2"
                      onClick={emitir} disabled={emitindo}>
                {emitindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                Emitir e imprimir
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6">
            {/* ---------------------------------------------------------- editor */}
            <div className="space-y-4">
              <Card className="border-gray-100">
                <CardContent className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_220px] gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="modelo-nome">Nome do modelo</Label>
                      <Input id="modelo-nome" value={nome}
                             onChange={(e) => { setNome(e.target.value); setSujo(true); }} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tipo</Label>
                      <Select value={tipo} onValueChange={(v) => { setTipo(v as TipoDocumento); setSujo(true); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TIPOS_DOCUMENTO.map((t) => (
                            <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex flex-wrap items-center gap-1 rounded-md border border-gray-200 bg-gray-50 p-1">
                    <TooltipProvider delayDuration={200}>
                      {botoesFormato.map((b) => (
                        <Tooltip key={b.titulo}>
                          <TooltipTrigger asChild>
                            <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0"
                                    onMouseDown={(ev) => ev.preventDefault()}
                                    onClick={() => comando(b.cmd, b.valor)}
                                    aria-label={b.titulo}>
                              <b.icone className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{b.titulo}</TooltipContent>
                        </Tooltip>
                      ))}
                    </TooltipProvider>
                  </div>

                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={sincronizar}
                    onBlur={sincronizar}
                    onPaste={colar}
                    data-placeholder="Escreva o texto do documento. Use a paleta ao lado para inserir dados do paciente, da clínica e da consulta."
                    className="doc-rich doc-editor min-h-[420px] rounded-md border border-gray-200 bg-white p-6 text-[15px]"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-center justify-between gap-3 rounded-md border border-gray-200 p-3">
                      <span>
                        <span className="text-sm font-medium text-gray-800">Assinatura do profissional</span>
                        <span className="block text-xs text-gray-500">Linha de assinatura com nome e registro.</span>
                      </span>
                      <Switch checked={exibirAssinatura}
                              onCheckedChange={(v) => { setExibirAssinatura(v); setSujo(true); }} />
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-md border border-gray-200 p-3">
                      <span>
                        <span className="text-sm font-medium text-gray-800">Data no rodapé</span>
                        <span className="block text-xs text-gray-500">Data e hora da emissão no pé da página.</span>
                      </span>
                      <Switch checked={exibirDataRodape}
                              onCheckedChange={(v) => { setExibirDataRodape(v); setSujo(true); }} />
                    </label>
                  </div>
                </CardContent>
              </Card>

              {/* -------------------------------------------------------- preview */}
              <Card className="border-gray-100">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <p className="text-sm font-medium text-gray-800 flex items-center gap-2">
                      <Eye className="h-4 w-4 text-brand-600" /> Pré-visualização
                    </p>
                    <p className="text-xs text-gray-500">
                      {pacienteEscolhido
                        ? `com dados de ${pacienteEscolhido.nome_completo}`
                        : "escolha um paciente para ver preenchido"}
                    </p>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-white p-6 sm:p-10 overflow-x-auto">
                    {temTexto(corpoHtml) ? (
                      // HTML do próprio modelo da clínica; os valores injetados
                      // pelo merge são escapados em `resolverMergeFields`.
                      <div className="doc-rich text-[15px]"
                           dangerouslySetInnerHTML={{ __html: htmlPreview }} />
                    ) : (
                      <div className="text-center py-10">
                        <FileSignature className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                        <p className="font-medium text-gray-800">Documento em branco</p>
                        <p className="text-sm text-gray-500 mt-1">
                          Escreva o texto no editor acima para ver a pré-visualização.
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ------------------------------------------------ paleta + emissão */}
            <div className="space-y-4">
              <Tabs defaultValue={abaInicial}>
                <TabsList className="w-full">
                  <TabsTrigger value="variaveis" className="flex-1">Variáveis</TabsTrigger>
                  <TabsTrigger value="emitir" className="flex-1">Emitir</TabsTrigger>
                </TabsList>

                <TabsContent value="variaveis">
                  <Card className="border-gray-100">
                    <CardContent className="p-5 space-y-4">
                      <p className="text-xs text-gray-500">
                        Clique para inserir no ponto onde o cursor está. Na emissão, cada variável
                        vira o dado real do cadastro.
                      </p>
                      {GRUPOS_MERGE_FIELDS.map((g) => (
                        <div key={g.grupo}>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                            {g.rotulo}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            <TooltipProvider delayDuration={200}>
                              {g.campos.map((c) => (
                                <Tooltip key={c.chave}>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onMouseDown={(ev) => ev.preventDefault()}
                                      onClick={() => inserirVariavel(c.chave)}
                                      className="rounded-md border border-brand-200 bg-brand-50 px-2 py-1 text-xs text-brand-800 hover:bg-brand-100"
                                    >
                                      {c.rotulo}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">{c.descricao}</p>
                                    <p className="font-mono text-[11px] opacity-70">{`{{${c.chave}}}`}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                            </TooltipProvider>
                          </div>
                        </div>
                      ))}

                      <Separator />

                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Braces className="h-3.5 w-3.5" /> Neste modelo
                        </p>
                        {analise.usados.length === 0 ? (
                          <p className="text-xs text-amber-600">
                            Nenhuma variável ainda — o documento vai sair igual pra todo mundo.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {analise.usados.map((v) => (
                              <Badge key={v} className="bg-gray-100 text-gray-700 border-0 font-mono text-[11px]">
                                {v}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {analise.desconhecidos.length > 0 && (
                          <p className="text-xs text-red-600 mt-2">
                            Variáveis inexistentes (vão sair impressas como texto):{" "}
                            {analise.desconhecidos.map((d) => `{{${d}}}`).join(", ")}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="emitir">
                  <Card className="border-gray-100">
                    <CardContent className="p-5 space-y-4">
                      <div className="space-y-1.5">
                        <Label>Paciente</Label>
                        {pacientes.length === 0 ? (
                          <p className="text-xs text-gray-500">
                            Nenhum paciente ativo cadastrado. Cadastre um paciente para emitir documentos.
                          </p>
                        ) : (
                          <Select value={pacienteId} onValueChange={setPacienteId}>
                            <SelectTrigger><SelectValue placeholder="Escolha o paciente" /></SelectTrigger>
                            <SelectContent>
                              {pacientes.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.nome_completo}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label>Consulta (opcional)</Label>
                        <Select value={consultaId} onValueChange={setConsultaId}
                                disabled={!pacienteId || consultas.length === 0}>
                          <SelectTrigger>
                            <SelectValue placeholder={pacienteId ? "Sem consulta vinculada" : "Escolha o paciente antes"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NENHUMA}>Sem consulta vinculada</SelectItem>
                            {consultas.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {dataHoraBr(c.inicio)}{c.procedimento ? ` — ${c.procedimento}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {pacienteId && consultas.length === 0 && (
                          <p className="text-[11px] text-gray-500">
                            Esse paciente não tem consultas — as variáveis de consulta ficam em branco.
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label>Profissional que assina</Label>
                        {profissionais.length === 0 ? (
                          <p className="text-xs text-gray-500">Nenhum profissional cadastrado na clínica.</p>
                        ) : (
                          <Select value={profissionalId} onValueChange={setProfissionalId}>
                            <SelectTrigger><SelectValue placeholder="Escolha quem assina" /></SelectTrigger>
                            <SelectContent>
                              {profissionais.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.full_name ?? "Sem nome"}
                                  {p.registro_profissional ? ` — ${p.registro_profissional}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      {/* só depois de escolher o paciente esse aviso é verdade:
                          sem paciente todo campo dele está "sem dado" por falta
                          de escolha, não por falha de cadastro. */}
                      {pacienteId && analise.pendentes.length > 0 && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                          <p className="text-xs font-medium text-amber-800 flex items-center gap-1.5">
                            <TriangleAlert className="h-3.5 w-3.5" /> Sem dado no cadastro
                          </p>
                          <p className="text-xs text-amber-700 mt-1">
                            {analise.pendentes.map((p) => ROTULO_MERGE_FIELD[p] ?? p).join(", ")}.
                            Esses campos saem como linha em branco para preencher à mão.
                          </p>
                        </div>
                      )}

                      <Button className="w-full bg-brand-600 hover:bg-brand-700 gap-2"
                              onClick={emitir} disabled={emitindo || !pacienteId}>
                        {emitindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                        Emitir e imprimir
                      </Button>
                      <p className="text-[11px] text-gray-400">
                        O texto impresso é guardado no histórico com um hash SHA-256 — dá pra provar
                        depois que a via entregue é a mesma que saiu do sistema.
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DocumentoEditor;
