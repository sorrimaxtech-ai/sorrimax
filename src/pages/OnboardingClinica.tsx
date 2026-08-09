import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { OnboardingStep, type Opcao } from "@/components/onboarding/OnboardingStep";
import { ClaraOrb } from "@/components/onboarding/ClaraOrb";
import { Loader2 } from "lucide-react";
import "@/components/onboarding/onboarding.css";

// ============================================================================
// Onboarding conversacional (Clara / orbe) — /configurar-clinica
// ----------------------------------------------------------------------------
// Substitui o wizard estático. A Clara pergunta o que importa "logo no início"
// (segmentação), depois especialidades e horários — tudo por cards, sem digitar.
// Adapta ao que já sabemos: NÃO repergunta nome nem telefone (já vieram do
// cadastro). As respostas de segmentação ficam em `clinicas.segmentacao` (0035).
// ============================================================================

const ESP_ODONTO = [
  "Clínico Geral", "Ortodontia", "Implantodontia", "Endodontia", "Periodontia",
  "Odontopediatria", "Prótese Dentária", "Cirurgia Oral", "Dentística / Estética",
  "Harmonização Orofacial", "Radiologia Odontológica", "Odontogeriatria",
];

const DIAS = [
  { valor: "segunda", rotulo: "Seg" }, { valor: "terca", rotulo: "Ter" },
  { valor: "quarta", rotulo: "Qua" }, { valor: "quinta", rotulo: "Qui" },
  { valor: "sexta", rotulo: "Sex" }, { valor: "sabado", rotulo: "Sáb" },
  { valor: "domingo", rotulo: "Dom" },
];

const FAIXAS: Record<string, [string, string]> = {
  "08-18": ["08:00", "18:00"],
  "09-19": ["09:00", "19:00"],
  comercial: ["08:00", "18:00"],
  depois: ["08:00", "18:00"],
};

type Passo = { id: string; titulo: string; subtitulo?: string; opcoes: Opcao[]; multipla?: boolean };

export default function OnboardingClinica() {
  const navigate = useNavigate();
  const [clinicaId, setClinicaId] = useState<string | null>(null);
  const [primeiroNome, setPrimeiroNome] = useState("");
  const [nomeClinica, setNomeClinica] = useState("");
  const [pronto, setPronto] = useState(false);

  const [i, setI] = useState(0);
  const [resp, setResp] = useState<Record<string, string[]>>({});
  const [salvando, setSalvando] = useState(false);

  // ---- resolve a clínica pela SESSÃO (cria se ainda não tem) ----------------
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }

      const { data } = await supabase.rpc("meu_contexto");
      const ctx = Array.isArray(data) ? data[0] : data;
      if (!ctx) { navigate("/auth"); return; }

      setPrimeiroNome(String(ctx.nome ?? "").trim().split(/\s+/)[0] ?? "");

      let cid = ctx.clinica_id as string | null;
      if (!cid) {
        const nome = localStorage.getItem("pending_clinic_name") ?? `Clínica de ${ctx.nome ?? "nova"}`;
        const telefone = localStorage.getItem("pending_clinic_phone");
        const { data: novo, error } = await supabase.rpc("criar_clinica_para_usuario", {
          p_nome_clinica: nome, p_telefone: telefone, p_email: ctx.email,
        });
        if (error || !novo) { toast.error("Erro ao criar clínica", { description: error?.message }); navigate("/auth"); return; }
        localStorage.removeItem("pending_clinic_name");
        localStorage.removeItem("pending_clinic_phone");
        cid = novo as string;
      }
      setClinicaId(cid);

      const { data: cl } = await supabase.from("clinicas").select("nome_clinica").eq("id", cid).maybeSingle();
      setNomeClinica(cl?.nome_clinica ?? "sua clínica");
      setPronto(true);
    })();
  }, [navigate]);

  const passos: Passo[] = useMemo(() => {
    const clinica = nomeClinica || "sua clínica";
    const oi = primeiroNome ? `Oi, ${primeiroNome}! ` : "Oi! ";
    return [
      {
        id: "intro",
        titulo: `${oi}Sou a Clara 🦷 Vou deixar a ${clinica} pronta em 1 minutinho.`,
        opcoes: [{ valor: "ok", rotulo: "Bora começar ✨" }],
      },
      {
        id: "funcao", titulo: "Primeiro: qual a sua função na clínica?",
        opcoes: [
          { valor: "dentista", rotulo: "Dentista" },
          { valor: "gestor", rotulo: "Dono(a) / Gestor(a)" },
          { valor: "secretaria", rotulo: "Secretária(o) / Recepção" },
          { valor: "outro", rotulo: "Outro" },
        ],
      },
      {
        id: "organizacao", titulo: "Como a clínica se organiza hoje?",
        opcoes: [
          { valor: "sistema", rotulo: "Outro sistema" },
          { valor: "planilhas", rotulo: "Planilhas" },
          { valor: "papel", rotulo: "Papel e caneta" },
          { valor: "novo", rotulo: "Começando agora" },
        ],
      },
      {
        id: "dores", titulo: "O que você quer resolver primeiro?", subtitulo: "Pode marcar mais de uma.", multipla: true,
        opcoes: [
          { valor: "organizacao", rotulo: "Organização" },
          { valor: "faltas", rotulo: "Faltas na agenda" },
          { valor: "manual", rotulo: "Processos manuais" },
          { valor: "relatorios", rotulo: "Relatórios pra decidir" },
          { valor: "captacao", rotulo: "Captar pacientes" },
          { valor: "orcamentos", rotulo: "Orçamentos parados" },
        ],
      },
      {
        id: "cadeiras", titulo: "Quantas cadeiras vocês têm?", subtitulo: "Deixo o consultório pronto pra elas.",
        opcoes: [
          { valor: "1", rotulo: "1" }, { valor: "2", rotulo: "2" },
          { valor: "3", rotulo: "3" }, { valor: "4+", rotulo: "4 ou mais" },
        ],
      },
      {
        id: "especialidades", titulo: "Quais especialidades vocês atendem?", subtitulo: "Marque quantas quiser.", multipla: true,
        opcoes: ESP_ODONTO.map((e) => ({ valor: e, rotulo: e })),
      },
      {
        id: "dias", titulo: "Em quais dias a clínica atende?", multipla: true,
        opcoes: DIAS,
      },
      {
        id: "horario", titulo: "E qual o horário de atendimento?",
        opcoes: [
          { valor: "08-18", rotulo: "08h às 18h" },
          { valor: "09-19", rotulo: "09h às 19h" },
          { valor: "comercial", rotulo: "Comercial (08–12 · 14–18)" },
          { valor: "depois", rotulo: "Defino depois" },
        ],
      },
    ];
  }, [primeiroNome, nomeClinica]);

  const passo = passos[i];
  const fim = i >= passos.length;

  useEffect(() => { if (fim && !salvando) void salvar(); /* eslint-disable-next-line */ }, [fim]);

  async function salvar() {
    if (!clinicaId) return;
    setSalvando(true);
    try {
      const dias = resp["dias"] ?? [];
      const [ini, fimH] = FAIXAS[resp["horario"]?.[0] ?? "08-18"] ?? ["08:00", "18:00"];
      const ordem = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"];
      const horarios = Object.fromEntries(
        ordem.map((d) => [d, { ativo: dias.includes(d), inicio: ini, fim: fimH }]),
      );

      // 1) segmentação + horários na clínica
      const { error: e1 } = await supabase.from("clinicas").update({
        segmentacao: {
          funcao: resp["funcao"]?.[0] ?? null,
          organizacao: resp["organizacao"]?.[0] ?? null,
          dores: resp["dores"] ?? [],
          cadeiras: resp["cadeiras"]?.[0] ?? null,
          capturado_em: new Date().toISOString(),
        },
        horario_funcionamento: horarios,
      }).eq("id", clinicaId);
      if (e1) throw e1;

      // 2) especialidades → especialidades + clinica_especialidades (batch)
      const nomes = resp["especialidades"] ?? [];
      if (nomes.length) {
        const { data: existentes } = await supabase.from("especialidades").select("id, nome").in("nome", nomes);
        const mapa = new Map((existentes ?? []).map((e) => [e.nome, e.id]));
        const novas = nomes.filter((n) => !mapa.has(n)).map((nome) => ({ nome }));
        if (novas.length) {
          const { data: criadas, error } = await supabase.from("especialidades").insert(novas).select("id, nome");
          if (error) throw error;
          (criadas ?? []).forEach((e) => mapa.set(e.nome, e.id));
        }
        const vinculos = nomes
          .map((n) => ({ clinica_id: clinicaId, especialidade_id: mapa.get(n) }))
          .filter((v): v is { clinica_id: string; especialidade_id: string } => Boolean(v.especialidade_id));
        if (vinculos.length) {
          const { error } = await supabase.from("clinica_especialidades")
            .upsert(vinculos, { onConflict: "clinica_id,especialidade_id", ignoreDuplicates: true });
          if (error) throw error;
        }
      }

      toast.success("Tudo pronto! Sua clínica está configurada 🎉");
      setTimeout(() => navigate("/dashboard"), 1400);
    } catch (err: any) {
      toast.error("Não consegui salvar tudo", { description: err.message ?? "Tente de novo." });
      setSalvando(false);
      setI(passos.length - 1); // volta pro último passo pra tentar de novo
    }
  }

  if (!pronto) {
    return (
      <div className="onb-shell">
        <ClaraOrb size={96} />
        <p className="onb-subtitle mt-4">Preparando tudo…</p>
      </div>
    );
  }

  if (fim) {
    return (
      <div className="onb-shell">
        <div className="relative z-10 flex flex-col items-center text-center">
          <ClaraOrb size={110} className="mb-4" />
          <h1 className="onb-title">Deixando tudo pronto…</h1>
          <p className="onb-subtitle mt-1 inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Salvando as respostas da {nomeClinica}
          </p>
        </div>
      </div>
    );
  }

  return (
    <OnboardingStep
      key={passo.id}
      titulo={passo.titulo}
      subtitulo={passo.subtitulo}
      opcoes={passo.opcoes}
      multipla={passo.multipla}
      orbSize={i === 0 ? 120 : 84}
      onVoltar={i > 0 ? () => setI(i - 1) : undefined}
      onResponder={(vals) => {
        setResp((r) => ({ ...r, [passo.id]: vals }));
        setI(i + 1);
      }}
    />
  );
}
