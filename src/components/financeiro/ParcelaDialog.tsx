import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle2, Info, CreditCard } from "lucide-react";
import { toast } from "sonner";
import {
  baixarParcela, criarLancamentoAvulso, acharTaxa, calcularTaxa, ehCartao, brl, dataBR,
  hojeISO, somarDias, FORMA_PAGAMENTO_LABEL, FORMAS_PAGAMENTO, TIPO_CONTA_LABEL,
  type ParcelaComLancamento, type ContaFinanceira, type CategoriaFinanceira,
  type TaxaCartao, type FormaPagamento, type TipoLancamento,
} from "@/services/financeiro";

// ============================================================================
// Diálogos de parcela — baixa de pagamento e lançamento avulso
// ----------------------------------------------------------------------------
// A baixa é o único ponto do app que fecha o ciclo comercial → financeiro →
// comissão. Por isso o formulário insiste em taxa e conta: sem eles o valor
// líquido fica igual ao bruto e a conciliação bancária do mês não bate.
// ============================================================================

const NENHUM = "__nenhum__"; // Radix não aceita <SelectItem value=""> vazio

interface ParcelaDialogProps {
  aberto: boolean;
  parcela: ParcelaComLancamento | null;
  contas: ContaFinanceira[];
  taxas: TaxaCartao[];
  onFechar: () => void;
  onSalvo: () => void;
}

export const ParcelaDialog = ({
  aberto, parcela, contas, taxas, onFechar, onSalvo,
}: ParcelaDialogProps) => {
  const [pagoEm, setPagoEm] = useState(hojeISO());
  const [valorPago, setValorPago] = useState("");
  const [forma, setForma] = useState<FormaPagamento>("pix");
  const [contaId, setContaId] = useState<string>(NENHUM);
  const [adquirente, setAdquirente] = useState<string>(NENHUM);
  const [taxaManual, setTaxaManual] = useState("");
  const [taxaEditada, setTaxaEditada] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const qtdParcelasLancamento = parcela?.lancamentos?.qtd_parcelas ?? 1;

  // reabre sempre com os valores da parcela, nunca com resto do diálogo anterior
  useEffect(() => {
    if (!aberto || !parcela) return;
    setPagoEm(hojeISO());
    setValorPago(String(Number(parcela.valor ?? 0).toFixed(2)));
    setForma(parcela.forma_pagamento ?? parcela.lancamentos?.forma_pagamento ?? "pix");
    const principal = contas.find((c) => c.principal);
    setContaId(parcela.conta_id ?? principal?.id ?? NENHUM);
    setAdquirente(NENHUM);
    setTaxaManual("");
    setTaxaEditada(false);
    setSalvando(false);
  }, [aberto, parcela, contas]);

  const adquirentes = useMemo(
    () => Array.from(new Set(taxas.map((t) => t.adquirente))).sort(),
    [taxas],
  );

  const taxaSugerida = useMemo(() => {
    if (!ehCartao(forma) || adquirente === NENHUM) return null;
    return acharTaxa(taxas, adquirente, qtdParcelasLancamento);
  }, [forma, adquirente, taxas, qtdParcelasLancamento]);

  const valorNum = Number(valorPago.replace(",", ".")) || 0;

  // enquanto o usuário não digita a taxa na mão, ela segue a tabela do adquirente
  const taxaCalculada = useMemo(
    () => (taxaEditada ? Number(taxaManual.replace(",", ".")) || 0 : calcularTaxa(taxaSugerida, valorNum)),
    [taxaEditada, taxaManual, taxaSugerida, valorNum],
  );

  const previsaoCredito = useMemo(() => {
    if (!ehCartao(forma) || !taxaSugerida || !pagoEm) return null;
    return somarDias(pagoEm, taxaSugerida.prazo_dias);
  }, [forma, taxaSugerida, pagoEm]);

  const liquido = Math.round((valorNum - taxaCalculada) * 100) / 100;

  const validar = (): string | null => {
    if (!pagoEm) return "Informe a data do pagamento.";
    if (pagoEm > hojeISO()) return "A data do pagamento não pode ser futura.";
    if (valorNum <= 0) return "O valor pago precisa ser maior que zero.";
    if (taxaCalculada < 0) return "A taxa não pode ser negativa.";
    if (taxaCalculada > valorNum) return "A taxa não pode ser maior que o valor pago.";
    return null;
  };

  const salvar = async () => {
    if (!parcela) return;
    const erro = validar();
    if (erro) { toast.error(erro); return; }

    setSalvando(true);
    try {
      await baixarParcela({
        parcelaId: parcela.id,
        clinicaId: parcela.clinica_id,
        pagoEm,
        valorPago: valorNum,
        forma,
        contaId: contaId === NENHUM ? null : contaId,
        taxaValor: taxaCalculada,
        previsaoCredito,
      });
      toast.success("Pagamento registrado", {
        description: "Se houver comissão vinculada a esta parcela, o sistema já a liberou.",
      });
      onSalvo();
      onFechar();
    } catch (e: any) {
      toast.error("Erro ao registrar o pagamento", { description: e.message });
    } finally {
      setSalvando(false);
    }
  };

  if (!parcela) return null;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !salvando && onFechar()}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Marcar como pago
          </DialogTitle>
          <DialogDescription>
            {parcela.lancamentos?.descricao ?? "Parcela"} · parcela {parcela.numero}/{qtdParcelasLancamento} ·
            vencimento {dataBR(parcela.vencimento)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="rounded-md bg-muted/40 px-3 py-2 text-sm flex items-center justify-between">
            <span className="text-muted-foreground">Valor da parcela</span>
            <span className="font-semibold text-gray-900">{brl(parcela.valor)}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pagoEm">Data do pagamento *</Label>
              <Input id="pagoEm" type="date" max={hojeISO()} value={pagoEm}
                onChange={(e) => setPagoEm(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valorPago">Valor pago *</Label>
              <Input id="valorPago" type="number" min="0" step="0.01" value={valorPago}
                onChange={(e) => setValorPago(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Forma de pagamento *</Label>
              <Select value={forma} onValueChange={(v) => { setForma(v as FormaPagamento); setTaxaEditada(false); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGAMENTO.map((f) => (
                    <SelectItem key={f} value={f}>{FORMA_PAGAMENTO_LABEL[f]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Conta financeira</Label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NENHUM}>Não informar</SelectItem>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} · {TIPO_CONTA_LABEL[c.tipo]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {contas.length === 0 && (
                <p className="text-[11px] text-gray-400">
                  Nenhuma conta cadastrada ainda — cadastre em Configurações para conciliar o caixa.
                </p>
              )}
            </div>
          </div>

          {ehCartao(forma) && (
            <div className="rounded-md border border-gray-100 p-3 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                <CreditCard className="h-4 w-4 text-brand-600" /> Taxa da operadora
              </div>

              {adquirentes.length === 0 && (
                <p className="text-xs text-gray-500">
                  Nenhuma taxa de cartão cadastrada. Informe o valor da taxa na mão abaixo ou cadastre
                  as faixas em Configurações para o cálculo ficar automático.
                </p>
              )}

              {/* O campo de taxa fica SEMPRE visível. Antes ele só existia quando havia
                  adquirente cadastrado — e o texto acima mandava "informar na mão" um valor
                  que não tinha onde ser digitado, gravando taxa 0 e inflando o líquido. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {adquirentes.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Adquirente</Label>
                    <Select value={adquirente} onValueChange={(v) => { setAdquirente(v); setTaxaEditada(false); }}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NENHUM}>Não informar</SelectItem>
                        {adquirentes.map((a) => (
                          <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="taxa">Taxa (R$)</Label>
                  <Input
                    id="taxa" type="number" min="0" step="0.01"
                    value={taxaEditada ? taxaManual : String(taxaCalculada.toFixed(2))}
                    onChange={(e) => { setTaxaEditada(true); setTaxaManual(e.target.value); }}
                  />
                </div>
              </div>

              {taxaSugerida && (
                <p className="text-[11px] text-gray-500">
                  Faixa {taxaSugerida.parcelas_de}–{taxaSugerida.parcelas_ate}x:
                  {" "}{Number(taxaSugerida.percentual).toFixed(2)}%
                  {Number(taxaSugerida.valor_fixo) > 0 && ` + ${brl(taxaSugerida.valor_fixo)}`}
                  {" "}· crédito em {taxaSugerida.prazo_dias} dia(s)
                  {previsaoCredito && ` (previsto para ${dataBR(previsaoCredito)})`}
                </p>
              )}
            </div>
          )}

          <div className="rounded-md bg-brand-50 px-3 py-2 flex items-center justify-between">
            <span className="text-sm text-brand-900">Valor líquido</span>
            <span className="text-base font-bold text-brand-700">{brl(liquido)}</span>
          </div>

          <p className="text-[11px] text-gray-500 flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-gray-400" />
            Ao confirmar, o valor líquido é calculado pelo servidor (valor pago menos a taxa) e, se
            existir comissão vinculada a esta parcela, ela passa de{" "}
            <span className="font-medium">prevista</span> para <span className="font-medium">liberada</span>.
            Estornar depois desfaz a baixa e reverte a comissão liberada de volta para prevista.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="bg-brand-600 hover:bg-brand-700 gap-2">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Confirmar pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------

interface AvulsoDialogProps {
  aberto: boolean;
  clinicaId: string | null;
  tipo: TipoLancamento;
  contas: ContaFinanceira[];
  categorias: CategoriaFinanceira[];
  onFechar: () => void;
  onCriado: () => void;
}

/**
 * Receita/despesa que não nasceu de orçamento — aluguel recebido, venda de
 * produto, conta de fornecedor. Fica sem `paciente_id` de propósito: vincular
 * a um paciente aqui poluiria o histórico clínico dele.
 */
export const LancamentoAvulsoDialog = ({
  aberto, clinicaId, tipo, contas, categorias, onFechar, onCriado,
}: AvulsoDialogProps) => {
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState(hojeISO());
  const [qtdParcelas, setQtdParcelas] = useState("1");
  const [categoriaId, setCategoriaId] = useState(NENHUM);
  const [contaId, setContaId] = useState(NENHUM);
  const [forma, setForma] = useState<string>(NENHUM);
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setDescricao("");
    setValor("");
    setVencimento(hojeISO());
    setQtdParcelas("1");
    setCategoriaId(NENHUM);
    setContaId(contas.find((c) => c.principal)?.id ?? NENHUM);
    setForma(NENHUM);
    setObservacoes("");
    setSalvando(false);
  }, [aberto, contas]);

  const valorNum = Number(valor.replace(",", ".")) || 0;
  const qtdNum = Math.max(1, Math.floor(Number(qtdParcelas) || 1));
  const rotuloTipo = tipo === "receber" ? "receita" : "despesa";

  const salvar = async () => {
    if (!clinicaId) { toast.error("Clínica não identificada."); return; }
    if (!descricao.trim()) { toast.error("Descreva o lançamento."); return; }
    if (valorNum <= 0) { toast.error("O valor precisa ser maior que zero."); return; }
    if (!vencimento) { toast.error("Informe o vencimento."); return; }
    if (qtdNum > 60) { toast.error("Máximo de 60 parcelas."); return; }

    setSalvando(true);
    try {
      await criarLancamentoAvulso({
        clinicaId,
        tipo,
        descricao,
        valorTotal: valorNum,
        primeiroVencimento: vencimento,
        qtdParcelas: qtdNum,
        categoriaId: categoriaId === NENHUM ? null : categoriaId,
        contaId: contaId === NENHUM ? null : contaId,
        forma: forma === NENHUM ? null : (forma as FormaPagamento),
        observacoes,
      });
      toast.success(`Lançamento de ${rotuloTipo} criado`);
      onCriado();
      onFechar();
    } catch (e: any) {
      toast.error("Erro ao criar o lançamento", { description: e.message });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !salvando && onFechar()}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo lançamento avulso</DialogTitle>
          <DialogDescription>
            {tipo === "receber"
              ? "Receita sem vínculo com orçamento — aluguel de sala, venda de produto, reembolso."
              : "Despesa sem vínculo com orçamento — fornecedor, conta de consumo, serviço."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="desc">Descrição *</Label>
            <Input id="desc" value={descricao} maxLength={160}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder={tipo === "receber" ? "Ex.: venda de clareador caseiro" : "Ex.: conta de luz"} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="valor">Valor total *</Label>
              <Input id="valor" type="number" min="0" step="0.01" value={valor}
                onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="venc">1º vencimento *</Label>
              <Input id="venc" type="date" value={vencimento}
                onChange={(e) => setVencimento(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="qtd">Parcelas</Label>
              <Input id="qtd" type="number" min="1" max="60" step="1" value={qtdParcelas}
                onChange={(e) => setQtdParcelas(e.target.value)} />
            </div>
          </div>

          {qtdNum > 1 && valorNum > 0 && (
            <p className="text-[11px] text-gray-500">
              {qtdNum}x de aproximadamente {brl(valorNum / qtdNum)}, com vencimento mensal a partir de{" "}
              {dataBR(vencimento)}. A diferença de centavos vai para a última parcela.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoriaId} onValueChange={setCategoriaId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NENHUM}>Sem categoria</SelectItem>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {categorias.length === 0 && (
                <p className="text-[11px] text-gray-400">
                  Nenhuma categoria de {rotuloTipo} cadastrada ainda.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Conta financeira</Label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NENHUM}>Não informar</SelectItem>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Forma de pagamento prevista</Label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUM}>Definir na baixa</SelectItem>
                {FORMAS_PAGAMENTO.map((f) => (
                  <SelectItem key={f} value={f}>{FORMA_PAGAMENTO_LABEL[f]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="obs">Observações</Label>
            <Textarea id="obs" rows={2} value={observacoes} maxLength={500}
              onChange={(e) => setObservacoes(e.target.value)} />
          </div>

          <Badge variant="outline" className="text-[11px] font-normal text-gray-500">
            Lançamento criado como pendente — a baixa é feita depois, na lista.
          </Badge>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="bg-brand-600 hover:bg-brand-700 gap-2">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar lançamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
