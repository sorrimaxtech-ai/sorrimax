import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users, Plus, Search, Loader2, MessageCircle, MoreVertical, Pencil,
  UserRoundX, UserRoundCheck, Trash2, EyeOff, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import { PacienteDialog } from "@/components/pacientes/PacienteDialog";
import {
  definirAtivo, excluirPaciente, formatarCelular, formatarCpf, idadeEmAnos,
  linkWhatsApp, listarPacientes, soDigitos, type PacienteLista,
} from "@/services/pacientes";

// ============================================================================
// Pacientes — a base de tudo
// ----------------------------------------------------------------------------
// A busca casa nome, CPF e celular só por dígitos: na recepção o telefone chega
// ditado ("onze nove...") e o CPF colado com pontuação. Comparar dígito a dígito
// evita o "não achei" que faz a atendente cadastrar o mesmo paciente duas vezes.
// ============================================================================

const Pacientes = () => {
  const navigate = useNavigate();
  const { clinicaId, carregando: carregandoCtx } = useTenant();

  const [lista, setLista] = useState<PacienteLista[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<PacienteLista | null>(null);
  const [paraExcluir, setParaExcluir] = useState<PacienteLista | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; }
    setCarregando(true);
    try {
      setLista(await listarPacientes(clinicaId));
    } catch (e: any) {
      toast.error("Erro ao carregar pacientes", { description: e.message });
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, carregandoCtx]);

  useEffect(() => { carregar(); }, [carregar]);

  const kpis = useMemo(() => {
    const ativos = lista.filter((p) => p.ativo).length;
    return { ativos, inativos: lista.length - ativos, total: lista.length };
  }, [lista]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = soDigitos(busca);
    return lista
      .filter((p) => (mostrarInativos ? true : p.ativo))
      .filter((p) => {
        if (!termo) return true;
        const nome = `${p.nome_completo} ${p.apelido ?? ""}`.toLowerCase();
        if (nome.includes(termo)) return true;
        if (!digitos) return false;
        return soDigitos(p.cpf).includes(digitos) || soDigitos(p.celular).includes(digitos);
      })
      .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo, "pt-BR"));
  }, [lista, busca, mostrarInativos]);

  const abrirWhatsApp = (p: PacienteLista) => {
    const url = linkWhatsApp(p.celular, `Olá, ${p.apelido || p.nome_completo.split(" ")[0]}!`);
    if (!url) {
      toast.error("Celular inválido", { description: "Edite o cadastro e informe o DDD." });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const alternarAtivo = async (p: PacienteLista) => {
    if (!clinicaId) return;
    try {
      await definirAtivo(clinicaId, p.id, !p.ativo);
      toast.success(p.ativo ? "Paciente inativado" : "Paciente reativado");
      carregar();
    } catch (e: any) {
      toast.error("Erro ao alterar situação", { description: e.message });
    }
  };

  const confirmarExclusao = async () => {
    if (!paraExcluir || !clinicaId) return;
    setExcluindo(true);
    try {
      await excluirPaciente(clinicaId, paraExcluir.id);
      toast.success("Paciente excluído");
      setParaExcluir(null);
      carregar();
    } catch (e: any) {
      // 23503 = FK: existe consulta/orçamento/parcela apontando para o paciente.
      const temHistorico = e?.code === "23503";
      toast.error(temHistorico ? "Paciente tem histórico vinculado" : "Erro ao excluir", {
        description: temHistorico
          ? "Há consultas, orçamentos ou débitos ligados a ele. Use Inativar para preservar o prontuário."
          : e?.message,
      });
    } finally {
      setExcluindo(false);
    }
  };

  const carregandoTudo = carregandoCtx || carregando;

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-8">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Users className="h-6 w-6 text-brand-600" /> Pacientes
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                Cadastro único por pessoa — dele saem agenda, orçamento, prontuário e cobrança.
              </p>
            </div>
            <Button
              onClick={() => { setEmEdicao(null); setDialogAberto(true); }}
              className="bg-brand-600 hover:bg-brand-700 gap-2"
            >
              <Plus className="h-4 w-4" /> Novo Paciente
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {[
              { rot: "Ativos", val: kpis.ativos, cor: "text-brand-600", sub: "em acompanhamento" },
              { rot: "Inativos", val: kpis.inativos, cor: "text-gray-500", sub: "histórico preservado" },
              { rot: "Total cadastrado", val: kpis.total, cor: "text-gray-900", sub: "base da clínica" },
            ].map((k) => (
              <Card key={k.rot} className="border-gray-100">
                <CardContent className="p-5">
                  <p className="text-xs text-gray-500">{k.rot}</p>
                  <p className={`text-xl font-bold mt-0.5 ${k.cor}`}>
                    {carregandoTudo ? "—" : k.val}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome, CPF ou celular"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <Button
              variant={mostrarInativos ? "default" : "outline"}
              onClick={() => setMostrarInativos((v) => !v)}
              className={`gap-2 ${mostrarInativos ? "bg-brand-600 hover:bg-brand-700" : ""}`}
            >
              {mostrarInativos ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {mostrarInativos ? "Mostrando inativos" : "Mostrar inativos"}
            </Button>
          </div>

          <Card className="border-gray-100">
            <CardContent className="p-0">
              {carregandoTudo ? (
                <div className="p-12 flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : visiveis.length === 0 ? (
                <div className="p-12 text-center">
                  <Users className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                  <p className="font-medium text-gray-800">
                    {lista.length === 0
                      ? "Nenhum paciente cadastrado ainda"
                      : "Nenhum paciente com esse filtro"}
                  </p>
                  <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                    {lista.length === 0
                      ? "Cadastre o primeiro paciente em “Novo Paciente”. Nome, celular e data de nascimento bastam para começar."
                      : "Tente outro trecho do nome, do CPF ou do celular — ou mostre também os inativos."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted/30">
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2.5 font-medium">Nome</th>
                        <th className="px-4 py-2.5 font-medium">Prontuário</th>
                        <th className="px-4 py-2.5 font-medium">Idade</th>
                        <th className="px-4 py-2.5 font-medium">CPF</th>
                        <th className="px-4 py-2.5 font-medium">Celular</th>
                        <th className="px-4 py-2.5 font-medium text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiveis.map((p) => {
                        const idade = idadeEmAnos(p.data_nascimento);
                        return (
                          <tr
                            key={p.id}
                            onClick={() => navigate(`/pacientes/${p.id}`)}
                            className="border-b border-border/50 hover:bg-muted/40 cursor-pointer"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">{p.nome_completo}</span>
                                {!p.ativo && (
                                  <Badge className="bg-gray-100 text-gray-600 border-0 font-normal">
                                    Inativo
                                  </Badge>
                                )}
                                {p.convenios?.nome && (
                                  <Badge className="bg-sky-100 text-sky-800 border-0 font-normal">
                                    {p.convenios.nome}
                                  </Badge>
                                )}
                              </div>
                              {p.apelido && (
                                <span className="text-xs text-muted-foreground">“{p.apelido}”</span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                              #{String(p.prontuario).padStart(4, "0")}
                            </td>
                            <td className="px-4 py-3 tabular-nums">
                              {idade === null ? "—" : `${idade} anos`}
                            </td>
                            <td className="px-4 py-3 tabular-nums text-muted-foreground">
                              {p.cpf ? formatarCpf(p.cpf) : "—"}
                            </td>
                            <td className="px-4 py-3 tabular-nums">{formatarCelular(p.celular)}</td>
                            <td className="px-4 py-3">
                              <div
                                className="flex items-center justify-end gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Abrir conversa no WhatsApp"
                                  onClick={() => abrirWhatsApp(p)}
                                  className="text-brand-600 hover:text-brand-700 hover:bg-brand-50"
                                >
                                  <MessageCircle className="h-4 w-4" />
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" title="Mais ações">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => { setEmEdicao(p); setDialogAberto(true); }}
                                    >
                                      <Pencil className="h-4 w-4 mr-2" /> Editar cadastro
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => alternarAtivo(p)}>
                                      {p.ativo
                                        ? <><UserRoundX className="h-4 w-4 mr-2" /> Inativar</>
                                        : <><UserRoundCheck className="h-4 w-4 mr-2" /> Reativar</>}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-red-600 focus:text-red-600"
                                      onClick={() => setParaExcluir(p)}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" /> Excluir
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
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

          {!carregandoTudo && visiveis.length > 0 && (
            <p className="text-xs text-gray-400 mt-3">
              {visiveis.length} de {lista.length} pacientes
              {mostrarInativos ? "" : " (inativos ocultos)"}
            </p>
          )}
        </div>
      </main>

      <PacienteDialog
        aberto={dialogAberto}
        paciente={emEdicao}
        onFechar={() => setDialogAberto(false)}
        onSalvo={(id) => {
          setDialogAberto(false);
          // Sem id (ou em edição) volta para a lista recarregada — nunca navegar
          // para uma rota com id indefinido.
          if (emEdicao || !id) carregar();
          else navigate(`/pacientes/${id}`); // cadastro novo cai direto na ficha
        }}
      />

      <AlertDialog open={!!paraExcluir} onOpenChange={(o) => !o && setParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {paraExcluir?.nome_completo}?</AlertDialogTitle>
            <AlertDialogDescription>
              A exclusão é definitiva e só funciona para cadastros sem histórico.
              Se o paciente já tem consulta, orçamento ou débito, prefira <b>Inativar</b> —
              o prontuário continua disponível e ele some das listas do dia a dia.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmarExclusao(); }}
              disabled={excluindo}
              className="bg-red-600 hover:bg-red-700 gap-2"
            >
              {excluindo && <Loader2 className="h-4 w-4 animate-spin" />}
              Excluir definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Pacientes;
