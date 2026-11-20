import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@^9";

const APP_ORIGIN = "https://marcusinstrutor-git-feature-relatorios-i-bc78ff-marcusvffs-2839.vercel.app";
const APP_URL = APP_ORIGIN + "/";
const corsHeaders = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return response({ error: "Método não permitido." }, 405);

  const origin = req.headers.get("origin");
  if (origin !== APP_ORIGIN) return new Response("Origem não autorizada.", { status: 403 });

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) return response({ error: "Sessão não encontrada. Entre novamente." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error("Configuração interna do Supabase incompleta.");
      return response({ error: "Serviço temporariamente indisponível." }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return response({ error: "Sua sessão expirou. Entre novamente." }, 401);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile, error: profileError } = await admin
      .from("profiles").select("role, instructor_access_until").eq("id", authData.user.id).maybeSingle();
    if (profileError || !profile || !["admin", "instrutor", "usuario"].includes(profile.role)) {
      return response({ error: "Seu perfil não tem permissão para esta operação." }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== "string") {
      return response({ error: "Solicitação inválida." }, 400);
    }
    const isStudentLinkCompletion = body.action === "complete_student_link";
    if (profile.role === "usuario" && !isStudentLinkCompletion) {
      return response({ error: "Seu perfil não tem permissão para esta operação." }, 403);
    }
    if (profile.role !== "usuario" && isStudentLinkCompletion) {
      return response({ error: "Esta confirmação deve ser feita pela própria conta do aluno." }, 403);
    }
    if (profile.role === "instrutor") {
      const accessUntil = profile.instructor_access_until ? new Date(profile.instructor_access_until).getTime() : 0;
      if (accessUntil <= Date.now()) {
        return response({ error: "Sua autorização de instrutor está vencida ou não foi liberada." }, 403);
      }
      if (body.action !== "invite_student") {
        return response({ error: "Instrutores podem enviar somente convites de acesso para alunos." }, 403);
      }
    }

    if (isStudentLinkCompletion) {
      const attemptId = typeof body.attempt_id === "string" ? body.attempt_id.trim() : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)) {
        return response({ error: "Código de confirmação inválido. Solicite um novo link ao instrutor." }, 400);
      }
      if (!authData.user.email || !authData.user.email_confirmed_at) {
        return response({ error: "Confirme o e-mail desta conta antes de concluir o vínculo." }, 403);
      }
      const { data: pendingStudent, error: pendingError } = await admin
        .from("students")
        .select("id, owner_id, email, invited_at, invite_attempt_id")
        .eq("invite_attempt_id", attemptId)
        .is("user_id", null)
        .not("invited_at", "is", null)
        .maybeSingle();
      if (pendingError) throw pendingError;
      const reservationTime = pendingStudent?.invited_at ? new Date(pendingStudent.invited_at).getTime() : NaN;
      const reservationAge = Date.now() - reservationTime;
      if (!pendingStudent || !Number.isFinite(reservationTime) || reservationAge < 0 ||
          reservationAge > 15 * 60 * 1000 ||
          String(pendingStudent.email ?? "").trim().toLowerCase() !== authData.user.email.trim().toLowerCase()) {
        return response({ error: "Este link não corresponde a uma solicitação válida ou expirou. Peça ao instrutor para enviar um novo acesso." }, 409);
      }
      const { data: currentStudentProfile, error: currentStudentProfileError } = await admin
        .from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
      if (currentStudentProfileError) throw currentStudentProfileError;
      if (!currentStudentProfile || currentStudentProfile.role !== "usuario") {
        return response({ error: "O perfil desta conta não está autorizado como aluno. Solicite uma verificação administrativa." }, 403);
      }
      const { data: completedLink, error: completeError } = await admin
        .from("students")
        .update({ user_id: authData.user.id, invited_at: null, invite_attempt_id: null })
        .eq("id", pendingStudent.id)
        .eq("owner_id", pendingStudent.owner_id)
        .eq("invite_attempt_id", attemptId)
        .eq("invited_at", pendingStudent.invited_at)
        .eq("email", pendingStudent.email)
        .is("user_id", null)
        .select("id")
        .maybeSingle();
      if (completeError) throw completeError;
      if (!completedLink) {
        return response({ error: "O vínculo já foi concluído ou a solicitação expirou. Atualize a página ou peça um novo link ao instrutor." }, 409);
      }
      return response({ ok: true, message: "Conta vinculada com sucesso." });
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
      return response({ ok: true, users });
    }

    if (body.action === "activate_access") {
      const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(userId)) {
        return response({ error: "Usuário inválido." }, 400);
      }
      const { data: targetProfile, error: targetProfileError } = await admin
        .from("profiles").select("id, role").eq("id", userId).maybeSingle();
      if (targetProfileError) throw targetProfileError;
      if (!targetProfile || targetProfile.role !== "instrutor") {
        return response({ error: "A autorização temporária está disponível somente para instrutores." }, 400);
      }
      const accessUntil = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();
      const { error: accessError } = await admin.from("profiles")
        .update({ instructor_access_until: accessUntil }).eq("id", userId);
      if (accessError) throw accessError;
      return response({
        ok: true,
        access_until: accessUntil,
        message: "Acesso liberado por 31 dias."
      });
    }

    if (body.action === "change_role") {
      const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
      const newRole = body.role;
      if (!/^[0-9a-f-]{36}$/i.test(userId)) {
        return response({ error: "Usuário inválido." }, 400);
      }
      if (userId === authData.user.id) {
        return response({ error: "Por segurança, você não pode alterar seu próprio tipo de acesso." }, 400);
      }
      if (newRole !== "instrutor" && newRole !== "usuario" && newRole !== "admin") {
        return response({ error: "Selecione um tipo de acesso válido." }, 400);
      }
      const { data: targetProfile, error: targetProfileError } = await admin
        .from("profiles").select("id, role").eq("id", userId).maybeSingle();
      if (targetProfileError) throw targetProfileError;
      if (!targetProfile) {
        return response({ error: "O perfil deste usuário não foi encontrado." }, 404);
      }
      if (targetProfile.role === "admin" && newRole !== "admin") {
        const { count, error: countError } = await admin
          .from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
        if (countError) throw countError;
        if ((count ?? 0) <= 1) {
          return response({ error: "Não é possível retirar o acesso de administrador do único administrador do sistema." }, 400);
        }
      }
      const { error: updateError } = await admin.from("profiles")
        .update({ role: newRole, instructor_access_until: null }).eq("id", userId);
      if (updateError) throw updateError;
      return response({ ok: true, message: "Tipo de acesso alterado com sucesso." });
    }

    if (body.action === "delete") {
      const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(userId)) {
        return response({ error: "Usuário inválido." }, 400);
      }
      if (userId === authData.user.id) {
        return response({ error: "Você não pode excluir sua própria conta por este painel." }, 400);
      }
      const { data: targetProfile, error: targetProfileError } = await admin
        .from("profiles").select("role").eq("id", userId).maybeSingle();
      if (targetProfileError) throw targetProfileError;
      if (targetProfile?.role === "admin") {
        const { count, error: countError } = await admin
          .from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
        if (countError) throw countError;
        if ((count ?? 0) <= 1) {
          return response({ error: "Não é possível excluir o único administrador do sistema." }, 400);
        }
      }
      const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
      if (deleteError) throw deleteError;
      return response({ ok: true, message: "Usuário excluído com sucesso." });
    }

    if (body.action === "resend") {
      const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(userId)) {
        return response({ error: "Usuário inválido." }, 400);
      }
      const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(userId);
      if (targetError || !targetData.user?.email) {
        return response({ error: "Não foi possível localizar o e-mail deste usuário." }, 404);
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
        return response({ error: "O envio de e-mail ainda não está configurado corretamente." }, 500);
      }
      const { data: recoveryData, error: recoveryError } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: targetEmail,
        options: { redirectTo: APP_URL },
      });
      if (recoveryError || !recoveryData.properties?.action_link) {
        console.error("Falha ao gerar link de acesso:", recoveryError?.message ?? "link ausente");
        return response({ error: "Não foi possível gerar um novo link de acesso para este usuário." }, 400);
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
        return response({ error: "O link foi preparado, mas o e-mail não pôde ser enviado. Confira o SMTP e tente novamente." }, 502);
      } finally {
        transporter.close();
      }
      return response({ ok: true, message: "Novo link de acesso enviado com sucesso." });
    }

    const isStudentInvite = body.action === "invite_student";
    if (body.action !== "invite" && !isStudentInvite) return response({ error: "Ação não reconhecida." }, 400);

    let nome = typeof body.nome === "string" ? body.nome.trim() : "";
    let email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = isStudentInvite ? "usuario" : body.role;

    let studentInviteId: string | null = null;
    let studentInviteReservation: string | null = null;
    let studentInviteAttemptId: string | null = null;
    let studentRecoveryUserId: string | null = null;
    let studentLegacyLinkUserId: string | null = null;

    if (isStudentInvite) {
      const studentId = typeof body.student_id === "string" ? body.student_id.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(studentId)) {
        return response({ error: "Cadastro de aluno inválido." }, 400);
      }
      const { data: student, error: studentError } = await admin
        .from("students")
        .select("id, nome, email, user_id, invited_at, invite_attempt_id")
        .eq("id", studentId)
        .eq("owner_id", authData.user.id)
        .maybeSingle();
      if (studentError) throw studentError;
      if (!student) return response({ error: "Aluno não encontrado na sua lista de cadastros." }, 404);
      studentInviteId = student.id;
      nome = String(student.nome ?? "").trim();
      email = String(student.email ?? "").trim().toLowerCase();
      if (!email) return response({ error: "Cadastre o e-mail deste aluno antes de enviar o convite." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return response({ error: "O e-mail cadastrado para este aluno é inválido. Corrija o cadastro antes de continuar." }, 400);
      }
      if (student.user_id) {
        const { data: existingAuth, error: existingAuthError } = await admin.auth.admin.getUserById(student.user_id);
        if (existingAuthError || !existingAuth.user?.email ||
            existingAuth.user.email.trim().toLowerCase() !== String(student.email ?? "").trim().toLowerCase()) {
          return response({ error: "A conta vinculada não corresponde ao e-mail atual deste cadastro. Não foi feita nenhuma alteração." }, 409);
        }
        const { data: existingProfile, error: existingProfileError } = await admin
          .from("profiles").select("role").eq("id", student.user_id).maybeSingle();
        if (existingProfileError) throw existingProfileError;
        if (!existingProfile) {
          return response({ error: "O perfil da conta vinculada não foi encontrado. Solicite uma verificação administrativa." }, 409);
        }
        if (existingProfile.role === "instrutor" &&
            !existingAuth.user.email_confirmed_at &&
            student.invited_at && student.invite_attempt_id) {
          const { error: repairProfileError } = await admin.from("profiles")
            .update({ nome: student.nome, role: "usuario" })
            .eq("id", student.user_id).eq("role", "instrutor");
          if (repairProfileError) throw repairProfileError;
        } else if (existingProfile.role !== "usuario") {
          return response({ error: "A conta vinculada não está no perfil de aluno. Não foi alterada por segurança." }, 409);
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
            return response({ error: "Há mais de uma conta compatível com este e-mail. Solicite uma verificação administrativa." }, 409);
          }
          if (matches.length === 1) {
            matchingAuthUser = matches[0];
            break;
          }
          if ((usersPage.users ?? []).length < 1000) break;
        }
        if (matchingAuthUser) {
          if (!matchingAuthUser.email_confirmed_at) {
            return response({ error: "Já existe uma conta com este e-mail, mas ele ainda não foi confirmado. Solicite uma verificação administrativa antes de vincular." }, 409);
          }
          const { data: legacyProfile, error: legacyProfileError } = await admin
            .from("profiles").select("role").eq("id", matchingAuthUser.id).maybeSingle();
          if (legacyProfileError) throw legacyProfileError;
          if (!legacyProfile || legacyProfile.role !== "usuario") {
            return response({ error: "Já existe uma conta com este e-mail, mas ela não está configurada como aluno. Solicite uma verificação administrativa." }, 409);
          }
          studentLegacyLinkUserId = matchingAuthUser.id;
        }
      }

      if (student.invited_at && !student.user_id) {
        const reservationTime = new Date(student.invited_at).getTime();
        const reservationIsRecent = Number.isFinite(reservationTime)
          && Date.now() - reservationTime < 15 * 60 * 1000;
        if (reservationIsRecent) {
          return response({ error: "Já existe um convite em processamento para este aluno. Aguarde alguns minutos e atualize a lista." }, 409);
        }
      }
      studentInviteId = student.id;
      nome = String(student.nome ?? "").trim();
      email = String(student.email ?? "").trim().toLowerCase();
      if (!email) return response({ error: "Cadastre o e-mail deste aluno antes de enviar o convite." }, 400);
    }
    if (nome.length < 2 || nome.length > 100) {
      return response({ error: "Informe um nome entre 2 e 100 caracteres." }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return response({ error: "Informe um endereço de e-mail válido." }, 400);
    }
    if (role !== "instrutor" && role !== "usuario" && role !== "admin") {
      return response({ error: "Selecione um tipo de acesso válido." }, 400);
    }
    if (email === (authData.user.email ?? "").toLowerCase()) {
      return response({ error: "Você já está conectado com esse e-mail." }, 400);
    }

    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Number(Deno.env.get("SMTP_PORT") ?? "465");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    const smtpFrom = Deno.env.get("SMTP_FROM");
    if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom || ![465, 587].includes(smtpPort)) {
      console.error("Configuração SMTP incompleta ou inválida.");
      return response({ error: "O envio de e-mail ainda não está configurado corretamente." }, 500);
    }

    if (isStudentInvite && studentInviteId && !studentRecoveryUserId) {
      const { error: clearStaleError } = await admin.from("students")
        .update({ invited_at: null, invite_attempt_id: null })
        .eq("id", studentInviteId)
        .eq("owner_id", authData.user.id)
        .is("user_id", null)
        .lt("invited_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());
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
        return response({ error: "Este cadastro já está sendo processado para convite. Atualize a lista e tente novamente." }, 409);
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
          ? `${APP_ORIGIN}/claim-student.html?attempt_id=${encodeURIComponent(studentInviteAttemptId)}`
          : APP_URL,
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
        return response({ error: "Já existe uma conta cadastrada com esse e-mail." }, 409);
      }
      console.error("Falha ao gerar convite:", linkError.message);
      return response({ error: "Não foi possível criar o convite. Confira o e-mail e tente novamente." }, 400);
    }

    const invitedUserId = linkData.user?.id ?? studentRecoveryUserId ?? studentLegacyLinkUserId;
    const actionLink = linkData.properties?.action_link;
    if (!invitedUserId || !actionLink) {
      let accountRemoved = !invitedUserId;
      if (invitedUserId && !studentRecoveryUserId && !studentLegacyLinkUserId) {
        const { error: deleteError } = await admin.auth.admin.deleteUser(invitedUserId);
        accountRemoved = !deleteError;
        if (deleteError) console.error("Falha ao remover conta incompleta:", deleteError?.message ?? "erro desconhecido");
      }
      if (accountRemoved && studentInviteId && studentInviteReservation) {
        await admin.from("students").update({ invited_at: null, invite_attempt_id: null })
          .eq("id", studentInviteId).eq("owner_id", authData.user.id)
          .is("user_id", null).eq("invited_at", studentInviteReservation);
      }
      console.error("O Supabase não retornou os dados necessários do convite.");
      return response({ error: "Não foi possível preparar o convite." }, 500);
    }

    // Na recuperação, não redefina o papel do perfil: ele já foi validado
    // acima. A condição role=usuario evita sobrescrever uma alteração administrativa
    // concorrente ocorrida depois da validação inicial.
    const profileUpdate = admin.from("profiles")
      .update((studentRecoveryUserId || studentLegacyLinkUserId) ? { nome } : { nome, role })
      .eq("id", invitedUserId);
    if (studentRecoveryUserId || studentLegacyLinkUserId) profileUpdate.eq("role", "usuario");

    const { data: updatedProfile, error: updateProfileError } = await profileUpdate
      .select("id").maybeSingle();
    if (updateProfileError || !updatedProfile) {
      const { error: deleteError } = (studentRecoveryUserId || studentLegacyLinkUserId)
        ? { error: null }
        : await admin.auth.admin.deleteUser(invitedUserId);
      if (!deleteError && studentInviteId && studentInviteReservation) {
        await admin.from("students").update({ invited_at: null, invite_attempt_id: null })
          .eq("id", studentInviteId).eq("owner_id", authData.user.id)
          .is("user_id", null).eq("invited_at", studentInviteReservation);
      }
      console.error("Falha ao confirmar o perfil do usuário:", updateProfileError?.message ?? "perfil não encontrado ou papel alterado durante a operação");
      return response({ error: "Não foi possível definir o acesso do novo usuário." }, 500);
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
        return response({ error: "Não foi possível concluir o vínculo. Atualize a lista de alunos e tente novamente." }, 409);
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
        text: studentLegacyLinkUserId ? `Olá, ${nome}! Foi solicitado um vínculo entre sua conta já existente e seu cadastro de aluno. Para confirmar que você controla esta conta e concluir o acesso, abra este link: ${actionLink}` : studentRecoveryUserId ? `Olá, ${nome}! Foi solicitado um novo link para acessar sua conta no Marcus Instrutor e cadastrar ou redefinir sua senha: ${actionLink}` : `Olá, ${nome}! Você foi convidado(a) para acessar o aplicativo Marcus Instrutor como ${role === "admin" ? "administrador(a)" : role === "usuario" ? (isStudentInvite ? "aluno(a)" : "usuário") : "instrutor(a)"}. Para aceitar o convite e cadastrar sua senha, acesse: ${actionLink}`,
        html: `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6"><div style="max-width:560px;margin:24px auto;padding:28px;border:1px solid #e5e7eb;border-radius:14px"><h2 style="color:#12345a">Convite Marcus Instrutor</h2><p>Olá, <strong>${safeName}</strong>!</p><p>${studentLegacyLinkUserId ? "Foi solicitado um vínculo entre esta conta existente e seu cadastro de aluno. Clique abaixo para confirmar o acesso. Se você não reconhece a solicitação, ignore este e-mail." : studentRecoveryUserId ? "Foi solicitado um novo link para acessar sua conta e cadastrar ou redefinir sua senha." : `Você foi convidado(a) para acessar o aplicativo Marcus Instrutor como <strong>${role === "admin" ? "administrador(a)" : role === "usuario" ? (isStudentInvite ? "aluno(a)" : "usuário") : "instrutor(a)"}</strong>. Para aceitar o convite e cadastrar sua primeira senha, clique no botão abaixo:`}</p><p style="margin:28px 0"><a href="${actionLink}" style="display:inline-block;background:#12345a;color:#fff;text-decoration:none;padding:13px 22px;border-radius:8px">${studentLegacyLinkUserId ? "Confirmar meu acesso" : studentRecoveryUserId ? "Acessar minha conta" : "Aceitar convite e criar senha"}</a></p><p>Se você não esperava este convite, pode ignorar esta mensagem.</p></div></body></html>`,
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
      return response({ error: "O convite foi preparado, mas o e-mail não pôde ser enviado. Confira o SMTP e tente novamente." }, 502);
    } finally {
      transporter.close();
    }

    return response({ ok: true, message: studentLegacyLinkUserId ? "Link de confirmação enviado para a conta existente do aluno." : studentRecoveryUserId ? "Novo link de acesso enviado ao aluno." : "Convite enviado com sucesso." });
  } catch (error) {
    console.error("Erro interno ao gerenciar usuários:", error instanceof Error ? error.message : "erro desconhecido");
    return response({ error: "Ocorreu um erro interno. Tente novamente." }, 500);
  }
});