import { useState } from "react";
import { OnboardingStep, type Opcao } from "@/components/onboarding/OnboardingStep";

/**
 * Rota de preview do onboarding conversacional (/onboarding-preview).
 *
 * Serve para calibrar orb, digitação e cards sem depender do cadastro real. As perguntas aqui
 * são as mesmas que o cadastro do Sorrimax já coleta — quando o fluxo definitivo for ligado,
 * esta página vira o playground de ajuste visual.
 */

interface Passo {
  titulo: string;
  subtitulo?: string;
  opcoes: Opcao[];
  multipla?: boolean;
}

const PASSOS: Passo[] = [
  {
    titulo: "Qual sua função na clínica?",
    opcoes: [
      { valor: "dentista", rotulo: "Dentista" },
      { valor: "secretaria", rotulo: "Secretária(o)" },
      { valor: "admin", rotulo: "Administrador" },
      { valor: "outro", rotulo: "Outro" },
    ],
  },
  {
    titulo: "Como sua clínica é organizada hoje?",
    opcoes: [
      { valor: "sistema", rotulo: "Usava outro sistema" },
      { valor: "planilhas", rotulo: "Planilhas" },
      { valor: "papel", rotulo: "Papel e caneta" },
      { valor: "novo", rotulo: "Começando agora" },
    ],
  },
  {
    titulo: "Quais dores você espera resolver com o Sorrimax?",
    subtitulo: "Pode marcar mais de uma.",
    multipla: true,
    opcoes: [
      { valor: "organizacao", rotulo: "Falta de organização" },
      { valor: "faltas", rotulo: "Agenda e faltas" },
      { valor: "manual", rotulo: "Processos manuais" },
      { valor: "relatorios", rotulo: "Relatórios para decidir" },
      { valor: "captacao", rotulo: "Captação de pacientes" },
      { valor: "orcamentos", rotulo: "Orçamentos parados" },
    ],
  },
  {
    titulo: "Quantas cadeiras sua clínica possui?",
    subtitulo: "Posso deixar todas prontas para você agora.",
    opcoes: [
      { valor: "1", rotulo: "1" },
      { valor: "2", rotulo: "2" },
      { valor: "3", rotulo: "3" },
      { valor: "4+", rotulo: "+ 4" },
    ],
  },
];

export default function OnboardingPreview() {
  const [i, setI] = useState(0);
  const [respostas, setRespostas] = useState<Record<string, string[]>>({});

  const passo = PASSOS[i];
  const fim = i >= PASSOS.length;

  if (fim) {
    return (
      <div className="onb-shell">
        <div className="relative z-10 max-w-lg text-center">
          <h1 className="onb-title">Tudo pronto! 🚀</h1>
          <pre className="mx-auto max-w-md overflow-x-auto rounded-2xl bg-white/70 p-4 text-left text-xs backdrop-blur">
            {JSON.stringify(respostas, null, 2)}
          </pre>
          <button className="onb-cta mt-6" onClick={() => { setI(0); setRespostas({}); }}>
            Rodar de novo
          </button>
        </div>
      </div>
    );
  }

  return (
    <OnboardingStep
      key={passo.titulo}
      titulo={passo.titulo}
      subtitulo={passo.subtitulo}
      opcoes={passo.opcoes}
      multipla={passo.multipla}
      orbSize={i === 0 ? 120 : 84}
      onVoltar={i > 0 ? () => setI(i - 1) : undefined}
      onResponder={(vals) => {
        setRespostas((r) => ({ ...r, [passo.titulo]: vals }));
        setI(i + 1);
      }}
    />
  );
}
