import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Building2, Copy, Check } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { traduzErro } from "@/lib/erros";
import { criarClinica } from "@/services/plataforma";
import { CamposComerciais, COMERCIAL_PADRAO, type Comercial } from "./CamposComerciais";

// ============================================================================
// Nova clínica pelo painel
// ----------------------------------------------------------------------------
// A conta nasce antes do dono ter login: o e-mail vira convite, e no cadastro
// dele o sistema amarra o profile nesta clínica com papel de administrador. Por
// isso o e-mail é obrigatório e é a única coisa que não dá para errar — é o
// endereço da entrega.
// ============================================================================

interface Props {
  aberto: boolean;
  onFechar: () => void;
  onCriada: () => void;
}

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

export function DialogNovaClinica({ aberto, onFechar, onCriada }: Props) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [origem, setOrigem] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [observacao, setObservacao] = useState("");
  const [comercial, setComercial] = useState<Comercial>(COMERCIAL_PADRAO);
  const [salvando, setSalvando] = useState(false);
  const [criada, setCriada] = useState<{ codigo: string; token: string | null; direto: boolean } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const limpar = () => {
    setNome(""); setEmail(""); setTelefone(""); setCidade(""); setEstado("");
    setOrigem(""); setResponsavel(""); setObservacao("");
    setComercial(COMERCIAL_PADRAO); setCriada(null); setCopiado(false);
  };

  const fechar = () => { limpar(); onFechar(); };

  const salvar = async () => {
    if (!nome.trim()) { toast.error("Falta o nome da clínica"); return; }
    if (!email.trim()) { toast.error("Falta o e-mail do responsável", { description: "É por ele que a conta é entregue." }); return; }

    setSalvando(true);
    try {
      const r = await criarClinica({
        nome: nome.trim(),
        email: email.trim(),
        telefone: telefone.trim() || undefined,
        cidade: cidade.trim() || undefined,
        estado: estado || undefined,
        plano: comercial.plano,
        valor: comercial.cortesia ? null : comercial.valor,
        ciclo: comercial.ciclo,
        trialDias: comercial.trialDias,
        trialInfinito: comercial.trialInfinito,
        cortesia: comercial.cortesia,
        status: comercial.status,
        origem: origem.trim() || undefined,
        responsavel: responsavel.trim() || undefined,
        observacao: observacao.trim() || undefined,
      });
      setCriada({ codigo: r.codigo, token: r.convite_token, direto: r.vinculado_direto });
      onCriada();
      toast.success("Clínica criada");
    } catch (e) {
      toast.error("Não foi possível criar a clínica", { description: traduzErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  const linkConvite = criada?.token ? `${window.location.origin}/cadastro?convite=${criada.token}` : null;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {criada ? (
          // ------------------------------------------------ confirmação
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-emerald-600" />
                Clínica criada
              </DialogTitle>
              <DialogDescription>
                Código <strong>{criada.codigo}</strong>.{" "}
                {criada.direto
                  ? "O responsável já tinha conta e foi ligado a esta clínica — é só ele entrar."
                  : "Peça para o responsável se cadastrar com o e-mail informado; ele cai direto nesta clínica, como administrador."}
              </DialogDescription>
            </DialogHeader>

            {linkConvite && (
              <div className="space-y-1.5">
                <Label className="text-sm">Link para mandar</Label>
                <div className="flex gap-2">
                  <Input readOnly value={linkConvite} className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(linkConvite);
                      setCopiado(true);
                      toast.success("Link copiado");
                    }}
                  >
                    {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  O convite vale por 90 dias e só serve para o e-mail {email}.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => { limpar(); }}>Criar outra</Button>
              <Button onClick={fechar}>Pronto</Button>
            </DialogFooter>
          </>
        ) : (
          // ------------------------------------------------ formulário
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-brand-600" />
                Nova clínica
              </DialogTitle>
              <DialogDescription>
                Cria a conta já com a condição combinada — preço, ciclo e tempo de teste.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Nome da clínica *</Label>
                  <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Odonto Sorriso" />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail do responsável *</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="dono@clinica.com.br" />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Telefone</Label>
                  <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 99999-0000" />
                </div>
                <div className="space-y-1.5">
                  <Label>Cidade</Label>
                  <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="São Paulo" />
                </div>
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <select
                    value={estado}
                    onChange={(e) => setEstado(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">—</option>
                    {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
              </div>

              <CamposComerciais valor={comercial} onChange={setComercial} />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Como chegou</Label>
                  <Input value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="indicação, anúncio, outbound…" />
                </div>
                <div className="space-y-1.5">
                  <Label>Quem fechou</Label>
                  <Input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="nome de quem vendeu" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Observação</Label>
                <Textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="O combinado da negociação — daqui a seis meses ninguém lembra."
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={fechar} disabled={salvando}>Cancelar</Button>
              <Button onClick={salvar} disabled={salvando}>
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar clínica
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
