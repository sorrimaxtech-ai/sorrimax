import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// RespostasRapidas — os textos que a recepção repete o dia inteiro
// ----------------------------------------------------------------------------
// Aparece quando o campo começa com "/" — o mesmo gesto do WhatsApp Business,
// então ninguém precisa aprender nada novo. Filtra conforme digita e some ao
// escolher.
//
// Padronizar não é só velocidade: evita cada atendente explicar o preparo
// pré-cirúrgico de um jeito, o que numa clínica vira "mas me disseram outra
// coisa".
// ============================================================================

export interface RespostaRapida {
  id: string;
  atalho: string;
  texto: string;
}

/** Troca {nome}, {data} e afins pelo que a conversa já sabe. */
export function aplicarVariaveis(
  texto: string,
  ctx: { nome?: string | null; clinica?: string | null },
): string {
  const primeiroNome = (ctx.nome ?? "").trim().split(/\s+/)[0] ?? "";
  return texto
    .replace(/\{nome\}/gi, primeiroNome || "tudo bem")
    .replace(/\{clinica\}/gi, ctx.clinica ?? "nossa clínica");
}

interface Props {
  /** Texto atual do campo. O seletor só aparece se começar com "/". */
  valor: string;
  nomeContato?: string | null;
  onEscolher: (texto: string) => void;
}

export function RespostasRapidas({ valor, nomeContato, onEscolher }: Props) {
  const [todas, setTodas] = useState<RespostaRapida[]>([]);
  const [indice, setIndice] = useState(0);

  const ativo = valor.startsWith("/");
  const termo = ativo ? valor.slice(1).toLowerCase() : "";

  useEffect(() => {
    if (!ativo || todas.length > 0) return;
    let vivo = true;
    (async () => {
      const { data } = await supabase
        .from("respostas_rapidas")
        .select("id, atalho, texto")
        .order("atalho");
      if (vivo) setTodas((data ?? []) as RespostaRapida[]);
    })();
    return () => { vivo = false; };
  }, [ativo, todas.length]);

  const visiveis = useMemo(
    () => todas.filter((r) => r.atalho.startsWith(termo)).slice(0, 6),
    [todas, termo],
  );

  useEffect(() => { setIndice(0); }, [termo]);

  if (!ativo || visiveis.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-border bg-white shadow-lg overflow-hidden z-20">
      <div className="px-3 py-1.5 border-b border-border/60 flex items-center gap-1.5">
        <Zap className="h-3 w-3 text-brand-600" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Respostas rápidas
        </span>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {visiveis.map((r, i) => (
          <button
            key={r.id}
            onMouseEnter={() => setIndice(i)}
            onClick={() => onEscolher(aplicarVariaveis(r.texto, { nome: nomeContato }))}
            className={cn(
              "w-full text-left px-3 py-2 transition-colors",
              i === indice ? "bg-brand-50" : "hover:bg-muted/60",
            )}
          >
            <span className="text-xs font-semibold text-brand-700">/{r.atalho}</span>
            <p className="text-xs text-gray-600 truncate mt-0.5">{r.texto}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
