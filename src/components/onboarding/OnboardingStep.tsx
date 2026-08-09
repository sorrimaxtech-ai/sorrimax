import { useEffect, useState } from "react";
import { ClaraOrb } from "./ClaraOrb";
import { TypedTitle } from "./TypedTitle";
import { cn } from "@/lib/utils";
import "./onboarding.css";

/**
 * Uma tela do onboarding conversacional: orb + título digitado + opções.
 *
 * Enquanto o título digita, as opções ficam em skeleton — mesmo tamanho e raio do card final,
 * já na posição definitiva. Quando a frase termina, o texto entra com stagger de 80ms.
 */

export interface Opcao {
  valor: string;
  rotulo: string;
}

interface OnboardingStepProps {
  titulo: string;
  subtitulo?: string;
  opcoes: Opcao[];
  /** true = várias respostas, com botão Continuar. false = 1 clique avança. */
  multipla?: boolean;
  orbSize?: number;
  onResponder: (valores: string[]) => void;
  onVoltar?: () => void;
}

export function OnboardingStep({
  titulo,
  subtitulo,
  opcoes,
  multipla = false,
  orbSize = 72,
  onResponder,
  onVoltar,
}: OnboardingStepProps) {
  const [digitou, setDigitou] = useState(false);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);

  // Título novo reinicia o ciclo: volta ao skeleton e limpa a seleção anterior.
  useEffect(() => {
    setDigitou(false);
    setEscolhidos([]);
  }, [titulo]);

  const alternar = (valor: string) => {
    if (!multipla) {
      onResponder([valor]);
      return;
    }
    setEscolhidos((atual) =>
      atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor],
    );
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

      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center">
        <ClaraOrb size={orbSize} className="mb-2" />

        <TypedTitle text={titulo} onDone={() => setDigitou(true)} />
        {subtitulo && digitou && <p className="onb-subtitle">{subtitulo}</p>}

        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          {opcoes.map((o, i) => (
            <button
              key={o.valor}
              onClick={() => alternar(o.valor)}
              disabled={!digitou}
              data-selected={escolhidos.includes(o.valor)}
              className={cn("onb-option", !digitou && "onb-option--skeleton")}
              style={{ animationDelay: `${120 + i * 80}ms` }}
            >
              {digitou ? o.rotulo : " "}
            </button>
          ))}
        </div>

        {multipla && (
          <div className="mt-6 flex w-full items-center justify-between">
            <span className="text-sm text-muted-foreground">Selecione quantos quiser.</span>
            <button
              className="onb-cta"
              disabled={!escolhidos.length}
              onClick={() => onResponder(escolhidos)}
            >
              Continuar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
