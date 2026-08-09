import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface NewProfessionalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (professional: any) => Promise<void>;
  initialData?: any; // If present, we are editing
}

export const NewProfessionalModal = ({ isOpen, onClose, onSave, initialData }: NewProfessionalModalProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    role: "professional",
    especialidade: ""
  });
  
  const [permissions, setPermissions] = useState({
    agenda: true,
    crm: false,
    financeiro: false,
    dashboard: false,
    configuracoes: false,
    profissionais: false
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.full_name || "",
        email: initialData.email || "",
        password: "", // Don't pre-fill password
        phone: initialData.telefone || "",
        role: initialData.role || "professional",
        especialidade: initialData.especialidade || ""
      });
      if (initialData.permissions) {
        setPermissions(prev => ({ ...prev, ...initialData.permissions }));
      }
    } else {
      // Reset for new entry
      setFormData({
        name: "",
        email: "",
        password: "",
        phone: "",
        role: "professional",
        especialidade: ""
      });
      setPermissions({
        agenda: true,
        crm: false,
        financeiro: false,
        dashboard: false,
        configuracoes: false,
        profissionais: false
      });
    }
  }, [initialData, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePermissionChange = (key: keyof typeof permissions) => {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave({ ...formData, permissions, id: initialData?.id });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{initialData ? "Editar Profissional" : "Novo Profissional"}</DialogTitle>
          <DialogDescription>
            {initialData 
              ? "Edite as informações ou altere a senha do profissional." 
              : "Preencha os dados do novo profissional e defina uma senha de acesso."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome Completo</Label>
            <Input id="name" name="name" required value={formData.name} onChange={handleChange} />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required value={formData.email} onChange={handleChange} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">
              {initialData ? "Nova Senha (deixe em branco para manter)" : "Senha de Acesso"}
            </Label>
            <Input 
                id="password" 
                name="password" 
                type="password" 
                required={!initialData} 
                value={formData.password} 
                onChange={handleChange} 
                minLength={6} 
                placeholder={initialData ? "********" : ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" name="phone" value={formData.phone} onChange={handleChange} />
          </div>

          <div className="space-y-2">
            <Label>Função</Label>
            <Select value={formData.role} onValueChange={(val) => setFormData(prev => ({ ...prev, role: val }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a função" />
              </SelectTrigger>
              <SelectContent>
                 <SelectItem value="professional">Profissional de Saúde</SelectItem>
                 <SelectItem value="receptionist">Recepcionista</SelectItem>
                 <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="especialidade">Especialidade (Opcional)</Label>
            <Input id="especialidade" name="especialidade" value={formData.especialidade} onChange={handleChange} placeholder="Ex: Dermatologista" />
          </div>

          <div className="space-y-2">
            <Label>Permissões</Label>
            <div className="grid grid-cols-2 gap-2 border p-3 rounded-md">
                <div className="flex items-center space-x-2">
                    <Checkbox id="perm-agenda" checked={permissions.agenda} onCheckedChange={() => handlePermissionChange('agenda')} />
                    <label htmlFor="perm-agenda" className="text-sm cursor-pointer">Agenda</label>
                </div>
                <div className="flex items-center space-x-2">
                    <Checkbox id="perm-crm" checked={permissions.crm} onCheckedChange={() => handlePermissionChange('crm')} />
                    <label htmlFor="perm-crm" className="text-sm cursor-pointer">CRM</label>
                </div>
                <div className="flex items-center space-x-2">
                    <Checkbox id="perm-fin" checked={permissions.financeiro} onCheckedChange={() => handlePermissionChange('financeiro')} />
                    <label htmlFor="perm-fin" className="text-sm cursor-pointer">Financeiro</label>
                </div>
                <div className="flex items-center space-x-2">
                    <Checkbox id="perm-dash" checked={permissions.dashboard} onCheckedChange={() => handlePermissionChange('dashboard')} />
                    <label htmlFor="perm-dash" className="text-sm cursor-pointer">Dashboard</label>
                </div>
                 <div className="flex items-center space-x-2">
                    <Checkbox id="perm-prof" checked={permissions.profissionais} onCheckedChange={() => handlePermissionChange('profissionais')} />
                    <label htmlFor="perm-prof" className="text-sm cursor-pointer">Profissionais</label>
                </div>
                 <div className="flex items-center space-x-2">
                    <Checkbox id="perm-conf" checked={permissions.configuracoes} onCheckedChange={() => handlePermissionChange('configuracoes')} />
                    <label htmlFor="perm-conf" className="text-sm cursor-pointer">Configurações</label>
                </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (initialData ? "Salvar Alterações" : "Criar Profissional")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
