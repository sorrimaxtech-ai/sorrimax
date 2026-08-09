# Onboarding conversacional — referência técnica (benchmark Codental)

Levantado em 09/08/2026 inspecionando `app.codental.com.br` ao vivo (CSSOM + `getAnimations()`).
Objetivo: reproduzir o **modelo de interação** — assistente virtual que faz o onboarding em vez de
um formulário — com a identidade do Sorrimax. Nada de copiar a tela: o azul aqui é o Diamond
(`#00b4d8`), não o azul-royal deles.

---

## 1. A orb ("Clara")

Não é vídeo nem Lottie. É **CSS puro**: 7 círculos azuis fundidos por um filtro SVG *gooey*, com
delays escalonados que fazem a massa ondular. Custo próximo de zero, escala em qualquer tamanho.

### Estrutura

```
.aiorb-wrap            → entrada + sombra no chão (::after)
  └ .aiorb             → float vertical (sobe/desce)
      └ .aiorb__goo    → filter: url(#aiorb-goo)   ← funde os lobes
          └ .aiorb__stage
              ├ .aiorb__lobe ×7   ← círculos opacos
              └ .aiorb__core      ← brilho central desfocado
```

### O filtro que funde (o truque todo)

```html
<svg width="0" height="0" style="position:absolute">
  <filter id="aiorb-goo">
    <feGaussianBlur in="SourceGraphic" stdDeviation="8.5" result="b" />
    <feColorMatrix in="b" mode="matrix"
      values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 17 -7" />
  </filter>
</svg>
```

Borra tudo e depois estica o canal alpha (`17` de ganho, `-7` de offset): o que estava meio
transparente vira opaco ou some. Círculos separados viram uma gota só.

### Geometria dos lobes

Box de `180×180`, escalado por `--aiorb-scale` (0.6667 → 120px final).

| # | tamanho | left | top | papel |
|---|---|---|---|---|
| 0 | 72px | 54 | 54 | central |
| 1 | 68px | 56 | 9 | topo |
| 2 | 68px | 98 | 31 | topo-dir |
| 3 | 68px | 98 | 81 | baixo-dir |
| 4 | 68px | 56 | 103 | baixo |
| 5 | 68px | 14 | 81 | baixo-esq |
| 6 | 68px | 14 | 31 | topo-esq |

Hexágono de raio ~47px em volta do central. **Delays: `0, -0.6s, -1.2s, -1.8s, -2.4s, -3.0s, -3.6s`**
sobre 5s de duração — passo de 0.6s dá a onda circulando. Delay negativo faz começar já em
movimento, sem espera inicial.

### CSS (adaptado ao azul Diamond)

```css
.aiorb-wrap{
  position:relative; display:inline-flex; flex-direction:column; align-items:center;
  padding-bottom:12px;
  animation: aiorbEntrance 860ms cubic-bezier(.2,.8,.2,1) both;
}
/* sombra no chão — pulsa em contratempo com o float */
.aiorb-wrap::after{
  content:""; position:absolute; left:50%; bottom:2px;
  width:calc(var(--aiorb-size,120px) * .58); height:10px; border-radius:9999px;
  background:rgba(24,39,71,.22); filter:blur(8px); transform:translateX(-50%);
  animation: aiorbShadow 4.4s ease-in-out 900ms infinite;
}
.aiorb{
  position:relative; width:var(--aiorb-size,120px); height:var(--aiorb-size,120px);
  animation: aiorbFloat 4.4s ease-in-out 900ms infinite;
}
.aiorb__goo{ filter:url(#aiorb-goo); position:absolute; inset:0; }
.aiorb__stage{
  position:absolute; left:var(--aiorb-offset-x,-6px); top:0; width:180px; height:180px;
  transform:scale(var(--aiorb-scale,.6667)); transform-origin:left top;
  animation: aiorbSpin 26s linear infinite;   /* rotação lenta, quase imperceptível */
}
.aiorb__lobe{ position:absolute; border-radius:50%; animation: aiorbLobe 5s ease-in-out infinite; }
.aiorb__core{
  position:absolute; left:38px; top:38px; width:104px; height:104px; border-radius:50%;
  background:radial-gradient(circle,#f8faff,rgba(205,232,255,.45) 42%,transparent 68%);
  filter:blur(4px);
  animation: aiorbCore 2.8s ease-in-out infinite;
}

@keyframes aiorbLobe{ 0%,100%{transform:scale(.93)} 50%{transform:scale(1.1)} }
@keyframes aiorbCore{ 0%,100%{opacity:.5;transform:scale(.92)} 50%{opacity:1;transform:scale(1.22)} }
@keyframes aiorbSpin{ to{transform:rotate(360deg)} }
@keyframes aiorbFloat{ 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-12px) scale(1.015)} }
@keyframes aiorbShadow{
  0%,100%{opacity:.72; transform:translateX(-50%) scaleX(1);   filter:blur(8px)}
  50%    {opacity:.36; transform:translateX(-50%) scaleX(.72); filter:blur(10px)}
}
@keyframes aiorbEntrance{ from{opacity:0;transform:translateY(22px) scale(.92)} to{opacity:1;transform:none} }
```

Detalhe que vende o efeito: a **sombra encolhe quando a orb sobe** (float e shadow com a mesma
duração de 4.4s e mesmo delay). Sem isso ela parece adesivo, não objeto flutuando.

### Cores dos lobes — Sorrimax

Codental usa azul-royal (`#3A82F1`, `#7E93F3`…). Nossa versão gira em torno do `brand`:

```
0 (central) #0099c7   1 #00b4d8   2 #38bdf8   3 #0077b6
4 #00b4d8   5 #0099c7   6 #7dd3fc
```

Variar o tom entre lobes é o que dá profundidade — 7 círculos da mesma cor viram uma bolha chapada.

---

## 2. Cena e tipografia

```css
background:
  radial-gradient(circle at 12% 14%, rgba(255,255,255,.95), transparent 26%),
  radial-gradient(circle at 88% 18%, rgba(185,226,255,.72), transparent 30%),
  radial-gradient(circle at 74% 82%, rgba(81,169,255,.22), transparent 36%),
  linear-gradient(135deg,#dff2ff 0%,#f7fbff 46%,#fff 100%);
```

Três focos de luz + base diagonal, mais uma malha quadriculada bem fraca por cima. Ocupa
`min-height:100dvh` e centraliza tudo.

- **Título**: Poppins 700, ~34px, `#182747`
- **Card de opção**: fundo `rgba(255,255,255,.68)` + `backdrop-blur(12px)`, raio 16px,
  borda `1px rgba(111,177,238,.34)`, sombra `0 14px 34px rgba(31,73,125,.08)`
- **Hover** (transição 180ms): fundo → `.9`, borda → `rgba(49,139,230,.58)`,
  sombra → `0 18px 42px rgba(31,73,125,.13)`. Sem deslocamento — só ganha presença.

### Entrada das opções (stagger)

```css
@keyframes reviewIn{ from{opacity:0;transform:translateY(20px) scale(.98)} to{opacity:1;transform:none} }
/* 560ms cubic-bezier(.2,.8,.2,1), delays 120ms / 200 / 280 / 360 → passo de 80ms */
```

O mesmo par `560ms` + `cubic-bezier(.2,.8,.2,1)` aparece no fluxo inteiro. É a assinatura de
movimento do produto: rápido no começo, freando no fim.

---

## 2.1 Digitação do título (o efeito que mais engana)

O título **não** aparece de uma vez: é digitado caractere a caractere. Mas não é `steps()` nem
JS trocando `textContent` — o texto inteiro já está no DOM desde o começo, cada letra num span:

```css
.type-char { opacity: 0; }
.type-char.is-visible { opacity: 1; }
```

Um timer vai adicionando `.is-visible` letra a letra. A sacada: como o texto completo já ocupa
o espaço dele, **o layout não salta** enquanto digita — os cards abaixo já estão na posição final.
Trocar `textContent` letra a letra causaria reflow a cada caractere e empurraria a página.

Enquanto o título digita, os cards de resposta ficam **em skeleton** (retângulos vazios com o
mesmo tamanho e raio do card final) e só recebem o texto quando a frase termina. O olho lê o
título enquanto o layout já se estabilizou.

### Sequência completa de uma transição

1. Clique na opção → tela atual sai
2. Orb sobe e **encolhe** (120px na abertura → ~72px nas perguntas seguintes)
3. Cards entram como skeleton, já no lugar definitivo
4. Título digita letra a letra
5. Texto dos cards aparece com stagger de 80ms

Sugestão para o nosso: ~22ms por caractere, com respiro maior depois de `.`, `?` e `:`. E
`prefers-reduced-motion` mostrando a frase inteira de uma vez.

---

## 2.2 Componentes além dos cards

**Input de texto** (nome da clínica, CEP):
```
altura 52px · raio 14px · fundo rgba(255,255,255,.92) · texto centralizado, 15px/650
borda   1px rgba(49,139,230,.58)
sombra  0 16px 36px rgba(31,73,125,.10),  0 0 0 4px rgba(98,177,255,.24)  ← anel de foco
```

**CTA primário** (Avançar / Continuar):
```
fundo   linear-gradient(135deg, rgba(23,100,216,.94), rgba(29,158,255,.90))
raio 16px · padding 16px 32px · peso 700 · branco
sombra  0 18px 42px rgba(23,100,216,.22)   ← tingida com a própria cor, não cinza
```
Nasce **desabilitado** e só habilita com resposta válida. Em multi-escolha vem com a legenda
"Selecione quantos quiser" e a lista ganha scroll interno com altura fixa.

**Botão "Voltar"** no topo esquerdo, pílula branca discreta, a partir da 2ª pergunta.

**Modal de retenção**: ao recusar a importação de dados, abre um modal com fundo borrado —
CTA grande para aceitar e um link sublinhado pequeno para recusar. Vale copiar a mecânica
(confirmar antes de perder valor), não a assimetria agressiva entre as duas opções.

---

## 3. O fluxo (18 telas)

Uma pergunta por tela, resposta em 1 clique, sem botão "próximo" na maioria.

1. Função na clínica → Dentista / Secretária(o) / Administrador / Outro
2. Como conheceu → Google / Instagram / Indicação / YouTube / Evento / Outro
3. Organização hoje → Outro sistema / Planilhas / Papel e caneta / Começando agora
4. Qual sistema → Simples Dental / Clinicorp / Capim / Dental Office / Controle Odonto / Easy Dental / Outro
5. Importar dados → Agora não / Sim, quero importar
6. Tamanho da equipe → Somente eu / 1 / 2 / 3 / +4
7. Convite pra equipe (e-mail) → ou "Agora não"
8. Especialidade → Clínico geral / Orto / Implanto / Endo / Perio / Prótese / Dentística / Odontoped / Cirurgia / HOF / Radiologia / DTM / Outra
9. Dores a resolver → Falta de organização / Agenda e faltas / Processos manuais / Relatórios / Captação
10. Nome da clínica
11. Quantidade de cadeiras → 1 / 2 / 3 / 4 / +4
12. **Demo de WhatsApp ao vivo** (ver abaixo)
13. Oferta de apresentação de 15 min → Agendar / Agora não
14. "Tudo pronto" → configura a conta

### O momento mais forte: a demo de WhatsApp

Na tela 12 o sistema **dispara uma mensagem real no WhatsApp do usuário**, pedindo pra ele
confirmar a consulta como se fosse paciente. Ele responde no próprio celular, e a tela seguinte
reage: *"A consulta foi confirmada pelo WhatsApp. É assim que seus pacientes vão responder."*

O usuário sente o produto funcionando antes de ver o sistema. Para venda por tráfego pago, sem
vendedor, é isso que converte — e é a peça que o Sorrimax tem condição de reproduzir, porque a
infra de WhatsApp (uazapi/outbox) já existe.

### Tela final (percorrida até o fim em 09/08)

```
[confetti caindo]
    orb
    ONBOARDING CONCLUÍDO          ← badge verde, caixa alta, tracking largo
    Tudo pronto, Guilherme!       ← nome do usuário
    Clinica Sorrimax está preparada para o futuro.
    Que comece uma nova fase de sucesso 🚀      ← eco do nome da clínica

    ┌ PRESENTE DE BOAS-VINDAS ────────────────┐
    │ 🎁 100 créditos de confirmação de consulta│  ← gancho de ativação
    │    "adicione o telefone do paciente e     │
    │     nós cuidamos do resto"                │
    └──────────────────────────────────────────┘
    ┌ 💬 Gente de verdade pra te ajudar ───────┐
    │    suporte seg–sex 7h–22h, sáb 9h–13h    │  ← mata o medo de ficar sozinho
    └──────────────────────────────────────────┘
            [ Entrar no Codental ]
```

```css
@keyframes confettiFall{
  0%  { transform: translateY(-30px) rotate(0deg);   opacity: 0 }
  8%  { opacity: .9 }
  100%{ transform: translateY(112vh) rotate(540deg); opacity: .9 }
}
```

O presente não é enfeite: 100 créditos de confirmação **exigem cadastrar um paciente com telefone**
para serem usados. O prêmio empurra exatamente a ação que ativa o produto.

### Detalhes de execução que importam

- **Personalização por nome** a partir da pergunta 10: *"Qual é o nome da sua clínica, Guilherme?"*.
  Barato de fazer, muda a sensação de formulário para conversa.
- **Eco da resposta como título**: logo depois de digitar o nome da clínica, a tela seguinte abre
  com *"Clinica Sorrimax 💙"* de título e o pedido de CEP abaixo. O usuário vê o próprio dado
  virando parte do produto. Custa uma linha e é dos momentos mais fortes do fluxo.
- **Busca de endereço por CEP**, com escape "Não sei o CEP, preencher manualmente".
- **As respostas alimentam a configuração** ("vou configurar sua conta com base no que
  conversamos") — especialidade define catálogo de procedimentos, cadeiras definem agenda, equipe
  define usuários. O onboarding *é* o setup, não um questionário jogado fora.
- Todas as telas ficam **pré-renderizadas no DOM** (70 botões de opção de uma vez), só trocando
  visibilidade. Transição instantânea, sem request entre perguntas.

---

## 4. Como isso se aplica ao Sorrimax

O cadastro atual já pergunta quase as mesmas coisas — em formulário seco. O trabalho é reencenar,
não reinventar: mesmas perguntas, uma por tela, com a assistente conduzindo.

Ordem sugerida de implementação:

1. Componente `<AiOrb />` + CSS acima (isolado, testável sozinho)
2. Shell do onboarding: fundo, título, stagger dos cards
3. Máquina de estados das perguntas, aproveitando os campos que o cadastro já coleta
4. Ligar as respostas ao setup real da conta
5. Demo de WhatsApp — última, é a que depende de infra

Ver [[copiar-modelo-de-interacao-nao-a-tela]]: o que se copia é o fluxo e os conceitos, não o
layout nem a paleta.
