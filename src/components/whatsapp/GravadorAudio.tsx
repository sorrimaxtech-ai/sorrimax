import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Trash2, Send, Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ============================================================================
// GravadorAudio — responder áudio com áudio, sem pegar o celular
// ----------------------------------------------------------------------------
// Paciente manda áudio; a atendente responde digitando um texto longo. O gesto
// natural é responder falando — e sem isso ela abre o WhatsApp no celular, que
// é justamente o que tira a conversa do prontuário.
//
// Cancelar precisa ser tão fácil quanto enviar: quem grava errado quer apagar
// na hora, não mandar por acidente para o paciente.
// ============================================================================

/** Formato que o navegador aceita gravar E o WhatsApp aceita receber. */
function melhorFormato(): string {
  const candidatos = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const t of candidatos) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

function tempo(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = Math.floor(seg % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  enviando?: boolean;
  onEnviar: (arquivo: File) => Promise<void> | void;
}

export function GravadorAudio({ enviando, onEnviar }: Props) {
  const [gravando, setGravando] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [niveis, setNiveis] = useState<number[]>([]);

  const recRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const cancelouRef = useRef(false);

  const limpar = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    recRef.current = null;
    pedacosRef.current = [];
    setGravando(false);
    setPausado(false);
    setSegundos(0);
    setNiveis([]);
  }, []);

  useEffect(() => limpar, [limpar]);

  const iniciar = async () => {
    if (gravando || enviando) return;
    const formato = melhorFormato();
    if (!formato) {
      toast.error("Este navegador não grava áudio", {
        description: "Use o Chrome ou envie o arquivo pelo clipe.",
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      cancelouRef.current = false;
      pedacosRef.current = [];

      const rec = new MediaRecorder(stream, { mimeType: formato });
      recRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data.size > 0) pedacosRef.current.push(e.data); };
      rec.start(250);

      // onda: mostra que está captando som de verdade — gravar no mudo por
      // microfone errado é erro comum e só se descobre ao ouvir depois.
      const AC = window.AudioContext ?? (window as any).webkitAudioContext;
      const ctx: AudioContext = new AC();
      audioCtxRef.current = ctx;
      const fonte = ctx.createMediaStreamSource(stream);
      const analisador = ctx.createAnalyser();
      analisador.fftSize = 256;
      fonte.connect(analisador);
      const buf = new Uint8Array(analisador.frequencyBinCount);
      const medir = () => {
        analisador.getByteFrequencyData(buf);
        const media = buf.reduce((a, b) => a + b, 0) / buf.length;
        setNiveis((prev) => [...prev.slice(-39), Math.min(1, media / 90)]);
        rafRef.current = requestAnimationFrame(medir);
      };
      medir();

      timerRef.current = window.setInterval(() => setSegundos((s) => s + 1), 1000);
      setGravando(true);
    } catch {
      toast.error("Não foi possível usar o microfone", {
        description: "Permita o acesso ao microfone no navegador e tente de novo.",
      });
      limpar();
    }
  };

  const alternarPausa = () => {
    const rec = recRef.current;
    if (!rec) return;
    if (rec.state === "recording") { rec.pause(); setPausado(true); }
    else if (rec.state === "paused") { rec.resume(); setPausado(false); }
  };

  const cancelar = () => {
    cancelouRef.current = true;
    recRef.current?.stop();
    limpar();
  };

  const finalizar = () => {
    const rec = recRef.current;
    if (!rec) return;
    rec.onstop = async () => {
      const partes = pedacosRef.current;
      const tipo = rec.mimeType || "audio/webm";
      limpar();
      if (cancelouRef.current || partes.length === 0) return;
      const blob = new Blob(partes, { type: tipo });
      // menos de 1s costuma ser toque acidental no botão
      if (blob.size < 2000) {
        toast.info("Áudio muito curto", { description: "Segure para gravar por mais tempo." });
        return;
      }
      const ext = tipo.includes("mp4") ? "m4a" : tipo.includes("ogg") ? "ogg" : "webm";
      const arquivo = new File([blob], `audio-${Date.now()}.${ext}`, { type: tipo });
      await onEnviar(arquivo);
    };
    rec.stop();
  };

  if (!gravando) {
    return (
      <button
        onClick={iniciar}
        disabled={enviando}
        aria-label="Gravar áudio"
        title="Gravar mensagem de voz"
        className={cn(
          "h-10 w-10 shrink-0 rounded-full flex items-center justify-center transition-colors",
          "text-muted-foreground hover:bg-muted hover:text-brand-700",
          enviando && "opacity-50 cursor-not-allowed",
        )}
      >
        <Mic className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="flex flex-1 items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 ring-1 ring-red-200">
      <button
        onClick={cancelar}
        aria-label="Descartar gravação"
        className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-red-600 hover:bg-red-100 transition-colors"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <span className="flex items-center gap-1.5 shrink-0">
        <span className={cn("h-2 w-2 rounded-full bg-red-500", !pausado && "animate-pulse")} />
        <span className="text-xs font-semibold tabular-nums text-red-700">{tempo(segundos)}</span>
      </span>

      {/* onda: prova visual de que o microfone está captando */}
      <div className="flex flex-1 items-center gap-[2px] h-6 overflow-hidden">
        {niveis.map((n, i) => (
          <span
            key={i}
            className="w-[3px] shrink-0 rounded-full bg-red-400"
            style={{ height: `${Math.max(10, n * 100)}%` }}
          />
        ))}
      </div>

      <button
        onClick={alternarPausa}
        aria-label={pausado ? "Continuar gravação" : "Pausar gravação"}
        className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-red-700 hover:bg-red-100 transition-colors"
      >
        {pausado ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      </button>

      <button
        onClick={finalizar}
        disabled={enviando}
        aria-label="Enviar áudio"
        className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center bg-brand-600 text-white hover:bg-brand-700 transition-colors shadow-sm"
      >
        {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </button>
    </div>
  );
}
