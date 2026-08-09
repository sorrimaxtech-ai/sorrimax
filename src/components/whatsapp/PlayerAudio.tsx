import { useEffect, useRef, useState } from "react";
import { Play, Pause, Loader2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// PlayerAudio — áudio de paciente com velocidade e transcrição
// ----------------------------------------------------------------------------
// O <audio controls> do navegador ocupa demais e não tem o que a recepção usa:
// ouvir mais rápido. Paciente manda áudio de dois minutos e a atendente precisa
// do conteúdo, não da experiência — 1,5x e 2x economizam o dia inteiro.
//
// Transcrever fica sob demanda, não automático: nem todo áudio precisa virar
// texto, e a transcrição custa. Quem decide é quem está atendendo.
// ============================================================================

const VELOCIDADES = [1, 1.5, 2] as const;

function tempo(seg: number): string {
  if (!isFinite(seg) || seg < 0) return "0:00";
  const m = Math.floor(seg / 60);
  const s = Math.floor(seg % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  url: string;
  meu: boolean;
  transcricao?: string | null;
  onTranscrever?: () => Promise<void> | void;
}

export function PlayerAudio({ url, meu, transcricao, onTranscrever }: Props) {
  const ref = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [vel, setVel] = useState<number>(1);
  const [transcrevendo, setTranscrevendo] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const aoTempo = () => setPos(el.currentTime);
    const aoMeta = () => setDur(el.duration || 0);
    const aoFim = () => { setTocando(false); setPos(0); };
    el.addEventListener("timeupdate", aoTempo);
    el.addEventListener("loadedmetadata", aoMeta);
    el.addEventListener("ended", aoFim);
    return () => {
      el.removeEventListener("timeupdate", aoTempo);
      el.removeEventListener("loadedmetadata", aoMeta);
      el.removeEventListener("ended", aoFim);
    };
  }, []);

  const alternar = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) { el.playbackRate = vel; void el.play(); setTocando(true); }
    else { el.pause(); setTocando(false); }
  };

  // 1x → 1,5x → 2x → 1x
  const trocarVelocidade = () => {
    const prox = VELOCIDADES[(VELOCIDADES.indexOf(vel as 1) + 1) % VELOCIDADES.length];
    setVel(prox);
    if (ref.current) ref.current.playbackRate = prox;
  };

  const irPara = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    el.currentTime = ((e.clientX - r.left) / r.width) * dur;
  };

  const transcrever = async () => {
    if (!onTranscrever || transcrevendo) return;
    setTranscrevendo(true);
    try { await onTranscrever(); } finally { setTranscrevendo(false); }
  };

  const pct = dur > 0 ? (pos / dur) * 100 : 0;

  return (
    <div className="min-w-[230px] max-w-[280px]">
      <audio ref={ref} src={url} preload="metadata" className="hidden" />

      <div className="flex items-center gap-2.5">
        <button
          onClick={alternar}
          aria-label={tocando ? "Pausar" : "Ouvir"}
          className={cn(
            "h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-colors",
            "bg-brand-600 hover:bg-brand-700 text-white",
          )}
        >
          {tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </button>

        <div className="min-w-0 flex-1">
          <div
            onClick={irPara}
            className={cn("h-1.5 rounded-full cursor-pointer",
              "bg-black/10")}
          >
            <div
              className={cn("h-full rounded-full transition-[width] duration-100",
                "bg-brand-600")}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className={cn("flex items-center justify-between mt-1 text-[10px]",
            "text-[#667781]")}>
            <span>{tempo(pos)}{dur > 0 && ` / ${tempo(dur)}`}</span>
          </div>
        </div>

        <button
          onClick={trocarVelocidade}
          aria-label="Velocidade de reprodução"
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums transition-colors",
            "bg-black/5 hover:bg-black/10 text-[#54656f]",
          )}
        >
          {String(vel).replace(".", ",")}x
        </button>
      </div>

      {transcricao ? (
        <p className={cn("mt-1.5 text-[12.5px] italic leading-snug",
          "text-gray-700")}>
          "{transcricao}"
        </p>
      ) : onTranscrever ? (
        <button
          onClick={transcrever}
          disabled={transcrevendo}
          className={cn(
            "mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium transition-colors",
            "text-brand-700 hover:text-brand-800",
          )}
        >
          {transcrevendo
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Transcrevendo…</>
            : <><FileText className="h-3 w-3" /> Transcrever</>}
        </button>
      ) : null}
    </div>
  );
}
