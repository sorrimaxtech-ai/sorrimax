import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Globe, Loader2, Save, Copy, Check, Link2, Plus, X, CalendarCheck, Trash2,
  ExternalLink, AlertCircle, Eye, EyeOff, Building2,
} from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import {
  carregarPerfilPublico, salvarPerfilPublico, slugEmUso, especialidadesDaClinica,
  listarTokens, gerarToken, revogarToken,
  normalizarSlug, erroSlug, urlPublica, urlToken, tokenExpirado,
  mensagemErro, ehConflitoUnico,
  PERFIL_PUBLICO_VAZIO, TIPO_TOKEN_LABEL, TIPO_TOKEN_AJUDA, dataHoraBR,
  type PerfilPublico, type BookingToken, type TipoBookingToken,
} from "@/services/configuracoes";

// ============================================================================
// Página Pública — o endereço que a clínica manda para o paciente
// ----------------------------------------------------------------------------
// Duas coisas que valem registrar sobre o comportamento desta tela:
//
// 1. Disponibilidade de slug é PALPITE, não garantia. A RLS de `perfil_publico`
//    deixa ler o próprio perfil e os de terceiros já publicados; um slug
//    reservado por clínica que ainda não publicou é invisível daqui. Por isso o
//    aviso de "disponível" é otimista e o erro real (23505) é tratado no save.
//
// 2. Link de agendamento não é o mesmo que página publicada. A página é
//    permanente; o link é um `booking_token` com prazo (7 dias por padrão),
//    para mandar em conversa individual e poder ser revogado sem tirar a
//    clínica do ar.
// ============================================================================

type Disponibilidade = "ocioso" | "verificando" | "livre" | "ocupado" | "invalido";

const PaginaPublica = () => {
  const { clinicaId, carregando: carregandoCtx, contexto } = useTenant();

  const [perfil, setPerfil] = useState<PerfilPublico>(PERFIL_PUBLICO_VAZIO);
  const [original, setOriginal] = useState<PerfilPublico | null>(null);
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [tokens, setTokens] = useState<BookingToken[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);

  const [novaEspecialidade, setNovaEspecialidade] = useState("");
  const [tipoToken, setTipoToken] = useState<TipoBookingToken>("agendamento");
  const [copiado, setCopiado] = useState<string | null>(null);
  const [confirmarRevogacao, setConfirmarRevogacao] = useState<BookingToken | null>(null);

  const [disponibilidade, setDisponibilidade] = useState<Disponibilidade>("ocioso");
  const debounce = useRef<number | null>(null);

  const carregar = useCallback(async () => {
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; }
    setCarregando(true);
    try {
      const [dados, esp, lista] = await Promise.all([
        carregarPerfilPublico(clinicaId),
        // Sugestão é acessório: se falhar, a tela abre sem ela em vez de não
        // abrir. Mas o erro vai para o console — engolir sem rastro esconde
        // problema de RLS/schema de quem for depurar depois.
        especialidadesDaClinica(clinicaId).catch((e) => {
          console.warn("[PaginaPublica] especialidades da clínica:", mensagemErro(e));
          return [] as string[];
        }),
        listarTokens(clinicaId),
      ]);
      setPerfil(dados ?? PERFIL_PUBLICO_VAZIO);
      setOriginal(dados);
      setSugestoes(esp);
      setTokens(lista);
    } catch (e) {
      toast.error("Erro ao carregar a página pública", { description: mensagemErro(e) });
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, carregandoCtx]);

  useEffect(() => { carregar(); }, [carregar]);

  const problemaSlug = useMemo(() => erroSlug(perfil.slug), [perfil.slug]);

  // Checagem com debounce: cada tecla no campo não pode virar uma ida ao banco.
  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    if (!clinicaId || !perfil.slug) { setDisponibilidade("ocioso"); return; }
    if (problemaSlug) { setDisponibilidade("invalido"); return; }
    if (original && perfil.slug === original.slug) { setDisponibilidade("livre"); return; }

    setDisponibilidade("verificando");
    debounce.current = window.setTimeout(async () => {
      try {
        const ocupado = await slugEmUso(perfil.slug, clinicaId);
        setDisponibilidade(ocupado ? "ocupado" : "livre");
      } catch {
        setDisponibilidade("ocioso"); // sem resposta do banco, não afirmamos nada
      }
    }, 450);

    return () => { if (debounce.current) window.clearTimeout(debounce.current); };
  }, [perfil.slug, problemaSlug, clinicaId, original]);

  const sujo = useMemo(() => {
    const base = original ?? PERFIL_PUBLICO_VAZIO;
    return JSON.stringify({ ...perfil, id: null }) !== JSON.stringify({ ...base, id: null });
  }, [perfil, original]);

  const atualizar = <K extends keyof PerfilPublico>(campo: K, valor: PerfilPublico[K]) =>
    setPerfil((p) => ({ ...p, [campo]: valor }));

  const adicionarEspecialidade = (valor: string) => {
    const nome = valor.trim();
    if (!nome) return;
    if (perfil.especialidades.some((e) => e.toLowerCase() === nome.toLowerCase())) {
      toast.info("Essa especialidade já está na lista.");
      return;
    }
    atualizar("especialidades", [...perfil.especialidades, nome]);
    setNovaEspecialidade("");
  };

  const removerEspecialidade = (nome: string) =>
    atualizar("especialidades", perfil.especialidades.filter((e) => e !== nome));

  const salvar = async () => {
    if (!clinicaId) return;
    if (problemaSlug) { toast.error("Endereço inválido", { description: problemaSlug }); return; }
    if (disponibilidade === "ocupado") {
      toast.error("Endereço já em uso", { description: "Escolha outro endereço para a página." });
      return;
    }
    if (perfil.publicado && !perfil.bio.trim()) {
      toast.error("Escreva uma apresentação", {
        description: "Uma página publicada sem texto não diz nada a quem chega nela.",
      });
      return;
    }

    setSalvando(true);
    try {
      const salvo = await salvarPerfilPublico(clinicaId, perfil);
      setPerfil(salvo);
      setOriginal(salvo);
      toast.success(
        perfil.publicado ? "Página publicada" : "Rascunho salvo",
        {
          description: perfil.publicado
            ? urlPublica(salvo.slug)
            : "A página só fica visível para o público quando você ativar “Publicada”.",
        },
      );
    } catch (e) {
      toast.error(
        ehConflitoUnico(e) ? "Endereço já em uso" : "Erro ao salvar",
        {
          description: ehConflitoUnico(e)
            ? "Outra clínica já reservou esse endereço. Escolha outro."
            : mensagemErro(e),
        },
      );
    } finally {
      setSalvando(false);
    }
  };

  const copiar = async (texto: string, marca: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(marca);
      window.setTimeout(() => setCopiado((m) => (m === marca ? null : m)), 2000);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar", { description: texto });
    }
  };

  const gerar = async () => {
    if (!clinicaId) return;
    if (!original?.slug) {
      toast.error("Defina o endereço antes", {
        description: "O link de agendamento aponta para a sua página pública.",
      });
      return;
    }
    setGerando(true);
    try {
      const novo = await gerarToken(clinicaId, tipoToken, 7);
      setTokens((atual) => [novo, ...atual]);
      await copiar(urlToken(original.slug, novo.token), novo.id);
    } catch (e) {
      toast.error("Erro ao gerar o link", { description: mensagemErro(e) });
    } finally {
      setGerando(false);
    }
  };

  const revogar = async () => {
    if (!clinicaId || !confirmarRevogacao) return;
    try {
      await revogarToken(confirmarRevogacao.id, clinicaId);
      setTokens((atual) => atual.filter((t) => t.id !== confirmarRevogacao.id));
      toast.success("Link revogado", { description: "Quem tiver o endereço não consegue mais usá-lo." });
      setConfirmarRevogacao(null);
    } catch (e) {
      toast.error("Erro ao revogar", { description: mensagemErro(e) });
    }
  };

  const nomeClinica = contexto?.clinica_nome ?? "Sua clínica";
  const iniciais = nomeClinica.trim().slice(0, 2).toUpperCase();
  const tokensAtivos = tokens.filter((t) => !tokenExpirado(t) && !t.usadoEm);

  const dicaDisponibilidade: Record<Disponibilidade, { texto: string; classe: string } | null> = {
    ocioso: null,
    verificando: { texto: "Verificando…", classe: "text-gray-400" },
    livre: { texto: "Endereço disponível", classe: "text-emerald-600" },
    ocupado: { texto: "Endereço já em uso por outra clínica", classe: "text-red-600" },
    invalido: { texto: problemaSlug ?? "Endereço inválido", classe: "text-red-600" },
  };

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-4 md:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Globe className="h-6 w-6 text-emerald-600" /> Página Pública
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                O endereço que o paciente abre para conhecer a clínica e marcar horário.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {original?.publicado && original.slug && (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => window.open(urlPublica(original.slug), "_blank", "noopener")}
                >
                  <ExternalLink className="h-4 w-4" /> Ver página
                </Button>
              )}
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                onClick={salvar}
                disabled={salvando || carregando || !sujo}
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </Button>
            </div>
          </div>

          {carregando ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !clinicaId ? (
            <Card className="border-gray-100">
              <CardContent className="p-12 text-center">
                <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="font-medium text-gray-800">Clínica não identificada</p>
                <p className="text-sm text-gray-500 mt-1">
                  Faça login novamente para o sistema reconhecer a qual clínica você pertence.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
              {/* --------------------------------------------------- editor */}
              <div className="space-y-4">
                <Card className="border-gray-100">
                  <CardContent className="p-5 space-y-5">
                    <div>
                      <Label htmlFor="slug">Endereço da página</Label>
                      <div className="flex items-center mt-1 rounded-md border border-input overflow-hidden">
                        <span className="px-3 py-2 text-sm text-gray-500 bg-muted/50 shrink-0 whitespace-nowrap">
                          /c/
                        </span>
                        <Input
                          id="slug"
                          value={perfil.slug}
                          onChange={(e) => atualizar("slug", normalizarSlug(e.target.value))}
                          placeholder="clinica-sorriso"
                          className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                        {perfil.slug && (
                          <span className="text-xs text-gray-500 break-all">{urlPublica(perfil.slug)}</span>
                        )}
                        {dicaDisponibilidade[disponibilidade] && (
                          <span className={`text-xs ${dicaDisponibilidade[disponibilidade]!.classe}`}>
                            {dicaDisponibilidade[disponibilidade]!.texto}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1">
                        Letras minúsculas, números e hífen. Depois de divulgado, mudar o endereço quebra
                        os links que já circulam.
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="bio">Apresentação</Label>
                      <Textarea
                        id="bio"
                        value={perfil.bio}
                        onChange={(e) => atualizar("bio", e.target.value)}
                        rows={5}
                        maxLength={800}
                        placeholder="Conte em poucas linhas o que a clínica faz, para quem, e o que o paciente encontra ao chegar."
                        className="mt-1 resize-y"
                      />
                      <p className="text-[11px] text-gray-400 mt-1">
                        {perfil.bio.length}/800 caracteres
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="foto">Foto de perfil (URL)</Label>
                        <Input
                          id="foto"
                          value={perfil.fotoUrl}
                          onChange={(e) => atualizar("fotoUrl", e.target.value)}
                          placeholder="https://…"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="capa">Imagem de capa (URL)</Label>
                        <Input
                          id="capa"
                          value={perfil.capaUrl}
                          onChange={(e) => atualizar("capaUrl", e.target.value)}
                          placeholder="https://…"
                          className="mt-1"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="especialidade">Especialidades exibidas</Label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          id="especialidade"
                          value={novaEspecialidade}
                          onChange={(e) => setNovaEspecialidade(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); adicionarEspecialidade(novaEspecialidade); }
                          }}
                          placeholder="Ex.: Ortodontia"
                        />
                        <Button
                          variant="outline"
                          className="gap-2 shrink-0"
                          onClick={() => adicionarEspecialidade(novaEspecialidade)}
                          disabled={!novaEspecialidade.trim()}
                        >
                          <Plus className="h-4 w-4" /> Adicionar
                        </Button>
                      </div>

                      {perfil.especialidades.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {perfil.especialidades.map((esp) => (
                            <Badge
                              key={esp}
                              className="bg-emerald-100 text-emerald-800 border-0 gap-1.5 py-1 pl-3 pr-2"
                            >
                              {esp}
                              <button
                                type="button"
                                onClick={() => removerEspecialidade(esp)}
                                className="hover:text-red-600"
                                aria-label={`Remover ${esp}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}

                      {sugestoes.filter((s) => !perfil.especialidades.includes(s)).length > 0 && (
                        <div className="mt-3">
                          <p className="text-[11px] text-gray-400 mb-1.5">
                            Cadastradas na clínica — clique para incluir:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {sugestoes
                              .filter((s) => !perfil.especialidades.includes(s))
                              .map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => adicionarEspecialidade(s)}
                                  className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:border-emerald-300 hover:text-emerald-700"
                                >
                                  + {s}
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-800 flex items-center gap-2">
                            <CalendarCheck className="h-4 w-4 text-emerald-600" /> Aceita agendamento online
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Com isso desligado, a página mostra os contatos mas não abre a agenda.
                          </p>
                        </div>
                        <Switch
                          checked={perfil.aceitaAgendamento}
                          onCheckedChange={(v) => atualizar("aceitaAgendamento", v)}
                          className="data-[state=checked]:bg-emerald-600"
                        />
                      </div>

                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-800 flex items-center gap-2">
                            {perfil.publicado
                              ? <Eye className="h-4 w-4 text-emerald-600" />
                              : <EyeOff className="h-4 w-4 text-gray-400" />}
                            Página publicada
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Publicada, ela fica visível para qualquer pessoa com o endereço.
                          </p>
                        </div>
                        <Switch
                          checked={perfil.publicado}
                          onCheckedChange={(v) => atualizar("publicado", v)}
                          className="data-[state=checked]:bg-emerald-600"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* -------------------------------------- link de agendamento */}
                <Card className="border-gray-100">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div>
                        <p className="font-medium text-gray-900 flex items-center gap-2">
                          <Link2 className="h-4 w-4 text-emerald-600" /> Link de agendamento
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Endereço temporário para mandar direto ao paciente. Vale 7 dias e pode ser
                          revogado a qualquer momento, sem tirar a página do ar.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 mt-4">
                      <Select value={tipoToken} onValueChange={(v) => setTipoToken(v as TipoBookingToken)}>
                        <SelectTrigger className="sm:w-64">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["agendamento", "cadastro"] as TipoBookingToken[]).map((t) => (
                            <SelectItem key={t} value={t}>{TIPO_TOKEN_LABEL[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                        onClick={gerar}
                        disabled={gerando || !original?.slug}
                      >
                        {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Gerar e copiar link
                      </Button>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1.5">{TIPO_TOKEN_AJUDA[tipoToken]}</p>

                    {!original?.slug && (
                      <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 p-3">
                        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800">
                          Defina e salve o endereço da página antes: o link de agendamento aponta para ela.
                        </p>
                      </div>
                    )}

                    <div className="mt-4">
                      {tokens.length === 0 ? (
                        <div className="text-center py-8">
                          <Link2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                          <p className="font-medium text-gray-800">Nenhum link gerado</p>
                          <p className="text-sm text-gray-500 mt-1">
                            Gere um link quando for convidar um paciente específico a marcar horário.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                                <th className="text-left font-medium px-3 py-2">Tipo</th>
                                <th className="text-left font-medium px-3 py-2">Situação</th>
                                <th className="text-left font-medium px-3 py-2">Expira em</th>
                                <th className="px-3 py-2" />
                              </tr>
                            </thead>
                            <tbody>
                              {tokens.map((t) => {
                                const expirado = tokenExpirado(t);
                                const usado = Boolean(t.usadoEm);
                                const link = original?.slug ? urlToken(original.slug, t.token) : "";
                                return (
                                  <tr key={t.id} className="border-b border-border/50 hover:bg-muted/40">
                                    <td className="px-3 py-2 text-gray-800">{TIPO_TOKEN_LABEL[t.tipo]}</td>
                                    <td className="px-3 py-2">
                                      {usado ? (
                                        <Badge className="bg-sky-100 text-sky-800 border-0">Utilizado</Badge>
                                      ) : expirado ? (
                                        <Badge className="bg-gray-100 text-gray-600 border-0">Expirado</Badge>
                                      ) : (
                                        <Badge className="bg-emerald-100 text-emerald-800 border-0">Ativo</Badge>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-gray-600">{dataHoraBR(t.expiraEm)}</td>
                                    <td className="px-3 py-2">
                                      <div className="flex justify-end gap-1">
                                        {!usado && !expirado && link && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="gap-1.5"
                                            onClick={() => copiar(link, t.id)}
                                          >
                                            {copiado === t.id
                                              ? <Check className="h-3.5 w-3.5 text-emerald-600" />
                                              : <Copy className="h-3.5 w-3.5" />}
                                            Copiar
                                          </Button>
                                        )}
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="text-red-600 hover:text-red-700"
                                          onClick={() => setConfirmarRevogacao(t)}
                                          aria-label="Revogar link"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <p className="text-[11px] text-gray-400 mt-2">
                            {tokensAtivos.length} link(s) ativo(s) de {tokens.length} exibido(s).
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* -------------------------------------------------- preview */}
              <div className="lg:sticky lg:top-8 self-start w-full">
                <p className="text-xs text-gray-500 mb-2">Prévia do card público</p>
                <Card className="border-gray-100 overflow-hidden">
                  <div className="h-24 bg-emerald-600/10">
                    {perfil.capaUrl ? (
                      <img
                        src={perfil.capaUrl}
                        alt="Capa da página pública"
                        className="h-24 w-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-[11px] text-emerald-700/60">
                        sem imagem de capa
                      </div>
                    )}
                  </div>
                  <CardContent className="p-5 -mt-8">
                    <Avatar className="h-16 w-16 ring-4 ring-white">
                      {perfil.fotoUrl && <AvatarImage src={perfil.fotoUrl} alt={nomeClinica} />}
                      <AvatarFallback className="bg-emerald-600 text-white text-lg">
                        {iniciais}
                      </AvatarFallback>
                    </Avatar>

                    <h2 className="text-lg font-bold text-gray-900 mt-3">{nomeClinica}</h2>
                    <p className="text-xs text-gray-500 break-all">
                      {perfil.slug ? urlPublica(perfil.slug) : "endereço ainda não definido"}
                    </p>

                    {perfil.especialidades.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {perfil.especialidades.map((esp) => (
                          <Badge key={esp} className="bg-emerald-100 text-emerald-800 border-0 text-[11px]">
                            {esp}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <p className="text-sm text-gray-600 mt-3 whitespace-pre-line">
                      {perfil.bio.trim() || "A apresentação da clínica aparece aqui."}
                    </p>

                    {perfil.aceitaAgendamento && (
                      <Button
                        className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2 mt-4"
                        disabled
                      >
                        <CalendarCheck className="h-4 w-4" /> Agendar consulta
                      </Button>
                    )}

                    <div className="mt-4 pt-3 border-t border-gray-100">
                      {perfil.publicado ? (
                        <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                          <Eye className="h-3.5 w-3.5" /> Visível para qualquer pessoa com o endereço
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500 flex items-center gap-1.5">
                          <EyeOff className="h-3.5 w-3.5" /> Rascunho — ninguém de fora consegue abrir
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </main>

      <AlertDialog
        open={Boolean(confirmarRevogacao)}
        onOpenChange={(aberto) => { if (!aberto) setConfirmarRevogacao(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar este link?</AlertDialogTitle>
            <AlertDialogDescription>
              Quem já recebeu o endereço deixa de conseguir usá-lo imediatamente. A sua página
              pública continua no ar normalmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={revogar}>
              Revogar link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PaginaPublica;
