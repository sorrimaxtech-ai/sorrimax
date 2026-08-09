import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, CalendarCheck, Stethoscope, Check, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  perfilBooking, slotsBooking, agendarBooking,
  type PerfilBooking, type ProfissionalPublico, type SlotPublico,
} from "@/services/booking";
import { cn } from "@/lib/utils";

// ============================================================================
// /c/:slug — página pública de agendamento (o paciente marca sozinho)
// ----------------------------------------------------------------------------
// Fecha o link morto que a clínica divulgava. Anônima, mobile-first (paciente
// marca pelo celular). Passos: escolher profissional → dia → horário → dados.
// A marcação nasce PENDENTE; a clínica confirma na agenda.
// ============================================================================

const proximosDias = (n: number) => {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => new Date(hoje.getTime() + i * 864e5));
};

export default function AgendamentoPublico() {
  const { slug = "" } = useParams();
  const [perfil, setPerfil] = useState<PerfilBooking | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [prof, setProf] = useState<ProfissionalPublico | null>(null);
  const [dia, setDia] = useState<Date | null>(null);
  const [slots, setSlots] = useState<SlotPublico[]>([]);
  const [carregandoSlots, setCarregandoSlots] = useState(false);
  const [slot, setSlot] = useState<SlotPublico | null>(null);

  const [nome, setNome] = useState("");
  const [celular, setCelular] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setPerfil(await perfilBooking(slug));
      } catch {
        setPerfil({ encontrado: false });
      } finally {
        setCarregando(false);
      }
    })();
  }, [slug]);

  useEffect(() => {
    if (!prof || !dia) { setSlots([]); return; }
    let vivo = true;
    setCarregandoSlots(true);
    setSlot(null);
    (async () => {
      try {
        const s = await slotsBooking(slug, prof.id, format(dia, "yyyy-MM-dd"));
        if (vivo) setSlots(s);
      } catch {
        if (vivo) setSlots([]);
      } finally {
        if (vivo) setCarregandoSlots(false);
      }
    })();
    return () => { vivo = false; };
  }, [prof, dia, slug]);

  const dias = useMemo(() => proximosDias(14), []);

  const confirmar = async () => {
    if (!prof || !slot) return;
    setErro(null);
    if (nome.trim().length < 2) { setErro("Informe seu nome."); return; }
    if (celular.replace(/\D/g, "").length < 10) { setErro("Informe um celular com DDD."); return; }
    if (!nascimento) { setErro("Informe sua data de nascimento."); return; }
    setEnviando(true);
    try {
      const r = await agendarBooking({
        slug, profissionalId: prof.id, inicio: slot.inicio,
        nome: nome.trim(), celular, nascimento,
      });
      if (r.ok) setPronto(true);
      else setErro(r.erro ?? "Não foi possível agendar.");
    } catch (e: any) {
      setErro(e.message ?? "Falha ao agendar.");
    } finally {
      setEnviando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-white">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!perfil?.encontrado) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-gradient-to-br from-brand-50 to-white p-6 text-center">
        <CalendarCheck className="h-10 w-10 text-brand-300" />
        <p className="text-lg font-semibold">Agendamento indisponível</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Este link não está mais ativo ou a clínica não está aceitando agendamento online no momento.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white">
      <div className="mx-auto max-w-lg px-4 py-8">
        {/* Cabeçalho da clínica */}
        <header className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg">
            <Stethoscope className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">{perfil.nome_clinica}</h1>
          {perfil.bio && <p className="mt-1 text-sm text-muted-foreground">{perfil.bio}</p>}
        </header>

        {pronto ? (
          <div className="rounded-2xl border border-emerald-100 bg-white p-8 text-center shadow-sm">
            <Check className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
            <p className="text-lg font-bold">Solicitação enviada!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {prof?.nome} · {slot && format(new Date(slot.inicio), "EEEE, dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              A clínica vai confirmar seu horário e entrar em contato pelo WhatsApp.
            </p>
          </div>
        ) : (
          <div className="space-y-5 rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
            {/* 1. Profissional */}
            <div>
              <Label className="mb-2 block text-sm font-semibold">1. Escolha o profissional</Label>
              <div className="grid gap-2">
                {perfil.profissionais?.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setProf(p); setDia(null); setSlot(null); }}
                    className={cn(
                      "rounded-xl border p-3 text-left transition",
                      prof?.id === p.id ? "border-brand-500 bg-brand-50" : "border-border hover:bg-muted/50",
                    )}
                  >
                    <p className="font-semibold">{p.nome}</p>
                    {p.especialidade && <p className="text-xs text-muted-foreground">{p.especialidade}</p>}
                  </button>
                ))}
                {(!perfil.profissionais || perfil.profissionais.length === 0) && (
                  <p className="text-sm text-muted-foreground">Nenhum profissional disponível.</p>
                )}
              </div>
            </div>

            {/* 2. Dia */}
            {prof && (
              <div>
                <Label className="mb-2 block text-sm font-semibold">2. Escolha o dia</Label>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {dias.map((d) => (
                    <button
                      key={d.toISOString()}
                      onClick={() => setDia(d)}
                      className={cn(
                        "flex min-w-[56px] shrink-0 flex-col items-center rounded-xl border p-2 transition",
                        dia?.toDateString() === d.toDateString() ? "border-brand-500 bg-brand-50 text-brand-700" : "border-border hover:bg-muted/50",
                      )}
                    >
                      <span className="text-[10px] uppercase text-muted-foreground">{format(d, "EEE", { locale: ptBR }).replace(".", "")}</span>
                      <span className="text-lg font-bold">{format(d, "d")}</span>
                      <span className="text-[10px] text-muted-foreground">{format(d, "MMM", { locale: ptBR })}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Horário */}
            {prof && dia && (
              <div>
                <Label className="mb-2 block text-sm font-semibold">3. Escolha o horário</Label>
                {carregandoSlots ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : slots.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">Sem horários livres neste dia. Tente outro.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {slots.map((s) => (
                      <button
                        key={s.inicio}
                        onClick={() => setSlot(s)}
                        className={cn(
                          "rounded-lg border py-2 text-sm font-medium transition",
                          slot?.inicio === s.inicio ? "border-brand-500 bg-brand-600 text-white" : "border-border hover:bg-muted/50",
                        )}
                      >
                        {format(new Date(s.inicio), "HH:mm")}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 4. Dados */}
            {slot && (
              <div className="space-y-3 border-t border-border pt-4">
                <Label className="block text-sm font-semibold">4. Seus dados</Label>
                <Input placeholder="Seu nome completo" value={nome} onChange={(e) => setNome(e.target.value)} />
                <Input placeholder="Celular com DDD" value={celular} onChange={(e) => setCelular(e.target.value)} inputMode="tel" />
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">Data de nascimento</Label>
                  <Input type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} />
                </div>
                {erro && <p className="text-sm text-red-600">{erro}</p>}
                <Button className="w-full bg-brand-600 hover:bg-brand-700" disabled={enviando} onClick={confirmar}>
                  {enviando ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando…</> : "Confirmar agendamento"}
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  Você recebe a confirmação da clínica pelo WhatsApp.
                </p>
              </div>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">Agendamento online por Sorrimax</p>
      </div>
    </div>
  );
}
