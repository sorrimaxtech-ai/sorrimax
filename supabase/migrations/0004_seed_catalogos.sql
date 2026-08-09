-- ============================================================================
-- SORRIMAX · 0004 · Seed de catálogos (clínica multi-profissional)
-- ----------------------------------------------------------------------------
-- Idempotente: pode rodar quantas vezes quiser.
-- Só catálogo global. Nada de dado de clínica/paciente aqui.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- especialidades
-- A tabela já existe (01_schema_principal). Descobre o nome real da coluna de
-- rótulo para não quebrar caso o schema use "nome" ou "descricao".
do $$
declare
  v_col text;
begin
  if to_regclass('public.especialidades') is null then
    raise notice 'tabela especialidades ausente — seed ignorado';
    return;
  end if;

  select column_name into v_col
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'especialidades'
     and column_name in ('nome', 'descricao', 'titulo')
   order by case column_name when 'nome' then 1 when 'descricao' then 2 else 3 end
   limit 1;

  if v_col is null then
    raise notice 'especialidades sem coluna de rótulo reconhecida — seed ignorado';
    return;
  end if;

  execute format($f$
    insert into public.especialidades (%I)
    select v from unnest(array[
      'Clínica Geral','Pediatria','Ginecologia e Obstetrícia','Cardiologia',
      'Dermatologia','Ortopedia e Traumatologia','Psiquiatria','Neurologia',
      'Endocrinologia','Gastroenterologia','Oftalmologia','Otorrinolaringologia',
      'Urologia','Reumatologia','Pneumologia','Nefrologia','Angiologia','Geriatria',
      'Psicologia','Nutrição','Fisioterapia','Fonoaudiologia','Terapia Ocupacional',
      'Odontologia','Enfermagem','Educação Física','Farmácia','Biomedicina',
      'Acupuntura','Quiropraxia','Podologia','Estética'
    ]) as v
    where not exists (
      select 1 from public.especialidades e where e.%I = v
    )
  $f$, v_col, v_col);
end $$;

commit;
