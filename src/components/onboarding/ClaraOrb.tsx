import { Suspense, lazy, useEffect, useState } from "react";
import { AiOrb } from "./AiOrb";

/**
 * A orb da Clara.
 *
 * Usa o shader WebGL (GradientOrb) como visual principal. O three.js tem ~600KB, então entra
 * por import dinâmico: o bundle inicial não paga por ele, e enquanto o chunk baixa a orb em CSS
 * puro já aparece no lugar certo — o usuário nunca vê buraco.
 *
 * Em `prefers-reduced-motion` fica só a versão CSS, sem o loop de shader rodando a 60fps.
 */

const GradientOrb = lazy(() =>
  import("@/components/ui/gradient-orb").then((m) => ({ default: m.GradientOrb })),
);

interface ClaraOrbProps {
  /** Diâmetro em px. 120 na abertura, ~72 durante as perguntas. */
  size?: number;
  className?: string;
}

export function ClaraOrb({ size = 120, className }: ClaraOrbProps) {
  const [movimentoReduzido, setMovimentoReduzido] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setMovimentoReduzido(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setMovimentoReduzido(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (movimentoReduzido) return <AiOrb size={size} className={className} />;

  return (
    /* O shader desenha a orb dentro do menor lado, então o container precisa ser quadrado. */
    <div className={className} style={{ width: size, height: size }} aria-hidden="true">
      <div className="claraorb" style={{ width: size, height: size }}>
        {/*
          O shader nasceu para fundo escuro: o miolo é vazado de propósito (alpha 0 no centro),
          o que sobre um fundo claro deixa só um anel. Este disco preenche o miolo com o brilho
          da marca, e o shader passa a funcionar como halo vivo em volta.
        */}
        <div className="claraorb__core" />
        <Suspense fallback={<AiOrb size={size} />}>
          <GradientOrb
            className="claraorb__shader"
            config={{
              background: "transparent",
              colors: ["#00b4d8", "#0077b6", "#7dd3fc"],
              rotationSpeed: 0.25,
              noiseScale: 0.7,
              innerRadius: 0.12,
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}
