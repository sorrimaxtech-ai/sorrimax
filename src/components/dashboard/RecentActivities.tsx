import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, DollarSign, CheckCircle, Calendar, UserPlus } from "lucide-react";

export function RecentActivities() {
  const activities = [
    {
      icon: Activity,
      color: "text-blue-600 bg-blue-50",
      textColor: "text-gray-900",
      text: "Novo paciente cadastrado: Paula Gomes",
      time: "Há 5 min",
    },
    {
      icon: DollarSign,
      color: "text-emerald-600 bg-emerald-50",
      textColor: "text-gray-900",
      text: "Pagamento recebido: R$ 1.800,00 - Lucas Ferreira",
      time: "Há 15 min",
    },
    {
      icon: CheckCircle,
      color: "text-teal-600 bg-teal-50",
      textColor: "text-gray-900",
      text: "Procedimento finalizado: Peeling - Fernanda Lima",
      time: "Há 30 min",
    },
    {
      icon: Calendar,
      color: "text-indigo-600 bg-indigo-50",
      textColor: "text-gray-900",
      text: "Consulta agendada: Ana Costa - 16/01 às 14:00",
      time: "Há 1h",
    },
    {
      icon: UserPlus,
      color: "text-blue-600 bg-blue-50",
      textColor: "text-gray-900",
      text: "Novo paciente cadastrado: Ricardo Martins",
      time: "Há 2h",
    },
    {
      icon: DollarSign,
      color: "text-emerald-600 bg-emerald-50",
      textColor: "text-gray-900",
      text: "Pagamento recebido: R$ 2.500,00 - Roberto Alves",
      time: "Há 3h",
    },
  ];

  return (
    <Card className="col-span-1 shadow-sm border-border/50 bg-card">
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <Activity className="w-5 h-5 text-primary" />
        <CardTitle className="text-lg font-medium">Atividades Recentes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {activities.map((activity, index) => (
            <div key={index} className="flex items-start gap-3">
              <div
                className={`p-2 rounded-full ${activity.color} flex-shrink-0`}
              >
                <activity.icon className="w-4 h-4" />
              </div>
              <div className="flex flex-col gap-1">
                <span className={`text-sm font-medium leading-none mt-1 ${activity.textColor}`}>
                  {activity.text}
                </span>
                <span className="text-xs text-muted-foreground">
                  {activity.time}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
