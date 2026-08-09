-- ============================================================================
-- SORRIMAX · 0020 · Regiões faciais (HOF — Harmonização Orofacial)
-- ----------------------------------------------------------------------------
-- O orçamento precisa lançar procedimento em REGIÃO DO ROSTO, não só em dente.
-- É o recurso premium do concorrente (faceograma). Lista fechada = consistência
-- de relatório (senão cada dentista digita "bigode chinês" de um jeito).
-- ============================================================================
do $$ begin
  create type public.regiao_facial as enum (
    'testa','glabela','temporal','periorbital','olheira','supercilio',
    'nariz','dorso_nasal','malar','zigomatico','sulco_nasogeniano',
    'labio_superior','labio_inferior','codigo_barras','mento','sulco_labiomentual',
    'mandibula','papada','pescoco','bichectomia','masseter','arco_zigomatico'
  );
exception when duplicate_object then null; end $$;

-- rótulos legíveis para a UI (evita traduzir enum no front)
create table if not exists public.regioes_faciais (
  codigo   public.regiao_facial primary key,
  rotulo   text not null,
  grupo    text not null,
  ordem    int  not null default 0
);

insert into public.regioes_faciais (codigo, rotulo, grupo, ordem) values
  ('testa','Testa','Terço superior',1),
  ('glabela','Glabela','Terço superior',2),
  ('temporal','Temporal','Terço superior',3),
  ('supercilio','Supercílio','Terço superior',4),
  ('periorbital','Periorbital (pés de galinha)','Terço superior',5),
  ('olheira','Olheira','Terço superior',6),
  ('nariz','Nariz','Terço médio',10),
  ('dorso_nasal','Dorso nasal','Terço médio',11),
  ('malar','Malar','Terço médio',12),
  ('zigomatico','Zigomático','Terço médio',13),
  ('arco_zigomatico','Arco zigomático','Terço médio',14),
  ('sulco_nasogeniano','Sulco nasogeniano','Terço médio',15),
  ('bichectomia','Bichectomia','Terço médio',16),
  ('labio_superior','Lábio superior','Terço inferior',20),
  ('labio_inferior','Lábio inferior','Terço inferior',21),
  ('codigo_barras','Código de barras','Terço inferior',22),
  ('mento','Mento','Terço inferior',23),
  ('sulco_labiomentual','Sulco labiomentual','Terço inferior',24),
  ('mandibula','Mandíbula','Terço inferior',25),
  ('masseter','Masseter (bruxismo)','Terço inferior',26),
  ('papada','Papada','Terço inferior',27),
  ('pescoco','Pescoço','Terço inferior',28)
on conflict (codigo) do update set rotulo=excluded.rotulo, grupo=excluded.grupo, ordem=excluded.ordem;

-- catálogo global: leitura para logados, escrita só admin
alter table public.regioes_faciais enable row level security;
drop policy if exists regioes_faciais_read on public.regioes_faciais;
create policy regioes_faciais_read on public.regioes_faciais
  for select to authenticated using (true);
grant select on public.regioes_faciais to authenticated;

-- o item de orçamento passa a poder referenciar a região facial de forma tipada
alter table public.orcamento_itens
  add column if not exists regiao_facial public.regiao_facial;
alter table public.odontograma_registros
  add column if not exists regiao_facial public.regiao_facial;
