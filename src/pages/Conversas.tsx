import { traduzErro } from "@/lib/erros";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare, Search, Send, Loader2, Smartphone, QrCode,
  MoreVertical, RefreshCw, Settings2, Paperclip, Archive,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useInstanciasWa } from "@/hooks/useInstanciasWa";
import { GerenciarWhatsAppDialog } from "@/components/whatsapp/GerenciarWhatsAppDialog";
import { AvatarContato } from "@/components/whatsapp/AvatarContato";
import { useNotificacaoChat } from "@/hooks/useNotificacaoChat";
import { MensagemBolha } from "@/components/whatsapp/MensagemBolha";
import { VincularPacienteBotao } from "@/components/whatsapp/VincularPacienteBotao";
import { RespostasRapidas } from "@/components/whatsapp/RespostasRapidas";
import { GravadorAudio } from "@/components/whatsapp/GravadorAudio";
import { formatarNumeroWa } from "@/services/whatsapp/instancias";
import { subscribeChatRealtime, type WaChatRow, type WaMessageRow } from "@/services/whatsapp/realtime";
import { enqueueText, enqueueMedia, markChatRead } from "@/services/whatsapp/send";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ============================================================================
// Conversas — inbox de WhatsApp
// ----------------------------------------------------------------------------
// Usa a infraestrutura já construída e até agora não ligada na UI:
//   · realtime.ts → Supabase Realtime (sem polling de 3s martelando o banco)
//   · send.ts     → enfileira via RPC; o worker envia e o status volta sozinho
//   · status.ts   → tick de status (✓ / ✓✓ / azul), regra igual à do banco
// Nenhuma credencial de WhatsApp passa pelo navegador.
// ============================================================================

/** Hora curta (14:32) para a lista de conversas e as bolhas. */
function horaCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Rótulo de dia para o separador: Hoje / Ontem / 09/08. */
function rotuloDia(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
  const mesmo = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mesmo(d, hoje)) return "Hoje";
  if (mesmo(d, ontem)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const Conversas = () => {
  const { clinicaId, carregando: carregandoCtx } = useTenant();
  // A gestão dos números vive aqui, e não só numa tela de configuração distante:
  // quem nota que "não chega mensagem" está olhando esta caixa de conversas.
  const wa = useInstanciasWa();
  const [gerenciar, setGerenciar] = useState(false);
  const [aba, setAba] = useState<"todas" | "nao_lidas" | "arquivadas">("todas");
  const notificar = useNotificacaoChat();
  const [params, setParams] = useSearchParams();
  const [chats, setChats] = useState<WaChatRow[]>([]);
  const [mensagens, setMensagens] = useState<WaMessageRow[]>([]);
  const [ativo, setAtivo] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [busca, setBusca] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const fimRef = useRef<HTMLDivElement>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  // --- carga inicial dos chats
  useEffect(() => {
    // sem clínica resolvida (ex.: demo sem sessão) o spinner ficava eterno
    // porque o setCarregando(false) vivia depois deste early-return.
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; }
    let vivo = true;
    (async () => {
      setCarregando(true);
      // Traz arquivadas também: quem filtra é a aba. Excluir aqui deixava a aba
      // "Arquivadas" eternamente vazia — a conversa arquivada sumia para sempre.
      const { data, error } = await supabase
        .from("whatsapp_chats")
        .select("*")
        .eq("clinica_id", clinicaId)
        .order("last_message_time", { ascending: false, nullsFirst: false })
        .limit(100);
      if (!vivo) return;
      if (error) toast.error("Erro ao carregar conversas", { description: traduzErro(error) });
      else setChats((data ?? []) as WaChatRow[]);
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [clinicaId, carregandoCtx]);

  // --- mensagens do chat aberto
  const abrirChat = useCallback(async (chatId: string) => {
    setAtivo(chatId);
    // DESC + reverse: pega as 50 mais RECENTES e mostra na ordem natural. Antes
    // era ASC limit(200) — abria as 200 mais ANTIGAS e a conversa parecia
    // congelada no passado. seqid como desempate para rajadas do mesmo segundo.
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .order("seqid", { ascending: false, nullsFirst: false })
      .limit(50);
    if (error) { toast.error("Erro ao abrir conversa"); return; }
    setMensagens(((data ?? []) as WaMessageRow[]).reverse());
    await markChatRead(chatId);
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, unread_count: 0 } : c)));
  }, []);

  // Veio de outra tela pedindo uma conversa específica (ex.: botão de chat na
  // lista de pacientes). Abre assim que a lista chegar e limpa o parâmetro, pra
  // um F5 não reabrir sozinho o que o usuário já fechou.
  const pedidoUrl = params.get("chat");
  useEffect(() => {
    if (!pedidoUrl || carregando) return;
    if (chats.some((c) => c.id === pedidoUrl)) {
      void abrirChat(pedidoUrl);
      setParams({}, { replace: true });
    }
  }, [pedidoUrl, carregando, chats, abrirChat, setParams]);

  // O chat aberto muda o tempo todo; o canal não pode. Ref deixa o callback ler
  // o chat atual sem o effect depender de `ativo` — senão cada troca de conversa
  // derrubava e reassinava o canal (perde mensagem em trânsito, induz reenvio).
  const ativoRef = useRef<string | null>(null);
  useEffect(() => { ativoRef.current = ativo; }, [ativo]);

  // --- realtime: substitui o polling (assina UMA vez por clínica)
  useEffect(() => {
    if (!clinicaId) return;
    return subscribeChatRealtime(clinicaId, {
      onNewMessage: (m) => {
        // Uma mensagem, um toque — mesmo que o atendente esteja em outra tela.
        // Só entrada: o eco do próprio envio não avisa nada a ninguém.
        if (!m.from_me) {
          notificar.tocar(1);
          notificar.avisarNavegador("Nova mensagem", m.content?.slice(0, 80) || "Mídia recebida");
        }
        if (m.chat_id === ativoRef.current) {
          setMensagens((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          // chegou mensagem no chat ABERTO: já está sendo lida, então marca lida
          // no servidor — senão o contador subiria e voltaria a zero na próxima
          // abertura, piscando um "não-lida" que o atendente já está vendo.
          if (!m.from_me) void markChatRead(m.chat_id);
        }
      },
      onMessageUpdated: (m) => {
        setMensagens((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      },
      onChatChanged: (c) => {
        setChats((prev) => {
          // o trigger incrementa unread_count de todo chat; se este é o que está
          // aberto, o contador não pode acender — o usuário está olhando pra ele.
          const cc = c.id === ativoRef.current ? { ...c, unread_count: 0 } : c;
          const i = prev.findIndex((x) => x.id === cc.id);
          const novo = i >= 0 ? prev.map((x) => (x.id === cc.id ? cc : x)) : [cc, ...prev];
          return [...novo].sort((a, b) =>
            new Date(b.last_message_time ?? 0).getTime() - new Date(a.last_message_time ?? 0).getTime());
        });
      },
    });
  }, [clinicaId]);

  // rola só quando CHEGA mensagem (não a cada render) — o bug do chat antigo
  // era rolar a tela pro fim a cada poll, impedindo ler o histórico.
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: "smooth" }); }, [mensagens.length]);

  const enviar = async () => {
    if (!ativo || !texto.trim() || enviando) return;
    setEnviando(true);
    try {
      await enqueueText(ativo, texto);
      setTexto("");
    } catch (e: any) {
      toast.error("Não foi possível enviar", { description: traduzErro(e) });
    } finally {
      setEnviando(false);
    }
  };

  const alternarArquivo = async (c: WaChatRow) => {
    const arquivando = !c.archived_at;
    const { error } = await supabase
      .from("whatsapp_chats")
      .update({ archived_at: arquivando ? new Date().toISOString() : null })
      .eq("id", c.id);
    if (error) { toast.error("Não foi possível arquivar", { description: traduzErro(error) }); return; }
    setChats((prev) => prev.map((x) =>
      x.id === c.id ? { ...x, archived_at: arquivando ? new Date().toISOString() : null } : x));
    toast.success(arquivando ? "Conversa arquivada" : "Conversa de volta à lista");
    if (arquivando) setAtivo(null);
  };

  const enviarArquivo = async (file: File) => {
    if (!ativo || enviando) return;
    // 25 MB é o teto do nosso armazenamento; avisar antes de subir evita o
    // usuário esperar o upload inteiro para receber uma recusa.
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Arquivo muito grande", { description: "O limite é 25 MB." });
      return;
    }
    setEnviando(true);
    try {
      await enqueueMedia(ativo, file, texto.trim() || undefined);
      setTexto("");
    } catch (e: any) {
      toast.error("Não foi possível enviar o arquivo", { description: traduzErro(e) });
    } finally {
      setEnviando(false);
    }
  };

  const totalNaoLidas = chats.reduce((s, c) => s + (c.unread_count ?? 0), 0);

  // Título da aba vira o painel de aviso quando a recepção está em outra tela.
  useEffect(() => { notificar.atualizarTitulo(totalNaoLidas); }, [totalNaoLidas, notificar]);
  useEffect(() => { notificar.pedirPermissao(); }, [notificar]);

  const visiveis = chats
    .filter((c) => {
      if (aba === "nao_lidas") return (c.unread_count ?? 0) > 0;
      if (aba === "arquivadas") return !!(c as any).archived_at;
      return !(c as any).archived_at; // "Todas" esconde arquivada, como no WhatsApp
    })
    .filter((c) =>
      !busca || (c.name ?? "").toLowerCase().includes(busca.toLowerCase()) ||
      (c.contact_phone ?? "").includes(busca));
  const chatAtivo = chats.find((c) => c.id === ativo);

  return (
    // h-full (não min-h-full): o AppShell trava a altura em h-screen e passa
    // ao conteúdo via flex-1. `min-h-full` colapsava para a altura do conteúdo
    // e deixava metade da tela como um vazio cinza. Aqui a moldura preenche e a
    // rolagem acontece só dentro de cada coluna.
    <div className="flex h-full bg-gray-50 overflow-hidden">
      <main className="flex-1 min-w-0 flex overflow-hidden">
        {/* Lista de conversas */}
        <div className="w-[340px] border-r border-border bg-white flex flex-col shrink-0 h-full">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-brand-600" /> Conversas
              </h1>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8"
                          aria-label="Opções do WhatsApp">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => setGerenciar(true)}>
                    <Settings2 className="h-4 w-4 mr-2" /> Números de WhatsApp
                  </DropdownMenuItem>
                  {wa.conectada && (
                    <DropdownMenuItem onClick={() => wa.sincronizar(wa.conectada!)}>
                      <RefreshCw className="h-4 w-4 mr-2" /> Atualizar situação
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Situação da linha: o usuário precisa saber se está recebendo, sem
                ter que caçar isso em outra tela. */}
            <button
              onClick={() => setGerenciar(true)}
              className="w-full mb-3 flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-left transition-colors hover:bg-muted/50"
            >
              <span className={cn("h-2 w-2 rounded-full shrink-0",
                wa.conectada ? "bg-emerald-500" : wa.falhouCarga ? "bg-amber-500" : "bg-gray-300")} />
              <Smartphone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="min-w-0 flex-1 truncate text-xs">
                {wa.carregando ? (
                  <span className="text-muted-foreground">Verificando a conexão…</span>
                ) : wa.falhouCarga ? (
                  // Não dá para dizer "nenhum conectado": a consulta nem chegou
                  // ao servidor. Afirmar isso seria a tela inventando um fato.
                  <span className="text-amber-700">Não deu para verificar a conexão</span>
                ) : wa.conectada ? (
                  <span className="text-gray-700">
                    {formatarNumeroWa(wa.conectada.owner_number)}
                  </span>
                ) : (
                  <span className="font-medium text-gray-700">Nenhum número conectado</span>
                )}
              </span>
              {!wa.carregando && !wa.conectada && !wa.falhouCarga && (
                <span className="shrink-0 text-[11px] font-medium text-brand-700">Conectar</span>
              )}
            </button>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou telefone" value={busca}
                     onChange={(e) => setBusca(e.target.value)} className="pl-9 h-9" />
            </div>

            {/* Abas: separam o que precisa de resposta do resto. "Não lidas" é
                a fila de trabalho da recepção; "Arquivadas" é o que saiu dela. */}
            <div className="flex items-center gap-1 mt-3 text-xs">
              {([
                ["todas", "Todas", null],
                ["nao_lidas", "Não lidas", totalNaoLidas],
                ["arquivadas", "Arquivadas", null],
              ] as const).map(([chave, rotulo, contador]) => (
                <button
                  key={chave}
                  onClick={() => setAba(chave as typeof aba)}
                  className={cn(
                    "px-2.5 py-1 rounded-full transition-colors font-medium",
                    aba === chave
                      ? "bg-brand-50 text-brand-700"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {rotulo}
                  {typeof contador === "number" && contador > 0 && (
                    <span className="ml-1 text-brand-600">{contador}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
            {carregandoCtx || carregando ? (
              <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : visiveis.length === 0 ? (
              // Vazio tem duas causas muito diferentes, e a saída de cada uma é
              // outra: sem número conectado, nada nunca vai chegar — a tela tem
              // que oferecer a conexão em vez de só explicar por que está vazia.
              <div className="p-8 text-center">
                <MessageSquare className="h-10 w-10 mx-auto text-gray-300 mb-2" />
                {busca ? (
                  <>
                    <p className="text-sm font-medium text-gray-700">Nada encontrado</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Nenhuma conversa com "{busca}".
                    </p>
                  </>
                ) : wa.falhouCarga ? (
                  <>
                    <p className="text-sm font-medium text-gray-700">
                      Não deu para verificar o WhatsApp
                    </p>
                    <p className="text-xs text-gray-500 mt-1 mb-4">{wa.falhouCarga}</p>
                    <Button variant="outline" size="sm" className="gap-2"
                            onClick={() => wa.carregar()}>
                      <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
                    </Button>
                  </>
                ) : wa.conectada ? (
                  <>
                    <p className="text-sm font-medium text-gray-700">Nenhuma conversa ainda</p>
                    <p className="text-xs text-gray-500 mt-1">
                      O número {formatarNumeroWa(wa.conectada.owner_number)} está conectado.
                      As conversas aparecem assim que alguém escrever para a clínica.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-700">Conecte o WhatsApp</p>
                    <p className="text-xs text-gray-500 mt-1 mb-4">
                      Leia um QR code com o celular da clínica e as mensagens dos pacientes
                      passam a chegar aqui.
                    </p>
                    <Button className="gap-2 bg-brand-600 hover:bg-brand-700"
                            onClick={() => setGerenciar(true)}>
                      <QrCode className="h-4 w-4" /> Conectar WhatsApp
                    </Button>
                  </>
                )}
              </div>
            ) : visiveis.map((c) => (
              <button key={c.id} onClick={() => abrirChat(c.id)}
                className={cn(
                  "group w-full text-left px-3 py-3 flex items-center gap-3 rounded-xl",
                  "transition-colors duration-200 hover:bg-muted/60",
                  ativo === c.id && "bg-brand-50/80",
                )}>
                <AvatarContato nome={c.name} telefone={c.contact_phone}
                               fotoUrl={c.profile_pic_url} tamanho="md" comCanal />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={cn(
                      "text-[14.5px] truncate transition-colors duration-200",
                      "group-hover:text-brand-700",
                      c.unread_count > 0 ? "font-semibold text-gray-900" : "font-medium text-gray-800",
                    )}>
                      {c.name ?? formatarNumeroWa(c.contact_phone)}
                    </span>
                    {c.last_message_time && (
                      <span className={cn(
                        "text-[10px] font-medium shrink-0",
                        c.unread_count > 0 ? "text-brand-600 font-bold" : "text-muted-foreground",
                      )}>
                        {horaCurta(c.last_message_time)}
                      </span>
                    )}
                  </div>

                  {/* etiquetas: paciente vinculado e arquivada — o que muda a
                      decisão de quem atende, sem precisar abrir a conversa */}
                  {(c.paciente_id || c.archived_at) && (
                    <div className="flex items-center gap-1 mt-1">
                      {c.paciente_id && (
                        <span className="inline-flex items-center gap-0.5 rounded-md bg-brand-50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-brand-700">
                          Paciente
                        </span>
                      )}
                      {c.archived_at && (
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-500">
                          Arquivada
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className={cn("text-xs truncate",
                      c.unread_count > 0 ? "text-gray-700" : "text-muted-foreground")}>
                      {c.last_message_content ?? "—"}
                    </p>
                    {c.unread_count > 0 && (
                      <Badge className="bg-brand-600 hover:bg-brand-600 text-[10px] h-5 min-w-5 px-1.5 shrink-0 rounded-full">
                        {c.unread_count}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Janela do chat */}
        <div className="flex-1 min-w-0 flex flex-col bg-gray-50 h-full">
          {!chatAtivo ? (
            <div className="flex-1 min-w-0 flex flex-col items-center justify-center text-center gap-2 px-6">
              <MessageSquare className="h-12 w-12 text-gray-300" />
              {!wa.carregando && !wa.conectada ? (
                <>
                  <p className="text-sm font-medium text-gray-700">
                    Nenhum número de WhatsApp conectado
                  </p>
                  <p className="text-xs text-gray-500 max-w-sm">
                    Conecte o celular da clínica para receber e responder mensagens sem sair
                    do sistema.
                  </p>
                  <Button className="mt-2 gap-2 bg-brand-600 hover:bg-brand-700"
                          onClick={() => setGerenciar(true)}>
                    <QrCode className="h-4 w-4" /> Conectar WhatsApp
                  </Button>
                </>
              ) : (
                <p className="text-sm font-medium text-gray-700">Selecione uma conversa</p>
              )}
            </div>
          ) : (
            <>
              <div className="h-16 border-b border-border bg-white px-5 flex items-center gap-3 shrink-0">
                <AvatarContato nome={chatAtivo.name} telefone={chatAtivo.contact_phone}
                               fotoUrl={chatAtivo.profile_pic_url} tamanho="md" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">
                    {chatAtivo.name ?? formatarNumeroWa(chatAtivo.contact_phone)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatarNumeroWa(chatAtivo.contact_phone)}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                            aria-label="Ações da conversa">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => alternarArquivo(chatAtivo)}>
                      <Archive className="h-4 w-4 mr-2" />
                      {chatAtivo.archived_at ? "Desarquivar" : "Arquivar conversa"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <VincularPacienteBotao
                  chatId={chatAtivo.id}
                  pacienteId={(chatAtivo as any).paciente_id ?? null}
                  telefone={chatAtivo.contact_phone}
                  nomeContato={chatAtivo.name}
                  onVinculado={(pid) =>
                    setChats((prev) => prev.map((c) =>
                      c.id === chatAtivo.id ? ({ ...c, paciente_id: pid } as WaChatRow) : c))}
                />
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1 bg-[#efeae2]/60">
                {mensagens.map((m, i) => {
                  const anterior = mensagens[i - 1];
                  const novoDia = !anterior || rotuloDia(anterior.created_at) !== rotuloDia(m.created_at);
                  // agrupa: mensagens seguidas do mesmo lado colam, com menos respiro
                  const mesmaSequencia = anterior && anterior.from_me === m.from_me && !novoDia;
                  return (
                    <div key={m.id}>
                      {novoDia && (
                        <div className="flex justify-center my-3">
                          <span className="rounded-lg bg-white px-3 py-1 text-[11.5px] font-medium text-[#54656f] shadow-sm">
                            {rotuloDia(m.created_at)}
                          </span>
                        </div>
                      )}
                      <div className={cn("flex", m.from_me ? "justify-end" : "justify-start",
                                          mesmaSequencia ? "mt-0.5" : "mt-2")}>
                        <MensagemBolha m={m} />
                      </div>
                    </div>
                  );
                })}
                <div ref={fimRef} />
              </div>

              <div
                className="relative px-4 pt-3 pb-3 bg-[#f0f2f5] border-t border-slate-200/60 shrink-0"
              >
                <RespostasRapidas
                  valor={texto}
                  nomeContato={chatAtivo.name}
                  onEscolher={(t) => setTexto(t)}
                />

                <input
                  ref={arquivoRef}
                  type="file"
                  className="hidden"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) enviarArquivo(f);
                    e.target.value = "";
                  }}
                />

                {/* items-end: os botões ficam colados no fundo quando o campo
                    cresce em várias linhas, como no WhatsApp. */}
                <div className="flex items-end gap-1">
                  <button
                    onClick={() => arquivoRef.current?.click()}
                    disabled={enviando}
                    aria-label="Anexar arquivo"
                    title="Foto, documento ou áudio"
                    className="p-2 rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 transition-all shrink-0 disabled:opacity-50"
                  >
                    <Paperclip className="h-[22px] w-[22px]" />
                  </button>

                  <div className="flex-1 relative">
                    <textarea
                      value={texto}
                      onChange={(e) => {
                        setTexto(e.target.value);
                        // cresce até um teto e depois rola por dentro
                        const el = e.currentTarget;
                        el.style.height = "auto";
                        el.style.height = `${Math.min(el.scrollHeight, 136)}px`;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }
                      }}
                      rows={1}
                      disabled={enviando}
                      placeholder="Mensagem (/ para respostas rápidas)"
                      className="w-full py-2.5 px-4 bg-white border-none rounded-lg text-[15px] leading-[1.45] text-[#111b21] placeholder:text-slate-400 focus:ring-0 outline-none resize-none overflow-y-auto max-h-[136px] block shadow-sm"
                    />
                  </div>

                  {/* Campo vazio mostra o microfone; com texto, o avião. É o
                      gesto do WhatsApp — a mão já sabe onde clicar. */}
                  {texto.trim() ? (
                    <Button onClick={enviar} disabled={enviando}
                            className="h-10 w-10 p-0 rounded-full bg-brand-600 hover:bg-brand-700 shrink-0 shadow-sm">
                      {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  ) : (
                    <GravadorAudio
                      enviando={enviando}
                      onEnviar={async (arquivo) => { await enviarArquivo(arquivo); }}
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <GerenciarWhatsAppDialog aberto={gerenciar} onOpenChange={setGerenciar} wa={wa} />
    </div>
  );
};

export default Conversas;
