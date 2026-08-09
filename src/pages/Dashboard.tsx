import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useDemoMode } from "@/hooks/useDemoMode";
import { demoMetricas, demoUsuario, demoClinica, demoConsultas } from "@/data/demoData";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { TodaySchedule } from "@/components/dashboard/TodaySchedule";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calendar, TrendingUp, Activity, Info } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// Série do gráfico: vem de `consultas` (banco), NUNCA inventada.
// Mostrar número falso num dashboard é pior que não mostrar nada — o dono da
// clínica toma decisão em cima do que vê.
const MESES_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const Dashboard = () => {
  const navigate = useNavigate();
  const { isDemo } = useDemoMode();
  const [userName, setUserName] = useState("Usuário");
  const [clinicName, setClinicName] = useState("");
  const [loading, setLoading] = useState(true);
  const [serieCrescimento, setSerieCrescimento] = useState<
    { month: string; agendamentos: number }[]
  >(() =>
    // esqueleto dos 6 meses com ZERO — nunca com número inventado
    Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      return { month: MESES_PT[d.getMonth()], agendamentos: 0 };
    }),
  );

  // Conta consultas reais por mês (últimos 6 meses) para o gráfico.
  const carregarCrescimento = async (clinicaId: string) => {
    const inicio = new Date();
    inicio.setMonth(inicio.getMonth() - 5);
    inicio.setDate(1);
    inicio.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from("consultas")
      .select("inicio")
      .eq("clinica_id", clinicaId)
      .gte("inicio", inicio.toISOString());

    if (error) {
      console.error("[dashboard] crescimento:", error.message);
      return;
    }

    const balde = new Map<string, number>();
    for (let i = 0; i < 6; i++) {
      const d = new Date(inicio);
      d.setMonth(inicio.getMonth() + i);
      balde.set(`${d.getFullYear()}-${d.getMonth()}`, 0);
    }
    (data ?? []).forEach((c) => {
      const d = new Date(c.inicio as string);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      if (balde.has(k)) balde.set(k, (balde.get(k) ?? 0) + 1);
    });

    setSerieCrescimento(
      Array.from(balde.entries()).map(([k, v]) => ({
        month: MESES_PT[Number(k.split("-")[1])],
        agendamentos: v,
      })),
    );
  };

  useEffect(() => {
    const checkAuthAndFetchData = async () => {
      // Se estiver em modo demo, pular autenticação
      if (isDemo) {
        setUserName(demoUsuario.nome);
        setClinicName(demoClinica.nome);
        setSerieCrescimento(
          demoConsultas
            ? Array.from({ length: 6 }, (_, i) => {
                const d = new Date();
                d.setMonth(d.getMonth() - (5 - i));
                return { month: MESES_PT[d.getMonth()], agendamentos: 8 + i * 4 };
              })
            : [],
        );
        setLoading(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }

      try {
        setLoading(true);
        // Fetch User Profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, clinica_id')
          .eq('id', session.user.id)
          .single();

        if (profileError) {
            console.error("Error fetching profile:", profileError);
        }

        if (profile) {
            setUserName(profile.full_name || "Usuário");
            
            if (profile.clinica_id) {
                const { data: clinica, error: clinicaError } = await supabase
                  .from('clinicas')
                  .select('nome_clinica')
                  .eq('id', profile.clinica_id)
                  .single();
                
                if (!clinicaError && clinica) {
                  setClinicName(clinica.nome_clinica);
                }
                await carregarCrescimento(profile.clinica_id);
            }
        }

      } catch (error) {
        console.error("Erro ao carregar dados:", error);
      } finally {
        setLoading(false);
      }
    };

    checkAuthAndFetchData();
  }, [navigate, isDemo]);

  // Usar métricas demo se estiver em modo demo
  const metricas = isDemo ? demoMetricas : {
    totalPacientes: 0,
    consultasHoje: 0,
    taxaConversao: 0,
  };

  return (
    <div className="flex min-h-full bg-gradient-to-br from-gray-50 to-emerald-50/30 dashboard-theme">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-8">
          {/* Demo Mode Banner */}
          {isDemo && (
            <div className="mb-6 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg p-4 shadow-lg">
              <div className="flex items-center gap-3">
                <Info className="h-5 w-5" />
                <div>
                  <p className="font-semibold">Modo Demonstração</p>
                  <p className="text-sm text-white/90">Você está navegando com dados fictícios. Explore todas as funcionalidades!</p>
                </div>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-1">Dashboard</h1>
            <div className="flex flex-col">
              <p className="text-xl text-emerald-700 font-semibold">
                Bem-vindo de volta, {userName}!
              </p>
              {clinicName && (
                <p className="text-sm text-gray-500 mt-1">
                  Gerenciando: <span className="font-medium text-gray-700">{clinicName}</span>
                </p>
              )}
            </div>
          </div>

          {/* Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <MetricCard
              title="Total de Pacientes"
              value={metricas.totalPacientes.toString()}
              change={isDemo ? "+23 este mês" : "Em breve"}
              changeType={isDemo ? "positive" : "neutral"}
              icon={Users}
              iconColor="text-emerald-600"
            />
            <MetricCard
              title="Consultas Hoje"
              value={metricas.consultasHoje.toString()}
              change={isDemo ? "4 confirmadas" : undefined}
              icon={Calendar}
              iconColor="text-blue-600"
            />
            <MetricCard
              title="Taxa de Conversão"
              value={`${metricas.taxaConversao}%`}
              change={isDemo ? "+12% vs mês anterior" : "Em breve"}
              changeType={isDemo ? "positive" : "neutral"}
              icon={TrendingUp}
              iconColor="text-purple-600"
            />
          </div>

          {/* Crescimento de agendamentos — dados reais */}
          <div className="mb-8">
            <Card className="border-gray-100 shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-emerald-600" />
                  Crescimento de Agendamentos
                </CardTitle>
                <p className="text-sm text-gray-600">
                  {isDemo ? "Dados de demonstração" : "Últimos 6 meses"}
                </p>
              </CardHeader>
              <CardContent>
                {serieCrescimento.some((d) => d.agendamentos > 0) ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={serieCrescimento}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" stroke="#666" />
                      <YAxis stroke="#666" allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="agendamentos"
                        stroke="#10b981"
                        strokeWidth={3}
                        dot={{ fill: '#10b981', r: 6 }}
                        activeDot={{ r: 8 }}
                        // A animação do recharts anima stroke-dasharray de 0 até o
                        // comprimento da curva. Aqui ela travava no 1º frame
                        // (dasharray "6px 1202px") e a linha ficava INVISÍVEL —
                        // o gráfico parecia vazio mesmo com dado correto.
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex flex-col items-center justify-center text-center gap-2">
                    <Activity className="h-10 w-10 text-gray-300" />
                    <p className="text-sm font-medium text-gray-700">Ainda sem agendamentos</p>
                    <p className="text-xs text-gray-500 max-w-sm">
                      O gráfico aparece assim que a primeira consulta for marcada.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Agenda do Dia - Takes 2 columns */}
            <div className="lg:col-span-2">
              <TodaySchedule />
            </div>

            {/* Ações Rápidas - Takes 1 column */}
            <div>
              <QuickActions />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
