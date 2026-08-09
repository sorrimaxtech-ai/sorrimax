-- ============================================================================
-- 0043 · Respostas rápidas (macros) da recepção
-- ----------------------------------------------------------------------------
-- Orientação pós-extração, preparo pré-cirúrgico, política de falta, horário de
-- funcionamento: a recepção digita os mesmos textos dezenas de vezes por dia,
-- do zero ou colando de um bloco de notas. Padronizar economiza tempo E evita
-- que cada atendente explique de um jeito — o que numa clínica vira reclamação
-- ("mas me disseram outra coisa").
--
-- Atalho começando com "/" porque é o gesto que quem usa WhatsApp Business já
-- conhece.
-- ============================================================================

begin;

create table if not exists public.respostas_rapidas (
  id          uuid primary key default gen_random_uuid(),
  clinica_id  uuid not null references public.clinicas(id) on delete cascade,
  atalho      text not null,
  texto       text not null,
  criado_por  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- atalho é único por clínica: dois "/preco" diferentes seriam sorteio
  constraint respostas_rapidas_atalho_unico unique (clinica_id, atalho),
  constraint respostas_rapidas_atalho_formato
    check (atalho ~ '^[a-z0-9_-]{2,24}$'),
  constraint respostas_rapidas_texto_nao_vazio
    check (btrim(texto) <> '')
);

create index if not exists idx_respostas_rapidas_clinica
  on public.respostas_rapidas (clinica_id, atalho);

alter table public.respostas_rapidas enable row level security;

drop policy if exists respostas_rapidas_tenant on public.respostas_rapidas;
create policy respostas_rapidas_tenant on public.respostas_rapidas
  for all to authenticated
  using (clinica_id = public.current_clinica_id())
  with check (clinica_id = public.current_clinica_id());

drop trigger if exists trg_respostas_rapidas_touch on public.respostas_rapidas;
create trigger trg_respostas_rapidas_touch
  before update on public.respostas_rapidas
  for each row execute function public.touch_updated_at();

comment on table public.respostas_rapidas is
  'Textos que a recepção repete. Acionados por /atalho no campo de mensagem.';

-- Semeia o essencial de uma clínica odontológica. Idempotente: se a clínica já
-- editou o texto, não sobrescreve.
insert into public.respostas_rapidas (clinica_id, atalho, texto)
select c.id, v.atalho, v.texto
  from public.clinicas c
 cross join (values
   ('horario',   'Nosso horário de atendimento é de segunda a sexta, das 8h às 18h, e sábado das 8h às 12h.'),
   ('endereco',  'Estamos na {endereco}. Qualquer dúvida para chegar, é só chamar!'),
   ('confirmar', 'Olá, {nome}! Passando para confirmar sua consulta em {data} às {hora}. Podemos confirmar?'),
   ('posextracao','Após a extração: morda a gaze por 30 minutos, evite cuspir, não use canudo e prefira alimentos frios e macios nas primeiras 24h. Se o sangramento persistir, nos avise.'),
   ('falta',     'Oi, {nome}! Sentimos sua falta na consulta de hoje. Quer que a gente reagende? Temos horários esta semana.'),
   ('obrigado',  'Agradecemos por escolher nossa clínica! Qualquer dúvida, estamos por aqui. 😊')
 ) as v(atalho, texto)
 where not exists (
   select 1 from public.respostas_rapidas r
    where r.clinica_id = c.id and r.atalho = v.atalho
 );

commit;
