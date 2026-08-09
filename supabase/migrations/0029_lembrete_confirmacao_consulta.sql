-- ============================================================================
-- 0029 — Lembrete / confirmação automática de consulta
-- ----------------------------------------------------------------------------
-- Recurso nº1 do segmento (a landing vende) e o mais pedido: lembrar o paciente
-- e pedir confirmação pelo WhatsApp antes da consulta, cortando o no-show.
-- A infra ja existia (consultas.lembrete_enviado_em + indice de fila); faltava
-- o motor.
--
-- SEGURANÇA (mesma disciplina das campanhas):
--   - OPT-IN por clínica (clinicas.lembrete_consulta_ativo, default FALSE): nada
--     dispara sem a clínica ligar. Auto-enviar WhatsApp a paciente é acao externa.
--   - respeita pacientes.aceita_lembretes (opt-out do paciente, LGPD).
--   - só com instância WhatsApp conectada.
--   - idempotente: marca lembrete_enviado_em; o indice parcial garante 1 envio.
--
-- A confirmação de volta ("SIM") é lida pelo atendente no chat por ora; o
-- auto-confirm por parse de texto fica como follow-up (evita falso-positivo).
-- ============================================================================

begin;

-- ---------------------------------------------------------------- config
alter table public.clinicas
  add column if not exists lembrete_consulta_ativo boolean not null default false,
  add column if not exists lembrete_horas_antes int not null default 24,
  add column if not exists lembrete_template text not null default
    'Olá {nome}! Passando para lembrar da sua consulta na {clinica} em {data} às {hora}. '
    'Podemos confirmar? Responda SIM para confirmar ou entre em contato para remarcar. 😊';

comment on column public.clinicas.lembrete_consulta_ativo is
  'Opt-in do lembrete automático de consulta. false = nada é enviado.';

-- ---------------------------------------------------------------- runner
create or replace function public.enfileirar_lembretes_consulta()
returns table (clinica uuid, enviados int)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cl record;
  v_c  record;
  v_inst uuid;
  v_fone text;
  v_msg  text;
  v_n int;
begin
  for v_cl in
    select id, nome_clinica, lembrete_horas_antes, lembrete_template
      from clinicas
     where lembrete_consulta_ativo
  loop
    -- cada clínica isolada: erro numa não derruba as outras
    begin
      select i.id into v_inst
        from whatsapp_instances i
       where i.clinica_id = v_cl.id and i.status = 'connected'
       order by i.connected_at desc nulls last limit 1;
      if v_inst is null then continue; end if;

      v_n := 0;
      for v_c in
        select c.id as consulta_id, c.inicio, c.paciente_id,
               p.nome_completo, p.celular
          from consultas c
          join pacientes p on p.id = c.paciente_id
         where c.clinica_id = v_cl.id
           and c.lembrete_enviado_em is null
           and c.status in ('agendado','confirmado')
           and c.inicio > now()
           and c.inicio <= now() + make_interval(hours => v_cl.lembrete_horas_antes)
           and coalesce(p.aceita_lembretes, true)
           and nullif(btrim(coalesce(p.celular,'')), '') is not null
      loop
        -- DDI 55 (cadastro salva 10-11 dígitos)
        v_fone := case
          when regexp_replace(v_c.celular, '\D', '', 'g') ~ '^55'
            then regexp_replace(v_c.celular, '\D', '', 'g')
          else '55' || regexp_replace(v_c.celular, '\D', '', 'g') end;
        if length(v_fone) < 12 then
          update consultas set lembrete_enviado_em = now() where id = v_c.consulta_id; -- telefone inválido: não retenta
          continue;
        end if;

        v_msg := replace(replace(replace(replace(v_cl.lembrete_template,
                   '{nome}', split_part(btrim(v_c.nome_completo),' ',1)),
                   '{clinica}', coalesce(v_cl.nome_clinica,'')),
                   '{data}', to_char(v_c.inicio, 'DD/MM')),
                   '{hora}', to_char(v_c.inicio, 'HH24:MI'));

        insert into whatsapp_outbox
          (clinica_id, instance_id, to_number, kind, payload, scheduled_at, next_attempt_at)
        values
          (v_cl.id, v_inst, v_fone, 'text', jsonb_build_object('text', v_msg), now(), now());

        update consultas set lembrete_enviado_em = now() where id = v_c.consulta_id;
        v_n := v_n + 1;
      end loop;

      if v_n > 0 then clinica := v_cl.id; enviados := v_n; return next; end if;
    exception when others then
      raise warning 'lembretes clínica %: %', v_cl.id, sqlerrm;
    end;
  end loop;
end $$;

revoke all on function public.enfileirar_lembretes_consulta() from public, anon, authenticated;

-- roda de hora em hora: assim que a consulta entra na janela de N horas, o
-- lembrete sai. Idempotente (lembrete_enviado_em + indice parcial).
select cron.schedule('lembretes-consulta', '0 * * * *',
                     $$select public.enfileirar_lembretes_consulta()$$)
 where not exists (select 1 from cron.job where jobname = 'lembretes-consulta');

commit;
