import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Search, Send, Loader2, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { subscribeChatRealtime, type WaChatRow, type WaMessageRow } from "@/services/whatsapp/realtime";
import { enqueueText, markChatRead } from "@/services/whatsapp/send";
import { statusColor, statusIcon, type WaStatus } from "@/services/whatsapp/status";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { traduzErro } from "@/lib/erros";

// ============================================================================
// Conversas — inbox de WhatsApp
// ----------------------------------------------------------------------------
// Usa a infraestrutura já construída e até agora não ligada na UI:
//   · realtime.ts → Supabase Realtime (sem polling de 3s martelando o banco)
//   · send.ts     → enfileira via RPC; o worker envia e o status volta sozinho
//   · status.ts   → tick de status (✓ / ✓✓ / azul), regra igual à do banco
// Nenhuma credencial de WhatsApp passa pelo navegador.
// ============================================================================

const Conversas = () => {
  const { clinicaId, carregando: carregandoCtx } = useTenant();
  const [chats, setChats] = useState<WaChatRow[]>([]);
  const [mensagens, setMensagens] = useState<WaMessageRow[]>([]);
  const [ativo, setAtivo] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [busca, setBusca] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const fimRef = useRef<HTMLDivElement>(null);

  // --- carga inicial dos chats
  useEffect(() => {
    // sem clínica resolvida (ex.: demo sem sessão) o spinner ficava eterno
    // porque o setCarregando(false) vivia depois deste early-return.
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; }
    let vivo = true;
    (async () => {
      setCarregando(true);
      const { data, error } = await supabase
        .from("whatsapp_chats")
        .select("*")
        .eq("clinica_id", clinicaId)
        .is("archived_at", null)
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
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) { toast.error("Erro ao abrir conversa"); return; }
    setMensagens((data ?? []) as WaMessageRow[]);
    await markChatRead(chatId);
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, unread_count: 0 } : c)));
  }, []);

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
        setMensagens((prev) => (m.chat_id === ativoRef.current && !prev.some((x) => x.id === m.id) ? [...prev, m] : prev));
      },
      onMessageUpdated: (m) => {
        setMensagens((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      },
      onChatChanged: (c) => {
        setChats((prev) => {
          const i = prev.findIndex((x) => x.id === c.id);
          const novo = i >= 0 ? prev.map((x) => (x.id === c.id ? c : x)) : [c, ...prev];
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

  const visiveis = chats.filter((c) =>
    !busca || (c.name ?? "").toLowerCase().includes(busca.toLowerCase()) ||
    (c.contact_phone ?? "").includes(busca));
  const chatAtivo = chats.find((c) => c.id === ativo);

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 flex overflow-hidden h-full">
        {/* Lista de conversas */}
        <div className="w-80 border-r border-border bg-white flex flex-col shrink-0">
          <div className="p-4 border-b border-border">
            <h1 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <MessageSquare className="h-5 w-5 text-brand-600" /> Conversas
            </h1>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou telefone" value={busca}
                     onChange={(e) => setBusca(e.target.value)} className="pl-9 h-9" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {carregandoCtx || carregando ? (
              <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : visiveis.length === 0 ? (
              <div className="p-8 text-center">
                <MessageSquare className="h-10 w-10 mx-auto text-gray-300 mb-2" />
                <p className="text-sm font-medium text-gray-700">Nenhuma conversa ainda</p>
                <p className="text-xs text-gray-500 mt-1">
                  As conversas aparecem aqui assim que uma instância de WhatsApp
                  estiver conectada e receber mensagem.
                </p>
              </div>
            ) : visiveis.map((c) => (
              <button key={c.id} onClick={() => abrirChat(c.id)}
                className={cn("w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/50 transition-colors",
                  ativo === c.id && "bg-brand-50")}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-sm truncate">{c.name ?? c.contact_phone}</span>
                  {c.unread_count > 0 && (
                    <Badge className="bg-brand-600 hover:bg-brand-600 text-[10px] h-5 min-w-5 px-1.5">
                      {c.unread_count}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {c.last_message_content ?? "—"}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Janela do chat */}
        <div className="flex-1 min-w-0 flex flex-col bg-gray-50">
          {!chatAtivo ? (
            <div className="flex-1 min-w-0 flex flex-col items-center justify-center text-center gap-2">
              <MessageSquare className="h-12 w-12 text-gray-300" />
              <p className="text-sm font-medium text-gray-700">Selecione uma conversa</p>
            </div>
          ) : (
            <>
              <div className="h-16 border-b border-border bg-white px-5 flex items-center gap-3 shrink-0">
                <div className="h-9 w-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center">
                  <Phone className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{chatAtivo.name ?? chatAtivo.contact_phone}</p>
                  <p className="text-xs text-muted-foreground">{chatAtivo.contact_phone}</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-2">
                {mensagens.map((m) => (
                  <div key={m.id} className={cn("flex", m.from_me ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[70%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                      m.from_me ? "bg-brand-600 text-white rounded-br-sm" : "bg-white rounded-bl-sm")}>
                      {m.content || <em className="opacity-70">[{m.message_type}]</em>}
                      <div className={cn("flex items-center gap-1 justify-end mt-0.5 text-[10px]",
                        m.from_me ? "text-white/70" : "text-muted-foreground")}>
                        <span>{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                        {m.from_me && (
                          <span className={m.status === "read" || m.status === "played" ? "text-sky-300" : ""}>
                            {statusIcon(m.status as WaStatus)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={fimRef} />
              </div>

              <div className="p-4 border-t border-border bg-white flex gap-2 shrink-0">
                <Input value={texto} onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                  placeholder="Escreva uma mensagem..." disabled={enviando} />
                <Button onClick={enviar} disabled={enviando || !texto.trim()}
                        className="bg-brand-600 hover:bg-brand-700">
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Conversas;
