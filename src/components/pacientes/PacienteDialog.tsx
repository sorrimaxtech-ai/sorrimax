import { traduzErro } from "@/lib/erros";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, X, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import { listarConvenios } from "@/services/orcamentos";
import {
  atualizarPaciente, buscarCep, cpfValido, criarPaciente, emailValido, ESTADOS_CIVIS,
  formDoPaciente, formVazio, formatarCelular, formatarCep, formatarCpf, GENEROS, soDigitos,
  type PacienteForm, type PacienteRow,
} from "@/services/pacientes";

// ============================================================================
// Cadastro / edição de paciente
// ----------------------------------------------------------------------------
// Só três campos são obrigatórios — nome, celular e nascimento. O resto entra
// aos poucos: na recepção, cadastro longo demais vira cadastro não preenchido.
// Celular é obrigatório porque é a chave do canal de WhatsApp; nascimento porque
// idade muda conduta clínica (dentição decídua, dose, anamnese).
// ============================================================================

/** shadcn/Radix não aceita SelectItem com value="" — sentinela para "sem convênio". */
const SEM_CONVENIO = "__sem__";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

const PARENTESCOS = [
  "Mãe", "Pai", "Filho(a)", "Cônjuge", "Irmão(ã)", "Avô/Avó", "Responsável", "Amigo(a)", "Outro",
];

interface Props {
  aberto: boolean;
  onFechar: () => void;
  /** Ausente = cadastro novo. Presente = edição. */
  paciente?: PacienteRow | null;
  onSalvo: (id: string) => void;
}

/** Campo de chips: Enter ou vírgula adiciona, X remove. Usado em alergias e tags. */
const CampoTags = ({
  valores, onChange, placeholder, cor,
}: {
  valores: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  cor: string;
}) => {
  const [rascunho, setRascunho] = useState("");

  const adicionar = () => {
    const t = rascunho.trim();
    if (!t) return;
    if (!valores.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...valores, t]);
    setRascunho("");
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={rascunho}
          placeholder={placeholder}
          onChange={(e) => setRascunho(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); adicionar(); }
          }}
        />
        <Button type="button" variant="outline" size="icon" onClick={adicionar} title="Adicionar">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {valores.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {valores.map((v) => (
            <Badge key={v} className={`${cor} border-0 gap-1 font-normal`}>
              {v}
              <button
                type="button"
                onClick={() => onChange(valores.filter((x) => x !== v))}
                className="opacity-60 hover:opacity-100"
                aria-label={`Remover ${v}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};

const Secao = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <div className="space-y-3">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
    {children}
  </div>
);

const Erro = ({ msg }: { msg?: string }) =>
  msg ? <p className="text-[11px] text-red-600">{msg}</p> : null;

export const PacienteDialog = ({ aberto, onFechar, paciente, onSalvo }: Props) => {
  const { clinicaId } = useTenant();
  const [form, setForm] = useState<PacienteForm>(formVazio);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [convenios, setConvenios] = useState<{ id: string; nome: string }[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const cepConsultado = useRef("");

  const editando = !!paciente;

  useEffect(() => {
    if (!aberto) return;
    setErros({});
    setForm(paciente ? formDoPaciente(paciente) : formVazio());
    cepConsultado.current = "";
  }, [aberto, paciente]);

  useEffect(() => {
    if (!aberto || !clinicaId) return;
    listarConvenios(clinicaId)
      .then((c) => setConvenios(c as any))
      .catch((e: any) => toast.error("Erro ao carregar convênios", { description: traduzErro(e) }));
  }, [aberto, clinicaId]);

  const set = <K extends keyof PacienteForm>(campo: K, valor: PacienteForm[K]) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  const preencherPorCep = async (cep: string) => {
    const d = soDigitos(cep);
    if (d.length !== 8 || cepConsultado.current === d) return;
    cepConsultado.current = d;
    setBuscandoCep(true);
    try {
      const end = await buscarCep(d);
      if (!end) {
        toast.error("CEP não encontrado", { description: "Preencha o endereço manualmente." });
        return;
      }
      setForm((f) => ({
        ...f,
        logradouro: end.logradouro || f.logradouro,
        bairro: end.bairro || f.bairro,
        cidade: end.cidade || f.cidade,
        uf: end.uf || f.uf,
        complemento: f.complemento || end.complemento,
      }));
    } catch (e: any) {
      toast.error("Não deu para consultar o CEP", { description: traduzErro(e) });
    } finally {
      setBuscandoCep(false);
    }
  };

  const validar = () => {
    const e: Record<string, string> = {};
    if (form.nome_completo.trim().length < 3) e.nome_completo = "Informe o nome completo.";
    if (soDigitos(form.celular).length < 10) e.celular = "Celular com DDD é obrigatório.";
    if (!form.data_nascimento) e.data_nascimento = "Data de nascimento é obrigatória.";
    else {
      const nasc = new Date(`${form.data_nascimento}T12:00:00`);
      if (Number.isNaN(nasc.getTime())) e.data_nascimento = "Data inválida.";
      else if (nasc > new Date()) e.data_nascimento = "A data não pode ser no futuro.";
      else if (nasc.getFullYear() < 1900) e.data_nascimento = "Data fora do intervalo esperado.";
    }
    if (form.cpf && !cpfValido(form.cpf)) e.cpf = "CPF inválido.";
    if (!emailValido(form.email)) e.email = "E-mail inválido.";
    if (form.emergencia_celular && soDigitos(form.emergencia_celular).length < 10)
      e.emergencia_celular = "Celular com DDD.";
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const salvar = async () => {
    if (!clinicaId) {
      toast.error("Clínica não identificada", { description: "Recarregue a página e tente de novo." });
      return;
    }
    if (!validar()) {
      toast.error("Revise os campos destacados");
      return;
    }
    setSalvando(true);
    try {
      const id = editando
        ? (await atualizarPaciente(clinicaId, paciente!.id, form), paciente!.id)
        : await criarPaciente(clinicaId, form);
      toast.success(editando ? "Paciente atualizado" : "Paciente cadastrado");
      onSalvo(id);
    } catch (err: any) {
      // 23505 = violação de índice único (CPF ou celular já cadastrado na clínica)
      const duplicado = err?.code === "23505";
      toast.error(duplicado ? "Já existe paciente com esse CPF ou celular" : "Erro ao salvar", {
        description: duplicado ? "Procure o cadastro existente antes de criar outro." : err?.message,
      });
    } finally {
      setSalvando(false);
    }
  };

  const conveniosOrdenados = useMemo(
    () => [...convenios].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [convenios],
  );

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !salvando && onFechar()}>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar paciente" : "Novo paciente"}</DialogTitle>
          <DialogDescription>
            Nome, celular e data de nascimento são obrigatórios. O restante pode ser completado depois.
          </DialogDescription>
        </DialogHeader>

        {/* Duas colunas em telas grandes: todas as seções à vista, sem rolagem longa. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6 py-1">
          <div className="space-y-6">
          <Secao titulo="Dados pessoais">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2 space-y-1.5">
                <Label>Nome completo *</Label>
                <Input
                  value={form.nome_completo}
                  onChange={(e) => set("nome_completo", e.target.value)}
                  placeholder="Como está no documento"
                />
                <Erro msg={erros.nome_completo} />
              </div>
              <div className="space-y-1.5">
                <Label>Apelido</Label>
                <Input
                  value={form.apelido}
                  onChange={(e) => set("apelido", e.target.value)}
                  placeholder="Como prefere ser chamado"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Celular (WhatsApp) *</Label>
                <Input
                  value={form.celular}
                  inputMode="numeric"
                  onChange={(e) => set("celular", formatarCelular(e.target.value))}
                  placeholder="(11) 91234-5678"
                />
                <Erro msg={erros.celular} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="paciente@email.com"
                />
                <Erro msg={erros.email} />
              </div>
              <div className="space-y-1.5">
                <Label>Data de nascimento *</Label>
                <Input
                  type="date"
                  value={form.data_nascimento}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => set("data_nascimento", e.target.value)}
                />
                <Erro msg={erros.data_nascimento} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>CPF</Label>
                <Input
                  value={form.cpf}
                  inputMode="numeric"
                  onChange={(e) => set("cpf", formatarCpf(e.target.value))}
                  placeholder="000.000.000-00"
                />
                <Erro msg={erros.cpf} />
              </div>
              <div className="space-y-1.5">
                <Label>RG</Label>
                <Input value={form.rg} onChange={(e) => set("rg", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Gênero</Label>
                <Select value={form.genero} onValueChange={(v) => set("genero", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {GENEROS.map((g) => (
                      <SelectItem key={g.valor} value={g.valor}>{g.rotulo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Estado civil</Label>
                <Select value={form.estado_civil} onValueChange={(v) => set("estado_civil", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {ESTADOS_CIVIS.map((g) => (
                      <SelectItem key={g.valor} value={g.valor}>{g.rotulo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Profissão</Label>
              <Input value={form.profissao} onChange={(e) => set("profissao", e.target.value)} />
            </div>
          </Secao>

          <Secao titulo="Contato de emergência">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input
                  value={form.emergencia_nome}
                  onChange={(e) => set("emergencia_nome", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Parentesco</Label>
                <Select
                  value={form.emergencia_parentesco}
                  onValueChange={(v) => set("emergencia_parentesco", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {PARENTESCOS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Celular</Label>
                <Input
                  value={form.emergencia_celular}
                  inputMode="numeric"
                  onChange={(e) => set("emergencia_celular", formatarCelular(e.target.value))}
                />
                <Erro msg={erros.emergencia_celular} />
              </div>
              <div className="space-y-1.5">
                <Label>Celular alternativo</Label>
                <Input
                  value={form.emergencia_celular2}
                  inputMode="numeric"
                  onChange={(e) => set("emergencia_celular2", formatarCelular(e.target.value))}
                />
              </div>
            </div>
          </Secao>
          </div>

          <div className="space-y-6">
          <Secao titulo="Endereço">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>CEP</Label>
                <div className="relative">
                  <Input
                    value={form.cep}
                    inputMode="numeric"
                    onChange={(e) => {
                      const v = formatarCep(e.target.value);
                      set("cep", v);
                      if (soDigitos(v).length === 8) preencherPorCep(v);
                    }}
                    onBlur={(e) => preencherPorCep(e.target.value)}
                    placeholder="00000-000"
                  />
                  <div className="absolute right-2.5 top-2.5 text-muted-foreground">
                    {buscandoCep
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Search className="h-4 w-4 opacity-40" />}
                  </div>
                </div>
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label>Logradouro</Label>
                <Input value={form.logradouro} onChange={(e) => set("logradouro", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Número</Label>
                <Input value={form.numero} onChange={(e) => set("numero", e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Complemento</Label>
                <Input value={form.complemento} onChange={(e) => set("complemento", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Bairro</Label>
                <Input value={form.bairro} onChange={(e) => set("bairro", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Cidade</Label>
                <Input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>UF</Label>
                <Select value={form.uf} onValueChange={(v) => set("uf", v)}>
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Secao>

          <Secao titulo="Convênio">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Plano / Convênio</Label>
                <Select
                  value={form.convenio_id || SEM_CONVENIO}
                  onValueChange={(v) => set("convenio_id", v === SEM_CONVENIO ? "" : v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_CONVENIO}>Sem convênio</SelectItem>
                    {conveniosOrdenados.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {conveniosOrdenados.length === 0 && (
                  <p className="text-[11px] text-gray-400">
                    Nenhum convênio cadastrado nas configurações da clínica.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Número da carteirinha</Label>
                <Input
                  value={form.numero_carteirinha}
                  onChange={(e) => set("numero_carteirinha", e.target.value)}
                />
              </div>
            </div>
          </Secao>

          <Secao titulo="Informações clínicas">
            <div className="space-y-1.5">
              <Label>Alergias</Label>
              <CampoTags
                valores={form.alergias}
                onChange={(v) => set("alergias", v)}
                placeholder="Digite a alergia e tecle Enter"
                cor="bg-red-100 text-red-800"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <CampoTags
                valores={form.tags}
                onChange={(v) => set("tags", v)}
                placeholder="Ex.: indicação, ortodontia, VIP"
                cor="bg-brand-100 text-brand-800"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                rows={3}
                value={form.observacoes}
                onChange={(e) => set("observacoes", e.target.value)}
                placeholder="Informações que a equipe precisa ver antes do atendimento"
              />
            </div>
          </Secao>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="bg-brand-600 hover:bg-brand-700 gap-2">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {editando ? "Salvar alterações" : "Cadastrar paciente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PacienteDialog;
