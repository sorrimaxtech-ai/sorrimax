import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Wallet, TrendingUp, Building2, Users, Clock, AlertTriangle, Gift,
  UserPlus, Activity, CalendarCheck, Loader2, Stethoscope, MessageSquare,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardIndicador } from "@/components/plataforma/CardIndicador";
import { traduzErro } from "@/lib/erros";
import {
  visaoGeral, serieMensal, dinheiro, dinheiroCurto, dataHora,
  type VisaoGeral, type PontoSerie,
} from "@/services/plataforma";

// ============================================================================
// Visão geral da plataforma
// ----------------------------------------------------------------------------
// Ordem das seções = ordem das perguntas de quem abre isto de manhã:
//   1. quanto entra?      2. quantas contas e em que situação?
//   3. estão usando?      4. o que precisa de mim hoje?
//   5. está crescendo?    6. quanto de operação roda em cima da gente?
// A seção 4 é clicável: cada alerta leva à lista já filtrada, senão vira
// número bonito que ninguém age em cima.
// ============================================================================

const COR_NOVAS = "#0099c7";
const COR_ACUM = "#0077b6";
const COR_LEADS = "#d97706";
const ESTILO_TOOLTIP = {
  backgroundColor: "white",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
} as const;

export default function Visao() {
  const navigate = useNavigate();
  const [v, setV] = useState<VisaoGeral | null>(null);
  const [serie, setSerie] = useState<PontoSerie[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [geral, s] = await Promise.all([visaoGeral(), serieMensal(12)]);
        if (!vivo) return;
        setV(geral);
        setSerie(s);
      } catch (e) {
        if (vivo) toast.error("Não foi possível carregar os números", { description: traduzErro(e) });
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  if (carregando) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!v) return null;

  const crescimento = v.novas_mes - v.novas_mes_anterior;
  const paraContas = (filtro: string) => navigate(`/plataforma/contas?status=${filtro}`);

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------ dinheiro */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Receita</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CardIndicador
            titulo="Receita por mês" valor={dinheiro(v.mrr)} icone={Wallet} destaque index={0}
            detalhe={`${v.clinicas_pagantes} ${v.clinicas_pagantes === 1 ? "clínica pagando" : "clínicas pagando"}`}
          />
          <CardIndicador
            titulo="Receita no ano" valor={dinheiroCurto(v.arr)} icone={TrendingUp} index={1}
            detalhe="Se ninguém entrar nem sair"
          />
          <CardIndicador
            titulo="Ticket médio" valor={dinheiro(v.ticket_medio)} icone={Wallet} index={2}
            detalhe="Por clínica pagante, por mês"
          />
          <CardIndicador
            titulo="Pode virar receita" valor={dinheiro(v.receita_potencial)} icone={Clock} index={3}
            detalhe="Em teste ou em atraso, com valor combinado"
          />
        </div>
      </section>

      {/* ------------------------------------------------------ contas */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Clínicas</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <CardIndicador
            titulo="Total" valor={v.clinicas_total} icone={Building2} index={0}
            detalhe={`${v.novas_mes} ${v.novas_mes === 1 ? "nova" : "novas"} este mês`}
            onClick={() => paraContas("")}
          />
          <CardIndicador
            titulo="Pagando" valor={v.clinicas_pagantes} icone={Wallet} destaque index={1}
            detalhe="Assinatura em dia"
            onClick={() => paraContas("ativa")}
          />
          <CardIndicador
            titulo="Em teste" valor={v.clinicas_trial} icone={Clock} index={2}
            detalhe={`${v.conversao_trial_pct}% viram cliente`}
            onClick={() => paraContas("trial")}
          />
          <CardIndicador
            titulo="Cortesia" valor={v.clinicas_cortesia} icone={Gift} index={3}
            detalhe="Usam sem pagar, por decisão nossa"
            onClick={() => paraContas("cortesia")}
          />
          <CardIndicador
            titulo="Bloqueadas" valor={v.clinicas_bloqueadas} icone={AlertTriangle} index={4}
            alerta={v.clinicas_bloqueadas > 0}
            detalhe="Sem acesso ao sistema"
            onClick={() => paraContas("bloqueada")}
          />
        </div>
      </section>

      {/* ------------------------------------------------------ uso */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Uso de verdade</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CardIndicador
            titulo="Pessoas ativas (7 dias)" valor={v.usuarios_ativos_7d} icone={Users} index={0}
            detalhe={`de ${v.usuarios_total} cadastradas`}
          />
          <CardIndicador
            titulo="Pessoas ativas (30 dias)" valor={v.usuarios_ativos_30d} icone={Users} index={1}
            detalhe={v.usuarios_nunca_entraram > 0
              ? `${v.usuarios_nunca_entraram} nunca entraram`
              : "todo mundo já entrou"}
            alerta={v.usuarios_nunca_entraram > 0}
          />
          <CardIndicador
            titulo="Clínicas usando (30 dias)" valor={v.clinicas_ativas_30d} icone={Activity} index={2}
            detalhe={`de ${v.clinicas_total} no total`}
          />
          <CardIndicador
            titulo="Paradas há 14 dias" valor={v.clinicas_paradas_14d} icone={AlertTriangle} index={3}
            alerta={v.clinicas_paradas_14d > 0}
            detalhe="Ninguém entrou — risco de perder"
            onClick={() => navigate("/plataforma/contas?ordem=risco")}
          />
        </div>
      </section>

      {/* ------------------------------------------------------ o que fazer hoje */}
      {(v.trials_expirando_7d > 0 || v.trials_vencidos > 0 || v.clinicas_atrasadas > 0 || v.leads_abertos > 0) && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Precisa de você</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CardIndicador
              titulo="Testes vencendo em 7 dias" valor={v.trials_expirando_7d} icone={Clock}
              alerta={v.trials_expirando_7d > 0} index={0}
              detalhe="Hora de ligar ou estender"
              onClick={() => paraContas("trial")}
            />
            <CardIndicador
              titulo="Testes já vencidos" valor={v.trials_vencidos} icone={AlertTriangle}
              alerta={v.trials_vencidos > 0} index={1}
              detalhe="Ainda usando de graça"
              onClick={() => paraContas("trial")}
            />
            <CardIndicador
              titulo="Pagamento em atraso" valor={v.clinicas_atrasadas} icone={Wallet}
              alerta={v.clinicas_atrasadas > 0} index={2}
              detalhe="Cobrar antes de bloquear"
              onClick={() => paraContas("atrasada")}
            />
            <CardIndicador
              titulo="Contatos em aberto" valor={v.leads_abertos} icone={UserPlus} index={3}
              detalhe={`${v.leads_novos_mes} chegaram este mês`}
              onClick={() => navigate("/plataforma/potenciais")}
            />
          </div>
        </section>
      )}

      {/* ------------------------------------------------------ crescimento */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="border-gray-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Clínicas por mês</CardTitle>
            <p className="text-xs text-gray-500">
              {crescimento === 0 ? "Mesmo ritmo do mês passado"
                : crescimento > 0 ? `${crescimento} a mais que o mês passado`
                : `${Math.abs(crescimento)} a menos que o mês passado`}
            </p>
          </CardHeader>
          <CardContent>
            {serie.every((p) => p.novas === 0) ? (
              <Vazio texto="Nenhuma clínica cadastrada nos últimos 12 meses." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={serie} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={ESTILO_TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="novas" name="Novas" fill={COR_NOVAS} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="canceladas" name="Canceladas" fill="#f87171" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Base acumulada e contatos</CardTitle>
            <p className="text-xs text-gray-500">Clínicas cadastradas até cada mês, e contatos que chegaram</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={serie} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={ESTILO_TOOLTIP} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="ativas_acumulado" name="Clínicas" stroke={COR_ACUM} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="leads" name="Contatos" stroke={COR_LEADS} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>

      {/* ------------------------------------------------------ operação */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Operação que roda no Sorrimax
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <CardIndicador titulo="Pacientes" valor={v.pacientes_total.toLocaleString("pt-BR")} icone={Users} index={0}
            detalhe="Somando todas as clínicas" />
          <CardIndicador titulo="Consultas (30 dias)" valor={v.consultas_30d.toLocaleString("pt-BR")} icone={CalendarCheck} index={1} />
          <CardIndicador titulo="Orçamentos (30 dias)" valor={v.orcamentos_30d.toLocaleString("pt-BR")} icone={TrendingUp} index={2} />
          <CardIndicador titulo="Cadeiras" valor={v.cadeiras_total} icone={Stethoscope} index={3}
            detalhe="Unidades de atendimento ativas" />
          <CardIndicador titulo="WhatsApp ligado" valor={v.whatsapp_conectados} icone={MessageSquare} index={4}
            detalhe="Clínicas com número conectado" />
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Números atualizados em {dataHora(v.atualizado_em)}. O painel conta registros — nenhum dado de
          paciente sai da clínica que o cadastrou.
        </p>
      </section>
    </div>
  );
}

const Vazio = ({ texto }: { texto: string }) => (
  <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center">
    <Activity className="h-10 w-10 text-gray-300" />
    <p className="text-sm font-medium text-gray-700">Ainda sem dados</p>
    <p className="max-w-sm text-xs text-gray-500">{texto}</p>
  </div>
);
