import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, MapPin, PieChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { traduzErro } from "@/lib/erros";
import {
  localidades, segmentacao, dinheiro,
  type Localidade, type ItemSegmentacao,
} from "@/services/plataforma";

// ============================================================================
// Mercado — onde elas estão e quem elas são
// ----------------------------------------------------------------------------
// Duas perguntas que mudam decisão de investimento:
//   · concentração geográfica  → onde anunciar, onde tem boca a boca funcionando
//   · perfil declarado          → com quem estamos falando de verdade, segundo o
//                                 que a própria clínica respondeu no onboarding
//
// A segmentação sai do jsonb que a Clara coleta. Se ninguém respondeu ainda, a
// tela diz isso em vez de mostrar gráfico vazio fingindo que há dado.
// ============================================================================

const PERGUNTAS: Record<string, string> = {
  funcao: "Quem cadastrou",
  organizacao: "Como se organiza hoje",
  dores: "O que quer resolver",
  cadeiras: "Cadeiras na clínica",
  capturado_em: "",   // metadado do onboarding, não é resposta
};

export default function Mercado() {
  const navigate = useNavigate();
  const [locais, setLocais] = useState<Localidade[]>([]);
  const [segm, setSegm] = useState<ItemSegmentacao[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [l, s] = await Promise.all([localidades(), segmentacao()]);
        if (!vivo) return;
        setLocais(l);
        setSegm(s.filter((x) => PERGUNTAS[x.pergunta] !== ""));
      } catch (e) {
        if (vivo) toast.error("Não foi possível carregar", { description: traduzErro(e) });
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  // Agrega por estado a partir do detalhe cidade a cidade, para ter as duas
  // leituras sem uma segunda ida ao banco.
  const porEstado = useMemo(() => {
    const m = new Map<string, { estado: string; clinicas: number; pagantes: number; mrr: number; usuarios: number; cidades: number }>();
    for (const l of locais) {
      const a = m.get(l.estado) ?? { estado: l.estado, clinicas: 0, pagantes: 0, mrr: 0, usuarios: 0, cidades: 0 };
      a.clinicas += l.clinicas; a.pagantes += l.pagantes; a.mrr += Number(l.mrr); a.usuarios += l.usuarios;
      if (l.cidade !== "—") a.cidades += 1;
      m.set(l.estado, a);
    }
    return [...m.values()].sort((x, y) => y.clinicas - x.clinicas);
  }, [locais]);

  const totalClinicas = porEstado.reduce((s, e) => s + e.clinicas, 0);

  const grupos = useMemo(() => {
    const m = new Map<string, ItemSegmentacao[]>();
    for (const s of segm) {
      const arr = m.get(s.pergunta) ?? [];
      arr.push(s);
      m.set(s.pergunta, arr);
    }
    return [...m.entries()];
  }, [segm]);

  if (carregando) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ geografia */}
      <Card className="border-gray-100 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-brand-600" />Onde estão as clínicas
          </CardTitle>
          <p className="text-xs text-gray-500">
            Estado a estado. Clique para ver a lista daquele estado.
          </p>
        </CardHeader>
        <CardContent>
          {porEstado.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">Nenhuma clínica cadastrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {porEstado.map((e) => {
                const pct = totalClinicas > 0 ? (e.clinicas / totalClinicas) * 100 : 0;
                return (
                  <button
                    key={e.estado}
                    onClick={() => e.estado !== "—" && navigate(`/plataforma/contas?uf=${e.estado}`)}
                    className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium">
                        {e.estado === "—" ? "Sem estado informado" : e.estado}
                      </span>
                      <span className="text-gray-500">
                        {e.clinicas} {e.clinicas === 1 ? "clínica" : "clínicas"}
                        {e.pagantes > 0 && ` · ${e.pagantes} pagando`}
                        {e.mrr > 0 && ` · ${dinheiro(e.mrr)}/mês`}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-brand-500 transition-all"
                        style={{ width: `${Math.max(pct, 2)}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {locais.filter((l) => l.cidade !== "—").length > 0 && (
            <div className="mt-5 border-t border-gray-100 pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                Principais cidades
              </p>
              <div className="flex flex-wrap gap-1.5">
                {locais.filter((l) => l.cidade !== "—").slice(0, 20).map((l, i) => (
                  <span key={i} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600">
                    {l.cidade}{l.estado !== "—" && `/${l.estado}`}
                    <strong className="ml-1 text-gray-900">{l.clinicas}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------ perfil */}
      <Card className="border-gray-100 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <PieChart className="h-4 w-4 text-brand-600" />Quem são essas clínicas
          </CardTitle>
          <p className="text-xs text-gray-500">
            O que elas mesmas responderam no primeiro acesso.
          </p>
        </CardHeader>
        <CardContent>
          {grupos.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              Nenhuma clínica respondeu as perguntas de boas-vindas ainda.
            </p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {grupos.map(([pergunta, itens]) => {
                const maior = Math.max(...itens.map((i) => i.clinicas));
                return (
                  <div key={pergunta}>
                    <p className="mb-2 text-sm font-medium text-gray-900">
                      {PERGUNTAS[pergunta] ?? pergunta}
                    </p>
                    <div className="space-y-1.5">
                      {itens.slice(0, 8).map((i) => (
                        <div key={i.resposta}>
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate capitalize text-gray-700">{i.resposta}</span>
                            <span className="shrink-0 text-gray-500">{i.clinicas} · {i.pct}%</span>
                          </div>
                          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full bg-brand-400"
                              style={{ width: `${Math.max((i.clinicas / maior) * 100, 3)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
