import { brl, pct, type FunilResumo } from "@/services/relatorios";

// ============================================================================
// Funil / jornada do paciente — etapas em CHEVRON (estilo journey map).
// ----------------------------------------------------------------------------
// Substitui as 5 caixas iguais com setinhas (que não pareciam funil e ainda
// punham "Vindos do CRM" ao lado de "Pacientes", sendo o 1º subconjunto do 2º).
// Aqui a jornada é uma só linha que ESTREITA da captação ao caixa, cor
// progredindo até o verde (dinheiro que entrou).
// ============================================================================

export function FunilJornada({ resumo }: { resumo: FunilResumo }) {
  const etapas = [
    { label: "Captação", valor: String(resumo.pacientes), sub: `${resumo.vindosDoCrm} vindos do CRM`, cor: "#38BDF8" },
    { label: "Orçamento", valor: String(resumo.comOrcamento), sub: brl(resumo.valorOrcado), cor: "#0EA5E9" },
    { label: "Aprovação", valor: String(resumo.comOrcamentoAprovado), sub: brl(resumo.valorAprovado), cor: "#2563EB" },
    { label: "Tratamento", valor: String(resumo.comTratamentoConcluido), sub: "concluídos", cor: "#4F46E5" },
    { label: "Caixa", valor: brl(resumo.valorRecebido), sub: `${pct(resumo.taxaOrcadoParaCaixaPct)} do orçado`, cor: "#059669" },
  ];

  const chevron = (i: number, n: number) => {
    const ponta = 22;
    if (i === 0) return `polygon(0 0, calc(100% - ${ponta}px) 0, 100% 50%, calc(100% - ${ponta}px) 100%, 0 100%)`;
    if (i === n - 1) return `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${ponta}px 50%)`;
    return `polygon(0 0, calc(100% - ${ponta}px) 0, 100% 50%, calc(100% - ${ponta}px) 100%, 0 100%, ${ponta}px 50%)`;
  };

  return (
    <div>
      <div className="flex overflow-x-auto pb-1">
        {etapas.map((e, i) => (
          <div
            key={e.label}
            className="relative min-w-[148px] flex-1 px-6 py-4 text-white first:ml-0 [&:not(:first-child)]:-ml-3"
            style={{ backgroundColor: e.cor, clipPath: chevron(i, etapas.length) }}
          >
            <p className="pl-2 text-[11px] font-semibold uppercase tracking-wide text-white/85">{e.label}</p>
            <p className="pl-2 text-2xl font-bold leading-tight">{e.valor}</p>
            <p className="pl-2 text-[11px] text-white/85">{e.sub}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        A linha estreita da esquerda (todos os pacientes) até o caixa (o que virou dinheiro). Cada etapa é o
        subconjunto da anterior que avançou.
      </p>
    </div>
  );
}
