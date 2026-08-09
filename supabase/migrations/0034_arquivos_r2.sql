-- ============================================================================
-- 0034 — Arquivos (anexos de paciente) no Cloudflare R2
-- ----------------------------------------------------------------------------
-- Storage de exames, raio-x, fotos e documentos do paciente. Os BYTES vivem no
-- R2 (S3-compatível, sem egress); aqui fica só o METADADO + a chave do objeto.
--
-- Segurança do multi-tenant: a `r2_key` é SEMPRE derivada no servidor (edge)
-- como `clinica/<clinica_id>/<arquivo_id>/<uuid>` — o cliente nunca escolhe a
-- chave. Todo acesso ao objeto passa pela edge `r2-storage`, que autoriza contra
-- o `clinica_id` desta linha. Aqui a RLS só libera LEITURA do metadado pra
-- membro da clínica; a escrita é só do service_role (a edge grava).
-- ============================================================================

begin;

create table if not exists public.arquivos (
  id            uuid primary key default gen_random_uuid(),
  clinica_id    uuid not null references public.clinicas(id) on delete cascade,
  paciente_id   uuid references public.pacientes(id) on delete cascade,
  consulta_id   uuid references public.consultas(id) on delete set null,
  categoria     text not null default 'documento',   -- documento | exame | foto | raio-x | outro
  nome_original text not null,
  r2_key        text not null unique,
  content_type  text,
  tamanho_bytes bigint,
  criado_por    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_arquivos_clinica  on public.arquivos(clinica_id, created_at desc);
create index if not exists idx_arquivos_paciente on public.arquivos(paciente_id, created_at desc);
create index if not exists idx_arquivos_consulta on public.arquivos(consulta_id) where consulta_id is not null;
create index if not exists idx_arquivos_criado_por on public.arquivos(criado_por) where criado_por is not null;

alter table public.arquivos enable row level security;

-- leitura: membro da clínica vê o metadado dos arquivos dela (pra listar/galeria)
drop policy if exists arquivos_select on public.arquivos;
create policy arquivos_select on public.arquivos
  for select to authenticated
  using (clinica_id = public.current_clinica_id());

-- sem policy de INSERT/UPDATE/DELETE p/ authenticated: só a edge (service_role,
-- que bypassa RLS) grava e remove, com a chave derivada no servidor. Isso fecha
-- o buraco de um cliente inserir uma linha apontando pra objeto de outra clínica.

commit;
