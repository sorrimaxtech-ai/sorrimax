import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2, Building2, Users, Wallet, Clock, Gift, Lock, Unlock,
  MessageSquare, CreditCard, Save, CalendarPlus, Infinity as Infinito,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { traduzErro } from "@/lib/erros";
import { CamposComerciais, type Comercial } from "./CamposComerciais";
import {
  detalheClinica, definirPlano, estenderTrial, definirCortesia, bloquear, anotarConta,
  dinheiro, data, dataHora, desdeQuando, rotuloPlano, rotuloStatus, CLASSE_STATUS,
  type DetalheClinica,
} from "@/services/plataforma";

// ============================================================================
// Ficha da conta — tudo que dá para fazer com uma clínica, num lugar só
// ----------------------------------------------------------------------------
// Painel lateral em vez de página: quem trabalha nesta tela está varrendo a
// lista, e sair/voltar a cada conta perde o filtro e a rolagem.
//
// Nenhum campo aqui mostra dado de paciente — a ficha traz contagem de uso,
// equipe (colegas de trabalho, não pacientes) e situação comercial. É o limite
// que a migration 0044 impõe no banco, repetido aqui na interface.
// ============================================================================

interface Props {
  clinicaId: string | null;
  onFechar: () => void;
  onMudou: () => void;
  podeMexerEmDinheiro: boolean;
}

const ATALHOS = [
  { dias: 7, rotulo: "+7 dias" },
  { dias: 15, rotulo: "+15 dias" },
  { dias: 30, rotulo: "+1 mês" },
  { dias: 90, rotulo: "+3 meses" },
  { dias: 180, rotulo: "+6 meses" },
];

export function PainelConta({ clinicaId, onFechar, onMudou, podeMexerEmDinheiro }: Props) {
  const [d, setD] = useState<DetalheClinica | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [comercial, setComercial] = useState<Comercial | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ateData, setAteData] = useState("");
  const [nota, setNota] = useState("");
  const [confirmandoBloqueio, setConfirmandoBloqueio] = useState(false);

  const carregar = async () => {
    if (!clinicaId) return;
    setCarregando(true);
    try {
      const r = await detalheClinica(clinicaId);
      setD(r);
      setComercial({
        plano: r.assinatura.plano,
        valor: r.assinatura.valor,
        ciclo: r.assinatura.ciclo,
        status: r.assinatura.status,
        trialDias: 30,
        trialInfinito: r.assinatura.trial_infinito,
        cortesia: r.assinatura.cortesia,
      });
      setNota(r.assinatura.observacao ?? "");
      setMotivo("");
      setAteData("");
    } catch (e) {
      toast.error("Não foi possível abrir a clínica", { description: traduzErro(e) });
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { if (clinicaId) carregar(); else setD(null); }, [clinicaId]);

  const agir = async (fn: () => Promise<unknown>, sucesso: string) => {
    setOcupado(true);
    try {
      await fn();
      toast.success(sucesso);
      await carregar();
      onMudou();
    } catch (e) {
      toast.error("Não deu certo", { description: traduzErro(e) });
    } finally {
      setOcupado(false);
    }
  };

  const salvarComercial = () => {
    if (!clinicaId || !comercial) return;
    agir(
      () => definirPlano(clinicaId, comercial.plano, comercial.cortesia ? null : comercial.valor,
                         comercial.ciclo, comercial.status, motivo || undefined),
      "Plano atualizado",
    );
  };

  const trial = (opcoes: { dias?: number; ate?: string; infinito?: boolean }) => {
    if (!clinicaId) return;
    agir(() => estenderTrial(clinicaId, opcoes, motivo || undefined), "Teste atualizado");
  };

  return (
    <Sheet open={!!clinicaId} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {carregando || !d ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 pr-6 text-left">
                <Building2 className="h-5 w-5 shrink-0 text-brand-600" />
                {d.clinica.nome}
              </SheetTitle>
              <SheetDescription className="text-left">
                {d.clinica.codigo}
                {d.clinica.cidade && ` · ${d.clinica.cidade}`}
                {d.clinica.estado && `/${d.clinica.estado}`}
                {" · desde "}{data(d.clinica.criada_em)}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 flex flex-wrap gap-1.5">
              <Badge variant="outline" className={CLASSE_STATUS[d.assinatura.status] ?? ""}>
                {rotuloStatus(d.assinatura.status)}
              </Badge>
              <Badge variant="outline">{rotuloPlano(d.assinatura.plano)}</Badge>
              {d.assinatura.cortesia && (
                <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
                  <Gift className="mr-1 h-3 w-3" />Cortesia
                </Badge>
              )}
              {d.assinatura.trial_infinito && !d.assinatura.cortesia && (
                <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
                  <Infinito className="mr-1 h-3 w-3" />Teste sem prazo
                </Badge>
              )}
              {d.assinatura.bloqueada && (
                <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                  <Lock className="mr-1 h-3 w-3" />Bloqueada
                </Badge>
              )}
            </div>

            {d.assinatura.bloqueada && d.assinatura.bloqueio_motivo && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                A clínica está vendo: “{d.assinatura.bloqueio_motivo}”
              </p>
            )}

            {/* ------------------------------------------------ resumo */}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Resumo icone={Wallet} rotulo="Por mês" valor={dinheiro(d.assinatura.mrr)} />
              <Resumo icone={Users} rotulo="Pessoas" valor={String(d.uso.profissionais)} />
              <Resumo icone={Users} rotulo="Pacientes" valor={d.uso.pacientes.toLocaleString("pt-BR")} />
              <Resumo icone={Clock} rotulo="Consultas 30d" valor={String(d.uso.consultas_30d)} />
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                WhatsApp: {d.integracoes.whatsapp > 0 ? `${d.integracoes.whatsapp} número(s)` : "não ligou"}
              </span>
              <span className="flex items-center gap-1">
                <CreditCard className="h-3.5 w-3.5" />
                Cobrança: {d.integracoes.asaas ? "conectada" : "não conectou"}
              </span>
              <span>Orçamentos: {d.uso.orcamentos}</span>
              <span>Cadeiras: {d.uso.cadeiras}</span>
            </div>

            <Separator className="my-5" />

            {/* ------------------------------------------------ teste grátis */}
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Teste grátis</h3>
                <p className="text-xs text-gray-500">
                  {d.assinatura.trial_infinito
                    ? "Sem prazo — nunca vence."
                    : d.assinatura.trial_termina_em
                      ? `Vence em ${data(d.assinatura.trial_termina_em)}.`
                      : "Sem data definida."}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {ATALHOS.map((a) => (
                  <Button key={a.dias} size="sm" variant="outline" disabled={ocupado}
                    onClick={() => trial({ dias: a.dias })}>
                    {a.rotulo}
                  </Button>
                ))}
                <Button size="sm" variant="outline" disabled={ocupado || d.assinatura.trial_infinito}
                  onClick={() => trial({ infinito: true })}>
                  <Infinito className="mr-1.5 h-3.5 w-3.5" />Sem prazo
                </Button>
                {d.assinatura.trial_infinito && (
                  <Button size="sm" variant="outline" disabled={ocupado}
                    onClick={() => trial({ infinito: false, dias: 30 })}>
                    Voltar a ter prazo (+30 dias)
                  </Button>
                )}
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs">Ou até uma data</Label>
                  <Input type="date" value={ateData} onChange={(e) => setAteData(e.target.value)} />
                </div>
                <Button size="sm" variant="outline" disabled={ocupado || !ateData}
                  onClick={() => trial({ ate: ateData })}>
                  <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />Aplicar
                </Button>
              </div>
            </section>

            <Separator className="my-5" />

            {/* ------------------------------------------------ comercial */}
            {podeMexerEmDinheiro && comercial && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Plano e preço</h3>
                <CamposComerciais valor={comercial} onChange={setComercial} />

                <div className="space-y-1.5">
                  <Label className="text-xs">Por que está mudando (fica no registro)</Label>
                  <Input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                    placeholder="ex.: fechou anual com desconto" />
                </div>

                <Button onClick={salvarComercial} disabled={ocupado} className="w-full">
                  {ocupado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar plano
                </Button>

                <div className="flex gap-2">
                  <Button
                    variant="outline" className="flex-1" disabled={ocupado}
                    onClick={() => clinicaId && agir(
                      () => definirCortesia(clinicaId, !d.assinatura.cortesia, motivo || undefined),
                      d.assinatura.cortesia ? "Cortesia removida" : "Cortesia concedida")}
                  >
                    <Gift className="mr-1.5 h-4 w-4" />
                    {d.assinatura.cortesia ? "Tirar cortesia" : "Dar cortesia"}
                  </Button>

                  {d.assinatura.bloqueada ? (
                    <Button
                      variant="outline" className="flex-1" disabled={ocupado}
                      onClick={() => clinicaId && agir(() => bloquear(clinicaId, false, motivo || undefined), "Acesso liberado")}
                    >
                      <Unlock className="mr-1.5 h-4 w-4" />Liberar acesso
                    </Button>
                  ) : (
                    <Button
                      variant="outline" className="flex-1 text-red-600 hover:bg-red-50 hover:text-red-700"
                      disabled={ocupado} onClick={() => setConfirmandoBloqueio(true)}
                    >
                      <Lock className="mr-1.5 h-4 w-4" />Bloquear
                    </Button>
                  )}
                </div>
              </section>
            )}

            <Separator className="my-5" />

            {/* ------------------------------------------------ anotação */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Anotações da conta</h3>
              <Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)}
                placeholder="O que foi combinado, quem indicou, o que prometemos…" />
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500">
                  {d.assinatura.origem && `Veio por ${d.assinatura.origem}. `}
                  {d.assinatura.responsavel && `Fechado por ${d.assinatura.responsavel}.`}
                </p>
                <Button size="sm" variant="outline" disabled={ocupado}
                  onClick={() => clinicaId && agir(() => anotarConta(clinicaId, nota), "Anotação salva")}>
                  Salvar
                </Button>
              </div>
            </section>

            <Separator className="my-5" />

            {/* ------------------------------------------------ equipe */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Equipe ({d.equipe.length})</h3>
              {d.equipe.length === 0 ? (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Ninguém se cadastrou ainda. A clínica existe, mas está vazia — vale cobrar o cadastro do responsável.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-md border border-gray-100">
                  {d.equipe.map((p) => (
                    <li key={p.email} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.nome ?? p.email}</p>
                        <p className="truncate text-xs text-gray-500">{p.email}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs capitalize text-gray-600">{papelBonito(p.papel)}</p>
                        <p className="text-xs text-gray-400">{desdeQuando(p.ultimo_acesso)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ------------------------------------------------ histórico */}
            {d.historico.length > 0 && (
              <>
                <Separator className="my-5" />
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">O que já fizemos nesta conta</h3>
                  <ul className="space-y-1.5">
                    {d.historico.map((h, i) => (
                      <li key={i} className="text-xs text-gray-600">
                        <span className="font-medium">{acaoBonita(h.acao)}</span>
                        {h.motivo && ` — ${h.motivo}`}
                        <span className="text-gray-400"> · {dataHora(h.quando)} · {h.quem ?? "sistema"}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}

            <div className="h-6" />

            <AlertDialog open={confirmandoBloqueio} onOpenChange={setConfirmandoBloqueio}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Bloquear {d.clinica.nome}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A clínica perde o acesso ao sistema — agenda, pacientes, prontuário, tudo. Continua
                    conseguindo ver o aviso e acertar o pagamento. Escreva o motivo: é exatamente o que
                    eles vão ler na tela.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="ex.: mensalidade em aberto desde 10/07" />
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={!motivo.trim()}
                    className="bg-red-600 hover:bg-red-700"
                    onClick={() => {
                      setConfirmandoBloqueio(false);
                      if (clinicaId) agir(() => bloquear(clinicaId, true, motivo), "Clínica bloqueada");
                    }}
                  >
                    Bloquear
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

const Resumo = ({ icone: Icon, rotulo, valor }: { icone: typeof Wallet; rotulo: string; valor: string }) => (
  <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-2.5">
    <div className="flex items-center gap-1.5 text-xs text-gray-500">
      <Icon className="h-3.5 w-3.5" />{rotulo}
    </div>
    <p className="mt-0.5 text-lg font-semibold leading-none">{valor}</p>
  </div>
);

const papelBonito = (p: string) =>
  p === "admin" ? "Administrador" : p === "receptionist" ? "Recepção" : "Profissional";

const ACOES: Record<string, string> = {
  clinica_criada: "Conta criada",
  plano_alterado: "Plano alterado",
  trial_estendido: "Teste estendido",
  cortesia_concedida: "Cortesia concedida",
  cortesia_removida: "Cortesia removida",
  clinica_bloqueada: "Acesso bloqueado",
  clinica_liberada: "Acesso liberado",
  conta_anotada: "Anotação",
  membro_salvo: "Time da plataforma",
};
const acaoBonita = (a: string) => ACOES[a] ?? a;
