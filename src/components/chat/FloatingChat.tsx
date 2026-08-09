import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Loader2, MessageCircle, MessageSquare, Search, Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { subscribeChatRealtime, type WaChatRow, type WaMessageRow } from "@/services/whatsapp/realtime";
import { enqueueText, markChatRead } from "@/services/whatsapp/send";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { traduzErro } from "@/lib/erros";

// ============================================================================
// FloatingChat — o "botãozinho voando"
// ----------------------------------------------------------------------------
// Botão flutuante montado no AppShell: o chat acompanha o usuário em TODAS as
// telas do app (a recepção vive na agenda; a mensagem do paciente não pode
// depender de navegar até /conversas). Abre um drawer com lista → thread,
// usando os mesmos services da página cheia (outbox, realtime, markRead).
// Em /conversas o botão some — lá o chat já é a própria página.
// ============================================================================

export function FloatingChat() {
  const { clinicaId } = useTenant();
  const location = useLocation();
  const navigate = useNavigate();

  const [aberto, setAberto] = useState(false);
  const [chats, setChats] = useState<WaChatRow[]>([]);
  const [mensagens, setMensagens] = useState<WaMessageRow[]>([]);
  const [ativo, setAtivo] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [busca, setBusca] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  const naPaginaDeConversas = location.pathname.startsWith("/conversas");

  // O callback de realtime é criado uma vez; o chat aberto muda depois. Ref
  // evita reassinar o canal a cada troca de conversa.
  const ativoRef = useRef<string | null>(null);
  useEffect(() => {
    ativoRef.current = ativo;
  }, [ativo]);

  // Chats + não-lidos ficam atualizados MESMO com o drawer fechado: o badge do
  // botão é o aviso de mensagem nova, então a assinatura vive no botão, não no
  // conteúdo do drawer.
  useEffect(() => {
    if (!clinicaId) return;
    let vivo = true;
    (async () => {
      const { data } = await supabase
        .from("whatsapp_chats")
        .select("*")
        .eq("clinica_id", clinicaId)
        .is("archived_at", null)
        .order("last_message_time", { ascending: false, nullsFirst: false })
        .limit(50);
      if (vivo) setChats((data ?? []) as WaChatRow[]);
    })();
    const unsub = subscribeChatRealtime(clinicaId, {
      onNewMessage: (m) => {
        setMensagens((prev) =>
          m.chat_id === ativoRef.current && !prev.some((x) => x.id === m.id) ? [...prev, m] : prev,
        );
      },
      onMessageUpdated: (m) => {
        setMensagens((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      },
      onChatChanged: (c) => {
        setChats((prev) => {
          const i = prev.findIndex((x) => x.id === c.id);
          const novo = i >= 0 ? prev.map((x) => (x.id === c.id ? c : x)) : [c, ...prev];
          return [...novo].sort(
            (a, b) =>
              new Date(b.last_message_time ?? 0).getTime() -
              new Date(a.last_message_time ?? 0).getTime(),
          );
        });
      },
    }, "-float");
    return () => {
      vivo = false;
      unsub?.();
    };
  }, [clinicaId]);

  const abrirChat = useCallback(async (chatId: string) => {
    setAtivo(chatId);
    setCarregando(true);
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .limit(100);
    setCarregando(false);
    if (error) {
      toast.error("Erro ao abrir conversa");
      return;
    }
    setMensagens((data ?? []) as WaMessageRow[]);
    await markChatRead(chatId);
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, unread_count: 0 } : c)));
  }, []);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens.length]);

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

  if (!clinicaId || naPaginaDeConversas) return null;

  const naoLidas = chats.reduce((s, c) => s + (c.unread_count ?? 0), 0);
  const visiveis = chats.filter(
    (c) =>
      !busca ||
      (c.name ?? "").toLowerCase().includes(busca.toLowerCase()) ||
      (c.contact_phone ?? "").includes(busca),
  );
  const chatAtivo = chats.find((c) => c.id === ativo);

  return (
    <>
      {/* Botão flutuante */}
      <div className="fixed bottom-6 right-6 z-40">
        <Button
          onClick={() => setAberto(true)}
          size="icon"
          aria-label="Abrir conversas"
          className={cn(
            "h-14 w-14 rounded-full shadow-lg transition-all duration-300 hover:scale-105",
            "bg-brand-600 hover:bg-brand-700 text-white shadow-brand-900/20",
          )}
        >
          <MessageCircle className="h-7 w-7" />
          {naoLidas > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold h-5 min-w-[20px] flex items-center justify-center rounded-full border-2 border-background px-1">
              {naoLidas > 99 ? "99+" : naoLidas}
            </span>
          )}
        </Button>
      </div>

      {/* Drawer */}
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent side="right" className="w-full sm:w-[420px] sm:max-w-[420px] p-0 flex flex-col">
          {/* Cabeçalho */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            {ativo ? (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAtivo(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {chatAtivo?.name ?? chatAtivo?.contact_phone ?? "Conversa"}
                  </p>
                  {chatAtivo?.name && (
                    <p className="truncate text-xs text-muted-foreground">{chatAtivo.contact_phone}</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <MessageSquare className="h-5 w-5 text-brand-600" />
                <p className="flex-1 text-sm font-semibold">Conversas</p>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Abrir página completa"
              onClick={() => {
                setAberto(false);
                navigate("/conversas");
              }}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAberto(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {ativo ? (
            /* ---------------- Thread ---------------- */
            <>
              <div className="flex-1 space-y-2 overflow-y-auto bg-muted/40 p-4">
                {carregando ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  mensagens.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                        m.from_me
                          ? "ml-auto rounded-br-md bg-brand-600 text-white"
                          : "mr-auto rounded-bl-md bg-white",
                      )}
                    >
                      {m.content}
                    </div>
                  ))
                )}
                <div ref={fimRef} />
              </div>
              <div className="flex items-center gap-2 border-t border-border p-3">
                <Input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && enviar()}
                  placeholder="Escreva uma mensagem"
                  className="h-10"
                />
                <Button size="icon" className="h-10 w-10 shrink-0" disabled={enviando || !texto.trim()} onClick={enviar}>
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          ) : (
            /* ---------------- Lista ---------------- */
            <>
              <div className="border-b border-border p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou telefone"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="h-9 pl-9"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {visiveis.length === 0 ? (
                  <div className="p-8 text-center">
                    <MessageSquare className="mx-auto mb-2 h-10 w-10 text-muted-foreground/30" />
                    <p className="text-sm font-medium">Nenhuma conversa ainda</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Conecte uma instância de WhatsApp em Ajustes → Integrações.
                    </p>
                  </div>
                ) : (
                  visiveis.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => abrirChat(c.id)}
                      className="w-full border-b border-border/50 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate text-sm font-medium">{c.name ?? c.contact_phone}</span>
                        {(c.unread_count ?? 0) > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                            {c.unread_count}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.last_message_content ?? ""}</p>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
