import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Search, Plus, Loader2, Lock, Gift, Infinity as Infinito, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useTenant } from "@/hooks/useTenant";
import { traduzErro } from "@/lib/erros";
import { DialogNovaClinica } from "@/components/plataforma/DialogNovaClinica";
import { PainelConta } from "@/components/plataforma/PainelConta";
import {
  listarClinicas, dinheiro, data, desdeQuando, textoTrial,
  rotuloPlano, rotuloStatus, CLASSE_STATUS, PLANOS_SAAS,
  type ClinicaPlataforma, type FiltroClinicas,
} from "@/services/plataforma";

// ============================================================================
// Clínicas — a lista de contas
// ----------------------------------------------------------------------------
// Uma linha por clínica com as quatro coisas que decidem o que fazer: quanto
// paga, em que situação está, quanto tempo de teste sobra e há quanto tempo
// alguém não entra. O resto abre no painel lateral.
//
// Os filtros vivem na URL para que o link do cartão da visão geral
// (?status=trial) já chegue filtrado, e para poder mandar "olha essas aqui"
// para alguém.
// ============================================================================

const FILTROS_SITUACAO = [
  { id: "todos", nome: "Todas as situações" },
  { id: "ativa", nome: "Pagando" },
  { id: "trial", nome: "Em teste" },
  { id: "atrasada", nome: "Em atraso" },
  { id: "cancelada", nome: "Canceladas" },
  { id: "cortesia", nome: "Cortesia" },
  { id: "bloqueada", nome: "Bloqueadas" },
];

const ORDENS = [
  { id: "recentes", nome: "Mais recentes" },
  { id: "mrr", nome: "Maior valor" },
  { id: "uso", nome: "Usaram por último" },
  { id: "risco", nome: "Sumidas primeiro" },
  { id: "nome", nome: "Nome" },
];

export default function Contas() {
  const { isPlataformaDono } = useTenant();
  const [params, setParams] = useSearchParams();
  const [lista, setLista] = useState<ClinicaPlataforma[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState(params.get("busca") ?? "");
  const [novaAberta, setNovaAberta] = useState(false);
  const [abertaId, setAbertaId] = useState<string | null>(null);

  const status = params.get("status") || "";
  const plano = params.get("plano") || "";
  const uf = params.get("uf") || "";
  const ordem = (params.get("ordem") as FiltroClinicas["ordem"]) || "recentes";

  const trocar = (chave: string, valor: string) => {
    const p = new URLSearchParams(params);
    if (!valor || valor === "todos") p.delete(chave); else p.set(chave, valor);
    setParams(p, { replace: true });
  };

  const carregar = useCallback(async (termo: string) => {
    setCarregando(true);
    try {
      setLista(await listarClinicas({ busca: termo, status, plano, uf, ordem, limite: 500 }));
    } catch (e) {
      toast.error("Não foi possível carregar as clínicas", { description: traduzErro(e) });
    } finally {
      setCarregando(false);
    }
  }, [status, plano, uf, ordem]);

  // busca com respiro: digitar não dispara uma consulta por tecla
  useEffect(() => {
    const t = setTimeout(() => carregar(busca), busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [busca, carregar]);

  const totais = useMemo(() => ({
    quantidade: lista.length,
    mrr: lista.reduce((s, c) => s + (c.mrr ?? 0), 0),
  }), [lista]);

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------ filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Nome, código, e-mail ou cidade"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <Select value={status || "todos"} onValueChange={(v) => trocar("status", v)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FILTROS_SITUACAO.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={plano || "todos"} onValueChange={(v) => trocar("plano", v)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os planos</SelectItem>
            {PLANOS_SAAS.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={ordem} onValueChange={(v) => trocar("ordem", v)}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ORDENS.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
          </SelectContent>
        </Select>

        {isPlataformaDono && (
          <Button onClick={() => setNovaAberta(true)}>
            <Plus className="mr-1.5 h-4 w-4" />Nova clínica
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span>
          {totais.quantidade} {totais.quantidade === 1 ? "clínica" : "clínicas"}
          {totais.mrr > 0 && ` · ${dinheiro(totais.mrr)} por mês somados`}
        </span>
        {uf && (
          <button
            onClick={() => trocar("uf", "")}
            className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-brand-700 transition-colors hover:bg-brand-100"
          >
            {uf} ✕
          </button>
        )}
      </div>

      {/* ------------------------------------------------ lista */}
      {carregando ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : lista.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Building2 className="h-10 w-10 text-gray-300" />
            <p className="font-medium text-gray-700">Nenhuma clínica com esse filtro</p>
            <p className="max-w-sm text-sm text-gray-500">
              Tente limpar a busca ou trocar a situação.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50/80">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2.5 font-medium">Clínica</th>
                  <th className="px-3 py-2.5 font-medium">Situação</th>
                  <th className="px-3 py-2.5 text-right font-medium">Por mês</th>
                  <th className="px-3 py-2.5 font-medium">Teste</th>
                  <th className="px-3 py-2.5 text-right font-medium">Uso</th>
                  <th className="px-3 py-2.5 font-medium">Último acesso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lista.map((c) => {
                  const t = textoTrial(c);
                  const sumida = (c.dias_sem_acesso ?? 999) > 14;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setAbertaId(c.id)}
                      className="cursor-pointer transition-colors hover:bg-brand-50/40"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-900">{c.nome}</p>
                            <p className="truncate text-xs text-gray-500">
                              {c.codigo}
                              {c.cidade && ` · ${c.cidade}`}{c.estado && `/${c.estado}`}
                            </p>
                          </div>
                          {c.bloqueada && <Lock className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                          {c.cortesia && <Gift className="h-3.5 w-3.5 shrink-0 text-violet-500" />}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className={CLASSE_STATUS[c.status] ?? ""}>
                          {rotuloStatus(c.status)}
                        </Badge>
                        <p className="mt-0.5 text-xs text-gray-500">{rotuloPlano(c.plano)}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <p className="font-medium">{c.mrr > 0 ? dinheiro(c.mrr) : "—"}</p>
                        {c.valor != null && c.ciclo !== "mensal" && (
                          <p className="text-xs text-gray-500">{dinheiro(c.valor)}/{c.ciclo}</p>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 text-xs ${t.tom}`}>
                        <span className="flex items-center gap-1">
                          {(c.trial_infinito || c.cortesia) && <Infinito className="h-3 w-3" />}
                          {t.texto}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-gray-600">
                        <p>{c.pacientes} pacientes</p>
                        <p className="text-gray-400">{c.usuarios} pessoas · {c.consultas_30d} consultas</p>
                      </td>
                      <td className={`px-3 py-2.5 text-xs ${sumida ? "text-red-600" : "text-gray-600"}`}>
                        {desdeQuando(c.ultimo_acesso)}
                        <p className="text-gray-400">entrou em {data(c.criada_em)}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DialogNovaClinica
        aberto={novaAberta}
        onFechar={() => setNovaAberta(false)}
        onCriada={() => carregar(busca)}
      />

      <PainelConta
        clinicaId={abertaId}
        onFechar={() => setAbertaId(null)}
        onMudou={() => carregar(busca)}
        podeMexerEmDinheiro={isPlataformaDono}
      />
    </div>
  );
}
