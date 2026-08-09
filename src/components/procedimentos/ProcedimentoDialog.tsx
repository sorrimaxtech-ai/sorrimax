import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampoMoeda } from "@/components/ui/campo-moeda";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  APLICACOES, COR_PADRAO, COR_POR_ESPECIALIDADE, ESPECIALIDADES, MODALIDADES,
  atualizarProcedimento, criarProcedimento,
  type Aplicacao, type DadosProcedimento, type Modalidade, type Procedimento,
} from "@/services/procedimentos";

interface Props {
  aberto: boolean;
  onFechar: () => void;
  onSalvo: (procedimento: Procedimento) => void;
  clinicaId: string | null;
  /** Nulo = criação. Preenchido = edição. */
  procedimento: Procedimento | null;
}

/** Radix Select não aceita item com value "", então campos opcionais usam sentinela. */
const SEM_ESPECIALIDADE = "__sem__";

const VAZIO: DadosProcedimento = {
  nome: "",
  codigo: null,
  codigo_tuss: null,
  especialidade: null,
  descricao: null,
  aplicacao: "dente",
  duracao_min: 30,
  valor: 0,
  cor: COR_PADRAO,
  buffer_antes_min: 0,
  buffer_depois_min: 0,
  modalidades: ["presencial"],
  exige_anamnese: false,
  sessoes_previstas: 1,
  ativo: true,
};

export const ProcedimentoDialog = ({ aberto, onFechar, onSalvo, clinicaId, procedimento }: Props) => {
  const [form, setForm] = useState<DadosProcedimento>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  // Sugerir cor pela especialidade só até o usuário escolher a dele.
  const [corManual, setCorManual] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setErros({});
    if (procedimento) {
      setForm({
        nome: procedimento.nome,
        codigo: procedimento.codigo,
        codigo_tuss: procedimento.codigo_tuss,
        especialidade: procedimento.especialidade,
        descricao: procedimento.descricao,
        aplicacao: procedimento.aplicacao,
        duracao_min: procedimento.duracao_min,
        valor: Number(procedimento.valor ?? 0),
        cor: procedimento.cor ?? COR_PADRAO,
        buffer_antes_min: procedimento.buffer_antes_min,
        buffer_depois_min: procedimento.buffer_depois_min,
        modalidades: procedimento.modalidades ?? ["presencial"],
        exige_anamnese: procedimento.exige_anamnese,
        sessoes_previstas: procedimento.sessoes_previstas,
        ativo: procedimento.ativo,
      });
      setCorManual(true);
    } else {
      setForm(VAZIO);
      setCorManual(false);
    }
  }, [aberto, procedimento]);

  const set = <K extends keyof DadosProcedimento>(campo: K, valor: DadosProcedimento[K]) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  const trocarEspecialidade = (v: string) => {
    const esp = v === SEM_ESPECIALIDADE ? null : v;
    setForm((f) => ({
      ...f,
      especialidade: esp,
      cor: corManual ? f.cor : COR_POR_ESPECIALIDADE[esp ?? ""] ?? f.cor,
    }));
  };

  const alternarModalidade = (m: Modalidade, marcado: boolean) =>
    setForm((f) => ({
      ...f,
      modalidades: marcado ? [...f.modalidades, m] : f.modalidades.filter((x) => x !== m),
    }));

  /** Espelha os CHECK do banco para o erro aparecer no campo, não num toast genérico. */
  const validar = () => {
    const e: Record<string, string> = {};
    if (!form.nome.trim()) e.nome = "Informe o nome do procedimento.";
    if (!Number.isFinite(form.duracao_min) || form.duracao_min < 5 || form.duracao_min > 1440)
      e.duracao_min = "Duração deve ficar entre 5 e 1440 minutos.";
    if (!Number.isFinite(form.valor) || form.valor < 0) e.valor = "Valor não pode ser negativo.";
    if (form.buffer_antes_min < 0 || form.buffer_antes_min > 240)
      e.buffer_antes_min = "Entre 0 e 240 minutos.";
    if (form.buffer_depois_min < 0 || form.buffer_depois_min > 240)
      e.buffer_depois_min = "Entre 0 e 240 minutos.";
    if (form.sessoes_previstas < 1) e.sessoes_previstas = "Mínimo de 1 sessão.";
    if (form.modalidades.length === 0) e.modalidades = "Escolha ao menos uma modalidade.";
    if (!/^#[0-9A-Fa-f]{6}$/.test(form.cor)) e.cor = "Cor inválida.";
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const salvar = async () => {
    if (!clinicaId) {
      toast.error("Clínica não identificada", { description: "Recarregue a página e tente de novo." });
      return;
    }
    if (!validar()) return;

    const dados: DadosProcedimento = {
      ...form,
      nome: form.nome.trim(),
      codigo: form.codigo?.trim() || null,
      codigo_tuss: form.codigo_tuss?.trim() || null,
      descricao: form.descricao?.trim() || null,
    };

    setSalvando(true);
    try {
      const salvo = procedimento
        ? await atualizarProcedimento(clinicaId, procedimento.id, dados)
        : await criarProcedimento(clinicaId, dados);
      if (!salvo) throw new Error("O banco não retornou o registro salvo.");
      toast.success(procedimento ? "Procedimento atualizado" : "Procedimento criado");
      onSalvo(salvo);
      onFechar();
    } catch (err: any) {
      const duplicado = err?.code === "23505";
      toast.error("Erro ao salvar procedimento", {
        description: duplicado
          ? "Já existe um procedimento com esse nome nesta clínica."
          : err?.message ?? "Tente novamente.",
      });
    } finally {
      setSalvando(false);
    }
  };

  const msg = (campo: string) =>
    erros[campo] ? <p className="text-xs text-red-600 mt-1">{erros[campo]}</p> : null;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !salvando && onFechar()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{procedimento ? "Editar procedimento" : "Novo procedimento"}</DialogTitle>
          <DialogDescription>
            Estes dados alimentam a agenda (duração e cor), o orçamento (valor) e o financeiro (comissão).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* --------------------------------------------------- identificação */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(e) => set("nome", e.target.value)}
                placeholder="Ex.: Restauração em resina 1 face"
              />
              {msg("nome")}
            </div>

            <div>
              <Label htmlFor="codigo">Código interno</Label>
              <Input
                id="codigo"
                value={form.codigo ?? ""}
                onChange={(e) => set("codigo", e.target.value)}
                placeholder="Ex.: REST-1F"
              />
            </div>

            <div>
              <Label htmlFor="codigo_tuss">Código TUSS</Label>
              <Input
                id="codigo_tuss"
                value={form.codigo_tuss ?? ""}
                onChange={(e) => set("codigo_tuss", e.target.value)}
                placeholder="Usado no faturamento de convênio"
              />
            </div>

            <div>
              <Label>Especialidade</Label>
              <Select
                value={form.especialidade ?? SEM_ESPECIALIDADE}
                onValueChange={trocarEspecialidade}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_ESPECIALIDADE}>Sem especialidade</SelectItem>
                  {ESPECIALIDADES.map((e) => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                  {/* Registro antigo pode ter especialidade fora da lista — não pode sumir na edição. */}
                  {form.especialidade && !ESPECIALIDADES.includes(form.especialidade as any) && (
                    <SelectItem value={form.especialidade}>{form.especialidade}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Aplicação</Label>
              <Select
                value={form.aplicacao}
                onValueChange={(v) => set("aplicacao", v as Aplicacao)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APLICACOES.map((a) => (
                    <SelectItem key={a.valor} value={a.valor}>{a.rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-gray-500 mt-1">
                {APLICACOES.find((a) => a.valor === form.aplicacao)?.ajuda}
              </p>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea
                id="descricao"
                rows={2}
                value={form.descricao ?? ""}
                onChange={(e) => set("descricao", e.target.value)}
                placeholder="O que está incluso, materiais, observações para a equipe."
              />
            </div>
          </div>

          <Separator />

          {/* --------------------------------------------------- agenda e valor */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="duracao">Duração (min)</Label>
              <Input
                id="duracao"
                type="number"
                min={5}
                max={1440}
                value={form.duracao_min}
                onChange={(e) => set("duracao_min", Number(e.target.value))}
              />
              {msg("duracao_min")}
            </div>

            <div>
              <Label htmlFor="valor">Valor particular</Label>
              <CampoMoeda
                id="valor"
                value={form.valor}
                onChange={(r) => set("valor", r ?? 0)}
              />
              {msg("valor")}
            </div>

            <div>
              <Label htmlFor="sessoes">Sessões previstas</Label>
              <Input
                id="sessoes"
                type="number"
                min={1}
                value={form.sessoes_previstas}
                onChange={(e) => set("sessoes_previstas", Number(e.target.value))}
              />
              {msg("sessoes_previstas")}
            </div>

            <div>
              <Label htmlFor="buffer_antes">Preparo antes (min)</Label>
              <Input
                id="buffer_antes"
                type="number"
                min={0}
                max={240}
                value={form.buffer_antes_min}
                onChange={(e) => set("buffer_antes_min", Number(e.target.value))}
              />
              {msg("buffer_antes_min")}
            </div>

            <div>
              <Label htmlFor="buffer_depois">Limpeza depois (min)</Label>
              <Input
                id="buffer_depois"
                type="number"
                min={0}
                max={240}
                value={form.buffer_depois_min}
                onChange={(e) => set("buffer_depois_min", Number(e.target.value))}
              />
              {msg("buffer_depois_min")}
            </div>

            <div>
              <Label htmlFor="cor">Cor na agenda</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="cor"
                  type="color"
                  value={form.cor}
                  onChange={(e) => { setCorManual(true); set("cor", e.target.value); }}
                  className="h-10 w-14 p-1 cursor-pointer"
                />
                <Input
                  value={form.cor}
                  onChange={(e) => { setCorManual(true); set("cor", e.target.value); }}
                  className="font-mono text-xs"
                  maxLength={7}
                />
              </div>
              {msg("cor")}
            </div>
          </div>

          <Separator />

          {/* --------------------------------------------------- regras */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-2 block">Modalidades de atendimento</Label>
              <div className="space-y-2">
                {MODALIDADES.map((m) => (
                  <label key={m.valor} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={form.modalidades.includes(m.valor)}
                      onCheckedChange={(c) => alternarModalidade(m.valor, c === true)}
                    />
                    {m.rotulo}
                  </label>
                ))}
              </div>
              {msg("modalidades")}
            </div>

            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor="anamnese">Exige anamnese</Label>
                  <p className="text-[11px] text-gray-500">
                    Bloqueia a execução sem anamnese preenchida.
                  </p>
                </div>
                <Switch
                  id="anamnese"
                  checked={form.exige_anamnese}
                  onCheckedChange={(v) => set("exige_anamnese", v)}
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor="ativo">Ativo</Label>
                  <p className="text-[11px] text-gray-500">
                    Inativo some das buscas de agenda e orçamento.
                  </p>
                </div>
                <Switch
                  id="ativo"
                  checked={form.ativo}
                  onCheckedChange={(v) => set("ativo", v)}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="bg-brand-600 hover:bg-brand-700 gap-2">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {procedimento ? "Salvar alterações" : "Criar procedimento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProcedimentoDialog;
