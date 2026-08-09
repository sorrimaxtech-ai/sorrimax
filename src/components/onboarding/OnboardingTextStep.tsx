import { useEffect, useState } from "react";
import { ClaraOrb } from "./ClaraOrb";
import { TypedTitle } from "./TypedTitle";
import "./onboarding.css";

// ============================================================================
// Passo de TEXTO do onboarding conversacional — orbe + título digitado + input.
// Usado onde não dá pra oferecer cards (nome da clínica, CEP, e-mail da equipe).
// `opcional` mostra "Agora não" pra pular.
// ============================================================================

interface Props {
  titulo: string;
  subtitulo?: string;
  placeholder?: string;
  valorInicial?: string;
  opcional?: boolean;
  formato?: "texto" | "email" | "cep";
  orbSize?: number;
  onResponder: (valor: string) => void;
  onVoltar?: () => void;
}

export function OnboardingTextStep({
  titulo, subtitulo, placeholder, valorInicial = "", opcional, formato = "texto",
  orbSize = 84, onResponder, onVoltar,
}: Props) {
  const [digitou, setDigitou] = useState(false);
  const [valor, setValor] = useState(valorInicial);

  useEffect(() => { setDigitou(false); setValor(valorInicial); }, [titulo]); // eslint-disable-line

  const mascara = (raw: string) =>
    formato === "cep" ? raw.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2") : raw;

  const enviar = () => {
    const v = valor.trim();
    if (!v && !opcional) return;
    onResponder(v);
  };

  return (
    <div className="onb-shell">
      {onVoltar && (
        <button
          onClick={onVoltar}
          className="absolute left-6 top-6 rounded-full bg-white/80 px-4 py-2 text-sm font-semibold
                     text-foreground shadow-sm backdrop-blur transition hover:bg-white"
        >
          ‹ Voltar
        </button>
      )}

      <div className="relative z-10 flex w-full max-w-xl flex-col items-center">
        <ClaraOrb size={orbSize} className="mb-2" />
        <TypedTitle text={titulo} onDone={() => setDigitou(true)} />
        {subtitulo && digitou && <p className="onb-subtitle">{subtitulo}</p>}

        {digitou && (
          <div className="mt-5 w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
            <input
              autoFocus
              value={valor}
              onChange={(e) => setValor(mascara(e.target.value))}
              onKeyDown={(e) => { if (e.key === "Enter") enviar(); }}
              placeholder={placeholder}
              inputMode={formato === "cep" ? "numeric" : formato === "email" ? "email" : "text"}
              className="w-full rounded-2xl border border-brand-200 bg-white/90 px-5 py-4 text-center text-lg
                         shadow-sm outline-none backdrop-blur transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
            />
            <div className="mt-6 flex items-center justify-between">
              {opcional ? (
                <button className="text-sm text-muted-foreground transition hover:text-foreground" onClick={() => onResponder("")}>
                  Agora não
                </button>
              ) : <span />}
              <button className="onb-cta" disabled={!valor.trim() && !opcional} onClick={enviar}>
                Continuar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
