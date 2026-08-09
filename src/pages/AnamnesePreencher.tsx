import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Loader2, Save, ClipboardList, AlertTriangle, Eraser,
  PenLine, Paperclip, History, User,
} from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "sonner";
import {
  listarModelosPublicados, listarPerguntas, obterPaciente, salvarResposta,
  listarRespostasDoPaciente, perguntasVisiveis, calcularScore, faixaDoScore,
  formatarDataHora,
  type AnamneseModelo, type AnamnesePergunta, type ValorResposta,
  type AnamneseRespostaRegistro, type PreenchidoPor,
} from "@/services/anamnese";

// ============================================================================
// Preencher anamnese
// ----------------------------------------------------------------------------
// Duas coisas acontecem enquanto o paciente responde:
//  · skip logic — pergunta condicional some quando o gatilho não bate. Resposta
//    de pergunta escondida é descartada no envio, senão o histórico guarda
//    "quais medicamentos" de quem disse que não toma nenhum.
//  · score de risco — soma viva de peso_score. É o que transforma a ficha em
//    triagem: PHQ-9, GAD-7 e escala de dor saem prontos daqui.
// ============================================================================

const ESCALA_PADRAO = { min: 0, max: 10, passo: 1 };

/** Assinatura desenhada no canvas. Sai como data URL dentro do JSON da resposta. */
const PadAssinatura = ({
  valor, onChange,
}: { valor: string | null; onChange: (v: string | null) => void }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const desenhando = useRef(false);

  const posicao = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    // o canvas tem largura CSS fluida e buffer fixo: converte pra coordenada do buffer
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };

  const iniciar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    desenhando.current = true;
    ref.current?.setPointerCapture(e.pointerId);
    const { x, y } = posicao(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!desenhando.current) return;
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = posicao(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const encerrar = () => {
    if (!desenhando.current) return;
    desenhando.current = false;
    const c = ref.current;
    if (c) onChange(c.toDataURL("image/png"));
  };

  const limpar = () => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={ref}
        width={600}
        height={160}
        onPointerDown={iniciar}
        onPointerMove={mover}
        onPointerUp={encerrar}
        onPointerLeave={encerrar}
        className="w-full h-40 rounded-md border border-dashed border-gray-300 bg-white touch-none"
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] text-gray-400 flex items-center gap-1">
          <PenLine className="h-3 w-3" /> Assine com o dedo ou com o mouse
        </span>
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={limpar}>
          <Eraser className="h-3.5 w-3.5" /> Limpar
        </Button>
      </div>
      {valor && <p className="text-[11px] text-emerald-700 mt-1">Assinatura capturada.</p>}
    </div>
  );
};

const AnamnesePreencher = () => {
  const { pacienteId } = useParams<{ pacienteId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { clinicaId, carregando: carregandoCtx } = useTenant();

  const [paciente, setPaciente] = useState<{ id: string; nome_completo: string } | null>(null);
  const [modelos, setModelos] = useState<AnamneseModelo[]>([]);
  const [modeloId, setModeloId] = useState<string>(params.get("modelo") ?? "");
  const [perguntas, setPerguntas] = useState<AnamnesePergunta[]>([]);
  const [respostas, setRespostas] = useState<Record<string, ValorResposta>>({});
  const [historico, setHistorico] = useState<AnamneseRespostaRegistro[]>([]);
  const [preenchidoPor, setPreenchidoPor] = useState<PreenchidoPor>("profissional");

  const [carregando, setCarregando] = useState(true);
  const [carregandoPerguntas, setCarregandoPerguntas] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [tentouSalvar, setTentouSalvar] = useState(false);

  // -------------------------------------------------------------- carga inicial
  useEffect(() => {
    if (!clinicaId || !pacienteId) { if (!carregandoCtx) setCarregando(false); return; }
    let vivo = true;
    (async () => {
      try {
        const [p, ms, hist] = await Promise.all([
          obterPaciente(clinicaId, pacienteId),
          listarModelosPublicados(clinicaId),
          listarRespostasDoPaciente(clinicaId, pacienteId),
        ]);
        if (!vivo) return;
        setPaciente(p as any);
        setModelos(ms);
        setHistorico(hist);
        // o ?modelo= da URL é entrada do usuário: só vale se for um modelo
        // publicado DESTA clínica, senão cai no primeiro da lista
        setModeloId((atual) =>
          (atual && ms.some((m) => m.id === atual) ? atual : ms[0]?.id) || "");
      } catch (e: any) {
        if (vivo) toast.error("Erro ao carregar a anamnese", { description: e.message });
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [clinicaId, pacienteId, carregandoCtx]);

  // ------------------------------------------------------- perguntas do modelo
  useEffect(() => {
    if (!clinicaId || !modeloId) { setPerguntas([]); return; }
    let vivo = true;
    setCarregandoPerguntas(true);
    (async () => {
      try {
        const ps = await listarPerguntas(clinicaId, modeloId);
        if (!vivo) return;
        setPerguntas(ps);
        setRespostas({});
        setTentouSalvar(false);
      } catch (e: any) {
        if (vivo) toast.error("Erro ao carregar perguntas", { description: e.message });
      } finally {
        if (vivo) setCarregandoPerguntas(false);
      }
    })();
    return () => { vivo = false; };
  }, [clinicaId, modeloId]);

  const visiveis = useMemo(() => perguntasVisiveis(perguntas, respostas), [perguntas, respostas]);
  const score = useMemo(() => calcularScore(perguntas, respostas), [perguntas, respostas]);
  const faixa = useMemo(() => faixaDoScore(score), [score]);

  const responder = useCallback((id: string, valor: ValorResposta) => {
    setRespostas((ant) => ({ ...ant, [id]: valor }));
  }, []);

  const vazia = (v: ValorResposta) =>
    v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

  const pendentes = useMemo(
    // upload fica fora: sem bucket de arquivos configurado, exigir anexo travaria o envio
    () => visiveis.filter((p) => p.obrigatoria && p.tipo !== "secao" && p.tipo !== "upload" && vazia(respostas[p.id])),
    [visiveis, respostas],
  );

  const respondidas = useMemo(
    () => visiveis.filter((p) => p.tipo !== "secao" && !vazia(respostas[p.id])).length,
    [visiveis, respostas],
  );
  const respondiveis = useMemo(() => visiveis.filter((p) => p.tipo !== "secao").length, [visiveis]);

  const salvar = async () => {
    if (!clinicaId || !pacienteId || !modeloId) return;
    setTentouSalvar(true);
    if (pendentes.length) {
      toast.error(`Faltam ${pendentes.length} resposta(s) obrigatória(s)`, {
        description: pendentes[0].enunciado,
      });
      return;
    }
    // resposta de pergunta escondida pela skip logic não vai pro banco
    const idsVisiveis = new Set(visiveis.map((p) => p.id));
    const limpas: Record<string, ValorResposta> = {};
    for (const [k, v] of Object.entries(respostas)) {
      if (idsVisiveis.has(k) && !vazia(v)) limpas[k] = v;
    }
    if (!Object.keys(limpas).length) {
      toast.error("Nada preenchido", { description: "Responda ao menos uma pergunta antes de salvar." });
      return;
    }

    setSalvando(true);
    try {
      await salvarResposta({
        clinicaId, pacienteId, modeloId,
        respostas: limpas,
        scoreTotal: score,
        preenchidoPor,
      });
      toast.success("Anamnese salva", { description: `Score de risco: ${score}` });
      setRespostas({});
      setTentouSalvar(false);
      setHistorico(await listarRespostasDoPaciente(clinicaId, pacienteId));
    } catch (e: any) {
      toast.error("Erro ao salvar anamnese", { description: e.message });
    } finally {
      setSalvando(false);
    }
  };

  // ------------------------------------------------------------- render campo
  const renderCampo = (p: AnamnesePergunta) => {
    const valor = respostas[p.id];
    const erro = tentouSalvar && p.obrigatoria && p.tipo !== "upload" && vazia(valor);
    const classeErro = erro ? "border-red-300 focus-visible:ring-red-300" : "";

    switch (p.tipo) {
      case "texto":
        return <Input className={`mt-2 ${classeErro}`} value={(valor as string) ?? ""}
                      onChange={(e) => responder(p.id, e.target.value)} />;
      case "texto_longo":
        return <Textarea rows={3} className={`mt-2 ${classeErro}`} value={(valor as string) ?? ""}
                         onChange={(e) => responder(p.id, e.target.value)} />;
      case "numero":
        return <Input type="number" inputMode="decimal" className={`mt-2 max-w-[200px] ${classeErro}`}
                      value={(valor as number | string) ?? ""}
                      onChange={(e) => responder(p.id, e.target.value === "" ? "" : Number(e.target.value))} />;
      case "data":
        return <Input type="date" className={`mt-2 max-w-[220px] ${classeErro}`} value={(valor as string) ?? ""}
                      onChange={(e) => responder(p.id, e.target.value)} />;
      case "sim_nao":
        return (
          <div className="flex gap-2 mt-2">
            {[{ v: true, r: "Sim" }, { v: false, r: "Não" }].map((op) => (
              <Button key={op.r} type="button" size="sm"
                      variant={valor === op.v ? "default" : "outline"}
                      className={valor === op.v ? "bg-emerald-600 hover:bg-emerald-700" : erro ? "border-red-300" : ""}
                      onClick={() => responder(p.id, op.v)}>
                {op.r}
              </Button>
            ))}
          </div>
        );
      case "selecao_unica":
        return (
          <div className="mt-2 flex flex-wrap gap-2">
            {(p.opcoes ?? []).map((o) => (
              <Button key={o} type="button" size="sm"
                      variant={valor === o ? "default" : "outline"}
                      className={valor === o ? "bg-emerald-600 hover:bg-emerald-700" : erro ? "border-red-300" : ""}
                      onClick={() => responder(p.id, o)}>
                {o}
              </Button>
            ))}
          </div>
        );
      case "multipla_escolha": {
        const marcadas = Array.isArray(valor) ? valor : [];
        return (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {(p.opcoes ?? []).map((o) => (
              <label key={o} className="flex items-center gap-2 rounded-md border border-gray-100 px-3 py-2 cursor-pointer hover:bg-muted/40">
                <Checkbox checked={marcadas.includes(o)}
                          onCheckedChange={(v) => responder(p.id, v === true
                            ? [...marcadas, o]
                            : marcadas.filter((x) => x !== o))} />
                <span className="text-sm text-gray-800">{o}</span>
              </label>
            ))}
          </div>
        );
      }
      case "escala": {
        const cfg = { ...ESCALA_PADRAO, ...(p.escala ?? {}) };
        const atual = typeof valor === "number" ? valor : cfg.min;
        const respondida = typeof valor === "number";
        return (
          <div className="mt-3">
            <div className="flex items-center gap-4">
              <Slider min={cfg.min} max={cfg.max} step={cfg.passo ?? 1} value={[atual]}
                      onValueChange={(v) => responder(p.id, v[0])} className="flex-1" />
              <span className={`text-lg font-bold tabular-nums w-10 text-right ${
                respondida ? "text-emerald-700" : "text-gray-300"}`}>
                {respondida ? atual : "–"}
              </span>
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[11px] text-gray-500">{cfg.rotulo_min ?? cfg.min}</span>
              <span className="text-[11px] text-gray-500">{cfg.rotulo_max ?? cfg.max}</span>
            </div>
            {!respondida && (
              <button type="button" className="text-[11px] text-emerald-700 hover:underline mt-1"
                      onClick={() => responder(p.id, cfg.min)}>
                Registrar {cfg.min} ({cfg.rotulo_min ?? "mínimo"})
              </button>
            )}
          </div>
        );
      }
      case "assinatura":
        return (
          <div className="mt-2">
            <PadAssinatura
              valor={typeof valor === "object" && valor && "assinatura" in valor ? valor.assinatura : null}
              onChange={(v) => responder(p.id, v ? { assinatura: v, assinado_em: new Date().toISOString() } : null)}
            />
            {erro && <p className="text-[11px] text-red-600 mt-1">Assinatura obrigatória.</p>}
          </div>
        );
      case "upload":
        return (
          <div className="mt-2 rounded-md border border-dashed border-gray-200 bg-gray-50 p-3 flex items-start gap-2">
            <Paperclip className="h-4 w-4 text-gray-400 mt-0.5" />
            <p className="text-xs text-gray-500">
              Envio de arquivos ainda não está habilitado nesta clínica — o armazenamento de anexos
              precisa ser configurado. Registre a informação em uma pergunta de texto por enquanto.
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  // Agrupa por categoria mantendo a ordem do modelo. Agrupa por CHAVE e não por
  // sequência: `ordem` não é única (perguntas do seed e do banco usam faixas que
  // se cruzam), então a mesma categoria pode reaparecer no meio da lista — sem
  // isso a tela mostrava "História Médica" em dois cards separados.
  const blocos = useMemo(() => {
    const mapa = new Map<string, AnamnesePergunta[]>();
    for (const p of visiveis) {
      const cat = p.categoria ?? "Outras perguntas";
      const atual = mapa.get(cat);
      if (atual) atual.push(p);
      else mapa.set(cat, [p]);
    }
    return [...mapa.entries()].map(([categoria, itens]) => ({ categoria, itens }));
  }, [visiveis]);

  if (carregando) {
    return (
      <div className="flex min-h-full bg-gray-50">
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <ClipboardList className="h-6 w-6 text-emerald-600" /> Anamnese
              </h1>
              <p className="text-sm text-gray-600 mt-0.5 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                {paciente?.nome_completo ?? "Paciente não encontrado nesta clínica"}
              </p>
            </div>
          </div>

          {!clinicaId ? (
            <Card className="border-gray-100">
              <CardContent className="p-12 text-center">
                <ClipboardList className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="font-medium text-gray-800">Sem clínica no contexto</p>
                <p className="text-sm text-gray-500 mt-1">Entre com um usuário vinculado a uma clínica.</p>
              </CardContent>
            </Card>
          ) : !paciente ? (
            <Card className="border-gray-100">
              <CardContent className="p-12 text-center">
                <User className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="font-medium text-gray-800">Paciente não encontrado</p>
                <p className="text-sm text-gray-500 mt-1">
                  Ele pode ter sido removido ou pertence a outra clínica.
                </p>
              </CardContent>
            </Card>
          ) : modelos.length === 0 ? (
            <Card className="border-gray-100">
              <CardContent className="p-12 text-center">
                <ClipboardList className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="font-medium text-gray-800">Nenhum modelo publicado</p>
                <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                  Publique um modelo de anamnese para poder preencher. Em Modelos, use “Usar modelo pronto”
                  e ligue a chave Publicado.
                </p>
                <Button className="mt-4 bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => navigate("/anamnese/modelos")}>
                  Ir para modelos
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 space-y-6">
                <Card className="border-gray-100">
                  <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Modelo</Label>
                      <Select value={modeloId} onValueChange={setModeloId}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Escolha o modelo" /></SelectTrigger>
                        <SelectContent>
                          {modelos.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Preenchido por</Label>
                      <Select value={preenchidoPor} onValueChange={(v) => setPreenchidoPor(v as PreenchidoPor)}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="profissional">Profissional / recepção</SelectItem>
                          <SelectItem value="paciente">O próprio paciente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                {carregandoPerguntas ? (
                  <Card className="border-gray-100">
                    <CardContent className="flex justify-center p-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </CardContent>
                  </Card>
                ) : perguntas.length === 0 ? (
                  <Card className="border-gray-100">
                    <CardContent className="p-12 text-center">
                      <ClipboardList className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                      <p className="font-medium text-gray-800">Este modelo não tem perguntas</p>
                      <p className="text-sm text-gray-500 mt-1">
                        Abra o modelo e selecione perguntas no banco antes de preencher.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  blocos.map((bloco) => (
                    <Card key={bloco.categoria} className="border-gray-100">
                      <CardContent className="p-5">
                        <h2 className="font-semibold text-gray-900 mb-4">{bloco.categoria}</h2>
                        <div className="space-y-5">
                          {bloco.itens.map((p) => (
                            p.tipo === "secao" ? (
                              <p key={p.id} className="text-sm font-semibold text-gray-800 pt-2 border-t border-gray-100">
                                {p.enunciado}
                              </p>
                            ) : (
                              <div key={p.id}>
                                <div className="flex items-start gap-2">
                                  <p className="text-sm text-gray-900 flex-1">
                                    {p.enunciado}
                                    {p.obrigatoria && <span className="text-red-500 ml-1">*</span>}
                                  </p>
                                  {p.condicional && (
                                    <Badge className="bg-gray-100 text-gray-600 border-0 text-[10px] shrink-0">
                                      condicional
                                    </Badge>
                                  )}
                                </div>
                                {renderCampo(p)}
                              </div>
                            )
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              {/* ------------------------------------------------ painel lateral */}
              <div className="space-y-6">
                <Card className="border-gray-100 xl:sticky xl:top-6">
                  <CardContent className="p-5">
                    <p className="text-xs text-gray-500">Score de risco</p>
                    <p className="text-3xl font-bold text-gray-900 mt-0.5 tabular-nums">{score}</p>
                    <Badge className={`${faixa.classe} mt-2`}>{faixa.rotulo}</Badge>
                    <p className="text-[11px] text-gray-400 mt-2">
                      Soma dos pesos das respostas visíveis. Serve de triagem, não de diagnóstico.
                    </p>

                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-1.5">
                      <p className="text-xs text-gray-500">
                        {respondidas} de {respondiveis} pergunta(s) respondida(s)
                      </p>
                      {pendentes.length > 0 && (
                        <p className="text-xs text-amber-600 flex items-start gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          {pendentes.length} obrigatória(s) em aberto
                        </p>
                      )}
                    </div>

                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2 mt-4"
                            onClick={salvar} disabled={salvando || perguntas.length === 0}>
                      {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Salvar anamnese
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-gray-100">
                  <CardContent className="p-5">
                    <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
                      <History className="h-4 w-4 text-emerald-600" /> Anamneses anteriores
                    </h2>
                    {historico.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        Este paciente ainda não tem anamnese registrada.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {historico.map((h) => {
                          const f = faixaDoScore(Number(h.score_total ?? 0));
                          const modelo = modelos.find((m) => m.id === h.modelo_id);
                          return (
                            <div key={h.id} className="rounded-md border border-gray-100 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm text-gray-900">{modelo?.nome ?? "Modelo removido"}</p>
                                <Badge className={f.classe}>{Number(h.score_total ?? 0)}</Badge>
                              </div>
                              <p className="text-[11px] text-gray-400 mt-1">
                                {formatarDataHora(h.created_at)} ·{" "}
                                {h.preenchido_por === "paciente" ? "pelo paciente" : "pelo profissional"} ·{" "}
                                {Object.keys(h.respostas ?? {}).length} resposta(s)
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AnamnesePreencher;
