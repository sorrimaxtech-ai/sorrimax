-- ============================================================================
-- SORRIMAX · 0016 · Onboarding atômico (substitui o fluxo frágil de cadastro)
-- ----------------------------------------------------------------------------
-- FLUXO ANTIGO (quebrado e inseguro):
--   1. front cria `clinicas` como ANÔNIMO   ← exigia INSERT público (spam/abuso)
--   2. depois chama signUp
--   3. depois tenta ligar o profile na clínica
--   Se (2) ou (3) falhava, sobrava clínica órfã e usuário sem tenant — que loga
--   e não enxerga nada, para sempre. E os triggers de seed estouravam a RLS.
--
-- FLUXO NOVO:
--   1. front chama signUp  → trigger handle_new_user cria o profile (sem clínica)
--   2. front chama esta RPC, já autenticado → cria a clínica E liga o profile
--      numa única transação. Falhou? Nada fica pela metade.
--   Idempotente: se o usuário já tem clínica, devolve a que existe.
-- ============================================================================

begin;

create or replace function public.criar_clinica_para_usuario(
  p_nome_clinica text,
  p_telefone     text default null,
  p_email        text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_email   text;
  v_atual   uuid;
  v_clinica uuid;
begin
  if v_uid is null then
    raise exception 'Não autenticado: faça login antes de criar a clínica';
  end if;

  -- idempotência: já tem clínica? devolve ela e não cria outra.
  select clinica_id into v_atual from public.profiles where id = v_uid;
  if v_atual is not null then
    return v_atual;
  end if;

  if coalesce(trim(p_nome_clinica), '') = '' then
    raise exception 'Nome da clínica é obrigatório';
  end if;

  select coalesce(p_email, email) into v_email from auth.users where id = v_uid;

  -- os triggers de seed (pipeline, config de pagamento, assinatura trial,
  -- convênio particular) rodam aqui como DEFINER — corrigidos na 0012.
  insert into public.clinicas (nome_clinica, email_clinica, telefone)
  values (trim(p_nome_clinica), v_email, p_telefone)
  returning id into v_clinica;

  -- garante o profile (o trigger handle_new_user normalmente já criou)
  insert into public.profiles (id, clinica_id, email, full_name, telefone, role, status)
  values (v_uid, v_clinica, v_email,
          coalesce((select raw_user_meta_data->>'full_name' from auth.users where id = v_uid), v_email),
          p_telefone, 'admin', 'active')
  on conflict (id) do update
     set clinica_id = excluded.clinica_id,
         telefone   = coalesce(excluded.telefone, public.profiles.telefone),
         role       = 'admin',
         status     = 'active';

  return v_clinica;
end $$;

revoke execute on function public.criar_clinica_para_usuario(text, text, text) from public, anon;
grant   execute on function public.criar_clinica_para_usuario(text, text, text) to authenticated;

-- ---------------------------------------------------------------- helper de sessão
-- O front precisa saber "quem sou eu e de qual clínica" numa chamada só,
-- em vez de guardar isso em localStorage (que é adulterável e dessincroniza).
create or replace function public.meu_contexto()
returns table(
  user_id uuid, email text, nome text, role text,
  clinica_id uuid, clinica_nome text, clinica_codigo text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.email, p.full_name, p.role,
         c.id, c.nome_clinica, c.codigo_clinica
    from public.profiles p
    left join public.clinicas c on c.id = p.clinica_id
   where p.id = auth.uid()
$$;

revoke execute on function public.meu_contexto() from public, anon;
grant   execute on function public.meu_contexto() to authenticated;

commit;
