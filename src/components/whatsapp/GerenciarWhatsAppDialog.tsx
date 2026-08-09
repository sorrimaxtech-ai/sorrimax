import { useState } from "react";
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
  Loader2, RefreshCw, MessageSquare, Lock, Plus, MoreVertical, QrCode,
  Link2Off, Trash2, Smartphone, AlertTriangle,
} from "lucide-react";
import {
  STATUS_WA_LABEL, STATUS_WA_CLASSE, formatarNumeroWa, dataHoraWa,
  type ProviderWa,
} from "@/services/whatsapp/instancias";
import { useInstanciasWa } from "@/hooks/useInstanciasWa";

// ============================================================================
// GerenciarWhatsAppDialog — conectar e cuidar dos números, de onde o usuário está
// ----------------------------------------------------------------------------
// Modelo tirado do CRM que já opera WhatsApp em produção: a gestão dos números
// mora a um clique da caixa de conversas, não numa tela de configuração distante.
// Quem percebe que "não está chegando mensagem" está olhando as conversas — é ali
// que a saída precisa estar.
//
// Reaproveita `useInstanciasWa`, o mesmo que Integrações usa: uma lógica só,
// duas portas de entrada.
// ============================================================================

interface Props {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  /**
   * Estado vindo de quem abriu o diálogo. É prop, e não um `useInstanciasWa()`
   * aqui dentro, porque a tela que abre também mostra a situação da conexão no
   * cabeçalho: com duas instâncias do hook seriam duas consultas ao servidor e
   * dois estados livres para divergir (o cabeçalho dizendo "conectado" enquanto
   * o diálogo já sabe que caiu).
   */
  wa: ReturnType<typeof useInstanciasWa>;
}

export function GerenciarWhatsAppDialog({ aberto, onOpenChange, wa }: Props) {
  const [novaAberta, setNovaAberta] = useState(false);
  const [nome, setNome] = useState("");
  const [provider, setProvider] = useState<ProviderWa>("uazapi");

  const criar = async () => {
    const ok = await wa.criar(nome, provider);
    if (ok) { setNovaAberta(false); setNome(""); }
  };

  return (
    <>
      <Dialog open={aberto} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Números de WhatsApp</DialogTitle>
            <DialogDescription>
              Conecte o celular da clínica para receber e responder mensagens por aqui.
            </DialogDescription>
          </DialogHeader>

          {wa.carregando ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : wa.falhouCarga ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-900">Não deu para consultar os números</p>
                <p className="text-amber-800 mt-0.5">{wa.falhouCarga}</p>
                <Button variant="outline" size="sm" className="mt-3 gap-2"
                        onClick={() => wa.carregar()}>
                  <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {wa.proprias.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-10 text-center">
                  <MessageSquare className="h-9 w-9 mx-auto text-gray-300 mb-2" />
                  <p className="font-medium text-gray-800">Nenhum número conectado</p>
                  <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                    Conecte o WhatsApp da clínica lendo um QR code — como no WhatsApp Web.
                  </p>
                </div>
              ) : (
                wa.proprias.map((i) => (
                  <div key={i.id} className="rounded-lg border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Smartphone className="h-4 w-4 text-brand-600 shrink-0" />
                          <p className="font-medium truncate">{i.name}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatarNumeroWa(i.owner_number)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge className={STATUS_WA_CLASSE[i.status] ?? "bg-gray-100 text-gray-700 border-0"}>
                          {STATUS_WA_LABEL[i.status] ?? i.status}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Ações de ${i.name}`}>
                              {wa.ocupado === i.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <MoreVertical className="h-4 w-4" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => wa.abrirConexao(i)}>
                              <QrCode className="h-4 w-4 mr-2" />
                              {i.status === "connected" ? "Reconectar" : "Conectar (QR)"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => wa.sincronizar(i)}>
                              <RefreshCw className="h-4 w-4 mr-2" /> Atualizar situação
                            </DropdownMenuItem>
                            {i.status !== "disconnected" && (
                              <DropdownMenuItem onClick={() => wa.desconectar(i)}>
                                <Link2Off className="h-4 w-4 mr-2" /> Desconectar
                              </DropdownMenuItem>
                            )}
                            {wa.isAdmin && (
                              <DropdownMenuItem onClick={() => wa.setExcluir(i)}
                                                className="text-destructive focus:text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" /> Remover número
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <dt className="text-gray-500">Conectado em</dt>
                        <dd className="text-gray-800">{dataHoraWa(i.connected_at)}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Visto por último</dt>
                        <dd className="text-gray-800">{dataHoraWa(i.last_seen_at)}</dd>
                      </div>
                    </dl>

                    {i.status !== "connected" && (
                      <Button variant="outline" className="w-full mt-3 gap-2"
                              onClick={() => wa.abrirConexao(i)} disabled={wa.ocupado === i.id}>
                        <QrCode className="h-4 w-4" /> Ler QR code
                      </Button>
                    )}
                  </div>
                ))
              )}

              {wa.compartilhadas.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-sm font-medium mb-1">Números de outro sistema</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Aparecem só para você saber que existem. Não podem ser alterados por aqui.
                  </p>
                  <div className="space-y-2">
                    {wa.compartilhadas.map((i) => (
                      <div key={i.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-white p-2.5">
                        <div className="min-w-0">
                          <p className="text-sm truncate">{i.name}</p>
                          <p className="text-xs text-muted-foreground">{formatarNumeroWa(i.owner_number)}</p>
                        </div>
                        <Lock className="h-4 w-4 text-muted-foreground shrink-0" aria-label="Somente leitura" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            {wa.isAdmin && (
              <Button className="bg-brand-600 hover:bg-brand-700 gap-2" onClick={() => setNovaAberta(true)}>
                <Plus className="h-4 w-4" /> Conectar novo número
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------ novo número */}
      <Dialog open={novaAberta} onOpenChange={setNovaAberta}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar novo número</DialogTitle>
            <DialogDescription>
              Dê um nome para identificar a linha e leia o QR code no celular.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="nome-linha">Nome *</Label>
              <Input id="nome-linha" className="mt-1" maxLength={60} value={nome}
                     placeholder="Recepção, Comercial, Dr. Ana…"
                     onChange={(e) => setNome(e.target.value)} />
              <p className="mt-1 text-[11px] text-gray-400">
                Serve para você identificar a linha; o paciente não vê este nome.
              </p>
            </div>
            <div>
              <Label>Serviço de conexão</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as ProviderWa)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="uazapi">Padrão</SelectItem>
                  <SelectItem value="evolution">Alternativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNovaAberta(false)}>Cancelar</Button>
            <Button className="bg-brand-600 hover:bg-brand-700 gap-2" onClick={criar} disabled={wa.criando}>
              {wa.criando && <Loader2 className="h-4 w-4 animate-spin" />} Criar e conectar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------------------------- QR code */}
      <Dialog open={!!wa.conexao} onOpenChange={(o) => !o && wa.setConexao(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Conectar {wa.conexao?.inst.name}</DialogTitle>
            <DialogDescription>
              No celular: WhatsApp → Aparelhos conectados → Conectar aparelho.
            </DialogDescription>
          </DialogHeader>

          {wa.qrExpirado ? (
            // O código morreu de velho. Mostrar o desenho vencido faz o usuário
            // escanear e receber do WhatsApp um erro que não explica nada
            // ("não é possível conectar novos dispositivos no momento").
            <div className="py-10 text-center">
              <QrCode className="h-10 w-10 mx-auto text-gray-300 mb-3" />
              <p className="font-medium text-gray-800">O código expirou</p>
              <p className="text-sm text-gray-500 mt-1 max-w-xs mx-auto">
                Gere um novo e escaneie em seguida — ele vale menos de um minuto.
              </p>
            </div>
          ) : wa.conexao?.qr ? (
            <img src={wa.conexao.qr} alt="QR code para conectar o WhatsApp"
                 className="mx-auto h-64 w-64 rounded-lg border border-border bg-white p-2" />
          ) : wa.conexao?.codigo ? (
            <div className="text-center py-6">
              <p className="text-xs text-muted-foreground mb-2">Código de pareamento</p>
              <p className="text-3xl font-mono font-bold tracking-[0.2em]">{wa.conexao.codigo}</p>
            </div>
          ) : (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!wa.qrExpirado && (
            <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Aguardando a leitura · o código se renova em {wa.segundosQr}s
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => wa.setConexao(null)}>Fechar</Button>
            <Button
              className={wa.qrExpirado ? "bg-brand-600 hover:bg-brand-700 gap-2" : "gap-2"}
              variant={wa.qrExpirado ? "default" : "outline"}
              onClick={wa.renovarQr}
            >
              <RefreshCw className="h-4 w-4" /> Gerar novo código
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------------------- remover */}
      <AlertDialog open={!!wa.excluir} onOpenChange={(o) => !o && wa.setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover "{wa.excluir?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O número é desconectado e a linha deixa de existir. As conversas e mensagens já
              recebidas continuam no histórico dos pacientes, mas novas mensagens só voltam a
              chegar quando você conectar outra linha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={wa.confirmarExclusao} className="bg-red-600 hover:bg-red-700">
              Remover número
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
