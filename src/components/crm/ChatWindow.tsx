import { Button } from "@/components/ui/button";
import { X, Paperclip, Send, Mic, Smile, Check, CheckCheck, Play, MoreVertical, MessageCircle } from "lucide-react";
import { WhatsAppChat } from "@/types/whatsapp";
import { useState, useEffect, useRef, useMemo } from "react";
import { EvolutionService } from "@/services/evolution";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useDemoMode } from "@/hooks/useDemoMode";
import { demoConversas } from "@/data/demoData";

interface ChatWindowProps {
  onClose: () => void;
  chat: WhatsAppChat;
}

// Media cache to prevent re-fetching
const mediaCache = new Map<string, string>();

// Sub-component for handling media loading with caching
const MediaDisplay = ({ msg, instanceName }: { msg: any, instanceName: string }) => {
    const [mediaSrc, setMediaSrc] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    
    const cacheKey = `${msg.mediaUrl}_${msg.type}`;

    useEffect(() => {
        const loadMedia = async () => {
            // Only attempt to load if there's actually a media URL
            if (!msg.mediaUrl) {
                setError(true);
                return;
            }

            // Check cache first
            if (mediaCache.has(cacheKey)) {
                setMediaSrc(mediaCache.get(cacheKey)!);
                return;
            }

            // If direct URL (not mmg), use it
            if (!msg.mediaUrl.includes("mmg.whatsapp.net")) {
                setMediaSrc(msg.mediaUrl);
                mediaCache.set(cacheKey, msg.mediaUrl);
                return;
            }

            if (!msg.originalMessage) {
                setError(true);
                return;
            }

            setLoading(true);
            try {
                const base64 = await EvolutionService.fetchMediaBase64(instanceName, msg.originalMessage);
                if (base64) {
                    const prefix = msg.type === "image" ? "data:image/jpeg;base64," : 
                                   msg.type === "audio" ? "data:audio/ogg;base64," : 
                                   msg.type === "video" ? "data:video/mp4;base64," : 
                                   msg.type === "sticker" ? "data:image/webp;base64," : "";
                    
                    const fullSrc = base64.startsWith("data:") ? base64 : `${prefix}${base64}`;
                    setMediaSrc(fullSrc);
                    mediaCache.set(cacheKey, fullSrc);
                } else {
                    setError(true);
                }
            } catch (e) {
                console.error("Media load error:", e);
                setError(true);
            } finally {
                setLoading(false);
            }
        };
        
        loadMedia();
    }, [cacheKey, msg, instanceName]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-gray-600"></div>
                <span className="text-xs text-gray-500">Carregando...</span>
            </div>
        );
    }
    
    if (error || !mediaSrc) {
        return null; // Don't show error, just skip rendering
    }

    if (msg.type === "image") {
        return (
            <div className="mb-1 rounded-lg overflow-hidden bg-gray-100">
                <img 
                    src={mediaSrc} 
                    alt="Imagem" 
                    className="max-w-full h-auto object-cover max-h-[400px] rounded-lg" 
                    loading="lazy"
                />
            </div>
        );
    }
    
    if (msg.type === "video") {
        return (
            <div className="mb-1 rounded-lg overflow-hidden bg-gray-900">
                <video src={mediaSrc} controls className="max-w-full h-auto max-h-[400px] rounded-lg" />
            </div>
        );
    }
    
    if (msg.type === "audio") {
        return (
            <div className="mb-1 flex items-center gap-2 min-w-[280px] bg-white/50 p-2.5 rounded-lg">
                <audio src={mediaSrc} controls className="w-full h-8" />
            </div>
        );
    }
    
    if (msg.type === "sticker") {
        return (
            <div className="mb-1 w-32 h-32 bg-transparent">
                <img src={mediaSrc} alt="Sticker" className="w-full h-full object-contain" />
            </div>
        );
    }

    return null;
};

const DateSeparator = ({ date }: { date: number }) => {
    const dateObj = new Date(date);
    let label = format(dateObj, "dd/MM/yyyy", { locale: ptBR });
    
    if (isToday(dateObj)) label = "Hoje";
    else if (isYesterday(dateObj)) label = "Ontem";

    return (
        <div className="flex justify-center my-6">
            <span className="bg-[#e1f4fb] text-[#54656f] text-[12.5px] px-3 py-1.5 rounded-md font-medium shadow-sm">
                {label}
            </span>
        </div>
    );
};

export const ChatWindow = ({ onClose, chat }: ChatWindowProps) => {
  const { isDemo } = useDemoMode();
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<any[]>([]); 
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  
  const [waitTime, setWaitTime] = useState<string>("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isDemo) return;
    const session = localStorage.getItem("user_session");
    if (session) {
        const { clinica_id } = JSON.parse(session);
        setInstanceName(`clinic_${clinica_id}`);
    }
  }, [isDemo]);

  useEffect(() => {
      const calculateWaitTime = () => {
          if (messages.length === 0) return;
          const lastMsg = messages[messages.length - 1];
          
          if (!lastMsg.fromMe) {
              const diff = Date.now() - lastMsg.timestamp;
              const days = Math.floor(diff / (1000 * 60 * 60 * 24));
              const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
              const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
              
              if (days > 0) setWaitTime(`${days}d ${hours}h ${minutes}m`);
              else if (hours > 0) setWaitTime(`${hours}h ${minutes}m`);
              else setWaitTime(`${minutes}m`);
          } else {
              setWaitTime("");
          }
      };
      
      calculateWaitTime();
      const interval = setInterval(calculateWaitTime, 30000); // Update every 30s
      return () => clearInterval(interval);
  }, [messages]);

  // --- Pipeline Logic ---
  const queryClient = useQueryClient();

  // 1. Fetch Stages
  const { data: stages } = useQuery({
    queryKey: ['pipeline-stages', instanceName],
    queryFn: async () => {
        if (isDemo) return [];
        if (!instanceName) return [];
        // Extract clinic_id from instanceName (clinic_UUID) or user session
        // Simpler: use localStorage as in other components
        const session = localStorage.getItem("user_session");
        if (!session) return [];
        const { clinica_id } = JSON.parse(session);

        const { data } = await supabase
            .from('pipeline_stages')
            .select('*')
            .eq('clinica_id', clinica_id)
            .order('ordem', { ascending: true });
        return data || [];
    },
    enabled: !!instanceName || isDemo
  });

  // 2. Fetch Current Lead Status
  const { data: currentLead } = useQuery({
    queryKey: ['lead-data', chat.id],
    queryFn: async () => {
        if (isDemo) return null;
        const phone = chat.id.split('@')[0];
        const session = localStorage.getItem("user_session");
        if (!session) return null;
        const { clinica_id } = JSON.parse(session);

        const { data } = await supabase
            .from('leads')
            .select('*')
            .eq('clinica_id', clinica_id)
            .ilike('telefone', `%${phone}%`) // Loose match or eq
            .limit(1)
            .single();
        return data;
    },
    enabled: !!chat.id && !isDemo
  });

  // 3. Mutation to Update Stage
  const updateStageMutation = useMutation({
    mutationFn: async (newStageId: string) => {
        if (!currentLead?.id) return;
        
        const { error } = await supabase
            .from('leads')
            .update({ stage_id: newStageId })
            .eq('id', currentLead.id);
        
        if (error) throw error;
    },
    onSuccess: () => {
        toast.success("Fase atualizada!");
        queryClient.invalidateQueries({ queryKey: ['lead-data', chat.id] });
        // Also invalidate Kanban queries if possible, or user will see update on refresh
    },
    onError: () => {
        toast.error("Erro ao atualizar fase");
    }
  });

  const loadMessages = async () => {
      if (isDemo) {
        const demoChat = demoConversas.find(c => c.id === chat.id);
        if (demoChat) {
          const history = demoChat.mensagens.map(m => ({
            id: m.id,
            fromMe: m.remetente === "clinica",
            type: "text",
            text: m.texto,
            time: format(new Date(m.data), "HH:mm"),
            timestamp: new Date(m.data).getTime()
          }));
          setMessages(history);
        }
        return;
      }
      // Ensure we have instanceName. If not, try to get from local storage immediately as fallback
      let currentInstance = instanceName;
      if (!currentInstance) {
           const session = localStorage.getItem("user_session");
           if (session) {
               const { clinica_id } = JSON.parse(session);
               currentInstance = `clinic_${clinica_id}`;
               setInstanceName(currentInstance);
           }
      }

      if (!currentInstance || !chat?.id) {
          console.log("Skipping loadMessages: Missing instance or chat ID", { currentInstance, chatId: chat?.id });
          return;
      }
      
      console.log("Loading messages for:", chat.id, "Instance:", currentInstance);

      const updateMessages = (rawMessages: any[]) => {
          const history = rawMessages.map((msg: any) => {
             const isMe = msg.fromMe !== undefined ? msg.fromMe : msg.key?.fromMe;
             // handle both DB and API formats if needed, or normalize DB to API format
             // DB format: content, from_me, created_at
             // API format: message: { conversation... }, key: { fromMe... }
             
             let type = "text";
             let content = "";
             let caption = "";
             let mediaUrl = "";
             let timestamp = 0;
             let msgId = msg.id || msg.key?.id;

             if (msg.created_at) {
                 // DB Format
                 timestamp = new Date(msg.created_at).getTime();
                 content = msg.content;
                 // Detect type based on connection? 
                 // We stored plain text content. For media, we need to inspect content or add column.
                 // For now, assume text or "Media".
                 if (content === "Media") type = "image"; // Simplified fallback
             } else {
                 // API Format
                 const messageContent = msg.message;
                 timestamp = Number(msg.messageTimestamp) * 1000;
                 
                 if (messageContent?.conversation) {
                     type = "text";
                     content = messageContent.conversation;
                 } else if (messageContent?.extendedTextMessage?.text) {
                     type = "text";
                     content = messageContent.extendedTextMessage.text;
                 } else if (messageContent?.imageMessage) {
                     type = "image";
                     content = "Imagem";
                     caption = messageContent.imageMessage.caption;
                     mediaUrl = messageContent.imageMessage.url; 
                 } // ... other types ...
             }

             // Re-normalize for consistency
             const date = new Date(timestamp);
             return {
                 id: msgId,
                 fromMe: isMe,
                 type,
                 text: content,
                 caption,
                 mediaUrl,
                 originalMessage: msg.originalMessage || msg, // Keep original for media logic
                 time: date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                 timestamp
             };
          });
          
          history.sort((a, b) => a.timestamp - b.timestamp);
          
          setMessages(prev => {
              if (prev.length === 0) return history;
              const lastPrevId = prev[prev.length - 1]?.id;
              const lastNewId = history[history.length - 1]?.id;
              if (lastPrevId === lastNewId && prev.length === history.length) return prev;
              return history;
          });
      };

      try {
          // 1. Fetch from DB (Cache)
          // Resolve internal chat ID first
          const { data: chatData } = await supabase
                .from('whatsapp_chats')
                .select('id')
                .eq('remote_jid', chat.id)
                .single(); // Remove strict instance filter for now to find by JID

          let dbMessages: any[] = [];
          if (chatData?.id) {
               const { data } = await supabase
                .from('whatsapp_messages')
                .select('*')
                .eq('chat_id', chatData.id)
                .order('created_at', { ascending: true });
               dbMessages = data || [];
          }
            
          if (dbMessages && dbMessages.length > 0) {
              // Normalize DB messages to UI format
              // Note: DB structure needs to fully support media to be perfect.
              // For now, we display text.
               const history = dbMessages.map((msg: any) => ({
                 id: msg.external_id || msg.id,
                 fromMe: msg.from_me,
                 type: "text", // Todo: store type in DB
                 text: msg.content,
                 caption: "",
                 mediaUrl: "",
                 originalMessage: null, 
                 time: new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                 timestamp: new Date(msg.created_at).getTime()
               }));
               setMessages(history);
          }

          // 2. Fetch from API (Sync)
          const data = await EvolutionService.fetchMessages(instanceName || "", chat.id);
          
          // 3. Update with full API data (includes media objects)
           const history = data.map((msg: any) => {
             const isMe = msg.key?.fromMe;
             const messageContent = msg.message;
             const msgId = msg.key?.id;
             
             let type = "text";
             let content = "";
             let caption = "";
             let mediaUrl = "";

             if (messageContent?.conversation) {
                 type = "text";
                 content = messageContent.conversation;
             } else if (messageContent?.extendedTextMessage?.text) {
                 type = "text";
                 content = messageContent.extendedTextMessage.text;
             } else if (messageContent?.imageMessage) {
                 type = "image";
                 content = "Imagem";
                 caption = messageContent.imageMessage.caption;
                 mediaUrl = messageContent.imageMessage.url; 
             } else if (messageContent?.videoMessage) {
                 type = "video";
                 content = "Vídeo";
                 caption = messageContent.videoMessage.caption;
                 mediaUrl = messageContent.videoMessage.url;
             } else if (messageContent?.audioMessage) {
                 type = "audio";
                 content = "Áudio";
                 mediaUrl = messageContent.audioMessage.url;
             } else if (messageContent?.stickerMessage) {
                 type = "sticker";
                 content = "Figurinha";
                 mediaUrl = messageContent.stickerMessage.url;
             }
             
             const timestamp = Number(msg.messageTimestamp) * 1000;
             const date = new Date(timestamp);

             return {
                 id: msgId,
                 fromMe: isMe,
                 type,
                 text: content,
                 caption,
                 mediaUrl,
                 originalMessage: msg,
                 time: date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                 timestamp
             };
          });

          history.sort((a, b) => a.timestamp - b.timestamp);
          setMessages(history);

      } catch (error) {
          console.error("Erro ao carregar mensagens", error);
      }
  };

  const handleSend = async () => {
    if (!msgText.trim()) return;
    if (!isDemo && !instanceName) return;
    
    const tempMsg = { 
        id: `temp_${Date.now()}`,
        fromMe: true, 
        type: "text",
        text: msgText, 
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), 
        timestamp: Date.now() 
    };
    
    setMessages(prev => [...prev, tempMsg]);
    const textToSend = msgText;
    setMsgText("");
    
    if (isDemo) {
      // Mock response after 1s
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: `demo_resp_${Date.now()}`,
          fromMe: false,
          type: "text",
          text: "Obrigado pelo seu contato! Como posso ajudar você hoje?",
          time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
          timestamp: Date.now()
        }]);
      }, 1000);
      return;
    }

    setSending(true);
    try {
        await EvolutionService.sendText(instanceName || "", chat.id, textToSend);
        // Message will be updated via polling
    } catch (error) {
        toast.error("Erro ao enviar mensagem");
        setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
    } finally {
        setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
  }

  useEffect(() => {
    if (isDemo) {
        loadMessages();
        return;
    }
    if (instanceName && chat?.id) {
        loadMessages();
        const interval = setInterval(loadMessages, 5000);
        return () => clearInterval(interval);
    }
  }, [instanceName, chat?.id, isDemo]);

  // Group messages by Date
  const groupedMessages = useMemo(() => {
      const groups: { date: number; msgs: any[] }[] = [];
      messages.forEach(msg => {
          const date = new Date(msg.timestamp).setHours(0,0,0,0);
          const group = groups.find(g => g.date === date);
          if (group) group.msgs.push(msg);
          else groups.push({ date, msgs: [msg] });
      });
      return groups;
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-[#efeae2] w-full relative">
      {/* WhatsApp Background Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.06] pointer-events-none" 
        style={{ 
            backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')",
            backgroundSize: '412.5px 749.25px'
        }}
      />

      {/* Header */}
      <div className="p-3 bg-[#f0f2f5] flex items-center justify-between shadow-sm z-10 border-b border-gray-200">
        <div className="flex items-center gap-3">
           <Avatar className="h-10 w-10 ring-2 ring-white">
             <AvatarImage src={chat.profilePicUrl} />
             <AvatarFallback className="bg-gray-300 text-gray-700 font-semibold text-sm">
                 {chat.name.substring(0, 2).toUpperCase()}
             </AvatarFallback>
           </Avatar>
           <div>
             <div className="flex items-center gap-2">
                 <h3 className="font-semibold text-[#111b21] text-[16px] leading-tight">{chat.name}</h3>
                 <span className="text-[11px] text-[#667781]">
                     {chat.id.split('@')[0]}
                 </span>
             </div>
             <div className="flex items-center gap-3 text-[11px] mt-0.5">
                <span className="bg-white px-2 py-0.5 rounded text-[#667781] font-medium border border-gray-200">
                    {isDemo ? "Demonstração" : "WhatsApp"}
                </span>
                
                {/* Stage Selector */}
                {((currentLead && stages && stages.length > 0) || isDemo) && (
                    <div className="h-6">
                        <Select 
                            value={isDemo ? (chat.id === 'demo-chat-1' ? 'qualified' : 'new') : currentLead?.stage_id} 
                            onValueChange={(val) => !isDemo && updateStageMutation.mutate(val)}
                            disabled={isDemo}
                        >
                            <SelectTrigger className="h-6 w-[140px] text-[11px] bg-white border-gray-200 text-gray-700 px-2 py-0 focus:ring-0 focus:ring-offset-0 gap-1 rounded shadow-sm">
                                <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                            <SelectContent>
                                {isDemo ? (
                                  <>
                                    <SelectItem value="new" className="text-xs">Novo Lead</SelectItem>
                                    <SelectItem value="qualified" className="text-xs">Qualificado</SelectItem>
                                    <SelectItem value="converted" className="text-xs">Convertido</SelectItem>
                                  </>
                                ) : (
                                  stages?.map((stage: any) => (
                                    <SelectItem key={stage.id} value={stage.id} className="text-xs">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${stage.cor || 'bg-gray-300'}`} style={{ backgroundColor: stage.cor && !stage.cor.startsWith('bg-') ? stage.cor : undefined }} />
                                            {stage.nome}
                                        </div>
                                    </SelectItem>
                                  ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Status Indicator */}
                {waitTime && !isDemo ? (
                    <span className="flex items-center gap-1 text-[#d9534f] font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#d9534f] animate-pulse"></span>
                        Aguardando {waitTime}
                    </span>
                ) : (
                    <span className="text-[#06cf9c] font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#06cf9c]"></span>
                        Atendimento Ativo
                    </span>
                )}
             </div>
           </div>
        </div>
        
            <Button 
                variant="outline" 
                size="sm" 
                className="text-[#00a884] border-[#00a884]/20 hover:bg-[#00a884]/5 h-8 gap-1.5 font-medium text-[13px] px-3 hidden md:flex"
            >
                <Play className="w-3.5 h-3.5" /> Participar
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-[#54656f] hover:bg-gray-100" onClick={onClose}>
                <X className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-[#54656f] hover:bg-gray-100">
                <MoreVertical className="w-4 h-4" />
            </Button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 z-10">
        {messages.length === 0 && (
             <div className="flex flex-col items-center justify-center h-full text-center text-[#667781]">
                 <div className="w-16 h-16 rounded-full bg-white/50 flex items-center justify-center mb-3">
                     <MessageCircle className="w-8 h-8 text-[#8696a0]" />
                 </div>
                 <p className="text-[14px] font-medium">Carregando conversa...</p>
             </div>
        )}

        {groupedMessages.map((group, grpIdx) => (
            <div key={grpIdx}>
                <DateSeparator date={group.date} />
                <div className="space-y-1">
                    {group.msgs.map((msg, idx) => (
                        <div 
                            key={msg.id || idx} 
                            className={`flex items-end gap-2 ${msg.fromMe ? 'flex-row-reverse' : 'flex-row'}`}
                        >
                            {/* Avatar - only for received messages */}
                            {!msg.fromMe && (
                                <Avatar className="h-7 w-7 mb-1 ring-1 ring-white/50 shadow-sm flex-shrink-0">
                                    <AvatarImage src={chat.profilePicUrl} />
                                    <AvatarFallback className="bg-white text-[#667781] text-[10px] font-semibold">
                                        {chat.name.substring(0, 1)}
                                    </AvatarFallback>
                                </Avatar>
                            )}

                            <div className={`
                                relative px-3 py-2 rounded-lg shadow-sm max-w-[65%] text-[14.2px] leading-[19px]
                                ${msg.fromMe 
                                    ? 'bg-[#d9fdd3] rounded-tr-none' 
                                    : 'bg-white rounded-tl-none'}
                            `}>
                                <MediaDisplay msg={msg} instanceName={instanceName || ""} />

                                {(msg.type === "text" || msg.caption) && (
                                    <p className="whitespace-pre-wrap break-words text-[#111b21] mb-1">
                                        {msg.caption || msg.text}
                                    </p>
                                )}

                                <div className="flex items-center justify-end gap-1 mt-1 select-none">
                                    <span className="text-[11px] text-[#667781]">
                                        {msg.time}
                                    </span>
                                    {msg.fromMe && (
                                        <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-2.5 bg-[#f0f2f5] z-10">
        <div className="flex items-center gap-2 max-w-6xl mx-auto">
           <div className="flex gap-1">
               <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-[#d1d7db] text-[#54656f]">
                   <Smile className="w-6 h-6" />
               </Button>
               <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-[#d1d7db] text-[#54656f]">
                   <Paperclip className="w-6 h-6" />
               </Button>
           </div>
           
           <div className="flex-1 relative">
                <input 
                    type="text" 
                    placeholder="Escreva uma mensagem" 
                    className="w-full pl-4 pr-3 py-2.5 rounded-lg bg-white focus:outline-none text-[15px] placeholder:text-[#667781] shadow-sm"
                    value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                />
           </div>

           <Button 
               size="icon" 
               className={`h-10 w-10 rounded-full shadow-md transition-all ${
                   msgText.trim() 
                       ? 'bg-[#00a884] hover:bg-[#008f6f]' 
                       : 'bg-[#00a884] hover:bg-[#008f6f]'
               }`}
               onClick={msgText.trim() ? handleSend : undefined}
               disabled={sending}
           >
               {msgText.trim() ? (
                   <Send className="w-5 h-5 text-white ml-0.5" />
               ) : (
                   <Mic className="w-5 h-5 text-white" />
               )}
           </Button>
        </div>
      </div>
    </div>
  );
};
