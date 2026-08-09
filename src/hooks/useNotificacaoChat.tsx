import { useCallback, useEffect, useRef } from "react";

// ============================================================================
// useNotificacaoChat — som, título da aba e aviso do navegador
// ----------------------------------------------------------------------------
// Recepção não fica olhando a tela: atende, cobra, agenda. Sem aviso sonoro a
// mensagem do paciente espera até alguém lembrar de olhar — e o tempo de
// primeira resposta é o que decide se o orçamento vira consulta.
//
// Uma mensagem, um toque. Duas mensagens, dois toques: o som é a contagem, e
// engolir repetição faria a recepção achar que chegou só uma.
// ============================================================================

/**
 * Gera o "pop" sem depender de arquivo de áudio.
 *
 * Um .mp3 no bundle exigiria pedir arte, versionar binário e lidar com cache.
 * Dois osciladores curtos resolvem: leve, sempre disponível e afinado para ser
 * audível numa recepção barulhenta sem assustar quem está ao lado.
 */
function tocarPop(ctx: AudioContext) {
  const agora = ctx.currentTime;
  const ganho = ctx.createGain();
  ganho.connect(ctx.destination);
  // envelope curto: ataque quase instantâneo e queda em 180ms
  ganho.gain.setValueAtTime(0.0001, agora);
  ganho.gain.exponentialRampToValueAtTime(0.18, agora + 0.012);
  ganho.gain.exponentialRampToValueAtTime(0.0001, agora + 0.18);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, agora);
  osc.frequency.exponentialRampToValueAtTime(1320, agora + 0.09);
  osc.connect(ganho);
  osc.start(agora);
  osc.stop(agora + 0.2);
}

export function useNotificacaoChat() {
  const ctxRef = useRef<AudioContext | null>(null);
  const filaRef = useRef(0);
  const tituloOriginal = useRef<string>("");
  const naoLidasRef = useRef(0);

  useEffect(() => {
    tituloOriginal.current = document.title;
    return () => { document.title = tituloOriginal.current; };
  }, []);

  /**
   * O navegador só deixa tocar som depois de um gesto do usuário. Criamos o
   * contexto no primeiro clique/tecla e o mantemos — sem isso, o primeiro aviso
   * do dia seria silencioso e ninguém entenderia por quê.
   */
  useEffect(() => {
    const destravar = () => {
      if (!ctxRef.current) {
        try {
          const AC = window.AudioContext ?? (window as any).webkitAudioContext;
          if (AC) ctxRef.current = new AC();
        } catch { /* navegador sem áudio: segue sem som */ }
      }
      void ctxRef.current?.resume();
    };
    window.addEventListener("pointerdown", destravar);
    window.addEventListener("keydown", destravar);
    return () => {
      window.removeEventListener("pointerdown", destravar);
      window.removeEventListener("keydown", destravar);
    };
  }, []);

  /** Toca N vezes em sequência — uma por mensagem, sem sobrepor. */
  const tocar = useCallback((vezes = 1) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    void ctx.resume();
    filaRef.current += vezes;
    const disparar = () => {
      if (filaRef.current <= 0) return;
      filaRef.current -= 1;
      try { tocarPop(ctx); } catch { /* ignora falha de áudio */ }
      if (filaRef.current > 0) window.setTimeout(disparar, 260);
    };
    disparar();
  }, []);

  /** Contador no título da aba: "(3) Sorrimax". */
  const atualizarTitulo = useCallback((naoLidas: number) => {
    naoLidasRef.current = naoLidas;
    const base = tituloOriginal.current || "Sorrimax";
    document.title = naoLidas > 0 ? `(${naoLidas}) ${base}` : base;
  }, []);

  /** Aviso do sistema — só com a aba em segundo plano, para não duplicar. */
  const avisarNavegador = useCallback((titulo: string, corpo: string) => {
    if (typeof Notification === "undefined") return;
    if (document.visibilityState === "visible") return;
    if (Notification.permission === "granted") {
      try { new Notification(titulo, { body: corpo, tag: "sorrimax-chat" }); } catch { /* nada */ }
    }
  }, []);

  /** Pede permissão uma vez, sem bloquear nada se for negada. */
  const pedirPermissao = useCallback(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") void Notification.requestPermission();
  }, []);

  return { tocar, atualizarTitulo, avisarNavegador, pedirPermissao };
}
