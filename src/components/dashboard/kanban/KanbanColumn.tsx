import { Column, Patient } from "@/types/patient";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { PatientCard } from "./PatientCard";
import { useDroppable } from "@dnd-kit/core";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface KanbanColumnProps {
  column: Column;
  onPatientClick: (patient: Patient) => void;
  onChatClick?: (patient: Patient) => void;
  onDelete?: () => void;
}

export function KanbanColumn({ column, onPatientClick, onChatClick, onDelete }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({
    id: column.id,
  });

  // Map bg colors to border colors for the top strip
  const getBorderColor = (colorClass: string) => {
    if (colorClass.includes("blue")) return "border-blue-500"; // Agendados (Keep distinct for now)
    if (colorClass.includes("green")) return "border-emerald-500"; // Confirmados
    if (colorClass.includes("yellow")) return "border-yellow-500"; // Waiting
    return "border-gray-200"; // New
  };

  return (
    <div className="flex flex-col w-[350px] min-w-[350px] h-full bg-white rounded-xl shadow-sm border border-border/40">
      {/* Colored Top Border */}
      <div className={cn("h-1 w-full rounded-t-xl", column.color.replace("bg-", "bg-"))} />

      {/* Column Header */}
      <div className="flex items-center justify-between p-4 pb-2">
        <div className="flex items-center gap-2">
           {/* Color Dot */}
          <div className={cn("w-2 h-2 rounded-full", column.color)} />
          <h2 className="font-semibold text-sm text-gray-700">{column.title}</h2>
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-xs font-medium text-gray-600">
            {column.patients.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-600">
                <Plus className="h-4 w-4" />
            </Button>
            {onDelete && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 text-gray-400 hover:text-red-600"
                onClick={onDelete}
              >
                  <Trash2 className="h-4 w-4" />
              </Button>
            )}
        </div>
      </div>

      {/* Column Content */}
      <div
        ref={setNodeRef}
        className="flex-1 p-3 flex flex-col gap-3 overflow-y-auto scrollbar-hide"
      >
        <SortableContext
          items={column.patients.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.patients.map((patient) => (
            <PatientCard
              key={patient.id}
              patient={patient}
              onClick={() => onPatientClick(patient)}
              onChatClick={onChatClick}
            />
          ))}
          {column.patients.length === 0 && (
            <div className="h-32 flex items-center justify-center border-2 border-dashed border-gray-100 rounded-lg p-4">
              <span className="text-xs font-medium text-gray-400">Vazio</span>
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}
