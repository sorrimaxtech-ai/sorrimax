const days = ["Horário", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const hours = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

export const HeatmapChart = () => {
  return (
    <div className="bg-card rounded-xl border border-border/50 p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-foreground font-medium">⏰ Mapa de Calor - Horários</span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Visualização dos horários com mais agendamentos
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              {days.map((day) => (
                <th
                  key={day}
                  className="p-2 text-center font-medium text-muted-foreground"
                >
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((hour) => (
              <tr key={hour}>
                <td className="p-2 text-center text-muted-foreground">{hour}</td>
                {days.slice(1).map((day) => (
                  <td key={`${hour}-${day}`} className="p-1">
                    <div className="w-full h-6 bg-muted rounded" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-center gap-2 mt-4">
        <span className="text-xs text-muted-foreground">Menos</span>
        <div className="flex gap-1">
          <div className="w-4 h-4 bg-muted rounded" />
          <div className="w-4 h-4 bg-primary/20 rounded" />
          <div className="w-4 h-4 bg-primary/40 rounded" />
          <div className="w-4 h-4 bg-primary/60 rounded" />
          <div className="w-4 h-4 bg-primary rounded" />
        </div>
        <span className="text-xs text-muted-foreground">Mais</span>
      </div>
    </div>
  );
};
