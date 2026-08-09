import { Users, MessageSquare, Calendar, CheckCircle } from "lucide-react";

const funnelSteps = [
  { icon: Users, label: "Leads", count: 0, percentage: "0.0%", color: "bg-blue-500" },
  { icon: MessageSquare, label: "Contato Inicial", count: 0, percentage: "0%", color: "bg-yellow-500" },
  { icon: Calendar, label: "Agendados", count: 0, percentage: "0%", color: "bg-orange-500" },
  { icon: CheckCircle, label: "Convertidos", count: 0, percentage: "0%", color: "bg-green-500" },
];

export const ConversionFunnel = () => {
  return (
    <div className="bg-card rounded-xl border border-border/50 p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-foreground font-medium">📊 Funil de Conversão</span>
      </div>
      <div className="space-y-4">
        {funnelSteps.map((step, index) => (
          <div key={step.label} className="relative">
            <div className="flex items-center gap-3">
              <div
                className={`${step.color} w-10 h-10 rounded-full flex items-center justify-center`}
              >
                <step.icon className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{step.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">{step.count}</span>
                    <span className="text-xs text-muted-foreground">
                      ({step.percentage})
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${step.color} rounded-full transition-all`}
                    style={{ width: step.percentage }}
                  />
                </div>
              </div>
            </div>
            {index < funnelSteps.length - 1 && (
              <div className="absolute left-5 top-12 h-4 w-px bg-border" />
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground text-center mt-4">
        0% conversão
      </p>
    </div>
  );
};
