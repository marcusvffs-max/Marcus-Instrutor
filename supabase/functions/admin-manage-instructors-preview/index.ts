import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@^9";
import { getCompletionFallbackOutcome, getReservationStatus } from "./student-link-rules.mjs";

const APP_ORIGIN = "https://marcusinstrutor.vercel.app";
const PREVIEW_ORIGIN_PATTERN = /^https:\/\/marcusinstrutor-[a-z0-9-]+-marcusvffs-2839\.vercel\.app$/;

function isAllowedOrigin(origin: string) {
  return origin === APP_ORIGIN || PREVIEW_ORIGIN_PATTERN.test(origin);
}
function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && isAllowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function response(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const requestCorsHeaders = corsHeaders(origin);
  const respond = (body: unknown, status = 200) => response(body, status, origin);

  if (req.method === "OPTIONS") {
    if (origin && !isAllowedOrigin(origin)) {
      return new Response("Origem não autorizada.", { status: 403, headers: requestCorsHeaders });
    }
    return new Response("ok", { headers: requestCorsHeaders });
  }
  if (req.method !== "POST") return respond({ error: "Método não permitido." }, 405);

  if (origin && !isAllowedOrigin(origin)) {
    return new Response("Origem não autorizada.", { status: 403, headers: requestCorsHeaders });
  }
  const requestAppUrl = (origin && PREVIEW_ORIGIN_PATTERN.test(origin) ? origin : APP_ORIGIN) + "/";

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) return respond({ error: "Sessão não encontrada. Entre novamente." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error("Configuração interna do Supabase incompleta.");
      return respond({ error: "Serviço temporariamente indisponível." }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return respond({ error: "Sua sessão expirou. Entre novamente." }, 401);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile, error: profileError } = await admin
      .from("profiles").select("role, instructor_access_until").eq("id", authData.user.id).maybeSingle();
    if (profileError || !profile || !["admin", "instrutor", "usuario"].includes(profile.role)) {
      return respond({ error: "Seu perfil não tem permissão para esta operação." }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== "string") {
      return respond({ error: "Solicitação inválida." }, 400);
    }
    const isStudentLinkCompletion = body.action === "complete_student_link";
    if (profile.role === "usuario" && !isStudentLinkCompletion) {
      return respond({ error: "Seu perfil não tem permissão para esta operação." }, 403);
    }
    if (profile.role !== "usuario" && isStudentLinkCompletion) {
      return respond({ error: "Esta confirmação deve ser feita pela própria conta do aluno." }, 403);
    }
    if (profile.role === "instrutor") {
      const accessUntil = profile.instructor_access_until ? new Date(profile.instructor_access_until).getTime() : 0;
      if (accessUntil <= Date.now()) {
        return respond({ error: "Sua autorização de instrutor está vencida ou não foi liberada." }, 403);
      }
      if (body.action !== "invite_student") {
        return respond({ error: "Instrutores podem enviar somente convites de acesso para alunos." }, 403);
      }
    }

    if (body.action === "list_whatsapp_conversations") {
      if (profile.role !== "admin") {
        return respond({ error: "Somente administradores podem consultar as conversas do WhatsApp." }, 403);
      }
      const { data: conversations, error: conversationsError } = await admin
        .from("whatsapp_conversations")
        .select("id,telefone,nome_contato,status,ultima_mensagem_em,updated_at,ai_paused_until")
        .eq("owner_id", authData.user.id)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (conversationsError) throw conversationsError;
      return respond({ ok: true, conversations: conversations ?? [] });
    }

    if (body.action === "list_whatsapp_messages") {
      if (profile.role !== "admin") {
        return respond({ error: "Somente administradores podem consultar mensagens do WhatsApp." }, 403);
      }
      const conversationId = typeof body.conversation_id === "string" ? body.conversation_id.trim() : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId)) {
        return respond({ error: "Conversa inválida." }, 400);
      }

      const { data: conversation, error: conversationError } = await admin
        .from("whatsapp_conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("owner_id", authData.user.id)
        .maybeSingle();
      if (conversationError) throw conversationError;
      if (!conversation) return respond({ error: "Conversa não encontrada para esta conta." }, 404);

      const requestedOffset = Number.isInteger(body.offset) ? body.offset : 0;
      const offset = Math.max(0, Math.min(requestedOffset, 100000));
      const { data: messages, error: messagesError } = await admin
        .from("whatsapp_messages")
        .select("id,direcao,tipo_mensagem,conteudo,status_provedor,created_at")
        .eq("conversation_id", conversationId)
        .eq("owner_id", authData.user.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + 99);
      if (messagesError) throw messagesError;

      const chronologicalMessages = (messages ?? []).reverse();
      return respond({
        ok: true,
        messages: chronologicalMessages,
        has_more: (messages ?? []).length === 100,
        next_offset: offset + (messages ?? []).length,
      });
    }

    if (body.action === "delete_whatsapp_message") {
      if (profile.role !== "admin") {
        return respond({ error: "Somente administradores podem excluir registros do histórico WhatsApp." }, 403);
      }
      const conversationId = typeof body.conversation_id === "string" ? body.conversation_id.trim() : "";
      const messageId = typeof body.message_id === "string" ? body.message_id.trim() : "";
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(conversationId) || !uuidPattern.test(messageId)) {
        return respond({ error: "Registro ou conversa inválidos." }, 400);
      }

      const { data: conversation, error: conversationError } = await admin
        .from("whatsapp_conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("owner_id", authData.user.id)
        .maybeSingle();
      if (conversationError) throw conversationError;
      if (!conversation) return respond({ error: "Conversa não encontrada para esta conta." }, 404);

      const { data: deletedMessage, error: deleteError } = await admin
        .from("whatsapp_messages")
        .delete()
        .eq("id", messageId)
        .eq("conversation_id", conversationId)
        .eq("owner_id", authData.user.id)
        .select("id")
        .maybeSingle();
      if (deleteError) throw deleteError;
      if (!deletedMessage) return respond({ error: "Registro não encontrado nesta conversa." }, 404);
      return respond({ ok: true, deleted_message_id: deletedMessage.id });
    }

    if (body.action === "close_whatsapp_conversation") {
      if (profile.role !== "admin") {
        return respond({ error: "Somente administradores podem encerrar conversas do WhatsApp." }, 403);
      }
      const conversationId = typeof body.conversation_id === "string" ? body.conversation_id.trim() : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId)) {
        return respond({ error: "Conversa inválida." }, 400);
      }

      const now = new Date();
      const { data: currentConversation, error: currentConversationError } = await admin
        .from("whatsapp_conversations")
        .select("ai_paused_until,ai_pause_reason")
        .eq("id", conversationId)
        .eq("owner_id", authData.user.id)
        .maybeSingle();
      if (currentConversationError) throw currentConversationError;
      if (!currentConversation) return respond({ error: "Conversa não encontrada para esta conta." }, 404);
      const currentPauseMs = currentConversation.ai_paused_until
        ? new Date(currentConversation.ai_paused_until).getTime()
        : 0;
      const preserveTakeoverPause =
        currentConversation.ai_pause_reason === "instrutor_assumiu_atendimento" &&
        currentPauseMs > now.getTime();
      const pauseUntil = preserveTakeoverPause
        ? currentConversation.ai_paused_until
        : new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
      const pauseReason = preserveTakeoverPause
        ? "instrutor_assumiu_atendimento"
        : "instrutor_encerramento";
      const { data: closedConversation, error: closeError } = await admin
        .from("whatsapp_conversations")
        .update({
          status: "encerrada",
          ai_paused_until: pauseUntil,
          ai_pause_reason: pauseReason,
          quote_state: null,
          updated_at: now.toISOString(),
        })
        .eq("id", conversationId)
        .eq("owner_id", authData.user.id)
        .select("id")
        .maybeSingle();
      if (closeError) throw closeError;
      if (!closedConversation) return respond({ error: "Conversa não encontrada para esta conta." }, 404);

      const { error: requestsError } = await admin
        .from("ai_requests")
        .update({ atendimento_status: "concluido" })
        .eq("owner_id", authData.user.id)
        .eq("canal", "whatsapp")
        .in("tipo_solicitacao", ["atendimento_humano", "duvida_outros_detran", "intencao_compra_pacote"])
        .in("atendimento_status", ["pendente", "em_atendimento"])
        .filter("resultado->>conversation_id", "eq", conversationId);
      if (requestsError) throw requestsError;

      return respond({ ok: true, ai_paused_until: pauseUntil });
    }

    if (body.action === "update_whatsapp_request_status") {
      if (profile.role !== "admin") {
        return respond({ error: "Somente administradores podem atualizar o status dos atendimentos." }, 403);
      }
      const requestId = typeof body.request_id === "string" ? body.request_id.trim() : "";
      const nextStatus = typeof body.status === "string" ? body.status.trim() : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
        return respond({ error: "Atendimento inválido." }, 400);
      }
      if (!["pendente", "em_atendimento", "concluido", "cancelado"].includes(nextStatus)) {
        return respond({ error: "Status de atendimento inválido." }, 400);
      }
      const { data: requestToUpdate, error: requestLookupError } = await admin
        .from("ai_requests")
        .select("id, resultado")
        .eq("id", requestId)
        .eq("owner_id", authData.user.id)
        .eq("canal", "whatsapp")
        .in("tipo_solicitacao", ["atendimento_humano", "duvida_outros_detran", "intencao_compra_pacote"])
        .maybeSingle();
      if (requestLookupError) throw requestLookupError;
      if (!requestToUpdate) return respond({ error: "Atendimento não encontrado." }, 404);

      // A pausa de 48 horas começa quando Marcus assume o pedido (em_atendimento).
      // Concluir/cancelar o pedido não reinicia o prazo; "Olá" continua sendo uma reativação imediata.
      let conversationPauseUntil: string | null = null;
      let conversationHumanReopened = false;
      const conversationId = typeof requestToUpdate.resultado?.conversation_id === "string"
        ? requestToUpdate.resultado.conversation_id
        : "";

      if (nextStatus === "em_atendimento" && conversationId) {
        const now = new Date();
        conversationPauseUntil = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
        const { data: assumedConversation, error: assumeError } = await admin
          .from("whatsapp_conversations")
          .update({
            status: "atendimento_humano",
            ai_paused_until: conversationPauseUntil,
            ai_pause_reason: "instrutor_assumiu_atendimento",
            quote_state: null,
            updated_at: now.toISOString(),
          })
          .eq("id", conversationId)
          .eq("owner_id", authData.user.id)
          .select("id")
          .maybeSingle();
        if (assumeError) throw assumeError;
        if (!assumedConversation) conversationPauseUntil = null;
      } else if (nextStatus === "pendente" && conversationId) {
        // Se Marcus devolver o pedido para pendente, libera a assistente novamente.
        const { data: reopenedConversation, error: reopenError } = await admin
          .from("whatsapp_conversations")
          .update({
            status: "aguardando_escolha",
            ai_paused_until: null,
            ai_pause_reason: null,
            quote_state: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId)
          .eq("owner_id", authData.user.id)
          .eq("status", "atendimento_humano")
          .eq("ai_pause_reason", "instrutor_assumiu_atendimento")
          .select("id")
          .maybeSingle();
        if (reopenError) throw reopenError;
        conversationHumanReopened = Boolean(reopenedConversation);
      }

      const { error: updateRequestError } = await admin
        .from("ai_requests")
        .update({ atendimento_status: nextStatus })
        .eq("id", requestId)
        .eq("owner_id", authData.user.id)
        .eq("canal", "whatsapp")
        .in("tipo_solicitacao", ["atendimento_humano", "duvida_outros_detran", "intencao_compra_pacote"]);
      if (updateRequestError) throw updateRequestError;
      return respond({ ok: true, ai_paused_until: conversationPauseUntil, conversation_human_reopened: conversationHumanReopened });
    }

    if (isStudentLinkCompletion) {
      const attemptId = typeof body.attempt_id === "string" ? body.attempt_id.trim() : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)) {
        return respond({ error: "Código de confirmação inválido. Solicite um novo link ao instrutor." }, 400);
      }
      if (!authData.user.email || !authData.user.email_confirmed_at) {
        return respond({ error: "Confirme o e-mail desta conta antes de concluir o vínculo." }, 403);
      }
      const { data: pendingStudent, error: pendingError } = await admin
        .from("students")
        .select("id, owner_id, email, invited_at, invite_attempt_id")
        .eq("invite_attempt_id", attemptId)
        .is("user_id", null)
        .not("invited_at", "is", null)
        .maybeSingle();
      if (pendingError) throw pendingError;
      if (!pendingStudent) {
        // Se a primeira confirmação foi gravada mas a resposta se perdeu na rede,
        // repetir a mesma tentativa pela mesma conta retorna sucesso sem novo vínculo.
        const { data: alreadyCompletedLink, error: alreadyCompletedError } = await admin
          .from("students").select("id, invite_attempt_id, user_id")
          .eq("invite_attempt_id", attemptId)
          .eq("user_id", authData.user.id)
          .maybeSingle();
        if (alreadyCompletedError) throw alreadyCompletedError;
        if (getCompletionFallbackOutcome({
          attemptId,
          userId: authData.user.id,
          completedAttemptId: alreadyCompletedLink?.invite_attempt_id,
          completedUserId: alreadyCompletedLink?.user_id,
        }) === "already_completed" && alreadyCompletedLink) {
          return respond({ ok: true, message: "Este acesso já foi confirmado por esta conta." });
        }
        return respond({ error: "Este link não corresponde a uma solicitação válida ou expirou. Peça ao instrutor para enviar um novo acesso." }, 409);
      }
      if (getReservationStatus(pendingStudent.invited_at) !== "active" ||
          String(pendingStudent.email ?? "").trim().toLowerCase() !== authData.user.email.trim().toLowerCase()) {
        return respond({ error: "Este link não corresponde a uma solicitação válida ou expirou. Peça ao instrutor para enviar um novo acesso." }, 409);
      }
      const { data: currentStudentProfile, error: currentStudentProfileError } = await admin
        .from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
      if (currentStudentProfileError) throw currentStudentProfileError;
      if (!currentStudentProfile || currentStudentProfile.role !== "usuario") {
        return respond({ error: "O perfil desta conta não está autorizado como aluno. Solicite uma verificação administrativa." }, 403);
      }
      const { data: completedLink, error: completeError } = await admin
        .from("students")
        .update({ user_id: authData.user.id, invited_at: null })
        .eq("id", pendingStudent.id)
        .eq("owner_id", pendingStudent.owner_id)
        .eq("invite_attempt_id", attemptId)
        .eq("invited_at", pendingStudent.invited_at)
        .eq("email", pendingStudent.email)
        .is("user_id", null)
        .select("id")
        .maybeSingle();
      if (completeError?.code === "23505") {
        return respond({ error: "Esta conta já está vinculada a outro cadastro de aluno. Solicite uma verificação administrativa." }, 409);
      }
      if (completeError) throw completeError;
      if (!completedLink) {
        // Outra requisição pode ter confirmado entre a leitura e o UPDATE.
        // Só a mesma conta que concluiu a reserva recebe sucesso idempotente.
        const { data: racedCompletion, error: racedCompletionError } = await admin
          .from("students").select("id, invite_attempt_id, user_id")
          .eq("invite_attempt_id", attemptId)
          .eq("user_id", authData.user.id)
          .maybeSingle();
        if (racedCompletionError) throw racedCompletionError;
        if (getCompletionFallbackOutcome({
          attemptId,
          userId: authData.user.id,
          completedAttemptId: racedCompletion?.invite_attempt_id,
          completedUserId: racedCompletion?.user_id,
        }) === "already_completed" && racedCompletion) {
          return respond({ ok: true, message: "Este acesso já foi confirmado por esta conta." });
        }
        return respond({ error: "O vínculo já foi concluído por outra conta ou a solicitação expirou. Atualize a página ou peça um novo link ao instrutor." }, 409);
      }
      return respond({ ok: true, message: "Conta vinculada com sucesso." });
    }

    if (body.action === "list") {
      const perPage = 200;
      const authUsers: any[] = [];

      for (let page = 1; ; page += 1) {
        const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({
          page, perPage,
        });
        if (usersError) throw usersError;

        const pageUsers = usersData.users ?? [];
        authUsers.push(...pageUsers);
        if (pageUsers.length < perPage) break;
      }

      const allProfiles: any[] = [];
      for (let from = 0; ; from += perPage) {
        const { data: profilesPage, error: profilesError } = await admin
          .from("profiles")
          .select("id, nome, role, instructor_access_until")
          .order("id", { ascending: true })
          .range(from, from + perPage - 1);
        if (profilesError) throw profilesError;

        const pageProfiles = profilesPage ?? [];
        allProfiles.push(...pageProfiles);
        if (pageProfiles.length < perPage) break;
      }

      const byId = new Map(allProfiles.map((profile: any) => [profile.id, profile]));
      const users = authUsers.map((user: any) => {
        const profile = byId.get(user.id) as any;
        return {
          id: user.id,
          email: user.email ?? "",
          nome: profile?.nome ?? user.user_metadata?.nome ?? "Sem nome",
          role: profile?.role ?? "sem perfil",
          instructor_access_until: profile?.instructor_access_until ?? null,
          confirmado: Boolean(user.email_confirmed_at),
        };
      });
      return respond({ ok: true, users });
    }

    if (body.action === "activate_access") {
      const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(userId)) {
        return respond({ error: "Usuário inválido." }, 400);
      }
      const { data: targetProfile, error: targetProfileError } = await admin
        .from("profiles").select("id, role").eq("id", userId).maybeSingle();
      if (targetProfileError) throw targetProfileError;
      if (!targetProfile || targetProfile.role !== "instrutor") {
        return respond({ error: "A autorização temporária está disponível somente para instrutores." }, 400);
      }
      const accessUntil = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();
      const { error: accessError } = await admin.from("profiles")
        .update({ instructor_access_until: accessUntil }).eq("id", userId);
      if (accessError) throw accessError;
      return respond({
        ok: true,
        access_until: accessUntil,
        message: "Acesso liberado por 31 dias."
      });
    }

    if (body.action === "change_role") {
      const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
      const newRole = body.role;
      if (!/^[0-9a-f-]{36}$/i.test(userId)) {
        return respond({ error: "Usuário inválido." }, 400);
      }
      if (userId === authData.user.id) {
        return respond({ error: "Por segurança, você não pode alterar seu próprio tipo de acesso." }, 400);
      }
      if (newRole !== "instrutor" && newRole !== "usuario" && newRole !== "admin") {
        return respond({ error: "Selecione um tipo de acesso válido." }, 400);
      }
      const { data: targetProfile, error: targetProfileError } = await admin
        .from("profiles").select("id, role").eq("id", userId).maybeSingle();
      if (targetProfileError) throw targetProfileError;
      if (!targetProfile) {
        return respond({ error: "O perfil deste usuário não foi encontrado." }, 404);
      }
      if (targetProfile.role === "admin" && newRole !== "admin") {
        const { count, error: countError } = await admin
          .from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
        if (countError) throw countError;
        if ((count ?? 0) <= 1) {
          return respond({ error: "Não é possível retirar o acesso de administrador do único administrador do sistema." }, 400);
        }
      }
      const { error: updateError } = await admin.from("profiles")
        .update({ role: newRole, instructor_access_until: null }).eq("id", userId);
      if (updateError) throw updateError;
      return respond({ ok: true, message: "Tipo de acesso alterado com sucesso." });
    }

    if (body.action === "delete") {
      const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(userId)) {
        return respond({ error: "Usuário inválido." }, 400);
      }
      if (userId === authData.user.id) {
        return respond({ error: "Você não pode excluir sua própria conta por este painel." }, 400);
      }
      const { data: targetProfile, error: targetProfileError } = await admin
        .from("profiles").select("role").eq("id", userId).maybeSingle();
      if (targetProfileError) throw targetProfileError;
      if (targetProfile?.role === "admin") {
        const { count, error: countError } = await admin
          .from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
        if (countError) throw countError;
        if ((count ?? 0) <= 1) {
          return respond({ error: "Não é possível excluir o único administrador do sistema." }, 400);
        }
      }
      const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
      if (deleteError) throw deleteError;
      return respond({ ok: true, message: "Usuário excluído com sucesso." });
    }

    if (body.action === "resend") {
      const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(userId)) {
        return respond({ error: "Usuário inválido." }, 400);
      }
      const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(userId);
      if (targetError || !targetData.user?.email) {
        return respond({ error: "Não foi possível localizar o e-mail deste usuário." }, 404);
      }
      const targetEmail = targetData.user.email;
      const targetName = String(targetData.user.user_metadata?.nome ?? "Olá").slice(0, 100);
      const smtpHost = Deno.env.get("SMTP_HOST");
      const smtpPort = Number(Deno.env.get("SMTP_PORT") ?? "465");
      const smtpUser = Deno.env.get("SMTP_USER");
      const smtpPass = Deno.env.get("SMTP_PASS");
      const smtpFrom = Deno.env.get("SMTP_FROM");
      if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom || ![465, 587].includes(smtpPort)) {
        console.error("Configuração SMTP incompleta ou inválida.");
        return respond({ error: "O envio de e-mail ainda não está configurado corretamente." }, 500);
      }
      const { data: recoveryData, error: recoveryError } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: targetEmail,
        options: { redirectTo: requestAppUrl },
      });
      if (recoveryError || !recoveryData.properties?.action_link) {
        console.error("Falha ao gerar link de acesso:", recoveryError?.message ?? "link ausente");
        return respond({ error: "Não foi possível gerar um novo link de acesso para este usuário." }, 400);
      }
      const safeTargetName = escapeHtml(targetName);
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });
      try {
        await transporter.sendMail({
          from: smtpFrom,
          to: targetEmail,
          subject: "Seu link de acesso ao Marcus Instrutor",
          text: `Olá, ${targetName}! Use este link para acessar sua conta e cadastrar ou redefinir sua senha: ${recoveryData.properties.action_link}`,
          html: `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6"><div style="max-width:560px;margin:24px auto;padding:28px;border:1px solid #e5e7eb;border-radius:14px"><h2 style="color:#12345a">Acesso Marcus Instrutor</h2><p>Olá, <strong>${safeTargetName}</strong>!</p><p>Você solicitou um novo link para acessar sua conta e cadastrar ou redefinir sua senha.</p><p style="margin:28px 0"><a href="${recoveryData.properties.action_link}" style="display:inline-block;background:#12345a;color:#fff;text-decoration:none;padding:13px 22px;border-radius:8px">Acessar e cadastrar senha</a></p><p>Se você não solicitou este link, pode ignorar esta mensagem.</p></div></body></html>`,
        });
      } catch (mailError) {
        const err = mailError as { name?: string; message?: string; code?: string; command?: string; responseCode?: number };
        console.error("Falha SMTP ao reenviar acesso:", {
          name: err?.name ?? "Error", message: err?.message ?? "sem mensagem",
          code: err?.code ?? null, command: err?.command ?? null, responseCode: err?.responseCode ?? null,
        });
        return respond({ error: "O link foi preparado, mas o e-mail não pôde ser enviado. Confira o SMTP e tente novamente." }, 502);
      } finally {
        transporter.close();
      }
      return respond({ ok: true, message: "Novo link de acesso enviado com sucesso." });
    }

    const isStudentInvite = body.action === "invite_student";
    if (body.action !== "invite" && !isStudentInvite) return respond({ error: "Ação não reconhecida." }, 400);

    let nome = typeof body.nome === "string" ? body.nome.trim() : "";
    let email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = isStudentInvite ? "usuario" : body.role;

    let studentInviteId: string | null = null;
    let studentInviteReservation: string | null = null;
    let studentInviteAttemptId: string | null = null;
    let studentInvitePreviousInvitedAt: string | null = null;
    let studentRecoveryUserId: string | null = null;
    let studentLegacyLinkUserId: string | null = null;

    if (isStudentInvite) {
      const studentId = typeof body.student_id === "string" ? body.student_id.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(studentId)) {
        return respond({ error: "Cadastro de aluno inválido." }, 400);
      }
      const { data: student, error: studentError } = await admin
        .from("students")
        .select("id, nome, email, user_id, invited_at, invite_attempt_id")
        .eq("id", studentId)
        .eq("owner_id", authData.user.id)
        .maybeSingle();
      if (studentError) throw studentError;
      if (!student) return respond({ error: "Aluno não encontrado na sua lista de cadastros." }, 404);
      studentInviteId = student.id;
      studentInvitePreviousInvitedAt = student.invited_at ?? null;
      nome = String(student.nome ?? "").trim();
      email = String(student.email ?? "").trim().toLowerCase();
      if (!email) return respond({ error: "Cadastre o e-mail deste aluno antes de enviar o convite." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return respond({ error: "O e-mail cadastrado para este aluno é inválido. Corrija o cadastro antes de continuar." }, 400);
      }
      if (student.user_id) {
        const { data: existingAuth, error: existingAuthError } = await admin.auth.admin.getUserById(student.user_id);
        if (existingAuthError || !existingAuth.user?.email ||
            existingAuth.user.email.trim().toLowerCase() !== String(student.email ?? "").trim().toLowerCase()) {
          return respond({ error: "A conta vinculada não corresponde ao e-mail atual deste cadastro. Não foi feita nenhuma alteração." }, 409);
        }
        const { data: existingProfile, error: existingProfileError } = await admin
          .from("profiles").select("role").eq("id", student.user_id).maybeSingle();
        if (existingProfileError) throw existingProfileError;
        if (!existingProfile) {
          return respond({ error: "O perfil da conta vinculada não foi encontrado. Solicite uma verificação administrativa." }, 409);
        }
        if (existingProfile.role === "instrutor" &&
            !existingAuth.user.email_confirmed_at &&
            student.invited_at && student.invite_attempt_id) {
          const { error: repairProfileError } = await admin.from("profiles")
            .update({ nome: student.nome, role: "usuario" })
            .eq("id", student.user_id).eq("role", "instrutor");
          if (repairProfileError) throw repairProfileError;
        } else if (existingProfile.role !== "usuario") {
          return respond({ error: "A conta vinculada não está no perfil de aluno. Não foi alterada por segurança." }, 409);
        }
        studentRecoveryUserId = student.user_id;
      }
      if (!student.user_id) {
        let matchingAuthUser: any = null;
        for (let page = 1; ; page += 1) {
          const { data: usersPage, error: usersPageError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (usersPageError) throw usersPageError;
          const matches = (usersPage.users ?? []).filter((user: any) =>
            String(user.email ?? "").trim().toLowerCase() === String(student.email ?? "").trim().toLowerCase()
          );
          if (matches.length > 1) {
            return respond({ error: "Há mais de uma conta compatível com este e-mail. Solicite uma verificação administrativa." }, 409);
          }
          if (matches.length === 1) {
            matchingAuthUser = matches[0];
            break;
          }
          if ((usersPage.users ?? []).length < 1000) break;
        }
        if (matchingAuthUser) {
          if (!matchingAuthUser.email_confirmed_at) {
            return respond({ error: "Já existe uma conta com este e-mail, mas ele ainda não foi confirmado. Solicite uma verificação administrativa antes de vincular." }, 409);
          }
          const { data: legacyProfile, error: legacyProfileError } = await admin
            .from("profiles").select("role").eq("id", matchingAuthUser.id).maybeSingle();
          if (legacyProfileError) throw legacyProfileError;
          if (!legacyProfile || legacyProfile.role !== "usuario") {
            return respond({ error: "Já existe uma conta com este e-mail, mas ela não está configurada como aluno. Solicite uma verificação administrativa." }, 409);
          }
          // A conta Auth só pode estar vinculada a um cadastro de aluno.
          // Verifique antes de enviar qualquer link para evitar convite que falharia no índice UNIQUE.
          const { data: existingStudentLink, error: existingStudentLinkError } = await admin
            .from("students").select("id")
            .eq("user_id", matchingAuthUser.id)
            .maybeSingle();
          if (existingStudentLinkError) throw existingStudentLinkError;
          if (existingStudentLink) {
            return respond({ error: "Esta conta já está vinculada a outro cadastro de aluno. Solicite uma verificação administrativa antes de enviar novo acesso." }, 409);
          }
          studentLegacyLinkUserId = matchingAuthUser.id;
        }
      }

      if (student.invited_at && !student.user_id) {
        const reservationIsRecent = getReservationStatus(student.invited_at) === "active";
        if (reservationIsRecent) {
          return respond({ error: "Já existe um convite em processamento para este aluno. Aguarde alguns minutos e atualize a lista." }, 409);
        }
      }
      studentInviteId = student.id;
      nome = String(student.nome ?? "").trim();
      email = String(student.email ?? "").trim().toLowerCase();
      if (!email) return respond({ error: "Cadastre o e-mail deste aluno antes de enviar o convite." }, 400);
    }
    if (nome.length < 2 || nome.length > 100) {
      return respond({ error: "Informe um nome entre 2 e 100 caracteres." }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return respond({ error: "Informe um endereço de e-mail válido." }, 400);
    }
    if (role !== "instrutor" && role !== "usuario" && role !== "admin") {
      return respond({ error: "Selecione um tipo de acesso válido." }, 400);
    }
    if (email === (authData.user.email ?? "").toLowerCase()) {
      return respond({ error: "Você já está conectado com esse e-mail." }, 400);
    }

    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Number(Deno.env.get("SMTP_PORT") ?? "465");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    const smtpFrom = Deno.env.get("SMTP_FROM");
    if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom || ![465, 587].includes(smtpPort)) {
      console.error("Configuração SMTP incompleta ou inválida.");
      return respond({ error: "O envio de e-mail ainda não está configurado corretamente." }, 500);
    }

    if (isStudentInvite && studentInviteId && !studentRecoveryUserId) {
      const clearStaleQuery = admin.from("students")
        .update({ invited_at: null, invite_attempt_id: null })
        .eq("id", studentInviteId)
        .eq("owner_id", authData.user.id)
        .is("user_id", null);
      if (studentInvitePreviousInvitedAt) {
        clearStaleQuery.eq("invited_at", studentInvitePreviousInvitedAt);
      } else {
        clearStaleQuery.is("invited_at", null);
      }
      const { error: clearStaleError } = await clearStaleQuery;
      if (clearStaleError) throw clearStaleError;

      studentInviteReservation = new Date().toISOString();
      studentInviteAttemptId = crypto.randomUUID();
      const { data: reservedStudent, error: reserveError } = await admin.from("students")
        .update({ invited_at: studentInviteReservation, invite_attempt_id: studentInviteAttemptId })
        .eq("id", studentInviteId)
        .eq("owner_id", authData.user.id)
        .is("user_id", null)
        .is("invited_at", null)
        .select("id")
        .maybeSingle();
      if (reserveError) throw reserveError;
      if (!reservedStudent) {
        return respond({ error: "Este cadastro já está sendo processado para convite. Atualize a lista e tente novamente." }, 409);
      }
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: (studentRecoveryUserId || studentLegacyLinkUserId) ? "recovery" : "invite",
      email,
      options: {
        ...(!(studentRecoveryUserId || studentLegacyLinkUserId)
          ? {
              data: isStudentInvite
                ? { nome, student_id: studentInviteId, instructor_id: authData.user.id, invite_attempt_id: studentInviteAttemptId }
                : { nome },
            }
          : {}),
        redirectTo: studentLegacyLinkUserId && studentInviteAttemptId
          ? `${requestAppUrl}claim-student.html?attempt_id=${encodeURIComponent(studentInviteAttemptId)}`
          : requestAppUrl,
      },
    });
    if (linkError) {
      if (studentInviteId && studentInviteReservation) {
        await admin.from("students")
          .update({ invited_at: null, invite_attempt_id: null })
          .eq("id", studentInviteId)
          .eq("owner_id", authData.user.id)
          .is("user_id", null)
          .eq("invited_at", studentInviteReservation);
      }
      const message = linkError.message.toLowerCase();
      if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
        return respond({ error: "Já existe uma conta cadastrada com esse e-mail." }, 409);
      }
      console.error("Falha ao gerar convite:", linkError.message);
      return respond({ error: "Não foi possível criar o convite. Confira o e-mail e tente novamente." }, 400);
    }

    const expectedExistingUserId = studentRecoveryUserId ?? studentLegacyLinkUserId;
    if (expectedExistingUserId && linkData.user?.id && linkData.user.id !== expectedExistingUserId) {
      if (studentInviteId && studentInviteReservation) {
        await admin.from("students")
          .update({ invited_at: null, invite_attempt_id: null })
          .eq("id", studentInviteId)
          .eq("owner_id", authData.user.id)
          .is("user_id", null)
          .eq("invited_at", studentInviteReservation);
      }
      console.error("O Supabase retornou uma conta diferente da conta existente esperada.");
      return respond({ error: "Não foi possível confirmar a conta existente. Nenhuma conta ou vínculo foi alterado." }, 409);
    }

    const invitedUserId = linkData.user?.id ?? studentRecoveryUserId ?? studentLegacyLinkUserId;
    const actionLink = linkData.properties?.action_link;
    if (!invitedUserId || !actionLink) {
      let safeToReleaseReservation = !invitedUserId || Boolean(studentRecoveryUserId || studentLegacyLinkUserId);
      if (invitedUserId && !studentRecoveryUserId && !studentLegacyLinkUserId) {
        const { error: deleteError } = await admin.auth.admin.deleteUser(invitedUserId);
        safeToReleaseReservation = !deleteError;
        if (deleteError) console.error("Falha ao remover conta incompleta:", deleteError?.message ?? "erro desconhecido");
      }
      if (safeToReleaseReservation && studentInviteId && studentInviteReservation) {
        await admin.from("students").update({ invited_at: null, invite_attempt_id: null })
          .eq("id", studentInviteId).eq("owner_id", authData.user.id)
          .is("user_id", null).eq("invited_at", studentInviteReservation);
      }
      console.error("O Supabase não retornou os dados necessários do convite.");
      return respond({ error: "Não foi possível preparar o convite." }, 500);
    }

    // Para conta legada, não altere nenhum dado do perfil antes da confirmação
    // explícita do titular. Revalide apenas o papel; a conclusão do vínculo fará
    // outra validação autenticada antes de gravar students.user_id.
    let profileReady = false;
    let profileErrorMessage: string | null = null;
    if (studentLegacyLinkUserId) {
      const { data: legacyProfileStillValid, error: legacyProfileCheckError } = await admin
        .from("profiles").select("id")
        .eq("id", invitedUserId).eq("role", "usuario").maybeSingle();
      profileReady = Boolean(legacyProfileStillValid);
      profileErrorMessage = legacyProfileCheckError?.message ?? null;
    } else {
      // Na recuperação de conta já vinculada, não redefina o papel. A condição
      // role=usuario evita sobrescrever uma alteração administrativa concorrente.
      const profileUpdate = admin.from("profiles")
        .update(studentRecoveryUserId ? { nome } : { nome, role })
        .eq("id", invitedUserId);
      if (studentRecoveryUserId) profileUpdate.eq("role", "usuario");
      const { data: updatedProfile, error: updateProfileError } = await profileUpdate
        .select("id").maybeSingle();
      profileReady = Boolean(updatedProfile);
      profileErrorMessage = updateProfileError?.message ?? null;
    }
    if (!profileReady) {
      const { error: deleteError } = (studentRecoveryUserId || studentLegacyLinkUserId)
        ? { error: null }
        : await admin.auth.admin.deleteUser(invitedUserId);
      if (!deleteError && studentInviteId && studentInviteReservation) {
        await admin.from("students").update({ invited_at: null, invite_attempt_id: null })
          .eq("id", studentInviteId).eq("owner_id", authData.user.id)
          .is("user_id", null).eq("invited_at", studentInviteReservation);
      }
      console.error("Falha ao confirmar o perfil do usuário:", profileErrorMessage ?? "perfil não encontrado ou papel alterado durante a operação");
      return respond({ error: "Não foi possível definir o acesso do novo usuário." }, 500);
    }

    if (isStudentInvite && studentInviteId && studentInviteReservation && !studentLegacyLinkUserId) {
      const { data: linkedStudent, error: linkStudentError } = await admin
        .from("students")
        .select("id")
        .eq("id", studentInviteId)
        .eq("owner_id", authData.user.id)
        .eq("user_id", invitedUserId)
        .eq("invited_at", studentInviteReservation)
        .eq("invite_attempt_id", studentInviteAttemptId)
        .maybeSingle();
      // O vínculo precisa ter sido feito pelo trigger transacional do Auth.
      // A Edge Function não faz fallback que contorne essa validação.
      if (linkStudentError || !linkedStudent) {
        const { error: deleteError } = (studentRecoveryUserId || studentLegacyLinkUserId)
          ? { error: null }
          : await admin.auth.admin.deleteUser(invitedUserId);
        if (!deleteError && !studentRecoveryUserId) {
          await admin.from("students").update({ invited_at: null, invite_attempt_id: null })
            .eq("id", studentInviteId).eq("owner_id", authData.user.id)
            .is("user_id", null).eq("invited_at", studentInviteReservation);
        } else if (deleteError) {
          console.error("Falha ao remover conta após conflito de vínculo:", deleteError.message);
        }
        console.error("Falha ao vincular conta ao cadastro do aluno:", linkStudentError?.message ?? "cadastro já alterado");
        return respond({ error: "Não foi possível concluir o vínculo. Atualize a lista de alunos e tente novamente." }, 409);
      }
    }

    const safeName = escapeHtml(nome);
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    try {
      await transporter.sendMail({
        from: smtpFrom,
        to: email,
        subject: studentLegacyLinkUserId ? "Confirme seu acesso de aluno - Marcus Instrutor" : studentRecoveryUserId ? "Novo link de acesso ao Marcus Instrutor" : "Convite para acessar o Marcus Instrutor",
        text: studentLegacyLinkUserId ? `Olá, ${nome}! Foi solicitado um vínculo entre sua conta já existente e seu cadastro de aluno. Para confirmar que você controla esta conta e concluir o acesso, abra este link em até 15 minutos: ${actionLink}` : studentRecoveryUserId ? `Olá, ${nome}! Foi solicitado um novo link para acessar sua conta no Marcus Instrutor e cadastrar ou redefinir sua senha: ${actionLink}` : `Olá, ${nome}! Você foi convidado(a) para acessar o aplicativo Marcus Instrutor como ${role === "admin" ? "administrador(a)" : role === "usuario" ? (isStudentInvite ? "aluno(a)" : "usuário") : "instrutor(a)"}. Para aceitar o convite e cadastrar sua senha, acesse: ${actionLink}`,
        html: `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6"><div style="max-width:560px;margin:24px auto;padding:28px;border:1px solid #e5e7eb;border-radius:14px"><h2 style="color:#12345a">Convite Marcus Instrutor</h2><p>Olá, <strong>${safeName}</strong>!</p><p>${studentLegacyLinkUserId ? "Foi solicitado um vínculo entre esta conta existente e seu cadastro de aluno. Clique abaixo em até 15 minutos para confirmar o acesso. Se você não reconhece a solicitação, ignore este e-mail." : studentRecoveryUserId ? "Foi solicitado um novo link para acessar sua conta e cadastrar ou redefinir sua senha." : `Você foi convidado(a) para acessar o aplicativo Marcus Instrutor como <strong>${role === "admin" ? "administrador(a)" : role === "usuario" ? (isStudentInvite ? "aluno(a)" : "usuário") : "instrutor(a)"}</strong>. Para aceitar o convite e cadastrar sua primeira senha, clique no botão abaixo:`}</p><p style="margin:28px 0"><a href="${actionLink}" style="display:inline-block;background:#12345a;color:#fff;text-decoration:none;padding:13px 22px;border-radius:8px">${studentLegacyLinkUserId ? "Confirmar meu acesso" : studentRecoveryUserId ? "Acessar minha conta" : "Aceitar convite e criar senha"}</a></p><p>Se você não esperava este convite, pode ignorar esta mensagem.</p></div></body></html>`,
      });
    } catch (mailError) {
      const err = mailError as {
        name?: string; message?: string; code?: string; command?: string;
        responseCode?: number;
      };
      console.error("Falha SMTP (diagnóstico sem credenciais):", {
        name: err?.name ?? "Error",
        message: err?.message ?? "sem mensagem",
        code: err?.code ?? null,
        command: err?.command ?? null,
        responseCode: err?.responseCode ?? null,
      });
      const { error: deleteError } = (studentRecoveryUserId || studentLegacyLinkUserId)
        ? { error: null }
        : await admin.auth.admin.deleteUser(invitedUserId);
      if (!deleteError && studentInviteId && studentInviteReservation) {
        await admin.from("students")
          .update({ invited_at: null, invite_attempt_id: null })
          .eq("id", studentInviteId)
          .eq("owner_id", authData.user.id)
          .is("user_id", null)
          .eq("invited_at", studentInviteReservation);
      } else if (deleteError) {
        console.error("Falha ao remover conta após erro SMTP:", deleteError.message);
      }
      return respond({ error: "O convite foi preparado, mas o e-mail não pôde ser enviado. Confira o SMTP e tente novamente." }, 502);
    } finally {
      transporter.close();
    }

    return respond({ ok: true, message: studentLegacyLinkUserId ? "Link de confirmação enviado para a conta existente do aluno." : studentRecoveryUserId ? "Novo link de acesso enviado ao aluno." : "Convite enviado com sucesso." });
  } catch (error) {
    console.error("Erro interno ao gerenciar usuários:", error instanceof Error ? error.message : "erro desconhecido");
    return respond({ error: "Ocorreu um erro interno. Tente novamente." }, 500);
  }
});