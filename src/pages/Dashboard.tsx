import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useDemoMode } from "@/hooks/useDemoMode";
import { demoMetricas, demoUsuario, demoClinica, demoConsultas } from "@/data/demoData";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { TodaySchedule } from "@/components/dashboard/TodaySchedule";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { linkWhatsApp } from "@/services/pacientes";
import {
  Users, Calendar, Activity, Info, UserRoundPlus, CalendarClock, Cake,
  MessageCircle, UserRoundSearch,
} from "lucide-react";
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

  // Painel operacional (sem nada financeiro): contagens e listas de ação.
  const [pacientesAtivos, setPacientesAtivos] = useState(0);
  const [consultasHoje, setConsultasHoje] = useState(0);
  const [semConfirmacao, setSemConfirmacao] = useState<any[]>([]);
  const [aniversariantes, setAniversariantes] = useState<any[]>([]);
  const [recall, setRecall] = useState<any[]>([]);

  const carregarPainel = async (clinicaId: string) => {
    const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
    const hoje1 = new Date(); hoje1.setHours(23, 59, 59, 999);
    const ama0 = new Date(hoje0); ama0.setDate(ama0.getDate() + 1);
    const ama1 = new Date(hoje1); ama1.setDate(ama1.getDate() + 1);
    const CANCELADAS = "(cancelado,desmarcado,cancelado_pelo_cliente,recusado)";

    const [ativos, hoje, amanha, nasc, inativos] = await Promise.all([
      supabase.from("pacientes").select("id", { count: "exact", head: true })
        .eq("clinica_id", clinicaId).eq("ativo", true),
      supabase.from("consultas").select("id", { count: "exact", head: true })
        .eq("clinica_id", clinicaId)
        .gte("inicio", hoje0.toISOString()).lte("inicio", hoje1.toISOString())
        .not("status", "in", CANCELADAS),
      supabase.from("consultas")
        .select("id, inicio, status, pacientes(nome_completo, celular)")
        .eq("clinica_id", clinicaId)
        .gte("inicio", ama0.toISOString()).lte("inicio", ama1.toISOString())
        .in("status", ["pendente", "agendado", "reagendado"])
        .order("inicio", { ascending: true }),
      supabase.from("pacientes").select("id, nome_completo, celular, data_nascimento")
        .eq("clinica_id", clinicaId).eq("ativo", true)
        .not("data_nascimento", "is", null).limit(2000),
      supabase.from("vw_pacientes_inativos")
        .select("paciente_id, nome_completo, celular, dias_sem_vir")
        .eq("clinica_id", clinicaId)
        .order("dias_sem_vir", { ascending: true })
        .limit(6),
    ]);

    for (const r of [ativos, hoje, amanha, nasc, inativos]) {
      if (r.error) console.error("[dashboard] painel:", r.error.message);
    }
    if (ativos.count !== null) setPacientesAtivos(ativos.count);
    if (hoje.count !== null) setConsultasHoje(hoje.count);
    setSemConfirmacao((amanha.data as any[]) ?? []);
    const agora = new Date();
    setAniversariantes(((nasc.data as any[]) ?? []).filter((p) => {
      // meio-dia evita o aniversário escorregar de dia por fuso horário
      const d = new Date(`${p.data_nascimento}T12:00:00`);
      return d.getDate() === agora.getDate() && d.getMonth() === agora.getMonth();
    }));
    setRecall((inativos.data as any[]) ?? []);
  };

  // Conta consultas reais por mês (últimos 6 meses) para o gráfico.
  const carregarCrescimento = async (clinicaId: string) => {
    const inicio = new Date();
    inicio.setMonth(inicio.getMonth() - 5);
    inicio.setDate(1);
    inicio.setHours(0, 0, 0, 0);

    // Agrega no banco (RPC): antes baixava as linhas cruas e o PostgREST cortava
    // em 1000, subcontando o gráfico de clínica movimentada. count() no SQL não
    // tem esse teto e não trafega linha.
    const { data, error } = await supabase.rpc("dashboard_crescimento", { p_meses: 6 });

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
    (data ?? []).forEach((r: { ano: number; mes: number; total: number }) => {
      const k = `${r.ano}-${r.mes - 1}`; // mes vem 1-12 do SQL; a chave usa 0-11
      if (balde.has(k)) balde.set(k, Number(r.total));
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
        setPacientesAtivos(demoMetricas.totalPacientes);
        setConsultasHoje(demoMetricas.consultasHoje);
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
                await Promise.all([
                  carregarCrescimento(profile.clinica_id),
                  carregarPainel(profile.clinica_id),
                ]);
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

  return (
    <div className="flex min-h-full bg-background dashboard-theme">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-8">
          {/* Demo Mode Banner */}
          {isDemo && (
            <div className="mb-6 bg-gradient-to-r from-brand-700 to-brand-500 text-white rounded-lg p-4 shadow-lg">
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
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">Dashboard</h1>
              <div className="flex flex-col">
                <p className="text-xl text-brand-700 font-semibold">
                  Bem-vindo de volta, {userName}!
                </p>
                {clinicName && (
                  <p className="text-sm text-gray-500 mt-1">
                    Gerenciando: <span className="font-medium text-gray-700">{clinicName}</span>
                  </p>
                )}
              </div>
            </div>
            <Button
              onClick={() => navigate("/pacientes?novo=1")}
              className="bg-brand-600 hover:bg-brand-700 gap-2"
            >
              <UserRoundPlus className="h-4 w-4" />
              Novo Paciente
            </Button>
          </div>

          {/* Cards operacionais — números REAIS do banco, nada financeiro */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
            <MetricCard
              title="Pacientes Ativos"
              value={pacientesAtivos.toString()}
              icon={Users}
              iconColor="text-brand-600"
            />
            <MetricCard
              title="Consultas Hoje"
              value={consultasHoje.toString()}
              icon={Calendar}
              iconColor="text-brand-600"
            />
            <MetricCard
              title="Amanhã sem confirmação"
              value={semConfirmacao.length.toString()}
              change={semConfirmacao.length > 0 ? "precisa de atenção" : "tudo confirmado"}
              changeType={semConfirmacao.length > 0 ? "negative" : "positive"}
              icon={CalendarClock}
              iconColor={semConfirmacao.length > 0 ? "text-amber-600" : "text-emerald-600"}
            />
            <MetricCard
              title="Aniversariantes Hoje"
              value={aniversariantes.length.toString()}
              icon={Cake}
              iconColor="text-purple-600"
            />
          </div>

          {/* Agenda do dia em primeiro — é o que o dentista olha ao abrir o sistema */}
          <div className="mb-8">
            <TodaySchedule />
          </div>

          {/* Listas de ação: o que dá para resolver AGORA com uma mensagem */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <Card className="border-gray-100">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Amanhã — aguardando confirmação
                  </p>
                  {semConfirmacao.length > 0 && (
                    <Badge className="bg-amber-100 text-amber-800 border-0">{semConfirmacao.length}</Badge>
                  )}
                </div>
                {semConfirmacao.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 text-center">
                    Nenhuma consulta de amanhã pendente de confirmação.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {semConfirmacao.map((c) => {
                      const hora = new Date(c.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                      const nome = c.pacientes?.nome_completo ?? "Paciente";
                      const wa = linkWhatsApp(
                        c.pacientes?.celular ?? "",
                        `Olá, ${nome.split(" ")[0]}! Podemos confirmar sua consulta de amanhã às ${hora}?`,
                      );
                      return (
                        <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100">
                          <span className="w-12 text-sm font-bold text-gray-900 tabular-nums">{hora}</span>
                          <span className="flex-1 min-w-0 truncate text-sm text-gray-800">{nome}</span>
                          {wa && (
                            <Button asChild size="sm" variant="outline" className="gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                              <a href={wa} target="_blank" rel="noreferrer">
                                <MessageCircle className="h-3.5 w-3.5" /> Confirmar
                              </a>
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              {aniversariantes.length > 0 && (
                <Card className="border-gray-100">
                  <CardContent className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
                      Aniversariantes de hoje 🎂
                    </p>
                    <div className="space-y-2">
                      {aniversariantes.map((p) => {
                        const wa = linkWhatsApp(
                          p.celular ?? "",
                          `Feliz aniversário, ${p.nome_completo.split(" ")[0]}! 🎉 Toda a equipe deseja um dia incrível!`,
                        );
                        return (
                          <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100">
                            <span className="flex-1 min-w-0 truncate text-sm text-gray-800">{p.nome_completo}</span>
                            {wa && (
                              <Button asChild size="sm" variant="outline" className="gap-1.5 text-purple-700 border-purple-200 hover:bg-purple-50">
                                <a href={wa} target="_blank" rel="noreferrer">
                                  <Cake className="h-3.5 w-3.5" /> Parabenizar
                                </a>
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className="border-gray-100">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Pacientes para reativar
                    </p>
                    <UserRoundSearch className="h-4 w-4 text-gray-400" />
                  </div>
                  {recall.length === 0 ? (
                    <p className="text-sm text-gray-500 py-4 text-center">
                      Nenhum paciente sumido — a base está em dia.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {recall.map((p) => {
                        const wa = linkWhatsApp(
                          p.celular ?? "",
                          `Olá, ${p.nome_completo.split(" ")[0]}! Sentimos sua falta por aqui. Que tal agendar uma avaliação?`,
                        );
                        return (
                          <div key={p.paciente_id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100">
                            <span className="flex-1 min-w-0 truncate text-sm text-gray-800">{p.nome_completo}</span>
                            <span className="text-xs text-gray-500 whitespace-nowrap">{p.dias_sem_vir} dias</span>
                            {wa && (
                              <Button asChild size="sm" variant="outline" className="gap-1.5 text-brand-700 border-brand-200 hover:bg-brand-50">
                                <a href={wa} target="_blank" rel="noreferrer">
                                  <MessageCircle className="h-3.5 w-3.5" /> Chamar
                                </a>
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Crescimento de agendamentos — dados reais */}
          <div className="mb-8">
            <Card className="border-gray-100 shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-brand-600" />
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
                        stroke="#00b4d8"
                        strokeWidth={3}
                        dot={{ fill: '#00b4d8', r: 6 }}
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
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
