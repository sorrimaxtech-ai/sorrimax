import { useState } from "react";

import { cn } from "@/lib/utils";
import { DENTES_DECIDUOS, DENTES_PERMANENTES, isArcadaSuperior } from "@/types/odonto";

// ============================================================================
// Seletor de dentes — a MESMA arte do odontograma do prontuário, em modo de
// seleção múltipla. A prótese precisava escolher dentes, mas estava desenhando
// os dentes numa grade de caixinhas 42×9 espremidas (raiz cortada, com borda),
// que ficava feia ao lado do odontograma bonito. Aqui reaproveitamos o visual:
// dente alto (42×68) que mostra a raiz inteira, sem caixa, coroa ancorada na
// linha do arco (superior embaixo / inferior em cima), e as arcadas em UMA
// linha com a divisória da linha média — como no prontuário. Selecionado ganha
// anel, não caixa.
// ============================================================================

const BASE_ARTE = "/dentes";
const EXT_ARTE = "png"; // set realista MIT (bardurt/odontograma) em /public/dentes

function ArteDente({ numero }: { numero: number }) {
  const [semArte, setSemArte] = useState(false);
  const url = `${BASE_ARTE}/${numero}.${EXT_ARTE}`;
  // superior: coroa embaixo → ancora no rodapé; inferior: coroa em cima → topo.
  const posClass = isArcadaSuperior(numero) ? "object-bottom" : "object-top";
  if (semArte) {
    return (
      <span
        className="flex items-end justify-center font-mono text-xs text-muted-foreground"
        style={{ width: 42, height: 68 }}
      >
        {numero}
      </span>
    );
  }
  return (
    <span className="relative block" style={{ width: 42, height: 68 }}>
      <img
        src={url}
        alt=""
        draggable={false}
        loading="lazy"
        onError={() => setSemArte(true)}
        className={cn("h-full w-full object-contain", posClass)}
      />
    </span>
  );
}

function Dente({
  numero,
  marcado,
  onToggle,
}: {
  numero: number;
  marcado: boolean;
  onToggle: (dente: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => onToggle(numero)}
        aria-pressed={marcado}
        title={`Dente ${numero}`}
        className={cn(
          "rounded-lg p-0.5 text-muted-foreground/70 transition-colors hover:bg-brand-50 hover:text-brand-600",
          marcado && "bg-brand-50 ring-2 ring-brand-500",
        )}
      >
        <ArteDente numero={numero} />
      </button>
      <span
        className={cn(
          "text-xs font-medium tabular-nums",
          marcado ? "text-brand-600" : "text-muted-foreground",
        )}
      >
        {numero}
      </span>
    </div>
  );
}

export interface SeletorDentesProps {
  /** Dentes marcados (notação FDI). */
  selecionados: number[];
  /** Alterna a marcação de um dente. */
  onToggle: (dente: number) => void;
  /** Mostra a dentição decídua em vez da permanente. */
  decidua?: boolean;
  className?: string;
}

export function SeletorDentes({ selecionados, onToggle, decidua = false, className }: SeletorDentesProps) {
  const grupos = decidua ? DENTES_DECIDUOS : DENTES_PERMANENTES;
  const marcados = new Set(selecionados);

  const arcada = (esquerda: readonly number[], direita: readonly number[]) => (
    <div className="flex items-start justify-center gap-4">
      <div className="flex gap-1">
        {esquerda.map((d) => (
          <Dente key={d} numero={d} marcado={marcados.has(d)} onToggle={onToggle} />
        ))}
      </div>
      <div className="w-px self-stretch bg-border" aria-hidden />
      <div className="flex gap-1">
        {direita.map((d) => (
          <Dente key={d} numero={d} marcado={marcados.has(d)} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );

  return (
    <div className={cn("space-y-4 overflow-x-auto rounded-lg border bg-card px-2 py-3", className)}>
      {arcada(grupos.supDireito, grupos.supEsquerdo)}
      <div className="h-px bg-border" aria-hidden />
      {arcada(grupos.infDireito, grupos.infEsquerdo)}
    </div>
  );
}

export default SeletorDentes;
