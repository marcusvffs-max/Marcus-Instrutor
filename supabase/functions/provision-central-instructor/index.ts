import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CENTRAL_URL = "https://yklljrfshqoxsruibsws.supabase.co";
const CENTRAL_ANON = "sb_publishable_BzUGZnIyTH49tSwAIwFhrw_1GvVzQVw";
const APP_ORIGIN = "https://marcusinstrutor.vercel.app";
const PREVIEW_ORIGIN = "https://marcusinstrutor-git-feature-relatorios-i-bc78ff-marcusvffs-2839.vercel.app";

const cors = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
  "Vary": "Origin",
};

const json = (body: unknown, status = 200, origin = APP_ORIGIN) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Access-Control-Allow-Origin": origin },
  });

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  return await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const isPreview = origin === PREVIEW_ORIGIN ||
    /^https:\/\/marcusinstrutor-[a-z0-9-]+-marcusvffs-2839\.vercel\.app$/.test(origin);
  if (origin && origin !== APP_ORIGIN && !isPreview) return json({ error: "Origem não autorizada." }, 403);
  const responseOrigin = isPreview ? origin : APP_ORIGIN;

  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...cors, "Access-Control-Allow-Origin": responseOrigin } });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405, responseOrigin);

  const appUrl = Deno.env.get("SUPABASE_URL");
  const appAnon = Deno.env.get("SUPABASE_ANON_KEY");
  const appService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!appUrl || !appAnon || !appService) return json({ error: "Serviço de autenticação indisponível." }, 503, responseOrigin);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Dados inválidos." }, 400, responseOrigin); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 6 || password.length > 256) {
    return json({ error: "E-mail ou senha inválidos." }, 400, responseOrigin);
  }

  try {
    // A senha é validada diretamente pelo Auth da Central; nunca é armazenada nem registrada.
    const centralLogin = await postJson(
      CENTRAL_URL + "/auth/v1/token?grant_type=password",
      { apikey: CENTRAL_ANON },
      { email, password },
    );
    if (!centralLogin.ok) return json({ error: "Não foi possível entrar. Confira o e-mail e a senha cadastrados na Central." }, 401, responseOrigin);
    const centralSession = await centralLogin.json();
    const centralUser = centralSession?.user;
    const centralToken = centralSession?.access_token;
    if (!centralUser?.id || !centralToken || String(centralUser.email || "").toLowerCase() !== email) {
      return json({ error: "Não foi possível validar a conta da Central." }, 401, responseOrigin);
    }

    const centralHeaders = { apikey: CENTRAL_ANON, Authorization: "Bearer " + centralToken };
    const [profileResponse, instructorResponse] = await Promise.all([
      fetch(CENTRAL_URL + "/rest/v1/profiles?id=eq." + encodeURIComponent(centralUser.id) + "&select=full_name&limit=1", { headers: centralHeaders }),
      fetch(CENTRAL_URL + "/rest/v1/instructors?owner_user_id=eq." + encodeURIComponent(centralUser.id) + "&select=id,business_name,instructor_name&limit=1", { headers: centralHeaders }),
    ]);
    if (!profileResponse.ok || !instructorResponse.ok) return json({ error: "Não foi possível confirmar o cadastro de instrutor na Central." }, 503, responseOrigin);
    const centralProfile = (await profileResponse.json())?.[0];
    const centralInstructor = (await instructorResponse.json())?.[0];
    if (!centralProfile || !centralInstructor) {
      return json({ error: "Esta conta não possui cadastro de instrutor autorizado na Central." }, 403, responseOrigin);
    }

    const appAdmin = createClient(appUrl, appService, { auth: { autoRefreshToken: false, persistSession: false } });
    let existing: any = null;
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await appAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      existing = (data.users || []).find((u: any) => String(u.email || "").toLowerCase() === email) || null;
      if (existing || (data.users || []).length < 1000) break;
    }

    const nome = String(centralProfile.full_name || centralInstructor.instructor_name || centralInstructor.business_name || email.split("@")[0]).trim();
    let appUserId: string;
    let createdHere = false;
    if (existing) {
      const { data: profile, error: profileError } = await appAdmin.from("profiles").select("role").eq("id", existing.id).maybeSingle();
      if (profileError) throw profileError;
      if (profile?.role !== "instrutor") {
        return json({ error: "Já existe uma conta com este e-mail no aplicativo, mas ela não é de instrutor. Procure o administrador." }, 409, responseOrigin);
      }
      const { error: updateError } = await appAdmin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
        user_metadata: { ...(existing.user_metadata || {}), nome },
      });
      if (updateError) throw updateError;
      appUserId = existing.id;
    } else {
      const { data, error } = await appAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome },
      });
      if (error || !data.user) throw error || new Error("Não foi possível criar a conta do aplicativo.");
      appUserId = data.user.id;
      createdHere = true;
    }

    // Confirma que o gatilho do Auth criou o perfil de instrutor no APP.
    const { data: appProfile, error: appProfileError } = await appAdmin.from("profiles").select("role").eq("id", appUserId).maybeSingle();
    if (appProfileError || appProfile?.role !== "instrutor") {
      if (createdHere) await appAdmin.auth.admin.deleteUser(appUserId);
      return json({ error: "A conta foi validada, mas o perfil de instrutor não foi preparado no aplicativo." }, 500, responseOrigin);
    }

    // Recupera a sessão do APP e conclui automaticamente o vínculo seguro já existente entre os sistemas.
    const appLogin = await postJson(appUrl + "/auth/v1/token?grant_type=password", { apikey: appAnon }, { email, password });
    if (!appLogin.ok) {
      if (createdHere) await appAdmin.auth.admin.deleteUser(appUserId);
      return json({ error: "A conta foi preparada, mas não foi possível iniciar a sessão do aplicativo." }, 502, responseOrigin);
    }
    const appSession = await appLogin.json();
    const appToken = appSession?.access_token;
    if (!appToken) {
      if (createdHere) await appAdmin.auth.admin.deleteUser(appUserId);
      return json({ error: "Não foi possível iniciar a sessão do aplicativo." }, 502, responseOrigin);
    }

    const statusResponse = await postJson(
      CENTRAL_URL + "/functions/v1/get-app-link-status",
      { apikey: CENTRAL_ANON, Authorization: "Bearer " + centralToken },
      {},
    );
    if (!statusResponse.ok) {
      if (createdHere) await appAdmin.auth.admin.deleteUser(appUserId);
      return json({ error: "Não foi possível verificar a associação com a Central." }, 502, responseOrigin);
    }
    const linkStatus = await statusResponse.json();
    if (linkStatus?.linked !== true) {
      const codeResponse = await postJson(
        CENTRAL_URL + "/functions/v1/create-app-link-code",
        { apikey: CENTRAL_ANON, Authorization: "Bearer " + centralToken },
        {},
      );
      if (!codeResponse.ok) {
        const detail = await codeResponse.json().catch(() => ({}));
        if (createdHere) await appAdmin.auth.admin.deleteUser(appUserId);
        return json({ error: detail?.error || "Não foi possível concluir a associação automática. Tente novamente mais tarde." }, 502, responseOrigin);
      }
      const codeData = await codeResponse.json();
      const completeResponse = await postJson(
        appUrl + "/functions/v1/complete-central-link",
        { apikey: appAnon, Authorization: "Bearer " + appToken },
        { code: codeData.code },
      );
      if (!completeResponse.ok) {
        const detail = await completeResponse.json().catch(() => ({}));
        if (createdHere) await appAdmin.auth.admin.deleteUser(appUserId);
        return json({ error: detail?.error || "Não foi possível concluir a associação automática com a Central." }, 502, responseOrigin);
      }
    }

    return json({ ok: true, provisioned: !existing, linked: true }, 200, responseOrigin);
  } catch (error) {
    console.error("provision-central-instructor:", error instanceof Error ? error.message : "erro desconhecido");
    return json({ error: "Não foi possível preparar o acesso ao aplicativo. Tente novamente." }, 500, responseOrigin);
  }
});
