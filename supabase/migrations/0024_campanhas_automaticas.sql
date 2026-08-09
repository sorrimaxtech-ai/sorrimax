-- ============================================================================
-- 0024 — Campanhas automáticas (Central de mensagens)
-- ----------------------------------------------------------------------------
-- Benchmark: Codental (docs/BENCHMARK-CODENTAL.md §5). O que se copia é o
-- modelo: campanhas prontas com toggle, preview de alcance antes de ativar,
-- histórico de envio. O que nos diferencia: mensagem 100% editável (uazapi não
-- exige template aprovado) e envio pela outbox já existente (retry/DLQ/pacing).
--
-- Três campanhas de lançamento:
--   aniversario    — parabéns no dia (dedup: 1 por paciente por ano)
--   retorno        — última consulta concluída há N meses e nada futuro
--                    (dedup: 1 por consulta-gatilho)
--   inadimplencia  — parcela pendente vencida (dedup: 1 por parcela por mês)
--
-- O runner roda 1×/dia via pg_cron às 12:00 UTC (=09:00 América/São Paulo) e
-- só considera clínicas com instância WhatsApp conectada. Respeita o opt-out
-- por paciente (pacientes.aceita_lembretes, novo).
-- ============================================================================

begin;

-- ---------------------------------------------------------------- opt-out
alter table public.pacientes
  add column if not exists aceita_lembretes boolean not null default true;

comment on column public.pacientes.aceita_lembretes is
  'Opt-out de campanhas automáticas (LGPD). false = nunca recebe campanha; '
  'mensagens operacionais (confirmação de consulta) não passam por aqui.';

-- ---------------------------------------------------------------- tipos
do $$ begin
  create type public.tipo_campanha as enum
    ('aniversario', 'retorno', 'inadimplencia', 'pos_consulta', 'personalizada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.status_envio_campanha as enum
    ('enfileirado', 'enviado', 'erro', 'pulado');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- campanhas
create table if not exists public.campanhas (
  id          uuid primary key default gen_random_uuid(),
  clinica_id  uuid not null references public.clinicas(id) on delete cascade,
  tipo        public.tipo_campanha not null,
  nome        text not null,
  -- Template livre. Variáveis: {nome} {clinica} {valor}. Sem template travado:
  -- a uazapi aceita qualquer texto/emoji — vantagem sobre a API oficial.
  mensagem    text not null,
  ativa       boolean not null default false,
  -- Config por tipo: retorno → {"meses": 6}. Guardado como jsonb para novas
  -- campanhas não pedirem migration.
  config      jsonb not null default '{}'::jsonb,
  criado_por  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- 1 campanha de cada tipo nativo por clínica (personalizada pode repetir)
  constraint campanhas_tipo_unico unique nulls not distinct (clinica_id, tipo, nome)
);

create table if not exists public.campanha_envios (
  id           uuid primary key default gen_random_uuid(),
  clinica_id   uuid not null references public.clinicas(id) on delete cascade,
  campanha_id  uuid not null references public.campanhas(id) on delete cascade,
  paciente_id  uuid references public.pacientes(id) on delete set null,
  outbox_id    uuid references public.whatsapp_outbox(id) on delete set null,
  telefone     text not null,
  mensagem     text not null,
  status       public.status_envio_campanha not null default 'enfileirado',
  motivo       text,
  -- Chave que impede reenvio: aniversário usa o ano, retorno usa a consulta
  -- gatilho, inadimplência usa parcela+mês. Ver campanhas_executar().
  chave_dedup  text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint campanha_envios_dedup unique (campanha_id, chave_dedup)
);

create index if not exists idx_campanha_envios_clinica
  on public.campanha_envios (clinica_id, created_at desc);
create index if not exists idx_campanha_envios_paciente
  on public.campanha_envios (paciente_id);
create index if not exists idx_campanha_envios_outbox
  on public.campanha_envios (outbox_id);
create index if not exists idx_campanhas_criado_por
  on public.campanhas (criado_por);

-- RLS padrão do tenant + trigger de updated_at (mesmo caminho das demais)
select public.apply_tenant_rls('campanhas');
select public.apply_tenant_rls('campanha_envios');

-- ---------------------------------------------------------------- público-alvo
-- Uma função por tipo devolvendo (paciente_id, telefone, nome, extra, dedup).
-- SECURITY DEFINER porque o runner roda sem usuário; o filtro de clínica é
-- sempre explícito por parâmetro.

create or replace function public.campanha_publico(
  p_clinica uuid,
  p_tipo    public.tipo_campanha,
  p_config  jsonb default '{}'::jsonb,
  -- Janela de projeção: 0 = elegíveis hoje (runner); 30 = próximos 30 dias
  -- (preview de alcance na UI, o número que o Codental mostra antes do Ativar).
  p_horizonte_dias int default 0
) returns table (
  paciente_id uuid,
  telefone    text,
  primeiro_nome text,
  valor_devido numeric,
  chave_dedup text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with base as (
    select p.id, p.celular, split_part(btrim(p.nome_completo), ' ', 1) as primeiro_nome,
           p.data_nascimento
      from pacientes p
     where p.clinica_id = p_clinica
       and coalesce(p.ativo, true)
       and p.aceita_lembretes
       and nullif(btrim(coalesce(p.celular, '')), '') is not null
  )
  -- ----------------------------------------------------------- aniversário
  select b.id, b.celular, b.primeiro_nome, null::numeric,
         extract(year from now())::text
    from base b
   where p_tipo = 'aniversario'
     and b.data_nascimento is not null
     and case
           when p_horizonte_dias <= 0 then
             to_char(b.data_nascimento, 'MM-DD') = to_char(now(), 'MM-DD')
           else
             -- aniversários dentro da janela, tratando virada de ano
             (
               select min(d) from generate_series(0, p_horizonte_dias) g(off)
                cross join lateral (select to_char(now() + make_interval(days => g.off), 'MM-DD') d) x
                where x.d = to_char(b.data_nascimento, 'MM-DD')
             ) is not null
         end

  union all
  -- ----------------------------------------------------------- retorno
  select u.id, u.celular, u.primeiro_nome, null::numeric,
         u.ultima_consulta_id::text
    from (
      select b.id, b.celular, b.primeiro_nome,
             (select c.id from consultas c
               where c.clinica_id = p_clinica and c.paciente_id = b.id
                 and c.status = 'concluido'
               order by c.inicio desc limit 1) as ultima_consulta_id,
             (select max(c.inicio) from consultas c
               where c.clinica_id = p_clinica and c.paciente_id = b.id
                 and c.status = 'concluido') as ultima_concluida,
             (select count(*) from consultas c
               where c.clinica_id = p_clinica and c.paciente_id = b.id
                 and c.inicio > now()
                 and c.status in ('pendente','agendado','confirmado')) as futuras
        from base b
    ) u
   where p_tipo = 'retorno'
     and u.ultima_concluida is not null
     and u.futuras = 0
     and u.ultima_concluida
         <= now()
            - make_interval(months => coalesce((p_config->>'meses')::int, 6))
            + make_interval(days => greatest(p_horizonte_dias, 0))

  union all
  -- ----------------------------------------------------------- inadimplência
  select b.id, b.celular, b.primeiro_nome, d.total,
         d.parcela_ids || ':' || to_char(now(), 'YYYY-MM')
    from base b
    join lateral (
      select sum(lp.valor - coalesce(lp.valor_pago, 0)) as total,
             string_agg(lp.id::text, ',' order by lp.vencimento) as parcela_ids
        from lancamento_parcelas lp
        join lancamentos l on l.id = lp.lancamento_id
       where lp.clinica_id = p_clinica
         and l.paciente_id = b.id
         and l.tipo = 'receber'
         and lp.status = 'pendente'
         and lp.vencimento < current_date
    ) d on d.total > 0
   where p_tipo = 'inadimplencia'
$$;

-- Preview de alcance para a UI (roda como o usuário; valida a clínica dele).
create or replace function public.campanha_preview_alcance(
  p_tipo   public.tipo_campanha,
  p_config jsonb default '{}'::jsonb
) returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select count(*)::int
    from public.campanha_publico(public.current_clinica_id(), p_tipo, p_config, 30);
$$;

-- EXECUTE nasce concedido a PUBLIC; revogar só de anon não fecha a porta.
revoke all on function public.campanha_publico(uuid, public.tipo_campanha, jsonb, int) from public, anon, authenticated;
revoke all on function public.campanha_preview_alcance(public.tipo_campanha, jsonb) from public, anon;
grant execute on function public.campanha_preview_alcance(public.tipo_campanha, jsonb) to authenticated;

-- ---------------------------------------------------------------- runner
create or replace function public.campanhas_executar()
returns table (campanha uuid, enfileirados int)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_camp record;
  v_alvo record;
  v_inst uuid;
  v_msg  text;
  v_outbox uuid;
  v_n int;
begin
  for v_camp in
    select c.*, cl.nome_clinica
      from campanhas c
      join clinicas cl on cl.id = c.clinica_id
     where c.ativa
  loop
    -- clínica precisa de instância conectada; sem ela a campanha espera
    select i.id into v_inst
      from whatsapp_instances i
     where i.clinica_id = v_camp.clinica_id and i.status = 'connected'
     order by i.connected_at desc nulls last
     limit 1;
    if v_inst is null then continue; end if;

    v_n := 0;
    for v_alvo in
      select * from campanha_publico(v_camp.clinica_id, v_camp.tipo, v_camp.config, 0)
    loop
      -- dedup primeiro: se já mandamos (este ano / este gatilho / este mês),
      -- nem entra na outbox
      begin
        v_msg := replace(replace(replace(v_camp.mensagem,
                   '{nome}', coalesce(v_alvo.primeiro_nome, '')),
                   '{clinica}', coalesce(v_camp.nome_clinica, '')),
                   '{valor}', coalesce(to_char(v_alvo.valor_devido, 'FM999G999G990D00'), ''));

        insert into campanha_envios
          (clinica_id, campanha_id, paciente_id, telefone, mensagem, chave_dedup)
        values
          (v_camp.clinica_id, v_camp.id, v_alvo.paciente_id, v_alvo.telefone, v_msg, v_alvo.chave_dedup);
      exception when unique_violation then
        continue;  -- já enviado neste ciclo de dedup
      end;

      insert into whatsapp_outbox
        (clinica_id, instance_id, to_number, kind, payload, scheduled_at, next_attempt_at)
      values
        (v_camp.clinica_id, v_inst, v_alvo.telefone, 'text',
         jsonb_build_object('text', v_msg), now(), now())
      returning id into v_outbox;

      -- status segue 'enfileirado': quem confirma envio é a outbox/worker.
      update campanha_envios
         set outbox_id = v_outbox
       where campanha_id = v_camp.id and chave_dedup = v_alvo.chave_dedup;

      v_n := v_n + 1;
    end loop;

    if v_n > 0 then
      campanha := v_camp.id; enfileirados := v_n; return next;
    end if;
  end loop;
end $$;

revoke all on function public.campanhas_executar() from public, anon, authenticated;

-- 09:00 em São Paulo = 12:00 UTC. O job é idempotente (dedup por chave), então
-- rodar de novo manualmente não duplica mensagem.
select cron.schedule('campanhas-automaticas', '0 12 * * *',
                     $$select public.campanhas_executar()$$)
 where not exists (select 1 from cron.job where jobname = 'campanhas-automaticas');

commit;
