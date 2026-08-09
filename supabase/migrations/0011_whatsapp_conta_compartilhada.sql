-- ============================================================================
-- 0011 · Diferenciação de conta uazapi COMPARTILHADA (Sorrimax × Diamond)
-- ----------------------------------------------------------------------------
-- A conta uazapi (grupodiamond.uazapi.com) é a MESMA usada pelo Diamond CRM.
-- Suas instâncias são de clientes do Diamond (SolarMax, Lobo Soluções), não
-- clínicas. Estes campos deixam explícito no banco o que é compartilhado, pra:
--   · o Sorrimax NUNCA deletar/reinit uma instância que é do Diamond
--   · saber que o webhook daquela instância é gerido pelo Diamond (fan-out)
--   · o admin token NÃO fica em coluna — vai como secret da Edge Function
-- ============================================================================
alter table public.whatsapp_instances
  add column if not exists shared_external boolean not null default false,  -- true = instância vive noutro sistema (Diamond)
  add column if not exists external_system text,                            -- ex: 'diamond'
  add column if not exists external_ref    text,                            -- id da instância no uazapi (ex: r609cc65...)
  add column if not exists owner_number    text,                            -- número dono (owner do uazapi)
  add column if not exists profile_name    text,
  add column if not exists webhook_mode    text not null default 'direct'   -- 'direct' | 'fanout_diamond' | 'none'
    check (webhook_mode in ('direct','fanout_diamond','none'));

comment on column public.whatsapp_instances.shared_external is
  'true: instância compartilhada com outro sistema (Diamond). Nunca gerenciar de forma destrutiva daqui.';
comment on column public.whatsapp_instances.webhook_mode is
  'direct: webhook aponta pra ESTA função. fanout_diamond: o Diamond recebe e reencaminha pra cá. none: só envio (outbound).';
