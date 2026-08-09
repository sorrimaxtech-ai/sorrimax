import { useState } from "react";
import { cn } from "@/lib/utils";

// ============================================================================
// AvatarContato — foto do contato sobre iniciais coloridas
// ----------------------------------------------------------------------------
// As iniciais são SEMPRE desenhadas como camada de base, e a foto entra por
// cima em posição absoluta. Parece detalhe, mas evita o defeito clássico: com
// renderização condicional, rolar a lista rápido deixa buracos brancos até cada
// imagem decodificar. Com a base sempre presente, nunca há vazio.
//
// A foto também não espera evento de carregamento para aparecer — imagem que
// veio do cache do navegador frequentemente não dispara `onLoad`, e o avatar
// ficaria escondido para sempre. Só o erro é tratado, voltando às iniciais.
// ============================================================================

const CORES = [
  "bg-rose-500", "bg-pink-500", "bg-fuchsia-500", "bg-purple-500",
  "bg-violet-500", "bg-indigo-500", "bg-blue-500", "bg-sky-500",
  "bg-cyan-600", "bg-teal-500", "bg-emerald-500", "bg-green-600",
  "bg-lime-600", "bg-amber-500", "bg-orange-500", "bg-red-500",
];

/** Cor estável por contato: o mesmo nome sempre cai na mesma cor. */
function corDoNome(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return CORES[Math.abs(h) % CORES.length];
}

function iniciais(nome: string): string {
  const partes = nome.replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

interface Props {
  nome: string | null;
  telefone?: string | null;
  fotoUrl?: string | null;
  tamanho?: "sm" | "md" | "lg";
  /** Selo do WhatsApp no canto — mostra por qual canal a conversa chegou. */
  comCanal?: boolean;
  className?: string;
}

const DIM = {
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-14 w-14 text-base",
};

export function AvatarContato({
  nome, telefone, fotoUrl, tamanho = "md", comCanal = false, className,
}: Props) {
  const [falhou, setFalhou] = useState(false);
  const rotulo = nome || telefone || "?";

  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        className={cn(
          "relative rounded-full overflow-hidden flex items-center justify-center",
          "font-bold text-white select-none shadow-md transition-shadow duration-200",
          "group-hover:shadow-lg",
          DIM[tamanho],
          corDoNome(rotulo),
        )}
        aria-label={rotulo}
      >
        {/* base: sempre presente, nunca deixa buraco branco */}
        <span aria-hidden>{iniciais(rotulo)}</span>

        {fotoUrl && !falhou && (
          <img
            src={fotoUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setFalhou(true)}
          />
        )}
      </div>

      {comCanal && (
        <span
          className={cn(
            "absolute -right-0.5 -bottom-0.5 flex items-center justify-center",
            "h-[18px] w-[18px] rounded-full bg-white shadow-md",
            "ring-2 ring-white transition-transform duration-200 group-hover:scale-110",
          )}
          title="WhatsApp"
        >
          {/* desenhado inline: logo externa quebraria offline e sob CSP restrita */}
          <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden>
            <path
              fill="#25D366"
              d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 004.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0012.04 2zm5.8 14.03c-.24.68-1.42 1.31-1.96 1.36-.5.05-.97.24-3.27-.68-2.75-1.08-4.5-3.9-4.64-4.08-.13-.18-1.11-1.48-1.11-2.82 0-1.35.7-2.01.95-2.28.25-.27.55-.34.73-.34h.52c.17 0 .4-.06.62.48.24.57.8 1.97.87 2.11.07.14.12.3.02.48-.09.18-.14.3-.28.46l-.42.49c-.14.14-.28.29-.12.57.16.27.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.21 1.37.27.14.43.12.59-.07.16-.18.68-.79.86-1.07.18-.27.36-.22.61-.13.25.09 1.6.75 1.87.89.27.14.46.2.53.32.07.11.07.65-.17 1.33z"
            />
          </svg>
        </span>
      )}
    </div>
  );
}
