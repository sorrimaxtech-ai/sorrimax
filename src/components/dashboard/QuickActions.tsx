import { Card, CardContent } from "@/components/ui/card";
import { UserPlus, Calendar, FileText, Send } from "lucide-react";

interface QuickAction {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  onClick: () => void;
}

export function QuickActions() {
  const actions: QuickAction[] = [
    {
      id: "new-patient",
      title: "Novo Paciente",
      icon: UserPlus,
      color: "text-blue-600 bg-blue-50",
      onClick: () => console.log("Novo Paciente")
    },
    {
      id: "schedule",
      title: "Agendar Consulta",
      icon: Calendar,
      color: "text-emerald-600 bg-emerald-50",
      onClick: () => console.log("Agendar Consulta")
    },
    {
      id: "budget",
      title: "Novo Orçamento",
      icon: FileText,
      color: "text-purple-600 bg-purple-50",
      onClick: () => console.log("Novo Orçamento")
    },
    {
      id: "reminder",
      title: "Enviar Lembrete",
      icon: Send,
      color: "text-orange-600 bg-orange-50",
      onClick: () => console.log("Enviar Lembrete")
    }
  ];

  return (
    <Card className="border-gray-100 shadow-sm">
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-blue-600">⚡</span>
          Ações Rápidas
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={action.onClick}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all group"
              >
                <div className={`p-3 rounded-lg ${action.color} group-hover:scale-110 transition-transform`}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-gray-700">{action.title}</span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
