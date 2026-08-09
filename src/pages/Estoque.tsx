import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Package, Loader2, Plus, ArrowDownToLine, ArrowUpFromLine, AlertTriangle,
  Pencil, Trash2, Search, History, PackageX,
} from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import {
  listarEstoque, listarMovimentos, resumirEstoque, criarProduto, atualizarProduto,
  excluirProduto, registrarMovimento, validarProduto, mensagemErro, brl, dataHoraBr,
  TIPO_MOVIMENTO_LABEL, TIPO_MOVIMENTO_CLASSE, UNIDADES,
  type ItemEstoque, type Movimento, type TipoMovimento, type ProdutoInput,
} from "@/services/estoque";

// ============================================================================
// Estoque — o que tem, o que está acabando, e por onde saiu
// ----------------------------------------------------------------------------
// O saldo desta tela NÃO é editável direto: ele é consequência dos movimentos.
// Quem quiser "corrigir" um número lança um ajuste, que fica no histórico com
// motivo. É a diferença entre um inventário auditável e uma planilha que
// alguém sobrescreveu na sexta-feira.
// ============================================================================

const PRODUTO_VAZIO: ProdutoInput = {
  nome: "", sku: "", categoria: "", unidade: "un", estoqueMinimo: 0, custoMedio: null, ativo: true,
};

interface FormMovimento {
  produtoId: string;
  tipo: TipoMovimento;
  quantidade: string;
  custoUnitario: string;
  motivo: string;
}

const MOVIMENTO_VAZIO: FormMovimento = {
  produtoId: "", tipo: "entrada", quantidade: "", custoUnitario: "", motivo: "",
};

const qtd = (v: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v);

const Estoque = () => {
  const { clinicaId, carregando: carregandoCtx } = useTenant();

  const [itens, setItens] = useState<ItemEstoque[]>([]);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [busca, setBusca] = useState("");
  const [fCategoria, setFCategoria] = useState("todas");
  const [soAbaixoMinimo, setSoAbaixoMinimo] = useState(false);
  const [fTipoMov, setFTipoMov] = useState("todos");

  const [dialogProduto, setDialogProduto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formProduto, setFormProduto] = useState<ProdutoInput>(PRODUTO_VAZIO);

  const [dialogMovimento, setDialogMovimento] = useState(false);
  const [formMovimento, setFormMovimento] = useState<FormMovimento>(MOVIMENTO_VAZIO);

  const [excluindo, setExcluindo] = useState<ItemEstoque | null>(null);

  const semClinica = !carregandoCtx && !clinicaId;

  const carregar = useCallback(async () => {
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; }
    setCarregando(true);
    try {
      const [lista, movs] = await Promise.all([
        listarEstoque(clinicaId),
        listarMovimentos(clinicaId, { limite: 300 }),
      ]);
      setItens(lista);
      setMovimentos(movs);
    } catch (e) {
      toast.error("Erro ao carregar o estoque", { description: mensagemErro(e) });
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, carregandoCtx]);

  useEffect(() => { carregar(); }, [carregar]);

  const resumo = useMemo(() => resumirEstoque(itens), [itens]);

  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const i of itens) if (i.categoria?.trim()) set.add(i.categoria.trim());
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [itens]);

  const itensFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return itens.filter((i) => {
      if (soAbaixoMinimo && !i.abaixoDoMinimo) return false;
      if (fCategoria !== "todas" && (i.categoria?.trim() ?? "") !== fCategoria) return false;
      if (!termo) return true;
      return (
        i.nome.toLowerCase().includes(termo) ||
        (i.sku ?? "").toLowerCase().includes(termo) ||
        (i.categoria ?? "").toLowerCase().includes(termo)
      );
    });
  }, [itens, busca, fCategoria, soAbaixoMinimo]);

  const movimentosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return movimentos.filter((m) => {
      if (fTipoMov !== "todos" && m.tipo !== fTipoMov) return false;
      if (!termo) return true;
      return (
        m.produto.toLowerCase().includes(termo) ||
        (m.motivo ?? "").toLowerCase().includes(termo)
      );
    });
  }, [movimentos, busca, fTipoMov]);

  const temFiltroProduto = Boolean(busca.trim()) || fCategoria !== "todas" || soAbaixoMinimo;
  const temFiltroMov = Boolean(busca.trim()) || fTipoMov !== "todos";

  // ---------------------------------------------------------------- produto

  const abrirNovoProduto = () => {
    setEditandoId(null);
    setFormProduto(PRODUTO_VAZIO);
    setDialogProduto(true);
  };

  const abrirEdicao = (i: ItemEstoque) => {
    setEditandoId(i.id);
    setFormProduto({
      nome: i.nome,
      sku: i.sku ?? "",
      categoria: i.categoria ?? "",
      unidade: i.unidade,
      estoqueMinimo: i.estoqueMinimo,
      custoMedio: i.custoMedio,
      ativo: i.ativo,
    });
    setDialogProduto(true);
  };

  const salvarProduto = async () => {
    if (!clinicaId) return;
    const erro = validarProduto(formProduto);
    if (erro) { toast.error(erro); return; }
    setSalvando(true);
    try {
      if (editandoId) {
        await atualizarProduto(clinicaId, editandoId, formProduto);
        toast.success("Produto atualizado");
      } else {
        await criarProduto(clinicaId, formProduto);
        toast.success("Produto cadastrado", {
          description: "Lance uma entrada para o saldo sair do zero.",
        });
      }
      setDialogProduto(false);
      await carregar();
    } catch (e) {
      toast.error("Não foi possível salvar", { description: mensagemErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!clinicaId || !excluindo) return;
    setSalvando(true);
    try {
      await excluirProduto(clinicaId, excluindo.id);
      toast.success("Produto excluído");
      setExcluindo(null);
      await carregar();
    } catch (e) {
      toast.error("Não foi possível excluir", { description: mensagemErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  // -------------------------------------------------------------- movimento

  const abrirMovimento = (tipo: TipoMovimento, produtoId = "") => {
    setFormMovimento({ ...MOVIMENTO_VAZIO, tipo, produtoId });
    setDialogMovimento(true);
  };

  const produtoDoForm = itens.find((i) => i.id === formMovimento.produtoId) ?? null;

  const salvarMovimento = async () => {
    if (!clinicaId) return;
    if (!formMovimento.produtoId) { toast.error("Selecione o produto."); return; }
    const quantidade = Number(formMovimento.quantidade.replace(",", "."));
    if (!Number.isFinite(quantidade) || quantidade === 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }
    const custo = formMovimento.custoUnitario.trim()
      ? Number(formMovimento.custoUnitario.replace(",", "."))
      : null;
    if (custo !== null && (!Number.isFinite(custo) || custo < 0)) {
      toast.error("Custo unitário inválido.");
      return;
    }
    setSalvando(true);
    try {
      const saldo = await registrarMovimento(clinicaId, {
        produtoId: formMovimento.produtoId,
        tipo: formMovimento.tipo,
        quantidade,
        custoUnitario: custo,
        motivo: formMovimento.motivo,
      });
      toast.success(`${TIPO_MOVIMENTO_LABEL[formMovimento.tipo]} registrada`, {
        description: `Saldo atual: ${qtd(saldo)} ${produtoDoForm?.unidade ?? ""}`.trim(),
      });
      setDialogMovimento(false);
      await carregar();
    } catch (e) {
      toast.error("Não foi possível registrar", { description: mensagemErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  // ------------------------------------------------------------------ render

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-4 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Package className="h-6 w-6 text-brand-600" /> Estoque
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                Saldo por produto, alerta de mínimo e o histórico de tudo que entrou e saiu.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* sem clínica no perfil não há o que lançar: o dialog abriria e o
                  salvar abortaria em silêncio no `if (!clinicaId) return` */}
              <Button
                variant="outline" className="gap-2"
                onClick={() => abrirMovimento("saida")}
                disabled={semClinica}
              >
                <ArrowUpFromLine className="h-4 w-4" /> Nova saída
              </Button>
              <Button
                className="bg-brand-600 hover:bg-brand-700 gap-2"
                onClick={() => abrirMovimento("entrada")}
                disabled={semClinica}
              >
                <ArrowDownToLine className="h-4 w-4" /> Nova entrada
              </Button>
            </div>
          </div>

          {semClinica ? (
            <Card className="border-gray-100">
              <CardContent className="p-12 text-center">
                <PackageX className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                <p className="font-medium text-gray-800">Nenhuma clínica no seu perfil</p>
                <p className="text-sm text-gray-500 mt-1">
                  Conclua o cadastro da clínica para usar o controle de estoque.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <Card className="border-gray-100">
                  <CardContent className="p-5">
                    <p className="text-xs text-gray-500">Produtos cadastrados</p>
                    <p className="text-xl font-bold">{resumo.produtos}</p>
                    <p className="text-[11px] text-gray-400">
                      {itens.filter((i) => !i.ativo).length} inativo(s)
                    </p>
                  </CardContent>
                </Card>
                <Card className={resumo.abaixoDoMinimo > 0 ? "border-red-200 bg-red-50/40" : "border-gray-100"}>
                  <CardContent className="p-5">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      {resumo.abaixoDoMinimo > 0 && <AlertTriangle className="h-3 w-3 text-red-600" />}
                      Itens abaixo do mínimo
                    </p>
                    <p className={`text-xl font-bold ${resumo.abaixoDoMinimo > 0 ? "text-red-700" : ""}`}>
                      {resumo.abaixoDoMinimo}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {resumo.abaixoDoMinimo > 0 ? "Precisam de reposição" : "Tudo dentro do mínimo"}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-gray-100">
                  <CardContent className="p-5">
                    <p className="text-xs text-gray-500">Valor total em estoque</p>
                    <p className="text-xl font-bold">{brl(resumo.valorTotal)}</p>
                    <p className="text-[11px] text-gray-400">
                      {resumo.semCusto > 0
                        ? `${resumo.semCusto} produto(s) sem custo cadastrado ficam de fora`
                        : "Saldo × custo médio de cada produto"}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Tabs defaultValue="estoque">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <TabsList>
                    <TabsTrigger value="estoque">Em estoque</TabsTrigger>
                    <TabsTrigger value="movimentos">Histórico de movimentos</TabsTrigger>
                  </TabsList>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      className="pl-9"
                      placeholder="Buscar produto, SKU ou motivo…"
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                    />
                  </div>
                </div>

                {/* --------------------------------------------- aba estoque */}
                <TabsContent value="estoque" className="mt-0">
                  <Card className="border-gray-100">
                    <CardContent className="p-5">
                      <div className="flex flex-wrap items-center gap-3 mb-4">
                        <Select value={fCategoria} onValueChange={setFCategoria}>
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todas">Todas as categorias</SelectItem>
                            {categorias.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <label className="flex items-center gap-2 text-sm text-gray-600">
                          <Switch checked={soAbaixoMinimo} onCheckedChange={setSoAbaixoMinimo} />
                          Só abaixo do mínimo
                        </label>
                        <Button
                          variant="outline"
                          className="gap-2 ml-auto"
                          onClick={abrirNovoProduto}
                        >
                          <Plus className="h-4 w-4" /> Novo produto
                        </Button>
                      </div>

                      {carregando ? (
                        <div className="p-12 flex justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : itensFiltrados.length === 0 ? (
                        <div className="p-12 text-center">
                          <Package className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                          <p className="font-medium text-gray-800">
                            {temFiltroProduto
                              ? "Nenhum produto com esse filtro"
                              : "Nenhum produto cadastrado ainda"}
                          </p>
                          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                            {temFiltroProduto
                              ? "Ajuste a busca, a categoria ou desligue o filtro de mínimo."
                              : "Cadastre os insumos que a clínica consome (anestésico, luva, resina…) e depois lance a primeira entrada para o saldo começar a existir."}
                          </p>
                          {!temFiltroProduto && (
                            <Button
                              className="bg-brand-600 hover:bg-brand-700 gap-2 mt-4"
                              onClick={abrirNovoProduto}
                            >
                              <Plus className="h-4 w-4" /> Cadastrar produto
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                              <tr>
                                <th className="text-left font-medium px-3 py-2">Produto</th>
                                <th className="text-left font-medium px-3 py-2">Categoria</th>
                                <th className="text-right font-medium px-3 py-2">Saldo</th>
                                <th className="text-right font-medium px-3 py-2">Mínimo</th>
                                <th className="text-right font-medium px-3 py-2">Custo médio</th>
                                <th className="text-right font-medium px-3 py-2">Valor</th>
                                <th className="text-left font-medium px-3 py-2">Últ. movimento</th>
                                <th className="px-3 py-2" />
                              </tr>
                            </thead>
                            <tbody>
                              {itensFiltrados.map((i) => (
                                <tr
                                  key={i.id}
                                  className={`border-b border-border/50 hover:bg-muted/40 ${
                                    i.abaixoDoMinimo ? "bg-red-50/50" : ""
                                  }`}
                                >
                                  <td className="px-3 py-2.5">
                                    <div className="flex items-center gap-2">
                                      {i.abaixoDoMinimo && (
                                        <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                                      )}
                                      <div>
                                        <p className="font-medium text-gray-900">{i.nome}</p>
                                        <p className="text-[11px] text-gray-400">
                                          {i.sku ? `SKU ${i.sku} · ` : ""}{i.unidade}
                                          {!i.ativo && " · inativo"}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 text-gray-600">{i.categoria ?? "—"}</td>
                                  <td className={`px-3 py-2.5 text-right font-semibold ${
                                    i.abaixoDoMinimo ? "text-red-700" : "text-gray-900"
                                  }`}>
                                    {qtd(i.saldo)}
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-gray-500">
                                    {qtd(i.estoqueMinimo)}
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-gray-600">
                                    {i.custoMedio === null ? "—" : brl(i.custoMedio)}
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-gray-600">
                                    {i.valorEmEstoque === null ? "—" : brl(i.valorEmEstoque)}
                                  </td>
                                  <td className="px-3 py-2.5 text-gray-500">
                                    {i.ultimaMovimentacao ? dataHoraBr(i.ultimaMovimentacao) : "Nunca"}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <div className="flex items-center justify-end gap-1">
                                      <Button
                                        size="icon" variant="ghost" className="h-8 w-8"
                                        title="Entrada"
                                        onClick={() => abrirMovimento("entrada", i.id)}
                                      >
                                        <ArrowDownToLine className="h-4 w-4 text-brand-600" />
                                      </Button>
                                      <Button
                                        size="icon" variant="ghost" className="h-8 w-8"
                                        title="Saída"
                                        onClick={() => abrirMovimento("saida", i.id)}
                                      >
                                        <ArrowUpFromLine className="h-4 w-4 text-sky-600" />
                                      </Button>
                                      <Button
                                        size="icon" variant="ghost" className="h-8 w-8"
                                        title="Editar produto"
                                        onClick={() => abrirEdicao(i)}
                                      >
                                        <Pencil className="h-4 w-4 text-gray-500" />
                                      </Button>
                                      <Button
                                        size="icon" variant="ghost" className="h-8 w-8"
                                        title="Excluir produto"
                                        onClick={() => setExcluindo(i)}
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
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ------------------------------------------ aba movimentos */}
                <TabsContent value="movimentos" className="mt-0">
                  <Card className="border-gray-100">
                    <CardContent className="p-5">
                      <div className="flex flex-wrap items-center gap-3 mb-4">
                        <Select value={fTipoMov} onValueChange={setFTipoMov}>
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">Todos os tipos</SelectItem>
                            {(Object.keys(TIPO_MOVIMENTO_LABEL) as TipoMovimento[]).map((t) => (
                              <SelectItem key={t} value={t}>{TIPO_MOVIMENTO_LABEL[t]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-400 ml-auto">
                          Mostrando os 300 movimentos mais recentes
                        </p>
                      </div>

                      {carregando ? (
                        <div className="p-12 flex justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : movimentosFiltrados.length === 0 ? (
                        <div className="p-12 text-center">
                          <History className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                          <p className="font-medium text-gray-800">
                            {temFiltroMov ? "Nenhum movimento com esse filtro" : "Nenhum movimento registrado"}
                          </p>
                          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                            {temFiltroMov
                              ? "Troque o tipo ou limpe a busca."
                              : "Toda entrada, saída, perda ou ajuste aparece aqui com data, quantidade e motivo."}
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                              <tr>
                                <th className="text-left font-medium px-3 py-2">Quando</th>
                                <th className="text-left font-medium px-3 py-2">Produto</th>
                                <th className="text-left font-medium px-3 py-2">Tipo</th>
                                <th className="text-right font-medium px-3 py-2">Qtd.</th>
                                <th className="text-right font-medium px-3 py-2">Custo unit.</th>
                                <th className="text-left font-medium px-3 py-2">Motivo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {movimentosFiltrados.map((m) => (
                                <tr key={m.id} className="border-b border-border/50 hover:bg-muted/40">
                                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                                    {dataHoraBr(m.criadoEm)}
                                  </td>
                                  <td className="px-3 py-2.5 font-medium text-gray-900">{m.produto}</td>
                                  <td className="px-3 py-2.5">
                                    <Badge className={TIPO_MOVIMENTO_CLASSE[m.tipo]}>
                                      {TIPO_MOVIMENTO_LABEL[m.tipo]}
                                    </Badge>
                                  </td>
                                  <td className={`px-3 py-2.5 text-right font-semibold ${
                                    m.delta >= 0 ? "text-brand-700" : "text-rose-700"
                                  }`}>
                                    {m.delta >= 0 ? "+" : "−"}{qtd(Math.abs(m.delta))} {m.unidade}
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-gray-600">
                                    {m.custoUnitario === null ? "—" : brl(m.custoUnitario)}
                                  </td>
                                  <td className="px-3 py-2.5 text-gray-600">{m.motivo ?? "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </main>

      {/* ------------------------------------------------ dialog de produto */}
      <Dialog open={dialogProduto} onOpenChange={setDialogProduto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editandoId ? "Editar produto" : "Novo produto"}</DialogTitle>
            <DialogDescription>
              O saldo não é editado aqui — ele vem dos movimentos de entrada e saída.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="p-nome">Nome *</Label>
              <Input
                id="p-nome"
                value={formProduto.nome}
                onChange={(e) => setFormProduto({ ...formProduto, nome: e.target.value })}
                placeholder="Ex.: Anestésico Mepivacaína 3%"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="p-sku">SKU / código</Label>
                <Input
                  id="p-sku"
                  value={formProduto.sku ?? ""}
                  onChange={(e) => setFormProduto({ ...formProduto, sku: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="p-cat">Categoria</Label>
                <Input
                  id="p-cat"
                  list="categorias-existentes"
                  value={formProduto.categoria ?? ""}
                  onChange={(e) => setFormProduto({ ...formProduto, categoria: e.target.value })}
                  placeholder="Ex.: Anestésicos"
                />
                <datalist id="categorias-existentes">
                  {categorias.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="p-un">Unidade *</Label>
                <Select
                  value={formProduto.unidade}
                  onValueChange={(v) => setFormProduto({ ...formProduto, unidade: v })}
                >
                  <SelectTrigger id="p-un"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIDADES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="p-min">Estoque mínimo</Label>
                <Input
                  id="p-min" type="number" min={0} step="any"
                  value={formProduto.estoqueMinimo}
                  onChange={(e) =>
                    setFormProduto({ ...formProduto, estoqueMinimo: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="p-custo">Custo médio (R$)</Label>
                <Input
                  id="p-custo" type="number" min={0} step="0.01"
                  value={formProduto.custoMedio ?? ""}
                  onChange={(e) =>
                    setFormProduto({
                      ...formProduto,
                      custoMedio: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  placeholder="Opcional"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <Switch
                checked={formProduto.ativo ?? true}
                onCheckedChange={(v) => setFormProduto({ ...formProduto, ativo: v })}
              />
              Produto ativo
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogProduto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              className="bg-brand-600 hover:bg-brand-700 gap-2"
              onClick={salvarProduto}
              disabled={salvando}
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              {editandoId ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------- dialog de movimento */}
      <Dialog open={dialogMovimento} onOpenChange={setDialogMovimento}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar movimento</DialogTitle>
            <DialogDescription>
              Entrada soma no saldo, saída e perda subtraem. Ajuste aceita valor negativo para
              corrigir contagem.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-1">
            <div className="grid gap-1.5">
              <Label>Produto *</Label>
              <Select
                value={formMovimento.produtoId}
                onValueChange={(v) => setFormMovimento({ ...formMovimento, produtoId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={itens.length ? "Selecione" : "Nenhum produto cadastrado"} />
                </SelectTrigger>
                <SelectContent>
                  {itens.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.nome} — saldo {qtd(i.saldo)} {i.unidade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {itens.length === 0 && (
                <p className="text-xs text-gray-500">
                  Cadastre um produto antes de lançar movimento.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Tipo *</Label>
                <Select
                  value={formMovimento.tipo}
                  onValueChange={(v) => setFormMovimento({ ...formMovimento, tipo: v as TipoMovimento })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIPO_MOVIMENTO_LABEL) as TipoMovimento[]).map((t) => (
                      <SelectItem key={t} value={t}>{TIPO_MOVIMENTO_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="m-qtd">
                  Quantidade * {produtoDoForm ? `(${produtoDoForm.unidade})` : ""}
                </Label>
                <Input
                  id="m-qtd" type="number" step="any"
                  value={formMovimento.quantidade}
                  onChange={(e) => setFormMovimento({ ...formMovimento, quantidade: e.target.value })}
                  placeholder={formMovimento.tipo === "ajuste" ? "Ex.: -3 ou 5" : "Ex.: 10"}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="m-custo">Custo unitário (R$)</Label>
                <Input
                  id="m-custo" type="number" min={0} step="0.01"
                  value={formMovimento.custoUnitario}
                  onChange={(e) => setFormMovimento({ ...formMovimento, custoUnitario: e.target.value })}
                  placeholder="Opcional"
                />
                {formMovimento.tipo === "entrada" && (
                  <p className="text-[11px] text-gray-400">
                    Informado, recalcula o custo médio ponderado do produto.
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="m-motivo">Motivo</Label>
                <Input
                  id="m-motivo"
                  value={formMovimento.motivo}
                  onChange={(e) => setFormMovimento({ ...formMovimento, motivo: e.target.value })}
                  placeholder="Ex.: compra, uso em atendimento…"
                />
              </div>
            </div>

            {produtoDoForm && (
              <p className="text-xs text-gray-500 bg-muted/40 rounded-md px-3 py-2">
                Saldo atual de <span className="font-medium">{produtoDoForm.nome}</span>:{" "}
                {qtd(produtoDoForm.saldo)} {produtoDoForm.unidade}
                {produtoDoForm.abaixoDoMinimo && " — abaixo do mínimo"}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMovimento(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              className="bg-brand-600 hover:bg-brand-700 gap-2"
              onClick={salvarMovimento}
              disabled={salvando || itens.length === 0}
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------------- exclusão */}
      <AlertDialog open={Boolean(excluindo)} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{excluindo?.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Todo o histórico de movimentos deste produto será apagado junto e não há desfazer.
              Se a intenção é só tirar de circulação, edite o produto e desmarque “ativo”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => { e.preventDefault(); confirmarExclusao(); }}
              disabled={salvando}
            >
              Excluir mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Estoque;
