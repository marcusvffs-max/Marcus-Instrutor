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

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGINS = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const MAX_BODY_BYTES = 8 * 1024;
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
};

function response(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
): Response {
  const headers = new Headers(JSON_HEADERS);
  headers.set("Vary", "Origin");

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }

  return new Response(JSON.stringify(body), { status, headers });
}

async function readJsonBody(
  req: Request,
): Promise<Record<string, unknown>> {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("EMPTY_BODY");

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("BODY_TOO_LARGE");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("INVALID_JSON_OBJECT");
  }
  return parsed as Record<string, unknown>;
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

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return response({ ok: false, error: "Origem não autorizada." }, 403, origin);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return response({ ok: false, error: "Configuração do servidor incompleta." }, 500, origin);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return response({ ok: false, error: "Autenticação obrigatória." }, 401, origin);
  }

  try {
    const accessToken = match[1];

    // Valida o token apresentado; não confia em ID, email ou role do body.
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } =
      await authClient.auth.getUser(accessToken);

    if (authError || !authData.user) {
      return response({ ok: false, error: "Sessão inválida ou expirada." }, 401, origin);
    }

    // O cliente service_role existe apenas no servidor e só é usado depois
    // de validar o JWT. Não encaminhar o Authorization do solicitante.
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
      payload = await readJsonBody(req);
    } catch (error) {
      if (error instanceof Error && error.message === "BODY_TOO_LARGE") {
        return response({ ok: false, error: "Requisição muito grande." }, 413, origin);
      }
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

    // O trigger em auth.users cria profiles(id,nome,role='instrutor')
    // na mesma transação do Auth. NÃO inserir profiles manualmente aqui.
    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { nome },
      });

    if (inviteError || !inviteData.user) {
      return response({ ok: false, error: "Não foi possível enviar o convite." }, 500, origin);
    }

    const newUserId = inviteData.user.id;

    // Confirma que o trigger foi executado e que o papel é o esperado.
    const { data: newProfile, error: newProfileError } = await adminClient
      .from("profiles")
      .select("id, nome, role")
      .eq("id", newUserId)
      .maybeSingle();

    if (
      newProfileError ||
      !newProfile ||
      newProfile.role !== "instrutor"
    ) {
      // Compensação excepcional: o convite pode já ter sido enviado.
      // Registrar e reconciliar esta falha antes de permitir novo convite.
      const { error: cleanupError } =
        await adminClient.auth.admin.deleteUser(newUserId);

      console.error("Falha de reconciliação do perfil de instrutor.", {
        userId: newUserId,
        profileQueryFailed: Boolean(newProfileError),
        cleanupFailed: Boolean(cleanupError),
      });

      return response({
        ok: false,
        error: "Não foi possível confirmar o cadastro do instrutor.",
      }, 500, origin);
    }

    return response({
      ok: true,
      user_id: newUserId,
      role: "instrutor",
      message: "Convite enviado ao instrutor.",
    }, 200, origin);
  } catch {
    // Não devolver detalhes internos, tokens, emails ou segredos.
    return response({ ok: false, error: "Erro interno ao processar o convite." }, 500, origin);
  }
});

## Secrets e configuração

**Configuração obrigatória de deploy:** manter `verify_jwt = true`. O endpoint é chamado somente por usuário autenticado; a checagem da plataforma deve rejeitar JWT ausente/inválido antes do handler. O código ainda chama `auth.getUser(accessToken)` para validar a identidade que será autorizada como admin. Não desativar `verify_jwt` para este endpoint.

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
6. O trigger `profiles_protect_role` libera a operação somente quando `auth.jwt()->>'role' = 'service_role'`. Não se deve usar apenas `auth.uid() IS NULL` como bypass, pois requisições anônimas também podem ter UID nulo. A chave de serviço deve permanecer exclusivamente no servidor, e o cliente administrativo não pode encaminhar o JWT do usuário no cabeçalho Authorization.
7. A função atual usa `inviteUserByEmail`, que pode disparar o convite antes da gravação do perfil. Se o INSERT falhar, a função tenta remover o usuário Auth, mas o e-mail pode já ter sido enviado. Essa compensação não é uma transação atômica; antes de produção, é necessário definir um fluxo de convite que permita criar o perfil antes de enviar a mensagem, ou implementar reconciliação e auditoria de cadastros incompletos.
8. O endpoint não oferece criação de admin, promoção de papel, exclusão nem redefinição de senha.
9. O controle CORS limita navegadores autorizados, mas não substitui autenticação nem autorização.
10. Recomenda-se adicionar limite de requisições e auditoria administrativa antes de produção.
11. A função não modifica tabelas de solicitações WhatsApp, configurações da IA ou regras da assistente.

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


## Revisão consolidada após desenho do trigger

**Correção obrigatória no código:** a primeira versão deste documento fazia INSERT manual em `profiles` depois de `inviteUserByEmail`. Isso se torna incorreto quando o trigger transacional em `auth.users` estiver instalado: o perfil já terá sido criado, e o INSERT manual duplicaria a chave primária, acionando o rollback compensatório e podendo apagar uma conta válida após o envio do convite.

A versão atualizada do código:
- não faz INSERT manual em `profiles`;
- consulta o perfil criado pelo trigger e confirma `role='instrutor'`;
- limita o corpo JSON a 8 KiB;
- mantém autenticação do solicitante antes de criar o cliente administrativo;
- não encaminha o Authorization do solicitante no cliente service_role;
- tenta compensação apenas se o perfil esperado não aparecer, registrando se a limpeza falhou.

**Ordem obrigatória:** esta versão do endpoint só pode ser implantada depois de o trigger transacional estar instalado e validado. Antes disso, a função não terá quem crie o profile automaticamente.

**Ainda não aprovado para produção:** falta configurar e verificar `APP_ALLOWED_ORIGINS`, definir rate limit contra abuso de convites, confirmar as variáveis reais do projeto e executar testes de falha parcial em ambiente isolado autorizado. O endpoint não foi criado nem implantado.
