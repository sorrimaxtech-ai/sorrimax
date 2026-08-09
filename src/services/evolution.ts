import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface EvolutionInstance {
  instance: {
    instanceName: string;
    instanceId: string;
    status: string;
  };
  hash: {
    apikey: string;
  };
}

export interface EvolutionQRCode {
  qrcode: {
    base64: string; // V2 returns base64 directly often
    code: string; 
  };
}

export class EvolutionService {
  private static get config() {
    // ⚠️ SEGURANÇA: a baseUrl e a apiKey GLOBAL da Evolution estavam hardcoded
    // aqui e iam pro bundle público — qualquer visitante do site lia a chave e
    // podia criar/apagar instância e ler mensagens de TODAS as clínicas.
    // Removidas em 06/08/2026 (a chave antiga precisa ser rotacionada).
    //
    // O caminho correto já existe e não expõe credencial no navegador:
    //   envio  → src/services/whatsapp/send.ts  (RPC + fila outbox)
    //   tempo real → src/services/whatsapp/realtime.ts (Supabase Realtime)
    // O token de cada instância vive em whatsapp_instances e só é legível pelo
    // backend (Edge Function com service_role).
    const baseUrl = import.meta.env.VITE_EVOLUTION_URL ?? "";
    const apiKey = import.meta.env.VITE_EVOLUTION_KEY ?? "";
    if (!baseUrl || !apiKey) {
      throw new Error(
        "EvolutionService desativado: credenciais não são mais embutidas no cliente. " +
          "Use src/services/whatsapp/send.ts (envio via fila) e realtime.ts.",
      );
    }
    return { baseUrl, apiKey };
  }

  private static get headers() {
    return {
      "Content-Type": "application/json",
      "apikey": this.config.apiKey,
    };
  }

  static async createInstance(instanceName: string): Promise<any> {
    const { baseUrl } = this.config;
    if (!baseUrl) throw new Error("URL da API não configurada");

    // V2: POST /instance/create
    const response = await fetch(`${baseUrl}/instance/create`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        instanceName: instanceName,
        token: crypto.randomUUID(), // Random token for security
        qrcode: true, // Auto-generate
        integration: "WHATSAPP-BAILEYS",
      }),
    });

    if (!response.ok) {
        // If 409, instance likely exists, try to connect/fetch QR
        if (response.status === 409 || response.status === 403) {
            return this.connectInstance(instanceName);
        }
        throw new Error("Falha ao criar instância");
    }

    return response.json();
  }

  static async connectInstance(instanceName: string): Promise<any> {
    const { baseUrl } = this.config;
    // V2: GET /instance/connect/{instanceName}
    const response = await fetch(`${baseUrl}/instance/connect/${instanceName}`, {
        method: "GET",
        headers: this.headers,
    });
    
    if (!response.ok) throw new Error("Falha ao buscar QR Code");
    return response.json();
  }

  static async deleteInstance(instanceName: string): Promise<void> {
    const { baseUrl } = this.config;
    // V2: DELETE /instance/delete/{instanceName}
    console.log(`Deleting instance: ${instanceName}`);
    await fetch(`${baseUrl}/instance/delete/${instanceName}`, {
      method: "DELETE",
      headers: this.headers,
    });
  }

  static async fetchInstanceStatus(instanceName: string): Promise<string> {
    const { baseUrl } = this.config;
    if (!baseUrl) return "disconnected";

    try {
        // V2: GET /instance/connectionState/{instanceName}
        const response = await fetch(`${baseUrl}/instance/connectionState/${instanceName}`, {
            method: "GET",
            headers: this.headers,
        });

        if (!response.ok) return "disconnected";
        
        const data = await response.json();
        // V2 response example: { instance: { state: "open" } }
        // V2 response example: { instance: { state: "open" } }
        return data?.instance?.state === "open" ? "connected" : "disconnected";
    } catch (error) {
        return "disconnected";
    }
  }

  static async fetchChats(instanceName: string): Promise<any[]> {
    const { baseUrl } = this.config;
    if (!baseUrl) return [];

    try {
        const session = localStorage.getItem("user_session");
        let clinicaId = null;
        let instanceUUID = null; // We need the UUID of the instance, not just the name

        if (session) {
            const { clinica_id } = JSON.parse(session);
            clinicaId = clinica_id;

            // 1. Fetch DB Chats (Instant Load)
            // First, get instance UUID
            const { data: instanceData } = await supabase
                .from('whatsapp_instances')
                .select('id')
                .eq('instance_id', instanceName)
                .single();

            if (instanceData) {
                instanceUUID = instanceData.id;
                const { data: dbChats } = await supabase
                    .from('whatsapp_chats')
                    .select('*')
                    .eq('instance_id', instanceUUID)
                    .neq('status', 'locked') // Filter locked in DB
                    .order('last_message_time', { ascending: false });

                // If DB has data, return it immediately (and sync in background? No, we wait for API to be consistent with UI flow for now)
                // Actually, to make it "Instant", the UI should probably load from DB first.
                // But this function returns a Promise. 
                // Currently, the UI awaits this. 
                // So we can return DB data + trigger background sync? 
                // Or simply Upsert after fetching.
                
                // Optimized Strategy:
                // Return DB data IF substantial, else wait for API.
                // For "lazy" sync, the UI needs to call "fetchFromDB" then "syncFromAPI".
                // Since I'm editing the Service, let's keep it simple: 
                // 1. Fetch API
                // 2. Filter Locked
                // 3. Upsert
                // 4. Return API (or DB if API fails)
                
                // But user wants SPEED.
                // So: UI should read DB. This service should SYNC.
                // Let's make this function do the SYNC and return the FRESH data.
                // To truly speed up the UI, ConversationList should use a direct DB subscription or specific "loadFromCache" call.
                // For this edit, I'll allow "fetchChats" to handle the SYNC part.
            }
        }

        // 2 Fetch API
        const response = await fetch(`${baseUrl}/chat/findChats/${instanceName}`, {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify({ where: {} })
        });

        if (!response.ok) return []; // Fallback to DB if API fails?
        
        const data = await response.json();
        const allChats = Array.isArray(data) ? data : (data?.messages || []);

        // 3. Filter & Map
        const validChats = allChats
            .filter((c: any) => !c.archive) // Filter Locked/Archived from API
            .map((chat: any) => ({
                 ...chat,
                 unreadCount: typeof chat.unreadCount === 'number' ? chat.unreadCount : 0
            }));

        // 4. Upsert to DB (Background-ish)
        if (clinicaId) {
             // Ensure Instance Exists in DB
             // This is expensive to check every time. Ideally done once check.
             // Assume instance_id = instanceName for lookup
             let currentInstanceUUID = instanceUUID;
             
             if (!currentInstanceUUID) {
                  // Try create/get
                   const { data: newInst } = await supabase
                    .from('whatsapp_instances')
                    .upsert({ 
                        clinica_id: clinicaId, 
                        name: instanceName, 
                        instance_id: instanceName,
                        status: 'connected'
                    }, { onConflict: 'instance_id' })
                    .select()
                    .single();
                   currentInstanceUUID = newInst?.id;
             }

             if (currentInstanceUUID && validChats.length > 0) {
                 const chatsToUpsert = validChats.map((c: any) => ({
                     instance_id: currentInstanceUUID,
                     remote_jid: c.id || c.remoteJid,
                     name: c.pushName || c.name || c.verifiedName,
                     profile_pic_url: c.profilePictureUrl,
                     unread_count: c.unreadCount,
                     last_message_content: c.lastMessage?.message?.conversation || "Media/Other",
                     last_message_time: c.date ? new Date(c.date * 1000).toISOString() : new Date().toISOString(),
                     status: c.archive ? 'locked' : 'open' // Explicitly sync status
                 }));

                 // Batch upsert?
                 const { error } = await supabase
                    .from('whatsapp_chats')
                    .upsert(chatsToUpsert, { onConflict: 'instance_id,remote_jid' });
                 
                 if (error) console.error("Error upserting chats:", error);
             }
        }
        
        return validChats;

    } catch (error) {
        console.error("Error fetching chats:", error);
        return [];
    }
  }

  static async fetchMessages(instanceName: string, chatId: string, limit: number = 20): Promise<any[]> {
    const { baseUrl } = this.config;
    if (!baseUrl) return [];

    try {
        // V2: POST /chat/findMessages/{instanceName}
        const response = await fetch(`${baseUrl}/chat/findMessages/${instanceName}`, {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify({
                where: {
                    key: {
                        remoteJid: chatId
                    }
                },
                options: {
                    limit: limit,
                    sort: {
                         order: "DESC" // or "ASC" depending on API default, usually we want latest
                    }
                }
            })
        });

        if (!response.ok) return [];

        const data = await response.json();
        const records = data?.messages?.records || [];

        // Upsert Messages to DB
        // Need to find chat_id first.
        try {
            const { data: chatData } = await supabase
                .from('whatsapp_chats')
                .select('id')
                .eq('remote_jid', chatId)
                .single();
            
            if (chatData?.id && records.length > 0) {
                 const msgsToUpsert = records.map((m: any) => ({
                     chat_id: chatData.id,
                     content: m.message?.conversation || m.message?.extendedTextMessage?.text || "Media",
                     from_me: m.key?.fromMe || false,
                     status: m.status || 'sent',
                     external_id: m.key?.id,
                     created_at: m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toISOString() : new Date().toISOString()
                 }));

                 await supabase
                    .from('whatsapp_messages')
                    .upsert(msgsToUpsert, { onConflict: 'chat_id, external_id' as any }); // assuming constraint, otherwise ignore duplicates
            }
        } catch (dbErr) {
             console.error("DB Sync Error (Messages):", dbErr);
        }

        return records;
    } catch (error) {
        console.error("Error fetching messages:", error);
        return [];
    }
  }

  static async fetchMediaBase64(instanceName: string, message: any, convertToMp4: boolean = false): Promise<string | null> {
      const { baseUrl } = this.config;
      if (!baseUrl) return null;
      
      try {
          // V2: POST /chat/getBase64FromMediaMessage/{instanceName}
          const response = await fetch(`${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
              method: "POST",
              headers: this.headers,
              body: JSON.stringify({
                  message,
                  convertToMp4
              })
          });

          if (!response.ok) return null;
          
          const data = await response.json();
          // Response format: { base64: "..." }
          return data?.base64 || null;
      } catch (error) {
          console.error("Error fetching media base64:", error);
          return null;
      }
  }

  static async sendText(instanceName: string, number: string, text: string): Promise<any> {
    const { baseUrl } = this.config;
    if (!baseUrl) return null;

    try {
        // V2: POST /message/sendText/{instanceName}
        const response = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify({
                number: number,
                text: text,
                options: {
                    delay: 1200,
                    presence: "composing",
                    linkPreview: false
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error(`Evolution API sendText failed: ${response.status} - ${errorData}`);
            throw new Error(`Failed to send message: ${response.status}`);
        }

        return response.json();
    } catch (error) {
        console.error("Error sending text:", error);
        throw error;
    }
  }

  static async markAsRead(instanceName: string, chatId: string): Promise<void> {
    const { baseUrl } = this.config;
    if (!baseUrl) return;

    try {
      // Evolution API v2 - mark specific chat as read
      await fetch(`${baseUrl}/chat/markMessageAsRead/${instanceName}`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          remoteJid: chatId
        })
      });
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  }

  /**
   * Mark chat as read in Supabase database
   * Updates last_read_at timestamp to NOW()
   */
  static async markChatAsRead(chatId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('whatsapp_chats')
        .update({ last_read_at: new Date().toISOString() })
        .eq('remote_jid', chatId);

      if (error) {
        console.error("Error updating last_read_at:", error);
      }
    } catch (error) {
      console.error("Error marking chat as read in DB:", error);
    }
  }
}
