import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  subtitle?: string;
  icon?: LucideIcon;
}

export const StatsCard = ({
  title,
  value,
  change,
  changeType = "neutral",
  subtitle,
  icon: Icon,
}: StatsCardProps) => {
  return (
    <div className="bg-card rounded-xl border border-border/50 p-5 hover:shadow-card transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <span className="text-sm font-medium text-primary">{title}</span>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="space-y-1">
        <p className="text-2xl font-bold font-display">{value}</p>
        <div className="flex items-center gap-2 text-xs">
          {change && (
            <span
              className={cn(
                "px-1.5 py-0.5 rounded",
                changeType === "positive" && "bg-green-100 text-green-700",
                changeType === "negative" && "bg-red-100 text-red-700",
                changeType === "neutral" && "bg-muted text-muted-foreground"
              )}
            >
              {change}
            </span>
          )}
          {subtitle && (
            <span className="text-muted-foreground">{subtitle}</span>
          )}
        </div>
      </div>
    </div>
  );
};
