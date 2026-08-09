import { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Column, Patient } from '@/types/patient';
import { initialColumns } from '@/data/mockData';
import { KanbanColumn } from './KanbanColumn';
import { PatientCard } from './PatientCard';
import { PatientModal } from './PatientModal';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface KanbanBoardProps {
  onChatClick?: (patient: Patient) => void;
  columns: Column[];
  setColumns: React.Dispatch<React.SetStateAction<Column[]>>;
  onDragEnd?: (patientId: string, newStageId: string) => void;
  onAddColumn?: () => void;
  onDeleteColumn?: (columnId: string) => void;
  onPatientUpdate?: (patient: Patient) => void;
}

export function KanbanBoard({ onChatClick, columns, setColumns, onDragEnd, onAddColumn, onDeleteColumn, onPatientUpdate }: KanbanBoardProps) {
  const [activePatient, setActivePatient] = useState<Patient | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Helper functions
  const findColumnByPatientId = (patientId: string): Column | undefined => {
    return columns.find((col) =>
      col.patients.some((p) => p.id === patientId)
    );
  };

  const findPatientById = (patientId: string): Patient | undefined => {
    for (const column of columns) {
      const patient = column.patients.find((p) => p.id === patientId);
      if (patient) return patient;
    }
    return undefined;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const patient = findPatientById(active.id as string);
    setActivePatient(patient || null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeColumn = findColumnByPatientId(activeId);
    const overColumn =
      columns.find((col) => col.id === overId) ||
      findColumnByPatientId(overId);

    if (!activeColumn || !overColumn || activeColumn.id === overColumn.id) {
      return;
    }

    setColumns((prev) => {
      const activePatientIndex = activeColumn.patients.findIndex(
        (p) => p.id === activeId
      );
      const activePatientData = activeColumn.patients[activePatientIndex];

      return prev.map((col) => {
        if (col.id === activeColumn.id) {
          return {
            ...col,
            patients: col.patients.filter((p) => p.id !== activeId),
          };
        }
        if (col.id === overColumn.id) {
          const overPatientIndex = col.patients.findIndex(
            (p) => p.id === overId
          );
          const insertIndex =
            overPatientIndex >= 0 ? overPatientIndex : col.patients.length;
          const newPatients = [...col.patients];
          newPatients.splice(insertIndex, 0, activePatientData);
          return {
            ...col,
            patients: newPatients,
          };
        }
        return col;
      });
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActivePatient(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    const activeColumn = findColumnByPatientId(activeId);
    const overColumn =
      columns.find((col) => col.id === overId) ||
      findColumnByPatientId(overId);

    if (!activeColumn || !overColumn) return;

    if (activeColumn.id === overColumn.id) {
      const columnIndex = columns.findIndex((col) => col.id === activeColumn.id);
      const oldIndex = activeColumn.patients.findIndex((p) => p.id === activeId);
      const newIndex = activeColumn.patients.findIndex((p) => p.id === overId);

      if (oldIndex !== newIndex) {
        setColumns((prev) => {
          const newColumns = [...prev];
          newColumns[columnIndex] = {
            ...newColumns[columnIndex],
            patients: arrayMove(newColumns[columnIndex].patients, oldIndex, newIndex),
          };
          return newColumns;
        });
      }
    } else {
        // Moved to a different column
        // Check if handleDragOver already handled the state update (it should have)
        // If so, we just need to notify parent
        
        // Notify parent about the change
        if (onDragEnd) {
             onDragEnd(activeId, overColumn.id);
        }
    }
  };

  const handlePatientClick = (patient: Patient) => {
    setSelectedPatient(patient);
    setIsModalOpen(true);
  };

  const handleSavePatient = (patient: Patient) => {
    setColumns((prev) =>
      prev.map((col) => ({
        ...col,
        patients: col.patients.map((p) =>
          p.id === patient.id ? patient : p
        ),
      }))
    );
    if (onPatientUpdate) {
        onPatientUpdate(patient);
    }
    setIsModalOpen(false);
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 p-0 overflow-x-auto scrollbar-hide pb-4">
          <div className="flex gap-6 h-[calc(100vh-280px)] min-w-full px-1">
            {columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                onPatientClick={handlePatientClick}
                onChatClick={onChatClick}
                onDelete={onDeleteColumn ? () => onDeleteColumn(column.id) : undefined}
              />
            ))}
            
            {/* Add Column Button */}
            <div className="min-w-[350px] h-full flex items-start justify-center pt-4 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50 hover:bg-gray-100/50 transition-colors">
                 <Button variant="ghost" className="text-gray-500 hover:text-emerald-600 gap-2" onClick={onAddColumn}>
                    <Plus className="h-5 w-5" />
                    Nova Fase
                 </Button>
            </div>

            {/* Spacer for right/end of list */}
            <div className="min-w-[1px]" />
          </div>
        </div>

        <DragOverlay>
          {activePatient ? (
            <div className="kanban-card dragging rotate-3 scale-105 shadow-2xl w-[350px]">
              <PatientCard patient={activePatient} onClick={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <PatientModal
        patient={selectedPatient}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSavePatient}
      />
    </>
  );
}
