# Painel da Plataforma

O lado de dentro do SaaS: onde o time Sorrimax vê todas as clínicas, cria conta com preço
combinado, estica teste grátis e acompanha o funil. Entra por `/plataforma`, só para quem está
em `plataforma_membros`.

Migration: `supabase/migrations/0044_painel_plataforma.sql`.

---

## A decisão que define tudo: o painel não vê paciente

O caminho óbvio seria dar cross-tenant a um super-usuário — `or is_plataforma()` em cada policy.
Isso abriria prontuário, anamnese, alergia e conversa de WhatsApp de **todas** as clínicas para uma
única conta. É dado de saúde, com a LGPD do outro lado, e uma credencial vazada valeria a base
inteira.

O acesso aqui é o contrário: **nenhuma policy de tenant foi afrouxada**. Toda leitura passa por uma
RPC `SECURITY DEFINER`, uma por pergunta, que devolve **contagem e metadado de conta**. O painel sabe
que a clínica X tem 412 pacientes; não consegue saber o nome de nenhum, nem com a chave na mão.

O que o painel enxerga de pessoas: a **equipe** da clínica (nome, e-mail, papel, último acesso) —
colegas de trabalho, não pacientes.

---

## Quem entra

| Papel | Pode |
|---|---|
| **Responsável** (`dono`) | tudo: criar clínica, plano, preço, cortesia, bloqueio, e mexer no próprio time |
| **Suporte** | ver tudo, esticar teste grátis, cuidar de contatos |

Papel fica em `plataforma_membros`, tabela à parte de propósito. Usar `profiles.role = 'dono'`
exigiria mexer no campo que as policies de **tenant** leem (`is_admin()`, `current_role()`) — o
caminho mais quente da segurança do sistema. Aditivo é mais seguro: quem não está na tabela não
vira ninguém.

Dar acesso a alguém: aba **Registro → Time Sorrimax**. A pessoa precisa já ter conta no Sorrimax —
o painel libera acesso, não cria login.

---

## As cinco telas

### Visão geral
Na ordem das perguntas de quem abre de manhã:

- **Receita** — faturamento mensal, no ano, ticket médio, e quanto ainda pode virar receita
  (quem está em teste ou atraso com valor já combinado).
- **Clínicas** — total, pagando, em teste, cortesia, bloqueadas.
- **Uso de verdade** — pessoas ativas em 7 e 30 dias, clínicas que entraram no mês, e **paradas há
  14 dias** (assinatura paga com ninguém entrando é churn que ainda não avisou).
- **Precisa de você** — testes vencendo, testes já vencidos, pagamento em atraso, contatos em
  aberto. Cada cartão leva para a lista já filtrada.
- **Crescimento** — clínicas novas e canceladas por mês, base acumulada e contatos.
- **Operação** — pacientes, consultas, orçamentos, cadeiras e números de WhatsApp que rodam em cima
  da gente.

### Clínicas
Uma linha por conta com o que decide ação: quanto paga, situação, quanto sobra de teste, há quanto
tempo ninguém entra. Filtros ficam na URL (`?status=trial&uf=SP`) para dar para mandar o link
pronto para alguém.

Clicar abre a ficha lateral, onde ficam as ações.

### Potenciais
O funil **antes** de existir clínica: quem pediu demonstração, veio de anúncio, foi prospectado.
Um botão transforma o contato em conta sem redigitar nada.

`plataforma_leads` aceita `INSERT` anônimo de propósito — é o formulário do site gravando direto.
Ler, só o time.

### Mercado
Concentração por estado e cidade (onde anunciar, onde o boca a boca já funciona) e o perfil
declarado pelas clínicas no primeiro acesso — o que a Clara coleta no onboarding.

### Registro
Toda ação daqui mexe em dinheiro ou em acesso de terceiro. Seis meses depois, *"por que essa
clínica está de graça?"* precisa de resposta com nome e data. A trilha é gravada pelas próprias
RPCs: não dá para agir sem deixar registro, nem para apagar registro pela interface.

---

## Criar clínica com a condição que a gente quiser

**Clínicas → Nova clínica.** Preço é campo livre: o valor de tabela é sugestão, e quem fecha no
telefone precisa poder combinar outro sem pedir deploy.

- **Valor e ciclo** — mensal, trimestral, semestral ou anual. O faturamento normaliza sozinho
  (R$ 1.970 no anual entram como R$ 164,17/mês). A tela mostra a conta antes de salvar, porque é
  fácil digitar o valor do ano achando que é o do mês.
- **Teste grátis** — atalhos de 7 dias a 6 meses, campo livre, ou **sem prazo**.
- **Cortesia** — usa tudo e não paga nunca. Fica **fora** do faturamento: cortesia contada como
  receita é métrica mentindo para o próprio dono.

O responsável ainda não tem login quando a conta nasce. Em vez de inventar usuário na marra, fica um
**convite** pelo e-mail: no cadastro, o sistema amarra o perfil nessa clínica já como administrador.
Se ele já tiver conta e estiver sem clínica, o vínculo é imediato.

## Esticar o teste de quem já é cliente

Na ficha da conta, três formas — porque as três aparecem na vida real:

| Forma | Quando |
|---|---|
| **+N dias** | "dá mais 30 dias pra ele" |
| **Até uma data** | "deixa até o fim do congresso, dia 12/09" |
| **Sem prazo** | "esse é parceiro, nunca cobra" |

Prorrogar soma a partir do fim atual quando o teste ainda corre, e a partir de hoje quando já
venceu — senão "estender" encurtaria.

---

## Bloquear uma clínica

Bloqueio que só esconde botão no front é teatro: a chave anônima é pública e as consultas são
chamáveis à mão. Aqui ele é uma **policy `RESTRICTIVE`** aplicada a toda tabela com `clinica_id`.
Restritivas entram com `AND` sobre as permissivas, então uma só fecha a tabela inteira sem tocar em
nenhuma policy de tenant.

Quatro regras deliberadas:

1. **Fail-open.** Sem linha de assinatura, `NULL`, qualquer dúvida → liberado. Um bug aqui
   derrubaria todas as clínicas de uma vez; o custo do erro é assimétrico.
2. **Manual.** Teste vencido **não** bloqueia sozinho. Quem decide é gente.
3. **A porta de saída fica aberta.** A clínica bloqueada continua enxergando `clinicas`, `profiles`
   e `asaas_assinaturas` — precisa ver o aviso e conseguir pagar. Trancar isso seria armadilha.
4. **O time passa** (`is_plataforma()`), para conseguir dar suporte.

O motivo é obrigatório: é exatamente o texto que a clínica lê na tela `/conta-suspensa`.

Desfazer sem interface:

```sql
update asaas_assinaturas set bloqueada = false where clinica_id = '...';
```

---

## Como os números são calculados

| Número | Regra |
|---|---|
| **Faturamento mensal** | soma de `valor / meses do ciclo`, só de `status = 'ativa'` e **sem** cortesia |
| **No ano** | mensal × 12 (foto de hoje, não previsão) |
| **Clínica ativa** | alguém da equipe entrou nos últimos 30 dias |
| **Pessoa ativa** | `last_sign_in_at` dentro da janela |
| **Conversão de teste** | pagando ÷ (pagando + canceladas + em teste) |
| **Clínicas de sistema** | `clinicas.sistema = true` fica fora de tudo |

**Limite conhecido:** o banco não guarda histórico de preço, então a série de faturamento por mês
repete a foto de hoje para os meses anteriores. Só o mês corrente é real. Preferimos assumir isso a
inventar série falsa — a alternativa honesta é uma tabela de histórico de assinatura, que ainda não
existe.

---

## Depois de aplicar a migration

```sql
select * from auditoria_saude();   -- esperado: nada de novo
```

Se o e-mail do responsável ainda não existia em `auth.users` quando a migration rodou, o `NOTICE`
imprimiu o `insert` pronto para colar depois do cadastro. Para conferir quem tem acesso:

```sql
select email, papel, ativo from plataforma_membros order by email;
```

---

## O que ainda não existe

- **Cobrança automática pelo painel.** Criar a assinatura no Asaas a partir daqui — hoje o valor é
  registro do combinado, e a cobrança segue o fluxo do `0027`.
- **Histórico de preço**, que é o que falta para a série de faturamento ser real mês a mês.
- **Formulário do site gravando em `plataforma_leads`.** A tabela já aceita gravação anônima; falta
  o site apontar para ela.
- **Exportar a lista** para planilha.
