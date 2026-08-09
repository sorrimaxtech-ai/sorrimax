// ============================================================================
// Status de mensagem — porta de utils/messageStatus.ts (Diamond)
// Client-safe. A regra de "nunca rebaixar" vive no trigger do banco (0009);
// aqui é só apresentação (ícone/cor) para a UI do chat.
// ============================================================================

export type WaStatus = "pending" | "sent" | "delivered" | "read" | "played" | "failed";

const RANK: Record<WaStatus, number> = {
  failed: 0, pending: 1, sent: 2, delivered: 3, read: 4, played: 5,
};

/** Só avança, nunca retrocede (espelha o guard do banco). */
export function isValidStatusProgression(current: WaStatus, next: WaStatus): boolean {
  if (next === "failed") return true;
  return RANK[next] > RANK[current];
}

/** Ícone do tick para a UI. */
export function statusIcon(status: WaStatus): string {
  switch (status) {
    case "pending": return "🕐";
    case "sent": return "✓";
    case "delivered": return "✓✓";
    case "read":
    case "played": return "✓✓"; // frontend colore de azul
    case "failed": return "⚠️";
    default: return "✓";
  }
}

/** Classe Tailwind de cor do tick. */
export function statusColor(status: WaStatus): string {
  switch (status) {
    case "pending": return "text-gray-400";
    case "sent": return "text-gray-500";
    case "delivered": return "text-gray-600";
    case "read":
    case "played": return "text-blue-500";
    case "failed": return "text-red-500";
    default: return "text-gray-500";
  }
}
