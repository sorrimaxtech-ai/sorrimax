import { traduzErro } from "@/lib/erros";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampoMoeda } from "@/components/ui/campo-moeda";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  ClipboardList, Plus, Search, Loader2, Pencil, Trash2, Download, X, Check,
  Stethoscope, Users, Tag,
} from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import { ProcedimentoDialog } from "@/components/procedimentos/ProcedimentoDialog";
import {
  APLICACAO_LABEL, ESPECIALIDADES, MODALIDADE_LABEL,
  alternarAtivoProcedimento, brl, excluirHabilitado, excluirPreco, excluirProcedimento,
  formatarDuracao, importarProcedimentosComuns, listarConvenios, listarHabilitados,
  listarPrecos, listarProcedimentos, listarProfissionais, salvarHabilitado, salvarPreco,
  type ConvenioResumo, type HabilitadoComProfissional, type PrecoComConvenio,
  type Procedimento, type ProfissionalResumo,
} from "@/services/procedimentos";

const TODAS = "__todas__";
type TipoComissao = "nenhuma" | "percentual" | "valor";

interface FormPreco {
  convenio_id: string;
  valor: string;
  tipo: TipoComissao;
  comissao: string;
}

interface FormHabilitado {
  profissional_id: string;
  valor_override: string;
  duracao_override: string;
}

const PRECO_VAZIO: FormPreco = { convenio_id: "", valor: "", tipo: "nenhuma", comissao: "" };
const HABILITADO_VAZIO: FormHabilitado = {
  profissional_id: "", valor_override: "", duracao_override: "",
};

const Procedimentos = () => {
  const { clinicaId, carregando: carregandoCtx } = useTenant();

  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [convenios, setConvenios] = useState<ConvenioResumo[]>([]);
  const [profissionais, setProfissionais] = useState<ProfissionalResumo[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [busca, setBusca] = useState("");
  const [filtroEspecialidade, setFiltroEspecialidade] = useState<string>(TODAS);
  const [mostrarInativos, setMostrarInativos] = useState(false);

  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<Procedimento | null>(null);
  const [importando, setImportando] = useState(false);

  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [precos, setPrecos] = useState<PrecoComConvenio[]>([]);
  const [habilitados, setHabilitados] = useState<HabilitadoComProfissional[]>([]);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const [formPreco, setFormPreco] = useState<FormPreco>(PRECO_VAZIO);
  const [editandoPrecoId, setEditandoPrecoId] = useState<string | null>(null);
  const [salvandoPreco, setSalvandoPreco] = useState(false);

  const [formHab, setFormHab] = useState<FormHabilitado>(HABILITADO_VAZIO);
  const [editandoHabId, setEditandoHabId] = useState<string | null>(null);
  const [salvandoHab, setSalvandoHab] = useState(false);

  // Um único AlertDialog serve as três exclusões da tela (procedimento, preço, habilitação).
  const [confirmacao, setConfirmacao] = useState<{
    titulo: string; descricao: string; acao: () => Promise<void>;
  } | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const selecionado = useMemo(
    () => procedimentos.find((p) => p.id === selecionadoId) ?? null,
    [procedimentos, selecionadoId],
  );

  // ------------------------------------------------------------------ carga
  const carregarLista = useCallback(async () => {
    if (!clinicaId) return;
    try {
      const lista = await listarProcedimentos(clinicaId, mostrarInativos);
      setProcedimentos(lista);
    } catch (e: any) {
      toast.error("Erro ao carregar procedimentos", { description: traduzErro(e) });
    }
  }, [clinicaId, mostrarInativos]);

  useEffect(() => {
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; } // evita spinner eterno
    let vivo = true;
    setCarregando(true);
    (async () => {
      try {
        const [lista, conv, prof] = await Promise.all([
          listarProcedimentos(clinicaId, mostrarInativos),
          listarConvenios(clinicaId),
          listarProfissionais(clinicaId),
        ]);
        if (!vivo) return;
        setProcedimentos(lista);
        setConvenios(conv);
        setProfissionais(prof);
      } catch (e: any) {
        if (vivo) toast.error("Erro ao carregar procedimentos", { description: traduzErro(e) });
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [clinicaId, carregandoCtx, mostrarInativos]);

  // Detalhe (preços + profissionais) do procedimento selecionado.
  useEffect(() => {
    if (!selecionadoId || !clinicaId) { setPrecos([]); setHabilitados([]); return; }
    let vivo = true;
    setCarregandoDetalhe(true);
    (async () => {
      try {
        const [pr, hab] = await Promise.all([
          listarPrecos(clinicaId, selecionadoId),
          listarHabilitados(clinicaId, selecionadoId),
        ]);
        if (!vivo) return;
        setPrecos(pr);
        setHabilitados(hab);
      } catch (e: any) {
        if (vivo) toast.error("Erro ao carregar detalhes", { description: traduzErro(e) });
      } finally {
        if (vivo) setCarregandoDetalhe(false);
      }
    })();
    return () => { vivo = false; };
  }, [selecionadoId, clinicaId]);

  const recarregarDetalhe = async () => {
    if (!selecionadoId || !clinicaId) return;
    try {
      const [pr, hab] = await Promise.all([
        listarPrecos(clinicaId, selecionadoId),
        listarHabilitados(clinicaId, selecionadoId),
      ]);
      setPrecos(pr);
      setHabilitados(hab);
    } catch (e: any) {
      toast.error("Erro ao recarregar detalhes", { description: traduzErro(e) });
    }
  };

  // ------------------------------------------------------------------ filtros
  const especialidadesUsadas = useMemo(() => {
    const set = new Set<string>();
    procedimentos.forEach((p) => p.especialidade && set.add(p.especialidade));
    // Mantém a ordem canônica da lista e acrescenta o que veio fora dela.
    const canonicas = ESPECIALIDADES.filter((e) => set.has(e));
    const extras = [...set].filter((e) => !ESPECIALIDADES.includes(e as any)).sort();
    return [...canonicas, ...extras];
  }, [procedimentos]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return procedimentos.filter((p) => {
      if (filtroEspecialidade !== TODAS && p.especialidade !== filtroEspecialidade) return false;
      if (!termo) return true;
      return (
        p.nome.toLowerCase().includes(termo) ||
        (p.codigo ?? "").toLowerCase().includes(termo) ||
        (p.codigo_tuss ?? "").toLowerCase().includes(termo) ||
        (p.especialidade ?? "").toLowerCase().includes(termo)
      );
    });
  }, [procedimentos, busca, filtroEspecialidade]);

  // ------------------------------------------------------------------ ações
  const abrirNovo = () => { setEditando(null); setDialogAberto(true); };
  const abrirEdicao = (p: Procedimento) => { setEditando(p); setDialogAberto(true); };

  const aoSalvarProcedimento = (salvo: Procedimento) => {
    setProcedimentos((atual) => {
      const existe = atual.some((p) => p.id === salvo.id);
      const proximo = existe
        ? atual.map((p) => (p.id === salvo.id ? salvo : p))
        : [...atual, salvo];
      // Some da lista quando foi inativado e o filtro esconde inativos.
      const visivel = mostrarInativos ? proximo : proximo.filter((p) => p.ativo);
      return visivel.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    });
    if (!salvo.ativo && !mostrarInativos && selecionadoId === salvo.id) setSelecionadoId(null);
  };

  const alternarAtivo = async (p: Procedimento, ativo: boolean) => {
    if (!clinicaId) return;
    const anterior = procedimentos;
    setProcedimentos((atual) => atual.map((x) => (x.id === p.id ? { ...x, ativo } : x)));
    try {
      await alternarAtivoProcedimento(clinicaId, p.id, ativo);
      if (!ativo && !mostrarInativos) {
        setProcedimentos((atual) => atual.filter((x) => x.id !== p.id));
        if (selecionadoId === p.id) setSelecionadoId(null);
      }
    } catch (e: any) {
      setProcedimentos(anterior); // rollback otimista
      toast.error("Erro ao alterar status", { description: traduzErro(e) });
    }
  };

  const pedirExclusaoProcedimento = (p: Procedimento) =>
    setConfirmacao({
      titulo: `Excluir "${p.nome}"?`,
      descricao:
        "O procedimento sai do catálogo junto com os preços por convênio e as habilitações. " +
        "Orçamentos e consultas já lançados com ele impedem a exclusão — nesse caso, desative em vez de excluir.",
      acao: async () => {
        if (!clinicaId) return;
        await excluirProcedimento(clinicaId, p.id);
        setProcedimentos((atual) => atual.filter((x) => x.id !== p.id));
        if (selecionadoId === p.id) setSelecionadoId(null);
        toast.success("Procedimento excluído");
      },
    });

  const importarComuns = async () => {
    if (!clinicaId) return;
    setImportando(true);
    try {
      const { inseridos, ignorados } = await importarProcedimentosComuns(clinicaId);
      await carregarLista();
      if (inseridos === 0) {
        toast.info("Nada a importar", {
          description: "Todos os procedimentos do catálogo base já existem nesta clínica.",
        });
      } else {
        toast.success(`${inseridos} procedimento(s) importado(s)`, {
          description: ignorados > 0
            ? `${ignorados} já existiam e foram mantidos como estão.`
            : "Revise valores e durações conforme a sua tabela.",
        });
      }
    } catch (e: any) {
      toast.error("Erro ao importar catálogo", { description: traduzErro(e) });
    } finally {
      setImportando(false);
    }
  };

  // ------------------------------------------------------------ preços
  const conveniosDisponiveis = useMemo(() => {
    const usados = new Set(
      precos.filter((p) => p.id !== editandoPrecoId).map((p) => p.convenio_id),
    );
    return convenios.filter((c) => !usados.has(c.id));
  }, [convenios, precos, editandoPrecoId]);

  const iniciarEdicaoPreco = (p: PrecoComConvenio) => {
    setEditandoPrecoId(p.id);
    setFormPreco({
      convenio_id: p.convenio_id,
      valor: String(p.valor ?? ""),
      tipo: p.comissao_percentual != null ? "percentual"
        : p.comissao_valor != null ? "valor" : "nenhuma",
      comissao: String(p.comissao_percentual ?? p.comissao_valor ?? ""),
    });
  };

  const cancelarEdicaoPreco = () => { setEditandoPrecoId(null); setFormPreco(PRECO_VAZIO); };

  const gravarPreco = async () => {
    if (!clinicaId || !selecionadoId) return;
    if (!formPreco.convenio_id) { toast.error("Selecione o convênio"); return; }
    const valor = Number(formPreco.valor);
    if (!Number.isFinite(valor) || valor < 0) { toast.error("Informe um valor válido"); return; }

    const comissao = formPreco.comissao === "" ? null : Number(formPreco.comissao);
    if (formPreco.tipo !== "nenhuma" && (comissao == null || !Number.isFinite(comissao) || comissao < 0)) {
      toast.error("Informe a comissão"); return;
    }
    if (formPreco.tipo === "percentual" && comissao != null && comissao > 100) {
      toast.error("Comissão percentual não pode passar de 100%"); return;
    }

    setSalvandoPreco(true);
    try {
      await salvarPreco(clinicaId, selecionadoId, {
        convenio_id: formPreco.convenio_id,
        valor,
        // O banco tem CHECK: percentual e valor não podem coexistir.
        comissao_percentual: formPreco.tipo === "percentual" ? comissao : null,
        comissao_valor: formPreco.tipo === "valor" ? comissao : null,
      });
      await recarregarDetalhe();
      cancelarEdicaoPreco();
      toast.success("Preço salvo");
    } catch (e: any) {
      toast.error("Erro ao salvar preço", { description: traduzErro(e) });
    } finally {
      setSalvandoPreco(false);
    }
  };

  const pedirExclusaoPreco = (p: PrecoComConvenio) =>
    setConfirmacao({
      titulo: "Remover preço deste convênio?",
      descricao: `O convênio "${p.convenios?.nome ?? "—"}" volta a usar o valor particular do procedimento.`,
      acao: async () => {
        if (!clinicaId) return;
        await excluirPreco(clinicaId, p.id);
        setPrecos((atual) => atual.filter((x) => x.id !== p.id));
        toast.success("Preço removido");
      },
    });

  // ------------------------------------------------------------ profissionais
  const profissionaisDisponiveis = useMemo(() => {
    const usados = new Set(
      habilitados.filter((h) => h.id !== editandoHabId).map((h) => h.profissional_id),
    );
    return profissionais.filter((p) => !usados.has(p.id));
  }, [profissionais, habilitados, editandoHabId]);

  const iniciarEdicaoHab = (h: HabilitadoComProfissional) => {
    setEditandoHabId(h.id);
    setFormHab({
      profissional_id: h.profissional_id,
      valor_override: h.valor_override != null ? String(h.valor_override) : "",
      duracao_override: h.duracao_override_min != null ? String(h.duracao_override_min) : "",
    });
  };

  const cancelarEdicaoHab = () => { setEditandoHabId(null); setFormHab(HABILITADO_VAZIO); };

  const gravarHabilitado = async () => {
    if (!clinicaId || !selecionadoId) return;
    if (!formHab.profissional_id) { toast.error("Selecione o profissional"); return; }

    const valor = formHab.valor_override === "" ? null : Number(formHab.valor_override);
    if (valor != null && (!Number.isFinite(valor) || valor < 0)) {
      toast.error("Valor específico inválido"); return;
    }
    const duracao = formHab.duracao_override === "" ? null : Number(formHab.duracao_override);
    if (duracao != null && (!Number.isFinite(duracao) || duracao < 5 || duracao > 1440)) {
      toast.error("Duração específica deve ficar entre 5 e 1440 minutos"); return;
    }

    setSalvandoHab(true);
    try {
      await salvarHabilitado(clinicaId, selecionadoId, formHab.profissional_id, valor, duracao);
      await recarregarDetalhe();
      cancelarEdicaoHab();
      toast.success("Profissional habilitado");
    } catch (e: any) {
      toast.error("Erro ao habilitar profissional", { description: traduzErro(e) });
    } finally {
      setSalvandoHab(false);
    }
  };

  const pedirExclusaoHab = (h: HabilitadoComProfissional) =>
    setConfirmacao({
      titulo: "Remover profissional deste procedimento?",
      descricao: `${h.profiles?.full_name ?? "O profissional"} deixa de aparecer como executante na agenda deste procedimento.`,
      acao: async () => {
        if (!clinicaId) return;
        await excluirHabilitado(clinicaId, h.id);
        setHabilitados((atual) => atual.filter((x) => x.id !== h.id));
        toast.success("Profissional removido");
      },
    });

  const executarConfirmacao = async () => {
    if (!confirmacao) return;
    setConfirmando(true);
    try {
      await confirmacao.acao();
      setConfirmacao(null);
    } catch (e: any) {
      toast.error("Não foi possível concluir", { description: traduzErro(e) });
    } finally {
      setConfirmando(false);
    }
  };

  // ------------------------------------------------------------------ render
  const semClinica = !carregandoCtx && !clinicaId;
  const listaVazia = !carregando && procedimentos.length === 0;

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-4 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <ClipboardList className="h-6 w-6 text-brand-600" /> Procedimentos
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                O catálogo que define duração e cor na agenda, valor no orçamento e base de comissão no financeiro.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={importarComuns}
                disabled={importando || !clinicaId}
                className="gap-2"
              >
                {importando
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Download className="h-4 w-4" />}
                Importar procedimentos comuns
              </Button>
              <Button
                onClick={abrirNovo}
                disabled={!clinicaId}
                className="bg-brand-600 hover:bg-brand-700 gap-2"
              >
                <Plus className="h-4 w-4" /> Novo procedimento
              </Button>
            </div>
          </div>

          {semClinica ? (
            <Card className="border-gray-100">
              <CardContent className="p-12 text-center">
                <Stethoscope className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="font-medium text-gray-800">Clínica não identificada</p>
                <p className="text-sm text-gray-500 mt-1">
                  Sua conta ainda não está vinculada a uma clínica. Conclua o cadastro da clínica
                  para montar o catálogo de procedimentos.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* -------------------------------------------------- filtros */}
              <Card className="border-gray-100 mb-4">
                <CardContent className="p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                    <div className="flex-1">
                      <Label htmlFor="busca" className="text-xs text-gray-500">Buscar</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          id="busca"
                          value={busca}
                          onChange={(e) => setBusca(e.target.value)}
                          placeholder="Nome, código ou TUSS"
                          className="pl-9"
                        />
                      </div>
                    </div>

                    <div className="w-full lg:w-64">
                      <Label className="text-xs text-gray-500">Especialidade</Label>
                      <Select value={filtroEspecialidade} onValueChange={setFiltroEspecialidade}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={TODAS}>Todas as especialidades</SelectItem>
                          {especialidadesUsadas.map((e) => (
                            <SelectItem key={e} value={e}>{e}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-2 pb-2">
                      <Switch
                        id="inativos"
                        checked={mostrarInativos}
                        onCheckedChange={setMostrarInativos}
                      />
                      <Label htmlFor="inativos" className="text-sm text-gray-600 cursor-pointer">
                        Mostrar inativos
                      </Label>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* -------------------------------------------------- tabela */}
              <Card className="border-gray-100">
                <CardContent className="p-0">
                  {carregando ? (
                    <div className="p-12 flex justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : listaVazia ? (
                    <div className="p-12 text-center">
                      <ClipboardList className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                      <p className="font-medium text-gray-800">Nenhum procedimento cadastrado</p>
                      <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                        Sem catálogo, a agenda não sabe quanto tempo reservar e o orçamento não tem
                        de onde puxar valor. Importe o catálogo base e ajuste, ou cadastre o primeiro
                        procedimento manualmente.
                      </p>
                      <div className="flex flex-wrap justify-center gap-2 mt-4">
                        <Button variant="outline" onClick={importarComuns} disabled={importando} className="gap-2">
                          {importando
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Download className="h-4 w-4" />}
                          Importar procedimentos comuns
                        </Button>
                        <Button onClick={abrirNovo} className="bg-brand-600 hover:bg-brand-700 gap-2">
                          <Plus className="h-4 w-4" /> Novo procedimento
                        </Button>
                      </div>
                    </div>
                  ) : filtrados.length === 0 ? (
                    <div className="p-12 text-center">
                      <Search className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                      <p className="font-medium text-gray-800">Nenhum resultado</p>
                      <p className="text-sm text-gray-500 mt-1">
                        Nenhum procedimento bate com esse filtro. Ajuste a busca ou a especialidade.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="text-left font-medium px-4 py-3">Nome</th>
                            <th className="text-left font-medium px-4 py-3">Código</th>
                            <th className="text-left font-medium px-4 py-3">Especialidade</th>
                            <th className="text-left font-medium px-4 py-3">Aplicação</th>
                            <th className="text-right font-medium px-4 py-3">Duração</th>
                            <th className="text-right font-medium px-4 py-3">Valor</th>
                            <th className="text-center font-medium px-4 py-3">Ativo</th>
                            <th className="px-4 py-3" />
                          </tr>
                        </thead>
                        <tbody>
                          {filtrados.map((p) => {
                            const ativoNaTela = selecionadoId === p.id;
                            return (
                              <tr
                                key={p.id}
                                onClick={() => setSelecionadoId(ativoNaTela ? null : p.id)}
                                className={`border-b border-border/50 hover:bg-muted/40 cursor-pointer ${
                                  ativoNaTela ? "bg-brand-50/60" : ""
                                } ${p.ativo ? "" : "opacity-60"}`}
                              >
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="h-3 w-3 rounded-full shrink-0 border border-black/5"
                                      style={{ backgroundColor: p.cor }}
                                      aria-hidden
                                    />
                                    <div>
                                      <p className="font-medium text-gray-900">{p.nome}</p>
                                      {p.sessoes_previstas > 1 && (
                                        <p className="text-[11px] text-gray-400">
                                          {p.sessoes_previstas} sessões previstas
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-gray-600">
                                  {p.codigo || <span className="text-gray-300">—</span>}
                                  {p.codigo_tuss && (
                                    <span className="block text-[11px] text-gray-400">
                                      TUSS {p.codigo_tuss}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-gray-600">
                                  {p.especialidade || <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-4 py-3">
                                  <Badge className="bg-gray-100 text-gray-700 border-0 font-normal">
                                    {APLICACAO_LABEL[p.aplicacao]}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                                  {formatarDuracao(p.duracao_min)}
                                </td>
                                <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                                  {brl(Number(p.valor))}
                                </td>
                                <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                  <Switch
                                    checked={p.ativo}
                                    onCheckedChange={(v) => alternarAtivo(p, v)}
                                    aria-label={`Ativar ${p.nome}`}
                                  />
                                </td>
                                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      variant="ghost" size="icon" className="h-8 w-8"
                                      onClick={() => abrirEdicao(p)}
                                      aria-label={`Editar ${p.nome}`}
                                    >
                                      <Pencil className="h-4 w-4 text-gray-500" />
                                    </Button>
                                    <Button
                                      variant="ghost" size="icon" className="h-8 w-8"
                                      onClick={() => pedirExclusaoProcedimento(p)}
                                      aria-label={`Excluir ${p.nome}`}
                                    >
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* -------------------------------------------------- detalhe */}
              {selecionado && (
                <Card className="border-gray-100 mt-4">
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                      <div>
                        <p className="text-xs text-gray-500">Procedimento selecionado</p>
                        <h2 className="text-lg font-bold text-gray-900">{selecionado.nome}</h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Valor particular {brl(Number(selecionado.valor))} ·{" "}
                          {formatarDuracao(selecionado.duracao_min)} ·{" "}
                          {(selecionado.modalidades ?? []).map((m) => MODALIDADE_LABEL[m]).join(", ")}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelecionadoId(null)} className="gap-1">
                        <X className="h-4 w-4" /> Fechar
                      </Button>
                    </div>

                    <Tabs defaultValue="precos">
                      <TabsList>
                        <TabsTrigger value="precos" className="gap-2">
                          <Tag className="h-4 w-4" /> Tabela de preços
                        </TabsTrigger>
                        <TabsTrigger value="profissionais" className="gap-2">
                          <Users className="h-4 w-4" /> Profissionais habilitados
                        </TabsTrigger>
                      </TabsList>

                      {/* ---------------------------------------- preços */}
                      <TabsContent value="precos" className="pt-4">
                        <p className="text-xs text-gray-500 mb-3">
                          Sem preço específico, o convênio usa o valor particular do procedimento.
                          A comissão é por percentual <strong>ou</strong> por valor fixo — nunca os dois.
                        </p>

                        <div className="rounded-lg border border-gray-100 p-4 mb-4 bg-gray-50/60">
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
                            <div className="lg:col-span-2">
                              <Label className="text-xs text-gray-500">Convênio</Label>
                              <Select
                                value={formPreco.convenio_id}
                                onValueChange={(v) => setFormPreco((f) => ({ ...f, convenio_id: v }))}
                                disabled={!!editandoPrecoId}
                              >
                                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>
                                  {conveniosDisponiveis.length === 0 ? (
                                    <div className="px-2 py-3 text-xs text-gray-500">
                                      Nenhum convênio disponível.
                                    </div>
                                  ) : conveniosDisponiveis.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                      {c.nome}{c.tipo === "particular" ? " (particular)" : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <Label className="text-xs text-gray-500">Valor</Label>
                              <CampoMoeda
                                value={formPreco.valor === "" ? null : Number(formPreco.valor)}
                                onChange={(r) => setFormPreco((f) => ({ ...f, valor: r == null ? "" : String(r) }))}
                              />
                            </div>

                            <div>
                              <Label className="text-xs text-gray-500">Comissão</Label>
                              <Select
                                value={formPreco.tipo}
                                onValueChange={(v) =>
                                  setFormPreco((f) => ({ ...f, tipo: v as TipoComissao, comissao: "" }))}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="nenhuma">Sem comissão</SelectItem>
                                  <SelectItem value="percentual">Percentual (%)</SelectItem>
                                  <SelectItem value="valor">Valor fixo (R$)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <Label className="text-xs text-gray-500">
                                {formPreco.tipo === "percentual" ? "Percentual (%)"
                                  : formPreco.tipo === "valor" ? "Valor da comissão (R$)"
                                  : "—"}
                              </Label>
                              <Input
                                type="number" min={0} step="0.01"
                                max={formPreco.tipo === "percentual" ? 100 : undefined}
                                value={formPreco.comissao}
                                disabled={formPreco.tipo === "nenhuma"}
                                onChange={(e) => setFormPreco((f) => ({ ...f, comissao: e.target.value }))}
                                placeholder={formPreco.tipo === "nenhuma" ? "—" : "0"}
                              />
                            </div>
                          </div>

                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              onClick={gravarPreco}
                              disabled={salvandoPreco}
                              className="bg-brand-600 hover:bg-brand-700 gap-2"
                            >
                              {salvandoPreco
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Check className="h-4 w-4" />}
                              {editandoPrecoId ? "Salvar preço" : "Adicionar preço"}
                            </Button>
                            {editandoPrecoId && (
                              <Button size="sm" variant="outline" onClick={cancelarEdicaoPreco}>
                                Cancelar
                              </Button>
                            )}
                          </div>
                        </div>

                        {carregandoDetalhe ? (
                          <div className="p-12 flex justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : precos.length === 0 ? (
                          <div className="p-12 text-center">
                            <Tag className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                            <p className="font-medium text-gray-800">Nenhum preço por convênio</p>
                            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                              {convenios.length === 0
                                ? "Nenhum convênio ativo cadastrado na clínica. Cadastre os convênios para montar a tabela de preços."
                                : "Este procedimento usa o valor particular para todos os convênios. Adicione um preço acima para diferenciar."}
                            </p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                  <th className="text-left font-medium px-4 py-3">Convênio</th>
                                  <th className="text-right font-medium px-4 py-3">Valor</th>
                                  <th className="text-right font-medium px-4 py-3">Comissão</th>
                                  <th className="px-4 py-3" />
                                </tr>
                              </thead>
                              <tbody>
                                {precos.map((p) => (
                                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/40">
                                    <td className="px-4 py-3 text-gray-900">
                                      {p.convenios?.nome ?? "Convênio removido"}
                                    </td>
                                    <td className="px-4 py-3 text-right font-medium">
                                      {brl(Number(p.valor))}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-600">
                                      {p.comissao_percentual != null
                                        ? `${Number(p.comissao_percentual)}%`
                                        : p.comissao_valor != null
                                          ? brl(Number(p.comissao_valor))
                                          : <span className="text-gray-300">—</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex justify-end gap-1">
                                        <Button
                                          variant="ghost" size="icon" className="h-8 w-8"
                                          onClick={() => iniciarEdicaoPreco(p)}
                                          aria-label="Editar preço"
                                        >
                                          <Pencil className="h-4 w-4 text-gray-500" />
                                        </Button>
                                        <Button
                                          variant="ghost" size="icon" className="h-8 w-8"
                                          onClick={() => pedirExclusaoPreco(p)}
                                          aria-label="Remover preço"
                                        >
                                          <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </TabsContent>

                      {/* ---------------------------------------- profissionais */}
                      <TabsContent value="profissionais" className="pt-4">
                        <p className="text-xs text-gray-500 mb-3">
                          Quem pode executar este procedimento. O valor específico substitui o valor
                          do procedimento no cálculo da comissão desse profissional.
                        </p>

                        <div className="rounded-lg border border-gray-100 p-4 mb-4 bg-gray-50/60">
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
                            <div className="lg:col-span-2">
                              <Label className="text-xs text-gray-500">Profissional</Label>
                              <Select
                                value={formHab.profissional_id}
                                onValueChange={(v) => setFormHab((f) => ({ ...f, profissional_id: v }))}
                                disabled={!!editandoHabId}
                              >
                                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>
                                  {profissionaisDisponiveis.length === 0 ? (
                                    <div className="px-2 py-3 text-xs text-gray-500">
                                      Nenhum profissional disponível.
                                    </div>
                                  ) : profissionaisDisponiveis.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.full_name ?? "Sem nome"}
                                      {p.especialidade ? ` — ${p.especialidade}` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <Label className="text-xs text-gray-500">Valor específico</Label>
                              <CampoMoeda
                                value={formHab.valor_override === "" ? null : Number(formHab.valor_override)}
                                onChange={(r) => setFormHab((f) => ({ ...f, valor_override: r == null ? "" : String(r) }))}
                                placeholder="Opcional"
                              />
                            </div>

                            <div>
                              <Label className="text-xs text-gray-500">Duração específica (min)</Label>
                              <Input
                                type="number" min={5} max={1440}
                                value={formHab.duracao_override}
                                onChange={(e) => setFormHab((f) => ({ ...f, duracao_override: e.target.value }))}
                                placeholder="Opcional"
                              />
                            </div>
                          </div>

                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              onClick={gravarHabilitado}
                              disabled={salvandoHab}
                              className="bg-brand-600 hover:bg-brand-700 gap-2"
                            >
                              {salvandoHab
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Check className="h-4 w-4" />}
                              {editandoHabId ? "Salvar" : "Habilitar profissional"}
                            </Button>
                            {editandoHabId && (
                              <Button size="sm" variant="outline" onClick={cancelarEdicaoHab}>
                                Cancelar
                              </Button>
                            )}
                          </div>
                        </div>

                        {carregandoDetalhe ? (
                          <div className="p-12 flex justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : habilitados.length === 0 ? (
                          <div className="p-12 text-center">
                            <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                            <p className="font-medium text-gray-800">Nenhum profissional habilitado</p>
                            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                              {profissionais.length === 0
                                ? "Nenhum profissional cadastrado na clínica ainda."
                                : "Sem habilitação explícita, o procedimento fica disponível para toda a equipe na agenda. Habilite quem realmente executa para restringir."}
                            </p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                  <th className="text-left font-medium px-4 py-3">Profissional</th>
                                  <th className="text-right font-medium px-4 py-3">Valor específico</th>
                                  <th className="text-right font-medium px-4 py-3">Duração específica</th>
                                  <th className="px-4 py-3" />
                                </tr>
                              </thead>
                              <tbody>
                                {habilitados.map((h) => (
                                  <tr key={h.id} className="border-b border-border/50 hover:bg-muted/40">
                                    <td className="px-4 py-3">
                                      <p className="text-gray-900">
                                        {h.profiles?.full_name ?? "Profissional removido"}
                                      </p>
                                      {h.profiles?.especialidade && (
                                        <p className="text-[11px] text-gray-400">{h.profiles.especialidade}</p>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-600">
                                      {h.valor_override != null
                                        ? brl(Number(h.valor_override))
                                        : <span className="text-gray-300">padrão</span>}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-600">
                                      {h.duracao_override_min != null
                                        ? formatarDuracao(h.duracao_override_min)
                                        : <span className="text-gray-300">padrão</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex justify-end gap-1">
                                        <Button
                                          variant="ghost" size="icon" className="h-8 w-8"
                                          onClick={() => iniciarEdicaoHab(h)}
                                          aria-label="Editar habilitação"
                                        >
                                          <Pencil className="h-4 w-4 text-gray-500" />
                                        </Button>
                                        <Button
                                          variant="ghost" size="icon" className="h-8 w-8"
                                          onClick={() => pedirExclusaoHab(h)}
                                          aria-label="Remover habilitação"
                                        >
                                          <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </main>

      <ProcedimentoDialog
        aberto={dialogAberto}
        onFechar={() => setDialogAberto(false)}
        onSalvo={aoSalvarProcedimento}
        clinicaId={clinicaId}
        procedimento={editando}
      />

      <AlertDialog open={!!confirmacao} onOpenChange={(o) => !o && !confirmando && setConfirmacao(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmacao?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{confirmacao?.descricao}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmando}
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => { e.preventDefault(); executarConfirmacao(); }}
            >
              {confirmando ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Procedimentos;
