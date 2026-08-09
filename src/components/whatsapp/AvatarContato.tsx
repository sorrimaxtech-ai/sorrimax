import { useState } from "react";
import { cn } from "@/lib/utils";

// ============================================================================
// AvatarContato — foto do contato com queda para iniciais coloridas
// ----------------------------------------------------------------------------
// A foto do WhatsApp é uma URL do provedor que expira e às vezes falha ao
// carregar. Sem fallback, a lista fica cheia de retângulos quebrados. Aqui, se
// a imagem não carrega (ou nem existe), mostramos as iniciais sobre uma cor
// derivada do nome — estável, então o mesmo contato tem sempre a mesma cor.
// ============================================================================

const CORES = [
  "bg-rose-500", "bg-pink-500", "bg-fuchsia-500", "bg-purple-500",
  "bg-violet-500", "bg-indigo-500", "bg-blue-500", "bg-sky-500",
  "bg-cyan-500", "bg-teal-500", "bg-emerald-500", "bg-green-500",
  "bg-lime-600", "bg-amber-500", "bg-orange-500", "bg-red-500",
];

function corDoNome(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return CORES[Math.abs(h) % CORES.length];
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

interface Props {
  nome: string | null;
  telefone?: string | null;
  fotoUrl?: string | null;
  tamanho?: "sm" | "md" | "lg";
  className?: string;
}

const DIM = {
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-12 w-12 text-base",
};

export function AvatarContato({ nome, telefone, fotoUrl, tamanho = "md", className }: Props) {
  const [falhou, setFalhou] = useState(false);
  const rotulo = nome || telefone || "?";
  const mostraFoto = fotoUrl && !falhou;

  return (
    <div
      className={cn(
        "relative shrink-0 rounded-full overflow-hidden flex items-center justify-center font-semibold text-white select-none",
        DIM[tamanho],
        !mostraFoto && corDoNome(rotulo),
        className,
      )}
      aria-label={rotulo}
    >
      {mostraFoto ? (
        <img
          src={fotoUrl!}
          alt={rotulo}
          className="h-full w-full object-cover"
          onError={() => setFalhou(true)}
          loading="lazy"
        />
      ) : (
        iniciais(rotulo)
      )}
    </div>
  );
}
