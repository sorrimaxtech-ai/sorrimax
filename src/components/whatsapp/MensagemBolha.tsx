import { cn } from "@/lib/utils";
import { statusIcon, type WaStatus } from "@/services/whatsapp/status";
import type { WaMessageRow } from "@/services/whatsapp/realtime";
import { FileText, Download, MapPin, Phone } from "lucide-react";

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

export function MensagemBolha({ m }: { m: WaMessageRow }) {
  const meu = m.from_me;
  const tipo = m.message_type;

  const rodape = (
    <div className={cn("flex items-center gap-1 justify-end mt-0.5 text-[10px] leading-none",
      meu ? "text-white/70" : "text-muted-foreground")}>
      <span>{horaCurta(m.created_at)}</span>
      {meu && (
        <span className={m.status === "read" || m.status === "played" ? "text-sky-300" : ""}>
          {statusIcon(m.status as WaStatus)}
        </span>
      )}
    </div>
  );

  // Mídia visual usa bolha mais larga e sem padding no topo.
  const midiaLarga = tipo === "image" || tipo === "video";

  return (
    <div className={cn(
      "max-w-[75%] rounded-2xl text-sm shadow-sm break-words",
      midiaLarga ? "overflow-hidden p-1" : "px-3.5 py-2",
      meu ? "bg-brand-600 text-white rounded-br-sm" : "bg-white rounded-bl-sm",
    )}>
      {tipo === "image" && m.media_url ? (
        <>
          <img src={m.media_url} alt={m.content || "Imagem"}
               className="rounded-xl max-h-80 w-auto object-cover" loading="lazy" />
          {m.content && <p className="px-2.5 py-1">{m.content}</p>}
          <div className="px-2">{rodape}</div>
        </>
      ) : tipo === "video" && m.media_url ? (
        <>
          <video src={m.media_url} controls className="rounded-xl max-h-80 w-auto" />
          {m.content && <p className="px-2.5 py-1">{m.content}</p>}
          <div className="px-2">{rodape}</div>
        </>
      ) : (tipo === "audio" || tipo === "ptt") ? (
        <div className="min-w-[220px]">
          {m.media_url ? (
            <audio src={m.media_url} controls className="w-full h-9" />
          ) : (
            <span className="italic opacity-80">🎤 Mensagem de voz</span>
          )}
          {rodape}
        </div>
      ) : tipo === "document" ? (
        <a href={m.media_url ?? undefined} target="_blank" rel="noreferrer"
           className={cn("flex items-center gap-3 min-w-[220px] rounded-lg p-1",
             meu ? "hover:bg-white/10" : "hover:bg-muted")}>
          <span className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
            meu ? "bg-white/20" : "bg-brand-100 text-brand-700")}>
            <FileText className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{m.file_name ?? m.content ?? "Documento"}</span>
            <span className={cn("text-[11px]", meu ? "text-white/70" : "text-muted-foreground")}>
              Abrir arquivo
            </span>
          </span>
          <Download className="h-4 w-4 shrink-0 opacity-70" />
        </a>
      ) : tipo === "sticker" && m.media_url ? (
        <>
          <img src={m.media_url} alt="Figurinha" className="h-28 w-28 object-contain" loading="lazy" />
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
    </div>
  );
}
