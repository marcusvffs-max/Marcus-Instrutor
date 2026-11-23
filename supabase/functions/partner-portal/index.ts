import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const uuid = (v: unknown) => typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Método não permitido." }, 405);
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return response({ error: "Sessão não encontrada." }, 401);
    const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) return response({ error: "Serviço temporariamente indisponível." }, 500);
    const authClient = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: auth, error: authError } = await authClient.auth.getUser(token);
    if (authError || !auth.user) return response({ error: "Sessão inválida ou expirada." }, 401);
    const db = createClient(url, service, { auth: { persistSession: false } });
    const { data: profile, error: profileError } = await db.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== "parceiro") return response({ error: "Esta conta não possui acesso de parceiro." }, 403);
    const { data: partner, error: partnerError } = await db.from("partners")
      .select("id,owner_id,nome,email,telefone,pix_key,commission_percent,status,approved_at")
      .eq("user_id", auth.user.id).maybeSingle();
    if (partnerError) throw partnerError;
    if (!partner) return response({ error: "Cadastro de parceiro não encontrado." }, 404);
    if (partner.status !== "aprovado") return response({ error: "Seu acesso está aguardando aprovação ou encontra-se suspenso." }, 403);
    const body = await req.json().catch(() => ({}));

    if (body.action === "mark_read") {
      if (!uuid(body.recipient_id)) return response({ error: "Mensagem inválida." }, 400);
      const { data, error } = await db.from("partner_message_recipients")
        .update({ read_at: new Date().toISOString() })
        .eq("id", body.recipient_id).eq("owner_id", partner.owner_id)
        .eq("partner_id", partner.id).select("id,read_at").maybeSingle();
      if (error) throw error;
      if (!data) return response({ error: "Mensagem não encontrada." }, 404);
      return response({ ok: true, recipient: data });
    }

    if (body.action !== "overview") return response({ error: "Ação não reconhecida." }, 400);
    const [studentsResult, commissionsResult, payoutsResult, recipientsResult] = await Promise.all([
      db.from("students").select("id,nome,categoria,status,created_at")
        .eq("owner_id", partner.owner_id).eq("partner_id", partner.id).order("nome"),
      db.from("partner_commissions").select("id,student_id,descricao,base_amount,commission_percent,commission_amount,lessons_required,lessons_completed,status,created_at,available_at,paid_at")
        .eq("owner_id", partner.owner_id).eq("partner_id", partner.id).order("created_at", { ascending: false }),
      db.from("partner_payouts").select("id,amount,payment_method,reference,paid_at,pix_key_snapshot")
        .eq("owner_id", partner.owner_id).eq("partner_id", partner.id).order("paid_at", { ascending: false }),
      db.from("partner_message_recipients").select("id,message_id,read_at,created_at")
        .eq("owner_id", partner.owner_id).eq("partner_id", partner.id).order("created_at", { ascending: false }).limit(100),
    ]);
    const err = studentsResult.error || commissionsResult.error || payoutsResult.error || recipientsResult.error;
    if (err) throw err;
    const recipients = recipientsResult.data ?? [];
    const messageIds = [...new Set(recipients.map((r: any) => r.message_id))];
    let messages: any[] = [];
    if (messageIds.length) {
      const { data, error } = await db.from("partner_messages")
        .select("id,assunto,mensagem,created_at").eq("owner_id", partner.owner_id).in("id", messageIds);
      if (error) throw error;
      const byId = new Map((data ?? []).map((m: any) => [m.id, m]));
      messages = recipients.map((r: any) => ({ ...r, message: byId.get(r.message_id) ?? null }))
        .filter((r: any) => r.message);
    }
    const studentById = new Map((studentsResult.data ?? []).map((s: any) => [s.id, s.nome]));
    const commissions = (commissionsResult.data ?? []).map((c: any) => ({
      ...c, student_name: studentById.get(c.student_id) ?? "Aluno",
    }));
    return response({
      ok: true,
      partner,
      students: studentsResult.data ?? [],
      commissions,
      payouts: payoutsResult.data ?? [],
      messages,
      totals: {
        pending: commissions.filter((c: any) => c.status === "pendente").reduce((n: number, c: any) => n + Number(c.commission_amount || 0), 0),
        available: commissions.filter((c: any) => c.status === "disponivel").reduce((n: number, c: any) => n + Number(c.commission_amount || 0), 0),
        paid: commissions.filter((c: any) => c.status === "pago").reduce((n: number, c: any) => n + Number(c.commission_amount || 0), 0),
      },
    });
  } catch (error) {
    console.error("partner-portal:", error);
    return response({ error: error instanceof Error ? error.message : "Não foi possível carregar sua área." }, 500);
  }
});
