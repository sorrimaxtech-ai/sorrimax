import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ShieldCheck, Loader2, Plus, Trash2, RotateCcw, Lock, Users, Info, Save, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import {
  listarPerfis, criarPerfil, atualizarPerfil, excluirPerfil, restaurarPerfisPadrao,
  listarEquipe, alterarPapel,
  normalizarPermissoes, mesclarPermissoes, permissoesVazias, contarLiberacoes,
  mensagemErro, ehConflitoUnico,
  ACOES, MODULOS, GRUPOS_MODULO, TOTAL_LIBERACOES,
  PAPEIS, PAPEL_LABEL, PAPEL_DESCRICAO, PAPEL_CLASSE,
  STATUS_MEMBRO_LABEL, STATUS_MEMBRO_CLASSE,
  type Acao, type PerfilPermissao, type Permissoes, type MembroEquipe, type Papel,
} from "@/services/configuracoes";

// ============================================================================
// Perfis e Permissões — quem enxerga o quê dentro da clínica
// ----------------------------------------------------------------------------
// Duas coisas diferentes convivem nesta tela, e a separação é proposital:
//
//   PERFIL  = o molde de acesso (matriz módulo × ação, guardada em jsonb).
//   PAPEL   = o `role` do usuário no `profiles`, que é o que a RLS do banco
//             realmente lê hoje (`is_admin()`, `current_role()`).
//
// Ou seja: mexer na matriz não afrouxa RLS. A matriz governa a camada de
// aplicação (menu, botão, rota); o papel governa a camada do banco. Prometer
// o contrário seria mentir para quem administra a clínica — por isso o aviso
// fica escrito na própria tela, e não só neste comentário.
// ============================================================================

const CLASSE_GRUPO: Record<string, string> = {
  "Operação": "bg-emerald-50 text-emerald-700",
  "Clínico": "bg-sky-50 text-sky-700",
  "Comercial": "bg-violet-50 text-violet-700",
  "Gestão": "bg-amber-50 text-amber-700",
};

const Permissoes = () => {
  const { clinicaId, carregando: carregandoCtx, isAdmin, contexto } = useTenant();

  const [perfis, setPerfis] = useState<PerfilPermissao[]>([]);
  const [equipe, setEquipe] = useState<MembroEquipe[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Permissoes | null>(null);
  const [nomeRascunho, setNomeRascunho] = useState("");

  const [dialogoNovo, setDialogoNovo] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [confirmarExclusao, setConfirmarExclusao] = useState<PerfilPermissao | null>(null);
  const [confirmarRestauro, setConfirmarRestauro] = useState(false);
  const [confirmarPapel, setConfirmarPapel] = useState<{ membro: MembroEquipe; papel: Papel } | null>(null);

  const carregar = useCallback(async () => {
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; }
    setCarregando(true);
    try {
      const [listaPerfis, listaEquipe] = await Promise.all([
        listarPerfis(clinicaId),
        listarEquipe(clinicaId),
      ]);
      setPerfis(listaPerfis);
      setEquipe(listaEquipe);
      setSelecionadoId((atual) =>
        atual && listaPerfis.some((p) => p.id === atual) ? atual : listaPerfis[0]?.id ?? null,
      );
    } catch (e) {
      toast.error("Erro ao carregar perfis", { description: mensagemErro(e) });
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, carregandoCtx]);

  useEffect(() => { carregar(); }, [carregar]);

  const selecionado = useMemo(
    () => perfis.find((p) => p.id === selecionadoId) ?? null,
    [perfis, selecionadoId],
  );

  // O rascunho reinicia quando troca o perfil escolhido: edição não vaza de um
  // perfil para o outro.
  useEffect(() => {
    if (!selecionado) { setRascunho(null); setNomeRascunho(""); return; }
    setRascunho(selecionado.permissoes);
    setNomeRascunho(selecionado.nome);
  }, [selecionado]);

  const sujo = useMemo(() => {
    if (!selecionado || !rascunho) return false;
    if (nomeRascunho.trim() !== selecionado.nome) return true;
    return JSON.stringify(rascunho) !== JSON.stringify(selecionado.permissoes);
  }, [selecionado, rascunho, nomeRascunho]);

  const podeEditar = isAdmin;

  const alternar = (modulo: string, acao: Acao) => {
    setRascunho((atual) => {
      if (!atual) return atual;
      const m = atual[modulo];
      const proximo = { ...m, [acao]: !m[acao] };
      // "Ver" é pré-requisito: liberar criar/editar/excluir sem leitura gera
      // perfil que age em tela que não abre. Marcar qualquer ação implica ver.
      if (acao !== "ver" && proximo[acao]) proximo.ver = true;
      // E desmarcar "ver" derruba o resto, pela mesma razão.
      if (acao === "ver" && !proximo.ver) {
        proximo.criar = false; proximo.editar = false; proximo.excluir = false;
      }
      return { ...atual, [modulo]: proximo };
    });
  };

  const alternarLinha = (modulo: string, ligar: boolean) => {
    setRascunho((atual) => atual
      ? { ...atual, [modulo]: { ver: ligar, criar: ligar, editar: ligar, excluir: ligar } }
      : atual);
  };

  const alternarColuna = (acao: Acao, ligar: boolean) => {
    setRascunho((atual) => {
      if (!atual) return atual;
      const novo: Permissoes = { ...atual };
      for (const mod of MODULOS) {
        const m = { ...novo[mod.chave], [acao]: ligar };
        if (acao !== "ver" && ligar) m.ver = true;
        if (acao === "ver" && !ligar) { m.criar = false; m.editar = false; m.excluir = false; }
        novo[mod.chave] = m;
      }
      return novo;
    });
  };

  const salvar = async () => {
    if (!clinicaId || !selecionado || !rascunho) return;
    const nome = nomeRascunho.trim();
    if (!nome) { toast.error("O perfil precisa de um nome."); return; }

    setSalvando(true);
    try {
      await atualizarPerfil(selecionado.id, clinicaId, {
        nome,
        permissoes: mesclarPermissoes(selecionado.brutas, rascunho),
      });
      toast.success("Perfil salvo", { description: `${nome} atualizado.` });
      await carregar();
    } catch (e) {
      toast.error(
        ehConflitoUnico(e) ? "Já existe um perfil com esse nome." : "Erro ao salvar perfil",
        { description: ehConflitoUnico(e) ? "Escolha outro nome." : mensagemErro(e) },
      );
    } finally {
      setSalvando(false);
    }
  };

  const criar = async () => {
    if (!clinicaId) return;
    const nome = nomeNovo.trim();
    if (!nome) { toast.error("Informe o nome do perfil."); return; }

    setSalvando(true);
    try {
      await criarPerfil(clinicaId, nome, permissoesVazias());
      toast.success("Perfil criado", { description: "Marque agora o que ele pode acessar." });
      setDialogoNovo(false);
      setNomeNovo("");
      const lista = await listarPerfis(clinicaId);
      setPerfis(lista);
      setSelecionadoId(lista.find((p) => p.nome === nome)?.id ?? lista[0]?.id ?? null);
    } catch (e) {
      toast.error(
        ehConflitoUnico(e) ? "Já existe um perfil com esse nome." : "Erro ao criar perfil",
        { description: ehConflitoUnico(e) ? "Escolha outro nome." : mensagemErro(e) },
      );
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!clinicaId || !confirmarExclusao) return;
    setSalvando(true);
    try {
      await excluirPerfil(confirmarExclusao.id, clinicaId);
      toast.success("Perfil excluído");
      setConfirmarExclusao(null);
      await carregar();
    } catch (e) {
      toast.error("Erro ao excluir perfil", { description: mensagemErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  const restaurar = async () => {
    if (!clinicaId) return;
    setSalvando(true);
    try {
      await restaurarPerfisPadrao(clinicaId);
      toast.success("Perfis padrão restaurados", {
        description: "Perfis que já existiam foram mantidos como estavam.",
      });
      setConfirmarRestauro(false);
      await carregar();
    } catch (e) {
      toast.error("Erro ao restaurar perfis", { description: mensagemErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  const totalAdmins = useMemo(
    () => equipe.filter((m) => m.papel === "admin").length,
    [equipe],
  );

  const aplicarPapel = async (membro: MembroEquipe, papel: Papel) => {
    if (!clinicaId) return;
    setSalvando(true);
    try {
      await alterarPapel(membro.id, clinicaId, papel);
      setEquipe((atual) => atual.map((m) => (m.id === membro.id ? { ...m, papel } : m)));
      toast.success("Papel atualizado", {
        description: `${membro.nome} agora é ${PAPEL_LABEL[papel]}.`,
      });
      setConfirmarPapel(null);
    } catch (e) {
      toast.error("Erro ao alterar papel", { description: mensagemErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  const pedirTrocaPapel = (membro: MembroEquipe, papel: Papel) => {
    if (papel === membro.papel) return;
    // Tirar o próprio admin é o caminho mais curto para se trancar do lado de
    // fora das configurações — exige confirmação explícita.
    const ehEuMesmo = membro.id === contexto?.user_id;
    if (ehEuMesmo && membro.papel === "admin") {
      setConfirmarPapel({ membro, papel });
      return;
    }
    aplicarPapel(membro, papel);
  };

  const modulosPorGrupo = useMemo(
    () => GRUPOS_MODULO.map((g) => ({ grupo: g, modulos: MODULOS.filter((m) => m.grupo === g) })),
    [],
  );

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-4 md:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="h-6 w-6 text-emerald-600" /> Perfis e Permissões
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                Defina o que cada função enxerga e altera no sistema, e quem da equipe assume cada papel.
              </p>
            </div>
            {podeEditar && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="gap-2" onClick={() => setConfirmarRestauro(true)}>
                  <RotateCcw className="h-4 w-4" /> Restaurar perfis padrão
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                  onClick={() => { setNomeNovo(""); setDialogoNovo(true); }}
                >
                  <Plus className="h-4 w-4" /> Novo perfil
                </Button>
              </div>
            )}
          </div>

          {!podeEditar && !carregando && (
            <Card className="border-gray-100 mb-6">
              <CardContent className="p-5 flex items-start gap-3">
                <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-gray-800">Você está em modo leitura</p>
                  <p className="text-gray-500">
                    Só quem tem papel de Administrador altera perfis e papéis da equipe.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {carregando ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !clinicaId ? (
            <Card className="border-gray-100">
              <CardContent className="p-12 text-center">
                <ShieldAlert className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="font-medium text-gray-800">Clínica não identificada</p>
                <p className="text-sm text-gray-500 mt-1">
                  Faça login novamente para o sistema reconhecer a qual clínica você pertence.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="perfis">
              <TabsList className="mb-4">
                <TabsTrigger value="perfis" className="gap-2">
                  <ShieldCheck className="h-4 w-4" /> Perfis ({perfis.length})
                </TabsTrigger>
                <TabsTrigger value="equipe" className="gap-2">
                  <Users className="h-4 w-4" /> Equipe ({equipe.length})
                </TabsTrigger>
              </TabsList>

              {/* ------------------------------------------------------ perfis */}
              <TabsContent value="perfis" className="mt-0">
                {perfis.length === 0 ? (
                  <Card className="border-gray-100">
                    <CardContent className="p-12 text-center">
                      <ShieldCheck className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                      <p className="font-medium text-gray-800">Nenhum perfil cadastrado</p>
                      <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                        Restaure os perfis padrão (Administrador, Dentista, Recepção e Auxiliar)
                        ou crie um perfil do zero para começar.
                      </p>
                      {podeEditar && (
                        <Button
                          variant="outline"
                          className="gap-2 mt-4"
                          onClick={() => setConfirmarRestauro(true)}
                        >
                          <RotateCcw className="h-4 w-4" /> Restaurar perfis padrão
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
                    {/* lista */}
                    <div className="space-y-2">
                      {perfis.map((p) => {
                        const ativo = p.id === selecionadoId;
                        return (
                          <button
                            key={p.id}
                            onClick={() => setSelecionadoId(p.id)}
                            className={`w-full text-left rounded-lg border p-3 transition-colors ${
                              ativo
                                ? "border-emerald-300 bg-emerald-50"
                                : "border-gray-100 bg-white hover:bg-muted/40"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-sm text-gray-900 truncate">{p.nome}</span>
                              {p.sistema && (
                                <Badge className="bg-gray-100 text-gray-600 border-0 text-[10px]">
                                  padrão
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-500 mt-1">
                              {contarLiberacoes(p.permissoes)} de {TOTAL_LIBERACOES} liberações
                            </p>
                          </button>
                        );
                      })}
                    </div>

                    {/* matriz */}
                    {selecionado && rascunho && (
                      <Card className="border-gray-100">
                        <CardContent className="p-5">
                          <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
                            <div className="flex-1">
                              <Label htmlFor="nome-perfil" className="text-xs text-gray-500">
                                Nome do perfil
                              </Label>
                              <Input
                                id="nome-perfil"
                                value={nomeRascunho}
                                onChange={(e) => setNomeRascunho(e.target.value)}
                                disabled={!podeEditar || selecionado.sistema}
                                className="mt-1"
                              />
                              {selecionado.sistema && (
                                <p className="text-[11px] text-gray-400 mt-1">
                                  Perfil padrão do sistema: o nome é fixo, mas as permissões podem ser ajustadas.
                                </p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {podeEditar && !selecionado.sistema && (
                                <Button
                                  variant="outline"
                                  className="gap-2 text-red-600 hover:text-red-700"
                                  onClick={() => setConfirmarExclusao(selecionado)}
                                >
                                  <Trash2 className="h-4 w-4" /> Excluir
                                </Button>
                              )}
                              {podeEditar && (
                                <Button
                                  className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                                  disabled={!sujo || salvando}
                                  onClick={salvar}
                                >
                                  {salvando
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <Save className="h-4 w-4" />}
                                  Salvar
                                </Button>
                              )}
                            </div>
                          </div>

                          <div className="rounded-md bg-muted/40 p-3 flex items-start gap-2 mb-4">
                            <Info className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-gray-600">
                              Marcar qualquer ação liga automaticamente o <strong>Ver</strong> do módulo —
                              não existe editar o que não se enxerga. As regras de acesso ao banco continuam
                              valendo pelo papel do usuário (aba Equipe).
                              <br />
                              Os perfis padrão foram gravados só com <strong>Ver</strong> e{" "}
                              <strong>Editar</strong>. Enquanto não forem salvos aqui,{" "}
                              <strong>Criar</strong> e <strong>Excluir</strong> aparecem espelhando o
                              Editar — confira antes de salvar, porque o salvamento grava as quatro
                              colunas como estão na tela.
                            </p>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                                  <th className="text-left font-medium px-3 py-2">Módulo</th>
                                  {ACOES.map((a) => (
                                    <th key={a.chave} className="px-3 py-2 font-medium text-center w-24">
                                      <span title={a.ajuda}>{a.rotulo}</span>
                                      {podeEditar && (
                                        <div className="flex justify-center gap-1 mt-1 normal-case tracking-normal">
                                          <button
                                            type="button"
                                            className="text-[10px] text-emerald-700 hover:underline"
                                            onClick={() => alternarColuna(a.chave, true)}
                                          >
                                            todos
                                          </button>
                                          <span className="text-[10px] text-gray-300">|</span>
                                          <button
                                            type="button"
                                            className="text-[10px] text-gray-500 hover:underline"
                                            onClick={() => alternarColuna(a.chave, false)}
                                          >
                                            nenhum
                                          </button>
                                        </div>
                                      )}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {modulosPorGrupo.map(({ grupo, modulos }) => (
                                  <Fragment key={grupo}>
                                    <tr>
                                      <td colSpan={ACOES.length + 1} className="pt-4 pb-1 px-3">
                                        <span
                                          className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${
                                            CLASSE_GRUPO[grupo] ?? "bg-gray-50 text-gray-600"
                                          }`}
                                        >
                                          {grupo}
                                        </span>
                                      </td>
                                    </tr>
                                    {modulos.map((mod) => {
                                      const linha = rascunho[mod.chave];
                                      const tudo = ACOES.every((a) => linha[a.chave]);
                                      return (
                                        <tr
                                          key={mod.chave}
                                          className="border-b border-border/50 hover:bg-muted/40"
                                        >
                                          <td className="px-3 py-2">
                                            <button
                                              type="button"
                                              disabled={!podeEditar}
                                              onClick={() => alternarLinha(mod.chave, !tudo)}
                                              className="text-left text-gray-800 disabled:cursor-default hover:text-emerald-700 disabled:hover:text-gray-800"
                                              title={podeEditar ? "Ligar/desligar a linha inteira" : undefined}
                                            >
                                              {mod.rotulo}
                                            </button>
                                          </td>
                                          {ACOES.map((a) => (
                                            <td key={a.chave} className="px-3 py-2 text-center">
                                              <Checkbox
                                                checked={linha[a.chave]}
                                                disabled={!podeEditar}
                                                onCheckedChange={() => alternar(mod.chave, a.chave)}
                                                aria-label={`${a.rotulo} ${mod.rotulo}`}
                                                className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                                              />
                                            </td>
                                          ))}
                                        </tr>
                                      );
                                    })}
                                  </Fragment>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* ------------------------------------------------------ equipe */}
              <TabsContent value="equipe" className="mt-0">
                <Card className="border-gray-100">
                  <CardContent className="p-5">
                    {equipe.length === 0 ? (
                      <div className="text-center py-12">
                        <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                        <p className="font-medium text-gray-800">Nenhum membro na equipe</p>
                        <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                          Quem se cadastra pelo convite da clínica aparece aqui. Ainda não há
                          ninguém além de você vinculado a esta clínica.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                                <th className="text-left font-medium px-3 py-2">Pessoa</th>
                                <th className="text-left font-medium px-3 py-2">Situação</th>
                                <th className="text-left font-medium px-3 py-2 w-56">Papel</th>
                              </tr>
                            </thead>
                            <tbody>
                              {equipe.map((m) => {
                                const ultimoAdmin = m.papel === "admin" && totalAdmins === 1;
                                const bloqueado = !podeEditar || ultimoAdmin;
                                return (
                                  <tr key={m.id} className="border-b border-border/50 hover:bg-muted/40">
                                    <td className="px-3 py-3">
                                      <p className="font-medium text-gray-900">{m.nome}</p>
                                      <p className="text-xs text-gray-500">{m.email ?? "sem e-mail"}</p>
                                      {(m.especialidade || m.registro) && (
                                        <p className="text-[11px] text-gray-400 mt-0.5">
                                          {[m.especialidade, m.registro].filter(Boolean).join(" · ")}
                                        </p>
                                      )}
                                    </td>
                                    <td className="px-3 py-3">
                                      <Badge
                                        className={
                                          STATUS_MEMBRO_CLASSE[m.status] ?? "bg-gray-100 text-gray-600 border-0"
                                        }
                                      >
                                        {STATUS_MEMBRO_LABEL[m.status] ?? m.status}
                                      </Badge>
                                    </td>
                                    <td className="px-3 py-3">
                                      {bloqueado ? (
                                        <div>
                                          <Badge className={PAPEL_CLASSE[m.papel]}>
                                            {PAPEL_LABEL[m.papel]}
                                          </Badge>
                                          {ultimoAdmin && podeEditar && (
                                            <p className="text-[11px] text-gray-400 mt-1">
                                              Único administrador — a clínica ficaria sem quem
                                              administra.
                                            </p>
                                          )}
                                        </div>
                                      ) : (
                                        <Select
                                          value={m.papel}
                                          onValueChange={(v) => pedirTrocaPapel(m, v as Papel)}
                                          disabled={salvando}
                                        >
                                          <SelectTrigger className="h-9">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {PAPEIS.map((p) => (
                                              <SelectItem key={p} value={p}>
                                                <span className="font-medium">{PAPEL_LABEL[p]}</span>
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="mt-5 grid gap-2 sm:grid-cols-3">
                          {PAPEIS.map((p) => (
                            <div key={p} className="rounded-md border border-gray-100 p-3">
                              <Badge className={PAPEL_CLASSE[p]}>{PAPEL_LABEL[p]}</Badge>
                              <p className="text-xs text-gray-500 mt-2">{PAPEL_DESCRICAO[p]}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </main>

      {/* ------------------------------------------------------------ diálogos */}
      <Dialog open={dialogoNovo} onOpenChange={setDialogoNovo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo perfil</DialogTitle>
            <DialogDescription>
              O perfil nasce sem nenhuma permissão. Você marca o que ele pode acessar logo depois.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="novo-perfil">Nome</Label>
            <Input
              id="novo-perfil"
              value={nomeNovo}
              onChange={(e) => setNomeNovo(e.target.value)}
              placeholder="Ex.: Coordenação clínica"
              onKeyDown={(e) => { if (e.key === "Enter") criar(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoNovo(false)}>Cancelar</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 gap-2"
              onClick={criar}
              disabled={salvando || !nomeNovo.trim()}
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Criar perfil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(confirmarExclusao)}
        onOpenChange={(aberto) => { if (!aberto) setConfirmarExclusao(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{confirmarExclusao?.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>
              O perfil some da lista e não pode ser recuperado. Quem estiver usando este perfil
              como referência precisará ser reassociado a outro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={excluir}>
              Excluir perfil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmarRestauro} onOpenChange={setConfirmarRestauro}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar perfis padrão?</AlertDialogTitle>
            <AlertDialogDescription>
              Recria os perfis Administrador, Dentista, Recepção e Auxiliar que estiverem faltando.
              Perfis que já existem <strong>não são sobrescritos</strong> — suas permissões
              atuais permanecem exatamente como estão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-emerald-600 hover:bg-emerald-700" onClick={restaurar}>
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(confirmarPapel)}
        onOpenChange={(aberto) => { if (!aberto) setConfirmarPapel(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirar seu próprio acesso de administrador?</AlertDialogTitle>
            <AlertDialogDescription>
              Você passará a ser {confirmarPapel ? PAPEL_LABEL[confirmarPapel.papel] : ""} e perderá
              o acesso a esta tela, ao financeiro e às configurações da clínica. Só outro
              administrador poderá devolver o seu acesso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter administrador</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => confirmarPapel && aplicarPapel(confirmarPapel.membro, confirmarPapel.papel)}
            >
              Sim, alterar meu papel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Permissoes;
