import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = [
  { name: "Jan", total: 1500 },
  { name: "Fev", total: 2300 },
  { name: "Mar", total: 3200 },
  { name: "Abr", total: 2900 },
  { name: "Mai", total: 4500 },
  { name: "Jun", total: 5100 },
];

export function RevenueChart() {
  return (
    <Card className="col-span-1 shadow-sm border-border/50 bg-card">
      <CardHeader>
        <CardTitle>Receita Total</CardTitle>
      </CardHeader>
      <CardContent className="pl-2">
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <XAxis
                dataKey="name"
                stroke="#374151"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#374151"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `R$${value}`}
              />
              <Tooltip 
                contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                formatter={(value: number) => [`R$ ${value}`, "Receita"]}
              />
              <Area isAnimationActive={false}
                type="monotone"
                dataKey="total"
                stroke="#0ea5e9"
                fill="#0ea5e9"
                fillOpacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
