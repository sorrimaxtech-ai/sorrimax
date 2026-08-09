import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  CORES_ESTADO,
  DENTES_DECIDUOS,
  DENTES_PERMANENTES,
  faceCentralDoDente,
  faceInternaDoDente,
  isArcadaSuperior,
  isLadoDireitoDoPaciente,
  type Denticao,
  type EstadoOdontograma,
  type FaceDental,
  type RegistroOdontograma,
} from '@/types/odonto';

// ============================================================================
// Odontograma — notação FDI, faces clicáveis, estado por cor
// ----------------------------------------------------------------------------
// Cada dente é um quadrado dividido em 5 regiões clicáveis:
//
//        ┌─────────────┐
//        │ \  externa / │        externa = vestibular
//        │  ┌────────┐  │        centro  = oclusal (posterior) ou incisal (anterior)
//        │  │ centro │  │        interna = palatina (superior) ou lingual (inferior)
//        │  └────────┘  │        laterais = mesial / distal, conforme o quadrante
//        │ /  interna \ │
//        └─────────────┘
//
// A face mesial é a que aponta para a linha média do arco. Como os quadrantes
// direitos do paciente são desenhados à esquerda da tela, o lado da mesial
// inverte entre os hemiarcos — detalhe que dentista percebe na hora.
// ============================================================================

const T = 44; // lado do quadrado do dente, em px
const M = 13; // margem até o centro

type PoligonoFace = { face: FaceDental; points: string };

/** Monta os 5 polígonos do dente já com as faces certas para o quadrante. */
function poligonosDoDente(dente: number): PoligonoFace[] {
  const externa: FaceDental = 'vestibular';
  const interna = faceInternaDoDente(dente);
  const centro = faceCentralDoDente(dente);

  // Superior: vestibular para cima. Inferior: vestibular para baixo.
  const superior = isArcadaSuperior(dente);
  const faceTopo = superior ? externa : interna;
  const faceBase = superior ? interna : externa;

  // Mesial aponta para a linha média (centro da imagem).
  const direitaDoPaciente = isLadoDireitoDoPaciente(dente);
  const faceEsquerda: FaceDental = direitaDoPaciente ? 'distal' : 'mesial';
  const faceDireita: FaceDental = direitaDoPaciente ? 'mesial' : 'distal';

  return [
    { face: faceTopo, points: `0,0 ${T},0 ${T - M},${M} ${M},${M}` },
    { face: faceDireita, points: `${T},0 ${T},${T} ${T - M},${T - M} ${T - M},${M}` },
    { face: faceBase, points: `0,${T} ${T},${T} ${T - M},${T - M} ${M},${T - M}` },
    { face: faceEsquerda, points: `0,0 0,${T} ${M},${T - M} ${M},${M}` },
    { face: centro, points: `${M},${M} ${T - M},${M} ${T - M},${T - M} ${M},${T - M}` },
  ];
}

interface DenteProps {
  numero: number;
  registros: RegistroOdontograma[];
  selecionado: boolean;
  onSelecionarFace: (dente: number, face: FaceDental) => void;
  onSelecionarDente: (dente: number) => void;
}

function Dente({
  numero,
  registros,
  selecionado,
  onSelecionarFace,
  onSelecionarDente,
}: DenteProps) {
  const poligonos = useMemo(() => poligonosDoDente(numero), [numero]);

  // Estado predominante por face. Se houver mais de um registro para a mesma
  // face, o mais avançado no fluxo vence — o dentista precisa ver o que já foi
  // feito, não o que ainda está planejado.
  const prioridade: Record<EstadoOdontograma, number> = {
    condicao: 0,
    planejado: 1,
    em_execucao: 2,
    finalizado: 3,
  };

  const estadoPorFace = useMemo(() => {
    const mapa = new Map<FaceDental, EstadoOdontograma>();
    for (const r of registros) {
      if (r.dente !== numero) continue;
      // registro sem face marcada pinta o dente inteiro
      const faces = r.faces.length ? r.faces : poligonos.map((p) => p.face);
      for (const f of faces) {
        const atual = mapa.get(f);
        if (!atual || prioridade[r.estado] > prioridade[atual]) mapa.set(f, r.estado);
      }
    }
    return mapa;
  }, [registros, numero, poligonos]);

  const temAnotacao = registros.some((r) => r.dente === numero && r.anotacao);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        width={T}
        height={T}
        viewBox={`0 0 ${T} ${T}`}
        className={cn(
          'text-muted-foreground/60 transition-shadow',
          selecionado && 'ring-2 ring-primary rounded-sm',
        )}
        role="group"
        aria-label={`Dente ${numero}`}
      >
        {poligonos.map(({ face, points }) => {
          const estado = estadoPorFace.get(face);
          return (
            <polygon
              key={face}
              points={points}
              fill={estado ? CORES_ESTADO[estado].fill : 'transparent'}
              stroke="currentColor"
              strokeWidth={0.75}
              className="cursor-pointer hover:fill-primary/20"
              onClick={(e) => {
                e.stopPropagation();
                onSelecionarFace(numero, face);
              }}
            >
              <title>{`Dente ${numero} — ${face}${estado ? ` (${CORES_ESTADO[estado].label})` : ''}`}</title>
            </polygon>
          );
        })}
      </svg>

      <button
        type="button"
        onClick={() => onSelecionarDente(numero)}
        className={cn(
          'relative text-xs font-medium tabular-nums transition-colors hover:text-primary',
          selecionado ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {numero}
        {temAnotacao && (
          <span className="absolute -right-2 -top-1 text-[10px] text-amber-500" aria-label="Tem anotação">
            !
          </span>
        )}
      </button>
    </div>
  );
}

export interface OdontogramaProps {
  registros: RegistroOdontograma[];
  denticaoInicial?: Denticao;
  /** Estados visíveis. Filtrar repinta o odontograma. */
  estadosVisiveis?: EstadoOdontograma[];
  onSelecionarFace?: (dente: number, face: FaceDental) => void;
  onSelecionarDente?: (dente: number) => void;
  onSelecionarRegiao?: (regiao: string) => void;
  className?: string;
}

const REGIOES = [
  'Maxila',
  'Mandíbula',
  'Arcada superior',
  'Arcada inferior',
  'Arcadas',
] as const;

export function Odontograma({
  registros,
  denticaoInicial = 'permanente',
  estadosVisiveis,
  onSelecionarFace,
  onSelecionarDente,
  onSelecionarRegiao,
  className,
}: OdontogramaProps) {
  const [denticao, setDenticao] = useState<Denticao>(denticaoInicial);
  const [denteSelecionado, setDenteSelecionado] = useState<number | null>(null);
  const [filtros, setFiltros] = useState<EstadoOdontograma[]>(
    estadosVisiveis ?? ['planejado', 'em_execucao', 'finalizado', 'condicao'],
  );

  const grupos = denticao === 'permanente' ? DENTES_PERMANENTES : DENTES_DECIDUOS;

  const registrosVisiveis = useMemo(
    () => registros.filter((r) => r.denticao === denticao && filtros.includes(r.estado)),
    [registros, denticao, filtros],
  );

  const alternarFiltro = (estado: EstadoOdontograma) =>
    setFiltros((atual) =>
      atual.includes(estado) ? atual.filter((e) => e !== estado) : [...atual, estado],
    );

  const selecionarDente = (dente: number) => {
    setDenteSelecionado(dente);
    onSelecionarDente?.(dente);
  };

  const renderArcada = (esquerda: readonly number[], direita: readonly number[]) => (
    <div className="flex items-start justify-center gap-4">
      <div className="flex gap-1">
        {esquerda.map((d) => (
          <Dente
            key={d}
            numero={d}
            registros={registrosVisiveis}
            selecionado={denteSelecionado === d}
            onSelecionarFace={(dente, face) => {
              setDenteSelecionado(dente);
              onSelecionarFace?.(dente, face);
            }}
            onSelecionarDente={selecionarDente}
          />
        ))}
      </div>
      <div className="w-px self-stretch bg-border" aria-hidden />
      <div className="flex gap-1">
        {direita.map((d) => (
          <Dente
            key={d}
            numero={d}
            registros={registrosVisiveis}
            selecionado={denteSelecionado === d}
            onSelecionarFace={(dente, face) => {
              setDenteSelecionado(dente);
              onSelecionarFace?.(dente, face);
            }}
            onSelecionarDente={selecionarDente}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className={cn('space-y-4 rounded-lg border bg-card p-4', className)}>
      {/* dentição */}
      <div className="flex items-center justify-center gap-2">
        {(['permanente', 'decidua'] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDenticao(d)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              denticao === d
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
          >
            {d === 'permanente' ? 'Permanentes' : 'Decíduos'}
          </button>
        ))}
      </div>

      {/* arcadas */}
      <div className="space-y-6 overflow-x-auto py-2">
        {renderArcada(grupos.supDireito, grupos.supEsquerdo)}
        <div className="h-px bg-border" aria-hidden />
        {renderArcada(grupos.infDireito, grupos.infEsquerdo)}
      </div>

      {/* regiões — lançamento que não é por dente isolado */}
      {onSelecionarRegiao && (
        <div className="flex flex-wrap justify-center gap-2 border-t pt-3">
          {REGIOES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onSelecionarRegiao(r)}
              className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {/* legenda / filtros */}
      <div className="flex flex-wrap items-center justify-center gap-4 border-t pt-3">
        {(Object.keys(CORES_ESTADO) as EstadoOdontograma[]).map((estado) => (
          <label key={estado} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filtros.includes(estado)}
              onChange={() => alternarFiltro(estado)}
              className="h-4 w-4 rounded border-input"
            />
            <span
              className="h-3 w-3 rounded-sm border"
              style={{ backgroundColor: CORES_ESTADO[estado].fill }}
              aria-hidden
            />
            <span className="text-muted-foreground">{CORES_ESTADO[estado].label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default Odontograma;
