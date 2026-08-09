import { SiriWave } from "@/components/ui/siri-wave";
import "@/components/onboarding/onboarding.css";

/**
 * Bancada de teste do SiriWave (/siri-test).
 *
 * Os dois shaders pintam luz sobre preto, então o teste que importa não é "funciona?" — é
 * "sobrevive fora da caixa preta?". Cada variante aparece três vezes: no fundo escuro nativo,
 * recortada sobre o fundo claro do onboarding, e dentro de um disco escuro.
 */

function Bloco({ titulo, nota, children }: { titulo: string; nota: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex min-h-[300px] items-center justify-center">{children}</div>
      <div className="max-w-[280px] text-center">
        <p className="text-sm font-bold">{titulo}</p>
        <p className="text-xs text-muted-foreground">{nota}</p>
      </div>
    </div>
  );
}

export default function SiriTest() {
  return (
    <div className="min-h-screen w-full bg-white">
      {/* 1. Fundo escuro — como o componente foi desenhado */}
      <section className="bg-[#0a0a0c] px-8 py-14">
        <h2 className="mb-10 text-center text-lg font-bold text-white">
          1. Fundo escuro (nativo)
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-12">
          <Bloco titulo="wave" nota="Waveform do Siri, com aberração cromática.">
            <SiriWave variant="wave" size={280} />
          </Bloco>
          <Bloco titulo="fluid-dots" nota="Seis metaballs que fundem, dispersam e se juntam.">
            <SiriWave variant="fluid-dots" size={280} />
          </Bloco>
        </div>
      </section>

      {/* 2. Recortado sobre o fundo claro do onboarding */}
      <section className="onb-shell !min-h-0 px-8 py-14">
        <h2 className="relative z-10 mb-10 text-center text-lg font-bold">
          2. Transparente sobre o fundo claro do onboarding
        </h2>
        <div className="relative z-10 flex flex-wrap items-center justify-center gap-12">
          <Bloco titulo="wave (transparent)" nota="Luz clara sobre fundo claro — some.">
            <SiriWave variant="wave" size={280} transparent />
          </Bloco>
          <Bloco titulo="fluid-dots (transparent)" nota="Mesmo problema: quase branco no branco.">
            <SiriWave variant="fluid-dots" size={280} transparent />
          </Bloco>
        </div>
      </section>

      {/* 3. Dentro de um disco escuro, sobre o fundo claro */}
      <section className="onb-shell !min-h-0 px-8 py-14">
        <h2 className="relative z-10 mb-10 text-center text-lg font-bold">
          3. Dentro de um disco escuro (proposta de uso no tema claro)
        </h2>
        <div className="relative z-10 flex flex-wrap items-center justify-center gap-12">
          <Bloco titulo="wave em disco" nota="O escuro vira parte do design, não um acidente.">
            <div
              className="flex items-center justify-center rounded-full bg-[#061019]"
              style={{ width: 220, height: 220, boxShadow: "0 24px 60px rgba(3,42,63,.35)" }}
            >
              <SiriWave variant="wave" size={190} className="rounded-full" />
            </div>
          </Bloco>
          <Bloco titulo="fluid-dots em disco" nota="Mesma ideia, com os pontos.">
            <div
              className="flex items-center justify-center rounded-full bg-[#061019]"
              style={{ width: 220, height: 220, boxShadow: "0 24px 60px rgba(3,42,63,.35)" }}
            >
              <SiriWave variant="fluid-dots" size={190} className="rounded-full" />
            </div>
          </Bloco>
        </div>
      </section>
    </div>
  );
}
