import { traduzErro } from "@/lib/erros";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { OnboardingStep, type Opcao } from "@/components/onboarding/OnboardingStep";
import { OnboardingTextStep } from "@/components/onboarding/OnboardingTextStep";
import { ClaraOrb } from "@/components/onboarding/ClaraOrb";
import { Loader2 } from "lucide-react";
import "@/components/onboarding/onboarding.css";

// ============================================================================
// Onboarding conversacional (Clara / orbe) — /configurar-clinica
// ----------------------------------------------------------------------------
// Reencena o onboarding da referência (Codental) COM a nossa marca: a Clara
// coleta segmentação + os dados que montam a conta (nome, endereço por CEP,
// equipe, especialidades, cadeiras, horário) — tudo por orbe, cards e texto.
// Adapta ao que já sabemos (não repergunta nome do usuário nem telefone).
// O onboarding É o setup: cadeiras viram cadeiras, especialidades viram
// vínculos, respostas de segmentação vão pra clinicas.segmentacao (0035/0036).
// ============================================================================

const ESP_ODONTO = [
  "Clínico Geral", "Ortodontia", "Implantodontia", "Endodontia", "Periodontia",
  "Odontopediatria", "Prótese Dentária", "Cirurgia Oral", "Dentística / Estética",
  "Harmonização Orofacial", "Radiologia Odontológica", "DTM",
];

const DIAS: Opcao[] = [
  { valor: "segunda", rotulo: "Seg" }, { valor: "terca", rotulo: "Ter" },
  { valor: "quarta", rotulo: "Qua" }, { valor: "quinta", rotulo: "Qui" },
  { valor: "sexta", rotulo: "Sex" }, { valor: "sabado", rotulo: "Sáb" },
  { valor: "domingo", rotulo: "Dom" },
];

const FAIXAS: Record<string, [string, string]> = {
  "08-18": ["08:00", "18:00"], "09-19": ["09:00", "19:00"],
  comercial: ["08:00", "18:00"], depois: ["08:00", "18:00"],
};

const CADEIRAS_N: Record<string, number> = { "1": 1, "2": 2, "3": 3, "4+": 4 };

type Resp = Record<string, string[]>;
type Ctx = { nome: string; resp: Resp };

type Step =
  | { id: string; tipo: "opcoes"; titulo: (c: Ctx) => string; subtitulo?: string; opcoes: Opcao[]; multipla?: boolean; quando?: (r: Resp) => boolean }
  | { id: string; tipo: "texto"; titulo: (c: Ctx) => string; subtitulo?: string; placeholder?: string; opcional?: boolean; formato?: "texto" | "email" | "cep"; quando?: (r: Resp) => boolean };

const um = (r: Resp, id: string) => r[id]?.[0];

const STEPS: Step[] = [
  { id: "intro", tipo: "opcoes",
    titulo: ({ nome }) => `${nome ? `Oi, ${nome}! ` : "Oi! "}Sou a Clara 🦷 Vou montar sua clínica em 1 minutinho.`,
    opcoes: [{ valor: "ok", rotulo: "Bora começar ✨" }] },

  { id: "funcao", tipo: "opcoes", titulo: () => "Qual a sua função na clínica?",
    opcoes: [
      { valor: "dentista", rotulo: "Dentista" }, { valor: "gestor", rotulo: "Dono(a) / Gestor(a)" },
      { valor: "secretaria", rotulo: "Secretária(o) / Recepção" }, { valor: "outro", rotulo: "Outro" },
    ] },

  { id: "como_conheceu", tipo: "opcoes", titulo: () => "Como você conheceu o Sorrimax?",
    opcoes: [
      { valor: "google", rotulo: "Google" }, { valor: "instagram", rotulo: "Instagram" },
      { valor: "indicacao", rotulo: "Indicação" }, { valor: "youtube", rotulo: "YouTube" },
      { valor: "evento", rotulo: "Evento" }, { valor: "outro", rotulo: "Outro" },
    ] },

  { id: "organizacao", tipo: "opcoes", titulo: () => "Como a clínica se organiza hoje?",
    opcoes: [
      { valor: "sistema", rotulo: "Outro sistema" }, { valor: "planilhas", rotulo: "Planilhas" },
      { valor: "papel", rotulo: "Papel e caneta" }, { valor: "novo", rotulo: "Começando agora" },
    ] },

  { id: "qual_sistema", tipo: "opcoes", titulo: () => "Qual sistema vocês usam hoje?",
    quando: (r) => um(r, "organizacao") === "sistema",
    opcoes: [
      { valor: "simples_dental", rotulo: "Simples Dental" }, { valor: "clinicorp", rotulo: "Clinicorp" },
      { valor: "capim", rotulo: "Capim" }, { valor: "dental_office", rotulo: "Dental Office" },
      { valor: "controle_odonto", rotulo: "Controle Odonto" }, { valor: "outro", rotulo: "Outro" },
    ] },

  { id: "importar", tipo: "opcoes", titulo: () => "Quer trazer seus dados pra cá?",
    quando: (r) => um(r, "organizacao") !== "novo",
    opcoes: [{ valor: "sim", rotulo: "Sim, quero importar" }, { valor: "nao", rotulo: "Agora não" }] },

  { id: "tamanho_equipe", tipo: "opcoes", titulo: () => "Quantas pessoas na equipe?",
    opcoes: [
      { valor: "solo", rotulo: "Somente eu" }, { valor: "2", rotulo: "2" },
      { valor: "3", rotulo: "3" }, { valor: "4", rotulo: "4" }, { valor: "5+", rotulo: "5 ou mais" },
    ] },

  { id: "convite_email", tipo: "texto", formato: "email", opcional: true,
    quando: (r) => !!um(r, "tamanho_equipe") && um(r, "tamanho_equipe") !== "solo",
    titulo: () => "Quer já convidar alguém da equipe?", subtitulo: "Coloque o e-mail — ou pule por agora.",
    placeholder: "email@daequipe.com" },

  { id: "especialidades", tipo: "opcoes", multipla: true, titulo: () => "Quais especialidades vocês atendem?",
    subtitulo: "Marque quantas quiser.", opcoes: ESP_ODONTO.map((e) => ({ valor: e, rotulo: e })) },

  { id: "dores", tipo: "opcoes", multipla: true, titulo: () => "O que você quer resolver primeiro?",
    subtitulo: "Pode marcar mais de uma.",
    opcoes: [
      { valor: "organizacao", rotulo: "Organização" }, { valor: "faltas", rotulo: "Faltas na agenda" },
      { valor: "manual", rotulo: "Processos manuais" }, { valor: "relatorios", rotulo: "Relatórios pra decidir" },
      { valor: "captacao", rotulo: "Captar pacientes" }, { valor: "orcamentos", rotulo: "Orçamentos parados" },
    ] },

  { id: "nome_clinica", tipo: "texto", titulo: ({ nome }) => `Qual é o nome da sua clínica${nome ? `, ${nome}` : ""}?`,
    placeholder: "Ex: Clínica Sorriso" },

  { id: "cep", tipo: "texto", formato: "cep", opcional: true,
    titulo: ({ resp }) => `${um(resp, "nome_clinica") || "Sua clínica"} 💙`,
    subtitulo: "Qual o CEP? Eu completo o endereço. (dá pra pular)", placeholder: "00000-000" },

  { id: "cadeiras", tipo: "opcoes", titulo: () => "Quantas cadeiras vocês têm?",
    subtitulo: "Já deixo o consultório pronto pra elas.",
    opcoes: [
      { valor: "1", rotulo: "1" }, { valor: "2", rotulo: "2" },
      { valor: "3", rotulo: "3" }, { valor: "4+", rotulo: "4 ou mais" },
    ] },

  { id: "dias", tipo: "opcoes", multipla: true, titulo: () => "Em quais dias a clínica atende?", opcoes: DIAS },

  { id: "horario", tipo: "opcoes", titulo: () => "E qual o horário de atendimento?",
    opcoes: [
      { valor: "08-18", rotulo: "08h às 18h" }, { valor: "09-19", rotulo: "09h às 19h" },
      { valor: "comercial", rotulo: "Comercial (08–12 · 14–18)" }, { valor: "depois", rotulo: "Defino depois" },
    ] },
];

async function buscarCep(cep: string) {
  const limpo = cep.replace(/\D/g, "");
  if (limpo.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
    const j = await r.json();
    if (j?.erro) return null;
    return { endereco: j.logradouro || null, bairro: j.bairro || null, cidade: j.localidade || null, estado: j.uf || null };
  } catch { return null; }
}

export default function OnboardingClinica() {
  const navigate = useNavigate();
  const [clinicaId, setClinicaId] = useState<string | null>(null);
  const [primeiroNome, setPrimeiroNome] = useState("");
  const [pronto, setPronto] = useState(false);

  const [i, setI] = useState(0);
  const [resp, setResp] = useState<Resp>({});
  const [salvando, setSalvando] = useState(false);

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
      setPronto(true);
    })();
  }, [navigate]);

  const ctx: Ctx = useMemo(() => ({ nome: primeiroNome, resp }), [primeiroNome, resp]);

  const aplicavel = (s: Step) => !s.quando || s.quando(resp);
  const step = STEPS[i];
  const fim = i >= STEPS.length;

  const avancar = (novoResp: Resp) => {
    let j = i + 1;
    while (j < STEPS.length && STEPS[j].quando && !STEPS[j].quando!(novoResp)) j++;
    setI(j);
  };
  const voltar = () => {
    let j = i - 1;
    while (j >= 0 && STEPS[j].quando && !STEPS[j].quando!(resp)) j--;
    if (j >= 0) setI(j);
  };
  const responder = (vals: string[]) => {
    const novo = { ...resp, [step.id]: vals };
    setResp(novo);
    avancar(novo);
  };

  useEffect(() => { if (fim && !salvando) void salvar(); /* eslint-disable-next-line */ }, [fim]);

  async function salvar() {
    if (!clinicaId) return;
    setSalvando(true);
    try {
      const dias = resp["dias"] ?? [];
      const [ini, fimH] = FAIXAS[um(resp, "horario") ?? "08-18"] ?? ["08:00", "18:00"];
      const ordem = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"];
      const horarios = Object.fromEntries(ordem.map((d) => [d, { ativo: dias.includes(d), inicio: ini, fim: fimH }]));

      const cep = um(resp, "cep");
      const end = cep ? await buscarCep(cep) : null;

      // 1) clínica: nome, endereço, horários, segmentação
      const patch: Record<string, unknown> = {
        horario_funcionamento: horarios,
        segmentacao: {
          funcao: um(resp, "funcao") ?? null,
          como_conheceu: um(resp, "como_conheceu") ?? null,
          organizacao: um(resp, "organizacao") ?? null,
          sistema_atual: um(resp, "qual_sistema") ?? null,
          quer_importar: um(resp, "importar") === "sim",
          tamanho_equipe: um(resp, "tamanho_equipe") ?? null,
          convite_equipe: um(resp, "convite_email") || null,
          dores: resp["dores"] ?? [],
          cadeiras: um(resp, "cadeiras") ?? null,
          capturado_em: new Date().toISOString(),
        },
      };
      const nomeCl = um(resp, "nome_clinica");
      if (nomeCl) patch.nome_clinica = nomeCl;
      if (cep) patch.cep = cep;
      if (end) { patch.endereco = end.endereco; patch.bairro = end.bairro; patch.cidade = end.cidade; patch.estado = end.estado; }

      const { error: e1 } = await supabase.from("clinicas").update(patch).eq("id", clinicaId);
      if (e1) throw e1;

      // 2) cadeiras reais (só se ainda não houver nenhuma — não duplica no re-run)
      const alvo = CADEIRAS_N[um(resp, "cadeiras") ?? ""] ?? 0;
      if (alvo > 0) {
        const { count } = await supabase.from("cadeiras").select("id", { count: "exact", head: true }).eq("clinica_id", clinicaId);
        if ((count ?? 0) === 0) {
          const novas = Array.from({ length: alvo }, (_, k) => ({ clinica_id: clinicaId, nome: `Cadeira ${String(k + 1).padStart(2, "0")}` }));
          await supabase.from("cadeiras").insert(novas);
        }
      }

      // 3) especialidades → especialidades + clinica_especialidades (batch)
      const nomes = resp["especialidades"] ?? [];
      if (nomes.length) {
        const { data: existentes } = await supabase.from("especialidades").select("id, nome").in("nome", nomes);
        const mapa = new Map((existentes ?? []).map((e) => [e.nome, e.id]));
        const criar = nomes.filter((n) => !mapa.has(n)).map((nome) => ({ nome }));
        if (criar.length) {
          const { data: criadas, error } = await supabase.from("especialidades").insert(criar).select("id, nome");
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

      toast.success("Tudo pronto! Sua clínica está montada 🎉");
      setTimeout(() => navigate("/dashboard"), 1600);
    } catch (err: any) {
      toast.error("Não consegui salvar tudo", { description: traduzErro(err) ?? "Tente de novo." });
      setSalvando(false);
      setI(STEPS.length - 1);
    }
  }

  if (!pronto) {
    return <div className="onb-shell"><ClaraOrb size={96} /><p className="onb-subtitle mt-4">Preparando tudo…</p></div>;
  }

  if (fim) {
    return (
      <div className="onb-shell">
        <div className="relative z-10 flex flex-col items-center text-center">
          <ClaraOrb size={110} className="mb-4" />
          <h1 className="onb-title">Montando sua clínica…</h1>
          <p className="onb-subtitle mt-1 inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Guardando tudo que a gente conversou
          </p>
        </div>
      </div>
    );
  }

  if (!aplicavel(step)) { // segurança: se caiu num passo não aplicável, avança
    avancar(resp);
    return null;
  }

  const orbSize = i === 0 ? 120 : 84;
  const onVoltar = i > 0 ? voltar : undefined;

  if (step.tipo === "texto") {
    return (
      <OnboardingTextStep
        key={step.id}
        titulo={step.titulo(ctx)}
        subtitulo={step.subtitulo}
        placeholder={step.placeholder}
        opcional={step.opcional}
        formato={step.formato}
        orbSize={orbSize}
        onVoltar={onVoltar}
        onResponder={(valor) => responder(valor ? [valor] : [])}
      />
    );
  }

  return (
    <OnboardingStep
      key={step.id}
      titulo={step.titulo(ctx)}
      subtitulo={step.subtitulo}
      opcoes={step.opcoes}
      multipla={step.multipla}
      orbSize={orbSize}
      onVoltar={onVoltar}
      onResponder={responder}
    />
  );
}
