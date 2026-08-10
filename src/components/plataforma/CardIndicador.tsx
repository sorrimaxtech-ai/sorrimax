import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ============================================================================
// CardIndicador — número grande com contexto embaixo
// ----------------------------------------------------------------------------
// Separado do MetricCard do dashboard da clínica porque as necessidades são
// diferentes: aqui quase todo indicador tem uma segunda leitura que muda a
// decisão ("R$ 4.200" sozinho não diz nada; "de 18 clínicas pagando" diz).
// `alerta` deixa o cartão vermelho quando o número é um problema — trial
// vencido, conta parada, clínica bloqueada.
// ============================================================================

interface Props {
  titulo: string;
  valor: string | number;
  detalhe?: string;
  icone?: LucideIcon;
  alerta?: boolean;
  destaque?: boolean;
  onClick?: () => void;
  index?: number;
}

export function CardIndicador({
  titulo, valor, detalhe, icone: Icon, alerta, destaque, onClick, index = 0,
}: Props) {
  const clicavel = typeof onClick === "function";

  return (
    <Card
      onClick={onClick}
      className={cn(
        "animate-in fade-in slide-in-from-bottom-2 border-gray-100 shadow-sm transition-all duration-300",
        clicavel && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md",
        destaque && "border-brand-200 bg-brand-50/40",
        alerta && "border-red-200 bg-red-50/50",
      )}
      style={{ animationDuration: "420ms", animationDelay: `${index * 55}ms`, animationFillMode: "backwards" }}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{titulo}</p>
          {Icon && (
            <Icon className={cn("h-4 w-4 shrink-0",
              alerta ? "text-red-500" : destaque ? "text-brand-600" : "text-gray-400")} />
          )}
        </div>
        <p className={cn("mt-1.5 text-2xl font-bold leading-none",
          alerta ? "text-red-700" : "text-gray-900")}>
          {valor}
        </p>
        {detalhe && <p className="mt-1.5 text-xs text-gray-500">{detalhe}</p>}
      </CardContent>
    </Card>
  );
}
