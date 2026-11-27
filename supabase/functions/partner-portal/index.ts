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

    if (body.action === "confirm_receipt") {
      if (!uuid(body.payout_id)) return response({ error: "Pagamento inválido." }, 400);
      const { data, error } = await db.from("partner_payouts")
        .update({ received_at: new Date().toISOString() })
        .eq("id", body.payout_id)
        .eq("owner_id", partner.owner_id)
        .eq("partner_id", partner.id)
        .is("received_at", null)
        .select("id,received_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) return response({ error: "Pagamento não encontrado ou já confirmado." }, 404);
      return response({ ok: true, payout: data, message: "Recebimento confirmado." });
    }

    if (body.action === "create_student") {
      const nome = typeof body.nome === "string" ? body.nome.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const telefone = typeof body.telefone === "string" ? body.telefone.trim() : null;
      const cpf = typeof body.cpf === "string" ? body.cpf.trim() : null;
      const endereco = typeof body.endereco === "string" ? body.endereco.trim() : null;
      const categoria = typeof body.categoria === "string" ? body.categoria.trim() : null;
      if (nome.length < 2 || nome.length > 160 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || email.length > 254 ||
          (telefone && telefone.length > 40) || (cpf && cpf.length > 20) || (endereco && endereco.length > 300) ||
          (categoria && !["A","B","AB","C","D","E"].includes(categoria))) {
        return response({ error: "Confira o nome, telefone, CPF, endereço e categoria do aluno." }, 400);
      }
      const { data, error } = await db.from("partner_students").insert({
        owner_id: partner.owner_id, partner_id: partner.id, nome, email, telefone, cpf, endereco, categoria,
        status: "pendente_aprovacao",
      }).select("id,nome,email,telefone,cpf,endereco,categoria,status,created_at").single();
      if (error) throw error;
      return response({ ok: true, student: data, message: "Aluno enviado ao administrador para aprovação." });
    }

    if (body.action === "create_quote") {
      if (!uuid(body.partner_student_id) || !Array.isArray(body.items) ||
          body.items.length < 1 || body.items.length > 30) {
        return response({ error: "Selecione um aluno e ao menos um item válido para o orçamento." }, 400);
      }
      const { data: referral, error: referralError } = await db.from("partner_students")
        .select("id,status").eq("id", body.partner_student_id)
        .eq("owner_id", partner.owner_id).eq("partner_id", partner.id).maybeSingle();
      if (referralError) throw referralError;
      if (!referral || referral.status === "reprovado") return response({ error: "Aluno não encontrado ou reprovado." }, 404);

      const normalized = body.items.map((item: any) => ({
        product_id: uuid(item?.product_id) ? item.product_id : null,
        quantidade: Number(item?.quantidade),
      }));
      if (normalized.some((item: any) => !item.product_id || !Number.isInteger(item.quantidade) || item.quantidade < 1 || item.quantidade > 100)) {
        return response({ error: "Um ou mais itens do orçamento possuem quantidade inválida." }, 400);
      }
      const productIds = [...new Set(normalized.map((item: any) => item.product_id))];
      const { data: products, error: productsError } = await db.from("products")
        .select("id,nome,tipo,descricao,preco,quantidade_aulas,quantidade_aulas_min,quantidade_aulas_max,app_product_id,ativo")
        .eq("owner_id", partner.owner_id).eq("ativo", true).in("id", productIds);
      if (productsError) throw productsError;
      const byId = new Map((products ?? []).map((p: any) => [p.id, p]));
      if (byId.size !== productIds.length) return response({ error: "O orçamento contém produto inexistente ou inativo." }, 400);

      const items = normalized.map((item: any) => {
        const product: any = byId.get(item.product_id);
        const price = Number(product.preco || 0);
        if (!Number.isFinite(price) || price <= 0) throw new Error("O item " + product.nome + " não possui preço válido.");
        const type = product.tipo === "servico" || product.tipo === "pacote" ||
          product.quantidade_aulas != null || product.quantidade_aulas_min != null ||
          product.quantidade_aulas_max != null ||
          ["bronze","prata","ouro"].includes(String(product.app_product_id || "").toLowerCase()) ||
          /^pacote |^aula avulsa/i.test(product.nome || "") ? "servico" : "produto";
        const lessons = type !== "servico" ? 0 :
          (product.quantidade_aulas_min != null || product.quantidade_aulas_max != null
            ? item.quantidade
            : item.quantidade * Math.max(1, Number(product.quantidade_aulas || 1)));
        return {
          owner_id: partner.owner_id, product_id: product.id, descricao: product.nome,
          tipo_item: type, quantidade: item.quantidade, valor_unitario: price,
          subtotal: Math.round(price * item.quantidade * 100) / 100,
          aulas_contratadas: lessons,
        };
      });
      const subtotal = items.reduce((sum: number, item: any) => sum + item.subtotal, 0);
      const observacoes = typeof body.observacoes === "string" ? body.observacoes.trim().slice(0,1000) : null;
      const { data: quote, error: quoteError } = await db.from("partner_quotes").insert({
        owner_id: partner.owner_id, partner_id: partner.id,
        partner_student_id: referral.id, subtotal, desconto: 0, total: subtotal,
        observacoes, status: "pendente",
      }).select("id,status,total,created_at").single();
      if (quoteError) throw quoteError;
      const { error: itemError } = await db.from("partner_quote_items").insert(
        items.map((item: any) => ({ ...item, quote_id: quote.id }))
      );
      if (itemError) {
        await db.from("partner_quotes").delete().eq("id", quote.id).eq("owner_id", partner.owner_id);
        throw itemError;
      }
      return response({ ok: true, quote, message: "Orçamento enviado ao administrador para aprovação." });
    }

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
    const [studentsResult, referralsResult, quotesResult, commissionsResult, payoutsResult, recipientsResult, productsResult] = await Promise.all([
      db.from("students").select("id,nome,categoria,status,created_at")
        .eq("owner_id", partner.owner_id).eq("partner_id", partner.id).order("nome"),
      db.from("partner_students").select("id,nome,email,telefone,cpf,categoria,status,student_id,created_at")
        .eq("owner_id", partner.owner_id).eq("partner_id", partner.id).order("created_at", { ascending: false }),
      db.from("partner_quotes").select("id,partner_student_id,status,total,created_at,observacoes")
        .eq("owner_id", partner.owner_id).eq("partner_id", partner.id).order("created_at", { ascending: false }),
      db.from("partner_commissions").select("id,student_id,descricao,base_amount,commission_percent,commission_amount,lessons_required,lessons_completed,status,created_at,available_at,paid_at")
        .eq("owner_id", partner.owner_id).eq("partner_id", partner.id).order("created_at", { ascending: false }),
      db.from("partner_payouts").select("id,amount,payment_method,reference,paid_at,pix_key_snapshot,received_at")
        .eq("owner_id", partner.owner_id).eq("partner_id", partner.id).order("paid_at", { ascending: false }),
      db.from("partner_message_recipients").select("id,message_id,read_at,created_at")
        .eq("owner_id", partner.owner_id).eq("partner_id", partner.id).order("created_at", { ascending: false }).limit(100),
      db.from("products").select("id,nome,tipo,preco,quantidade_aulas,quantidade_aulas_min,quantidade_aulas_max")
        .eq("owner_id", partner.owner_id).eq("ativo", true).order("nome"),
    ]);
    const err = studentsResult.error || referralsResult.error || quotesResult.error || commissionsResult.error || payoutsResult.error || recipientsResult.error || productsResult.error;
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
      ...c,
      student_name: studentById.get(c.student_id) ?? "Aluno",
      lessons_completed: c.status === "pago" ? null : c.lessons_completed,
      lessons_required: c.status === "pago" ? null : c.lessons_required,
    }));
    return response({
      ok: true,
      partner,
      students: studentsResult.data ?? [],
      referrals: referralsResult.data ?? [],
      quotes: (quotesResult.data ?? []).map((q: any) => ({
        ...q,
        student_name: (referralsResult.data ?? []).find((s: any) => s.id === q.partner_student_id)?.nome ?? "Aluno",
      })),
      products: productsResult.data ?? [],
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
