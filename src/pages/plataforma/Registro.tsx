import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, History, Shield, Plus, UserCheck, UserX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useTenant } from "@/hooks/useTenant";
import { traduzErro } from "@/lib/erros";
import {
  listarAuditoria, listarMembros, salvarMembro, dataHora, desdeQuando,
  type RegistroPlataforma, type MembroPlataforma,
} from "@/services/plataforma";

// ============================================================================
// Registro — o que foi feito aqui dentro, e por quem
// ----------------------------------------------------------------------------
// Toda ação do painel mexe em dinheiro ou em acesso de terceiro. Seis meses
// depois, "por que essa clínica está de graça?" precisa de resposta com nome e
// data. A trilha é gravada no banco pelas próprias RPCs — não dá para agir sem
// deixar registro, nem para apagar o registro pela interface.
// ============================================================================

const ACOES: Record<string, { texto: string; classe: string }> = {
  clinica_criada:     { texto: "Criou a conta",        classe: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  plano_alterado:     { texto: "Mudou plano/preço",    classe: "bg-brand-50 text-brand-700 border-brand-200" },
  trial_estendido:    { texto: "Esticou o teste",      classe: "bg-sky-50 text-sky-700 border-sky-200" },
  cortesia_concedida: { texto: "Deu cortesia",         classe: "bg-violet-50 text-violet-700 border-violet-200" },
  cortesia_removida:  { texto: "Tirou cortesia",       classe: "bg-gray-100 text-gray-600 border-gray-200" },
  clinica_bloqueada:  { texto: "Bloqueou o acesso",    classe: "bg-red-50 text-red-700 border-red-200" },
  clinica_liberada:   { texto: "Liberou o acesso",     classe: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  conta_anotada:      { texto: "Anotou na conta",      classe: "bg-gray-100 text-gray-600 border-gray-200" },
  membro_salvo:       { texto: "Mexeu no time",        classe: "bg-amber-50 text-amber-700 border-amber-200" },
};

/** Só os campos que interessam ao humano — o jsonb inteiro é ruído. */
const CAMPOS_VISIVEIS: Record<string, string> = {
  plano: "plano", valor: "valor", ciclo: "ciclo", status: "situação",
  trial_termina_em: "teste até", trial_infinito: "teste sem prazo",
  cortesia: "cortesia", bloqueada: "bloqueada",
};

function resumoMudanca(r: RegistroPlataforma): string | null {
  if (!r.antes || !r.depois) return null;
  const partes: string[] = [];
  for (const [campo, rotulo] of Object.entries(CAMPOS_VISIVEIS)) {
    const a = r.antes[campo];
    const d = r.depois[campo];
    if (a !== d && d !== undefined) {
      partes.push(`${rotulo}: ${formatar(a)} → ${formatar(d)}`);
    }
  }
  return partes.length ? partes.join(" · ") : null;
}

const formatar = (v: unknown) =>
  v === true ? "sim" : v === false ? "não" : v == null || v === "" ? "—" : String(v);

export default function Registro() {
  const { isPlataformaDono } = useTenant();
  const [registros, setRegistros] = useState<RegistroPlataforma[]>([]);
  const [membros, setMembros] = useState<MembroPlataforma[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [novoMembro, setNovoMembro] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [a, m] = await Promise.all([listarAuditoria(200), listarMembros()]);
      setRegistros(a);
      setMembros(m);
    } catch (e) {
      toast.error("Não foi possível carregar o registro", { description: traduzErro(e) });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (carregando) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* ------------------------------------------------ trilha */}
      <Card className="border-gray-100 shadow-sm lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-brand-600" />Últimas ações
          </CardTitle>
          <p className="text-xs text-gray-500">Nada aqui pode ser apagado pela interface.</p>
        </CardHeader>
        <CardContent>
          {registros.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Nenhuma ação registrada ainda.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {registros.map((r) => {
                const a = ACOES[r.acao] ?? { texto: r.acao, classe: "" };
                const mudanca = resumoMudanca(r);
                return (
                  <li key={r.id} className="flex flex-wrap items-start gap-2 py-2.5">
                    <Badge variant="outline" className={`shrink-0 ${a.classe}`}>{a.texto}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{r.clinica ?? "—"}</p>
                      {mudanca && <p className="text-xs text-gray-600">{mudanca}</p>}
                      {r.motivo && <p className="text-xs italic text-gray-500">“{r.motivo}”</p>}
                      <p className="text-xs text-gray-400">
                        {r.quem ?? "sistema"} · {dataHora(r.created_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------ time */}
      <Card className="border-gray-100 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-brand-600" />Time Sorrimax
            </CardTitle>
            {isPlataformaDono && (
              <Button size="sm" variant="outline" onClick={() => setNovoMembro(true)}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <p className="text-xs text-gray-500">Quem enxerga este painel.</p>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-gray-100">
            {membros.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.nome ?? m.email}</p>
                  <p className="truncate text-xs text-gray-500">{m.email}</p>
                  <p className="text-xs text-gray-400">{desdeQuando(m.ultimo_acesso)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge variant="outline" className={m.papel === "dono"
                    ? "border-brand-200 bg-brand-50 text-brand-700"
                    : "border-gray-200 text-gray-600"}>
                    {m.papel === "dono" ? "Responsável" : "Suporte"}
                  </Badge>
                  {!m.ativo && <UserX className="h-4 w-4 text-gray-400" />}
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
            <strong>Responsável</strong> mexe em plano, preço, cortesia, bloqueio e no próprio time.
            <br />
            <strong>Suporte</strong> vê tudo e pode esticar teste e cuidar de contatos.
          </p>
        </CardContent>
      </Card>

      <DialogMembro aberto={novoMembro} onFechar={() => setNovoMembro(false)} onSalvo={carregar} />
    </div>
  );
}

function DialogMembro({ aberto, onFechar, onSalvo }: {
  aberto: boolean; onFechar: () => void; onSalvo: () => void;
}) {
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState("suporte");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!email.trim()) { toast.error("Falta o e-mail"); return; }
    setSalvando(true);
    try {
      await salvarMembro(email.trim(), papel);
      toast.success("Time atualizado");
      setEmail(""); setPapel("suporte");
      onSalvo(); onFechar();
    } catch (e) {
      toast.error("Não foi possível adicionar", { description: traduzErro(e) });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-brand-600" />Dar acesso ao painel
          </DialogTitle>
          <DialogDescription>
            A pessoa precisa já ter conta no Sorrimax. Isto não cria login — só libera o painel
            para quem já entra no sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="pessoa@sorrimax.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Pode fazer o quê</Label>
            <Select value={papel} onValueChange={setPapel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="suporte">Suporte — vê tudo, estica teste, cuida de contatos</SelectItem>
                <SelectItem value="dono">Responsável — mexe em preço, cortesia e acesso</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Liberar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
