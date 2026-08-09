import iconBlue from "@/assets/brand/sorrimax-icon.png";
import iconWhite from "@/assets/brand/sorrimax-icon-white.png";
import { cn } from "@/lib/utils";

// ============================================================================
// Logo Sorrimax — dente (ícone) + "SORRIMAX" (SORRI navy / MAX azul).
// variant "color" p/ fundo claro, "white" p/ fundo azul/escuro.
// ============================================================================

export function Logo({
  variant = "color",
  showText = true,
  className,
  iconClassName,
  textClassName,
}: {
  variant?: "color" | "white";
  showText?: boolean;
  className?: string;
  iconClassName?: string;
  textClassName?: string;
}) {
  const icon = variant === "white" ? iconWhite : iconBlue;
  return (
    <span className={cn("inline-flex items-center gap-2 select-none", className)}>
      <img src={icon} alt="Sorrimax" className={cn("h-8 w-8", iconClassName)} draggable={false} />
      {showText && (
        <span className={cn("text-2xl font-extrabold tracking-tight leading-none", textClassName)}>
          <span className={variant === "white" ? "text-white" : "text-slate-900"}>SORRI</span>
          <span className={variant === "white" ? "text-white/80" : "text-brand-600"}>MAX</span>
        </span>
      )}
    </span>
  );
}
