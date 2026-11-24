import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
const uuid = (v: unknown) => typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Método não permitido." }, 405);
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return response({ error: "Sessão não encontrada." }, 401);
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) return response({ error: "Serviço temporariamente indisponível." }, 500);
    const authClient = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: auth, error: authError } = await authClient.auth.getUser(token);
    if (authError || !auth.user) return response({ error: "Sessão inválida ou expirada." }, 401);
    const db = createClient(url, service, { auth: { persistSession: false } });
    const { data: profile, error: profileError } = await db.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== "admin") return response({ error: "Somente o proprietário pode gerenciar parceiros." }, 403);
    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== "string") return response({ error: "Solicitação inválida." }, 400);
    const ownerId = auth.user.id;

    if (body.action === "list") {
      const { data, error } = await db.from("partners")
        .select("id,nome,email,telefone,cpf_cnpj,endereco,pix_key,commission_percent,status,approved_at,rejected_at,created_at,user_id")
        .eq("owner_id", ownerId).order("created_at", { ascending: false });
      if (error) throw error;
      return response({ ok: true, partners: data ?? [] });
    }

    if (body.action === "invite") {
      const nome = typeof body.nome === "string" ? body.nome.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const telefone = typeof body.telefone === "string" ? body.telefone.trim() : null;
      const cpfCnpj = typeof body.cpf_cnpj === "string" ? body.cpf_cnpj.trim() : null;
      const percentual = Number(body.commission_percent);
      if (nome.length < 2 || nome.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
          !Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
        return response({ error: "Informe nome, e-mail válido e comissão entre 0 e 100%." }, 400);
      }
      const { data: partner, error: insertError } = await db.from("partners").insert({
        owner_id: ownerId, nome, email, telefone, cpf_cnpj: cpfCnpj,
        commission_percent: percentual, status: "pendente",
      }).select("id").single();
      if (insertError?.code === "23505") return response({ error: "Já existe um parceiro cadastrado com este e-mail." }, 409);
      if (insertError) throw insertError;

      const requestOrigin = req.headers.get("origin") ?? "";
      const safePreviewOrigin = requestOrigin === "https://marcusinstrutor-git-feature-relatorios-i-bc78ff-marcusvffs-2839.vercel.app" || /^https:\/\/marcusinstrutor-[a-z0-9]{9}-marcusvffs-2839\.vercel\.app$/.test(requestOrigin);
      const redirectTo = safePreviewOrigin
        ? requestOrigin + "/"
        : "https://marcusinstrutor.vercel.app/";
      const { data: invited, error: inviteError } = await db.auth.admin.inviteUserByEmail(email, {
        data: { nome, app_role: "parceiro" },
        redirectTo,
      });
      if (inviteError || !invited.user) {
        await db.from("partners").delete().eq("id", partner.id).eq("owner_id", ownerId);
        return response({ error: inviteError?.message || "Não foi possível enviar o convite." }, 409);
      }
      const { error: roleError } = await db.from("profiles")
        .update({ role: "parceiro", nome }).eq("id", invited.user.id);
      if (roleError) {
        await db.auth.admin.deleteUser(invited.user.id);
        await db.from("partners").delete().eq("id", partner.id).eq("owner_id", ownerId);
        throw roleError;
      }
      const { error: linkError } = await db.from("partners")
        .update({ user_id: invited.user.id }).eq("id", partner.id).eq("owner_id", ownerId);
      if (linkError) {
        await db.auth.admin.deleteUser(invited.user.id);
        await db.from("partners").delete().eq("id", partner.id).eq("owner_id", ownerId);
        throw linkError;
      }
      return response({ ok: true, partner_id: partner.id, message: "Convite enviado. O parceiro ficará pendente até sua aprovação." });
    }

    if (body.action === "update_status") {
      if (!uuid(body.partner_id) || !["pendente", "aprovado", "reprovado", "suspenso"].includes(body.status)) {
        return response({ error: "Parceiro ou situação inválidos." }, 400);
      }
      if (body.status === "aprovado") {
        const { data: target, error: targetError } = await db.from("partners")
          .select("id,user_id").eq("id", body.partner_id).eq("owner_id", ownerId).maybeSingle();
        if (targetError) throw targetError;
        if (!target) return response({ error: "Parceiro não encontrado." }, 404);
        if (!target.user_id) return response({ error: "O parceiro precisa ter uma conta vinculada antes da aprovação." }, 409);
      }
      const patch: Record<string, unknown> = { status: body.status, updated_at: new Date().toISOString() };
      if (body.status === "aprovado") { patch.approved_at = new Date().toISOString(); patch.rejected_at = null; }
      if (body.status === "reprovado") patch.rejected_at = new Date().toISOString();
      const { data, error } = await db.from("partners").update(patch)
        .eq("id", body.partner_id).eq("owner_id", ownerId)
        .select("id,status,approved_at,rejected_at").maybeSingle();
      if (error) throw error;
      if (!data) return response({ error: "Parceiro não encontrado." }, 404);
      return response({ ok: true, partner: data });
    }

    if (body.action === "update_commission") {
      const percent = Number(body.commission_percent);
      if (!uuid(body.partner_id) || !Number.isFinite(percent) || percent < 0 || percent > 100) {
        return response({ error: "Parceiro ou percentual inválidos." }, 400);
      }
      const { data, error } = await db.from("partners")
        .update({ commission_percent: percent, updated_at: new Date().toISOString() })
        .eq("id", body.partner_id).eq("owner_id", ownerId)
        .select("id,commission_percent").maybeSingle();
      if (error) throw error;
      if (!data) return response({ error: "Parceiro não encontrado." }, 404);
      return response({ ok: true, partner: data });
    }

    if (body.action === "send_message") {
      const assunto = typeof body.assunto === "string" ? body.assunto.trim() : "";
      const mensagem = typeof body.mensagem === "string" ? body.mensagem.trim() : "";
      if (!assunto || assunto.length > 160 || !mensagem || mensagem.length > 5000) {
        return response({ error: "Informe assunto e mensagem (até 5.000 caracteres)." }, 400);
      }
      let recipients: string[] = [];
      if (body.todos_aprovados === true) {
        const { data, error } = await db.from("partners").select("id")
          .eq("owner_id", ownerId).eq("status", "aprovado");
        if (error) throw error;
        recipients = (data ?? []).map((x: { id: string }) => x.id);
      } else if (Array.isArray(body.partner_ids) && body.partner_ids.length > 0 &&
                 body.partner_ids.length <= 200 && body.partner_ids.every(uuid)) {
        recipients = [...new Set(body.partner_ids as string[])];
        const { data, error } = await db.from("partners").select("id")
          .eq("owner_id", ownerId).eq("status", "aprovado").in("id", recipients);
        if (error) throw error;
        if ((data ?? []).length !== recipients.length) return response({ error: "A lista contém parceiro inexistente ou não aprovado." }, 400);
      } else return response({ error: "Selecione parceiros aprovados para receber a mensagem." }, 400);
      if (!recipients.length) return response({ error: "Não há parceiros aprovados para receber a mensagem." }, 400);
      const { data: msg, error: msgError } = await db.from("partner_messages").insert({
        owner_id: ownerId, assunto, mensagem,
        publico: body.todos_aprovados === true ? "todos_aprovados" : "selecionados",
      }).select("id").single();
      if (msgError) throw msgError;
      const { error: recipientError } = await db.from("partner_message_recipients").insert(
        recipients.map(partner_id => ({ owner_id: ownerId, message_id: msg.id, partner_id }))
      );
      if (recipientError) {
        await db.from("partner_messages").delete().eq("id", msg.id).eq("owner_id", ownerId);
        throw recipientError;
      }
      return response({ ok: true, recipients: recipients.length, message: "Mensagem enviada aos parceiros selecionados." });
    }

    if (body.action === "record_payout") {
      if (!uuid(body.partner_id) || !Array.isArray(body.commission_ids) ||
          body.commission_ids.length < 1 || body.commission_ids.length > 100 ||
          !body.commission_ids.every(uuid)) return response({ error: "Selecione as comissões disponíveis para pagamento." }, 400);
      const { data, error } = await db.rpc("record_partner_payout", {
        p_owner_id: ownerId,
        p_partner_id: body.partner_id,
        p_commission_ids: [...new Set(body.commission_ids)],
        p_payment_method: typeof body.payment_method === "string" ? body.payment_method.slice(0, 40) : "pix",
        p_reference: typeof body.reference === "string" ? body.reference.slice(0, 160) : null,
      });
      if (error) throw error;
      return response({ ok: true, payout: data, message: "Pagamento registrado e comissões quitadas." });
    }

    return response({ error: "Ação não reconhecida." }, 400);
  } catch (error) {
    console.error("admin-manage-partners:", error);
    return response({ error: error instanceof Error ? error.message : "Não foi possível concluir a operação." }, 500);
  }
});
