import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { CampoMoeda } from "@/components/ui/campo-moeda";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PLANOS_SAAS, CICLOS, STATUS_ASSINATURA, dinheiro } from "@/services/plataforma";

// ============================================================================
// Condição comercial — o bloco que define quanto e por quanto tempo
// ----------------------------------------------------------------------------
// Mesmo bloco em três lugares (clínica nova, conversão de contato, edição da
// conta), então mora aqui. O valor é livre de propósito: o preço de tabela é
// sugestão, e quem fecha no telefone precisa poder combinar outro sem pedir
// deploy. A prévia embaixo mostra o efeito no faturamento mensal — é fácil
// digitar 1970 no anual achando que é o mês.
// ============================================================================

export interface Comercial {
  plano: string;
  valor: number | null;
  ciclo: string;
  status: string;
  trialDias: number;
  trialInfinito: boolean;
  cortesia: boolean;
}

export const COMERCIAL_PADRAO: Comercial = {
  plano: "trial",
  valor: null,
  ciclo: "mensal",
  status: "trial",
  trialDias: 7,
  trialInfinito: false,
  cortesia: false,
};

const mesesDoCiclo = (id: string) => CICLOS.find((c) => c.id === id)?.meses ?? 1;

/** Atalhos de teste — o que a gente realmente oferece na conversa de venda. */
const ATALHOS_TRIAL = [7, 15, 30, 60, 90, 180];

interface Props {
  valor: Comercial;
  onChange: (c: Comercial) => void;
  /** Na criação o status começa em teste; na edição ele é escolhido. */
  mostrarStatus?: boolean;
}

export function CamposComerciais({ valor: c, onChange, mostrarStatus = true }: Props) {
  const set = (p: Partial<Comercial>) => onChange({ ...c, ...p });
  const mensal = c.valor != null ? c.valor / mesesDoCiclo(c.ciclo) : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Plano</Label>
          <Select value={c.plano} onValueChange={(v) => set({ plano: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PLANOS_SAAS.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {mostrarStatus && (
          <div className="space-y-1.5">
            <Label>Situação</Label>
            <Select value={c.status} onValueChange={(v) => set({ status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_ASSINATURA.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Valor combinado</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">R$</span>
            <CampoMoeda
              className="pl-9"
              value={c.valor}
              onChange={(v) => set({ valor: v })}
              placeholder="0,00"
              disabled={c.cortesia}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Cobrado a cada</Label>
          <Select value={c.ciclo} onValueChange={(v) => set({ ciclo: v })} disabled={c.cortesia}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CICLOS.map((x) => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {mensal != null && !c.cortesia && c.ciclo !== "mensal" && (
        <p className="rounded-md bg-brand-50 px-3 py-2 text-xs text-brand-800">
          {dinheiro(c.valor)} a cada {mesesDoCiclo(c.ciclo)} meses entra como{" "}
          <strong>{dinheiro(mensal)} por mês</strong> no faturamento.
        </p>
      )}

      {/* ---------------------------------------------------- teste grátis */}
      <div className="space-y-3 rounded-lg border border-gray-200 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-sm">Teste grátis sem prazo</Label>
            <p className="text-xs text-gray-500">Nunca vence — para parceiro, sócio ou clínica-piloto</p>
          </div>
          <Switch checked={c.trialInfinito} onCheckedChange={(v) => set({ trialInfinito: v })} />
        </div>

        {!c.trialInfinito && (
          <div className="space-y-2">
            <Label className="text-sm">Dias de teste</Label>
            <div className="flex flex-wrap gap-1.5">
              {ATALHOS_TRIAL.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => set({ trialDias: d })}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    c.trialDias === d
                      ? "border-brand-500 bg-brand-50 font-medium text-brand-800"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {d >= 30 ? `${Math.round(d / 30)} ${d >= 60 ? "meses" : "mês"}` : `${d} dias`}
                </button>
              ))}
              <Input
                type="number"
                min={0}
                value={c.trialDias}
                onChange={(e) => set({ trialDias: Math.max(0, Number(e.target.value) || 0) })}
                className="h-7 w-20 text-xs"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50/50 p-3">
        <div>
          <Label className="text-sm">Cortesia</Label>
          <p className="text-xs text-gray-600">
            Usa tudo e não paga nunca. Fica fora da conta de faturamento.
          </p>
        </div>
        <Switch
          checked={c.cortesia}
          onCheckedChange={(v) => set({ cortesia: v, trialInfinito: v ? true : c.trialInfinito })}
        />
      </div>
    </div>
  );
}
