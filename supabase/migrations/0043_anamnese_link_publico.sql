-- ============================================================================
-- 0043 · Link online de prontuário/anamnese
-- ----------------------------------------------------------------------------
-- A recepção escolhe um modelo de anamnese, gera um link e manda ao paciente
-- (WhatsApp). O paciente abre /p/<token> SEM login, preenche os dados básicos
-- e o questionário; o sistema cria (ou reaproveita pelo celular) o paciente e
-- grava a anamnese com preenchido_por = 'paciente'.
--
-- Segurança: o anon NUNCA lê tabela alguma. Tudo passa por duas funções
-- SECURITY DEFINER com search_path fixo, que só respondem a um token válido,
-- não expirado e de uso único. A tabela anamnese_links tem RLS de tenant
-- (apply_tenant_rls) para o lado autenticado.
-- ============================================================================

begin;

create table if not exists public.anamnese_links (
  id            uuid primary key default gen_random_uuid(),
  clinica_id    uuid not null references public.clinicas(id) on delete cascade,
  modelo_id     uuid not null references public.anamnese_modelos(id) on delete cascade,
  -- token de 64 hex sem extensão pgcrypto: dois uuid v4 concatenados
  token         text not null unique
                  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  criado_em     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  expira_em     timestamptz not null default now() + interval '7 days',
  respondido_em timestamptz,
  paciente_id   uuid references public.pacientes(id) on delete set null
);

comment on table public.anamnese_links is
  'Links públicos de preenchimento de anamnese — uso único, com validade.';

select public.apply_tenant_rls('anamnese_links');

create index if not exists idx_anamnese_links_clinica  on public.anamnese_links (clinica_id);
create index if not exists idx_anamnese_links_modelo   on public.anamnese_links (modelo_id);
create index if not exists idx_anamnese_links_paciente on public.anamnese_links (paciente_id);

-- NOTA auditoria_saude(): as duas funções abaixo aparecem como FUNÇÃO-ANON.
-- É intencional — link público exige execução sem login. A proteção é o token
-- (256 bits de aleatoriedade, uso único, expira em 7 dias) validado dentro da
-- função; nenhuma tabela fica legível ao anon.

-- ---------------------------------------------------------------------------
-- Carrega o formulário do link: nome da clínica, do modelo e as perguntas.
-- ---------------------------------------------------------------------------
create or replace function public.anamnese_link_info(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link      anamnese_links%rowtype;
  v_clinica   text;
  v_modelo    text;
  v_perguntas jsonb;
begin
  select * into v_link from anamnese_links where token = p_token;
  if not found then
    raise exception 'Link inválido';
  end if;
  if v_link.respondido_em is not null then
    raise exception 'Este link já foi utilizado';
  end if;
  if v_link.expira_em < now() then
    raise exception 'Este link expirou — peça um novo à clínica';
  end if;

  select nome_clinica into v_clinica from clinicas where id = v_link.clinica_id;
  select nome into v_modelo from anamnese_modelos where id = v_link.modelo_id;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', id, 'enunciado', enunciado, 'categoria', categoria,
               'tipo', tipo, 'obrigatoria', obrigatoria,
               'opcoes', opcoes, 'escala', escala, 'ordem', ordem
             ) order by ordem
           ), '[]'::jsonb)
    into v_perguntas
    from anamnese_perguntas
   where modelo_id = v_link.modelo_id
     and clinica_id = v_link.clinica_id;

  return jsonb_build_object(
    'clinica', v_clinica,
    'modelo', v_modelo,
    'perguntas', v_perguntas
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Recebe a resposta: valida, cria/reaproveita o paciente e grava a anamnese.
-- ---------------------------------------------------------------------------
create or replace function public.anamnese_link_responder(
  p_token      text,
  p_nome       text,
  p_celular    text,
  p_nascimento date,
  p_respostas  jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link     anamnese_links%rowtype;
  v_paciente uuid;
  v_digitos  text;
begin
  select * into v_link from anamnese_links where token = p_token for update;
  if not found then
    raise exception 'Link inválido';
  end if;
  if v_link.respondido_em is not null then
    raise exception 'Este link já foi utilizado';
  end if;
  if v_link.expira_em < now() then
    raise exception 'Este link expirou — peça um novo à clínica';
  end if;

  if length(coalesce(trim(p_nome), '')) < 5 then
    raise exception 'Informe o nome completo';
  end if;
  v_digitos := regexp_replace(coalesce(p_celular, ''), '\D', '', 'g');
  if v_digitos !~ '^\d{10,13}$' then
    raise exception 'Celular inválido — informe com DDD';
  end if;
  if p_nascimento is null
     or p_nascimento > current_date
     or p_nascimento < date '1900-01-01' then
    raise exception 'Data de nascimento inválida';
  end if;

  -- mesmo celular na mesma clínica = mesma pessoa; evita cadastro duplicado
  select id into v_paciente
    from pacientes
   where clinica_id = v_link.clinica_id
     and regexp_replace(coalesce(celular, ''), '\D', '', 'g') = v_digitos
   limit 1;

  if v_paciente is null then
    insert into pacientes (clinica_id, nome_completo, celular, data_nascimento)
    values (v_link.clinica_id, trim(p_nome), p_celular, p_nascimento)
    returning id into v_paciente;
  end if;

  insert into anamnese_respostas (clinica_id, paciente_id, modelo_id, respostas, preenchido_por)
  values (v_link.clinica_id, v_paciente, v_link.modelo_id,
          coalesce(p_respostas, '{}'::jsonb), 'paciente');

  update anamnese_links
     set respondido_em = now(), paciente_id = v_paciente
   where id = v_link.id;

  return v_paciente;
end;
$$;

revoke all on function public.anamnese_link_info(text) from public;
revoke all on function public.anamnese_link_responder(text, text, text, date, jsonb) from public;
grant execute on function public.anamnese_link_info(text) to anon, authenticated;
grant execute on function public.anamnese_link_responder(text, text, text, date, jsonb) to anon, authenticated;

commit;

-- ══ Verificação ═════════════════════════════════════════════════════════════
-- select * from auditoria_saude();               -- esperado: GERAL / OK
-- select anamnese_link_info('token-inexistente'); -- esperado: erro 'Link inválido'
