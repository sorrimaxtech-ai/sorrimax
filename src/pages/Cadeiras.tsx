import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Armchair, Plus, Search, Loader2, Pencil, Trash2, ShieldCheck, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import {
  COR_PADRAO_CADEIRA, PALETA_CADEIRAS, REGEX_COR_HEX,
  alternarAtivoCadeira, atualizarCadeira, contarConsultasDaCadeira, criarCadeira,
  excluirCadeira, listarCadeiras, traduzirErro, validarCadeira,
  type Cadeira, type DadosCadeira,
} from "@/services/disponibilidade";

const FORM_VAZIO: DadosCadeira = {
  nome: "",
  cor: COR_PADRAO_CADEIRA,
  observacoes: "",
  ativo: true,
};

const Cadeiras = () => {
  const { clinicaId, carregando: carregandoCtx } = useTenant();

  const [cadeiras, setCadeiras] = useState<Cadeira[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [mostrarInativas, setMostrarInativas] = useState(true);

  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<Cadeira | null>(null);
  const [form, setForm] = useState<DadosCadeira>(FORM_VAZIO);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  const [aExcluir, setAExcluir] = useState<Cadeira | null>(null);
  const [consultasVinculadas, setConsultasVinculadas] = useState<number | null>(null);
  const [erroContagem, setErroContagem] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  // ------------------------------------------------------------------ carga
  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    try {
      setCadeiras(await listarCadeiras(clinicaId));
    } catch (e) {
      toast.error("Erro ao carregar cadeiras", { description: traduzirErro(e, "Tente novamente.") });
    }
  }, [clinicaId]);

  useEffect(() => {
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; } // evita spinner eterno
    let vivo = true;
    setCarregando(true);
    (async () => {
      try {
        const lista = await listarCadeiras(clinicaId);
        if (!vivo) return;
        setCadeiras(lista);
      } catch (e) {
        if (!vivo) return;
        toast.error("Erro ao carregar cadeiras", { description: traduzirErro(e, "Tente novamente.") });
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [clinicaId, carregandoCtx]);

  // ------------------------------------------------------------------ derivados
  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return cadeiras.filter((c) => {
      if (!mostrarInativas && !c.ativo) return false;
      if (!termo) return true;
      return (
        c.nome.toLowerCase().includes(termo) ||
        (c.observacoes ?? "").toLowerCase().includes(termo)
      );
    });
  }, [cadeiras, busca, mostrarInativas]);

  const totalAtivas = useMemo(() => cadeiras.filter((c) => c.ativo).length, [cadeiras]);

  // ------------------------------------------------------------------ ações
  const abrirNova = () => {
    setEditando(null);
    setForm(FORM_VAZIO);
    setErros({});
    setDialogAberto(true);
  };

  const abrirEdicao = (c: Cadeira) => {
    setEditando(c);
    setForm({
      nome: c.nome,
      cor: c.cor ?? COR_PADRAO_CADEIRA,
      observacoes: c.observacoes ?? "",
      ativo: c.ativo,
    });
    setErros({});
    setDialogAberto(true);
  };

  const salvar = async () => {
    if (!clinicaId) return;
    const e = validarCadeira(form);
    setErros(e);
    if (Object.keys(e).length) return;

    setSalvando(true);
    try {
      if (editando) {
        await atualizarCadeira(clinicaId, editando.id, form);
        toast.success("Cadeira atualizada");
      } else {
        await criarCadeira(clinicaId, form);
        toast.success("Cadeira criada");
      }
      setDialogAberto(false);
      await carregar();
    } catch (err) {
      toast.error("Não foi possível salvar", { description: traduzirErro(err, "Tente novamente.") });
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtivo = async (c: Cadeira, ativo: boolean) => {
    if (!clinicaId) return;
    // otimista: a linha responde na hora e volta atrás se o banco recusar
    setCadeiras((lista) => lista.map((x) => (x.id === c.id ? { ...x, ativo } : x)));
    try {
      await alternarAtivoCadeira(clinicaId, c.id, ativo);
    } catch (err) {
      setCadeiras((lista) => lista.map((x) => (x.id === c.id ? { ...x, ativo: c.ativo } : x)));
      toast.error("Não foi possível alterar o status", {
        description: traduzirErro(err, "Tente novamente."),
      });
    }
  };

  const pedirExclusao = async (c: Cadeira) => {
    setAExcluir(c);
    setConsultasVinculadas(null);
    setErroContagem(false);
    if (!clinicaId) { setErroContagem(true); return; }
    try {
      setConsultasVinculadas(await contarConsultasDaCadeira(clinicaId, c.id));
    } catch {
      // A contagem é informativa: falhar nela não bloqueia a decisão, mas o
      // diálogo NÃO pode ficar preso em "Verificando..." — o usuário precisa
      // saber que a informação não veio antes de confirmar a exclusão.
      setErroContagem(true);
    }
  };

  const confirmarExclusao = async () => {
    if (!aExcluir || !clinicaId) return;
    setExcluindo(true);
    try {
      await excluirCadeira(clinicaId, aExcluir.id);
      toast.success("Cadeira excluída");
      setAExcluir(null);
      await carregar();
    } catch (err) {
      toast.error("Não foi possível excluir", { description: traduzirErro(err, "Tente novamente.") });
    } finally {
      setExcluindo(false);
    }
  };

  // ------------------------------------------------------------------ render
  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-4 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Armchair className="h-6 w-6 text-brand-600" /> Cadeiras
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                Cada cadeira é um lugar físico de atendimento. A agenda usa essa lista para saber
                onde a consulta cabe.
              </p>
            </div>
            <Button className="bg-brand-600 hover:bg-brand-700 gap-2" onClick={abrirNova}>
              <Plus className="h-4 w-4" /> Nova cadeira
            </Button>
          </div>

          {/* A regra abaixo é do banco, não da tela — o usuário precisa saber que é garantida. */}
          <Card className="border-gray-100 mb-6">
            <CardContent className="p-5 flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-brand-600 shrink-0 mt-0.5" />
              <div className="text-sm text-gray-600">
                <p className="font-medium text-gray-900 mb-1">Cadeira não aceita duas consultas no mesmo horário</p>
                <p>
                  Se alguém tentar marcar dois pacientes na mesma cadeira em horários que se
                  encostam, o sistema recusa automaticamente — mesmo que os agendamentos venham do
                  site, de outra aba ou de dois atendentes ao mesmo tempo. A proteção é garantida,
                  não depende de ninguém lembrar de conferir.
                </p>
                <p className="mt-1">
                  Consultas canceladas, desmarcadas ou com falta liberam a cadeira automaticamente.
                  Consulta sem cadeira definida não ocupa nenhuma.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <Card className="border-gray-100">
              <CardContent className="p-5">
                <p className="text-xs text-gray-500">Cadeiras cadastradas</p>
                <p className="text-xl font-bold">{cadeiras.length}</p>
              </CardContent>
            </Card>
            <Card className="border-gray-100">
              <CardContent className="p-5">
                <p className="text-xs text-gray-500">Disponíveis na agenda</p>
                <p className="text-xl font-bold text-brand-600">{totalAtivas}</p>
                <p className="text-[11px] text-gray-400">apenas as ativas aparecem no agendamento</p>
              </CardContent>
            </Card>
            <Card className="border-gray-100 col-span-2 sm:col-span-1">
              <CardContent className="p-5">
                <p className="text-xs text-gray-500">Inativas</p>
                <p className="text-xl font-bold text-gray-500">{cadeiras.length - totalAtivas}</p>
                <p className="text-[11px] text-gray-400">mantêm o histórico das consultas antigas</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-gray-100">
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por nome ou observação..."
                    className="pl-9"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600 shrink-0 cursor-pointer">
                  <Switch checked={mostrarInativas} onCheckedChange={setMostrarInativas} />
                  Mostrar inativas
                </label>
              </div>

              {carregando ? (
                <div className="flex justify-center p-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !clinicaId ? (
                <div className="text-center p-12">
                  <Armchair className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="font-medium text-gray-800">Clínica não identificada</p>
                  <p className="text-sm text-gray-500">
                    Entre novamente na sua conta para carregar as cadeiras.
                  </p>
                </div>
              ) : cadeiras.length === 0 ? (
                <div className="text-center p-12">
                  <Armchair className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="font-medium text-gray-800">Nenhuma cadeira cadastrada</p>
                  <p className="text-sm text-gray-500 max-w-md mx-auto">
                    Cadastre as salas ou cadeiras da clínica para poder escolher onde cada consulta
                    acontece e deixar a agenda impedir dois pacientes no mesmo lugar e horário.
                  </p>
                  <Button className="bg-brand-600 hover:bg-brand-700 gap-2 mt-4" onClick={abrirNova}>
                    <Plus className="h-4 w-4" /> Cadastrar a primeira cadeira
                  </Button>
                </div>
              ) : filtradas.length === 0 ? (
                <div className="text-center p-12">
                  <Search className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="font-medium text-gray-800">Nenhuma cadeira encontrada</p>
                  <p className="text-sm text-gray-500">Ajuste a busca ou mostre também as inativas.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="text-left font-medium px-3 py-2">Cadeira</th>
                        <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Observações</th>
                        <th className="text-left font-medium px-3 py-2">Status</th>
                        <th className="text-right font-medium px-3 py-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtradas.map((c) => (
                        <tr key={c.id} className="border-b border-border/50 hover:bg-muted/40">
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2.5">
                              <span
                                className="h-4 w-4 rounded-full border border-black/10 shrink-0"
                                style={{ backgroundColor: c.cor ?? "#e5e7eb" }}
                                aria-hidden
                              />
                              <div>
                                <p className="font-medium text-gray-900">{c.nome}</p>
                                <p className="text-[11px] text-gray-400 md:hidden">
                                  {c.observacoes || "sem observações"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-gray-600 hidden md:table-cell max-w-sm">
                            {c.observacoes || <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={c.ativo}
                                onCheckedChange={(v) => alternarAtivo(c, v === true)}
                                aria-label={`Ativar cadeira ${c.nome}`}
                              />
                              <Badge
                                className={c.ativo
                                  ? "bg-brand-100 text-brand-800 border-0"
                                  : "bg-gray-100 text-gray-600 border-0"}
                              >
                                {c.ativo ? "Ativa" : "Inativa"}
                              </Badge>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => abrirEdicao(c)}
                                aria-label={`Editar ${c.nome}`}
                              >
                                <Pencil className="h-4 w-4 text-gray-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => pedirExclusao(c)}
                                aria-label={`Excluir ${c.nome}`}
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
        </div>
      </main>

      {/* ------------------------------------------------------ formulário */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar cadeira" : "Nova cadeira"}</DialogTitle>
            <DialogDescription>
              O nome precisa ser único na clínica. A cor identifica a cadeira na grade da agenda.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Ex.: Consultório 1"
                maxLength={80}
              />
              {erros.nome && <p className="text-xs text-red-600 mt-1">{erros.nome}</p>}
            </div>

            <div>
              <Label htmlFor="cor">Cor</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="cor"
                  type="color"
                  value={REGEX_COR_HEX.test(form.cor ?? "") ? (form.cor as string) : COR_PADRAO_CADEIRA}
                  onChange={(e) => setForm((f) => ({ ...f, cor: e.target.value }))}
                  className="h-10 w-14 p-1 cursor-pointer"
                />
                <Input
                  value={form.cor ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, cor: e.target.value }))}
                  className="font-mono text-xs"
                  maxLength={7}
                  placeholder="#00b4d8"
                />
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {PALETA_CADEIRAS.map((cor) => (
                  <button
                    key={cor}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, cor }))}
                    className="h-6 w-6 rounded-full border border-black/10 hover:scale-110 transition-transform"
                    style={{ backgroundColor: cor }}
                    aria-label={`Usar cor ${cor}`}
                  />
                ))}
              </div>
              {erros.cor && <p className="text-xs text-red-600 mt-1">{erros.cor}</p>}
            </div>

            <div>
              <Label htmlFor="obs">Observações</Label>
              <Textarea
                id="obs"
                value={form.observacoes ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                placeholder="Ex.: equipamento de raio-x, acessível para cadeirante..."
                rows={3}
              />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="ativo">Disponível na agenda</Label>
                <p className="text-[11px] text-gray-500">
                  Desligue para tirar a cadeira do agendamento sem perder o histórico.
                </p>
              </div>
              <Switch
                id="ativo"
                checked={form.ativo}
                onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v === true }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button className="bg-brand-600 hover:bg-brand-700 gap-2" onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              {editando ? "Salvar" : "Criar cadeira"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------ exclusão */}
      <AlertDialog open={!!aExcluir} onOpenChange={(a) => !a && setAExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{aExcluir?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Esta ação não pode ser desfeita.</p>
                {erroContagem ? (
                  <p className="flex items-start gap-2 text-amber-700">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      Não foi possível verificar quantas consultas usam esta cadeira. Se ela já foi
                      usada, essas consultas ficarão sem cadeira definida.
                    </span>
                  </p>
                ) : consultasVinculadas === null ? (
                  <p className="text-gray-500">Verificando consultas vinculadas...</p>
                ) : consultasVinculadas > 0 ? (
                  <p className="flex items-start gap-2 text-amber-700">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      {consultasVinculadas} consulta(s) usam esta cadeira. Elas <strong>não</strong> serão
                      apagadas, mas ficarão sem cadeira definida — e deixarão de reservar o lugar.
                      Se quiser só tirá-la do agendamento, desative em vez de excluir.
                    </span>
                  </p>
                ) : (
                  <p className="text-gray-500">Nenhuma consulta usa esta cadeira.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmarExclusao(); }}
              disabled={excluindo}
              className="bg-red-600 hover:bg-red-700"
            >
              {excluindo ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Cadeiras;
