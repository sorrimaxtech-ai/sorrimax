import { traduzErro } from "@/lib/erros";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Loader2, MessageCircle, Pencil, Receipt, Stethoscope, ClipboardList,
  FileText, Wallet, User, CalendarClock, AlertTriangle, Plus, Lock, ExternalLink, Paperclip,
} from "lucide-react";
import { AbaArquivos } from "@/components/arquivos/AbaArquivos";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import { Odontograma } from "@/components/odontograma/Odontograma";
import { CORES_ESTADO } from "@/types/odonto";
import { PacienteDialog } from "@/components/pacientes/PacienteDialog";
import { NovoOrcamentoDialog } from "@/components/orcamentos/NovoOrcamentoDialog";
import {
  brl, listarOrcamentos, STATUS_CLASSE, STATUS_LABEL, type StatusOrcamento,
} from "@/services/orcamentos";
// "Últimos atendimentos" lista consultas passadas de qualquer situação. Sem o
// rótulo, uma consulta cancelada ou faltada apareceria como atendimento feito.
import { STATUS_LABEL as STATUS_CONSULTA_LABEL } from "@/services/consultas";
import {
  adicionarEvolucao, dataBr, dataHoraBr, ESTADOS_CIVIS, formatarCelular, formatarCep,
  formatarCpf, GENEROS, historicoConsultas, idadeEmAnos, iniciais, linkWhatsApp, listarAnamneses,
  listarDebitos, listarDocumentos, listarEvolucoes, listarModelosAnamnese, listarOdontograma,
  listarPerguntas, obterPaciente, obterProntuario, proximasConsultas, rotuloDe, salvarAnamnese,
  STATUS_PARCELA_CLASSE, STATUS_PARCELA_LABEL, ultimasMensagens, type MensagemResumo,
  type PacienteRow, type PerguntaAnamnese, type RegistroComProcedimento, type StatusConsulta,
  type StatusParcela,
} from "@/services/pacientes";

// ============================================================================
// Ficha do paciente — o prontuário digital
// ----------------------------------------------------------------------------
// Cada aba carrega seus dados só quando é aberta (o Radix desmonta o conteúdo
// inativo). Abrir a ficha de um paciente com anos de histórico não deve baixar
// odontograma, financeiro e documentos de uma vez só para mostrar o telefone.
// ============================================================================

type PacienteCompleto = PacienteRow & { convenios: { id: string; nome: string; tipo: string } | null };

// ---------------------------------------------------------------- primitivos
const Carregando = () => (
  <div className="p-12 flex justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const Vazio = ({ icone: Icone, titulo, texto, acao }: {
  icone: any; titulo: string; texto: string; acao?: React.ReactNode;
}) => (
  <div className="p-12 text-center">
    <Icone className="h-10 w-10 mx-auto text-gray-300 mb-3" />
    <p className="font-medium text-gray-800">{titulo}</p>
    <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">{texto}</p>
    {acao && <div className="mt-4">{acao}</div>}
  </div>
);

const Campo = ({ rotulo, valor }: { rotulo: string; valor?: React.ReactNode }) => (
  <div>
    <p className="text-xs text-gray-500">{rotulo}</p>
    <p className="text-sm text-gray-900 mt-0.5 break-words">{valor || "—"}</p>
  </div>
);

// ---------------------------------------------------------------- aba: Sobre
const AbaSobre = ({ paciente, clinicaId }: { paciente: PacienteCompleto; clinicaId: string }) => {
  const [consultas, setConsultas] = useState<any[]>([]);
  const [historico, setHistorico] = useState<any[]>([]);
  const [mensagens, setMensagens] = useState<MensagemResumo[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCarregando(true);
      try {
        const [prox, hist, msgs] = await Promise.all([
          proximasConsultas(clinicaId, paciente.id),
          historicoConsultas(clinicaId, paciente.id),
          ultimasMensagens(clinicaId, paciente.id, paciente.celular),
        ]);
        if (!vivo) return;
        setConsultas(prox);
        setHistorico(hist);
        setMensagens(msgs);
      } catch (e: any) {
        if (vivo) toast.error("Erro ao carregar dados do paciente", { description: traduzErro(e) });
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [clinicaId, paciente.id, paciente.celular]);

  const endereco = [
    paciente.logradouro && `${paciente.logradouro}${paciente.numero ? `, ${paciente.numero}` : ""}`,
    paciente.complemento,
    paciente.bairro,
    [paciente.cidade, paciente.uf].filter(Boolean).join("/"),
    paciente.cep && `CEP ${formatarCep(paciente.cep)}`,
  ].filter(Boolean).join(" · ");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card className="border-gray-100">
          <CardContent className="p-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Dados pessoais
            </p>
            {/* Nome, idade, CPF e celular: sem repetir o que o cabeçalho da ficha
                já mostra — cada dado aparece em um único lugar da tela. */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Campo rotulo="Apelido" valor={paciente.apelido} />
              <Campo rotulo="Nascimento" valor={dataBr(paciente.data_nascimento)} />
              <Campo rotulo="CPF" valor={paciente.cpf ? formatarCpf(paciente.cpf) : null} />
              <Campo rotulo="RG" valor={paciente.rg} />
              <Campo rotulo="Gênero" valor={rotuloDe(GENEROS, paciente.genero)} />
              <Campo rotulo="Estado civil" valor={rotuloDe(ESTADOS_CIVIS, paciente.estado_civil)} />
              <Campo rotulo="Profissão" valor={paciente.profissao} />
              <Campo rotulo="Celular" valor={formatarCelular(paciente.celular)} />
              <Campo rotulo="E-mail" valor={paciente.email} />
            </div>
            <Separator />
            <Campo rotulo="Endereço" valor={endereco} />
            {(paciente.emergencia_nome || paciente.emergencia_celular) && (
              <>
                <Separator />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Campo rotulo="Emergência — nome" valor={paciente.emergencia_nome} />
                  <Campo rotulo="Parentesco" valor={paciente.emergencia_parentesco} />
                  <Campo rotulo="Celular" valor={formatarCelular(paciente.emergencia_celular)} />
                  <Campo rotulo="Celular alternativo" valor={formatarCelular(paciente.emergencia_celular2)} />
                </div>
              </>
            )}
            {paciente.observacoes && (
              <>
                <Separator />
                <Campo rotulo="Observações" valor={paciente.observacoes} />
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-100">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Conversas no WhatsApp
            </p>
            {carregando ? (
              <div className="py-6 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : mensagens.length === 0 ? (
              <p className="text-sm text-gray-500">
                Nenhuma conversa registrada com este número. As mensagens aparecem aqui quando a
                clínica conversa com o paciente pelo WhatsApp conectado ao sistema.
              </p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {mensagens.map((m) => (
                  <div key={m.id} className={`flex ${m.from_me ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      m.from_me ? "bg-brand-50 text-brand-950" : "bg-muted text-gray-800"}`}
                    >
                      <p className="whitespace-pre-wrap break-words">
                        {m.conteudo || <span className="italic opacity-70">[{m.tipo}]</span>}
                      </p>
                      <p className="text-[10px] opacity-60 mt-1">{dataHoraBr(m.quando)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="border-gray-100">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Convênio
            </p>
            <Campo rotulo="Plano" valor={paciente.convenios?.nome ?? "Particular"} />
            <div className="mt-3">
              <Campo rotulo="Carteirinha" valor={paciente.numero_carteirinha} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-100">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Próximas consultas
            </p>
            {carregando ? (
              <div className="py-4 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : consultas.length === 0 ? (
              <p className="text-sm text-gray-500">
                Sem agendamento futuro. Marque pela Agenda para o paciente entrar na fila do dia.
              </p>
            ) : (
              <div className="space-y-3">
                {consultas.map((c) => (
                  <div key={c.id} className="flex gap-2">
                    <CalendarClock className="h-4 w-4 text-brand-600 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{dataHoraBr(c.inicio)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {c.procedimentos?.nome ?? c.titulo ?? "Consulta"}
                        {c.profissional?.full_name ? ` · ${c.profissional.full_name}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-100">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Últimos atendimentos
            </p>
            {carregando ? (
              <div className="py-4 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : historico.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum atendimento registrado até agora.</p>
            ) : (
              <div className="space-y-2">
                {historico.map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-2 text-sm">
                    <span className="text-muted-foreground shrink-0">{dataBr(c.inicio)}</span>
                    <span className="truncate flex-1 text-right text-gray-800">
                      {c.procedimentos?.nome ?? "Consulta"}
                      <span className="block text-[11px] text-muted-foreground">
                        {STATUS_CONSULTA_LABEL[c.status as StatusConsulta] ?? c.status}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- aba: Orçamentos
const AbaOrcamentos = ({ clinicaId, pacienteId }: { clinicaId: string; pacienteId: string }) => {
  const navigate = useNavigate();
  const [lista, setLista] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [novoAberto, setNovoAberto] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLista(await listarOrcamentos(clinicaId, pacienteId));
    } catch (e: any) {
      toast.error("Erro ao carregar orçamentos", { description: traduzErro(e) });
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, pacienteId]);

  useEffect(() => { carregar(); }, [carregar]);

  const totalAprovado = useMemo(
    () => lista.reduce((s, o) => s + Number(o.total_aprovado ?? 0), 0),
    [lista],
  );

  return (
    <>
      <Card className="border-gray-100">
        <CardContent className="p-0">
          <div className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm font-medium text-gray-900">Orçamentos do paciente</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {carregando ? "Carregando…" : `${lista.length} orçamento(s) · ${brl(totalAprovado)} aprovado`}
              </p>
            </div>
            <Button onClick={() => setNovoAberto(true)} className="bg-brand-600 hover:bg-brand-700 gap-2">
              <Plus className="h-4 w-4" /> Novo orçamento
            </Button>
          </div>
          <Separator />
          {carregando ? (
            <Carregando />
          ) : lista.length === 0 ? (
            <Vazio
              icone={Receipt}
              titulo="Nenhum orçamento para este paciente"
              texto="O orçamento é o que transforma o plano de tratamento em tratamento executado e em conta a receber."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Nº</th>
                    <th className="px-4 py-2.5 font-medium">Título</th>
                    <th className="px-4 py-2.5 font-medium text-right">Total</th>
                    <th className="px-4 py-2.5 font-medium text-right">Aprovado</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Criado</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => navigate(`/orcamentos/${o.id}`)}
                      className="border-b border-border/50 hover:bg-muted/40 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{o.numero}</td>
                      <td className="px-4 py-3">{o.titulo ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{brl(Number(o.total_itens))}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-brand-700">
                        {brl(Number(o.total_aprovado))}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`${STATUS_CLASSE[o.status as StatusOrcamento] ?? "bg-gray-100 text-gray-700"} border-0 font-medium`}>
                          {STATUS_LABEL[o.status as StatusOrcamento] ?? o.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{dataBr(o.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <NovoOrcamentoDialog
        aberto={novoAberto}
        pacienteIdFixo={pacienteId}
        onFechar={() => setNovoAberto(false)}
        onCriado={(id) => { setNovoAberto(false); navigate(`/orcamentos/${id}`); }}
      />
    </>
  );
};

// ---------------------------------------------------------------- aba: Tratamentos
const AbaTratamentos = ({
  clinicaId, pacienteId, profissionalId,
}: { clinicaId: string; pacienteId: string; profissionalId: string | null }) => {
  const [registros, setRegistros] = useState<RegistroComProcedimento[]>([]);
  const [evolucoes, setEvolucoes] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState("");
  const [dentes, setDentes] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [regs, evos] = await Promise.all([
        listarOdontograma(clinicaId, pacienteId),
        listarEvolucoes(clinicaId, pacienteId),
      ]);
      setRegistros(regs);
      setEvolucoes(evos);
    } catch (e: any) {
      toast.error("Erro ao carregar tratamentos", { description: traduzErro(e) });
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, pacienteId]);

  useEffect(() => { carregar(); }, [carregar]);

  const gravarEvolucao = async () => {
    if (texto.trim().length < 5) {
      toast.error("Descreva a evolução", { description: "O texto precisa ter conteúdo clínico." });
      return;
    }
    if (!profissionalId) {
      toast.error("Profissional não identificado", { description: "Refaça o login e tente de novo." });
      return;
    }
    setSalvando(true);
    try {
      await adicionarEvolucao({
        clinicaId,
        pacienteId,
        profissionalId,
        conteudo: texto,
        dentes: dentes
          .split(/[^0-9]+/)
          .map(Number)
          .filter((n) => n >= 11 && n <= 85),
      });
      toast.success("Evolução registrada");
      setTexto("");
      setDentes("");
      carregar();
    } catch (e: any) {
      toast.error("Erro ao registrar evolução", { description: traduzErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) return <Card className="border-gray-100"><CardContent className="p-0"><Carregando /></CardContent></Card>;

  return (
    <div className="space-y-4">
      <Card className="border-gray-100">
        <CardContent className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
            Odontograma
          </p>
          {registros.length === 0 && (
            <p className="text-sm text-gray-500 mb-4">
              Nenhum lançamento ainda. Os dentes aparecem marcados quando um item de orçamento é
              aprovado ou quando uma condição clínica é registrada.
            </p>
          )}
          <Odontograma registros={registros} />
        </CardContent>
      </Card>

      <Card className="border-gray-100">
        <CardContent className="p-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground p-5 pb-3">
            Tratamentos lançados
          </p>
          {registros.length === 0 ? (
            <Vazio
              icone={Stethoscope}
              titulo="Sem tratamentos registrados"
              texto="Aprovar itens de um orçamento cria automaticamente os tratamentos planejados aqui."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Dente / Região</th>
                    <th className="px-4 py-2.5 font-medium">Procedimento</th>
                    <th className="px-4 py-2.5 font-medium">Faces</th>
                    <th className="px-4 py-2.5 font-medium">Estado</th>
                    <th className="px-4 py-2.5 font-medium">Profissional</th>
                    <th className="px-4 py-2.5 font-medium">Lançado</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium tabular-nums">
                        {r.dente ?? r.regiao ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {r.procedimento_nome ?? r.condicao ?? "—"}
                        {r.anotacao && (
                          <span className="block text-xs text-muted-foreground">{r.anotacao}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {r.faces?.length ? r.faces.join(", ") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 text-xs font-medium"
                          style={{ color: CORES_ESTADO[r.estado]?.fill }}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: CORES_ESTADO[r.estado]?.fill }}
                          />
                          {CORES_ESTADO[r.estado]?.label ?? r.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.profissional_nome ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{dataBr(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-gray-100">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Evoluções
            </p>
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
              <Lock className="h-3 w-3" /> registro permanente
            </span>
          </div>

          <div className="space-y-2">
            <Textarea
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="O que foi feito, o que foi observado e a conduta para a próxima sessão."
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                className="sm:max-w-xs"
                value={dentes}
                onChange={(e) => setDentes(e.target.value)}
                placeholder="Dentes envolvidos (ex.: 16, 26)"
              />
              <Button
                onClick={gravarEvolucao}
                disabled={salvando}
                className="bg-brand-600 hover:bg-brand-700 gap-2 sm:ml-auto"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Adicionar evolução
              </Button>
            </div>
            <p className="text-[11px] text-gray-400">
              Evolução é documento clínico: depois de gravada não pode ser editada nem apagada.
            </p>
          </div>

          <Separator />

          {evolucoes.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">
              Nenhuma evolução registrada. A primeira anotação já vale como histórico legal do atendimento.
            </p>
          ) : (
            <div className="space-y-4">
              {evolucoes.map((ev) => (
                <div key={ev.id} className="border-l-2 border-brand-200 pl-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-gray-700">
                      {ev.profiles?.full_name ?? "Profissional"}
                    </span>
                    <span>·</span>
                    <span>{dataHoraBr(ev.created_at)}</span>
                    {ev.dentes?.length > 0 && (
                      <Badge className="bg-gray-100 text-gray-700 border-0 font-normal">
                        Dentes {ev.dentes.join(", ")}
                      </Badge>
                    )}
                    {ev.retifica_id && (
                      <Badge className="bg-amber-100 text-amber-800 border-0 font-normal">
                        Retificação
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{ev.conteudo}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------- aba: Anamnese
/** Aceita `["Sim","Não"]` ou `[{valor,rotulo}]` — os dois formatos existem nos modelos. */
const normalizarOpcoes = (opcoes: any): { valor: string; rotulo: string }[] => {
  if (!Array.isArray(opcoes)) return [];
  return opcoes.map((o: any) =>
    typeof o === "string"
      ? { valor: o, rotulo: o }
      : { valor: String(o?.valor ?? o?.value ?? o?.rotulo ?? ""), rotulo: String(o?.rotulo ?? o?.label ?? o?.valor ?? "") },
  ).filter((o) => o.valor !== "");
};

const PreencherAnamneseDialog = ({
  aberto, onFechar, onSalvo, clinicaId, pacienteId,
}: {
  aberto: boolean; onFechar: () => void; onSalvo: () => void;
  clinicaId: string; pacienteId: string;
}) => {
  const [modelos, setModelos] = useState<{ id: string; nome: string }[]>([]);
  const [modeloId, setModeloId] = useState("");
  const [perguntas, setPerguntas] = useState<PerguntaAnamnese[]>([]);
  const [respostas, setRespostas] = useState<Record<string, any>>({});
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setModeloId("");
    setPerguntas([]);
    setRespostas({});
    listarModelosAnamnese(clinicaId)
      .then(setModelos)
      .catch((e: any) => toast.error("Erro ao carregar modelos", { description: traduzErro(e) }));
  }, [aberto, clinicaId]);

  useEffect(() => {
    if (!modeloId) { setPerguntas([]); return; }
    setCarregando(true);
    listarPerguntas(clinicaId, modeloId)
      .then(setPerguntas)
      .catch((e: any) => toast.error("Erro ao carregar perguntas", { description: traduzErro(e) }))
      .finally(() => setCarregando(false));
  }, [clinicaId, modeloId]);

  const responder = (id: string, valor: any) => setRespostas((r) => ({ ...r, [id]: valor }));

  const salvar = async () => {
    const faltando = perguntas.filter(
      (p) => p.obrigatoria && p.tipo !== "secao" && (
        respostas[p.id] === undefined || respostas[p.id] === "" ||
        (Array.isArray(respostas[p.id]) && respostas[p.id].length === 0)
      ),
    );
    if (faltando.length > 0) {
      toast.error("Responda as perguntas obrigatórias", {
        description: faltando.map((p) => p.enunciado).slice(0, 3).join(" · "),
      });
      return;
    }
    setSalvando(true);
    try {
      await salvarAnamnese({ clinicaId, pacienteId, modeloId, respostas });
      toast.success("Anamnese registrada");
      onSalvo();
    } catch (e: any) {
      toast.error("Erro ao salvar anamnese", { description: traduzErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  const renderPergunta = (p: PerguntaAnamnese) => {
    const valor = respostas[p.id];
    const opcoes = normalizarOpcoes(p.opcoes);

    if (p.tipo === "secao") {
      return (
        <p key={p.id} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-3">
          {p.enunciado}
        </p>
      );
    }

    return (
      <div key={p.id} className="space-y-1.5">
        <Label>{p.enunciado}{p.obrigatoria && " *"}</Label>
        {p.tipo === "texto" && (
          <Input value={valor ?? ""} onChange={(e) => responder(p.id, e.target.value)} />
        )}
        {p.tipo === "texto_longo" && (
          <Textarea rows={3} value={valor ?? ""} onChange={(e) => responder(p.id, e.target.value)} />
        )}
        {p.tipo === "numero" && (
          <Input type="number" value={valor ?? ""} onChange={(e) => responder(p.id, e.target.value)} />
        )}
        {p.tipo === "data" && (
          <Input type="date" value={valor ?? ""} onChange={(e) => responder(p.id, e.target.value)} />
        )}
        {p.tipo === "sim_nao" && (
          <Select value={valor ?? ""} onValueChange={(v) => responder(p.id, v)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sim">Sim</SelectItem>
              <SelectItem value="nao">Não</SelectItem>
              <SelectItem value="nao_sei">Não sei</SelectItem>
            </SelectContent>
          </Select>
        )}
        {p.tipo === "selecao_unica" && (
          opcoes.length === 0
            ? <Input value={valor ?? ""} onChange={(e) => responder(p.id, e.target.value)} />
            : (
              <Select value={valor ?? ""} onValueChange={(v) => responder(p.id, v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {opcoes.map((o) => <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
            )
        )}
        {p.tipo === "multipla_escolha" && (
          <div className="space-y-1.5">
            {opcoes.map((o) => {
              const marcados: string[] = Array.isArray(valor) ? valor : [];
              return (
                <label key={o.valor} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={marcados.includes(o.valor)}
                    onCheckedChange={(c) =>
                      responder(p.id, c
                        ? [...marcados, o.valor]
                        : marcados.filter((x) => x !== o.valor))}
                  />
                  {o.rotulo}
                </label>
              );
            })}
          </div>
        )}
        {p.tipo === "escala" && (
          <Input
            type="number"
            min={p.escala?.min ?? 0}
            max={p.escala?.max ?? 10}
            value={valor ?? ""}
            onChange={(e) => responder(p.id, e.target.value)}
            placeholder={`De ${p.escala?.min ?? 0} a ${p.escala?.max ?? 10}`}
          />
        )}
        {(p.tipo === "upload" || p.tipo === "assinatura") && (
          <p className="text-xs text-gray-400">
            {p.tipo === "upload"
              ? "Anexo deve ser enviado pela aba Documentos."
              : "Assinatura é coletada na emissão do documento."}
          </p>
        )}
      </div>
    );
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !salvando && onFechar()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preencher anamnese</DialogTitle>
          <DialogDescription>
            Escolha o modelo publicado pela clínica. As respostas ficam guardadas com data e autor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Modelo *</Label>
            <Select value={modeloId} onValueChange={setModeloId}>
              <SelectTrigger><SelectValue placeholder="Selecione o modelo" /></SelectTrigger>
              <SelectContent>
                {modelos.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {modelos.length === 0 && (
              <p className="text-xs text-gray-500">
                Nenhum modelo publicado. Crie um em Anamnese › Modelos antes de preencher.
              </p>
            )}
          </div>

          {carregando && (
            <div className="py-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!carregando && modeloId && perguntas.length === 0 && (
            <p className="text-sm text-gray-500">Este modelo ainda não tem perguntas.</p>
          )}
          {perguntas.map(renderPergunta)}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button
            onClick={salvar}
            disabled={salvando || !modeloId || perguntas.length === 0}
            className="bg-brand-600 hover:bg-brand-700 gap-2"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar anamnese
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AbaAnamnese = ({ clinicaId, pacienteId }: { clinicaId: string; pacienteId: string }) => {
  const [lista, setLista] = useState<any[]>([]);
  const [perguntasPorModelo, setPerguntasPorModelo] = useState<Record<string, PerguntaAnamnese[]>>({});
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLista(await listarAnamneses(clinicaId, pacienteId));
    } catch (e: any) {
      toast.error("Erro ao carregar anamneses", { description: traduzErro(e) });
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, pacienteId]);

  useEffect(() => { carregar(); }, [carregar]);

  // As perguntas vivem noutra tabela: sem elas o jsonb de respostas é só um mapa
  // de UUIDs. Carrega sob demanda, ao expandir a resposta.
  const expandir = async (resposta: any) => {
    if (expandido === resposta.id) { setExpandido(null); return; }
    setExpandido(resposta.id);
    if (resposta.modelo_id in perguntasPorModelo) return;
    try {
      const p = await listarPerguntas(clinicaId, resposta.modelo_id);
      setPerguntasPorModelo((m) => ({ ...m, [resposta.modelo_id]: p }));
    } catch (e: any) {
      // Grava lista vazia: sem isso a linha fica em "Carregando perguntas…" para
      // sempre, sem nunca mais tentar de novo nem dizer o que aconteceu.
      setPerguntasPorModelo((m) => ({ ...m, [resposta.modelo_id]: [] }));
      toast.error("Erro ao carregar perguntas do modelo", { description: traduzErro(e) });
    }
  };

  return (
    <>
      <Card className="border-gray-100">
        <CardContent className="p-0">
          <div className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm font-medium text-gray-900">Anamneses respondidas</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Histórico de saúde declarado pelo paciente, com data de preenchimento.
              </p>
            </div>
            <Button onClick={() => setAberto(true)} className="bg-brand-600 hover:bg-brand-700 gap-2">
              <Plus className="h-4 w-4" /> Preencher
            </Button>
          </div>
          <Separator />
          {carregando ? (
            <Carregando />
          ) : lista.length === 0 ? (
            <Vazio
              icone={ClipboardList}
              titulo="Nenhuma anamnese preenchida"
              texto="A anamnese registra alergias, medicações e condições que mudam a conduta clínica. Preencha antes do primeiro procedimento."
            />
          ) : (
            <div className="divide-y divide-border/50">
              {lista.map((a) => {
                const carregadas = a.modelo_id in perguntasPorModelo;
                const perguntas = perguntasPorModelo[a.modelo_id] ?? [];
                const aberta = expandido === a.id;
                return (
                  <div key={a.id}>
                    <button
                      onClick={() => expandir(a)}
                      className="w-full text-left px-5 py-3 hover:bg-muted/40 flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {a.anamnese_modelos?.nome ?? "Modelo removido"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {dataHoraBr(a.created_at)} · preenchido por{" "}
                          {a.preenchido_por === "paciente" ? "paciente" : "profissional"}
                          {a.score_total !== null && a.score_total !== undefined
                            ? ` · score ${a.score_total}` : ""}
                        </p>
                      </div>
                      <span className="text-xs text-brand-700">{aberta ? "Ocultar" : "Ver respostas"}</span>
                    </button>
                    {aberta && (
                      <div className="px-5 pb-4 space-y-2">
                        {!carregadas ? (
                          <p className="text-xs text-muted-foreground">Carregando perguntas…</p>
                        ) : perguntas.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Não foi possível montar as perguntas deste modelo (ele pode ter sido
                            removido). As respostas gravadas continuam guardadas.
                          </p>
                        ) : (
                          perguntas
                            .filter((p) => p.tipo !== "secao")
                            .map((p) => {
                              const v = a.respostas?.[p.id];
                              return (
                                <div key={p.id} className="text-sm">
                                  <span className="text-gray-500">{p.enunciado}: </span>
                                  <span className="text-gray-900">
                                    {v === undefined || v === null || v === ""
                                      ? "—"
                                      : Array.isArray(v) ? v.join(", ") : String(v)}
                                  </span>
                                </div>
                              );
                            })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <PreencherAnamneseDialog
        aberto={aberto}
        clinicaId={clinicaId}
        pacienteId={pacienteId}
        onFechar={() => setAberto(false)}
        onSalvo={() => { setAberto(false); carregar(); }}
      />
    </>
  );
};

// ---------------------------------------------------------------- aba: Documentos
const AbaDocumentos = ({ clinicaId, pacienteId }: { clinicaId: string; pacienteId: string }) => {
  const [lista, setLista] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [visualizando, setVisualizando] = useState<any | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCarregando(true);
      try {
        const d = await listarDocumentos(clinicaId, pacienteId);
        if (vivo) setLista(d);
      } catch (e: any) {
        if (vivo) toast.error("Erro ao carregar documentos", { description: traduzErro(e) });
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [clinicaId, pacienteId]);

  return (
    <>
      <Card className="border-gray-100">
        <CardContent className="p-0">
          {carregando ? (
            <Carregando />
          ) : lista.length === 0 ? (
            <Vazio
              icone={FileText}
              titulo="Nenhum documento emitido"
              texto="Atestados, receituários, termos de consentimento e orientações emitidos para este paciente aparecem aqui, com data e hash de integridade."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Documento</th>
                    <th className="px-4 py-2.5 font-medium">Tipo</th>
                    <th className="px-4 py-2.5 font-medium">Emitido em</th>
                    <th className="px-4 py-2.5 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((d) => (
                    <tr key={d.id} className="border-b border-border/50 hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium">
                        {d.documento_modelos?.nome ?? "Documento"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {d.documento_modelos?.tipo ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{dataHoraBr(d.emitido_em)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setVisualizando(d)}>
                            Visualizar
                          </Button>
                          {d.pdf_url && (
                            <Button variant="ghost" size="sm" asChild>
                              <a href={d.pdf_url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!visualizando} onOpenChange={(o) => !o && setVisualizando(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{visualizando?.documento_modelos?.nome ?? "Documento"}</DialogTitle>
            <DialogDescription>
              Emitido em {dataHoraBr(visualizando?.emitido_em)}
              {visualizando?.hash ? ` · hash ${String(visualizando.hash).slice(0, 12)}…` : ""}
            </DialogDescription>
          </DialogHeader>
          {/* iframe sandbox: o HTML vem do modelo da clínica e é renderizado sem
              acesso ao app — nada de script rodando dentro do prontuário. */}
          <iframe
            title="Documento emitido"
            sandbox=""
            srcDoc={visualizando?.conteudo_final_html ?? ""}
            className="w-full h-[60vh] border border-border rounded bg-white"
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

// ---------------------------------------------------------------- aba: Débitos
const AbaDebitos = ({ clinicaId, pacienteId }: { clinicaId: string; pacienteId: string }) => {
  const [lista, setLista] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCarregando(true);
      try {
        const d = await listarDebitos(clinicaId, pacienteId);
        if (vivo) setLista(d);
      } catch (e: any) {
        if (vivo) toast.error("Erro ao carregar débitos", { description: traduzErro(e) });
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [clinicaId, pacienteId]);

  const totais = useMemo(() => {
    const emAberto = lista.filter((p) => p.status === "pendente" || p.status === "atrasado");
    const hoje = new Date().toISOString().slice(0, 10);
    return {
      aberto: emAberto.reduce((s, p) => s + Number(p.valor ?? 0), 0),
      vencido: emAberto
        .filter((p) => p.vencimento < hoje)
        .reduce((s, p) => s + Number(p.valor ?? 0), 0),
      pago: lista.filter((p) => p.status === "pago")
        .reduce((s, p) => s + Number(p.valor_pago ?? p.valor ?? 0), 0),
    };
  }, [lista]);

  if (carregando) return <Card className="border-gray-100"><CardContent className="p-0"><Carregando /></CardContent></Card>;

  if (lista.length === 0) {
    return (
      <Card className="border-gray-100">
        <CardContent className="p-0">
          <Vazio
            icone={Wallet}
            titulo="Nenhum débito lançado"
            texto="As parcelas nascem quando um orçamento aprovado gera os débitos. Nada aqui significa que não há cobrança pendente para este paciente."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { rot: "Em aberto", val: brl(totais.aberto), cor: "text-amber-600", sub: "pendente + atrasado" },
          { rot: "Vencido", val: brl(totais.vencido), cor: "text-red-600", sub: "passou do vencimento" },
          { rot: "Já pago", val: brl(totais.pago), cor: "text-emerald-600", sub: "liquidado" },
        ].map((k) => (
          <Card key={k.rot} className="border-gray-100">
            <CardContent className="p-5">
              <p className="text-xs text-gray-500">{k.rot}</p>
              <p className={`text-xl font-bold mt-0.5 ${k.cor}`}>{k.val}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-gray-100">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Descrição</th>
                <th className="px-4 py-2.5 font-medium">Parcela</th>
                <th className="px-4 py-2.5 font-medium">Vencimento</th>
                <th className="px-4 py-2.5 font-medium text-right">Valor</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Pago em</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/40">
                  <td className="px-4 py-3">{p.lancamentos?.descricao ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{p.numero}</td>
                  <td className="px-4 py-3 tabular-nums">{dataBr(p.vencimento)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{brl(Number(p.valor))}</td>
                  <td className="px-4 py-3">
                    <Badge className={`${STATUS_PARCELA_CLASSE[p.status as StatusParcela] ?? "bg-gray-100 text-gray-700"} border-0 font-medium`}>
                      {STATUS_PARCELA_LABEL[p.status as StatusParcela] ?? p.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {p.pago_em ? dataBr(p.pago_em) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------- página
const PacienteFicha = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { clinicaId, contexto, carregando: carregandoCtx } = useTenant();

  const [paciente, setPaciente] = useState<PacienteCompleto | null>(null);
  const [prontuario, setProntuario] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) { setCarregando(false); return; }
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; }
    setCarregando(true);
    try {
      const p = await obterPaciente(clinicaId, id);
      setPaciente(p);
      if (p) setProntuario(await obterProntuario(clinicaId, p.created_at));
    } catch (e: any) {
      toast.error("Erro ao carregar o paciente", { description: traduzErro(e) });
    } finally {
      setCarregando(false);
    }
  }, [id, clinicaId, carregandoCtx]);

  useEffect(() => { carregar(); }, [carregar]);

  const idade = idadeEmAnos(paciente?.data_nascimento);
  const wa = linkWhatsApp(paciente?.celular, paciente ? `Olá, ${paciente.apelido || paciente.nome_completo.split(" ")[0]}!` : undefined);

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-8">
          <Button
            variant="ghost"
            onClick={() => navigate("/pacientes")}
            className="gap-2 -ml-2 mb-4 text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar para pacientes
          </Button>

          {carregandoCtx || carregando ? (
            <Card className="border-gray-100"><CardContent className="p-0"><Carregando /></CardContent></Card>
          ) : !paciente ? (
            <Card className="border-gray-100">
              <CardContent className="p-0">
                <Vazio
                  icone={User}
                  titulo="Paciente não encontrado"
                  texto="O cadastro pode ter sido excluído ou pertence a outra clínica."
                  acao={
                    <Button onClick={() => navigate("/pacientes")} className="bg-brand-600 hover:bg-brand-700">
                      Ver lista de pacientes
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="border-gray-100 mb-4">
                <CardContent className="p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="h-14 w-14 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-lg font-semibold shrink-0">
                      {iniciais(paciente.nome_completo)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-xl font-bold text-gray-900">{paciente.nome_completo}</h1>
                        {!paciente.ativo && (
                          <Badge className="bg-gray-100 text-gray-600 border-0">Inativo</Badge>
                        )}
                        <Badge className="bg-sky-100 text-sky-800 border-0 font-normal">
                          {paciente.convenios?.nome ?? "Particular"}
                        </Badge>
                        {paciente.tags?.map((t) => (
                          <Badge key={t} className="bg-brand-100 text-brand-800 border-0 font-normal">
                            {t}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        Prontuário <span className="font-mono">#{String(prontuario ?? 0).padStart(4, "0")}</span>
                        {idade !== null && ` · ${idade} anos`}
                      </p>
                      {paciente.alergias?.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          <span className="text-xs font-medium text-red-700">Alergias:</span>
                          {paciente.alergias.map((a) => (
                            <Badge key={a} className="bg-red-100 text-red-800 border-0 font-normal">{a}</Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => {
                          if (!wa) {
                            toast.error("Celular inválido", { description: "Edite o cadastro e informe o DDD." });
                            return;
                          }
                          window.open(wa, "_blank", "noopener,noreferrer");
                        }}
                      >
                        <MessageCircle className="h-4 w-4 text-brand-600" /> WhatsApp
                      </Button>
                      <Button variant="outline" className="gap-2"
                        onClick={() => navigate(`/agenda?novo=${paciente.id}`)}>
                        <CalendarClock className="h-4 w-4" /> Agendar
                      </Button>
                      <Button onClick={() => setEditando(true)} className="bg-brand-600 hover:bg-brand-700 gap-2">
                        <Pencil className="h-4 w-4" /> Editar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="sobre">
                <TabsList className="mb-4 flex-wrap h-auto">
                  <TabsTrigger value="sobre" className="gap-1.5"><User className="h-4 w-4" /> Sobre</TabsTrigger>
                  <TabsTrigger value="orcamentos" className="gap-1.5"><Receipt className="h-4 w-4" /> Orçamentos</TabsTrigger>
                  <TabsTrigger value="tratamentos" className="gap-1.5"><Stethoscope className="h-4 w-4" /> Tratamentos</TabsTrigger>
                  <TabsTrigger value="anamnese" className="gap-1.5"><ClipboardList className="h-4 w-4" /> Anamnese</TabsTrigger>
                  <TabsTrigger value="documentos" className="gap-1.5"><FileText className="h-4 w-4" /> Documentos</TabsTrigger>
                  <TabsTrigger value="arquivos" className="gap-1.5"><Paperclip className="h-4 w-4" /> Arquivos</TabsTrigger>
                  <TabsTrigger value="debitos" className="gap-1.5"><Wallet className="h-4 w-4" /> Débitos</TabsTrigger>
                </TabsList>

                <TabsContent value="sobre">
                  <AbaSobre paciente={paciente} clinicaId={clinicaId!} />
                </TabsContent>
                <TabsContent value="orcamentos">
                  <AbaOrcamentos clinicaId={clinicaId!} pacienteId={paciente.id} />
                </TabsContent>
                <TabsContent value="tratamentos">
                  <AbaTratamentos
                    clinicaId={clinicaId!}
                    pacienteId={paciente.id}
                    profissionalId={contexto?.user_id ?? null}
                  />
                </TabsContent>
                <TabsContent value="anamnese">
                  <AbaAnamnese clinicaId={clinicaId!} pacienteId={paciente.id} />
                </TabsContent>
                <TabsContent value="documentos">
                  <AbaDocumentos clinicaId={clinicaId!} pacienteId={paciente.id} />
                </TabsContent>
                <TabsContent value="arquivos">
                  <AbaArquivos clinicaId={clinicaId!} pacienteId={paciente.id} />
                </TabsContent>
                <TabsContent value="debitos">
                  <AbaDebitos clinicaId={clinicaId!} pacienteId={paciente.id} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </main>

      {paciente && (
        <PacienteDialog
          aberto={editando}
          paciente={paciente}
          onFechar={() => setEditando(false)}
          onSalvo={() => { setEditando(false); carregar(); }}
        />
      )}
    </div>
  );
};

export default PacienteFicha;
