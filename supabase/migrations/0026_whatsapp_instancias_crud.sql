-- ============================================================================
-- 0026 — Gerenciamento de instância de WhatsApp pela clínica
-- ----------------------------------------------------------------------------
-- A tela de Integrações era somente leitura porque a credencial da instância
-- (`api_url`, `api_token`, `apikey`, `webhook_secret`, `qrcode`) não pode
-- chegar ao navegador — quem tem o token do provedor manda mensagem em nome da
-- clínica, e o QR liga a conta de WhatsApp a quem escanear.
--
-- Isso continua valendo. O que muda é que agora existe um caminho SERVIDOR
-- para as operações: a Edge Function `whatsapp-instances` roda com service role,
-- fala com o provedor e devolve à tela só o que é seguro mostrar (status, QR do
-- momento, número conectado). A tela nunca vê o token.
--
-- Esta migration abre o mínimo necessário para a tela GERENCIAR, e registra o
-- histórico de operações — sem isso, "quem desconectou a instância na
-- sexta-feira?" não tem resposta.
-- ============================================================================

-- `provider` não é segredo (é "uazapi" ou "evolution") e a tela de
-- gerenciamento precisa dele para saber o que oferecer: pareamento por código
-- existe no uazapi e não no Evolution.
grant select (provider) on public.whatsapp_instances to authenticated;

-- ---------------------------------------------------------------------------
-- Histórico de operações na instância
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'acao_instancia') then
    create type public.acao_instancia as enum (
      'criada', 'conectada', 'qr_gerado', 'desconectada', 'excluida',
      'sincronizada', 'falha'
    );
  end if;
end $$;

create table if not exists public.whatsapp_instance_eventos (
  id           uuid primary key default gen_random_uuid(),
  clinica_id   uuid not null references public.clinicas(id) on delete cascade,
  -- sem FK para a instância: o evento 'excluida' precisa sobreviver à linha
  -- que descreve, senão o histórico some justo no caso que mais importa.
  instancia_id uuid,
  nome         text,
  acao         public.acao_instancia not null,
  detalhe      text,
  ator         uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists wa_inst_eventos_clinica
  on public.whatsapp_instance_eventos (clinica_id, created_at desc);

alter table public.whatsapp_instance_eventos enable row level security;
alter table public.whatsapp_instance_eventos force row level security;

-- Leitura pela clínica; escrita só pelo servidor (a Edge Function usa service
-- role, que ignora RLS). Sem policy de INSERT para `authenticated`, o histórico
-- não pode ser forjado pelo navegador.
drop policy if exists wa_inst_eventos_leitura on public.whatsapp_instance_eventos;
create policy wa_inst_eventos_leitura on public.whatsapp_instance_eventos
  for select to authenticated
  using (clinica_id = public.current_clinica_id());

revoke all on public.whatsapp_instance_eventos from anon;
grant select on public.whatsapp_instance_eventos to authenticated;

-- ---------------------------------------------------------------------------
-- Guarda extra contra tocar em instância de outro sistema
-- ---------------------------------------------------------------------------
-- `trg_wa_inst_protect` (0011) já bloqueia DELETE e alteração dos campos de
-- conexão de instância compartilhada. Aqui a checagem vira função consultável,
-- para a Edge Function recusar ANTES de chamar o provedor — evitar a chamada é
-- melhor do que desfazer o efeito dela na conta em produção do Diamond.
create or replace function public.wa_instancia_gerenciavel(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select not i.shared_external
       from public.whatsapp_instances i
      where i.id = p_id and i.clinica_id = public.current_clinica_id()),
    false);
$$;

revoke all on function public.wa_instancia_gerenciavel(uuid) from anon, public;
grant execute on function public.wa_instancia_gerenciavel(uuid) to authenticated;

-- Índice de suporte à FK `ator` (apontado pela auditoria_saude): sem ele, remover
-- um profissional faz varredura sequencial no histórico de instâncias.
create index if not exists wa_inst_eventos_ator
  on public.whatsapp_instance_eventos (ator) where ator is not null;
