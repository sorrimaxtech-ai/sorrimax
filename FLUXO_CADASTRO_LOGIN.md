# Fluxo de Cadastro e Login - SORRIMAX

## 🎯 Visão Geral

Sistema com **código único de clínica** gerado automaticamente, permitindo que múltiplos profissionais acessem os mesmos dados.

---

## 📝 Fluxo de Cadastro (Primeira Vez)

### Passo 1: Tela de Cadastro Inicial

**Campos obrigatórios:**

- Nome da Clínica
- CNPJ (opcional)
- Email da Clínica
- Telefone
- Nome do Administrador
- Email do Administrador (será o login)
- Senha

**Campos opcionais (podem ser preenchidos depois):**

- Endereço completo
- Especialidades
- Horário de funcionamento

### Passo 2: Backend - Criação da Clínica

```typescript
// 1. Criar usuário no Supabase Auth
const { data: authData, error: authError } = await supabase.auth.signUp({
  email: emailAdmin,
  password: senha,
  options: {
    data: {
      full_name: nomeAdmin,
    },
  },
});

// 2. Criar clínica (código gerado automaticamente via trigger)
const { data: clinica, error: clinicaError } = await supabase
  .from("clinicas")
  .insert({
    nome_clinica: nomeClinica,
    cnpj: cnpj,
    email_clinica: emailClinica,
    telefone: telefone,
  })
  .select()
  .single();

// Resultado: clinica.codigo_clinica = 'VH-12345' (gerado automaticamente!)

// 3. Associar usuário à clínica como admin
const { error: profileError } = await supabase
  .from("profiles")
  .update({
    clinica_id: clinica.id,
    role: "admin",
    full_name: nomeAdmin,
  })
  .eq("id", authData.user.id);

// 4. Criar endereço (se fornecido)
if (endereco) {
  await supabase.from("enderecos_clinica").insert({
    clinica_id: clinica.id,
    cep: endereco.cep,
    endereco: endereco.rua,
    numero: endereco.numero,
    cidade: endereco.cidade,
    estado: endereco.estado,
  });
}

// 5. Assinatura trial e config de pagamento criadas AUTOMATICAMENTE via triggers!

// 6. Retornar código da clínica para o usuário
return {
  success: true,
  codigo_clinica: clinica.codigo_clinica,
  message: `Clínica criada! Seu código é: ${clinica.codigo_clinica}`,
};
```

### Passo 3: Tela de Sucesso

**Mostrar ao usuário:**

```
✅ Clínica cadastrada com sucesso!

📋 Seu código de clínica: VH-12345

⚠️ IMPORTANTE: Guarde este código!
Você e sua equipe usarão este código para fazer login.

🎁 Trial ativado: 14 dias grátis
```

---

## 🔐 Fluxo de Login

### Opção 1: Login Simples (Recomendado)

**Tela de Login:**

- Email
- Senha

```typescript
// Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: email,
  password: senha,
});

if (error) {
  return { error: "Email ou senha incorretos" };
}

// Buscar dados da clínica do usuário
const { data: profile } = await supabase
  .from("profiles")
  .select(
    `
    *,
    clinica:clinicas(*)
  `
  )
  .eq("id", data.user.id)
  .single();

// Verificar se tem clínica associada
if (!profile.clinica_id) {
  return { error: "Usuário sem clínica associada" };
}

// Verificar assinatura ativa
const { data: assinatura } = await supabase
  .from("assinaturas")
  .select("*")
  .eq("clinica_id", profile.clinica_id)
  .single();

if (assinatura.status === "expired") {
  return { error: "Assinatura expirada. Renove seu plano." };
}

// Login bem-sucedido!
return {
  user: data.user,
  profile: profile,
  clinica: profile.clinica,
  codigo_clinica: profile.clinica.codigo_clinica,
};
```

### Opção 2: Login com Código de Clínica (Alternativa)

**Tela de Login:**

- Código da Clínica (VH-XXXXX)
- Email
- Senha

```typescript
// Validar código da clínica primeiro
const { data: clinica } = await supabase
  .from("clinicas")
  .select("id")
  .eq("codigo_clinica", codigoClinica)
  .single();

if (!clinica) {
  return { error: "Código de clínica inválido" };
}

// Login normal
const { data, error } = await supabase.auth.signInWithPassword({
  email: email,
  password: senha,
});

// Verificar se usuário pertence à clínica informada
const { data: profile } = await supabase
  .from("profiles")
  .select("clinica_id")
  .eq("id", data.user.id)
  .single();

if (profile.clinica_id !== clinica.id) {
  return { error: "Usuário não pertence a esta clínica" };
}

// Login bem-sucedido!
```

---

## 👥 Adicionar Profissional à Clínica

### Fluxo de Convite:

```typescript
// 1. Admin convida novo profissional
async function convidarProfissional(emailNovo: string, role: string) {
  // Verificar se pode adicionar mais profissionais
  const { data: canAdd } = await supabase.rpc("can_add_professional", {
    p_clinica_id: clinicaId,
  });

  if (!canAdd) {
    return {
      error: "Limite de profissionais atingido. Faça upgrade do plano.",
    };
  }

  // Criar convite (pode ser via email ou link)
  const conviteToken = generateToken();

  await supabase.from("convites").insert({
    clinica_id: clinicaId,
    email: emailNovo,
    role: role,
    token: conviteToken,
    expira_em: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
  });

  // Enviar email com link de convite
  await sendEmail({
    to: emailNovo,
    subject: "Convite para SORRIMAX",
    body: `Você foi convidado para a clínica. 
           Acesse: https://sorrimax.com/aceitar-convite/${conviteToken}`,
  });
}

// 2. Profissional aceita convite
async function aceitarConvite(token: string, senha: string) {
  // Buscar convite
  const { data: convite } = await supabase
    .from("convites")
    .select("*")
    .eq("token", token)
    .single();

  if (!convite || convite.expira_em < new Date()) {
    return { error: "Convite inválido ou expirado" };
  }

  // Criar usuário
  const { data: authData } = await supabase.auth.signUp({
    email: convite.email,
    password: senha,
  });

  // Associar à clínica
  await supabase
    .from("profiles")
    .update({
      clinica_id: convite.clinica_id,
      role: convite.role,
    })
    .eq("id", authData.user.id);

  // Marcar convite como usado
  await supabase.from("convites").update({ usado: true }).eq("id", convite.id);

  return { success: true };
}
```

---

## 🔍 Buscar Dados da Clínica

Após login, todos os dados são filtrados automaticamente pelo `clinica_id`:

```typescript
// Exemplo: Buscar pacientes da clínica
const { data: pacientes } = await supabase
  .from("patients")
  .select("*")
  .eq("clinica_id", clinicaId);

// RLS garante que só vê dados da própria clínica!
```

---

## 📊 Verificar Status da Assinatura

```typescript
async function verificarAssinatura(clinicaId: string) {
  const { data: assinatura } = await supabase
    .from("assinaturas")
    .select("*")
    .eq("clinica_id", clinicaId)
    .single();

  if (assinatura.status === "trial") {
    const diasRestantes = await supabase.rpc("trial_dias_restantes", {
      assinatura_id: assinatura.id,
    });

    return {
      tipo: "trial",
      diasRestantes: diasRestantes,
      mensagem: `Você tem ${diasRestantes} dias de trial restantes`,
    };
  }

  if (assinatura.status === "active") {
    return {
      tipo: "ativa",
      plano: assinatura.plano,
      proximaCobranca: assinatura.data_fim,
    };
  }

  if (assinatura.status === "expired") {
    return {
      tipo: "expirada",
      mensagem: "Sua assinatura expirou. Renove para continuar.",
    };
  }
}
```

---

## 🎯 Resumo do Fluxo

1. **Cadastro**: Usuário cria clínica → Código único gerado (VH-XXXXX)
2. **Login**: Email + Senha → Sistema busca `clinica_id` do usuário
3. **Dados**: Todos os dados filtrados por `clinica_id` automaticamente (RLS)
4. **Equipe**: Admin convida profissionais → Todos acessam mesma clínica
5. **Assinatura**: Trial 14 dias → Upgrade para plano pago

**Vantagens:**

- ✅ Código único facilita identificação
- ✅ Multi-tenant seguro via RLS
- ✅ Trial automático
- ✅ Escalável para múltiplos profissionais
