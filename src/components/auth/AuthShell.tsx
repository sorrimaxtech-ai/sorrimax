import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { CheckCircle2, ShieldCheck, Sparkles, CreditCard, Star } from "lucide-react";

// ============================================================================
// AuthShell — moldura de 2 colunas das telas de conta (login / cadastro).
// Esquerda: o formulário. Direita (some no mobile): painel de marca.
//
// O painel direito segue a ESTRUTURA da referência (Codental: form + prova
// social ao lado), mas com conteúdo VERDADEIRO — benefícios reais + selos de
// confiança. Nada de depoimento inventado: `DEPOIMENTOS` entra só quando
// houver cliente real (nome, texto e foto com consentimento). Enquanto vazio,
// o painel mostra os benefícios; preenchendo o array, o carrossel aparece.
// ============================================================================

const BENEFICIOS = [
  "Agenda, prontuário e financeiro num lugar só",
  "Cobrança digital com baixa automática (Pix e boleto)",
  "WhatsApp: lembretes e campanhas de retorno",
  "Página pública de agendamento pra captar paciente",
];

// PROVA SOCIAL REAL entra aqui (não inventar): { nome, papel, texto, estrelas, foto? }
const DEPOIMENTOS: { nome: string; papel?: string; texto: string; estrelas?: number; foto?: string }[] = [];

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-gray-50 lg:grid lg:grid-cols-2">
      {/* ESQUERDA — formulário (entra com fade+slide) */}
      <div className="flex min-h-screen items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </div>

      {/* DIREITA — painel de marca (some no mobile) */}
      <aside className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between
                        bg-gradient-to-br from-[#0b3b8c] via-[#1466c4] to-[#1E88E5]">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-cyan-300/10 blur-3xl" />

        <Logo variant="white" iconClassName="h-9 w-9" className="relative" />

        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight">
            A gestão da sua clínica, do agendamento ao pagamento.
          </h2>

          {DEPOIMENTOS.length === 0 ? (
            <ul className="mt-8 space-y-4">
              {BENEFICIOS.map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" />
                  <span className="text-white/90">{b}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-8 space-y-4">
              {DEPOIMENTOS.slice(0, 2).map((d) => (
                <figure key={d.nome} className="rounded-2xl bg-white/10 p-5 backdrop-blur-sm ring-1 ring-white/15">
                  <div className="mb-2 flex gap-0.5">
                    {Array.from({ length: d.estrelas ?? 5 }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-amber-300 text-amber-300" />
                    ))}
                  </div>
                  <blockquote className="text-white/95">“{d.texto}”</blockquote>
                  <figcaption className="mt-3 flex items-center gap-3">
                    {d.foto && <img src={d.foto} alt={d.nome} className="h-9 w-9 rounded-full object-cover" />}
                    <span className="text-sm text-white/80">
                      <span className="font-semibold text-white">{d.nome}</span>
                      {d.papel ? ` · ${d.papel}` : ""}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>

        <div className="relative flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/80">
          <span className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4" /> 7 dias grátis</span>
          <span className="inline-flex items-center gap-1.5"><CreditCard className="h-4 w-4" /> Sem cartão de crédito</span>
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Dados criptografados · LGPD</span>
        </div>
      </aside>
    </div>
  );
}
