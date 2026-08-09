import { useEffect, useState, useCallback } from "react";
import { KanbanBoard } from "@/components/dashboard/kanban/KanbanBoard";
import { Search, Filter, Bell, Plus, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WhatsAppInterface } from "@/components/crm/WhatsAppInterface";
import { FloatingWhatsAppButton } from "@/components/crm/FloatingWhatsAppButton";
import { NewPatientModal } from "@/components/crm/NewPatientModal";
import { Patient, Column } from "@/types/patient";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { EvolutionService } from "@/services/evolution";
import { useDemoMode } from "@/hooks/useDemoMode";
import { demoLeads } from "@/data/demoData";

const CRM = () => {
  const { isDemo } = useDemoMode();
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);
  const [selectedChatPatient, setSelectedChatPatient] = useState<Patient | null>(null);
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);
  const [columns, setColumns] = useState<Column[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchKanbanData = async () => {
    if (isDemo) {
      // Assemble Demo Columns
      const demoStages = [
        { id: 'new', title: 'Novos Contatos', color: 'bg-blue-50' },
        { id: 'contact', title: 'Em Contato', color: 'bg-purple-50' },
        { id: 'qualified', title: 'Qualificados', color: 'bg-brand-50' },
        { id: 'scheduled', title: 'Agendados', color: 'bg-orange-50' },
        { id: 'converted', title: 'Convertidos', color: 'bg-brand-100' },
      ];

      const newColumns: Column[] = demoStages.map(stage => ({
        id: stage.id,
        title: stage.title,
        color: stage.color,
        patients: demoLeads
          .filter(lead => {
            if (stage.id === 'new') return lead.status === 'novo';
            if (stage.id === 'contact') return lead.status === 'em_contato';
            if (stage.id === 'qualified') return lead.status === 'qualificado';
            if (stage.id === 'scheduled') return lead.status === 'agendado';
            if (stage.id === 'converted') return lead.status === 'convertido';
            return false;
          })
          .map(lead => ({
            id: lead.id,
            name: lead.nome,
            phone: lead.telefone,
            status: stage.id,
            priority: "medium",
            date: new Date(lead.data_contato).toLocaleDateString(),
            email: lead.email,
            origin: lead.origem,
          }))
      }));

      setColumns(newColumns);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const session = localStorage.getItem("user_session");
      if (!session) return;
      const { clinica_id } = JSON.parse(session);

      // 1. Fetch Stages
      const { data: stages, error: stagesError } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('clinica_id', clinica_id)
        .order('ordem', { ascending: true });

      if (stagesError) throw stagesError;

      // 2. Fetch Leads
      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('*')
        .eq('clinica_id', clinica_id)
        .order('created_at', { ascending: false });

      if (leadsError) throw leadsError;

      // 3. Assemble Columns
      const newColumns: Column[] = stages.map((stage: any) => ({
        id: stage.id, // Use UUID as Column ID
        title: stage.nome,
        color: stage.cor || "bg-gray-100",
        patients: leads
          .filter((lead: any) => lead.stage_id === stage.id)
          .map((lead: any) => ({
            id: lead.id,
            name: lead.nome,
            phone: lead.telefone,
            status: stage.id,
            priority: "medium", // Default or stored in DB
            date: new Date(lead.created_at).toLocaleDateString(),
            notes: lead.anotacoes,
            value: lead.valor_estimado ? `R$ ${lead.valor_estimado}` : undefined,
            origin: lead.origem,
            email: lead.email,
            db_stage_id: stage.id,
            tags: lead.tags || [], // Map tags
            unread_messages: lead.unread_messages,
            last_message_at: lead.last_message_at
          }))
          .sort((a, b) => {
             // 1. Sort by Unread Messages (Verify if undefined, treat as 0)
             const unreadA = a.unread_messages || 0;
             const unreadB = b.unread_messages || 0;
             if (unreadA !== unreadB) return unreadB - unreadA; // Higher unread first

             // 2. Sort by Last Message Date
             const dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
             const dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
             if (dateA !== dateB) return dateB - dateA; // Newest message first

             // 3. Fallback to creation date (Implied by existing list order or explicit check)
             // The incoming 'leads' array is already sorted by created_at desc, 
             // but filter/map might disturb if not stable.
             // We can rely on basic stability or add a sort here if needed.
             return 0;
          })
      }));

      setColumns(newColumns);
    } catch (error) {
      console.error("Erro ao carregar CRM:", error);
      toast.error("Erro ao carregar dados do CRM");
    } finally {
      setLoading(false);
    }
  };

  const syncWhatsAppContacts = useCallback(async () => {
      try {
          const session = localStorage.getItem("user_session");
          if (!session) return;
          const { clinica_id } = JSON.parse(session);
          const instanceName = `clinic_${clinica_id}`;

          // 1. Fetch Chats from WhatsApp
          const chats = await EvolutionService.fetchChats(instanceName);
          
          // Filter valid private chats and Sort by timestamp (Newest first)
          const privateChats = chats.map((chat: any) => {
              const id = chat.id || chat.remoteJid || chat.key?.remoteJid;
              const timestamp = Number(chat.messageTimestamp || chat.timestamp || 0);
              return { ...chat, id, timestamp };
          }).filter((chat: any) => {
              // Strict Individual Check
              const isGroup = chat.isGroup || chat.id?.includes("@g.us");
              const isStatus = chat.id?.includes("status");
              const isIndividual = chat.id?.includes("@s.whatsapp.net");
              
              return chat.id && !isGroup && !isStatus && isIndividual;
          }).sort((a: any, b: any) => b.timestamp - a.timestamp);

          if (privateChats.length === 0) return;

          // 2. Fetch existing Leads to check availability
          const { data: existingLeads } = await supabase
            .from('leads')
            .select('telefone')
            .eq('clinica_id', clinica_id);
          
          const existingNumbers = new Set(
              (existingLeads || []).map(l => l.telefone.replace(/\D/g, ''))
          );

          // 3. Identify new leads
          const newLeads = privateChats.filter((chat: any) => {
              const remoteId = chat.id.replace(/\D/g, ''); 
              
              const exists = Array.from(existingNumbers).some(dbNum => {
                  return remoteId.includes(dbNum) || dbNum.includes(remoteId);
              });

              return !exists; 
          });

          if (newLeads.length > 0) {
             console.log(`Sincronizando ${newLeads.length} novos contatos:`, newLeads.map((c:any) => c.name || c.id));
          }

          // 4. Get Default Stage
          const { data: stages } = await supabase
              .from('pipeline_stages')
              .select('id')
              .eq('clinica_id', clinica_id)
              .order('ordem', { ascending: true })
              .limit(1);
          
          const defaultStageId = stages?.[0]?.id;
          if (!defaultStageId) {
             console.error("Nenhuma fase de pipeline encontrada.");
             return;
          }

          // 5. Insert new leads
          const leadsToInsert = newLeads.map((chat: any) => ({
              clinica_id,
              // Prioritize name set by user (pushName/notifyName)
              nome: chat.pushName || chat.notifyName || chat.verifiedName || chat.name || `WhatsApp ${chat.id.split('@')[0]}`,
              telefone: chat.id.split('@')[0], 
              stage_id: defaultStageId,
              status: 'open',
              origem: 'WhatsApp'
          }));

          const { error } = await supabase.from('leads').insert(leadsToInsert);
          
          if (error) {
              console.error("Erro ao importar leads do WhatsApp:", error);
          } else {
               toast.success(`${newLeads.length} novos leads importados do WhatsApp!`);
          }
          
          // Always refresh Kanban to show new messages on existing leads (updated via DB triggers)
          fetchKanbanData();

      } catch (error) {
          console.error("Erro na sincronização de contatos:", error);
      }
  }, []);

  const cleanupExamples = useCallback(async () => {
    try {
       const session = localStorage.getItem("user_session");
       if (!session) return;
       const { clinica_id } = JSON.parse(session);

       // 1. Delete Examples
       const { error, count } = await supabase
         .from('leads')
         .delete({ count: 'exact' })
         .eq('clinica_id', clinica_id)
         .ilike('nome', '%(Exemplo)%');

       if (!error && count && count > 0) {
           console.log(`Examples removed: ${count}`);
           fetchKanbanData();
       }
    } catch (e) {
        console.error("Error cleaning examples", e);
    }
  }, []);

  useEffect(() => {
    if (isDemo) {
      fetchKanbanData();
      return;
    }
    fetchKanbanData();
    cleanupExamples(); // Clean on load
    syncWhatsAppContacts();
    
    // Poll every 30 seconds
    const interval = setInterval(syncWhatsAppContacts, 30000);
    return () => clearInterval(interval);
  }, [syncWhatsAppContacts, cleanupExamples, isDemo]);

  const handleDragEnd = async (patientId: string, newStageId: string) => {
    if (isDemo) {
      toast.info("Em modo demonstração, as alterações não são salvas permanentemente.");
      return;
    }
    try {
      const { error } = await supabase
        .from('leads')
        .update({ stage_id: newStageId })
        .eq('id', patientId);

      if (error) throw error;
      // No need to refetch if local state is handled by dnd-kit, 
      // but strictly speaking we should ensure sync or optimistic update.
      // KanbanBoard already handles local visual update via setColumns?
      // Actually KanbanBoard's internal handleDragOver updates state visually.
      // So this is just for persistence.
    } catch (error) {
      console.error("Erro ao mover card:", error);
      toast.error("Erro ao salvar mudança de fase");
      fetchKanbanData(); // Revert on error
    }
  };

  const handleChatOpen = (patient?: Patient) => {
    if (patient) {
      setSelectedChatPatient(patient);
    }
    setIsWhatsAppOpen(true);
  };

  const handleAddPatient = async (newPatient: Omit<Patient, "id">) => {
    try {
      const session = localStorage.getItem("user_session");
      if (!session) return;
      const { clinica_id } = JSON.parse(session);

      // Find first stage (usually "Novo Lead")
      const firstStage = columns[0]?.id;
      if (!firstStage) {
        toast.error("Nenhuma fase encontrada no funil");
        return;
      }

      const { error } = await supabase.from('leads').insert({
        clinica_id,
        nome: newPatient.name,
        telefone: newPatient.phone || "",
        stage_id: firstStage,
        status: 'open',
        anotacoes: newPatient.notes,
        // map other fields
      });

      if (error) throw error;
      
      toast.success("Contato adicionado com sucesso!");
      fetchKanbanData();
      setIsNewPatientModalOpen(false);

    } catch (error) {
       console.error("Erro ao criar lead:", error);
       toast.error("Erro ao criar contato");
    }
  };

  const handleAddColumn = async () => {
    const name = window.prompt("Nome da nova fase:");
    if (!name) return;

    try {
      const session = localStorage.getItem("user_session");
      if (!session) return;
      const { clinica_id } = JSON.parse(session);

      const nextOrder = columns.length + 1;

      const { error } = await supabase.from('pipeline_stages').insert({
        clinica_id,
        nome: name,
        ordem: nextOrder,
        cor: '#E2E8F0' // Default color
      });

      if (error) throw error;
      toast.success("Fase criada com sucesso!");
      fetchKanbanData();

    } catch (error) {
      console.error("Erro ao criar fase:", error);
      toast.error("Erro ao criar fase");
    }
  };

  const handleDeleteColumn = async (columnId: string) => {
    if (!window.confirm("Tem certeza que deseja excluir esta fase?")) return;

    try {
      // Check if there are leads in this stage
      const column = columns.find(c => c.id === columnId);
      if (column && column.patients.length > 0) {
         if (!window.confirm(`Esta fase tem ${column.patients.length} contatos. Eles ficarão sem fase definida. Deseja continuar?`)) {
             return;
         }
      }

      const { error } = await supabase
        .from('pipeline_stages')
        .delete()
        .eq('id', columnId);

      if (error) throw error;
      
      toast.success("Fase excluída com sucesso!");
      fetchKanbanData();

    } catch (error) {
      console.error("Erro ao excluir fase:", error);
      toast.error("Erro ao excluir fase");
    }
  };

  const handlePatientUpdate = async (patient: Patient) => {
      try {
          const { error } = await supabase
              .from('leads')
              .update({
                  nome: patient.name,
                  telefone: patient.phone,
                  tags: patient.tags,
                  service: patient.service,
                  anotacoes: patient.notes,
                  updated_at: new Date().toISOString()
              })
              .eq('id', patient.id);

          if (error) throw error;
          toast.success("Paciente atualizado!");
          // fetchKanbanData(); // Optional, local state is already updated via KanbanBoard
      } catch (error) {
          console.error("Erro ao atualizar paciente:", error);
          toast.error("Erro ao salvar alterações");
      }
  };

  return (
    <div className="flex min-h-full bg-muted/30 dashboard-theme">
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
        {/* Demo Mode Banner */}
        {isDemo && (
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 flex items-center gap-3">
            <Info className="h-4 w-4" />
            <p className="text-sm font-medium">Modo Demonstração: Explore o fluxo de atendimento com dados fictícios.</p>
          </div>
        )}
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Fluxo de Atendimento</h1>
              <p className="text-sm text-gray-500">Gerencie o pipeline de pacientes</p>
            </div>

            <div className="flex items-center gap-3">
              {/* Notificações */}
              <button className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <Bell className="h-5 w-5 text-gray-600" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>

              {/* Botão Novo Contato */}
              <Button
                onClick={() => setIsNewPatientModalOpen(true)}
                className="bg-brand-600 hover:bg-brand-700 text-white gap-2"
              >
                <Plus className="h-4 w-4" />
                Novo Contato
              </Button>
            </div>
          </div>

          {/* Barra de Busca e Filtros */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar contato..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-gray-50 border-gray-200"
              />
            </div>

            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filtros
            </Button>
          </div>
        </div>

        {/* Kanban Area */}
        <div className="flex-1 overflow-x-auto p-6">
          {loading ? (
             <div className="flex h-full items-center justify-center text-gray-400">Carregando CRM...</div>
          ) : (
             <KanbanBoard 
                onChatClick={handleChatOpen} 
                columns={columns} 
                setColumns={setColumns}
                onDragEnd={handleDragEnd}
                onAddColumn={handleAddColumn}
                onDeleteColumn={handleDeleteColumn}
                onPatientUpdate={handlePatientUpdate}
             />
          )}
        </div>

        {/* WhatsApp Interface Overlay */}
        <WhatsAppInterface
          isOpen={isWhatsAppOpen}
          onClose={() => setIsWhatsAppOpen(false)}
          initialPatient={selectedChatPatient?.name}
        />

        {/* Floating Action Button */}
        {!isWhatsAppOpen && (
          <FloatingWhatsAppButton onClick={() => setIsWhatsAppOpen(true)} />
        )}

        {/* New Patient Modal */}
        <NewPatientModal
          isOpen={isNewPatientModalOpen}
          onClose={() => setIsNewPatientModalOpen(false)}
          onAddPatient={handleAddPatient}
        />
      </main>
    </div>
  );
};

export default CRM;
