export interface WhatsAppChat {
    id: string; // remoteJid (e.g., 551199999999@s.whatsapp.net)
    name: string;
    profilePicUrl?: string;
    unreadCount?: number;
    lastMessage?: string | { // Allow string for flattened/normalized chats
        message?: {
            conversation?: string;
            imageMessage?: any;
            audioMessage?: any;
            extendedTextMessage?: {
                text?: string;
            };
        };
        key?: {
            fromMe?: boolean;
        };
        messageTimestamp?: number;
    };
    timestamp?: number; // Add top-level timestamp for sorting
    isGroup?: boolean;
}
