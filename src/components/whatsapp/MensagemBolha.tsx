import { cn } from "@/lib/utils";
import { statusIcon, type WaStatus } from "@/services/whatsapp/status";
import type { WaMessageRow } from "@/services/whatsapp/realtime";
import { FileText, Download, MapPin, Phone, CornerUpLeft, CornerUpRight } from "lucide-react";
import { PlayerAudio } from "@/components/whatsapp/PlayerAudio";
import { transcreverAudio } from "@/services/whatsapp/send";
import { toast } from "sonner";
import { useState } from "react";

// ============================================================================
// MensagemBolha — uma mensagem, renderizada pelo tipo
// ----------------------------------------------------------------------------
// A versão anterior mostrava "[image]" em itálico para tudo que não fosse texto.
// A recepção não vê a foto que o paciente mandou — inutiliza o atendimento. Aqui
// cada tipo vira a coisa certa: imagem embutida, player de áudio, cartão de
// documento com download, texto de localização/contato/chamada.
// ============================================================================

function horaCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

interface BolhaProps {
  m: WaMessageRow;
  /** Mensagem citada por esta (quando é resposta). */
  citada?: WaMessageRow | null;
  onResponder?: (m: WaMessageRow) => void;
  onEncaminhar?: (m: WaMessageRow) => void;
}

export function MensagemBolha({ m, citada, onResponder, onEncaminhar }: BolhaProps) {
  const meu = m.from_me;
  const tipo = m.message_type;
  // Miniatura de 300px basta para reconhecer; ver detalhe de radiografia ou
  // documento fotografado exige tela cheia.
  const [ampliada, setAmpliada] = useState(false);
  const [transcricao, setTranscricao] = useState<string | null>(
    ((m.metadata as any)?.transcricao as string) ?? null,
  );

  const rodape = (
    <div className={cn("flex items-center gap-1 justify-end mt-0.5 text-[10px] leading-none",
      meu ? "text-[#667781]" : "text-[#667781]")}>
      <span>{horaCurta(m.created_at)}</span>
      {meu && (
        <span className={m.status === "read" || m.status === "played" ? "text-[#53bdeb]" : "text-[#667781]"}>
          {statusIcon(m.status as WaStatus)}
        </span>
      )}
    </div>
  );

  // Mídia visual usa bolha mais larga e sem padding no topo.
  const midiaLarga = tipo === "image" || tipo === "video";

  return (
    // Wrapper é o ÚNICO item do flex do pai (justify-end/start) e trava a largura
    // em 75% DA COLUNA — não do conteúdo. Assim toda bolha alinha no mesmo lugar,
    // curta ou longa. As ações ficam absolutas aqui dentro (não ocupam largura).
    <div className="group/msg relative max-w-[75%]">
    <div className={cn(
      "relative rounded-2xl text-sm shadow-sm break-words",
      midiaLarga ? "overflow-hidden p-1" : "px-3.5 py-2",
      // Cores do WhatsApp: a nossa mensagem em verde-claro com texto escuro
      // (não branco sobre azul) — é o que a recepção reconhece de imediato.
      meu ? "bg-[#d9fdd3] text-[#111b21] rounded-tr-sm" : "bg-white text-[#111b21] rounded-tl-sm",
    )}>
      {/* Citação: mostra o trecho respondido, como no WhatsApp. Sem isso, a
          resposta a uma pergunta antiga fica sem contexto na tela. */}
      {citada && (
        <div className="mb-1 rounded-md border-l-[3px] border-brand-500 bg-black/5 px-2 py-1">
          <p className="text-[11px] font-semibold text-brand-700">
            {citada.from_me ? "Você" : (citada.sender_name ?? "Paciente")}
          </p>
          <p className="text-[11.5px] text-gray-600 truncate">
            {citada.content || "Mídia"}
          </p>
        </div>
      )}

      {tipo === "image" && m.media_url ? (
        <>
          {/* 300px: cabe na coluna sem empurrar o layout e ainda dá pra ver o
              que o paciente mandou. Clique abre em tamanho real. */}
          <button onClick={() => setAmpliada(true)} className="block w-full">
            <img src={m.media_url} alt={m.content || "Imagem"}
                 className="rounded-xl w-full max-w-[300px] max-h-[300px] min-h-[120px] object-contain bg-black/5 cursor-zoom-in hover:opacity-95 transition-opacity"
                 loading="lazy" decoding="async" />
          </button>
          {m.content && <p className="px-2.5 py-1">{m.content}</p>}
          <div className="px-2">{rodape}</div>
        </>
      ) : tipo === "video" && m.media_url ? (
        <>
          <video src={m.media_url} controls playsInline preload="metadata"
                 className="rounded-xl w-full max-w-[300px] max-h-[300px] bg-black" />
          {m.content && <p className="px-2.5 py-1">{m.content}</p>}
          <div className="px-2">{rodape}</div>
        </>
      ) : (tipo === "audio" || tipo === "ptt") ? (
        <div>
          {m.media_url ? (
            <PlayerAudio
              url={m.media_url} meu={meu}
              transcricao={transcricao}
              onTranscrever={async () => {
                try { setTranscricao(await transcreverAudio(m.id)); }
                catch (e: any) { toast.error(e?.message ?? "Não foi possível transcrever"); }
              }}
            />
          ) : (
            <span className="italic opacity-80">🎤 Mensagem de voz</span>
          )}
          {rodape}
        </div>
      ) : tipo === "document" ? (
        <a href={m.media_url ?? undefined} target="_blank" rel="noreferrer"
           className={cn("flex items-center gap-3 min-w-[220px] rounded-lg p-1",
             meu ? "hover:bg-black/5" : "hover:bg-muted")}>
          <span className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
            "bg-brand-100 text-brand-700")}>
            <FileText className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{m.file_name ?? m.content ?? "Documento"}</span>
            <span className={cn("text-[11px]", meu ? "text-[#667781]" : "text-[#667781]")}>
              Abrir arquivo
            </span>
          </span>
          <Download className="h-4 w-4 shrink-0 opacity-70" />
        </a>
      ) : tipo === "sticker" && m.media_url ? (
        <>
          <img src={m.media_url} alt="Figurinha" loading="lazy" decoding="async"
               className="w-[140px] h-auto min-h-[80px] object-contain drop-shadow-sm" />
          {rodape}
        </>
      ) : tipo === "location" ? (
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0" />
          <span>{m.content || "Localização"}</span>
          {rodape}
        </div>
      ) : tipo === "call" ? (
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 shrink-0" />
          <span>{m.content || "Chamada"}</span>
          {rodape}
        </div>
      ) : m.content ? (
        <>
          <span className="whitespace-pre-wrap">{m.content}</span>
          {rodape}
        </>
      ) : (
        // sem conteúdo reconhecível: não inventa "[tipo]" técnico
        <>
          <span className="italic opacity-70">Mensagem não suportada</span>
          {rodape}
        </>
      )}

      {/* Tela cheia da imagem. Fecha no clique em qualquer lugar ou no Esc —
          a atendente está com uma mão no telefone, não vai caçar botão. */}
      {ampliada && m.media_url && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setAmpliada(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setAmpliada(false); }}
          role="button"
          tabIndex={-1}
          aria-label="Fechar imagem"
        >
          <img
            src={m.media_url}
            alt={m.content || "Imagem"}
            className="max-h-full max-w-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <a
            href={m.media_url}
            download
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-6 right-6 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-gray-800 shadow-lg hover:bg-white"
          >
            Baixar
          </a>
        </div>
      )}
    </div>

      {/* Ações fora do fluxo (absolutas): surgem no hover ao lado da bolha, sem
          ocupar largura — senão empurravam a bolha e desalinhavam tudo. */}
      {(onResponder || onEncaminhar) && (
        <AcoesMensagem
          m={m}
          onResponder={onResponder}
          onEncaminhar={onEncaminhar}
          className={cn(
            "absolute top-1/2 z-10 -translate-y-1/2",
            meu ? "right-full mr-1.5" : "left-full ml-1.5",
          )}
        />
      )}
    </div>
  );
}

/** Botões que surgem ao passar o mouse na mensagem. */
function AcoesMensagem({
  m, onResponder, onEncaminhar, className,
}: { m: WaMessageRow; onResponder?: (m: WaMessageRow) => void; onEncaminhar?: (m: WaMessageRow) => void; className?: string }) {
  return (
    <div className={cn("flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity shrink-0", className)}>
      {onResponder && (
        <button
          onClick={() => onResponder(m)}
          aria-label="Responder esta mensagem"
          title="Responder"
          className="h-7 w-7 rounded-full bg-white shadow-sm flex items-center justify-center text-[#54656f] hover:bg-slate-50"
        >
          <CornerUpLeft className="h-3.5 w-3.5" />
        </button>
      )}
      {onEncaminhar && (
        <button
          onClick={() => onEncaminhar(m)}
          aria-label="Encaminhar esta mensagem"
          title="Encaminhar"
          className="h-7 w-7 rounded-full bg-white shadow-sm flex items-center justify-center text-[#54656f] hover:bg-slate-50"
        >
          <CornerUpRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
