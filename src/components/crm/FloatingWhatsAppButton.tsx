import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FloatingWhatsAppButtonProps {
  onClick: () => void;
  unreadCount?: number;
}

export function FloatingWhatsAppButton({ onClick, unreadCount = 3 }: FloatingWhatsAppButtonProps) {
  return (
    <div className="fixed bottom-6 right-6 z-40 group">
      <span className="absolute right-0 -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 text-white text-xs py-1 px-3 rounded-lg mb-2 whitespace-nowrap pointer-events-none">
        Abrir Chat
      </span>
      <Button
        onClick={onClick}
        size="icon"
        className={cn(
          "h-14 w-14 rounded-full shadow-lg transition-all duration-300 hover:scale-105",
          "bg-green-600 hover:bg-green-700 text-white hover:shadow-green-900/20"
        )}
      >
        <MessageCircle className="h-7 w-7" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold h-5 min-w-[20px] flex items-center justify-center rounded-full border-2 border-background">
            {unreadCount}
          </span>
        )}
      </Button>
    </div>
  );
}
