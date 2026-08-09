-- ============================================================================
-- VITTALHUB · 0021 · Comissão precisa estar ligada à PARCELA
-- ----------------------------------------------------------------------------
-- BUG (achado em teste de ponta a ponta): `gerar_debitos_orcamento` criava a
-- comissão com `parcela_id = NULL`. O trigger `parcela_liberar_comissoes` só
-- libera `where parcela_id = new.id` → nunca encontrava nada, e a comissão
-- ficava eternamente 'prevista' mesmo com o paciente tendo pago.
--
-- CORREÇÃO: a comissão é rateada entre as parcelas, proporcionalmente. Assim o
-- dentista recebe conforme a clínica recebe — que é a regra real do negócio
-- (comissão sobre dinheiro no caixa, não sobre promessa).
-- ============================================================================
create or replace function public.gerar_debitos_orcamento(
  p_orcamento_id uuid, p_forma public.forma_pagamento,
  p_qtd_parcelas smallint default 1, p_primeiro_venc date default current_date,
  p_conta_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_orc record; v_lancamento uuid; v_valor_parc numeric(12,2); v_resto numeric(12,2);
  v_clinica uuid; v_n smallint; i smallint;
begin
  v_clinica := public.current_clinica_id();
  if v_clinica is null then raise exception 'Sem clínica no contexto'; end if;

  select * into v_orc from public.orcamentos where id = p_orcamento_id;
  if not found then raise exception 'Orçamento % não encontrado', p_orcamento_id; end if;
  if v_orc.clinica_id is distinct from v_clinica then raise exception 'Orçamento de outra clínica'; end if;
  if v_orc.status not in ('aprovado','aprovado_parcial') then
    raise exception 'Orçamento precisa estar aprovado (status atual: %)', v_orc.status; end if;
  if v_orc.total_aprovado <= 0 then raise exception 'Orçamento sem valor aprovado'; end if;
  if exists (select 1 from public.lancamentos where orcamento_id = p_orcamento_id) then
    raise exception 'Este orçamento já gerou lançamento financeiro'; end if;

  v_n := greatest(p_qtd_parcelas, 1);

  insert into public.lancamentos (clinica_id,tipo,descricao,paciente_id,orcamento_id,profissional_id,
                                  valor_total,forma_pagamento,qtd_parcelas,conta_id,criado_por)
  values (v_orc.clinica_id,'receber','Orçamento #'||v_orc.numero,v_orc.paciente_id,v_orc.id,
          v_orc.profissional_id,v_orc.total_aprovado,p_forma,v_n,p_conta_id,auth.uid())
  returning id into v_lancamento;

  v_valor_parc := round(v_orc.total_aprovado / v_n, 2);
  v_resto := v_orc.total_aprovado - (v_valor_parc * v_n);

  for i in 1..v_n loop
    insert into public.lancamento_parcelas (clinica_id,lancamento_id,numero,valor,vencimento,conta_id,forma_pagamento)
    values (v_orc.clinica_id, v_lancamento, i,
            v_valor_parc + case when i = 1 then v_resto else 0 end,
            (p_primeiro_venc + ((i-1)||' month')::interval)::date, p_conta_id, p_forma);
  end loop;

  -- comissão rateada POR PARCELA: libera conforme o dinheiro entra
  insert into public.comissoes (clinica_id, profissional_id, orcamento_item_id, parcela_id,
                                procedimento_id, base_calculo, percentual, valor)
  select v_orc.clinica_id,
         coalesce(v_orc.profissional_id, auth.uid()),
         oi.id, par.id, oi.procedimento_id,
         round(oi.total / v_n, 2),
         pp.comissao_percentual,
         round(coalesce(pp.comissao_valor,
                        oi.total * coalesce(pp.comissao_percentual,0) / 100) / v_n, 2)
    from public.orcamento_itens oi
    left join public.procedimento_precos pp
           on pp.procedimento_id = oi.procedimento_id and pp.convenio_id = v_orc.convenio_id
    cross join lateral (
      select id from public.lancamento_parcelas
       where lancamento_id = v_lancamento order by numero
    ) par
   where oi.orcamento_id = p_orcamento_id
     and oi.status = 'aprovado'
     and coalesce(pp.comissao_percentual, pp.comissao_valor, 0) > 0;

  return v_lancamento;
end $$;

revoke execute on function public.gerar_debitos_orcamento(uuid, public.forma_pagamento, smallint, date, uuid) from public, anon;
grant execute on function public.gerar_debitos_orcamento(uuid, public.forma_pagamento, smallint, date, uuid) to authenticated;
