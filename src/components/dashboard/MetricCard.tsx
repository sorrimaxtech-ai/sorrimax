import { useEffect, useState } from "react";
import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconColor?: string;
  /** Posição no grid — dá o stagger da animação de entrada. */
  index?: number;
}

/** Conta de 0 até `alvo` com easing (só para valores numéricos). */
function useContagem(alvo: number, ativo: boolean, ms = 650) {
  const [n, setN] = useState(ativo ? 0 : alvo);
  useEffect(() => {
    if (!ativo) { setN(alvo); return; }
    let raf = 0;
    const t0 = performance.now();
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setN(Math.round(alvo * (1 - Math.pow(1 - p, 3)))); // easeOutCubic
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo, ativo, ms]);
  return n;
}

export function MetricCard({
  title, value, change, changeType = "neutral", icon: Icon, iconColor = "text-brand-600", index = 0,
}: MetricCardProps) {
  const changeColor =
    changeType === "positive" ? "text-emerald-600" : changeType === "negative" ? "text-red-600" : "text-gray-500";

  const ehNumero = typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value));
  const contado = useContagem(ehNumero ? Number(value) : 0, ehNumero);
  const exibido = ehNumero ? contado : value;

  return (
    <Card
      className="animate-in fade-in slide-in-from-bottom-2 border-gray-100 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
      style={{ animationDuration: "450ms", animationDelay: `${index * 70}ms`, animationFillMode: "backwards" }}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-gray-500">{title}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{exibido}</p>
            {change && <p className={cn("mt-0.5 text-xs font-medium", changeColor)}>{change}</p>}
          </div>
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50", iconColor)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
