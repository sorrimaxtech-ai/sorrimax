import { Search, MoreVertical, RefreshCw, MessageCircle, Mic, Users, User } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { EvolutionService } from "@/services/evolution";
import { toast } from "sonner";
import { WhatsAppChat } from "@/types/whatsapp";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useDemoMode } from "@/hooks/useDemoMode";
import { demoConversas } from "@/data/demoData";

interface ConversationListProps {
  onSelectChat: (chat: WhatsAppChat) => void;
  selectedChatId?: string;
}

export function ConversationList({ onSelectChat, selectedChatId }: ConversationListProps) {
  const { isDemo } = useDemoMode();
  const [chats, setChats] = useState<WhatsAppChat[]>([]);
  const [loading, setLoading] = useState(false);
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [previousChats, setPreviousChats] = useState<Map<string, number>>(new Map());
  const [activeTab, setActiveTab] = useState("contacts");

  useEffect(() => {
    if (isDemo) return;
    const session = localStorage.getItem("user_session");
    if (session) {
        const { clinica_id } = JSON.parse(session);
        setInstanceName(`clinic_${clinica_id}`);
    } else {
        // ⚠️ Havia aqui um UUID de clínica FIXO como fallback. Como a sessão
        // nunca era gravada, esse era o caminho SEMPRE tomado — e qualquer
        // visitante carregava as conversas daquela clínica específica.
        // Sem clínica resolvida, não se carrega conversa nenhuma.
        setInstanceName("");
    }
  }, [isDemo]);

  useEffect(() => {
    if (isDemo) {
      loadChats();
      return;
    }
    if (instanceName) {
        loadChats();
        // Polling interval
        const interval = setInterval(loadChats, 3000);
        return () => clearInterval(interval);
    }
  }, [instanceName, isDemo]);

  // Local unread tracking using localStorage to persist across reloads
  const getReadTimestamp = (chatId: string) => {
      const stored = localStorage.getItem(`chat_last_read_${chatId}`);
      return stored ? Number(stored) : 0;
  };

  const setReadTimestamp = (chatId: string, timestamp: number) => {
      localStorage.setItem(`chat_last_read_${chatId}`, timestamp.toString());
  };


  // When chat is selected, mark it as read (update timestamp)
  useEffect(() => {
    if (selectedChatId && instanceName) {
        // Find the chat to get its current timestamp
        const chat = chats.find(c => c.id === selectedChatId);
        if (chat) {
             const now = Math.floor(Date.now() / 1000);
             setReadTimestamp(selectedChatId, chat.timestamp || now);
             EvolutionService.markAsRead(instanceName, selectedChatId);

             // Force re-render to clear badge immediately
             setChats(prev => prev.map(c => 
                 c.id === selectedChatId ? { ...c, unreadCount: 0 } : c
             ));
        }
    }
  }, [selectedChatId, instanceName]);

  const loadChats = async () => {
    if (isDemo) {
      const normalizedDemoChats: WhatsAppChat[] = demoConversas.map(chat => ({
        id: chat.id,
        name: chat.nome,
        profilePicUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${chat.id}`,
        unreadCount: chat.nao_lidas,
        lastMessage: chat.mensagens[chat.mensagens.length - 1]?.texto || "",
        timestamp: Math.floor(new Date(chat.data_ultima_mensagem).getTime() / 1000),
        isGroup: false
      }));
      setChats(normalizedDemoChats);
      return;
    }
    if (!instanceName) return;
    
    // Initial load? Try DB first if we haven't yet (or if loading)
    // Actually, let's always try DB first if we don't have chats, OR if we want to refresh.
    // To minimize jitter, we can just load from DB then sync.
    // But since fetchChats now returns API data, we might want to:
    // 1. Load DB (setChats)
    // 2. Fetch API (background update to DB)
    // 3. Subscription handles the rest? or we re-fetch DB?
    
    // Simpler: fetchChats (Service) returns CACHED data if I changed it to do so?
    // No, I changed it to Sync.
    // So here:
    
    const wasEmpty = chats.length === 0;
    if (wasEmpty) setLoading(true);

    try {
        // Optimized: Parallel execution or Sequential?
        // 1. Get from DB (Cache) - Only if empty or explicit refresh (but efficient)
        // Since we poll every 5s, we don't want to query DB every 5s if nothing changed.
        // But for "loading speed", the first call matters.
        
        let initialData: WhatsAppChat[] = [];
        
        if (wasEmpty) {
            console.log('[ConversationList] Loading from DB, instanceName:', instanceName);
            // First, get the instance ID
            const { data: instanceData, error: instanceError } = await supabase
                .from('whatsapp_instances')
                .select('id')
                .eq('instance_id', instanceName)
                .single();

            console.log('[ConversationList] Instance query result:', { instanceData, instanceError });

            if (instanceData) {
                const { data: dbData, error: dbError } = await supabase
                    .from('whatsapp_chats')
                    .select('*')
                    .eq('instance_id', instanceData.id)
                    .neq('status', 'locked')
                    .order('last_message_time', { ascending: false });

                console.log('[ConversationList] Chats query result:', { count: dbData?.length, dbError });
                console.log('[ConversationList] First chat:', dbData?.[0]);

                if (dbData && dbData.length > 0) {
                     initialData = dbData.map((c: any) => ({
                        id: c.remote_jid,
                        name: c.name || c.remote_jid,
                        profilePicUrl: c.profile_pic_url,
                        unreadCount: c.unread_count,
                        lastMessage: c.last_message_content,
                        timestamp: new Date(c.last_message_time).getTime() / 1000,
                        isGroup: c.remote_jid.includes("@g.us") || c.remote_jid.length > 15 && !c.remote_jid.includes("@s.whatsapp.net") // heuristic
                     }));
                     setChats(initialData);
                     setLoading(false); 
                }
            }
        }

        // 2. Sync with API (Service does upsert)
        const data = await EvolutionService.fetchChats(instanceName);
        console.log('[ConversationList] Raw API Chats:', data); // DEBUG Raw response

        // 3. Normalize API Data
        const normalizedChats: WhatsAppChat[] = data.map((chat: any) => {
            let unreadCount = typeof chat.unreadCount === 'number' ? chat.unreadCount : 0;
            const chatId = chat.remoteJid || chat.key?.remoteJid || chat.id;
            
            // Fix Timestamp Parsing (Seconds vs Milliseconds)
            let timestamp = Number(chat.messageTimestamp || chat.timestamp || chat.conversationTimestamp || 0);
            if (timestamp > 1000000000000) timestamp = Math.floor(timestamp / 1000); // Convert ms to sec if needed

            // Improved Group Detection
            const isGroup = chatId?.includes("@g.us") || (chat.participants && chat.participants.length > 0) || chat.isGroup === true;

            // Extract Last Message Content reliably
            const lastMsgContent = chat.lastMessage || chat.message?.conversation || chat.message?.extendedTextMessage?.text || "";

            // Badge Logic
            const lastRead = getReadTimestamp(chatId);
            if (lastRead > timestamp) {
                unreadCount = 0;
            }

            return {
                id: chatId,
                name: chat.pushName || chat.verifiedName || chat.name || chatId?.split('@')[0] || "Desconhecido",
                profilePicUrl: chat.profilePicUrl || chat.profilePictureUrl,
                unreadCount: unreadCount,
                lastMessage: lastMsgContent,
                timestamp: timestamp,
                isGroup: isGroup
            };
        });

        // MERGE LOGIC: Deep merge to preserve existing data if API returns partial info
        setChats(currentChats => {
            const currentMap = new Map(currentChats.map(c => [c.id, c]));
            const apiMap = new Map(normalizedChats.map(c => [c.id, c]));

            const combinedIds = new Set([...currentMap.keys(), ...apiMap.keys()]);
            const mergedList: WhatsAppChat[] = [];

            combinedIds.forEach(id => {
                const current = currentMap.get(id);
                const api = apiMap.get(id);

                if (current && api) {
                    // Smart Merge: STRICTLY protect existing rich data
                    
                    // define "Good Name": Not an ID (no @), not "Desconhecido", not the ID itself
                    const currentNameIsGood = current.name && !current.name.includes('@') && current.name !== current.id && current.name !== "Desconhecido";
                    
                    // API often returns just the remoteJid as name if contact is not saved in phone
                    const apiNameIsBad = !api.name || api.name.includes('@') || api.name === api.id || api.name === "Desconhecido";

                    // Determine Name
                    let finalName = api.name;
                    if (currentNameIsGood) {
                         // If we have a good name locally, KEEPT IT unless API sends a better one (unlikely if API is sending ID)
                         // Even if API sends a "good" name, if it's different, we might want to keep our local rename.
                         // For now: Keep local if it's good.
                         finalName = current.name;
                    } else if (apiNameIsBad) {
                        // Both are bad, try to format the ID at least
                        finalName = api.id.split('@')[0];
                    }

                    mergedList.push({
                        ...api,
                        name: finalName,
                        
                        // Protect Message: Keep current message if API sends empty or just "Mensagem" stub
                        lastMessage: (api.lastMessage && api.lastMessage !== "Mensagem") ? api.lastMessage : (current.lastMessage || api.lastMessage), 
                        
                        // Protect Timestamp: Keep current if API is zero
                        timestamp: api.timestamp || current.timestamp,
                        
                        // Protect Profile Pic: Keep current if API is empty
                        profilePicUrl: api.profilePicUrl || current.profilePicUrl
                    });
                } else if (api) {
                    mergedList.push(api);
                } else if (current) {
                    mergedList.push(current);
                }
            });

            // Re-sort by timestamp
            mergedList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            
            return mergedList;
        });

        const newMap = new Map();
        normalizedChats.forEach(chat => newMap.set(chat.id, chat.unreadCount));
        setPreviousChats(newMap);

    } catch (error) {
        console.error("Erro ao carregar chats", error);
    } finally {
        if (wasEmpty) setLoading(false);
    }
  };

  const filteredChats = chats.filter(chat => {
    const matchesSearch = chat.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (activeTab === "groups") {
        return matchesSearch && chat.isGroup;
    }
    if (activeTab === "contacts") {
        return matchesSearch && !chat.isGroup;
    }
    return matchesSearch;
  });

  const formatTime = (timestamp?: number) => {
      if (!timestamp) return "";
      const date = new Date(timestamp * 1000);
      
      if (isToday(date)) {
          return format(date, "HH:mm", { locale: ptBR });
      } else if (isYesterday(date)) {
          return "Ontem";
      } else {
          return format(date, "dd/MM", { locale: ptBR });
      }
  };

  const getLastMessagePreview = (chat: WhatsAppChat) => {
      const msg = chat.lastMessage;
      if (!msg) return ""; // Empty if nothing

      // If it's a simple string (from DB or simplified API), return it
      if (typeof msg === "string") return msg;
      
      const content = msg.message || msg;

      if (content?.conversation) return content.conversation;
      if (content?.extendedTextMessage?.text) return content.extendedTextMessage.text;
      if (content?.imageMessage) return "📷 Foto";
      if (content?.videoMessage) return "🎥 Vídeo";
      if (content?.audioMessage) return "🎵 Áudio";
      if (content?.stickerMessage) return "🎨 Figurinha";
      
      return "Mensagem";
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-[#e9edef]">
      {/* Header */}
      <div className="p-3 bg-[#f0f2f5] border-b border-[#e9edef] flex items-center justify-between">
         <h2 className="text-[20px] font-semibold text-[#111b21]">Conversas</h2>
         <div className="flex gap-1">
             <Button 
                 variant="ghost" 
                 size="icon" 
                 onClick={loadChats} 
                 title="Atualizar" 
                 className="h-9 w-9 text-[#54656f] hover:bg-[#d1d7db] rounded-full"
             >
                 <RefreshCw className={cn("h-5 w-5", loading && "animate-spin")} />
             </Button>
             <Button 
                 variant="ghost" 
                 size="icon" 
                 className="h-9 w-9 text-[#54656f] hover:bg-[#d1d7db] rounded-full"
             >
                 <MoreVertical className="h-5 w-5" />
             </Button>
         </div>
      </div>

      {/* Search */}
      <div className="p-2 bg-white border-b border-[#e9edef]">
        <div className="relative">
             <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#667781]" />
             <Input 
                placeholder="Pesquisar ou começar uma nova conversa" 
                className="pl-10 bg-[#f0f2f5] border-none focus-visible:ring-0 h-9 text-[15px] placeholder:text-[#667781] rounded-lg"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
             />
        </div>
      </div>

      {/* Tabs */}
      <div className="px-2 pt-2 bg-white">
          <Tabs defaultValue="contacts" value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full grid grid-cols-2 h-9 bg-[#f0f2f5] p-1">
                  <TabsTrigger 
                    value="contacts" 
                    className="text-[13px] data-[state=active]:bg-white data-[state=active]:text-[#00a884] data-[state=active]:shadow-sm"
                  >
                    Contatos
                  </TabsTrigger>
                  <TabsTrigger 
                    value="groups" 
                    className="text-[13px] data-[state=active]:bg-white data-[state=active]:text-[#00a884] data-[state=active]:shadow-sm"
                  >
                    Grupos
                  </TabsTrigger>
              </TabsList>
          </Tabs>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {loading && chats.length === 0 && (
              <div className="p-8 text-center text-[14px] text-[#667781]">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#00a884] border-t-transparent mx-auto mb-3"></div>
                  Carregando conversas...
              </div>
          )}
          
          {!loading && chats.length === 0 && (
              <div className="p-12 text-center text-[14px] text-[#667781]">
                  <div className="w-16 h-16 rounded-full bg-[#f0f2f5] flex items-center justify-center mx-auto mb-3">
                      <MessageCircle className="w-8 h-8 text-[#8696a0]" />
                  </div>
                  Nenhuma conversa encontrada
                  <div className="text-[12px] text-[#8696a0] mt-1">
                      Suas conversas sincronizadas aparecerão aqui.
                  </div>
              </div>
          )}

          {filteredChats.map((chat) => {
            const lastMsg = getLastMessagePreview(chat);
            const time = formatTime(chat.timestamp);
            const isUnread = chat.unreadCount > 0;

            return (
                <div
                    key={chat.id}
                    onClick={() => onSelectChat(chat)}
                    className={cn(
                        "flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors border-b border-[#e9edef]",
                        selectedChatId === chat.id 
                            ? "bg-[#f0f2f5]" 
                            : "hover:bg-[#f5f6f6]"
                    )}
                >
                    <Avatar className="h-12 w-12 flex-shrink-0 ring-1 ring-gray-100">
                        <AvatarImage src={chat.profilePicUrl} />
                        <AvatarFallback className="bg-[#dfe5e7] text-[#54656f] font-semibold text-[15px]">
                            {chat.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-0.5">
                            <span className={cn(
                                "font-medium text-[16px] truncate",
                                isUnread ? "text-[#111b21]" : "text-[#111b21]"
                            )}>
                                {chat.name}
                            </span>
                            <span className={cn(
                                "text-[12px] ml-2 flex-shrink-0",
                                isUnread ? "text-[#00a884] font-medium" : "text-[#667781]"
                            )}>
                                {time}
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center gap-2">
                            <p className={cn(
                                "text-[14px] truncate flex-1 min-w-0",
                                isUnread ? "text-[#111b21] font-medium" : "text-[#667781]"
                            )}>
                                {lastMsg}
                            </p>
                            
                            {isUnread && (
                                <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-[#00a884] text-white text-[12px] font-semibold flex-shrink-0">
                                    {chat.unreadCount}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
