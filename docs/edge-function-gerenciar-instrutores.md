# Edge Function — gerenciamento administrativo de instrutores

Data: 20/11/2026  
Branch: `feature/relatorios-instrutor-app`  
Status: **proposta para revisão; não implantada e não executada**.

## Objetivo

Permitir que Marcus, autenticado e com `profiles.role = 'admin'`, convide novos instrutores. O navegador nunca escolhe livremente o papel de uma conta, nunca recebe a chave `service_role` e nunca grava diretamente em `profiles`.

Esta primeira versão deliberadamente permite somente **convidar instrutores**. Não cria novos administradores, não altera o papel de contas existentes e não exclui usuários. A conta admin inicial continua sendo a conta Marcus já cadastrada.

## Contrato HTTP proposto

- Nome: `admin-manage-instructors`
- Método: `POST`
- Cabeçalho obrigatório: `Authorization: Bearer <access_token do Marcus>`
- Corpo:

```json
{
  "action": "invite_instructor",
  "email": "novo.instrutor@example.com",
  "nome": "Nome do Instrutor"
}
```

- Sucesso: HTTP 200 com `{ "ok": true, "user_id": "...", "role": "instrutor" }`.
- Sem sessão válida: HTTP 401.
- Sessão válida sem papel admin: HTTP 403.
- Entrada inválida: HTTP 400.
- Falha no convite/perfil: HTTP 500, sem expor detalhes internos ou segredos.

## Código proposto — index.ts

> Código de referência para revisão. Não foi implantado. Antes do uso, confirmar os nomes das variáveis de ambiente existentes no projeto e configurar a lista de origens autorizadas.

```ts
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGINS = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function response(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
): Response {
  const headers = new Headers(jsonHeaders);
  headers.set("Vary", "Origin");

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }

  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return new Response("Origin not allowed", { status: 403 });
    }

    const headers = new Headers({
      "Access-Control-Allow-Headers": "authorization, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    });

    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    return new Response("ok", { headers });
  }

  if (req.method !== "POST") {
    return response({ ok: false, error: "Método não permitido." }, 405, origin);
  }

  if (
    !SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY
  ) {
    return response({ ok: false, error: "Configuração do servidor incompleta." }, 500, origin);
  }

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return response({ ok: false, error: "Origem não autorizada." }, 403, origin);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return response({ ok: false, error: "Autenticação obrigatória." }, 401, origin);
  }

  const accessToken = match[1];

  // Cliente público valida o JWT apresentado. Não confiar em user_metadata
  // nem em role enviada no corpo da requisição.
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } =
    await authClient.auth.getUser(accessToken);

  if (authError || !authData.user) {
    return response({ ok: false, error: "Sessão inválida ou expirada." }, 401, origin);
  }

  // Cliente administrativo é usado somente no servidor e somente depois
  // da validação do JWT. Esta chave ignora RLS e nunca pode ir ao navegador.
  const adminClient = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: requesterProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, role")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (
    profileError ||
    !requesterProfile ||
    requesterProfile.role !== "admin"
  ) {
    return response({ ok: false, error: "Acesso permitido somente ao administrador." }, 403, origin);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return response({ ok: false, error: "Corpo JSON inválido." }, 400, origin);
  }

  if (payload.action !== "invite_instructor") {
    return response({ ok: false, error: "Ação não permitida." }, 400, origin);
  }

  const email = typeof payload.email === "string"
    ? payload.email.trim().toLowerCase()
    : "";
  const nome = typeof payload.nome === "string"
    ? payload.nome.trim()
    : "";

  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!emailIsValid || nome.length < 2 || nome.length > 120) {
    return response({ ok: false, error: "Informe nome e e-mail válidos." }, 400, origin);
  }

  // Papel fixo no servidor: o cliente não pode solicitar role=admin.
  const { data: inviteData, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { nome },
    });

  if (inviteError || !inviteData.user) {
    return response({ ok: false, error: "Não foi possível enviar o convite." }, 500, origin);
  }

  const newUserId = inviteData.user.id;

  const { error: insertProfileError } = await adminClient
    .from("profiles")
    .insert({
      id: newUserId,
      nome,
      role: "instrutor",
    });

  if (insertProfileError) {
    // Evita deixar usuário Auth sem o perfil correspondente.
    await adminClient.auth.admin.deleteUser(newUserId);
    return response({ ok: false, error: "Não foi possível concluir o cadastro do perfil." }, 500, origin);
  }

  return response({
    ok: true,
    user_id: newUserId,
    role: "instrutor",
    message: "Convite enviado ao instrutor.",
  }, 200, origin);
});
```

## Secrets e configuração

A função depende de:

- `SUPABASE_URL`: variável padrão do ambiente Edge Functions.
- `SUPABASE_ANON_KEY`: chave pública usada apenas para validar o token do solicitante.
- `SUPABASE_SERVICE_ROLE_KEY`: segredo usado pelo cliente administrativo; nunca colocar em HTML, JavaScript do navegador, GitHub público ou mensagens.
- `APP_ALLOWED_ORIGINS`: origens web autorizadas, separadas por vírgula. Preencher com a origem real do aplicativo após confirmar seu domínio. Não inventar domínio nem usar `*` como substituto de autenticação.

A documentação atual do Supabase também descreve as novas chaves publishable/secret. A migração de chaves deve ser tratada separadamente, verificando as variáveis efetivamente existentes no projeto antes de alterar qualquer função. Esta proposta usa os nomes legados porque o projeto já trabalha com a configuração tradicional; não criar nem trocar secrets nesta etapa.

## Pontos de segurança e decisões

1. A função valida o JWT com `auth.getUser(accessToken)`; não confia em ID, e-mail ou papel enviados pelo navegador.
2. Confirma o papel atual consultando `profiles` pelo ID autenticado.
3. O corpo não aceita campo `role`; a função grava literalmente `instrutor`.
4. A chave administrativa é usada somente após a confirmação de admin.
5. O convite por e-mail não define senha no navegador; o instrutor conclui o acesso pelo fluxo de convite do Supabase Auth.
6. Se a criação do perfil falhar, a função tenta remover o usuário Auth recém-criado para evitar cadastro incompleto.
7. O endpoint não oferece criação de admin, promoção de papel, exclusão nem redefinição de senha.
8. O controle CORS limita navegadores autorizados, mas não substitui autenticação nem autorização.
9. Recomenda-se adicionar limite de requisições e auditoria administrativa antes de produção.
10. A função não modifica tabelas de solicitações WhatsApp, configurações da IA ou regras da assistente.

## Testes obrigatórios antes de implantar

| Cenário | Resultado esperado |
|---|---|
| Sem Authorization | 401 |
| Token inválido/expirado | 401 |
| Instrutor autenticado tenta convidar | 403 |
| Marcus admin convida e-mail válido | 200 e perfil instrutor |
| Corpo pede `role: admin` | Papel continua instrutor; campo ignorado |
| E-mail inválido ou nome ausente | 400 |
| Método GET | 405 |
| Origem web fora da allowlist | 403 |
| Falha ao inserir perfil | usuário Auth removido; resposta 500 |
| Chave service_role ausente | 500 sem revelar segredo |

## Não realizado

- Nenhuma Edge Function foi criada ou implantada no Supabase.
- Nenhum secret foi lido, alterado ou cadastrado.
- Nenhuma conta ou convite foi criado.
- Nenhum SQL foi executado.
- Nenhuma mudança foi feita no login ou na interface do aplicativo.
