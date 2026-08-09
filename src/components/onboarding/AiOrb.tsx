import { cn } from "@/lib/utils";

/**
 * Orb da assistente virtual do onboarding.
 *
 * Sete círculos ("lobes") fundidos por um filtro SVG gooey: o blur junta as bordas e o
 * feColorMatrix estica o alpha, transformando círculos separados numa gota só. Cada lobe pulsa
 * com delay negativo escalonado, o que faz a onda circular pela massa sem espera inicial.
 *
 * CSS puro — sem canvas, sem Lottie, sem imagem. Escala em qualquer tamanho via --aiorb-size.
 */

const LOBES = [
  { size: 72, left: 54, top: 54, cor: "#0099c7", delay: "0s" },
  { size: 68, left: 56, top: 9, cor: "#00b4d8", delay: "-0.6s" },
  { size: 68, left: 98, top: 31, cor: "#38bdf8", delay: "-1.2s" },
  { size: 68, left: 98, top: 81, cor: "#0077b6", delay: "-1.8s" },
  { size: 68, left: 56, top: 103, cor: "#00b4d8", delay: "-2.4s" },
  { size: 68, left: 14, top: 81, cor: "#0099c7", delay: "-3s" },
  { size: 68, left: 14, top: 31, cor: "#7dd3fc", delay: "-3.6s" },
];

interface AiOrbProps {
  /** Diâmetro em px. 120 na abertura, ~72 durante as perguntas. */
  size?: number;
  className?: string;
}

export function AiOrb({ size = 120, className }: AiOrbProps) {
  return (
    <div
      className={cn("aiorb-wrap", className)}
      style={{ "--aiorb-size": `${size}px`, "--aiorb-scale": size / 180 } as React.CSSProperties}
      aria-hidden="true"
    >
      {/* O filtro precisa existir no DOM; width/height 0 para não ocupar espaço. */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <filter id="aiorb-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8.5" result="b" />
            <feColorMatrix
              in="b"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 17 -7"
            />
          </filter>
        </defs>
      </svg>

      <div className="aiorb">
        <div className="aiorb__goo">
          <div className="aiorb__stage">
            {LOBES.map((l, i) => (
              <span
                key={i}
                className="aiorb__lobe"
                style={{
                  width: l.size,
                  height: l.size,
                  left: l.left,
                  top: l.top,
                  background: l.cor,
                  animationDelay: l.delay,
                }}
              />
            ))}
            <div className="aiorb__core" />
          </div>
        </div>
      </div>
    </div>
  );
}
