import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, X, Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Especialidade {
  id: string;
  nome: string;
  descricao?: string;
}

interface ClinicaEspecialidade {
  especialidade_id: string;
  especialidades: Especialidade;
}

const Especialidades = () => {
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [todasEspecialidades, setTodasEspecialidades] = useState<Especialidade[]>([]);
  const [especialidadesClinica, setEspecialidadesClinica] = useState<Especialidade[]>([]);
  const [clinicaId, setClinicaId] = useState<string | null>(null);
  const [showAddNew, setShowAddNew] = useState(false);
  const [novaEspecialidade, setNovaEspecialidade] = useState("");

  // Buscar ID da clínica do usuário logado
  useEffect(() => {
    const fetchClinicaId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('clinica_id')
          .eq('id', user.id)
          .single();
        
        if (profile?.clinica_id) {
          setClinicaId(profile.clinica_id);
        }
      }
    };

    fetchClinicaId();
  }, []);

  // Buscar todas as especialidades disponíveis
  useEffect(() => {
    const fetchEspecialidades = async () => {
      const { data, error } = await supabase
        .from('especialidades')
        .select('*')
        .order('nome');

      if (error) {
        console.error('Erro ao buscar especialidades:', error);
        toast.error('Erro ao carregar especialidades');
      } else {
        setTodasEspecialidades(data || []);
      }
    };

    fetchEspecialidades();
  }, []);

  // Buscar especialidades da clínica
  useEffect(() => {
    if (!clinicaId) return;

    const fetchEspecialidadesClinica = async () => {
      const { data, error } = await supabase
        .from('clinica_especialidades')
        .select(`
          especialidade_id,
          especialidades (
            id,
            nome,
            descricao
          )
        `)
        .eq('clinica_id', clinicaId);

      if (error) {
        console.error('Erro ao buscar especialidades da clínica:', error);
      } else {
        const especialidades = (data as ClinicaEspecialidade[])
          .map(item => item.especialidades)
          .filter(Boolean);
        setEspecialidadesClinica(especialidades);
      }
    };

    fetchEspecialidadesClinica();
  }, [clinicaId]);

  // Filtrar especialidades disponíveis (que não estão na clínica)
  const especialidadesDisponiveis = todasEspecialidades.filter(
    esp => !especialidadesClinica.some(clinicaEsp => clinicaEsp.id === esp.id)
  );

  // Filtrar por termo de busca
  const especialidadesFiltradas = especialidadesDisponiveis.filter(esp =>
    esp.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Adicionar especialidade existente à clínica
  const handleAddEspecialidade = async (especialidadeId: string) => {
    if (!clinicaId) {
      toast.error('Clínica não identificada');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('clinica_especialidades')
        .insert({
          clinica_id: clinicaId,
          especialidade_id: especialidadeId
        });

      if (error) throw error;

      // Atualizar lista local
      const especialidade = todasEspecialidades.find(e => e.id === especialidadeId);
      if (especialidade) {
        setEspecialidadesClinica([...especialidadesClinica, especialidade]);
      }

      toast.success('Especialidade adicionada com sucesso!');
      setSearchTerm("");
    } catch (error: any) {
      console.error('Erro ao adicionar especialidade:', error);
      toast.error('Erro ao adicionar especialidade');
    } finally {
      setLoading(false);
    }
  };

  // Criar nova especialidade personalizada
  const handleCreateEspecialidade = async () => {
    if (!novaEspecialidade.trim()) {
      toast.error('Digite o nome da especialidade');
      return;
    }

    if (!clinicaId) {
      toast.error('Clínica não identificada');
      return;
    }

    setLoading(true);
    try {
      // Criar nova especialidade
      const { data: newEsp, error: createError } = await supabase
        .from('especialidades')
        .insert({ nome: novaEspecialidade.trim() })
        .select()
        .single();

      if (createError) throw createError;

      // Associar à clínica
      const { error: linkError } = await supabase
        .from('clinica_especialidades')
        .insert({
          clinica_id: clinicaId,
          especialidade_id: newEsp.id
        });

      if (linkError) throw linkError;

      // Atualizar listas locais
      setTodasEspecialidades([...todasEspecialidades, newEsp]);
      setEspecialidadesClinica([...especialidadesClinica, newEsp]);

      toast.success('Especialidade criada e adicionada!');
      setNovaEspecialidade("");
      setShowAddNew(false);
      setSearchTerm("");
    } catch (error: any) {
      console.error('Erro ao criar especialidade:', error);
      toast.error('Erro ao criar especialidade');
    } finally {
      setLoading(false);
    }
  };

  // Remover especialidade da clínica
  const handleRemoveEspecialidade = async (especialidadeId: string) => {
    if (!clinicaId) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('clinica_especialidades')
        .delete()
        .eq('clinica_id', clinicaId)
        .eq('especialidade_id', especialidadeId);

      if (error) throw error;

      // Atualizar lista local
      setEspecialidadesClinica(
        especialidadesClinica.filter(e => e.id !== especialidadeId)
      );

      toast.success('Especialidade removida');
    } catch (error: any) {
      console.error('Erro ao remover especialidade:', error);
      toast.error('Erro ao remover especialidade');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      
      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <Stethoscope className="h-8 w-8 text-brand-600" />
              <h1 className="text-3xl font-bold text-gray-900">Especialidades</h1>
            </div>
            <p className="text-gray-600">
              Gerencie as especialidades e serviços oferecidos pela sua clínica
            </p>
          </div>

          {/* Especialidades da Clínica */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Especialidades Cadastradas</CardTitle>
              <CardDescription>
                Especialidades que sua clínica oferece atualmente
              </CardDescription>
            </CardHeader>
            <CardContent>
              {especialidadesClinica.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  Nenhuma especialidade cadastrada ainda
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {especialidadesClinica.map((esp) => (
                    <Badge
                      key={esp.id}
                      variant="secondary"
                      className="px-4 py-2 text-sm bg-brand-100 text-brand-800 hover:bg-brand-200 flex items-center gap-2"
                    >
                      {esp.nome}
                      <button
                        onClick={() => handleRemoveEspecialidade(esp.id)}
                        disabled={loading}
                        className="hover:text-red-600 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Adicionar Especialidades */}
          <Card>
            <CardHeader>
              <CardTitle>Adicionar Especialidade</CardTitle>
              <CardDescription>
                Busque e adicione especialidades à sua clínica
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Campo de Busca */}
              <div className="space-y-2">
                <Label htmlFor="search">Buscar especialidade</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Digite para buscar..."
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Lista de Especialidades Disponíveis */}
              {searchTerm && (
                <div className="border rounded-lg max-h-64 overflow-y-auto">
                  {especialidadesFiltradas.length === 0 ? (
                    <div className="p-4 text-center">
                      <p className="text-gray-500 mb-3">
                        Nenhuma especialidade encontrada
                      </p>
                      <Button
                        onClick={() => {
                          setNovaEspecialidade(searchTerm);
                          setShowAddNew(true);
                        }}
                        variant="outline"
                        size="sm"
                        className="text-brand-600 border-brand-600 hover:bg-brand-50"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Adicionar "{searchTerm}" como nova especialidade
                      </Button>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {especialidadesFiltradas.map((esp) => (
                        <div
                          key={esp.id}
                          className="p-3 hover:bg-gray-50 flex items-center justify-between cursor-pointer"
                          onClick={() => handleAddEspecialidade(esp.id)}
                        >
                          <div>
                            <p className="font-medium text-gray-900">{esp.nome}</p>
                            {esp.descricao && (
                              <p className="text-sm text-gray-500">{esp.descricao}</p>
                            )}
                          </div>
                          <Plus className="h-5 w-5 text-brand-600" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Adicionar Nova Especialidade */}
              {showAddNew && (
                <div className="border border-brand-200 rounded-lg p-4 bg-brand-50">
                  <Label htmlFor="nova">Nova Especialidade</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      id="nova"
                      value={novaEspecialidade}
                      onChange={(e) => setNovaEspecialidade(e.target.value)}
                      placeholder="Nome da especialidade"
                      className="bg-white"
                    />
                    <Button
                      onClick={handleCreateEspecialidade}
                      disabled={loading}
                      className="bg-brand-600 hover:bg-brand-700"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Criar
                    </Button>
                    <Button
                      onClick={() => {
                        setShowAddNew(false);
                        setNovaEspecialidade("");
                      }}
                      variant="outline"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Especialidades;
