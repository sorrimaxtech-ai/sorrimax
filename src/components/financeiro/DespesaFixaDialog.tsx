import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "sonner";
import { traduzErro } from "@/lib/erros";

// ============================================================================
// DespesaFixaDialog — cadastro do MOLDE, não da conta em si
// ----------------------------------------------------------------------------
// `despesas_fixas` é template recorrente (aluguel, salário, software). Ela não
// aparece no fluxo de caixa sozinha: só vira dinheiro quando a tela de Contas a
// Pagar gera o lançamento + parcela do mês a partir dela. Por isso aqui não há
// nenhum campo de status/pagamento — quem paga é a parcela gerada.
// ============================================================================

export interface DespesaFixa {
  id: string;
  descricao: string;
  valor: number;
  dia_vencimento: number;
  categoria_id: string | null;
  conta_id: string | null;
  inicio: string;
  fim: string | null;
  ativo: boolean;
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  onSalvo: () => void;
  /** Preenchido = edição; nulo/ausente = criação. */
  despesa?: DespesaFixa | null;
}

const NENHUMA = "__nenhuma__"; // Select do shadcn não aceita value="" (limpa a seleção)

/** Hoje no fuso do usuário. `toISOString()` é UTC e, em BRT, das 21h em diante já
 *  devolve o dia seguinte — a vigência começaria um dia depois do que o usuário viu. */
const hojeISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const DespesaFixaDialog = ({ aberto, onFechar, onSalvo, despesa }: Props) => {
  const { clinicaId } = useTenant();

  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([]);
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([]);

  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [diaVencimento, setDiaVencimento] = useState("5");
  const [categoriaId, setCategoriaId] = useState(NENHUMA);
  const [contaId, setContaId] = useState(NENHUMA);
  const [inicio, setInicio] = useState(hojeISO());
  const [fim, setFim] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Reidrata o formulário a cada abertura: sem isso, editar A depois B mostraria A.
  useEffect(() => {
    if (!aberto) return;
    setDescricao(despesa?.descricao ?? "");
    setValor(despesa ? String(despesa.valor) : "");
    setDiaVencimento(String(despesa?.dia_vencimento ?? 5));
    setCategoriaId(despesa?.categoria_id ?? NENHUMA);
    setContaId(despesa?.conta_id ?? NENHUMA);
    setInicio(despesa?.inicio ?? hojeISO());
    setFim(despesa?.fim ?? "");
    setAtivo(despesa?.ativo ?? true);
  }, [aberto, despesa]);

  useEffect(() => {
    if (!aberto || !clinicaId) return;
    let vivo = true;
    (async () => {
      const [cat, ct] = await Promise.all([
        supabase.from("categorias_financeiras").select("id, nome")
          .eq("clinica_id", clinicaId).eq("tipo", "pagar").eq("ativo", true).order("nome"),
        supabase.from("contas_financeiras").select("id, nome")
          .eq("clinica_id", clinicaId).eq("ativo", true).order("nome"),
      ]);
      if (!vivo) return;
      if (cat.error) toast.error("Erro ao carregar categorias", { description: traduzErro(cat.error) });
      if (ct.error) toast.error("Erro ao carregar contas", { description: traduzErro(ct.error) });
      setCategorias(cat.data ?? []);
      setContas(ct.data ?? []);
    })();
    return () => { vivo = false; };
  }, [aberto, clinicaId]);

  const validar = (): string | null => {
    if (!descricao.trim()) return "Descreva a despesa (ex.: Aluguel da clínica).";
    const v = Number(valor.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) return "Informe um valor maior que zero.";
    const dia = Number(diaVencimento);
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) return "Dia de vencimento deve ficar entre 1 e 31.";
    if (fim && fim < inicio) return "A data final não pode ser anterior à data de início.";
    return null;
  };

  const salvar = async () => {
    if (!clinicaId) { toast.error("Clínica não identificada"); return; }
    const erro = validar();
    if (erro) { toast.error("Revise o formulário", { description: erro }); return; }

    setSalvando(true);
    const campos = {
      descricao: descricao.trim(),
      valor: Number(valor.replace(",", ".")),
      dia_vencimento: Number(diaVencimento),
      categoria_id: categoriaId === NENHUMA ? null : categoriaId,
      conta_id: contaId === NENHUMA ? null : contaId,
      inicio,
      fim: fim || null,
      ativo,
    };

    // `clinica_id` só vai no INSERT: reescrevê-lo no UPDATE é o caminho para mover
    // uma despesa de clínica sem querer. O tenant do registro existente não muda.
    const { data, error } = despesa
      ? await supabase.from("despesas_fixas").update(campos)
          .eq("id", despesa.id).eq("clinica_id", clinicaId).select("id")
      : await supabase.from("despesas_fixas").insert({ ...campos, clinica_id: clinicaId }).select("id");

    setSalvando(false);
    if (error) {
      toast.error("Erro ao salvar despesa fixa", { description: traduzErro(error) });
      return;
    }
    // RLS negando UPDATE não gera erro no PostgREST — só devolve zero linhas.
    if (!data?.length) {
      toast.error("Nada foi salvo", {
        description: "O registro não existe mais ou você não tem permissão nesta clínica.",
      });
      return;
    }
    toast.success(despesa ? "Despesa fixa atualizada" : "Despesa fixa cadastrada");
    onSalvo();
    onFechar();
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{despesa ? "Editar despesa fixa" : "Nova despesa fixa"}</DialogTitle>
          <DialogDescription>
            O molde que se repete todo mês. Depois de salvo, use "Gerar lançamentos do mês"
            para transformar em conta a pagar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="df-descricao">Descrição *</Label>
            <Input id="df-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)}
                   placeholder="Ex.: Aluguel da clínica" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="df-valor">Valor mensal (R$) *</Label>
              <Input id="df-valor" inputMode="decimal" value={valor}
                     onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="df-dia">Dia do vencimento *</Label>
              <Input id="df-dia" type="number" min={1} max={31} value={diaVencimento}
                     onChange={(e) => setDiaVencimento(e.target.value)} />
              <p className="text-[11px] text-gray-400">
                Em meses mais curtos o vencimento cai no último dia do mês.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoriaId} onValueChange={setCategoriaId}>
                <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NENHUMA}>Sem categoria</SelectItem>
                  {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {categorias.length === 0 && (
                <p className="text-[11px] text-gray-400">
                  Nenhuma categoria de despesa cadastrada ainda.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Conta de saída</Label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger><SelectValue placeholder="Sem conta" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NENHUMA}>Sem conta</SelectItem>
                  {contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="df-inicio">Vigente a partir de</Label>
              <Input id="df-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="df-fim">Vigente até (opcional)</Label>
              <Input id="df-fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-gray-100 p-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Ativa</p>
              <p className="text-[11px] text-gray-400">Só despesas ativas entram na geração mensal.</p>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="bg-brand-600 hover:bg-brand-700 gap-2">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {despesa ? "Salvar alterações" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DespesaFixaDialog;
