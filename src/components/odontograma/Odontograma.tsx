import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  CORES_ESTADO,
  DENTES_DECIDUOS,
  DENTES_PERMANENTES,
  isArcadaSuperior,
  type Denticao,
  type EstadoOdontograma,
  type FaceDental,
  type RegistroOdontograma,
} from '@/types/odonto';

// ============================================================================
// Odontograma — notação FDI, dentes anatômicos, estado por cor
// ----------------------------------------------------------------------------
// Cada dente é uma silhueta (coroa + raiz) em vez de um quadrado abstrato. A
// coroa aponta para a linha média (superior: coroa pra baixo; inferior: pra
// cima), e a largura muda pelo tipo: incisivo estreito, molar largo. O dente
// pinta inteiro pela cor do estado predominante — leitura de "o que tem nesse
// dente" na hora. A marcação por FACE (restauração vestibular etc.) é feita no
// editor de orçamento, onde ela importa; aqui o clique seleciona o dente todo.
// ============================================================================

// silhueta base (viewBox 40x48): coroa arredondada embaixo + raiz cônica no topo
const TOOTH_PATH =
  'M20 4 C17 5 17 9 17 13 C12 14 9 18 9 24 C9 39 12 44 20 44 C28 44 31 39 31 24 C31 18 28 14 23 13 C23 9 23 5 20 4 Z';
const VB_W = 40;
const VB_H = 48;

/** Largura relativa por tipo de dente (2º dígito do FDI). */
function larguraDoDente(dente: number): number {
  const pos = dente % 10;
  if (pos <= 2) return 0.82; // incisivo
  if (pos === 3) return 0.88; // canino
  if (pos <= 5) return 1.0; // pré-molar
  return 1.32; // molar
}

const PRIORIDADE: Record<EstadoOdontograma, number> = {
  condicao: 0,
  planejado: 1,
  em_execucao: 2,
  finalizado: 3,
};

// ---------------------------------------------------------------------------
// Arte do dente: 1 arquivo por número FDI em `public/dentes/` (ex.: 18.svg,
// 46.png). Se existir, usa a imagem licenciada e tinge pela cor do status
// (a própria arte vira máscara). Se NÃO existir, cai no desenho vetorial de
// fallback abaixo. Assim, dropar um set realista deixa o odontograma
// foto-realista sem tocar em código.
// ---------------------------------------------------------------------------
const BASE_ARTE_DENTES = '/dentes';
const EXT_ARTE = 'svg'; // troque para 'png' se o set for raster

function DesenhoDente({ numero, estado }: { numero: number; estado: EstadoOdontograma | null }) {
  const flip = !isArcadaSuperior(numero);
  const sx = larguraDoDente(numero);
  const transform =
    `${flip ? `translate(0,${VB_H}) scale(1,-1) ` : ''}` +
    `translate(${VB_W / 2},0) scale(${sx},1) translate(${-VB_W / 2},0)`;
  return (
    <svg width={30} height={36} viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-hidden>
      <path
        d={TOOTH_PATH}
        transform={transform}
        fill={estado ? CORES_ESTADO[estado].fill : 'transparent'}
        fillOpacity={estado ? 0.5 : 0}
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArteDente({ numero, estado }: { numero: number; estado: EstadoOdontograma | null }) {
  const [semArte, setSemArte] = useState(false);
  const url = `${BASE_ARTE_DENTES}/${numero}.${EXT_ARTE}`;
  if (semArte) return <DesenhoDente numero={numero} estado={estado} />;
  const cor = estado ? CORES_ESTADO[estado].fill : null;
  const mask = {
    WebkitMaskImage: `url(${url})`, maskImage: `url(${url})`,
    WebkitMaskSize: 'contain', maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center', maskPosition: 'center',
  } as const;
  return (
    <span className="relative block" style={{ width: 30, height: 36 }}>
      <img src={url} alt="" draggable={false} onError={() => setSemArte(true)} className="h-full w-full object-contain" />
      {cor && <span className="pointer-events-none absolute inset-0" style={{ backgroundColor: cor, opacity: 0.5, ...mask }} />}
    </span>
  );
}

interface DenteProps {
  numero: number;
  registros: RegistroOdontograma[];
  selecionado: boolean;
  onSelecionar: (dente: number) => void;
}

function Dente({ numero, registros, selecionado, onSelecionar }: DenteProps) {
  // estado predominante do dente inteiro (o mais avançado no fluxo vence)
  const estado = useMemo<EstadoOdontograma | null>(() => {
    let melhor: EstadoOdontograma | null = null;
    for (const r of registros) {
      if (r.dente !== numero) continue;
      if (!melhor || PRIORIDADE[r.estado] > PRIORIDADE[melhor]) melhor = r.estado;
    }
    return melhor;
  }, [registros, numero]);

  const temAnotacao = registros.some((r) => r.dente === numero && r.anotacao);
  const rotuloEstado = estado ? ` — ${CORES_ESTADO[estado].label}` : '';

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => onSelecionar(numero)}
        aria-label={`Dente ${numero}${rotuloEstado}`}
        title={`Dente ${numero}${rotuloEstado}`}
        className={cn(
          'rounded-lg p-0.5 text-muted-foreground/70 transition-colors hover:bg-primary/5 hover:text-primary',
          selecionado && 'ring-2 ring-primary',
        )}
      >
        <ArteDente numero={numero} estado={estado} />
      </button>

      <button
        type="button"
        onClick={() => onSelecionar(numero)}
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
  /** Chamado ao clicar num dente (seleção). A face é marcada no editor. */
  onSelecionarFace?: (dente: number, face: FaceDental) => void;
  onSelecionarDente?: (dente: number) => void;
  onSelecionarRegiao?: (regiao: string) => void;
  className?: string;
}

const REGIOES = ['Maxila', 'Mandíbula', 'Arcada superior', 'Arcada inferior', 'Arcadas'] as const;

export function Odontograma({
  registros,
  denticaoInicial = 'permanente',
  estadosVisiveis,
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

  const selecionar = (dente: number) => {
    setDenteSelecionado(dente);
    onSelecionarDente?.(dente);
  };

  const renderArcada = (esquerda: readonly number[], direita: readonly number[]) => (
    <div className="flex items-start justify-center gap-4">
      <div className="flex gap-1">
        {esquerda.map((d) => (
          <Dente key={d} numero={d} registros={registrosVisiveis} selecionado={denteSelecionado === d} onSelecionar={selecionar} />
        ))}
      </div>
      <div className="w-px self-stretch bg-border" aria-hidden />
      <div className="flex gap-1">
        {direita.map((d) => (
          <Dente key={d} numero={d} registros={registrosVisiveis} selecionado={denteSelecionado === d} onSelecionar={selecionar} />
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
      <div className="space-y-5 overflow-x-auto py-2">
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
