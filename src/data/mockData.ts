import { Column, Patient } from "@/types/patient";

const patients: Patient[] = [
  {
    id: "1",
    name: "Ana Silva",
    age: 28,
    service: "Limpeza Dental",
    status: "new",
    date: "2024-03-20",
    priority: "medium",
    phone: "(11) 99999-9999",
    notes: "Paciente prefere horário da manhã.",
    value: "R$ 1.200,00",
    healthPlan: "Particular"
  },
  {
    id: "2",
    name: "Carlos Oliveira",
    age: 45,
    service: "Implante",
    status: "new",
    date: "2024-03-21",
    priority: "high",
    phone: "(11) 98888-8888"
  },
  {
    id: "3",
    name: "Mariana Santos",
    age: 32,
    service: "Consulta Geral",
    status: "new",
    date: "2024-03-19",
    priority: "low",
    phone: "(11) 97777-7777"
  },
  {
    id: "4",
    name: "Pedro Costa",
    age: 50,
    service: "Clareamento",
    status: "scheduled",
    date: "2024-03-22",
    time: "14:30",
    priority: "medium",
    phone: "(11) 96666-6666",
    value: "R$ 2.500,00",
    healthPlan: "Particular"
  },
  {
    id: "5",
    name: "Julia Pereira",
    age: 25,
    service: "Ortodontia",
    status: "scheduled",
    date: "2024-03-22",
    time: "16:00",
    priority: "high",
    phone: "(11) 95555-5555"
  }
];

export const initialColumns: Column[] = [
  {
    id: "new",
    title: "Novos Contatos",
    color: "bg-gray-400",
    patients: patients.filter((p) => p.status === "new"),
  },
  {
    id: "scheduled",
    title: "Agendados",
    color: "bg-blue-500",
    patients: patients.filter((p) => p.status === "scheduled"),
  },
  {
    id: "waiting",
    title: "Aguardando Confirmação",
    color: "bg-yellow-500",
    patients: [
        {
            id: "4",
            name: "Pedro Oliveira",
            age: 50,
            service: "Sessão de Tratamento",
            status: "waiting",
            date: "2024-03-22",
            time: "11:00",
            priority: "medium",
            phone: "(11) 96666-6666",
            healthPlan: "Bradesco Saúde",
        },
        {
            id: "6", 
            name: "Carla Mendes",
            age: 30,
            service: "Avaliação Completa",
            status: "waiting",
            date: "2024-03-22",
            time: "15:30",
            priority: "low",
            phone: "(11) 95555-4444",
            healthPlan: "Particular", 
            value: "R$ 800,00"
        }
    ],
  },
  {
    id: "confirmed",
    title: "Confirmados",
    color: "bg-green-500",
    patients: [
         {
            id: "5",
            name: "Lucas Ferreira",
            age: 25,
            service: "Procedimento Agendado",
            status: "confirmed",
            date: "2024-03-22",
            time: "09:30",
            priority: "high",
            phone: "(11) 95555-5555",
            healthPlan: "Particular",
            value: "R$ 1.800,00"
          }
    ],
  },
];
