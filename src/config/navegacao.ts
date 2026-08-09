import {
  LayoutDashboard, Users, Calendar, TrendingUp, Wallet, MessageSquare,
  Boxes, Megaphone, Package, Store, Settings, HelpCircle,
  type LucideIcon,
} from "lucide-react";

// ============================================================================
// Navegação — pegada de software odontológico
// ----------------------------------------------------------------------------
// A versão anterior tinha 30 entradas em 9 grupos rotulados na barra lateral.
// Virava lista de leitura: o dentista lia o menu inteiro para achar "Comissões"
// e perdia a noção de onde estava. O padrão do segmento é o oposto — barra
// lateral CURTA com os lugares do sistema, e a sub-navegação em ABAS dentro do
// módulo, junto do conteúdo.
//
// Aqui: cada módulo é um lugar; as abas são o que se faz nele.
//
// `pronto` ausente = rota ainda não construída: aparece como "breve" em vez de
// levar a uma tela vazia.
// ============================================================================

export interface Aba {
  label: string;
  href: string;
  pronto?: boolean;
  soAdmin?: boolean;
}

export interface Modulo {
  label: string;
  href: string;        // rota padrão (primeira aba)
  icon: LucideIcon;
  base: string[];      // prefixos de rota que acendem este módulo na lateral
  abas?: Aba[];
  pronto?: boolean;
  soAdmin?: boolean;
  badge?: string;
}

export const MODULOS: Modulo[] = [
  {
    label: "Inteligência",
    href: "/dashboard",
    icon: LayoutDashboard,
    base: ["/dashboard", "/relatorios"],
    pronto: true,
    abas: [
      { label: "Indicadores", href: "/dashboard", pronto: true },
      { label: "Relatórios", href: "/relatorios", pronto: true },
      { label: "Por profissional", href: "/relatorios/profissional", pronto: true },
    ],
  },
  {
    label: "Pacientes",
    href: "/pacientes",
    icon: Users,
    base: ["/pacientes", "/anamnese", "/documentos"],
    pronto: true,
    abas: [
      { label: "Pacientes", href: "/pacientes", pronto: true },
      { label: "Anamnese", href: "/anamnese", pronto: true },
      { label: "Documentos", href: "/documentos", pronto: true },
    ],
  },
  {
    label: "Agenda",
    href: "/agenda",
    icon: Calendar,
    base: ["/agenda", "/consultas", "/horarios", "/cadeiras"],
    pronto: true,
    abas: [
      { label: "Calendário", href: "/agenda", pronto: true },
      { label: "Consultas", href: "/consultas", pronto: true },
      { label: "Horários", href: "/horarios", pronto: true },
      { label: "Cadeiras", href: "/cadeiras", pronto: true },
    ],
  },
  {
    label: "Vendas",
    href: "/orcamentos",
    icon: TrendingUp,
    base: ["/orcamentos", "/crm"],
    pronto: true,
    abas: [
      { label: "Orçamentos", href: "/orcamentos", pronto: true },
      { label: "Funil de captação", href: "/crm", pronto: true },
    ],
  },
  {
    label: "Conversas",
    href: "/conversas",
    icon: MessageSquare,
    base: ["/conversas"],
    pronto: true,
    badge: "WhatsApp",
  },
  {
    label: "Financeiro",
    href: "/financeiro",
    icon: Wallet,
    base: ["/financeiro"],
    pronto: true,
    soAdmin: true,
    abas: [
      { label: "Fluxo de caixa", href: "/financeiro", pronto: true, soAdmin: true },
      { label: "A receber", href: "/financeiro/receber", pronto: true, soAdmin: true },
      { label: "A pagar", href: "/financeiro/pagar", pronto: true, soAdmin: true },
      { label: "Comissões", href: "/financeiro/comissoes", pronto: true, soAdmin: true },
    ],
  },
  {
    label: "Controle de prótese",
    href: "/protese",
    icon: Boxes,
    base: ["/protese"],
    pronto: true,
  },
  {
    label: "Marketing",
    href: "/marketing",
    icon: Megaphone,
    base: ["/marketing", "/pagina-publica"],
    pronto: true,
    soAdmin: true,
    abas: [
      { label: "Campanhas", href: "/marketing", pronto: true },
      { label: "Página pública", href: "/pagina-publica", pronto: true },
    ],
  },
  {
    label: "Estoque",
    href: "/estoque",
    icon: Package,
    base: ["/estoque"],
    pronto: true,
  },
  {
    label: "Loja",
    href: "/loja",
    icon: Store,
    base: ["/loja"],
  },
];

/** Rodapé da barra lateral — separado do miolo, como no padrão do segmento. */
export const MODULOS_RODAPE: Modulo[] = [
  {
    label: "Ajustes",
    href: "/configuracoes",
    icon: Settings,
    base: [
      "/configuracoes", "/procedimentos", "/especialidades",
      "/profissionais", "/permissoes", "/rotulos", "/integracoes",
    ],
    pronto: true,
    abas: [
      { label: "Clínica", href: "/configuracoes", pronto: true, soAdmin: true },
      { label: "Equipe", href: "/profissionais", pronto: true },
      { label: "Procedimentos", href: "/procedimentos", pronto: true },
      { label: "Especialidades", href: "/especialidades", pronto: true },
      { label: "Rótulos da agenda", href: "/rotulos", pronto: true },
      { label: "Permissões", href: "/permissoes", pronto: true, soAdmin: true },
      { label: "Integrações", href: "/integracoes", pronto: true, soAdmin: true },
    ],
  },
  {
    label: "Como funciona",
    href: "/suporte",
    icon: HelpCircle,
    base: ["/suporte"],
  },
];

const TODOS = [...MODULOS, ...MODULOS_RODAPE];

const casa = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(base + "/");

/**
 * Módulo dono da rota atual. Ordena por especificidade: `/financeiro/receber`
 * precisa casar com Financeiro antes de qualquer base mais curta.
 */
export function moduloDaRota(pathname: string): Modulo | undefined {
  let vencedor: Modulo | undefined;
  let melhor = -1;
  for (const m of TODOS) {
    for (const b of m.base) {
      if (casa(pathname, b) && b.length > melhor) {
        melhor = b.length;
        vencedor = m;
      }
    }
  }
  return vencedor;
}

/** Aba ativa dentro do módulo — casa a mais específica primeiro. */
export function abaDaRota(mod: Modulo | undefined, pathname: string): Aba | undefined {
  if (!mod?.abas) return undefined;
  return [...mod.abas]
    .sort((a, b) => b.href.length - a.href.length)
    .find((t) => casa(pathname, t.href));
}
