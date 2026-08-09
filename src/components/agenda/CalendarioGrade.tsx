import { useMemo } from "react";
import {
  addDays, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
  isToday, startOfDay, startOfMonth, startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarX2 } from "lucide-react";
import {
  COR_PADRAO_PROCEDIMENTO, STATUS_CONSULTA_COR, STATUS_CONSULTA_LABEL, STATUS_INATIVOS,
  minutosParaHora, type BloqueioAgenda, type CadeiraAgenda, type ConsultaAgenda,
  type FaixaHoraria, type ProcedimentoAgenda, type ProfissionalAgenda,
} from "@/services/agenda";

export type VisaoAgenda = "dia" | "semana" | "mes";
export type AgrupamentoDia = "nenhum" | "profissional" | "cadeira";

interface Props {
  visao: VisaoAgenda;
  referencia: Date;
  faixa: FaixaHoraria;
  consultas: ConsultaAgenda[];
  bloqueios: BloqueioAgenda[];
  procedimentosPorId: Record<string, ProcedimentoAgenda>;
  profissionaisPorId: Record<string, ProfissionalAgenda>;
  profissionais: ProfissionalAgenda[];
  cadeiras: CadeiraAgenda[];
  agrupamentoDia: AgrupamentoDia;
  onSlotVazio: (inicio: Date, ctx: { profissionalId?: string | null; cadeiraId?: string | null }) => void;
  onAbrirConsulta: (consulta: ConsultaAgenda) => void;
  onSelecionarDia: (dia: Date) => void;
}

/** Escala vertical da grade. 1.4px por minuto = 42px por slot de 30min: cabe
 *  "09:00 · Nome do paciente" em duas linhas sem cortar. */
const COR_COMPROMISSO = "#94a3b8";
const PX_POR_MIN = 1.4;
const LARGURA_REGUA = 60;
const SEM_CADEIRA = "__sem_cadeira__";

/** Hachura do bloqueio — CSS puro, sem asset externo. */
const HACHURA_BLOQUEIO =
  "repeating-linear-gradient(45deg, #e5e7eb 0 6px, #f3f4f6 6px 12px)";

interface ColunaGrade {
  chave: string;
  titulo: string;
  subtitulo?: string;
  dia: Date;
  profissionalId?: string | null;
  cadeiraId?: string | null;
  destacada: boolean;
}

/**
 * Distribui blocos que se sobrepõem em colunas paralelas dentro da mesma coluna
 * de dia. Agrupa em "clusters" (cadeias de sobreposição) e só divide a largura
 * dentro do cluster — assim uma sobreposição às 9h não afina os blocos das 15h.
 */
function distribuirEmFaixas<T>(itens: { ref: T; ini: number; fim: number }[]) {
  const ordenados = [...itens].sort((a, b) => a.ini - b.ini || a.fim - b.fim);
  const saida: { ref: T; ini: number; fim: number; faixa: number; totalFaixas: number }[] = [];

  let cluster: typeof ordenados = [];
  let faixasDoCluster: number[] = []; // fim de cada faixa aberta
  let atribuicoes: number[] = [];

  const fecharCluster = () => {
    const total = Math.max(1, faixasDoCluster.length);
    cluster.forEach((c, i) => saida.push({ ...c, faixa: atribuicoes[i], totalFaixas: total }));
    cluster = [];
    faixasDoCluster = [];
    atribuicoes = [];
  };

  for (const it of ordenados) {
    const clusterVivo = faixasDoCluster.some((fim) => fim > it.ini);
    if (!clusterVivo && cluster.length) fecharCluster();

    let faixa = faixasDoCluster.findIndex((fim) => fim <= it.ini);
    if (faixa === -1) {
      faixasDoCluster.push(it.fim);
      faixa = faixasDoCluster.length - 1;
    } else {
      faixasDoCluster[faixa] = it.fim;
    }
    cluster.push(it);
    atribuicoes.push(faixa);
  }
  if (cluster.length) fecharCluster();

  return saida;
}

/** Minutos do intervalo [ini,fim] recortados na janela visível do dia. */
function recortarNoDia(ini: Date, fim: Date, dia: Date, faixa: FaixaHoraria) {
  const base = startOfDay(dia).getTime();
  const iniMin = (ini.getTime() - base) / 60000;
  const fimMin = (fim.getTime() - base) / 60000;
  const a = Math.max(iniMin, faixa.inicioMin);
  const b = Math.min(fimMin, faixa.fimMin);
  if (b <= a) return null;
  return { a, b };
}

const horaCurta = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export const CalendarioGrade = ({
  visao, referencia, faixa, consultas, bloqueios, procedimentosPorId,
  profissionaisPorId, profissionais, cadeiras, agrupamentoDia,
  onSlotVazio, onAbrirConsulta, onSelecionarDia,
}: Props) => {
  const alturaTotal = (faixa.fimMin - faixa.inicioMin) * PX_POR_MIN;

  const colunas = useMemo<ColunaGrade[]>(() => {
    if (visao === "semana") {
      const ini = startOfWeek(referencia, { weekStartsOn: 1 });
      return eachDayOfInterval({ start: ini, end: addDays(ini, 6) }).map((d) => ({
        chave: d.toISOString(),
        titulo: format(d, "EEE", { locale: ptBR }).replace(".", "").toUpperCase(),
        subtitulo: format(d, "dd/MM"),
        dia: d,
        destacada: isToday(d),
      }));
    }
    if (agrupamentoDia === "profissional") {
      return profissionais.map((p) => ({
        chave: p.id,
        titulo: p.full_name ?? "Sem nome",
        subtitulo: p.especialidade ?? undefined,
        dia: referencia,
        profissionalId: p.id,
        destacada: false,
      }));
    }
    if (agrupamentoDia === "cadeira") {
      return [
        ...cadeiras.map((c) => ({
          chave: c.id,
          titulo: c.nome,
          dia: referencia,
          cadeiraId: c.id,
          destacada: false,
        })),
        { chave: SEM_CADEIRA, titulo: "Sem cadeira", dia: referencia, cadeiraId: SEM_CADEIRA, destacada: false },
      ];
    }
    return [{
      chave: "dia-unico",
      titulo: format(referencia, "EEEE", { locale: ptBR }),
      subtitulo: format(referencia, "dd 'de' MMMM", { locale: ptBR }),
      dia: referencia,
      destacada: isToday(referencia),
    }];
  }, [visao, referencia, agrupamentoDia, profissionais, cadeiras]);

  const linhasDeSlot = useMemo(() => {
    const passo = faixa.slotMin > 0 ? faixa.slotMin : 30;
    const out: number[] = [];
    for (let m = faixa.inicioMin; m < faixa.fimMin; m += passo) out.push(m);
    return out;
  }, [faixa]);

  const horasDaRegua = useMemo(() => {
    const out: number[] = [];
    for (let m = Math.ceil(faixa.inicioMin / 60) * 60; m <= faixa.fimMin; m += 60) out.push(m);
    return out;
  }, [faixa]);

  // -------------------------------------------------------------- visão MÊS
  if (visao === "mes") {
    const inicioGrade = startOfWeek(startOfMonth(referencia), { weekStartsOn: 1 });
    const fimGrade = endOfWeek(endOfMonth(referencia), { weekStartsOn: 1 });
    const dias = eachDayOfInterval({ start: inicioGrade, end: fimGrade });

    return (
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-7 border-b border-gray-100">
            {["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map((d) => (
              <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {dias.map((dia) => {
              const doDia = consultas.filter((c) => isSameDay(new Date(c.inicio), dia));
              const ativas = doDia.filter((c) => !STATUS_INATIVOS.includes(c.status));
              const bloqueado = bloqueios.some((b) =>
                new Date(b.inicio) < addDays(startOfDay(dia), 1) && new Date(b.fim) > startOfDay(dia));
              const foraDoMes = !isSameMonth(dia, referencia);
              const cores = Array.from(new Set(doDia.map((c) =>
                procedimentosPorId[c.servico_id ?? ""]?.cor || COR_PADRAO_PROCEDIMENTO))).slice(0, 5);

              return (
                <button
                  key={dia.toISOString()}
                  type="button"
                  onClick={() => onSelecionarDia(dia)}
                  className={`min-h-[92px] border-b border-r border-gray-100 p-2 text-left align-top transition-colors hover:bg-emerald-50/50 ${
                    foraDoMes ? "bg-gray-50/60" : "bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold ${
                        isToday(dia)
                          ? "bg-emerald-600 text-white"
                          : foraDoMes ? "text-gray-300" : "text-gray-700"
                      }`}
                    >
                      {format(dia, "d")}
                    </span>
                    {bloqueado && <span className="text-[10px] text-gray-400">bloqueio</span>}
                  </div>

                  {ativas.length > 0 ? (
                    <p className="mt-1.5 text-xs font-medium text-gray-800">
                      {ativas.length} {ativas.length === 1 ? "consulta" : "consultas"}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-[11px] text-gray-300">—</p>
                  )}

                  {cores.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {cores.map((cor) => (
                        <span key={cor} className="h-2 w-2 rounded-full" style={{ backgroundColor: cor }} />
                      ))}
                      {doDia.length > cores.length && (
                        <span className="text-[10px] leading-none text-gray-400">+{doDia.length - cores.length}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------- visões DIA/SEMANA
  if (!colunas.length) {
    return (
      <div className="flex flex-col items-center gap-2 p-12 text-center">
        <CalendarX2 className="h-10 w-10 text-gray-300" />
        <p className="font-medium text-gray-800">Nada para exibir em colunas</p>
        <p className="text-sm text-gray-500">
          Cadastre {agrupamentoDia === "cadeira" ? "cadeiras" : "profissionais"} para usar este agrupamento,
          ou volte para a visão simples do dia.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className={visao === "semana" ? "min-w-[760px]" : "min-w-[420px]"}>
        {/* cabeçalho fora do scroll vertical, com a mesma régua de largura */}
        <div className="flex border-b border-gray-100">
          <div className="shrink-0" style={{ width: LARGURA_REGUA }} />
          {colunas.map((col) => (
            <div
              key={col.chave}
              className={`flex-1 border-l border-gray-100 px-2 py-2 text-center ${col.destacada ? "bg-emerald-50/60" : ""}`}
            >
              <p className={`text-xs font-semibold capitalize ${col.destacada ? "text-emerald-700" : "text-gray-700"}`}>
                {col.titulo}
              </p>
              {col.subtitulo && <p className="text-[11px] text-gray-400">{col.subtitulo}</p>}
            </div>
          ))}
        </div>

        <div className="max-h-[68vh] overflow-y-auto">
          <div className="flex">
            {/* régua de horas */}
            <div className="relative shrink-0" style={{ width: LARGURA_REGUA, height: alturaTotal }}>
              {horasDaRegua.map((m) => (
                <span
                  key={m}
                  className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-gray-400"
                  style={{ top: (m - faixa.inicioMin) * PX_POR_MIN }}
                >
                  {minutosParaHora(m)}
                </span>
              ))}
            </div>

            {colunas.map((col) => {
              const daColuna = consultas.filter((c) => {
                if (!isSameDay(new Date(c.inicio), col.dia)) return false;
                if (col.profissionalId) return c.profissional_id === col.profissionalId;
                if (col.cadeiraId) {
                  return col.cadeiraId === SEM_CADEIRA ? !c.cadeira_id : c.cadeira_id === col.cadeiraId;
                }
                return true;
              });

              const posicionadas = distribuirEmFaixas(
                daColuna
                  .map((c) => {
                    const corte = recortarNoDia(new Date(c.inicio), new Date(c.fim), col.dia, faixa);
                    return corte ? { ref: c, ini: corte.a, fim: corte.b } : null;
                  })
                  .filter(Boolean) as { ref: ConsultaAgenda; ini: number; fim: number }[],
              );

              const bloqueiosDaColuna = bloqueios
                .filter((bl) => {
                  // coluna de cadeira não tem dono: repetir o bloqueio pessoal de um
                  // profissional em toda cadeira faria a clínica parecer fechada
                  if (col.cadeiraId) return !bl.profissional_id;
                  if (col.profissionalId) return !bl.profissional_id || bl.profissional_id === col.profissionalId;
                  return true;
                })
                .map((bl) => {
                  const corte = recortarNoDia(new Date(bl.inicio), new Date(bl.fim), col.dia, faixa);
                  return corte ? { bloqueio: bl, iniMin: corte.a, fimMin: corte.b } : null;
                })
                .filter((x): x is { bloqueio: BloqueioAgenda; iniMin: number; fimMin: number } => x !== null);

              return (
                <div
                  key={col.chave}
                  className={`relative flex-1 border-l border-gray-100 ${col.destacada ? "bg-emerald-50/30" : ""}`}
                  style={{ height: alturaTotal }}
                >
                  {/* slots clicáveis — camada de fundo */}
                  {linhasDeSlot.map((m) => (
                    <button
                      key={m}
                      type="button"
                      title={`Agendar às ${minutosParaHora(m)}`}
                      onClick={() => {
                        const d = startOfDay(col.dia);
                        d.setMinutes(m);
                        onSlotVazio(d, {
                          profissionalId: col.profissionalId ?? null,
                          cadeiraId: col.cadeiraId && col.cadeiraId !== SEM_CADEIRA ? col.cadeiraId : null,
                        });
                      }}
                      className={`absolute left-0 right-0 w-full border-t transition-colors hover:bg-emerald-100/50 ${
                        m % 60 === 0 ? "border-gray-200" : "border-gray-100 border-dashed"
                      }`}
                      style={{
                        top: (m - faixa.inicioMin) * PX_POR_MIN,
                        height: (faixa.slotMin || 30) * PX_POR_MIN,
                      }}
                    />
                  ))}

                  {/* bloqueios — faixa cinza hachurada, acima do fundo e abaixo das consultas */}
                  {bloqueiosDaColuna.map(({ bloqueio, iniMin, fimMin }) => (
                    <div
                      key={`${bloqueio.id}-${col.chave}`}
                      title={bloqueio.motivo ? `Bloqueio: ${bloqueio.motivo}` : "Horário bloqueado"}
                      className="absolute left-0 right-0 z-[1] cursor-not-allowed border-y border-gray-300/70"
                      style={{
                        top: (iniMin - faixa.inicioMin) * PX_POR_MIN,
                        height: Math.max(6, (fimMin - iniMin) * PX_POR_MIN),
                        backgroundImage: HACHURA_BLOQUEIO,
                      }}
                    />
                  ))}

                  {/* consultas */}
                  {posicionadas.map(({ ref: c, ini, fim, faixa: lane, totalFaixas }) => {
                    const proc = procedimentosPorId[c.servico_id ?? ""];
                    const ehCompromisso = c.tipo === "compromisso";
                    // Compromisso não tem paciente nem procedimento — o nome do
                    // bloco é o próprio título, e a cor é neutra para não se
                    // confundir com a cor de um procedimento clínico.
                    const cor = ehCompromisso
                      ? COR_COMPROMISSO
                      : (proc?.cor || COR_PADRAO_PROCEDIMENTO);
                    const nomeBloco = ehCompromisso
                      ? (c.titulo || "Compromisso")
                      : (c.pacientes?.nome_completo ?? "Paciente sem nome");
                    const inativa = STATUS_INATIVOS.includes(c.status);
                    const larguraPct = 100 / totalFaixas;
                    const compacta = (fim - ini) * PX_POR_MIN < 46;

                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onAbrirConsulta(c)}
                        title={[
                          `${horaCurta(c.inicio)}–${horaCurta(c.fim)}`,
                          nomeBloco,
                          ehCompromisso ? "Compromisso interno" : STATUS_CONSULTA_LABEL[c.status],
                          ...(c.rotulos ?? []).map((r) => r.nome),
                        ].join(" · ")}
                        className={`absolute z-10 overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left shadow-sm transition-shadow hover:shadow-md ${
                          inativa ? "opacity-60" : ""
                        }`}
                        style={{
                          top: (ini - faixa.inicioMin) * PX_POR_MIN,
                          height: Math.max(20, (fim - ini) * PX_POR_MIN - 2),
                          left: `calc(${lane * larguraPct}% + 2px)`,
                          width: `calc(${larguraPct}% - 4px)`,
                          backgroundColor: `${cor}22`,
                          borderLeftColor: cor,
                          boxShadow: `inset 0 0 0 1px ${cor}33`,
                        }}
                      >
                        <p className={`truncate text-[11px] font-semibold text-gray-900 ${inativa ? "line-through" : ""}`}>
                          {nomeBloco}
                        </p>
                        {!compacta && (
                          <>
                            <p className="truncate text-[10px] tabular-nums text-gray-600">
                              {horaCurta(c.inicio)}–{horaCurta(c.fim)}
                            </p>
                            <p className="truncate text-[10px] text-gray-500">
                              {ehCompromisso ? "Compromisso" : (proc?.nome ?? "Sem procedimento")}
                              {visao === "dia" && agrupamentoDia === "nenhum" &&
                                ` · ${profissionaisPorId[c.profissional_id]?.full_name ?? "—"}`}
                            </p>
                            {/* Rótulos: pontos coloridos no bloco. Só o nome do
                                primeiro cabe; o resto vira contagem, e o title
                                do botão lista todos. */}
                            {(c.rotulos?.length ?? 0) > 0 && (
                              <div className="mt-0.5 flex items-center gap-1 overflow-hidden">
                                {c.rotulos.slice(0, 3).map((r) => (
                                  <span
                                    key={r.id}
                                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: r.cor }}
                                  />
                                ))}
                                <span className="truncate text-[9px] text-gray-500">
                                  {c.rotulos[0].nome}
                                  {c.rotulos.length > 1 && ` +${c.rotulos.length - 1}`}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                        <span
                          className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: STATUS_CONSULTA_COR[c.status] }}
                        />
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
