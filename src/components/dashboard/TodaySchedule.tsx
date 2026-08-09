import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { format, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDemoMode } from "@/hooks/useDemoMode";
import { demoConsultas } from "@/data/demoData";

interface Appointment {
  id: string;
  time: string;
  patientName: string;
  service: string;
  professional: string;
  status: "confirmed" | "in-progress" | "pending";
}


const getStatusBadge = (status: Appointment["status"]) => {
  switch (status) {
    case "confirmed":
      return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Confirmado</Badge>;
    case "in-progress":
      return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">Em Atendimento</Badge>;
    case "pending":
      return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Pendente</Badge>;
  }
};

export function TodaySchedule() {
  const [date, setDate] = useState<Date>(new Date());
  const { isDemo } = useDemoMode();

  // Converter consultas demo para formato do componente
  const getDemoAppointments = (): Appointment[] => {
    const selectedDateStr = format(date, "yyyy-MM-dd");
    return demoConsultas
      .filter(consulta => consulta.data === selectedDateStr)
      .map(consulta => ({
        id: consulta.id,
        time: consulta.hora_inicio,
        patientName: consulta.paciente_nome,
        service: consulta.tipo,
        professional: consulta.profissional,
        status: consulta.status === "confirmada" ? "confirmed" : consulta.status === "pendente" ? "pending" : "confirmed"
      }));
  };

  // ⚠️ Antes: `isDemo ? demo : mockAppointments` — fora do demo a tela mostrava
  // "Maria Silva / Botox" para uma clínica REAL. Agora vem do banco.
  const { clinicaId } = useTenant();
  const [reais, setReais] = useState<Appointment[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (isDemo || !clinicaId || !date) return;
    let vivo = true;
    (async () => {
      setCarregando(true);
      const ini = new Date(date); ini.setHours(0, 0, 0, 0);
      const fim = new Date(date); fim.setHours(23, 59, 59, 999);
      const { data, error } = await supabase
        .from("consultas")
        .select("id, inicio, status, pacientes(nome_completo), procedimentos(nome), profissional:profiles!consultas_profissional_id_fkey(full_name)")
        .eq("clinica_id", clinicaId)
        .gte("inicio", ini.toISOString())
        .lte("inicio", fim.toISOString())
        .order("inicio", { ascending: true });
      if (!vivo) return;
      if (error) { console.error("[agenda-do-dia]", error.message); setReais([]); }
      else {
        setReais((data ?? []).map((c: any) => ({
          id: c.id,
          time: new Date(c.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          patientName: c.pacientes?.nome_completo ?? "Paciente",
          service: c.procedimentos?.nome ?? "Consulta",
          professional: c.profissional?.full_name ?? "—",
          status: c.status === "confirmado" ? "confirmed"
                : c.status === "em_atendimento" ? "in-progress" : "pending",
        })));
      }
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [isDemo, clinicaId, date]);

  const appointments = isDemo ? getDemoAppointments() : reais;

  return (
    <Card className="border-gray-100 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-600" />
          Agenda do Dia
        </CardTitle>
        
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2 text-sm">
              <CalendarIcon className="h-4 w-4" />
              {format(date, "dd/MM/yyyy", { locale: ptBR })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(newDate) => newDate && setDate(newDate)}
              locale={ptBR}
            />
          </PopoverContent>
        </Popover>
      </CardHeader>

      <CardContent>
        <div className="space-y-3">
          {appointments.map((appointment) => (
            <div
              key={appointment.id}
              className="flex items-center gap-4 p-4 rounded-lg border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all"
            >
              <div className="flex-shrink-0 w-16 text-center">
                <span className="text-lg font-bold text-gray-900">{appointment.time}</span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{appointment.patientName}</p>
                <p className="text-sm text-gray-600">{appointment.service}</p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">{appointment.professional}</span>
                {getStatusBadge(appointment.status)}
              </div>
            </div>
          ))}

          {appointments.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <CalendarIcon className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>Nenhuma consulta agendada para {format(date, "dd/MM/yyyy", { locale: ptBR })}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
