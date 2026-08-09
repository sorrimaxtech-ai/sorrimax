import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Hammer, CheckCircle2 } from "lucide-react";
import { moduloDaRota, abaDaRota } from "@/config/navegacao";

// ============================================================================
// Módulo em construção
// ----------------------------------------------------------------------------
// Item de menu marcado como futuro levava a um 404 cru ("Page not found"), que
// parece app quebrado. Aqui a tela diz o que é aquele módulo, o que já existe
// pronto por trás dele (schema/serviço) e o que falta — sem inventar dado.
// ============================================================================

// O que JÁ está construído no banco por trás de cada módulo. Serve para o
// usuário entender que a base existe e o que falta é a interface.
const BASE_PRONTA: Record<string, string[]> = {
  "/consultas": ["Tabela `consultas` com 11 status", "Trava de conflito de horário no banco", "Recorrência (diária a anual)"],
  "/procedimentos": ["Tabela `procedimentos` com granularidade dente/face/arcada", "Preço por convênio", "Vínculo com profissional habilitado"],
  "/orcamentos": ["Orçamento com aprovação item a item", "Aprovar gera tratamento + débito", "Sincroniza com o funil de vendas"],
  "/cadeiras": ["Tabela `cadeiras`", "Agenda impede duas consultas na mesma cadeira"],
  "/horarios": ["Grade semanal por profissional", "Bloqueios (férias/feriado)", "Função de horários livres"],
  "/permissoes": ["Papéis admin / profissional / recepção", "Isolamento por clínica no banco"],
  "/pagina-publica": ["Estrutura de agendamento público", "Cálculo de horários disponíveis"],
  "/anamnese": ["Respostas ligadas a paciente e consulta"],
  "/anamnese/modelos": ["Modelos com perguntas por categoria", "9 tipos de campo (incluindo escala)"],
  "/documentos": ["Modelos de documento", "Emissão com registro e hash"],
  "/financeiro/receber": ["Lançamentos e parcelas", "Cálculo de recebível líquido"],
  "/financeiro/pagar": ["Contas a pagar e despesas fixas"],
  "/financeiro/comissoes": ["Comissão por procedimento", "Liberação só quando a parcela é paga"],
  "/relatorios/profissional": ["Views de ocupação, faltas e comissão"],
  "/estoque": ["Planejado: entrada/saída de insumos"],
  "/protese": ["Planejado: fluxo pré-laboratório → laboratório → entrega"],
  "/integracoes": ["WhatsApp (uazapi + Evolution) já operante no backend", "Fila de envio com reenvio automático"],
  "/loja": ["Planejado: planos e pacotes"],
  "/suporte": ["Planejado: central de ajuda"],
};

const EmConstrucao = () => {
  const location = useLocation();
  const navigate = useNavigate();
  // O nome vem da aba quando a rota é sub-navegação, senão do módulo.
  const modulo = moduloDaRota(location.pathname);
  const nome = abaDaRota(modulo, location.pathname)?.label ?? modulo?.label ?? "Módulo";
  const pronto = BASE_PRONTA[location.pathname] ?? [];

  return (
    <div className="flex min-h-full bg-gray-50">
      <main className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-lg border-gray-100 shadow-sm">
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
              <Hammer className="h-6 w-6" />
            </div>

            <h1 className="text-xl font-semibold text-gray-900">{nome}</h1>
            <p className="mt-1 text-sm text-gray-600">
              A interface deste módulo ainda está em construção.
            </p>

            {pronto.length > 0 && (
              <div className="mt-6 text-left rounded-lg bg-gray-50 border border-gray-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Já pronto por trás
                </p>
                <ul className="space-y-1.5">
                  {pronto.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle2 className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 flex gap-2 justify-center">
              <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <Button onClick={() => navigate("/dashboard")} className="bg-brand-600 hover:bg-brand-700">
                Ir para o início
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default EmConstrucao;
