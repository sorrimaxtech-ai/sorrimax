import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useDemoMode } from "@/hooks/useDemoMode";
import { demoMetricas, demoUsuario, demoClinica, demoConsultas } from "@/data/demoData";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { TodaySchedule } from "@/components/dashboard/TodaySchedule";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users, Calendar, Activity, Info, UserRoundPlus, CalendarClock, Cake,
  UserCheck, UserRoundPlus as NovosIcon, Stethoscope,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LabelList,
} from "recharts";

// Cores dos gráficos — par validado para daltonismo (ΔE≥23 em todos os tipos
// de CVD, contraste ≥3:1 no fundo claro). Azul = marca; âmbar = falta.
const COR_SERIE = "#0099c7";
const COR_OK = "#0077b6";
const COR_FALTA = "#d97706";
const ESTILO_TOOLTIP = {
  backgroundColor: "white",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
} as const;

// Série do gráfico: vem de `consultas` (banco), NUNCA inventada.
// Mostrar número falso num dashboard é pior que não mostrar nada — o dono da
// clínica toma decisão em cima do que vê.
const MESES_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// Estado vazio dos gráficos — mesma altura do gráfico para o grid não pular.
const GraficoVazio = ({ texto }: { texto: string }) => (
  <div className="h-[260px] flex flex-col items-center justify-center text-center gap-2">
    <Activity className="h-10 w-10 text-gray-300" />
    <p className="text-sm font-medium text-gray-700">Ainda sem dados</p>
    <p className="text-xs text-gray-500 max-w-sm">{texto}</p>
  </div>
);

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
  const [comparecimento, setComparecimento] = useState<
    { mes: string; concluidas: number; faltas: number }[]
  >([]);
  const [novosPacientes, setNovosPacientes] = useState<{ mes: string; novos: number }[]>([]);
  const [porProfissional, setPorProfissional] = useState<{ nome: string; consultas: number }[]>([]);

  const carregarPainel = async (clinicaId: string) => {
    const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
    const hoje1 = new Date(); hoje1.setHours(23, 59, 59, 999);
    const ama0 = new Date(hoje0); ama0.setDate(ama0.getDate() + 1);
    const ama1 = new Date(hoje1); ama1.setDate(ama1.getDate() + 1);
    const CANCELADAS = "(cancelado,desmarcado,cancelado_pelo_cliente,recusado)";

    const seisMeses = new Date(hoje0);
    seisMeses.setMonth(seisMeses.getMonth() - 5);
    seisMeses.setDate(1);
    const mesAtual = `${hoje0.getFullYear()}-${String(hoje0.getMonth() + 1).padStart(2, "0")}-01`;

    const [ativos, hoje, amanha, nasc, ocupacao, criados, profs] = await Promise.all([
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
      supabase.from("vw_ocupacao_agenda")
        .select("mes, profissional_id, total_consultas, concluidas, no_show")
        .eq("clinica_id", clinicaId)
        .gte("mes", seisMeses.toISOString().slice(0, 10)),
      supabase.from("pacientes").select("created_at")
        .eq("clinica_id", clinicaId)
        .gte("created_at", seisMeses.toISOString())
        .limit(5000),
      supabase.from("profiles").select("id, full_name").eq("clinica_id", clinicaId),
    ]);

    for (const r of [ativos, hoje, amanha, nasc, ocupacao, criados, profs]) {
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

    // Esqueleto zero-preenchido dos 6 meses (mesma regra do gráfico de
    // crescimento: nunca inventar número, mas nunca pular mês sem dado).
    const meses: { chave: string; rotulo: string }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(seisMeses);
      d.setMonth(seisMeses.getMonth() + i);
      meses.push({
        chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        rotulo: MESES_PT[d.getMonth()],
      });
    }

    const ocupRows = (ocupacao.data as any[]) ?? [];
    setComparecimento(meses.map((m) => {
      const doMes = ocupRows.filter((r) => String(r.mes).startsWith(m.chave));
      return {
        mes: m.rotulo,
        concluidas: doMes.reduce((s, r) => s + Number(r.concluidas ?? 0), 0),
        faltas: doMes.reduce((s, r) => s + Number(r.no_show ?? 0), 0),
      };
    }));

    const criadosRows = (criados.data as any[]) ?? [];
    setNovosPacientes(meses.map((m) => ({
      mes: m.rotulo,
      novos: criadosRows.filter((p) => String(p.created_at).startsWith(m.chave)).length,
    })));

    const nomes = new Map(((profs.data as any[]) ?? []).map((p) => [p.id, p.full_name]));
    const porProf = new Map<string, number>();
    for (const r of ocupRows.filter((r) => String(r.mes).startsWith(mesAtual.slice(0, 7)))) {
      if (!r.profissional_id) continue;
      porProf.set(r.profissional_id, (porProf.get(r.profissional_id) ?? 0) + Number(r.total_consultas ?? 0));
    }
    setPorProfissional(
      Array.from(porProf.entries())
        .map(([id, consultas]) => ({
          nome: (nomes.get(id) ?? "Profissional").split(" ").slice(0, 2).join(" "),
          consultas,
        }))
        .sort((a, b) => b.consultas - a.consultas)
        .slice(0, 6),
    );
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
        <div className="p-6">
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
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <MetricCard
              index={0}
              title="Pacientes Ativos"
              value={pacientesAtivos.toString()}
              icon={Users}
              iconColor="text-brand-600"
            />
            <MetricCard
              index={1}
              title="Consultas Hoje"
              value={consultasHoje.toString()}
              icon={Calendar}
              iconColor="text-brand-600"
            />
            <MetricCard
              index={2}
              title="Amanhã sem confirmação"
              value={semConfirmacao.length.toString()}
              change={semConfirmacao.length > 0 ? "precisa de atenção" : "tudo confirmado"}
              changeType={semConfirmacao.length > 0 ? "negative" : "positive"}
              icon={CalendarClock}
              iconColor={semConfirmacao.length > 0 ? "text-amber-600" : "text-emerald-600"}
            />
            <MetricCard
              index={3}
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

          {/* Análises — dados reais do banco, nada financeiro */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Crescimento de agendamentos */}
            <Card className="border-gray-100 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-brand-600" />
                  Crescimento de Agendamentos
                </CardTitle>
                <p className="text-xs text-gray-500">{isDemo ? "Dados de demonstração" : "Últimos 6 meses"}</p>
              </CardHeader>
              <CardContent>
                {serieCrescimento.some((d) => d.agendamentos > 0) ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={serieCrescimento}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="month" stroke="#666" tickLine={false} axisLine={false} />
                      <YAxis stroke="#666" allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                      <Tooltip contentStyle={ESTILO_TOOLTIP} />
                      <Line
                        type="monotone"
                        dataKey="agendamentos"
                        name="Agendamentos"
                        stroke={COR_SERIE}
                        strokeWidth={2}
                        dot={{ fill: COR_SERIE, r: 4 }}
                        activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
                        // animação do recharts trava no 1º frame e some com a linha
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <GraficoVazio texto="O gráfico aparece assim que a primeira consulta for marcada." />
                )}
              </CardContent>
            </Card>

            {/* Comparecimento × faltas */}
            <Card className="border-gray-100 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-brand-600" />
                  Comparecimento × Faltas
                </CardTitle>
                <p className="text-xs text-gray-500">Consultas concluídas e não comparecimentos por mês</p>
              </CardHeader>
              <CardContent>
                {comparecimento.some((d) => d.concluidas > 0 || d.faltas > 0) ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={comparecimento} barCategoryGap="28%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="mes" stroke="#666" tickLine={false} axisLine={false} />
                      <YAxis stroke="#666" allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                      <Tooltip contentStyle={ESTILO_TOOLTIP} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="concluidas" name="Concluídas" stackId="a" fill={COR_OK}
                        stroke="#fff" strokeWidth={2} maxBarSize={28} isAnimationActive={false} />
                      <Bar dataKey="faltas" name="Faltas" stackId="a" fill={COR_FALTA}
                        stroke="#fff" strokeWidth={2} maxBarSize={28} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <GraficoVazio texto="Aparece quando houver consultas concluídas ou faltas registradas." />
                )}
              </CardContent>
            </Card>

            {/* Novos pacientes por mês */}
            <Card className="border-gray-100 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <NovosIcon className="h-4 w-4 text-brand-600" />
                  Novos Pacientes
                </CardTitle>
                <p className="text-xs text-gray-500">Cadastros por mês — o termômetro de captação</p>
              </CardHeader>
              <CardContent>
                {novosPacientes.some((d) => d.novos > 0) ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={novosPacientes} barCategoryGap="28%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="mes" stroke="#666" tickLine={false} axisLine={false} />
                      <YAxis stroke="#666" allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                      <Tooltip contentStyle={ESTILO_TOOLTIP} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                      <Bar dataKey="novos" name="Novos pacientes" fill={COR_SERIE}
                        radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <GraficoVazio texto="Aparece com o primeiro cadastro de paciente do período." />
                )}
              </CardContent>
            </Card>

            {/* Consultas por profissional (mês atual) */}
            <Card className="border-gray-100 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-brand-600" />
                  Consultas por Profissional
                </CardTitle>
                <p className="text-xs text-gray-500">Mês atual — distribuição da produção clínica</p>
              </CardHeader>
              <CardContent>
                {porProfissional.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={porProfissional} layout="vertical" barCategoryGap="28%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" stroke="#666" allowDecimals={false} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="nome" stroke="#666" tickLine={false} axisLine={false} width={120} />
                      <Tooltip contentStyle={ESTILO_TOOLTIP} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                      <Bar dataKey="consultas" name="Consultas" fill={COR_OK}
                        radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
                        <LabelList dataKey="consultas" position="right" style={{ fill: "#374151", fontSize: 12 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <GraficoVazio texto="Aparece quando houver consultas atribuídas a profissionais neste mês." />
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
