import * as React from "react";

import { cn } from "@/lib/utils";

// ============================================================================
// Campo de dinheiro (BRL)
// ----------------------------------------------------------------------------
// O <input type="number"> do HTML é uma armadilha em formulário de dinheiro:
// aceita "e" (notação científica), sinal, e não formata nada — dá pra digitar
// "e2134313123131231231" e o campo fica com lixo. Aqui o input é texto puro e
// só deixa passar DÍGITO: o que se digita entra pela direita, em centavos, e a
// tela sempre mostra "1.234,56". Impossível digitar letra, ponto solto ou sinal.
// Um teto de sanidade evita número astronômico por engano.
// ============================================================================

/** Formata centavos -> "1.234,50" (sem símbolo, que fica no prefixo). */
function formatarCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** R$ 100.000.000,00 em centavos — nenhum campo de clínica passa disso. */
const MAX_CENTAVOS = 100_000_000_00;

export interface CampoMoedaProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  /** Valor em reais (ex.: 1234.5). `null`/`undefined` = campo vazio. */
  value: number | null | undefined;
  /** Devolve o valor em reais, ou `null` quando o campo fica vazio. */
  onChange: (reais: number | null) => void;
}

export const CampoMoeda = React.forwardRef<HTMLInputElement, CampoMoedaProps>(
  ({ value, onChange, className, disabled, ...props }, ref) => {
    const centavos =
      value === null || value === undefined || !Number.isFinite(value)
        ? 0
        : Math.round(Math.abs(value) * 100);
    const texto = centavos === 0 ? "" : formatarCentavos(centavos);

    const aoDigitar = (e: React.ChangeEvent<HTMLInputElement>) => {
      const digitos = e.target.value.replace(/\D/g, "");
      if (digitos === "") {
        onChange(null);
        return;
      }
      // slice antes de Number pra nunca perder precisão em string gigante
      const c = Math.min(Number(digitos.slice(0, 15)), MAX_CENTAVOS);
      onChange(c / 100);
    };

    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none text-sm text-muted-foreground">
          R$
        </span>
        <input
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          value={texto}
          onChange={aoDigitar}
          placeholder="0,00"
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-right text-base tabular-nums ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
CampoMoeda.displayName = "CampoMoeda";
