import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Receipt, Plus, Search, Loader2, FileText } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import {
  listarOrcamentos, brl, STATUS_LABEL, STATUS_CLASSE, type StatusOrcamento,
} from "@/services/orcamentos";
import { NovoOrcamentoDialog } from "@/components/orcamentos/NovoOrcamentoDialog";
import { toast } from "sonner";
import { traduzErro } from "@/lib/erros";

// ============================================================================
// Orçamentos — lista + KPIs
// ----------------------------------------------------------------------------
// Os KPIs medem DINHEIRO PARADO (em aberto, aprovado não faturado), não volume.
// É o que o dono da clínica precisa ver: receita identificada e não capturada.
// ============================================================================

const Orcamentos = () => {
  const navigate = useNavigate();
  const { clinicaId, carregando: carregandoCtx } = useTenant();
  const [lista, setLista] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<string>("todos");
  const [abrirNovo, setAbrirNovo] = useState(false);

  const carregar = async () => {
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; }
    setCarregando(true);
    try {
      setLista(await listarOrcamentos(clinicaId));
    } catch (e: any) {
      toast.error("Erro ao carregar orçamentos", { description: traduzErro(e) });
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [clinicaId, carregandoCtx]);

  const visiveis = useMemo(() => lista.filter((o) => {
    const okStatus = filtro === "todos" || o.status === filtro;
    const alvo = `${o.numero} ${o.titulo ?? ""} ${o.pacientes?.nome_completo ?? ""}`.toLowerCase();
    return okStatus && (!busca || alvo.includes(busca.toLowerCase()));
  }), [lista, filtro, busca]);

  const kpis = useMemo(() => {
    const emAberto = lista.filter((o) => ["aberto", "aprovado_parcial"].includes(o.status));
    const aprovados = lista.filter((o) => ["aprovado", "aprovado_parcial"].includes(o.status));
    const reprovados = lista.filter((o) => o.status === "reprovado");
    return {
      emAberto: emAberto.reduce((s, o) => s + Number(o.total_itens ?? 0), 0),
      aprovado: aprovados.reduce((s, o) => s + Number(o.total_aprovado ?? 0), 0),
      perdido: reprovados.reduce((s, o) => s + Number(o.total_itens ?? 0), 0),
      taxa: lista.length
        ? Math.round((aprovados.length / lista.length) * 100)
        : 0,
    };
  }, [lista]);

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Receipt className="h-6 w-6 text-brand-600" /> Orçamentos
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                Aprovar um orçamento gera os tratamentos e as contas a receber automaticamente.
              </p>
            </div>
            <Button onClick={() => setAbrirNovo(true)} className="bg-brand-600 hover:bg-brand-700 gap-2">
              <Plus className="h-4 w-4" /> Novo Orçamento
            </Button>
          </div>

          {/* KPIs de dinheiro */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[
              { rot: "Em aberto", val: brl(kpis.emAberto), cor: "text-amber-600", sub: "aguardando decisão" },
              { rot: "Aprovado", val: brl(kpis.aprovado), cor: "text-emerald-600", sub: "vira tratamento + débito" },
              { rot: "Perdido", val: brl(kpis.perdido), cor: "text-red-500", sub: "reprovado pelo paciente" },
              { rot: "Taxa de aprovação", val: `${kpis.taxa}%`, cor: "text-sky-600", sub: "orçamentos aprovados" },
            ].map((k) => (
              <Card key={k.rot} className="border-gray-100">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500">{k.rot}</p>
                  <p className={`text-xl font-bold mt-0.5 ${k.cor}`}>{k.val}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por número, título ou paciente"
                     value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {(Object.keys(STATUS_LABEL) as StatusOrcamento[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lista */}
          <Card className="border-gray-100">
            <CardContent className="p-0">
              {carregandoCtx || carregando ? (
                <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : visiveis.length === 0 ? (
                <div className="p-12 text-center">
                  <FileText className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                  <p className="font-medium text-gray-800">
                    {lista.length === 0 ? "Nenhum orçamento ainda" : "Nada encontrado com esse filtro"}
                  </p>
                  <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                    {lista.length === 0
                      ? "O orçamento é o centro do fluxo: dele saem os tratamentos no odontograma e as contas a receber."
                      : "Ajuste a busca ou o status."}
                  </p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/30">
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Nº</th>
                      <th className="px-4 py-2.5 font-medium">Paciente</th>
                      <th className="px-4 py-2.5 font-medium">Título</th>
                      <th className="px-4 py-2.5 font-medium text-right">Total</th>
                      <th className="px-4 py-2.5 font-medium text-right">Aprovado</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 font-medium">Criado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((o) => (
                      <tr key={o.id}
                          onClick={() => navigate(`/orcamentos/${o.id}`)}
                          className="border-b border-border/50 hover:bg-muted/40 cursor-pointer">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{o.numero}</td>
                        <td className="px-4 py-3 font-medium">{o.pacientes?.nome_completo ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{o.titulo ?? "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{brl(Number(o.total_itens))}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-brand-700">
                          {brl(Number(o.total_aprovado))}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`${STATUS_CLASSE[o.status as StatusOrcamento]} hover:opacity-100 border-0 font-medium`}>
                            {STATUS_LABEL[o.status as StatusOrcamento]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {new Date(o.created_at).toLocaleDateString("pt-BR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <NovoOrcamentoDialog
        aberto={abrirNovo}
        onFechar={() => setAbrirNovo(false)}
        onCriado={(id) => { setAbrirNovo(false); navigate(`/orcamentos/${id}`); }}
      />
    </div>
  );
};

export default Orcamentos;
