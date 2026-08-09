import { Patient, ColumnId } from "@/types/patient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";

interface PatientModalProps {
  patient: Patient | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (patient: Patient) => void;
}

export function PatientModal({ patient, isOpen, onClose, onSave }: PatientModalProps) {
  const [formData, setFormData] = useState<Partial<Patient>>({});
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (patient) {
      setFormData(patient);
    } else {
        setFormData({});
    }
  }, [patient]);

  const handleAddTag = () => {
      if (!tagInput.trim()) return;
      const currentTags = formData.tags || [];
      if (!currentTags.includes(tagInput.trim())) {
          setFormData({ ...formData, tags: [...currentTags, tagInput.trim()] });
      }
      setTagInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
      const currentTags = formData.tags || [];
      setFormData({ ...formData, tags: currentTags.filter(t => t !== tagToRemove) });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
          e.preventDefault();
          handleAddTag();
      }
  };

  const handleSave = () => {
    if (formData && patient) {
      onSave({ ...patient, ...formData } as Patient);
    }
  };

  if (!patient) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Paciente</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Nome
            </Label>
            <Input
              id="name"
              value={formData.name || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="phone" className="text-right">
              Telefone
            </Label>
            <Input
              id="phone"
              value={formData.phone || ""}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="service" className="text-right">
              Serviço
            </Label>
            <Input
              id="service"
              value={formData.service || ""}
              onChange={(e) => setFormData({ ...formData, service: e.target.value })}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="priority" className="text-right">Prioridade</Label>
              <Select 
                value={formData.priority || "medium"} 
                onValueChange={(value: any) => setFormData({...formData, priority: value})}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Selecione a prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="date" className="text-right">
              Data
            </Label>
            <Input
              id="date"
              type="date"
              value={formData.date || ""}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="notes" className="text-right">
              Notas
            </Label>
            <Textarea
              id="notes"
              value={formData.notes || ""}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="col-span-3"
            />
          </div>
          
          {/* Tags Section */}
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right mt-2">Tags</Label>
            <div className="col-span-3 space-y-3">
                <div className="flex gap-2">
                    <Input 
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Adicionar tag..."
                        className="flex-1"
                    />
                    <Button type="button" size="icon" variant="outline" onClick={handleAddTag}>
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
                
                <div className="flex flex-wrap gap-2">
                    {formData.tags?.map((tag, idx) => (
                        <Badge key={idx} variant="secondary" className="gap-1 pr-1 bg-gray-100 text-gray-700 hover:bg-gray-200">
                            {tag}
                            <div 
                                role="button" 
                                onClick={() => handleRemoveTag(tag)}
                                className="hover:bg-gray-300 rounded-full p-0.5 cursor-pointer"
                            >
                                <X className="h-3 w-3" />
                            </div>
                        </Badge>
                    ))}
                </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar Alterações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
