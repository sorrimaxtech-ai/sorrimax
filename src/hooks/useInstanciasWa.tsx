import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import {
  listarInstanciasWa, criarInstanciaWa, conectarInstanciaWa, sincronizarInstanciaWa,
  desconectarInstanciaWa, excluirInstanciaWa, listarEventosInstancia,
  STATUS_WA_LABEL, formatarNumeroWa,
  ErroInstancia, type InstanciaWa, type EventoInstancia, type ProviderWa,
} from "@/services/whatsapp/instancias";

// ============================================================================
// useInstanciasWa — o miolo de conectar/gerenciar WhatsApp, em um lugar só
// ----------------------------------------------------------------------------
// Antes isto vivia inteiro dentro de Integrações, e a tela de Conversas — onde
// o usuário de fato percebe que não tem número conectado — não tinha como
// oferecer a conexão. Duplicar a lógica nas duas telas era o caminho curto e
// errado: este repo já carrega o custo de dois diálogos de consulta que
// divergiram. Uma fonte, dois consumidores.
//
// Nenhuma credencial passa por aqui: tudo vai para a Edge Function, que roda
// com service role e guarda o token do provedor.
// ============================================================================

/** Erro do servidor: mostra a causa sem despejar detalhe técnico solto. */
const erroToast = (titulo: string, e: unknown) => {
  const err = e as ErroInstancia;
  toast.error(titulo, { description: err?.detalhe ? `${err.message} (${err.detalhe})` : err?.message });
};

export interface Conexao {
  inst: InstanciaWa;
  qr: string | null;
  codigo: string | null;
}

export function useInstanciasWa(opcoes: { comHistorico?: boolean } = {}) {
  const { comHistorico = false } = opcoes;
  const { clinicaId, carregando: carregandoCtx, isAdmin } = useTenant();

  const [instancias, setInstancias] = useState<InstanciaWa[]>([]);
  const [eventos, setEventos] = useState<EventoInstancia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  // falha de carga ≠ lista vazia: dizer "nenhum conectado" quando na verdade
  // não deu pra consultar faria a tela afirmar algo que não verificou.
  const [falhouCarga, setFalhouCarga] = useState<string | null>(null);

  const [criando, setCriando] = useState(false);
  const [conexao, setConexao] = useState<Conexao | null>(null);
  const [excluir, setExcluir] = useState<InstanciaWa | null>(null);

  const pollRef = useRef<number | null>(null);

  const carregar = useCallback(async (silencioso = false) => {
    if (!clinicaId) { if (!carregandoCtx) setCarregando(false); return; }
    if (!silencioso) setCarregando(true);
    try {
      const [lista, hist] = await Promise.all([
        listarInstanciasWa(),
        comHistorico
          ? listarEventosInstancia(clinicaId).catch(() => [] as EventoInstancia[])
          : Promise.resolve([] as EventoInstancia[]),
      ]);
      setInstancias(lista);
      setEventos(hist);
      setFalhouCarga(null);
    } catch (e) {
      setFalhouCarga((e as ErroInstancia)?.message ?? "Falha ao consultar o servidor.");
      if (!silencioso) erroToast("Erro ao carregar as conexões", e);
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, carregandoCtx, comHistorico]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirConexao = useCallback(async (inst: InstanciaWa) => {
    setOcupado(inst.id);
    try {
      const r = await conectarInstanciaWa(inst.id);
      setConexao({ inst, qr: r.qrcode, codigo: r.codigo });
      if (!r.qrcode && !r.codigo && r.status === "connected") {
        toast.info("Este número já está conectado.");
        setConexao(null);
        carregar(true);
      }
    } catch (e) {
      erroToast("Não foi possível iniciar a conexão", e);
    } finally {
      setOcupado(null);
    }
  }, [carregar]);

  // Enquanto o QR está na tela, o servidor é consultado a cada 4s até o
  // provedor confirmar. Sem isso o usuário escaneia e fica olhando um QR morto
  // sem saber se deu certo.
  useEffect(() => {
    if (!conexao) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = window.setInterval(async () => {
      try {
        const r = await sincronizarInstanciaWa(conexao.inst.id);
        if (r.status === "connected") {
          toast.success("WhatsApp conectado", {
            description: r.owner_number ? `Número ${formatarNumeroWa(r.owner_number)}` : undefined,
          });
          setConexao(null);
          carregar(true);
        }
      } catch { /* provedor instável: a próxima volta tenta de novo */ }
    }, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [conexao, carregar]);

  // ------------------------------------------------------------------ validade
  // O código do WhatsApp vale poucos segundos. Antes, a tela seguia exibindo o
  // mesmo desenho indefinidamente: o usuário escaneava um código já vencido e o
  // celular respondia "não é possível conectar novos dispositivos no momento" —
  // erro que não diz a verdade e manda caçar problema no lugar errado.
  //
  // Renova sozinho um pouco antes de vencer, e desiste após alguns minutos em
  // vez de martelar o provedor para sempre com uma tela esquecida aberta.
  const SEGUNDOS_VALIDADE = 40;
  const MAX_RENOVACOES = 5; // ~3,5 min de tentativa
  const [segundosQr, setSegundosQr] = useState(SEGUNDOS_VALIDADE);
  const [qrExpirado, setQrExpirado] = useState(false);
  const renovacoesRef = useRef(0);

  useEffect(() => {
    if (!conexao) { renovacoesRef.current = 0; setQrExpirado(false); return; }
    setSegundosQr(SEGUNDOS_VALIDADE);
    const t = window.setInterval(() => {
      setSegundosQr((s) => {
        if (s > 1) return s - 1;
        if (renovacoesRef.current < MAX_RENOVACOES) {
          renovacoesRef.current += 1;
          // pede um código novo sem fechar o diálogo
          conectarInstanciaWa(conexao.inst.id)
            .then((r) => setConexao((c) => (c ? { ...c, qr: r.qrcode, codigo: r.codigo } : c)))
            .catch(() => { /* a próxima volta tenta de novo */ });
          return SEGUNDOS_VALIDADE;
        }
        setQrExpirado(true);
        return 0;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [conexao]);

  /** Recomeça a contagem e pede um código novo (botão "Gerar novo"). */
  const renovarQr = useCallback(async () => {
    if (!conexao) return;
    renovacoesRef.current = 0;
    setQrExpirado(false);
    setSegundosQr(SEGUNDOS_VALIDADE);
    await abrirConexao(conexao.inst);
  }, [conexao, abrirConexao]);

  const criar = useCallback(async (nome: string, provider: ProviderWa) => {
    if (nome.trim().length < 2) { toast.error("Dê um nome a esta linha"); return false; }
    setCriando(true);
    try {
      const nova = await criarInstanciaWa(nome.trim(), provider);
      toast.success("Linha criada", { description: "Agora leia o QR code com o celular." });
      await carregar(true);
      // leva direto ao QR: linha criada e não conectada não serve pra nada
      abrirConexao({ ...(nova as InstanciaWa), shared_external: false } as InstanciaWa);
      return true;
    } catch (e) {
      erroToast("Não foi possível criar a linha", e);
      return false;
    } finally {
      setCriando(false);
    }
  }, [carregar, abrirConexao]);

  const sincronizar = useCallback(async (inst: InstanciaWa) => {
    setOcupado(inst.id);
    try {
      const r = await sincronizarInstanciaWa(inst.id);
      toast.success("Atualizado", { description: STATUS_WA_LABEL[r.status] ?? r.status });
      await carregar(true);
    } catch (e) {
      erroToast("Não foi possível atualizar", e);
    } finally {
      setOcupado(null);
    }
  }, [carregar]);

  const desconectar = useCallback(async (inst: InstanciaWa) => {
    setOcupado(inst.id);
    try {
      await desconectarInstanciaWa(inst.id);
      toast.success("Número desconectado");
      await carregar(true);
    } catch (e) {
      erroToast("Não foi possível desconectar", e);
    } finally {
      setOcupado(null);
    }
  }, [carregar]);

  const confirmarExclusao = useCallback(async () => {
    if (!excluir) return;
    setOcupado(excluir.id);
    try {
      await excluirInstanciaWa(excluir.id);
      toast.success("Linha removida", { description: "Removida também no provedor." });
      setExcluir(null);
      await carregar(true);
    } catch (e) {
      erroToast("Não foi possível remover", e);
    } finally {
      setOcupado(null);
    }
  }, [excluir, carregar]);

  // Instância marcada como compartilhada pertence a outro sistema em produção;
  // aparece como somente leitura (a recusa real é no servidor e no trigger).
  const proprias = instancias.filter((i) => !i.shared_external);
  const compartilhadas = instancias.filter((i) => i.shared_external);
  const conectada = proprias.find((i) => i.status === "connected") ?? null;

  return {
    // estado
    instancias, proprias, compartilhadas, conectada, eventos,
    carregando, ocupado, falhouCarga, criando, conexao, excluir, isAdmin,
    segundosQr, qrExpirado,
    // ações
    carregar, criar, abrirConexao, sincronizar, desconectar, confirmarExclusao,
    renovarQr, setConexao, setExcluir,
  };
}
