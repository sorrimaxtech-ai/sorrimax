import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, User, Shield, Mail, Phone } from "lucide-react";
import { NewProfessionalModal } from "@/components/profissionais/NewProfessionalModal";

interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  telefone?: string;
  status: string;
  permissions?: Record<string, boolean>;
  created_at: string;
}

const Profissionais = () => {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      const sessionSession = localStorage.getItem("user_session");
      if (!sessionSession) return;
      const { clinica_id } = JSON.parse(sessionSession);

      // @ts-ignore
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('clinica_id', clinica_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
    } catch (error) {
      console.error("Erro ao buscar profissionais:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar a lista de profissionais.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);


  const handleSaveProfessional = async (data: any) => {
    try {
        const sessionSession = localStorage.getItem("user_session");
        if (!sessionSession) return;
        const { clinica_id } = JSON.parse(sessionSession);

        if (data.id) {
            // Update existing
            const updatePayload: any = {
                email: data.email,
                full_name: data.name,
                telefone: data.phone,
                role: data.role,
                especialidade: data.especialidade,
                permissions: data.permissions,
            };
            if (data.password) {
                updatePayload.senha = data.password;
            }

            // @ts-ignore
            const { error } = await supabase
                .from('profiles')
                .update(updatePayload)
                .eq('id', data.id);

            if (error) throw error;
             toast({ title: "Sucesso!", description: "Dados atualizados." });

        } else {
            // Create new
            // @ts-ignore
            const { error } = await supabase.from('profiles').insert({
              id: crypto.randomUUID(),
              clinica_id,
              email: data.email,
              full_name: data.name,
              telefone: data.phone,
              role: data.role,
              especialidade: data.especialidade,
              status: 'active',
              permissions: data.permissions,
              senha: data.password
            });

            if (error) throw error;
            toast({ title: "Sucesso!", description: "Profissional criado." });
        }
        
        setIsModalOpen(false);
        setSelectedProfile(null);
        fetchProfiles();

    } catch (error: any) {
        console.error("Erro ao salvar profissional:", error);
        toast({
            title: "Erro",
            description: error.message || "Erro ao salvar.",
            variant: "destructive"
        });
    }
  };

  const openEditModal = (profile: Profile) => {
      setSelectedProfile(profile);
      setIsModalOpen(true);
  };

  const openNewModal = () => {
      setSelectedProfile(null);
      setIsModalOpen(true);
  };

  return (
    <div className="flex min-h-full bg-muted/30 dashboard-theme">
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Profissionais</h1>
              <p className="text-gray-500 mt-1">Gerencie a equipe da sua clínica</p>
            </div>
            <Button onClick={openNewModal} className="bg-brand-600 hover:bg-brand-700 gap-2">
              <Plus className="h-4 w-4" />
              Novo Profissional
            </Button>
          </div>

          {/* List */}
          {loading ? (
             <div className="text-center py-10 text-gray-500">Carregando...</div>
          ) : profiles.length === 0 ? (
             <div className="text-center py-10 bg-white rounded-lg border border-dashed">
                <p className="text-gray-500 mb-4">Nenhum profissional encontrado.</p>
                <Button variant="outline" onClick={openNewModal}>Adicionar Primeiro</Button>
             </div>
          ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {profiles.map((profile) => (
                  <Card key={profile.id} className="hover:shadow-md transition-shadow relative group">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                       <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold">
                             {profile.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                             <CardTitle className="text-base font-semibold text-gray-900">{profile.full_name}</CardTitle>
                             <div className="flex items-center gap-1 text-xs text-gray-500">
                                <Shield className="h-3 w-3" />
                                {profile.role === 'admin' ? 'Administrador' : profile.role === 'receptionist' ? 'Recepção' : 'Profissional'}
                             </div>
                          </div>
                       </div>
                       <Badge variant={profile.status === 'active' ? 'default' : 'secondary'} className={profile.status === 'active' ? 'bg-brand-500' : 'bg-gray-400'}>
                         {profile.status === 'active' ? 'Ativo' : profile.status}
                       </Badge>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                       <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Mail className="h-4 w-4 text-gray-400" />
                          <span className="truncate">{profile.email}</span>
                       </div>
                       <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Phone className="h-4 w-4 text-gray-400" />
                          <span>{profile.telefone || '-'}</span>
                       </div>
                       
                       {profile.permissions && (
                         <div className="pt-2 border-t mt-3">
                           <p className="text-xs text-gray-400 mb-2 font-medium uppercase">Acessos</p>
                           <div className="flex flex-wrap gap-1">
                             {Object.entries(profile.permissions).filter(([, v]) => v).map(([k]) => (
                               <Badge key={k} variant="outline" className="text-xs font-normal border-gray-200 capitalize">
                                 {k}
                               </Badge>
                             ))}
                           </div>
                         </div>
                       )}

                       <Button variant="outline" size="sm" className="w-full mt-4" onClick={() => openEditModal(profile)}>
                         Editar / Alterar Senha
                       </Button>
                    </CardContent>
                  </Card>
                ))}
             </div>
          )}
        </div>

        <NewProfessionalModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          onSave={handleSaveProfessional}
          initialData={selectedProfile}
        />
      </main>
    </div>
  );
};

export default Profissionais;
