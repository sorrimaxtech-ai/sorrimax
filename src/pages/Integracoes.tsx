import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plug, Loader2, RefreshCw, MessageSquare, ShieldCheck, Lock, Plus,
  MoreVertical, QrCode, Link2Off, Trash2, History, Smartphone, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import {
  listarInstanciasWa, criarInstanciaWa, conectarInstanciaWa, sincronizarInstanciaWa,
  desconectarInstanciaWa, excluirInstanciaWa, listarEventosInstancia,
  STATUS_WA_LABEL, STATUS_WA_CLASSE, ACAO_LABEL, formatarNumeroWa, dataHoraWa,
  ErroInstancia, type InstanciaWa, type EventoInstancia, type ProviderWa,
} from "@/services/whatsapp/instancias";

// ============================================================================
// Integrações — conectar e gerenciar o WhatsApp da clínica
// ----------------------------------------------------------------------------
// A tela chama a Edge Function `whatsapp-instances` para tudo. O token do
// provedor nunca chega aqui — nem mascarado: quem tem o token manda mensagem em
// nome da clínica. O QR também não é gravado em coluna legível; vem na resposta
// da ação e vive só enquanto o diálogo está aberto.
//
// Instância marcada como compartilhada pertence a outro sistema em produção
// (Diamond, com clientes reais). Aqui ela aparece como somente leitura, e a
// recusa de verdade acontece no servidor e no trigger do banco — a interface é
// a terceira camada, não a única.
// ============================================================================

const erroToast = (titulo: string, e: unknown) => {
  const err = e as ErroInstancia;
  toast.error(titulo, { description: err?.detalhe ? `${err.message} (${err.detalhe})` : err?.message });
};

const Integracoes = () => {
  const { clinicaId, carregando: carregandoCtx, isAdmin } = useTenant();

  const [instancias, setInstancias] = useState<InstanciaWa[]>([]);
  const [eventos, setEventos] = useState<EventoInstancia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  // falha de carga ≠ lista vazia: dizer "nenhum conectado" quando na verdade
  // não deu pra consultar faria a tela afirmar algo que não verificou.
  const [falhouCarga, setFalhouCarga] = useState<string | null>(null);

  const [dialogNova, setDialogNova] = useState(false);
  const [nome, setNome] = useState("");
  const [provider, setProvider] = useState<ProviderWa>("uazapi");
  const [criando, setCriando] = useState(false);

  const [conexao, setConexao] = useState<{ inst: InstanciaWa; qr: string | null; codigo: string | null } | null>(null);
  const [excluir, setExcluir] = useState<InstanciaWa | null>(null);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);

  const pollRef = useRef<number | null>(null);

  const carregar = useCallback(async (silencioso = false) => {
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; }
    if (!silencioso) setCarregando(true);
    try {
      const [lista, hist] = await Promise.all([
        listarInstanciasWa(),
        listarEventosInstancia(clinicaId).catch(() => [] as EventoInstancia[]),
      ]);
      setInstancias(lista);
      setEventos(hist);
      setFalhouCarga(null);
    } catch (e) {
      setFalhouCarga((e as ErroInstancia)?.message ?? "Falha ao consultar o servidor.");
      erroToast("Erro ao carregar integrações", e);
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, carregandoCtx]);

  useEffect(() => { carregar(); }, [carregar]);

  // Enquanto o QR está na tela, o servidor é consultado a cada 4s até o
  // provedor confirmar a conexão. Sem isso o usuário escaneia e fica olhando
  // um QR morto sem saber se deu certo.
  useEffect(() => {
    if (!conexao) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = window.setInterval(async () => {
      try {
        const r = await sincronizarInstanciaWa(conexao.inst.id);
        if (r.status === "connected") {
          toast.success("WhatsApp conectado", {
            description: r.owner_number ? `Número ${formatarNumeroWa(r.owner_number)}` : undefined,
          });
          setConexao(null);
          carregar(true);
        }
      } catch { /* provedor instável: a próxima volta tenta de novo */ }
    }, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [conexao, carregar]);

  const criar = async () => {
    if (nome.trim().length < 2) { toast.error("Dê um nome à instância"); return; }
    setCriando(true);
    try {
      const nova = await criarInstanciaWa(nome.trim(), provider);
      toast.success("Instância criada", { description: "Agora conecte lendo o QR code." });
      setDialogNova(false);
      setNome("");
      await carregar(true);
      // leva direto ao QR: instância criada e não conectada não serve pra nada
      abrirConexao({ ...(nova as InstanciaWa), shared_external: false } as InstanciaWa);
    } catch (e) {
      erroToast("Erro ao criar instância", e);
    } finally {
      setCriando(false);
    }
  };

  const abrirConexao = async (inst: InstanciaWa) => {
    setOcupado(inst.id);
    try {
      const r = await conectarInstanciaWa(inst.id);
      setConexao({ inst, qr: r.qrcode, codigo: r.codigo });
      if (!r.qrcode && !r.codigo && r.status === "connected") {
        toast.info("Esta instância já está conectada.");
        setConexao(null);
        carregar(true);
      }
    } catch (e) {
      erroToast("Erro ao iniciar a conexão", e);
    } finally {
      setOcupado(null);
    }
  };

  const sincronizar = async (inst: InstanciaWa) => {
    setOcupado(inst.id);
    try {
      const r = await sincronizarInstanciaWa(inst.id);
      toast.success("Sincronizado", { description: STATUS_WA_LABEL[r.status] ?? r.status });
      await carregar(true);
    } catch (e) {
      erroToast("Erro ao sincronizar", e);
    } finally {
      setOcupado(null);
    }
  };

  const desconectar = async (inst: InstanciaWa) => {
    setOcupado(inst.id);
    try {
      await desconectarInstanciaWa(inst.id);
      toast.success("Instância desconectada");
      await carregar(true);
    } catch (e) {
      erroToast("Erro ao desconectar", e);
    } finally {
      setOcupado(null);
    }
  };

  const confirmarExclusao = async () => {
    if (!excluir) return;
    setOcupado(excluir.id);
    try {
      await excluirInstanciaWa(excluir.id);
      toast.success("Instância excluída", { description: "Removida também no provedor." });
      setExcluir(null);
      await carregar(true);
    } catch (e) {
      erroToast("Erro ao excluir", e);
    } finally {
      setOcupado(null);
    }
  };

  const proprias = instancias.filter((i) => !i.shared_external);
  const compartilhadas = instancias.filter((i) => i.shared_external);

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-8">
          <div className="flex items-start justify-between mb-6 gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Plug className="h-6 w-6 text-emerald-600" /> Integrações
              </h1>
              <p className="text-sm text-gray-600 mt-0.5">
                Conecte o WhatsApp da clínica para atender pacientes na aba Conversas.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" className="gap-2" onClick={() => setMostrarHistorico((v) => !v)}>
                <History className="h-4 w-4" /> Histórico
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                onClick={() => setDialogNova(true)}
                disabled={!isAdmin}
                title={isAdmin ? undefined : "Só o administrador da clínica cria instância"}
              >
                <Plus className="h-4 w-4" /> Nova instância
              </Button>
            </div>
          </div>

          {carregandoCtx || carregando ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {falhouCarga && (
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="p-4 flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-amber-900">
                        Não foi possível consultar as integrações
                      </p>
                      <p className="text-xs text-amber-800 mt-0.5">
                        {falhouCarga} — o que aparece abaixo pode estar desatualizado ou incompleto.
                      </p>
                      <Button variant="outline" size="sm" className="mt-2 gap-2" onClick={() => carregar()}>
                        <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ------------------------------------------- instâncias da clínica */}
              {proprias.length === 0 && !falhouCarga ? (
                <Card className="border-gray-100">
                  <CardContent className="p-12 text-center">
                    <MessageSquare className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                    <p className="font-medium text-gray-800">Nenhum WhatsApp conectado</p>
                    <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                      Crie uma instância e leia o QR code com o celular da clínica. As conversas
                      passam a chegar na aba Conversas.
                    </p>
                    {isAdmin && (
                      <Button className="mt-4 bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={() => setDialogNova(true)}>
                        <Plus className="h-4 w-4" /> Conectar WhatsApp
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {proprias.map((i) => (
                    <Card key={i.id} className="border-gray-100">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Smartphone className="h-4 w-4 text-emerald-600 shrink-0" />
                              <p className="font-medium truncate">{i.name}</p>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatarNumeroWa(i.owner_number)} · {i.provider ?? "—"}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Badge className={STATUS_WA_CLASSE[i.status] ?? "bg-gray-100 text-gray-700 border-0"}>
                              {STATUS_WA_LABEL[i.status] ?? i.status}
                            </Badge>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label={`Ações de ${i.name}`}>
                                  {ocupado === i.id
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <MoreVertical className="h-4 w-4" />}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuItem onClick={() => abrirConexao(i)}>
                                  <QrCode className="h-4 w-4 mr-2" />
                                  {i.status === "connected" ? "Reconectar" : "Conectar (QR)"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => sincronizar(i)}>
                                  <RefreshCw className="h-4 w-4 mr-2" /> Sincronizar status
                                </DropdownMenuItem>
                                {i.status !== "disconnected" && (
                                  <DropdownMenuItem onClick={() => desconectar(i)}>
                                    <Link2Off className="h-4 w-4 mr-2" /> Desconectar
                                  </DropdownMenuItem>
                                )}
                                {isAdmin && (
                                  <DropdownMenuItem
                                    onClick={() => setExcluir(i)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" /> Excluir instância
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <dt className="text-gray-500">Conectada em</dt>
                            <dd className="text-gray-800">{dataHoraWa(i.connected_at)}</dd>
                          </div>
                          <div>
                            <dt className="text-gray-500">Última resposta</dt>
                            <dd className="text-gray-800">{dataHoraWa(i.last_seen_at)}</dd>
                          </div>
                        </dl>

                        {i.status !== "connected" && (
                          <Button
                            variant="outline" className="w-full mt-4 gap-2"
                            onClick={() => abrirConexao(i)} disabled={ocupado === i.id}
                          >
                            <QrCode className="h-4 w-4" /> Ler QR code
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* --------------------------------------------- de outro sistema */}
              {compartilhadas.length > 0 && (
                <Card className="border-gray-100">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldCheck className="h-4 w-4 text-sky-600" />
                      <p className="font-medium text-sm">Instâncias de outro sistema</p>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      Pertencem a um sistema em produção com clientes reais. Aparecem aqui só para
                      você saber que a conta do provedor é compartilhada — não podem ser
                      conectadas, alteradas nem excluídas por este sistema.
                    </p>
                    <div className="space-y-2">
                      {compartilhadas.map((i) => (
                        <div key={i.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{i.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatarNumeroWa(i.owner_number)}
                              {i.external_system && ` · ${i.external_system}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge className={STATUS_WA_CLASSE[i.status] ?? "bg-gray-100 text-gray-700 border-0"}>
                              {STATUS_WA_LABEL[i.status] ?? i.status}
                            </Badge>
                            <Lock className="h-4 w-4 text-muted-foreground" aria-label="Somente leitura" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ------------------------------------------------- histórico */}
              {mostrarHistorico && (
                <Card className="border-gray-100">
                  <CardContent className="p-0">
                    <div className="px-5 py-3 border-b border-border">
                      <p className="font-medium text-sm">Histórico de operações</p>
                      <p className="text-xs text-muted-foreground">
                        Registrado pelo servidor — a tela não consegue forjar entradas.
                      </p>
                    </div>
                    {eventos.length === 0 ? (
                      <p className="p-8 text-center text-sm text-muted-foreground">
                        Nenhuma operação registrada ainda.
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="border-b border-border bg-muted/30">
                          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <th className="px-4 py-2.5 font-medium">Quando</th>
                            <th className="px-4 py-2.5 font-medium">Instância</th>
                            <th className="px-4 py-2.5 font-medium">Ação</th>
                            <th className="px-4 py-2.5 font-medium">Detalhe</th>
                          </tr>
                        </thead>
                        <tbody>
                          {eventos.map((e) => (
                            <tr key={e.id} className="border-b border-border/50">
                              <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                                {dataHoraWa(e.created_at)}
                              </td>
                              <td className="px-4 py-2.5">{e.nome ?? "—"}</td>
                              <td className="px-4 py-2.5">
                                <span className={e.acao === "falha" ? "text-red-600" : ""}>
                                  {ACAO_LABEL[e.acao] ?? e.acao}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground">{e.detalhe ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ------------------------------------------------------- nova instância */}
      <Dialog open={dialogNova} onOpenChange={setDialogNova}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova instância de WhatsApp</DialogTitle>
            <DialogDescription>
              A instância é criada no provedor e a credencial fica no servidor — ela nunca passa
              por este navegador.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="nome-inst">Nome *</Label>
              <Input
                id="nome-inst" className="mt-1" maxLength={60} value={nome}
                placeholder="Recepção, Comercial, Dr. Ana…"
                onChange={(e) => setNome(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Serve para você identificar a linha; o paciente não vê este nome.
              </p>
            </div>
            <div>
              <Label>Provedor</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as ProviderWa)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="uazapi">uazapi</SelectItem>
                  <SelectItem value="evolution">Evolution</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogNova(false)}>Cancelar</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={criar} disabled={criando}>
              {criando && <Loader2 className="h-4 w-4 animate-spin" />} Criar e conectar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- QR code */}
      <Dialog open={!!conexao} onOpenChange={(o) => !o && setConexao(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Conectar {conexao?.inst.name}</DialogTitle>
            <DialogDescription>
              No celular: WhatsApp → Aparelhos conectados → Conectar aparelho.
            </DialogDescription>
          </DialogHeader>

          {conexao?.qr ? (
            <img
              src={conexao.qr}
              alt="QR code para conectar o WhatsApp"
              className="mx-auto h-64 w-64 rounded-lg border border-border bg-white p-2"
            />
          ) : conexao?.codigo ? (
            <div className="text-center py-6">
              <p className="text-xs text-muted-foreground mb-2">Código de pareamento</p>
              <p className="text-3xl font-mono font-bold tracking-[0.2em]">{conexao.codigo}</p>
            </div>
          ) : (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Aguardando a leitura — a tela avisa sozinha quando conectar.
          </p>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConexao(null)}>Fechar</Button>
            <Button
              variant="outline" className="gap-2"
              onClick={() => conexao && abrirConexao(conexao.inst)}
            >
              <RefreshCw className="h-4 w-4" /> Gerar novo QR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- excluir */}
      <AlertDialog open={!!excluir} onOpenChange={(o) => !o && setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{excluir?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              A instância é apagada também no provedor e o número é desconectado. As conversas e
              mensagens já recebidas continuam no histórico dos pacientes, mas novas mensagens
              deixam de chegar até você conectar outra linha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExclusao} className="bg-red-600 hover:bg-red-700">
              Excluir instância
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Integracoes;
