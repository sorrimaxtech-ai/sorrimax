import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconColor?: string;
}

export function MetricCard({ title, value, change, changeType = "neutral", icon: Icon, iconColor = "text-blue-500" }: MetricCardProps) {
  const changeColor = changeType === "positive" ? "text-emerald-600" : changeType === "negative" ? "text-red-600" : "text-gray-600";

  return (
    <Card className="border-gray-100 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-gradient-to-br from-white to-gray-50/50">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
            {change && (
              <p className={`text-sm font-medium mt-2 ${changeColor}`}>
                {change}
              </p>
            )}
          </div>
          <div className={`p-3 rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100/50 ${iconColor} shadow-sm`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
