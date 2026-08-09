// ============================================================================
// SORRIMAX Odonto — tipos do domínio
// Espelha as migrations 0005/0006. Manter em sincronia com o schema.
// ============================================================================

export type Denticao = 'permanente' | 'decidua';

export type FaceDental =
  | 'mesial'
  | 'distal'
  | 'vestibular'
  | 'lingual'
  | 'palatina'
  | 'oclusal'
  | 'incisal'
  | 'cervical';

export type EstadoOdontograma =
  | 'planejado'
  | 'em_execucao'
  | 'finalizado'
  | 'condicao';

export type AplicacaoProcedimento =
  | 'dente'
  | 'face'
  | 'quadrante'
  | 'arcada'
  | 'boca'
  | 'regiao'
  | 'sem_dente';

export interface RegistroOdontograma {
  id: string;
  paciente_id: string;
  denticao: Denticao;
  /** Notação FDI. Nulo quando o lançamento é de arcada/boca/região. */
  dente: number | null;
  faces: FaceDental[];
  regiao: string | null;
  procedimento_id: string | null;
  procedimento_nome?: string;
  estado: EstadoOdontograma;
  condicao: string | null;
  anotacao: string | null;
  executado_em: string | null;
}

// ---------------------------------------------------------------------------
// Notação FDI
// ---------------------------------------------------------------------------
// Quadrantes vistos DE FRENTE para o paciente: o lado direito dele aparece à
// esquerda da tela. Por isso os quadrantes 1 e 4 vêm primeiro, em ordem
// decrescente (do molar para o incisivo central).

export const DENTES_PERMANENTES = {
  supDireito: [18, 17, 16, 15, 14, 13, 12, 11], // quadrante 1
  supEsquerdo: [21, 22, 23, 24, 25, 26, 27, 28], // quadrante 2
  infEsquerdo: [31, 32, 33, 34, 35, 36, 37, 38], // quadrante 3
  infDireito: [48, 47, 46, 45, 44, 43, 42, 41], // quadrante 4
} as const;

export const DENTES_DECIDUOS = {
  supDireito: [55, 54, 53, 52, 51], // quadrante 5
  supEsquerdo: [61, 62, 63, 64, 65], // quadrante 6
  infEsquerdo: [71, 72, 73, 74, 75], // quadrante 7
  infDireito: [85, 84, 83, 82, 81], // quadrante 8
} as const;

/** Primeiro dígito do FDI identifica o quadrante. */
export const quadranteDoDente = (dente: number) => Math.floor(dente / 10);

/** Quadrantes 1, 2, 5 e 6 são superiores. */
export const isArcadaSuperior = (dente: number) =>
  [1, 2, 5, 6].includes(quadranteDoDente(dente));

/**
 * Quadrantes ímpares (1, 3, 5, 7) ficam no lado direito do paciente, que é
 * renderizado à ESQUERDA da tela. Isso define de que lado cai a face mesial.
 */
export const isLadoDireitoDoPaciente = (dente: number) =>
  [1, 4, 5, 8].includes(quadranteDoDente(dente));

/** Anteriores (incisivos e caninos) têm borda incisal; posteriores têm oclusal. */
export const isDenteAnterior = (dente: number) => {
  const posicao = dente % 10;
  return posicao >= 1 && posicao <= 3;
};

/** Superiores têm face palatina; inferiores têm lingual. */
export const faceInternaDoDente = (dente: number): FaceDental =>
  isArcadaSuperior(dente) ? 'palatina' : 'lingual';

export const faceCentralDoDente = (dente: number): FaceDental =>
  isDenteAnterior(dente) ? 'incisal' : 'oclusal';

// ---------------------------------------------------------------------------
// Cores por estado — espelham a legenda do odontograma
// ---------------------------------------------------------------------------
export const CORES_ESTADO: Record<EstadoOdontograma, { fill: string; label: string }> = {
  planejado: { fill: '#facc15', label: 'Planejado' },
  em_execucao: { fill: '#3b82f6', label: 'Em execução' },
  finalizado: { fill: '#22c55e', label: 'Finalizado' },
  condicao: { fill: '#ef4444', label: 'Condição clínica' },
};

export const FACE_VAZIA_FILL = 'transparent';
export const FACE_STROKE = 'currentColor';
