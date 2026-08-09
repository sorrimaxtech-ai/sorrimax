import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { UserRound, UserPlus, Search, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { traduzErro } from "@/lib/erros";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ============================================================================
// VincularPacienteBotao — a ponte entre a conversa e o prontuário
// ----------------------------------------------------------------------------
// Sem isto, quem atende vê um telefone e não sabe se é paciente da casa, o que
// já foi feito nele, nem se tem parcela em aberto — e precisa abrir outra aba
// para descobrir. Com o vínculo, a conversa vira parte do prontuário.
//
// O telefone é a chave natural: se já existe paciente com aquele número, o
// sistema sugere em vez de obrigar a procurar.
// ============================================================================

interface PacienteBusca {
  id: string;
  nome: string;
  celular: string | null;
}

interface Props {
  chatId: string;
  pacienteId: string | null;
  telefone: string | null;
  nomeContato: string | null;
  onVinculado: (pacienteId: string | null) => void;
}

/** Compara só os dígitos finais: o WhatsApp traz DDI e o cadastro nem sempre. */
function mesmoNumero(a: string | null, b: string | null): boolean {
  const da = (a ?? "").replace(/\D/g, "");
  const db = (b ?? "").replace(/\D/g, "");
  if (!da || !db) return false;
  const n = Math.min(8, da.length, db.length);
  return da.slice(-n) === db.slice(-n);
}

export function VincularPacienteBotao({
  chatId, pacienteId, telefone, nomeContato, onVinculado,
}: Props) {
  const navegar = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<PacienteBusca[]>([]);
  const [sugerido, setSugerido] = useState<PacienteBusca | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);

  // Sugestão por telefone: o caso comum é o paciente já estar cadastrado.
  useEffect(() => {
    if (pacienteId || !telefone) return;
    const digitos = telefone.replace(/\D/g, "").slice(-8);
    if (digitos.length < 8) return;
    let vivo = true;
    (async () => {
      const { data } = await supabase
        .from("pacientes")
        .select("id, nome, celular")
        .ilike("celular", `%${digitos}%`)
        .limit(3);
      if (!vivo) return;
      const achado = (data ?? []).find((p) => mesmoNumero(p.celular, telefone));
      setSugerido((achado as PacienteBusca) ?? null);
    })();
    return () => { vivo = false; };
  }, [pacienteId, telefone]);

  const procurar = useCallback(async (termo: string) => {
    if (termo.trim().length < 2) { setLista([]); return; }
    setCarregando(true);
    const { data, error } = await supabase
      .from("pacientes")
      .select("id, nome, celular")
      .or(`nome.ilike.%${termo}%,celular.ilike.%${termo.replace(/\D/g, "")}%`)
      .limit(12);
    if (error) toast.error("Não foi possível buscar", { description: traduzErro(error) });
    setLista((data ?? []) as PacienteBusca[]);
    setCarregando(false);
  }, []);

  const vincular = async (p: PacienteBusca) => {
    setSalvando(p.id);
    const { error } = await supabase
      .from("whatsapp_chats").update({ paciente_id: p.id }).eq("id", chatId);
    setSalvando(null);
    if (error) { toast.error("Não foi possível vincular", { description: traduzErro(error) }); return; }
    toast.success("Conversa vinculada", { description: p.nome });
    onVinculado(p.id);
    setAberto(false);
  };

  // Já vinculado: o botão leva direto ao prontuário.
  if (pacienteId) {
    return (
      <Button variant="outline" size="sm" className="gap-2"
              onClick={() => navegar(`/pacientes/${pacienteId}`)}>
        <UserRound className="h-4 w-4" /> Ver paciente
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setAberto(true)}>
        <UserPlus className="h-4 w-4" />
        {sugerido ? "Vincular paciente" : "Vincular paciente"}
        {sugerido && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden />}
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Vincular conversa a um paciente</DialogTitle>
            <DialogDescription>
              A conversa passa a aparecer no prontuário, e quem atende vê o histórico
              sem trocar de tela.
            </DialogDescription>
          </DialogHeader>

          {sugerido && (
            <button
              onClick={() => vincular(sugerido)}
              disabled={salvando === sugerido.id}
              className="w-full text-left rounded-lg border border-brand-200 bg-brand-50/60 p-3 hover:bg-brand-50 transition-colors"
            >
              <p className="text-[11px] font-medium text-brand-700 mb-0.5">
                Mesmo telefone desta conversa
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-gray-900 truncate">{sugerido.nome}</span>
                {salvando === sugerido.id
                  ? <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  : <Check className="h-4 w-4 text-brand-600 shrink-0" />}
              </div>
            </button>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus className="pl-9"
              placeholder="Buscar por nome ou telefone"
              value={busca}
              onChange={(e) => { setBusca(e.target.value); void procurar(e.target.value); }}
            />
          </div>

          <div className="max-h-64 overflow-y-auto -mx-1 px-1">
            {carregando ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : lista.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {busca.trim().length < 2
                  ? "Digite ao menos duas letras para buscar."
                  : "Nenhum paciente encontrado com esse termo."}
              </p>
            ) : lista.map((p) => (
              <button key={p.id} onClick={() => vincular(p)} disabled={!!salvando}
                className={cn("w-full text-left rounded-lg px-3 py-2.5 hover:bg-muted transition-colors",
                  salvando === p.id && "opacity-60")}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.nome}</p>
                    <p className="text-xs text-muted-foreground">{p.celular ?? "sem telefone"}</p>
                  </div>
                  {salvando === p.id && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
                </div>
              </button>
            ))}
          </div>

          <DialogFooter className="sm:justify-between gap-2">
            <Button variant="ghost" size="sm"
                    onClick={() => navegar(`/pacientes?novo=1&nome=${encodeURIComponent(nomeContato ?? "")}&celular=${encodeURIComponent(telefone ?? "")}`)}>
              Cadastrar novo paciente
            </Button>
            <Button variant="outline" onClick={() => setAberto(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
