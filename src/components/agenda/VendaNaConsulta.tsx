import { traduzErro } from "@/lib/erros";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampoMoeda } from "@/components/ui/campo-moeda";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { lancarVendaNaConsulta, type ProcedimentoAgenda } from "@/services/agenda";

// ============================================================================
// VendaNaConsulta — a venda nasce na agenda
// ----------------------------------------------------------------------------
// O fluxo de clínica odontológica não é "abrir o módulo de vendas e procurar o
// paciente". É: o paciente sentou na cadeira, executou-se o procedimento, e o
// lançamento sai DALI, com o paciente e o profissional já resolvidos pelo
// agendamento. Este diálogo é esse caminho.
//
// Os itens viram `orcamento_itens` já aprovados (foram executados), e o
// orçamento resultante alimenta odontograma, comissão e contas a receber pelos
// mesmos gatilhos que já existiam — sem caminho paralelo de dinheiro.
// ============================================================================

interface Linha {
  procedimentoId: string;
  quantidade: number;
  valorUnitario: string;
  dente: string;
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  consultaId: string | null;
  pacienteNome: string;
  procedimentos: ProcedimentoAgenda[];
  /** Procedimento já escolhido no agendamento — vira a primeira linha. */
  servicoIdSugerido?: string | null;
  jaTemOrcamento: boolean;
  onLancado: () => void;
}

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

export const VendaNaConsulta = ({
  aberto, onFechar, consultaId, pacienteNome, procedimentos,
  servicoIdSugerido, jaTemOrcamento, onLancado,
}: Props) => {
  const navigate = useNavigate();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [salvando, setSalvando] = useState(false);

  const porId = useMemo(
    () => Object.fromEntries(procedimentos.map((p) => [p.id, p])),
    [procedimentos],
  );

  // Reabrir o diálogo recomeça do procedimento do agendamento: manter linhas de
  // um atendimento anterior lançaria venda no paciente errado.
  useEffect(() => {
    if (!aberto) return;
    const p = servicoIdSugerido ? porId[servicoIdSugerido] : undefined;
    setLinhas(
      p
        ? [{ procedimentoId: p.id, quantidade: 1, valorUnitario: String(p.valor ?? 0), dente: "" }]
        : [],
    );
  }, [aberto, servicoIdSugerido, porId]);

  const adicionar = () =>
    setLinhas((l) => [...l, { procedimentoId: "", quantidade: 1, valorUnitario: "", dente: "" }]);

  const alterar = (i: number, campo: keyof Linha, valor: string | number) =>
    setLinhas((l) => l.map((x, idx) => {
      if (idx !== i) return x;
      const novo = { ...x, [campo]: valor } as Linha;
      // trocar o procedimento traz o preço de tabela para a recepção não digitar
      if (campo === "procedimentoId") {
        novo.valorUnitario = String(porId[valor as string]?.valor ?? 0);
      }
      return novo;
    }));

  const remover = (i: number) => setLinhas((l) => l.filter((_, idx) => idx !== i));

  const total = linhas.reduce((s, l) => {
    const v = Number(String(l.valorUnitario).replace(",", ".")) || 0;
    return s + v * (l.quantidade || 0);
  }, 0);

  const lancar = async () => {
    if (!consultaId) return;
    const validas = linhas.filter((l) => l.procedimentoId);
    if (!validas.length) { toast.error("Adicione ao menos um procedimento"); return; }

    for (const l of validas) {
      if (!l.quantidade || l.quantidade < 1) { toast.error("Quantidade inválida"); return; }
      const v = Number(String(l.valorUnitario).replace(",", "."));
      if (Number.isNaN(v) || v < 0) { toast.error("Valor inválido"); return; }
      if (l.dente && !/^\d{2}$/.test(l.dente)) {
        toast.error("Dente inválido", { description: "Use a notação FDI de dois dígitos (ex.: 11, 46)." });
        return;
      }
    }

    setSalvando(true);
    try {
      const orcamentoId = await lancarVendaNaConsulta(
        consultaId,
        validas.map((l) => ({
          procedimento_id: l.procedimentoId,
          quantidade: l.quantidade,
          valor_unitario: Number(String(l.valorUnitario).replace(",", ".")),
          dente: l.dente ? Number(l.dente) : null,
        })),
      );
      toast.success("Venda lançada", {
        description: "Os procedimentos entraram no orçamento do paciente.",
        action: { label: "Abrir", onClick: () => navigate(`/orcamentos/${orcamentoId}`) },
      });
      onLancado();
      onFechar();
    } catch (e: any) {
      toast.error("Erro ao lançar a venda", { description: traduzErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-brand-600" /> Lançar venda do atendimento
          </DialogTitle>
          <DialogDescription>
            Procedimentos executados em <strong>{pacienteNome}</strong>. Entram como aprovados no
            orçamento e viram conta a receber e comissão pelo caminho normal.
            {jaTemOrcamento && " Este atendimento já tem venda: os itens serão somados a ela."}
          </DialogDescription>
        </DialogHeader>

        {linhas.length === 0 ? (
          <div className="py-8 text-center">
            <Receipt className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="font-medium text-gray-800">Nenhum procedimento na venda</p>
            <p className="text-sm text-gray-500 mt-1">
              Adicione o que foi executado neste atendimento.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {linhas.map((l, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_5rem_6rem_7rem_2.5rem] items-end">
                <div className="min-w-0">
                  {i === 0 && <Label className="text-xs">Procedimento</Label>}
                  <Select value={l.procedimentoId} onValueChange={(v) => alterar(i, "procedimentoId", v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {procedimentos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  {i === 0 && <Label className="text-xs">Dente</Label>}
                  <Input
                    className="mt-1" inputMode="numeric" maxLength={2} placeholder="—"
                    value={l.dente} onChange={(e) => alterar(i, "dente", e.target.value)}
                  />
                </div>
                <div>
                  {i === 0 && <Label className="text-xs">Qtd</Label>}
                  <Input
                    className="mt-1" type="number" min={1} step={1} value={l.quantidade}
                    onChange={(e) => alterar(i, "quantidade", Number(e.target.value))}
                  />
                </div>
                <div>
                  {i === 0 && <Label className="text-xs">Valor unit.</Label>}
                  <CampoMoeda
                    className="mt-1" value={l.valorUnitario === "" ? null : Number(l.valorUnitario)}
                    onChange={(r) => alterar(i, "valorUnitario", r == null ? "" : String(r))}
                  />
                </div>
                <Button
                  variant="ghost" size="icon" aria-label="Remover procedimento"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => remover(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-3">
          <Button variant="outline" onClick={adicionar} className="gap-2">
            <Plus className="h-4 w-4" /> Adicionar procedimento
          </Button>
          <div className="text-right">
            <p className="text-xs text-gray-500">Total da venda</p>
            <p className="text-xl font-bold text-brand-600 tabular-nums">{brl(total)}</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button
            className="bg-brand-600 hover:bg-brand-700 gap-2"
            onClick={lancar}
            disabled={salvando || linhas.length === 0}
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Lançar venda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
