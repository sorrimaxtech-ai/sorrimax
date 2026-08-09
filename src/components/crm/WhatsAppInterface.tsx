import { useState, useEffect } from "react";
import { X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversationList } from "./ConversationList";
import { ChatWindow } from "./ChatWindow";
import { WhatsAppConnect } from "./WhatsAppConnect";
import { WhatsAppChat } from "@/types/whatsapp";

interface WhatsAppInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  initialPatient?: string;
}

export function WhatsAppInterface({ isOpen, onClose, initialPatient }: WhatsAppInterfaceProps) {
  const [selectedChat, setSelectedChat] = useState<WhatsAppChat | undefined>(undefined);
  
  // Sync prop with internal state when it changes (e.g. opening from Kanban)
  useEffect(() => {
    if (initialPatient) {
        // Temporary stub until we have a way to resolve name -> chat ID
        // This allows opening the window but sending might be disabled if ID is missing
        setSelectedChat({
            id: "", 
            name: initialPatient
        });
    }
  }, [initialPatient]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 md:p-8 animate-in fade-in duration-200">
      <div className="bg-background w-full max-w-[1400px] h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative animate-scale-up">
        
        {/* Close Button (Global) */}
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 z-50 p-2 bg-white/80 hover:bg-white rounded-full shadow-md transition-all md:hidden"
        >
            <X className="h-5 w-5 text-gray-600" />
        </button>

        {/* Left Sidebar: Conversations */}
        <div className="w-full md:w-[320px] lg:w-[380px] h-full border-r border-border bg-white z-10">
          <ConversationList 
            onSelectChat={setSelectedChat} 
            selectedChatId={selectedChat?.id}
          />
        </div>

        {/* Right Area: Chat or Empty State */}
        <div className="flex-1 h-full bg-[#efeae2] relative"> 
            {/* WhatsApp Web default background color approx */}
            <div 
                className="absolute inset-0 opacity-[0.06] pointer-events-none"
                style={{
                    backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')" // Standard WhatsApp doodle pattern
                }}
            />

            {selectedChat ? (
                // We need to slightly adjust ChatWindow to fit this container perfectly 
                // and potentially hide its internal close button since we have the modal structure
                <div className="h-full w-full flex flex-col">
                   <ChatWindow 
                      onClose={() => setSelectedChat(undefined)} // Back to empty state on close
                      chat={selectedChat} 
                   /> 
                </div>
            ) : (
                <div className="h-full w-full flex flex-col items-center justify-center bg-gray-50/50 relative">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={onClose}
                        className="absolute top-4 right-4 hidden md:flex z-50"
                    >
                        <X className="h-6 w-6 text-gray-500" />
                    </Button>
                    
                    {/* Connection Screen */}
                    <div className="w-full max-w-lg">
                        <WhatsAppConnect />
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
