import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Patient } from "@/types/patient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Calendar, Clock, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface PatientCardProps {
  patient: Patient;
  onClick: () => void;
  onChatClick?: (patient: Patient) => void;
}

export function PatientCard({ patient, onClick, onChatClick }: PatientCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: patient.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "group relative bg-white p-4 rounded-xl border border-border/40 shadow-sm hover:shadow-md transition-all cursor-pointer",
        isDragging && "opacity-50 rotate-2 scale-105 shadow-xl ring-2 ring-primary/20",
        "hover:border-primary/20"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <Avatar className="h-10 w-10 border border-gray-100 bg-gray-50 text-emerald-600 font-semibold relative overflow-visible">
          <AvatarImage src={patient.avatar} alt={patient.name} className="rounded-full overflow-hidden" />
          <AvatarFallback className="bg-emerald-50 text-emerald-600">
             {getInitials(patient.name)}
          </AvatarFallback>
          {/* Notification Badge */}
          {patient.unread_messages && patient.unread_messages > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-white animate-in zoom-in duration-300">
                  {patient.unread_messages}
              </span>
          )}
        </Avatar>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
             <div className="flex items-start justify-between">
                <div>
                   <h3 className="font-semibold text-gray-900 truncate pr-2">{patient.name}</h3>
                   <div className="flex flex-col gap-0.5">
                       <p className="text-xs text-gray-500 truncate">{patient.service}</p>
                       {patient.phone && (
                           <div className="flex items-center gap-1 text-[10px] text-gray-400">
                               <Phone className="h-3 w-3" />
                               <span>{patient.phone}</span>
                           </div>
                       )}
                   </div>
                </div>
                {patient.priority === "high" && (
                    <span className="w-2 h-2 rounded-full bg-red-500 mt-1.5" title="Prioridade Alta" />
                )}
             </div>

          {/* Date & Time */}
          <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
             <div className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                <span>{patient.date}</span>
             </div>
             {patient.time && (
                 <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{patient.time}</span>
                 </div>
             )}
          </div>

            {/* Tags & Value */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
               <div className="flex flex-wrap gap-1">
                   {/* Health Plan Badge */}
                   {patient.healthPlan && (
                       <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                           {patient.healthPlan}
                       </Badge>
                   )}
                   
                   {/* Tags */}
                   {patient.tags && patient.tags.map((tag, idx) => (
                       <Badge key={idx} variant="outline" className="h-5 px-1.5 text-[10px] font-normal border-gray-200 text-gray-600">
                           {tag}
                       </Badge>
                   ))}
               </div>
               
               {patient.value && (
                   <span className="text-xs font-medium text-gray-700">
                       {patient.value}
                   </span>
               )}
            </div>

            {/* Actions (Always Visible on Hover) */}
            <div className="absolute top-2 right-2 hidden group-hover:flex">
               {onChatClick && (
                    <Button
                        size="icon"
                        variant="ghost" 
                        onClick={(e) => {
                            e.stopPropagation();
                            onChatClick(patient);
                        }}
                        className="h-7 w-7 rounded-full bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700 shadow-sm"
                        title="Abrir WhatsApp"
                    >
                        <MessageCircle className="h-4 w-4" />
                    </Button>
               )}
            </div>
            {/* Removed bottom actions in favor of top right */}
        </div>
      </div>
    </div>
  );
}
