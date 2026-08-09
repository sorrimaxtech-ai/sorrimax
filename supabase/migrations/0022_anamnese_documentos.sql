-- ============================================================================
-- VITTALHUB · 0022 · Anamnese digital + Documentos com merge fields
-- ----------------------------------------------------------------------------
-- Dois diferenciais competitivos num só bloco:
--   · ANAMNESE com construtor de formulário: escala (PHQ-9/GAD-7/dor 0-10),
--     skip logic (condicional), score por peso — o concorrente só tem sim/não.
--   · DOCUMENTOS com MERGE FIELDS reais ({{paciente.nome}}, {{data.hoje}}…) —
--     o concorrente entrega "______" preenchido a caneta.
-- Seeds idempotentes por clínica: 5 modelos de documento de sistema +
-- 1 modelo "Anamnese Odontológica Padrão" com ~27 perguntas em 6 categorias.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- enums
do $$ begin
  create type public.tipo_pergunta as enum (
    'texto',            -- resposta curta
    'texto_longo',      -- resposta longa
    'numero',
    'data',
    'sim_nao',
    'selecao_unica',    -- radio (opcoes jsonb)
    'multipla_escolha', -- checkbox (opcoes jsonb)
    'escala',           -- régua min..max (escala jsonb) — PHQ-9 / GAD-7 / dor 0-10
    'upload',
    'assinatura',
    'secao'             -- separador visual no formulário
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.preenchido_por as enum ('profissional', 'paciente');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- anamnese_modelos — o "formulário" (template) montado pela clínica
-- ============================================================================
create table if not exists public.anamnese_modelos (
  id            uuid primary key default gen_random_uuid(),
  clinica_id    uuid not null references public.clinicas(id) on delete cascade,
  nome          text not null,
  especialidade text,
  publicado     boolean not null default false,  -- só publicado aparece pra preencher
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_anamnese_modelos_clinica
  on public.anamnese_modelos(clinica_id, publicado);

-- ============================================================================
-- anamnese_perguntas — cada pergunta do modelo
-- ----------------------------------------------------------------------------
-- escala jsonb      = {min, max, rotulo_min, rotulo_max}
-- condicional jsonb = skip logic: {pergunta_id, operador, valor}
--                     (só exibe se a resposta da pergunta_id satisfizer)
-- peso_score        = contribuição da resposta no score total (triagem de risco)
-- ============================================================================
create table if not exists public.anamnese_perguntas (
  id           uuid primary key default gen_random_uuid(),
  modelo_id    uuid not null references public.anamnese_modelos(id) on delete cascade,
  clinica_id   uuid not null references public.clinicas(id) on delete cascade,
  categoria    text,
  enunciado    text not null,
  tipo         public.tipo_pergunta not null default 'texto',
  obrigatoria  boolean not null default false,
  opcoes       jsonb,          -- ["opção A","opção B"] p/ selecao_unica|multipla_escolha
  escala       jsonb,          -- {min,max,rotulo_min,rotulo_max}
  condicional  jsonb,          -- {pergunta_id,operador,valor}
  peso_score   numeric(8,2),
  ordem        integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint chk_escala_configurada check (tipo <> 'escala' or escala is not null)
);

create index if not exists idx_anamnese_perguntas_modelo
  on public.anamnese_perguntas(modelo_id, ordem);
create index if not exists idx_anamnese_perguntas_clinica
  on public.anamnese_perguntas(clinica_id);

-- ============================================================================
-- anamnese_respostas — preenchimento (pelo profissional ou pelo paciente)
-- respostas jsonb = { "<pergunta_id>": <valor>, ... }
-- ============================================================================
create table if not exists public.anamnese_respostas (
  id             uuid primary key default gen_random_uuid(),
  clinica_id     uuid not null references public.clinicas(id) on delete cascade,
  paciente_id    uuid not null references public.pacientes(id) on delete cascade,
  consulta_id    uuid references public.consultas(id) on delete set null,
  modelo_id      uuid not null references public.anamnese_modelos(id) on delete restrict,
  respostas      jsonb not null default '{}'::jsonb,
  score_total    numeric(10,2),
  preenchido_por public.preenchido_por not null default 'profissional',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_anamnese_respostas_clinica
  on public.anamnese_respostas(clinica_id, created_at desc);
create index if not exists idx_anamnese_respostas_paciente
  on public.anamnese_respostas(paciente_id, created_at desc);
create index if not exists idx_anamnese_respostas_consulta
  on public.anamnese_respostas(consulta_id);
create index if not exists idx_anamnese_respostas_modelo
  on public.anamnese_respostas(modelo_id);

-- ============================================================================
-- documento_modelos — templates com merge fields ({{paciente.nome}} etc.)
-- sistema=true → veio do seed padrão (a clínica pode editar/duplicar)
-- ============================================================================
create table if not exists public.documento_modelos (
  id                  uuid primary key default gen_random_uuid(),
  clinica_id          uuid not null references public.clinicas(id) on delete cascade,
  nome                text not null,
  tipo                text not null default 'outro', -- atestado|declaracao|recibo|encaminhamento|termo|outro
  corpo_html          text not null,
  variaveis           text[] not null default '{}',  -- merge fields usados no corpo
  exibir_assinatura   boolean not null default true,
  exibir_data_rodape  boolean not null default true,
  sistema             boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_documento_modelos_clinica
  on public.documento_modelos(clinica_id, tipo);

-- ============================================================================
-- documentos_emitidos — snapshot imutável do que foi entregue ao paciente
-- hash = sha256 do conteudo_final_html (verificação de autenticidade)
-- ============================================================================
create table if not exists public.documentos_emitidos (
  id                  uuid primary key default gen_random_uuid(),
  clinica_id          uuid not null references public.clinicas(id) on delete cascade,
  paciente_id         uuid not null references public.pacientes(id) on delete restrict,
  consulta_id         uuid references public.consultas(id) on delete set null,
  modelo_id           uuid references public.documento_modelos(id) on delete set null,
  conteudo_final_html text not null,
  pdf_url             text,
  hash                text,
  emitido_por         uuid references public.profiles(id) on delete set null,
  emitido_em          timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_documentos_emitidos_clinica
  on public.documentos_emitidos(clinica_id, emitido_em desc);
create index if not exists idx_documentos_emitidos_paciente
  on public.documentos_emitidos(paciente_id, emitido_em desc);
create index if not exists idx_documentos_emitidos_consulta
  on public.documentos_emitidos(consulta_id);
create index if not exists idx_documentos_emitidos_modelo
  on public.documentos_emitidos(modelo_id);
create index if not exists idx_documentos_emitidos_emissor
  on public.documentos_emitidos(emitido_por);

-- ---------------------------------------------------------------- RLS
select public.apply_tenant_rls('anamnese_modelos');
select public.apply_tenant_rls('anamnese_perguntas');
select public.apply_tenant_rls('anamnese_respostas');
select public.apply_tenant_rls('documento_modelos');
select public.apply_tenant_rls('documentos_emitidos');

-- ============================================================================
-- SEED 1 · 5 modelos de documento de sistema (por clínica, idempotente)
-- ----------------------------------------------------------------------------
-- Merge fields disponíveis: {{paciente.nome}} {{paciente.cpf}} {{clinica.nome}}
-- {{profissional.nome}} {{profissional.registro}} {{data.hoje}}
-- {{consulta.data}} {{consulta.hora}}
-- ============================================================================
create or replace function public.seed_documentos_clinica(p_clinica uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if p_clinica is null then
    raise exception 'clinica_id obrigatório';
  end if;
  -- guard NULL-safe: com sessão de clínica, só semeia a própria
  if public.current_clinica_id() is not null
     and p_clinica is distinct from public.current_clinica_id() then
    raise exception 'sem permissão para semear outra clínica';
  end if;

  insert into public.documento_modelos
    (clinica_id, nome, tipo, corpo_html, variaveis, exibir_assinatura, exibir_data_rodape, sistema)
  select p_clinica, 'Atestado Odontológico', 'atestado',
    '<h2 style="text-align:center;">ATESTADO ODONTOLÓGICO</h2>'
    || '<p>Atesto, para os devidos fins, que o(a) Sr.(a) <strong>{{paciente.nome}}</strong>, '
    || 'CPF <strong>{{paciente.cpf}}</strong>, esteve em atendimento odontológico na '
    || '<strong>{{clinica.nome}}</strong> no dia <strong>{{consulta.data}}</strong>, '
    || 'às <strong>{{consulta.hora}}</strong>, sob meus cuidados profissionais.</p>'
    || '<p>Em decorrência do procedimento realizado, recomendo afastamento de suas '
    || 'atividades habituais conforme avaliação clínica registrada em prontuário.</p>'
    || '<p style="text-align:right;">{{data.hoje}}</p>',
    array['paciente.nome','paciente.cpf','clinica.nome','consulta.data','consulta.hora','data.hoje'],
    true, true, true
  where not exists (select 1 from public.documento_modelos m
                     where m.clinica_id = p_clinica and m.nome = 'Atestado Odontológico');

  insert into public.documento_modelos
    (clinica_id, nome, tipo, corpo_html, variaveis, exibir_assinatura, exibir_data_rodape, sistema)
  select p_clinica, 'Declaração de Comparecimento', 'declaracao',
    '<h2 style="text-align:center;">DECLARAÇÃO DE COMPARECIMENTO</h2>'
    || '<p>Declaramos, para os devidos fins, que o(a) Sr.(a) <strong>{{paciente.nome}}</strong>, '
    || 'CPF <strong>{{paciente.cpf}}</strong>, compareceu à <strong>{{clinica.nome}}</strong> '
    || 'no dia <strong>{{consulta.data}}</strong>, às <strong>{{consulta.hora}}</strong>, '
    || 'para atendimento odontológico com o(a) profissional '
    || '<strong>{{profissional.nome}}</strong> ({{profissional.registro}}).</p>'
    || '<p style="text-align:right;">{{data.hoje}}</p>',
    array['paciente.nome','paciente.cpf','clinica.nome','consulta.data','consulta.hora',
          'profissional.nome','profissional.registro','data.hoje'],
    true, true, true
  where not exists (select 1 from public.documento_modelos m
                     where m.clinica_id = p_clinica and m.nome = 'Declaração de Comparecimento');

  insert into public.documento_modelos
    (clinica_id, nome, tipo, corpo_html, variaveis, exibir_assinatura, exibir_data_rodape, sistema)
  select p_clinica, 'Recibo de Pagamento', 'recibo',
    '<h2 style="text-align:center;">RECIBO DE PAGAMENTO</h2>'
    || '<p>Recebemos de <strong>{{paciente.nome}}</strong>, CPF <strong>{{paciente.cpf}}</strong>, '
    || 'a importância referente aos procedimentos odontológicos realizados na '
    || '<strong>{{clinica.nome}}</strong> em <strong>{{consulta.data}}</strong>.</p>'
    || '<p>Para clareza, firmamos o presente recibo.</p>'
    || '<p style="text-align:right;">{{data.hoje}}</p>',
    array['paciente.nome','paciente.cpf','clinica.nome','consulta.data','data.hoje'],
    true, true, true
  where not exists (select 1 from public.documento_modelos m
                     where m.clinica_id = p_clinica and m.nome = 'Recibo de Pagamento');

  insert into public.documento_modelos
    (clinica_id, nome, tipo, corpo_html, variaveis, exibir_assinatura, exibir_data_rodape, sistema)
  select p_clinica, 'Encaminhamento', 'encaminhamento',
    '<h2 style="text-align:center;">ENCAMINHAMENTO</h2>'
    || '<p>Encaminho o(a) paciente <strong>{{paciente.nome}}</strong>, '
    || 'CPF <strong>{{paciente.cpf}}</strong>, atendido(a) na <strong>{{clinica.nome}}</strong> '
    || 'em <strong>{{consulta.data}}</strong>, para avaliação e conduta especializada, '
    || 'conforme relatório clínico.</p>'
    || '<p>Coloco-me à disposição para esclarecimentos adicionais.</p>'
    || '<p>Atenciosamente,</p>'
    || '<p><strong>{{profissional.nome}}</strong><br/>{{profissional.registro}}</p>'
    || '<p style="text-align:right;">{{data.hoje}}</p>',
    array['paciente.nome','paciente.cpf','clinica.nome','consulta.data',
          'profissional.nome','profissional.registro','data.hoje'],
    true, true, true
  where not exists (select 1 from public.documento_modelos m
                     where m.clinica_id = p_clinica and m.nome = 'Encaminhamento');

  insert into public.documento_modelos
    (clinica_id, nome, tipo, corpo_html, variaveis, exibir_assinatura, exibir_data_rodape, sistema)
  select p_clinica, 'Termo de Consentimento', 'termo',
    '<h2 style="text-align:center;">TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO</h2>'
    || '<p>Eu, <strong>{{paciente.nome}}</strong>, CPF <strong>{{paciente.cpf}}</strong>, '
    || 'declaro que fui devidamente informado(a) pelo(a) profissional '
    || '<strong>{{profissional.nome}}</strong> ({{profissional.registro}}), da '
    || '<strong>{{clinica.nome}}</strong>, sobre o diagnóstico, o plano de tratamento proposto, '
    || 'seus riscos, benefícios, alternativas e custos.</p>'
    || '<p>Declaro que tive a oportunidade de esclarecer todas as minhas dúvidas e que '
    || 'concordo com a realização do tratamento proposto na consulta de '
    || '<strong>{{consulta.data}}</strong>.</p>'
    || '<p style="text-align:right;">{{data.hoje}}</p>',
    array['paciente.nome','paciente.cpf','clinica.nome','consulta.data',
          'profissional.nome','profissional.registro','data.hoje'],
    true, true, true
  where not exists (select 1 from public.documento_modelos m
                     where m.clinica_id = p_clinica and m.nome = 'Termo de Consentimento');
end;
$fn$;

revoke all on function public.seed_documentos_clinica(uuid) from public, anon;
grant execute on function public.seed_documentos_clinica(uuid) to authenticated, service_role;

-- ============================================================================
-- SEED 2 · Banco de perguntas — "Anamnese Odontológica Padrão" (~27 perguntas)
-- Categorias: Queixa Principal · História Médica · Medicamentos e Alergias ·
--             Hábitos · História Odontológica · Consentimento
-- Retorna o id do modelo (existente ou recém-criado). Idempotente.
-- ============================================================================
create or replace function public.seed_anamnese_odonto(p_clinica uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_modelo uuid;
  v_dor    uuid;  -- "está sentindo dor?"        → condiciona escala de dor
  v_trat   uuid;  -- "em tratamento médico?"     → condiciona qual tratamento
  v_medic  uuid;  -- "medicamento contínuo?"     → condiciona quais medicamentos
  v_alerg  uuid;  -- "alergia a medicamento?"    → condiciona quais alergias
  v_compl  uuid;  -- "complicação odontológica?" → condiciona descrição
begin
  if p_clinica is null then
    raise exception 'clinica_id obrigatório';
  end if;
  if public.current_clinica_id() is not null
     and p_clinica is distinct from public.current_clinica_id() then
    raise exception 'sem permissão para semear outra clínica';
  end if;

  select id into v_modelo from public.anamnese_modelos
   where clinica_id = p_clinica and nome = 'Anamnese Odontológica Padrão'
   limit 1;
  if v_modelo is not null then
    return v_modelo;  -- já semeado
  end if;

  insert into public.anamnese_modelos (clinica_id, nome, especialidade, publicado)
  values (p_clinica, 'Anamnese Odontológica Padrão', 'Odontologia', true)
  returning id into v_modelo;

  -- ------------------------------------------------ Queixa Principal
  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, obrigatoria, ordem)
  values (v_modelo, p_clinica, 'Queixa Principal', 'Qual o motivo principal da sua consulta?', 'texto_longo', true, 1);

  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, ordem)
  values (v_modelo, p_clinica, 'Queixa Principal', 'Há quanto tempo apresenta esse problema?', 'texto', 2);

  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, obrigatoria, ordem)
  values (v_modelo, p_clinica, 'Queixa Principal', 'Está sentindo dor neste momento?', 'sim_nao', true, 3)
  returning id into v_dor;

  insert into public.anamnese_perguntas
    (modelo_id, clinica_id, categoria, enunciado, tipo, escala, condicional, peso_score, ordem)
  values (v_modelo, p_clinica, 'Queixa Principal', 'Qual a intensidade da dor?', 'escala',
          jsonb_build_object('min', 0, 'max', 10, 'rotulo_min', 'Sem dor', 'rotulo_max', 'Pior dor imaginável'),
          jsonb_build_object('pergunta_id', v_dor, 'operador', 'igual', 'valor', true),
          1, 4);

  -- ------------------------------------------------ História Médica
  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, obrigatoria, ordem)
  values (v_modelo, p_clinica, 'História Médica', 'Está em tratamento médico atualmente?', 'sim_nao', true, 5)
  returning id into v_trat;

  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, condicional, ordem)
  values (v_modelo, p_clinica, 'História Médica', 'Qual tratamento e com qual médico?', 'texto',
          jsonb_build_object('pergunta_id', v_trat, 'operador', 'igual', 'valor', true), 6);

  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, opcoes, peso_score, ordem)
  values (v_modelo, p_clinica, 'História Médica', 'Possui alguma destas condições?', 'multipla_escolha',
          jsonb_build_array('Diabetes','Hipertensão','Cardiopatia','Problemas renais',
                            'Problemas hepáticos','Epilepsia','Osteoporose','Nenhuma'),
          2, 7);

  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, ordem)
  values (v_modelo, p_clinica, 'História Médica', 'Já foi hospitalizado(a) ou passou por cirurgia?', 'sim_nao', 8);

  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, peso_score, ordem)
  values (v_modelo, p_clinica, 'História Médica', 'Possui problema de cicatrização ou sangramento excessivo?', 'sim_nao', 2, 9);

  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, opcoes, ordem)
  values (v_modelo, p_clinica, 'História Médica', 'Está grávida ou amamentando?', 'selecao_unica',
          jsonb_build_array('Grávida','Amamentando','Não se aplica'), 10);

  -- ------------------------------------------------ Medicamentos e Alergias
  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, obrigatoria, ordem)
  values (v_modelo, p_clinica, 'Medicamentos e Alergias', 'Faz uso contínuo de algum medicamento?', 'sim_nao', true, 11)
  returning id into v_medic;

  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, condicional, ordem)
  values (v_modelo, p_clinica, 'Medicamentos e Alergias', 'Quais medicamentos?', 'texto_longo',
          jsonb_build_object('pergunta_id', v_medic, 'operador', 'igual', 'valor', true), 12);

  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, obrigatoria, peso_score, ordem)
  values (v_modelo, p_clinica, 'Medicamentos e Alergias', 'Possui alergia a algum medicamento?', 'sim_nao', true, 3, 13)
  returning id into v_alerg;

  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, condicional, ordem)
  values (v_modelo, p_clinica, 'Medicamentos e Alergias', 'Quais alergias?', 'texto',
          jsonb_build_object('pergunta_id', v_alerg, 'operador', 'igual', 'valor', true), 14);

  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, peso_score, ordem)
  values (v_modelo, p_clinica, 'Medicamentos e Alergias', 'Já teve reação à anestesia odontológica?', 'sim_nao', 3, 15);

  -- ------------------------------------------------ Hábitos
  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, opcoes, peso_score, ordem)
  values (v_modelo, p_clinica, 'Hábitos', 'Fuma?', 'selecao_unica',
          jsonb_build_array('Nunca fumou','Ex-fumante','Fuma atualmente'), 1, 16);

  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, opcoes, ordem)
  values (v_modelo, p_clinica, 'Hábitos', 'Consome bebida alcoólica?', 'selecao_unica',
          jsonb_build_array('Não','Socialmente','Frequentemente'), 17);

  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, peso_score, ordem)
  values (v_modelo, p_clinica, 'Hábitos', 'Range ou aperta os dentes (bruxismo)?', 'sim_nao', 1, 18);

  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, ordem)
  values (v_modelo, p_clinica, 'Hábitos', 'Quantas vezes escova os dentes por dia?', 'numero', 19);

  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, ordem)
  values (v_modelo, p_clinica, 'Hábitos', 'Usa fio dental diariamente?', 'sim_nao', 20);

  -- ------------------------------------------------ História Odontológica
  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, ordem)
  values (v_modelo, p_clinica, 'História Odontológica', 'Quando foi sua última consulta ao dentista?', 'data', 21);

  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, ordem)
  values (v_modelo, p_clinica, 'História Odontológica', 'Já teve complicação em tratamento odontológico?', 'sim_nao', 22)
  returning id into v_compl;

  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, condicional, ordem)
  values (v_modelo, p_clinica, 'História Odontológica', 'Descreva a complicação', 'texto_longo',
          jsonb_build_object('pergunta_id', v_compl, 'operador', 'igual', 'valor', true), 23);

  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, peso_score, ordem)
  values (v_modelo, p_clinica, 'História Odontológica', 'Suas gengivas sangram com facilidade?', 'sim_nao', 1, 24);

  insert into public.anamnese_perguntas
    (modelo_id, clinica_id, categoria, enunciado, tipo, escala, peso_score, ordem)
  values (v_modelo, p_clinica, 'História Odontológica',
          'Qual seu nível de ansiedade em relação ao tratamento dentário?', 'escala',
          jsonb_build_object('min', 0, 'max', 10, 'rotulo_min', 'Tranquilo(a)', 'rotulo_max', 'Pânico total'),
          1, 25);

  -- ------------------------------------------------ Consentimento
  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, obrigatoria, ordem)
  values (v_modelo, p_clinica, 'Consentimento',
          'Declaro que as informações prestadas são verdadeiras e completas', 'sim_nao', true, 26);

  insert into public.anamnese_perguntas (modelo_id, clinica_id, categoria, enunciado, tipo, obrigatoria, ordem)
  values (v_modelo, p_clinica, 'Consentimento', 'Assinatura do paciente', 'assinatura', true, 27);

  return v_modelo;
end;
$fn$;

revoke all on function public.seed_anamnese_odonto(uuid) from public, anon;
grant execute on function public.seed_anamnese_odonto(uuid) to authenticated, service_role;

-- ============================================================================
-- Toda clínica NOVA já nasce com os padrões (mesmo padrão do convênio Particular)
-- ============================================================================
create or replace function public.seed_clinica_padroes()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.seed_documentos_clinica(new.id);
  perform public.seed_anamnese_odonto(new.id);
  return new;
end;
$fn$;

revoke all on function public.seed_clinica_padroes() from public, anon;

drop trigger if exists trg_clinica_seed_padroes on public.clinicas;
create trigger trg_clinica_seed_padroes
  after insert on public.clinicas
  for each row execute function public.seed_clinica_padroes();

-- ---------------------------------------------------------------- backfill
-- Clínicas já existentes recebem os seeds agora (idempotente).
do $$
declare r record;
begin
  for r in select id from public.clinicas loop
    perform public.seed_documentos_clinica(r.id);
    perform public.seed_anamnese_odonto(r.id);
  end loop;
end $$;

commit;
