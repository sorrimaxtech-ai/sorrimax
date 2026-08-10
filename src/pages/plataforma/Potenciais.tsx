import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Search, Plus, Loader2, UserPlus, ArrowRight, Phone, Mail, MapPin,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useTenant } from "@/hooks/useTenant";
import { traduzErro } from "@/lib/erros";
import { CamposComerciais, COMERCIAL_PADRAO, type Comercial } from "@/components/plataforma/CamposComerciais";
import {
  listarLeads, salvarLead, converterLead, data, rotuloLead, rotuloPlano,
  CLASSE_LEAD, STATUS_LEAD, PLANOS_SAAS, type LeadPlataforma,
} from "@/services/plataforma";

// ============================================================================
// Potenciais — o funil ANTES de existir clínica
// ----------------------------------------------------------------------------
// Sem esta tela, a única contagem possível era "quantas clínicas temos", que
// só conhece quem já entrou. Aqui mora quem pediu demonstração, veio de
// anúncio ou foi prospectado — e o botão que transforma o contato em conta sem
// redigitar nada.
//
// A tabela `plataforma_leads` aceita INSERT anônimo de propósito: é o
// formulário do site gravando direto, sem intermediário. Ler, só o time.
// ============================================================================

const COLUNAS = ["novo", "contatado", "qualificado", "convertido", "perdido"] as const;

export default function Potenciais() {
  const { isPlataformaDono } = useTenant();
  const [lista, setLista] = useState<LeadPlataforma[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [novoAberto, setNovoAberto] = useState(false);
  const [convertendo, setConvertendo] = useState<LeadPlataforma | null>(null);

  const carregar = useCallback(async (termo: string, status: string) => {
    setCarregando(true);
    try {
      setLista(await listarLeads(status === "todos" ? undefined : status, termo || undefined));
    } catch (e) {
      toast.error("Não foi possível carregar os contatos", { description: traduzErro(e) });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => carregar(busca, filtro), busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [busca, filtro, carregar]);

  const mudarStatus = async (l: LeadPlataforma, status: string) => {
    try {
      await salvarLead({ id: l.id, status });
      toast.success(`Marcado como ${rotuloLead(status).toLowerCase()}`);
      carregar(busca, filtro);
    } catch (e) {
      toast.error("Não deu certo", { description: traduzErro(e) });
    }
  };

  const contagem = (s: string) => lista.filter((l) => l.status === s).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input className="pl-9" placeholder="Nome, clínica, e-mail ou telefone"
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {STATUS_LEAD.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => setNovoAberto(true)}>
          <Plus className="mr-1.5 h-4 w-4" />Novo contato
        </Button>
      </div>

      {filtro === "todos" && lista.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {COLUNAS.map((s) => (
            <button key={s} onClick={() => setFiltro(s)}
              className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50">
              {rotuloLead(s)}: <strong>{contagem(s)}</strong>
            </button>
          ))}
        </div>
      )}

      {carregando ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : lista.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <UserPlus className="h-10 w-10 text-gray-300" />
            <p className="font-medium text-gray-700">Nenhum contato aqui ainda</p>
            <p className="max-w-md text-sm text-gray-500">
              Cadastre quem pediu demonstração, ou ligue o formulário do site nesta tabela para
              os contatos caírem sozinhos.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((l) => (
            <Card key={l.id} className="border-gray-100 shadow-sm transition-shadow hover:shadow-md">
              <CardContent className="space-y-2.5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{l.nome}</p>
                    {l.clinica_nome && <p className="truncate text-sm text-gray-600">{l.clinica_nome}</p>}
                  </div>
                  <Badge variant="outline" className={CLASSE_LEAD[l.status] ?? ""}>
                    {rotuloLead(l.status)}
                  </Badge>
                </div>

                <div className="space-y-1 text-xs text-gray-500">
                  {l.telefone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{l.telefone}</p>}
                  {l.email && <p className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3" />{l.email}</p>}
                  {(l.cidade || l.estado) && (
                    <p className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" />{[l.cidade, l.estado].filter(Boolean).join("/")}
                    </p>
                  )}
                </div>

                {(l.cadeiras || l.profissionais || l.plano_interesse) && (
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {l.cadeiras != null && <span className="rounded bg-gray-100 px-1.5 py-0.5">{l.cadeiras} cadeiras</span>}
                    {l.profissionais != null && <span className="rounded bg-gray-100 px-1.5 py-0.5">{l.profissionais} dentistas</span>}
                    {l.plano_interesse && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-brand-700">quer {rotuloPlano(l.plano_interesse)}</span>}
                  </div>
                )}

                {l.mensagem && <p className="line-clamp-2 text-xs italic text-gray-500">“{l.mensagem}”</p>}

                <p className="text-xs text-gray-400">
                  {l.origem && `${l.origem} · `}chegou em {data(l.created_at)}
                </p>

                {l.status === "convertido" ? (
                  <p className="rounded-md bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">
                    Virou {l.clinica_convertida ?? "cliente"}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Select value={l.status} onValueChange={(v) => mudarStatus(l, v)}>
                      <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_LEAD.filter((s) => s.id !== "convertido").map((s) =>
                          <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {isPlataformaDono && (
                      <Button size="sm" variant="outline" className="h-8" onClick={() => setConvertendo(l)}>
                        Virar clínica <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DialogNovoContato aberto={novoAberto} onFechar={() => setNovoAberto(false)}
        onSalvo={() => carregar(busca, filtro)} />

      <DialogConverter lead={convertendo} onFechar={() => setConvertendo(null)}
        onConvertido={() => carregar(busca, filtro)} />
    </div>
  );
}

// ---------------------------------------------------------------- novo contato

function DialogNovoContato({ aberto, onFechar, onSalvo }: {
  aberto: boolean; onFechar: () => void; onSalvo: () => void;
}) {
  const [f, setF] = useState({
    nome: "", email: "", telefone: "", clinicaNome: "", cidade: "", estado: "",
    cadeiras: "", profissionais: "", planoInteresse: "", origem: "", mensagem: "",
  });
  const [salvando, setSalvando] = useState(false);
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });

  const salvar = async () => {
    if (!f.nome.trim()) { toast.error("Falta o nome do contato"); return; }
    setSalvando(true);
    try {
      await salvarLead({
        nome: f.nome.trim(),
        email: f.email.trim() || undefined,
        telefone: f.telefone.trim() || undefined,
        clinicaNome: f.clinicaNome.trim() || undefined,
        cidade: f.cidade.trim() || undefined,
        estado: f.estado.trim().toUpperCase() || undefined,
        cadeiras: f.cadeiras ? Number(f.cadeiras) : null,
        profissionais: f.profissionais ? Number(f.profissionais) : null,
        planoInteresse: f.planoInteresse || undefined,
        origem: f.origem.trim() || undefined,
        mensagem: f.mensagem.trim() || undefined,
      });
      toast.success("Contato salvo");
      setF({ nome: "", email: "", telefone: "", clinicaNome: "", cidade: "", estado: "",
             cadeiras: "", profissionais: "", planoInteresse: "", origem: "", mensagem: "" });
      onSalvo();
      onFechar();
    } catch (e) {
      toast.error("Não foi possível salvar", { description: traduzErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo contato</DialogTitle>
          <DialogDescription>Quem demonstrou interesse mas ainda não tem conta.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={f.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="Dra. Ana Souza" />
            </div>
            <div className="space-y-1.5">
              <Label>Clínica</Label>
              <Input value={f.clinicaNome} onChange={(e) => set({ clinicaNome: e.target.value })} placeholder="Odonto Ana" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={f.telefone} onChange={(e) => set({ telefone: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Cidade</Label>
              <Input value={f.cidade} onChange={(e) => set({ cidade: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>UF</Label>
              <Input maxLength={2} value={f.estado} onChange={(e) => set({ estado: e.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-1.5">
              <Label>Cadeiras</Label>
              <Input type="number" min={0} value={f.cadeiras} onChange={(e) => set({ cadeiras: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Interesse</Label>
              <Select value={f.planoInteresse} onValueChange={(v) => set({ planoInteresse: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {PLANOS_SAAS.filter((p) => p.id !== "trial").map((p) =>
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Como chegou</Label>
              <Input value={f.origem} onChange={(e) => set({ origem: e.target.value })} placeholder="indicação, anúncio…" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>O que disse</Label>
            <Textarea rows={2} value={f.mensagem} onChange={(e) => set({ mensagem: e.target.value })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- converter

function DialogConverter({ lead, onFechar, onConvertido }: {
  lead: LeadPlataforma | null; onFechar: () => void; onConvertido: () => void;
}) {
  const [comercial, setComercial] = useState<Comercial>(COMERCIAL_PADRAO);
  const [salvando, setSalvando] = useState(false);

  const converter = async () => {
    if (!lead) return;
    setSalvando(true);
    try {
      const r = await converterLead(lead.id, {
        plano: comercial.plano,
        valor: comercial.cortesia ? null : comercial.valor,
        ciclo: comercial.ciclo,
        trialDias: comercial.trialDias,
        trialInfinito: comercial.trialInfinito,
        cortesia: comercial.cortesia,
        status: comercial.status,
      });
      toast.success(`Clínica ${r.codigo} criada`, {
        description: "O responsável cai nela ao se cadastrar com o e-mail do contato.",
      });
      onConvertido();
      onFechar();
    } catch (e) {
      toast.error("Não foi possível converter", { description: traduzErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={!!lead} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Transformar em clínica</DialogTitle>
          <DialogDescription>
            {lead?.clinica_nome ?? lead?.nome} vira uma conta com a condição abaixo. A entrega vai
            para {lead?.email}.
          </DialogDescription>
        </DialogHeader>

        {!lead?.email && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Este contato não tem e-mail. Preencha o e-mail antes — é por ele que a conta é entregue.
          </p>
        )}

        <CamposComerciais valor={comercial} onChange={setComercial} />

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={converter} disabled={salvando || !lead?.email}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar clínica
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
