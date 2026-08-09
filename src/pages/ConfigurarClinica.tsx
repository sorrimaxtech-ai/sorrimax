import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { MapPin, Briefcase, Clock, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Lista completa de especialidades para clínicas e consultórios
const ESPECIALIDADES_LISTA = [
  "Acupuntura", "Alergologia", "Anestesiologia", "Cardiologia",
  "Cirurgia Geral", "Cirurgia Plástica", "Clínica Geral", "Dermatologia",
  "Endocrinologia", "Estética", "Fisioterapia", "Fonoaudiologia",
  "Gastroenterologia", "Geriatria", "Ginecologia", "Hematologia",
  "Homeopatia", "Infectologia", "Mastologia", "Nefrologia",
  "Neurologia", "Nutrição", "Obstetrícia", "Odontologia",
  "Oftalmologia", "Oncologia", "Ortopedia", "Otorrinolaringologia",
  "Pediatria", "Pneumologia", "Psicologia", "Psiquiatria",
  "Quiropraxia", "Radiologia", "Reumatologia", "Urologia"
];

const DIAS_SEMANA = [
  { key: "segunda", label: "Segunda-feira" },
  { key: "terca", label: "Terça-feira" },
  { key: "quarta", label: "Quarta-feira" },
  { key: "quinta", label: "Quinta-feira" },
  { key: "sexta", label: "Sexta-feira" },
  { key: "sabado", label: "Sábado" },
  { key: "domingo", label: "Domingo" }
];

const ConfigurarClinica = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [clinicaId, setClinicaId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [searchEsp, setSearchEsp] = useState("");
  
  // ==========================================================================
  // A clínica vem da SESSÃO, nunca da URL.
  // --------------------------------------------------------------------------
  // Antes, o "token" da querystring era o próprio clinica_id, e a página o
  // aceitava sem checar dono: bastava trocar o UUID na URL para editar a
  // clínica de outra pessoa (IDOR). Agora o servidor decide, via meu_contexto().
  // ==========================================================================
  useEffect(() => {
    const resolverClinica = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Faça login para configurar sua clínica.");
        navigate('/auth');
        return;
      }

      const { data, error } = await supabase.rpc('meu_contexto');
      const ctx = Array.isArray(data) ? data[0] : data;
      if (error || !ctx) {
        toast.error("Não foi possível carregar seu perfil.");
        navigate('/auth');
        return;
      }

      if (!ctx.clinica_id) {
        // usuário confirmou o email mas ainda não tem clínica: cria agora,
        // usando o que ficou pendente do cadastro (idempotente no servidor).
        const nome = localStorage.getItem('pending_clinic_name')
          ?? `Clínica de ${ctx.nome ?? 'nova'}`;
        const telefone = localStorage.getItem('pending_clinic_phone');
        const { data: novoId, error: rpcErr } = await supabase.rpc(
          'criar_clinica_para_usuario',
          { p_nome_clinica: nome, p_telefone: telefone, p_email: ctx.email },
        );
        if (rpcErr || !novoId) {
          toast.error("Erro ao criar clínica", { description: rpcErr?.message });
          navigate('/auth');
          return;
        }
        localStorage.removeItem('pending_clinic_name');
        localStorage.removeItem('pending_clinic_phone');
        setClinicaId(novoId as string);
        return;
      }

      setClinicaId(ctx.clinica_id);
    };

    resolverClinica();
  }, [navigate]);
  
  const [formData, setFormData] = useState({
    // Etapa 1: Dados Básicos
    nomeClinica: "",
    cnpj: "",
    telefone: "",
    cep: "",
    endereco: "",
    numero: "",
    complemento: "",
    cidade: "",
    estado: "",
    
    // Etapa 2: Especialidades
    especialidades: [] as string[],
    
    // Etapa 3: Horários
    horarios: {
      segunda: { ativo: true, inicio: "08:00", fim: "18:00" },
      terca: { ativo: true, inicio: "08:00", fim: "18:00" },
      quarta: { ativo: true, inicio: "08:00", fim: "18:00" },
      quinta: { ativo: true, inicio: "08:00", fim: "18:00" },
      sexta: { ativo: true, inicio: "08:00", fim: "18:00" },
      sabado: { ativo: false, inicio: "08:00", fim: "12:00" },
      domingo: { ativo: false, inicio: "08:00", fim: "12:00" }
    }
  });

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const formatCEP = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    const limited = numbers.substring(0, 8);
    if (limited.length <= 5) return limited;
    return `${limited.substring(0, 5)}-${limited.substring(5)}`;
  };

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    const limited = numbers.substring(0, 11);
    if (limited.length <= 2) return limited;
    if (limited.length <= 7) return `(${limited.substring(0, 2)}) ${limited.substring(2)}`;
    return `(${limited.substring(0, 2)}) ${limited.substring(2, 7)}-${limited.substring(7)}`;
  };

  const formatCNPJ = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    const limited = numbers.substring(0, 14);
    if (limited.length <= 2) return limited;
    if (limited.length <= 5) return `${limited.substring(0, 2)}.${limited.substring(2)}`;
    if (limited.length <= 8) return `${limited.substring(0, 2)}.${limited.substring(2, 5)}.${limited.substring(5)}`;
    if (limited.length <= 12) return `${limited.substring(0, 2)}.${limited.substring(2, 5)}.${limited.substring(5, 8)}/${limited.substring(8)}`;
    return `${limited.substring(0, 2)}.${limited.substring(2, 5)}.${limited.substring(5, 8)}/${limited.substring(8, 12)}-${limited.substring(12)}`;
  };

  const toggleEspecialidade = (esp: string) => {
    setFormData(prev => ({
      ...prev,
      especialidades: prev.especialidades.includes(esp)
        ? prev.especialidades.filter(e => e !== esp)
        : [...prev.especialidades, esp]
    }));
  };

  const toggleDia = (dia: string) => {
    setFormData(prev => ({
      ...prev,
      horarios: {
        ...prev.horarios,
        [dia]: {
          ...prev.horarios[dia as keyof typeof prev.horarios],
          ativo: !prev.horarios[dia as keyof typeof prev.horarios].ativo
        }
      }
    }));
  };

  const updateHorario = (dia: string, field: 'inicio' | 'fim', value: string) => {
    setFormData(prev => ({
      ...prev,
      horarios: {
        ...prev.horarios,
        [dia]: {
          ...prev.horarios[dia as keyof typeof prev.horarios],
          [field]: value
        }
      }
    }));
  };

  const copiarParaTodos = () => {
    const primeiroAtivo = Object.entries(formData.horarios).find(([_, h]) => h.ativo);
    if (!primeiroAtivo) return;
    
    const [_, horario] = primeiroAtivo;
    const novosHorarios = { ...formData.horarios };
    
    Object.keys(novosHorarios).forEach(dia => {
      novosHorarios[dia as keyof typeof novosHorarios] = {
        ativo: true,
        inicio: horario.inicio,
        fim: horario.fim
      };
    });
    
    setFormData(prev => ({ ...prev, horarios: novosHorarios }));
    toast.success("Horários copiados para todos os dias!");
  };

  const validateStep = (currentStep: number) => {
    if (currentStep === 1) {
      if (!formData.nomeClinica || !formData.telefone) {
        toast.error("Preencha o nome da clínica e telefone");
        return false;
      }
    }
    return true;
  };

  const nextStep = () => {
    if (validateStep(step)) {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    setStep(step - 1);
  };

  const handleSubmit = async () => {
    if (!clinicaId) {
      toast.error("Token inválido. Faça o cadastro novamente.");
      navigate('/cadastro');
      return;
    }

    setLoading(true);
    
    try {
      // Atualizar dados da clínica
      const { error: clinicaError } = await supabase
        .from('clinicas')
        .update({
          nome_clinica: formData.nomeClinica,
          cnpj: formData.cnpj || null,
          telefone: formData.telefone,
          cep: formData.cep || null,
          endereco: formData.endereco || null,
          numero: formData.numero || null,
          complemento: formData.complemento || null,
          cidade: formData.cidade || null,
          estado: formData.estado || null,
          horario_funcionamento: formData.horarios
        })
        .eq('id', clinicaId);

      if (clinicaError) throw clinicaError;

      // OTIMIZAÇÃO: Salvar especialidades em BATCH (3 requests ao invés de N*3)
      if (formData.especialidades.length > 0) {
        // 1. Buscar TODAS as especialidades existentes de uma vez
        const { data: especialidadesExistentes } = await supabase
          .from('especialidades')
          .select('id, nome')
          .in('nome', formData.especialidades);

        const existentesMap = new Map(
          (especialidadesExistentes || []).map(e => [e.nome, e.id])
        );

        // 2. Identificar quais precisam ser criadas
        const novasEspecialidades = formData.especialidades
          .filter(nome => !existentesMap.has(nome))
          .map(nome => ({ nome }));

        // 3. Criar as novas em BATCH
        if (novasEspecialidades.length > 0) {
          const { data: criadas, error: criarError } = await supabase
            .from('especialidades')
            .insert(novasEspecialidades)
            .select('id, nome');

          if (criarError) throw criarError;

          // Adicionar as recém-criadas ao map
          (criadas || []).forEach(e => existentesMap.set(e.nome, e.id));
        }

        // 4. Vincular TODAS à clínica em BATCH.
        // `upsert` em vez de `insert`: clicar "Finalizar" duas vezes (ou voltar
        // e refazer o passo) dava `409 duplicate key` DEPOIS de já ter salvo —
        // a tela quebrava mostrando erro num fluxo que na verdade deu certo.
        // O filter(Boolean) evita mandar especialidade_id undefined caso alguma
        // especialidade não tenha sido criada/encontrada.
        const vinculos = formData.especialidades
          .map(nome => ({ clinica_id: clinicaId, especialidade_id: existentesMap.get(nome) }))
          .filter((v): v is { clinica_id: string; especialidade_id: string } =>
            Boolean(v.especialidade_id));

        if (vinculos.length > 0) {
          const { error: vincularError } = await supabase
            .from('clinica_especialidades')
            .upsert(vinculos, { onConflict: 'clinica_id,especialidade_id', ignoreDuplicates: true });

          if (vincularError) throw vincularError;
        }
      }

      toast.success("Clínica configurada com sucesso!");

      // vai pro dashboard: o usuário JÁ está logado (não faz sentido mandar
      // pro /auth e obrigar a logar de novo no fim do onboarding).
      setTimeout(() => {
        navigate('/dashboard');
      }, 1200);

    } catch (error: any) {
      console.error('Erro ao configurar clínica:', error);
      toast.error('Erro ao salvar dados', {
        description: error.message || 'Tente novamente mais tarde'
      });
    } finally {
      setLoading(false);
    }
  };

  const especialidadesFiltradas = ESPECIALIDADES_LISTA.filter(esp =>
    esp.toLowerCase().includes(searchEsp.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        {/* Progress Indicator
            Antes eram DUAS linhas flex independentes (círculos numa, rótulos
            noutra, ambas com justify-between). Como os conectores consomem
            espaço só entre os círculos, as duas distribuições não coincidiam e
            os rótulos ficavam deslocados ("Horários" saía pra fora do 3º passo).
            Agora cada rótulo vive na MESMA coluna do seu círculo. */}
        <div className="mb-6">
          <div className="flex items-start">
            {([
              { n: 1, label: 'Dados Básicos' },
              { n: 2, label: 'Especialidades' },
              { n: 3, label: 'Horários' },
            ] as const).map(({ n, label }) => (
              <div key={n} className={`flex items-start ${n < 3 ? 'flex-1' : ''}`}>
                <div className="flex flex-col items-center">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                      step >= n
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-white border-gray-300 text-gray-400'
                    }`}
                    aria-current={step === n ? 'step' : undefined}
                  >
                    {step > n ? <Check className="h-5 w-5" /> : n}
                  </div>
                  <span
                    className={`mt-2 text-xs whitespace-nowrap ${
                      step >= n ? 'text-emerald-700 font-medium' : 'text-gray-500'
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {n < 3 && (
                  <div
                    className={`flex-1 h-1 mx-2 mt-[18px] rounded transition-colors ${
                      step > n ? 'bg-emerald-600' : 'bg-gray-300'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <Card className="shadow-xl border-gray-100 bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-bold text-gray-900">
              {step === 1 && "Dados da Clínica"}
              {step === 2 && "Especialidades"}
              {step === 3 && "Horários de Funcionamento"}
            </CardTitle>
            <CardDescription className="text-sm">
              {step === 1 && "Informações básicas da sua clínica"}
              {step === 2 && "Selecione as especialidades oferecidas (sem limite)"}
              {step === 3 && "Configure o horário de funcionamento de cada dia"}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="pt-2">
            {/* ETAPA 1: Dados Básicos */}
            {step === 1 && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <Label htmlFor="nomeClinica" className="text-sm">Nome da Clínica <span className="text-red-500">*</span></Label>
                    <Input
                      id="nomeClinica"
                      value={formData.nomeClinica}
                      onChange={(e) => handleChange('nomeClinica', e.target.value)}
                      placeholder="Ex: Clínica São João"
                      className="h-9 text-sm"
                    />
                  </div>

                  <div>
                    <Label htmlFor="telefone" className="text-sm">Telefone <span className="text-red-500">*</span></Label>
                    <Input
                      id="telefone"
                      value={formData.telefone}
                      onChange={(e) => handleChange('telefone', formatPhone(e.target.value))}
                      placeholder="(11) 99999-9999"
                      className="h-9 text-sm"
                      maxLength={15}
                    />
                  </div>

                  <div>
                    <Label htmlFor="cnpj" className="text-sm">CNPJ</Label>
                    <Input
                      id="cnpj"
                      value={formData.cnpj}
                      onChange={(e) => handleChange('cnpj', formatCNPJ(e.target.value))}
                      placeholder="00.000.000/0000-00"
                      className="h-9 text-sm"
                      maxLength={18}
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4 text-emerald-600" />
                    <h3 className="font-semibold text-sm text-gray-900">Endereço</h3>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label htmlFor="cep" className="text-sm">CEP</Label>
                      <Input
                        id="cep"
                        value={formData.cep}
                        onChange={(e) => handleChange('cep', formatCEP(e.target.value))}
                        placeholder="00000-000"
                        className="h-9 text-sm"
                        maxLength={9}
                      />
                    </div>

                    <div className="col-span-2">
                      <Label htmlFor="endereco" className="text-sm">Rua</Label>
                      <Input
                        id="endereco"
                        value={formData.endereco}
                        onChange={(e) => handleChange('endereco', e.target.value)}
                        placeholder="Rua das Flores"
                        className="h-9 text-sm"
                      />
                    </div>

                    <div>
                      <Label htmlFor="numero" className="text-sm">Número</Label>
                      <Input
                        id="numero"
                        value={formData.numero}
                        onChange={(e) => handleChange('numero', e.target.value)}
                        placeholder="123"
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="col-span-2">
                      <Label htmlFor="complemento" className="text-sm">Complemento</Label>
                      <Input
                        id="complemento"
                        value={formData.complemento}
                        onChange={(e) => handleChange('complemento', e.target.value)}
                        placeholder="Sala 101"
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="col-span-2">
                      <Label htmlFor="cidade" className="text-sm">Cidade</Label>
                      <Input
                        id="cidade"
                        value={formData.cidade}
                        onChange={(e) => handleChange('cidade', e.target.value)}
                        placeholder="São Paulo"
                        className="h-9 text-sm"
                      />
                    </div>

                    <div>
                      <Label htmlFor="estado" className="text-sm">UF</Label>
                      <Input
                        id="estado"
                        value={formData.estado}
                        onChange={(e) => handleChange('estado', e.target.value.toUpperCase())}
                        placeholder="SP"
                        className="h-9 text-sm"
                        maxLength={2}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ETAPA 2: Especialidades */}
            {step === 2 && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="searchEsp" className="text-sm">Buscar especialidade</Label>
                  <Input
                    id="searchEsp"
                    value={searchEsp}
                    onChange={(e) => setSearchEsp(e.target.value)}
                    placeholder="Digite para filtrar..."
                    className="h-9 text-sm"
                  />
                </div>

                {formData.especialidades.length > 0 && (
                  <div>
                    <Label className="text-sm mb-2 block">Selecionadas ({formData.especialidades.length})</Label>
                    <div className="flex flex-wrap gap-1">
                      {formData.especialidades.map(esp => (
                        <Badge key={esp} variant="secondary" className="bg-emerald-100 text-emerald-800 text-xs">
                          {esp}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border rounded-lg p-3 max-h-80 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-2">
                    {especialidadesFiltradas.map((esp) => (
                      <div key={esp} className="flex items-center space-x-2">
                        <Checkbox
                          id={esp}
                          checked={formData.especialidades.includes(esp)}
                          onCheckedChange={() => toggleEspecialidade(esp)}
                        />
                        <label
                          htmlFor={esp}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {esp}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ETAPA 3: Horários */}
            {step === 3 && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copiarParaTodos}
                    className="text-xs"
                  >
                    Copiar primeiro dia ativo para todos
                  </Button>
                </div>

                <div className="space-y-2">
                  {DIAS_SEMANA.map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2 p-2 border rounded-lg">
                      <Switch
                        checked={formData.horarios[key as keyof typeof formData.horarios].ativo}
                        onCheckedChange={() => toggleDia(key)}
                      />
                      <div className="flex-1 grid grid-cols-3 gap-2 items-center">
                        <Label className="text-sm font-medium">{label}</Label>
                        <Input
                          type="time"
                          value={formData.horarios[key as keyof typeof formData.horarios].inicio}
                          onChange={(e) => updateHorario(key, 'inicio', e.target.value)}
                          disabled={!formData.horarios[key as keyof typeof formData.horarios].ativo}
                          className="h-8 text-sm"
                        />
                        <Input
                          type="time"
                          value={formData.horarios[key as keyof typeof formData.horarios].fim}
                          onChange={(e) => updateHorario(key, 'fim', e.target.value)}
                          disabled={!formData.horarios[key as keyof typeof formData.horarios].ativo}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-6 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={prevStep}
                disabled={step === 1}
                className="h-9"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Voltar
              </Button>

              {step < 3 ? (
                <Button
                  type="button"
                  onClick={nextStep}
                  className="bg-emerald-600 hover:bg-emerald-700 h-9"
                >
                  Próximo
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="bg-emerald-600 hover:bg-emerald-700 h-9"
                >
                  {loading ? 'Salvando...' : 'Finalizar'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ConfigurarClinica;
