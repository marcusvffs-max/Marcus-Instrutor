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

    if (body.action === "update_pix_key") {
      if (!uuid(body.partner_id)) return response({ error: "Parceiro inválido." }, 400);
      const pixKey = typeof body.pix_key === "string" ? body.pix_key.trim() : "";
      if (pixKey.length > 120) return response({ error: "A chave PIX deve ter até 120 caracteres." }, 400);
      const { data, error } = await db.from("partners")
        .update({ pix_key: pixKey || null, updated_at: new Date().toISOString() })
        .eq("id", body.partner_id).eq("owner_id", ownerId)
        .select("id,pix_key").maybeSingle();
      if (error) throw error;
      if (!data) return response({ error: "Parceiro não encontrado." }, 404);
      return response({ ok: true, pix_key: data.pix_key });
    }

    if (body.action === "list") {
      const [partnersResult, referralsResult, quotesResult, studentsResult, commissionsResult] = await Promise.all([
        db.from("partners").select("id,nome,email,telefone,cpf_cnpj,endereco,nacionalidade,estado_civil,profissao,pix_key,commission_percent,status,approved_at,rejected_at,created_at,updated_at,user_id").eq("owner_id", ownerId).order("created_at", { ascending: false }),
        db.from("partner_students").select("id,partner_id,nome,email,telefone,cpf,endereco,categoria,status,created_at").eq("owner_id", ownerId).order("created_at", { ascending: false }),
        db.from("partner_quotes").select("id,partner_id,partner_student_id,status,subtotal,total,observacoes,created_at").eq("owner_id", ownerId).order("created_at", { ascending: false }),
        db.from("students").select("id,nome,telefone,categoria,status,partner_id,created_at").eq("owner_id", ownerId).not("partner_id", "is", null).order("nome"),
        db.from("partner_commissions").select("id,partner_id,commission_amount,status").eq("owner_id", ownerId).in("status", ["disponivel","pendente"]),
      ]);
      const error = partnersResult.error || referralsResult.error || quotesResult.error || studentsResult.error || commissionsResult.error;
      if (error) throw error;
      const partnerNames = new Map((partnersResult.data ?? []).map((p: any) => [p.id, p.nome]));
      const referralNames = new Map((referralsResult.data ?? []).map((s: any) => [s.id, s.nome]));
      const referrals = (referralsResult.data ?? []).map((s: any) => ({ ...s, partner_name: partnerNames.get(s.partner_id) ?? "Parceiro" }));
      const quoteIds = (quotesResult.data ?? []).map((q: any) => q.id);
      let quoteItems: any[] = [];
      if (quoteIds.length) {
        const { data, error } = await db.from("partner_quote_items").select("id,quote_id,descricao,tipo_item,quantidade,valor_unitario,subtotal,aulas_contratadas").eq("owner_id", ownerId).in("quote_id", quoteIds);
        if (error) throw error;
        quoteItems = data ?? [];
      }
      const quotes = (quotesResult.data ?? []).map((q: any) => ({ ...q, partner_name: partnerNames.get(q.partner_id) ?? "Parceiro", student_name: referralNames.get(q.partner_student_id) ?? "Aluno", items: quoteItems.filter((item: any) => item.quote_id === q.id) }));
      const students = (studentsResult.data ?? []).map((s: any) => ({ ...s, partner_name: partnerNames.get(s.partner_id) ?? "Parceiro" }));
      const commissionSummary = new Map<string, any>();
      for (const c of commissionsResult.data ?? []) {
        const item = commissionSummary.get(c.partner_id) ?? { available_count: 0, available_amount: 0, pending_count: 0, pending_amount: 0 };
        if (c.status === "disponivel") { item.available_count++; item.available_amount += Number(c.commission_amount || 0); }
        if (c.status === "pendente") { item.pending_count++; item.pending_amount += Number(c.commission_amount || 0); }
        commissionSummary.set(c.partner_id, item);
      }
      const partners = (partnersResult.data ?? []).map((p: any) => ({ ...p, commissions: commissionSummary.get(p.id) ?? { available_count: 0, available_amount: 0, pending_count: 0, pending_amount: 0 } }));
      return response({ ok: true, partners, referrals, quotes, students });
    }
    if (body.action === "message_history") {
      const { data: messages, error: messagesError } = await db.from("partner_messages").select("id,assunto,mensagem,publico,created_at").eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(200);
      if (messagesError) throw messagesError;
      const ids = (messages ?? []).map((m: any) => m.id);
      let recipients: any[] = [];
      if (ids.length) {
        const { data, error } = await db.from("partner_message_recipients").select("id,message_id,partner_id,read_at,created_at").eq("owner_id", ownerId).in("message_id", ids);
        if (error) throw error;
        recipients = data ?? [];
      }
      const partnerIds = [...new Set(recipients.map((r: any) => r.partner_id))];
      let names = new Map<string, string>();
      if (partnerIds.length) {
        const { data, error } = await db.from("partners").select("id,nome").eq("owner_id", ownerId).in("id", partnerIds);
        if (error) throw error;
        names = new Map((data ?? []).map((p: any) => [p.id, p.nome]));
      }
      return response({ ok: true, messages: (messages ?? []).map((m: any) => ({ ...m, recipients: recipients.filter((r: any) => r.message_id === m.id).map((r: any) => ({ partner_name: names.get(r.partner_id) ?? "Parceiro", read_at: r.read_at })) })) });
    }

    if (body.action === "review_student") {
      if (!uuid(body.partner_student_id) || !["aprovado","reprovado"].includes(body.status)) {
        return response({ error: "Aluno ou decisão inválidos." }, 400);
      }
      const { data: referral, error: referralError } = await db.from("partner_students")
        .select("id,partner_id,nome,email,telefone,cpf,endereco,categoria,status,student_id")
        .eq("id", body.partner_student_id).eq("owner_id", ownerId).maybeSingle();
      if (referralError) throw referralError;
      if (!referral || referral.status !== "pendente_aprovacao") return response({ error: "Indicação não encontrada ou já analisada." }, 409);
      if (body.status === "reprovado") {
        const { data, error } = await db.from("partner_students")
          .update({ status: "reprovado", reviewed_at: new Date().toISOString(), reviewed_by: ownerId, updated_at: new Date().toISOString() })
          .eq("id", referral.id).eq("owner_id", ownerId).eq("status", "pendente_aprovacao")
          .select("id,status").maybeSingle();
        if (error) throw error;
        if (!data) return response({ error: "A indicação já foi analisada." }, 409);
        return response({ ok: true, student: data, message: "Indicação reprovada." });
      }
      const { data: partner, error: partnerError } = await db.from("partners")
        .select("id,status").eq("id", referral.partner_id).eq("owner_id", ownerId).maybeSingle();
      if (partnerError) throw partnerError;
      if (!partner || partner.status !== "aprovado") return response({ error: "Aprove o parceiro antes de aceitar indicações." }, 409);
      const { data: student, error: studentError } = await db.from("students").insert({
        owner_id: ownerId, partner_id: referral.partner_id,
        nome: referral.nome, email: referral.email, telefone: referral.telefone, cpf: referral.cpf,
        endereco: referral.endereco, categoria: referral.categoria,
        status: "em_aberto", aulas_compradas: 0, aulas_restantes: 0,
        alugueis_comprados: 0, alugueis_disponiveis: 0,
      }).select("id,nome").single();
      if (studentError) throw studentError;
      const { data: updated, error: updateError } = await db.from("partner_students")
        .update({ status: "aprovado", student_id: student.id, reviewed_at: new Date().toISOString(), reviewed_by: ownerId, updated_at: new Date().toISOString() })
        .eq("id", referral.id).eq("owner_id", ownerId).eq("status", "pendente_aprovacao")
        .select("id,status,student_id").maybeSingle();
      if (updateError || !updated) {
        await db.from("students").delete().eq("id", student.id).eq("owner_id", ownerId);
        if (updateError) throw updateError;
        return response({ error: "A indicação foi analisada em outra sessão." }, 409);
      }
      return response({ ok: true, student: updated, message: "Dados cadastrais transferidos para o cadastro de alunos. Nenhuma venda ou movimentação financeira foi criada." });
    }

    if (body.action === "review_quote") {
      if (!uuid(body.quote_id) || !["aprovado","reprovado"].includes(body.status)) {
        return response({ error: "Orçamento ou decisão inválidos." }, 400);
      }
      const { data: quote, error: quoteError } = await db.from("partner_quotes")
        .select("id,partner_student_id,status,subtotal,desconto,total,observacoes").eq("id", body.quote_id).eq("owner_id", ownerId).maybeSingle();
      if (quoteError) throw quoteError;
      if (!quote || quote.status !== "pendente") return response({ error: "Orçamento não encontrado ou já analisado." }, 409);
      let referralNameForQuote = "Cliente indicado por parceiro";
      if (body.status === "aprovado") {
        const { data: referral, error: referralError } = await db.from("partner_students")
          .select("id,nome,status,student_id").eq("id", quote.partner_student_id).eq("owner_id", ownerId).maybeSingle();
        if (referralError) throw referralError;
        if (!referral || referral.status !== "aprovado" || !referral.student_id) {
          return response({ error: "Aprove primeiro o cadastro do aluno. O orçamento não cria venda nem lançamento financeiro." }, 409);
        }
        referralNameForQuote = referral.nome || referralNameForQuote;
      }
      if (body.status === "aprovado") {
        const { data: existingAdminQuote, error: existingError } = await db.from("sales_quotes")
          .select("id").eq("owner_id", ownerId).eq("source_partner_quote_id", quote.id).maybeSingle();
        if (existingError) throw existingError;
        if (!existingAdminQuote) {
          const { data: partnerItems, error: itemsError } = await db.from("partner_quote_items")
            .select("descricao,quantidade,valor_unitario,subtotal").eq("owner_id", ownerId).eq("quote_id", quote.id);
          if (itemsError) throw itemsError;
          const discount = Number(quote.desconto || 0);
          const notes = [
            "Orçamento enviado pelo parceiro.",
            quote.observacoes ? "Observações do parceiro: " + quote.observacoes : ""
          ].filter(Boolean).join("\\n");
          const { error: adminQuoteError } = await db.from("sales_quotes").insert({
            owner_id: ownerId,
            client_name: referralNameForQuote,
            items: (partnerItems || []).map((item: any) => ({
              descricao: item.descricao,
              quantidade: Number(item.quantidade || 0),
              preco_unitario: Number(item.valor_unitario || 0),
              subtotal: Number(item.subtotal || 0)
            })),
            subtotal: Number(quote.subtotal || 0),
            discount_type: "valor",
            discount_value: discount,
            discount,
            total: Number(quote.total || 0),
            notes,
            source_partner_quote_id: quote.id
          });
          if (adminQuoteError) throw adminQuoteError;
        }
      }
      const { data, error } = await db.from("partner_quotes")
        .update({ status: body.status, reviewed_at: new Date().toISOString(), reviewed_by: ownerId, updated_at: new Date().toISOString() })
        .eq("id", quote.id).eq("owner_id", ownerId).eq("status", "pendente")
        .select("id,status").maybeSingle();
      if (error) throw error;
      if (!data) return response({ error: "O orçamento já foi analisado." }, 409);
      return response({ ok: true, quote: data, message: body.status === "aprovado"
        ? "Orçamento aprovado. Registre a venda e o financeiro manualmente no cadastro do aluno."
        : "Orçamento reprovado." });
    }

    if (body.action === "create") {
      const nome = typeof body.nome === "string" ? body.nome.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const telefone = typeof body.telefone === "string" ? body.telefone.trim() : null;
      const cpfCnpj = typeof body.cpf_cnpj === "string" ? body.cpf_cnpj.trim() : null;
      const nacionalidade = typeof body.nacionalidade === "string" ? body.nacionalidade.trim() : "";
      const estadoCivil = typeof body.estado_civil === "string" ? body.estado_civil.trim() : "";
      const profissao = typeof body.profissao === "string" ? body.profissao.trim() : "";
      const endereco = typeof body.endereco === "string" ? body.endereco.trim() : "";
      const percentual = Number(typeof body.commission_percent === "string" ? body.commission_percent.replace(",", ".") : body.commission_percent);
      if (nome.length < 2 || nome.length > 160) return response({ error: "Informe o nome completo do parceiro." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return response({ error: "Informe um e-mail válido para o parceiro." }, 400);
      if ((nacionalidade && nacionalidade.length > 80) || (estadoCivil && estadoCivil.length > 80) ||
          (profissao && profissao.length > 120) || (endereco && endereco.length > 300) ||
          (telefone && telefone.length > 40) || (cpfCnpj && cpfCnpj.length > 30)) {
        return response({ error: "Um dos campos complementares ultrapassou o limite permitido." }, 400);
      }
      if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
        return response({ error: "Informe uma comissão entre 0 e 100%." }, 400);
      }
      const { data: partner, error: insertError } = await db.from("partners").insert({
        owner_id: ownerId, nome, email, telefone, cpf_cnpj: cpfCnpj,
        nacionalidade: nacionalidade || null, estado_civil: estadoCivil || null, profissao: profissao || null, endereco: endereco || null,
        commission_percent: percentual, status: "pendente",
      }).select("id").single();
      if (insertError?.code === "23505") return response({ error: "Já existe um parceiro cadastrado com este e-mail." }, 409);
      if (insertError) throw insertError;
      return response({ ok: true, partner_id: partner.id, message: "Parceiro cadastrado com sucesso. O convite de acesso pode ser enviado pelo cartão do parceiro." });
    }

    if (body.action === "invite_existing") {
      if (!uuid(body.partner_id)) return response({ error: "Selecione um parceiro válido." }, 400);
      const { data: partner, error: partnerError } = await db.from("partners")
        .select("id,nome,email,user_id").eq("id", body.partner_id).eq("owner_id", ownerId).maybeSingle();
      if (partnerError) throw partnerError;
      if (!partner) return response({ error: "Parceiro não encontrado." }, 404);
      if (partner.user_id) return response({ error: "Este parceiro já possui acesso vinculado." }, 409);
      const redirectTo = "https://marcusinstrutor.vercel.app/claim-access.html?role=parceiro";
      const { data: invited, error: inviteError } = await db.auth.admin.inviteUserByEmail(partner.email, {
        data: { nome: partner.nome, app_role: "parceiro" },
        redirectTo,
      });
      if (inviteError || !invited.user) {
        const rateLimited = inviteError?.status === 429 ||
          inviteError?.code === "over_email_send_rate_limit" ||
          /over_email_send_rate_limit|email.*rate.?limit|too many requests/i.test(inviteError?.message || "");
        if (rateLimited) {
          return response({
            error: "O serviço de e-mail atingiu o limite temporário de convites. Nenhum acesso foi enviado. Aguarde o limite ser liberado ou configure um serviço de e-mail próprio no Supabase antes de tentar novamente."
          }, 429);
        }
        return response({ error: inviteError?.message || "O cadastro foi salvo, mas não foi possível enviar o convite de acesso." }, 409);
      }
      const { error: roleError } = await db.from("profiles")
        .update({ role: "parceiro", nome: partner.nome }).eq("id", invited.user.id);
      if (roleError) {
        await db.auth.admin.deleteUser(invited.user.id);
        return response({ error: "Parceiro cadastrado, mas não foi possível configurar o acesso: " + roleError.message }, 500);
      }
      const { data: linked, error: linkError } = await db.from("partners")
        .update({ user_id: invited.user.id, updated_at: new Date().toISOString() })
        .eq("id", partner.id).eq("owner_id", ownerId).is("user_id", null)
        .select("id").maybeSingle();
      if (linkError || !linked) {
        await db.auth.admin.deleteUser(invited.user.id);
        if (linkError) throw linkError;
        return response({ error: "O parceiro foi salvo, mas o vínculo de acesso não pôde ser concluído." }, 409);
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

    if (body.action === "payout_report") {
      const { data: payouts, error: payoutError } = await db.from("partner_payouts")
        .select("id,partner_id,amount,payment_method,reference,paid_at,received_at")
        .eq("owner_id", ownerId).order("paid_at", { ascending: false }).limit(500);
      if (payoutError) throw payoutError;
      const partnerIds = [...new Set((payouts ?? []).map((item: any) => item.partner_id))];
      let partnerNames = new Map<string, string>();
      if (partnerIds.length) {
        const { data: rows, error: partnersError } = await db.from("partners")
          .select("id,nome").eq("owner_id", ownerId).in("id", partnerIds);
        if (partnersError) throw partnersError;
        partnerNames = new Map((rows ?? []).map((item: any) => [item.id, item.nome]));
      }
      return response({
        ok: true,
        payouts: (payouts ?? []).map((item: any) => ({
          ...item, partner_name: partnerNames.get(item.partner_id) ?? "Parceiro"
        }))
      });
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
