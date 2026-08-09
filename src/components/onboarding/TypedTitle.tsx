import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Título digitado caractere a caractere.
 *
 * O texto completo já vai para o DOM — cada char é um <span> com opacity 0 que vai sendo
 * revelado. Isso reserva o espaço final desde o primeiro frame, então o conteúdo abaixo não
 * é empurrado enquanto a frase "digita" (trocar textContent causaria reflow a cada letra).
 */

interface TypedTitleProps {
  text: string;
  /** ms por caractere */
  speed?: number;
  /** respiro extra depois de . ? ! : , */
  punctuationPause?: number;
  onDone?: () => void;
  className?: string;
}

export function TypedTitle({
  text,
  speed = 22,
  punctuationPause = 260,
  onDone,
  className,
}: TypedTitleProps) {
  const chars = useMemo(() => [...text], [text]);
  const [visiveis, setVisiveis] = useState(0);

  useEffect(() => {
    setVisiveis(0);

    const reduzido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduzido) {
      setVisiveis(chars.length);
      onDone?.();
      return;
    }

    let i = 0;
    let timer: ReturnType<typeof setTimeout>;

    const passo = () => {
      i += 1;
      setVisiveis(i);
      if (i >= chars.length) {
        onDone?.();
        return;
      }
      const anterior = chars[i - 1];
      const pausa = ".?!:,".includes(anterior) ? punctuationPause : speed;
      timer = setTimeout(passo, pausa);
    };

    timer = setTimeout(passo, speed);
    return () => clearTimeout(timer);
    // onDone fica fora das deps de propósito: só o texto reinicia a digitação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chars, speed, punctuationPause]);

  return (
    <h1 className={cn("onb-title", className)} aria-label={text}>
      {chars.map((c, i) => (
        <span key={i} className={cn("onb-char", i < visiveis && "is-visible")} aria-hidden="true">
          {c}
        </span>
      ))}
    </h1>
  );
}
