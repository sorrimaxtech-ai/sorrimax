import { cn } from "@/lib/utils";
import type { DadosClinicaMarca, IdentidadeVisual } from "@/services/identidadeVisual";

// ============================================================================
// Preview do documento com a marca da clínica
// ----------------------------------------------------------------------------
// Mostra AO VIVO como um documento sai com a cor, o modelo e a logo escolhidos.
// É a mesma peça que serve de miniatura nos cartões de modelo (`compacto`). O
// rodapé traz o selo "Sorrimax" pequeno e discreto — presença de marca sem
// roubar a cena do documento da clínica.
// ============================================================================

const alinhaCol: Record<string, string> = {
  esquerda: "items-start text-left",
  centro: "items-center text-center",
  direita: "items-end text-right",
};
const alinhaRow: Record<string, string> = {
  esquerda: "justify-start",
  centro: "justify-center",
  direita: "justify-end",
};

/** Preto ou branco por cima da cor, pela luminância — legível em qualquer tom. */
function textoSobre(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#ffffff";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return L > 0.62 ? "#111827" : "#ffffff";
}

function Marca({
  logoUrl,
  cor,
  nome,
  altura,
}: {
  logoUrl: string | null;
  cor: string;
  nome: string;
  altura: number;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        draggable={false}
        style={{ height: altura }}
        className="w-auto max-w-[180px] object-contain"
      />
    );
  }
  // sem logo ainda: inicial da clínica num quadro com a cor da marca
  return (
    <div
      style={{ height: altura, width: altura, background: cor, color: textoSobre(cor) }}
      className="flex items-center justify-center rounded-xl text-lg font-bold"
    >
      {nome.trim().charAt(0).toUpperCase() || "C"}
    </div>
  );
}

interface Props {
  identidade: IdentidadeVisual;
  clinica: DadosClinicaMarca;
  /** Só o cabeçalho, em miniatura — usado nos cartões de modelo. */
  compacto?: boolean;
  className?: string;
}

export function DocumentoPreview({ identidade, clinica, compacto = false, className }: Props) {
  const { corMarca: cor, template, logoPosicao: pos, logoUrl } = identidade;
  const { nome, endereco, cnpj } = clinica;
  const subtitulo = [endereco, cnpj ? `CNPJ ${cnpj}` : null].filter(Boolean).join(" · ");

  const cabecalho = () => {
    if (template === "faixa") {
      const tinta = textoSobre(cor);
      return (
        <div>
          <div className={cn("flex items-center gap-3 px-6 py-4", alinhaRow[pos])} style={{ background: cor }}>
            <div className="flex items-center gap-3">
              <Marca logoUrl={logoUrl} cor={cor} nome={nome} altura={compacto ? 26 : 44} />
              <div className="min-w-0" style={{ color: tinta }}>
                <p className={cn("truncate font-bold", compacto ? "text-sm" : "text-lg")}>{nome}</p>
                {!compacto && subtitulo && <p className="truncate text-xs opacity-80">{subtitulo}</p>}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (template === "classico") {
      return (
        <div className="flex flex-col items-center gap-2 px-6 pt-6 text-center">
          <Marca logoUrl={logoUrl} cor={cor} nome={nome} altura={compacto ? 28 : 52} />
          <p className={cn("font-bold text-gray-900", compacto ? "text-sm" : "text-xl")}>{nome}</p>
          {!compacto && subtitulo && <p className="text-xs text-gray-500">{subtitulo}</p>}
          <div className="mt-1 h-[3px] w-full max-w-[240px] rounded" style={{ background: cor }} />
        </div>
      );
    }

    if (template === "minimalista") {
      return (
        <div className={cn("flex flex-col gap-2 px-6 pt-6", alinhaCol[pos])}>
          <Marca logoUrl={logoUrl} cor={cor} nome={nome} altura={compacto ? 22 : 38} />
          <div>
            <p className={cn("font-semibold text-gray-900", compacto ? "text-xs" : "text-base")}>{nome}</p>
            {!compacto && subtitulo && <p className="text-[11px] text-gray-400">{subtitulo}</p>}
          </div>
          <div className="mt-2 h-px w-full" style={{ background: cor }} />
        </div>
      );
    }

    // elegante
    return (
      <div className={cn("flex flex-col gap-1.5 px-6 pt-6", alinhaCol[pos])}>
        <Marca logoUrl={logoUrl} cor={cor} nome={nome} altura={compacto ? 24 : 44} />
        <p className={cn("font-serif text-gray-900", compacto ? "text-base" : "text-2xl")}>{nome}</p>
        <div className={cn("flex items-center gap-2", pos === "centro" && "justify-center", pos === "direita" && "justify-end")}>
          <span className="h-px w-8" style={{ background: cor }} />
          <span className="text-[10px] uppercase tracking-[0.22em] text-gray-500">
            {endereco || "Odontologia"}
          </span>
        </div>
      </div>
    );
  };

  if (compacto) {
    return (
      <div className={cn("overflow-hidden rounded-lg border bg-white", className)}>
        {cabecalho()}
        <div className="space-y-1.5 px-6 py-4">
          <div className="h-1.5 w-4/5 rounded bg-gray-100" />
          <div className="h-1.5 w-full rounded bg-gray-100" />
          <div className="h-1.5 w-2/3 rounded bg-gray-100" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex aspect-[1/1.35] flex-col overflow-hidden rounded-xl border bg-white shadow-sm", className)}>
      {cabecalho()}

      {/* corpo de exemplo — uma declaração de comparecimento, documento real de clínica */}
      <div className="flex-1 space-y-3 px-6 py-5">
        <p className="text-center text-sm font-bold uppercase tracking-wide" style={{ color: cor }}>
          Declaração de comparecimento
        </p>
        <div className="space-y-2 text-[12px] leading-relaxed text-gray-600">
          <p>
            Declaramos, para os devidos fins, que o(a) paciente <b className="text-gray-800">Maria Oliveira</b> esteve
            em atendimento odontológico nesta clínica no dia 09/08/2026, das 14h00 às 15h00.
          </p>
          <p className="text-gray-400">
            Este é um documento de exemplo. Ele mostra como os documentos da sua clínica vão sair com a identidade
            visual escolhida ao lado.
          </p>
        </div>
        <div className="pt-8 text-center text-[12px] text-gray-600">
          <div className="mx-auto mb-1 h-px w-44 bg-gray-300" />
          Responsável técnico — CRO 00.000
        </div>
      </div>

      {/* selo Sorrimax — pequeno, no cantinho, sem competir com a marca da clínica */}
      <div className="mt-auto flex items-center justify-end gap-1.5 border-t border-gray-100 px-6 py-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: cor }} aria-hidden />
        <span className="text-[10px] text-gray-400">
          Documento gerado com <span className="font-semibold text-gray-500">Sorrimax</span>
        </span>
      </div>
    </div>
  );
}

export default DocumentoPreview;
