"use strict";
(async function () {
  const $ = id => document.getElementById(id);
  const host = location.hostname;
  const qa = host === "marcusinstrutor-git-feature-acessos-alun-ffc22b-marcusvffs-2839.vercel.app" || host === "marcusinstrutor-git-feature-relatorios-i-bc78ff-marcusvffs-2839.vercel.app" || /^marcusinstrutor-[a-z0-9]{9}-marcusvffs-2839\.vercel\.app$/.test(host);
  const url = qa ? "https://voyjssflroiwdyaacthh.supabase.co" : "https://ydyqagqsuqntuibzgwzd.supabase.co";
  const key = qa ? "sb_publishable_YpDyl5xJknD9NJ-i2fDn9Q_F4jjkLm9" : "sb_publishable_hgqXLoA9BQvZy0L3dEEJ-A_WfoUq7tU";
  const client = window.supabase?.createClient(url, key, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, storage: window.sessionStorage } });
  const say = (message, error = false) => { $("partnerStatus").textContent = message; $("partnerStatus").classList.toggle("partner-error", error); };
  const money = value => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const date = value => value ? new Date(value).toLocaleDateString("pt-BR") : "—";
  const cell = (row, text, span) => { const td = document.createElement("td"); td.textContent = text ?? "—"; if (span) td.colSpan = span; row.append(td); };
  if (!client) { say("Não foi possível carregar a autenticação.", true); return; }
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError || !sessionData.session) { location.replace("index.html"); return; }
  const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", sessionData.session.user.id).maybeSingle();
  if (profileError || profile?.role !== "parceiro") { await client.auth.signOut({ scope: "local" }); location.replace("index.html"); return; }

  async function invoke(action, payload = {}) {
    const { data, error } = await client.functions.invoke("partner-portal", { body: { action, ...payload } });
    if (error) {
      let message = error.message || "Não foi possível consultar sua área.";
      try { const body = await error.context?.json?.(); if (body?.error) message = body.error; } catch (_) {}
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data || {};
  }
  function renderTable(id, rows, columns, empty, colspan) {
    const target = $(id); target.replaceChildren();
    if (!rows.length) { const tr = document.createElement("tr"); cell(tr, empty, colspan); target.append(tr); return; }
    rows.forEach(item => { const tr = document.createElement("tr"); columns.forEach(fn => cell(tr, fn(item))); target.append(tr); });
  }
  function renderPayouts(rows) {
    const target = $("partnerPayouts");
    target.replaceChildren();
    if (!rows.length) {
      const tr = document.createElement("tr"); cell(tr, "Nenhum pagamento registrado.", 5); target.append(tr); return;
    }
    rows.forEach(item => {
      const tr = document.createElement("tr");
      cell(tr, date(item.paid_at));
      cell(tr, ({ pix: "PIX", dinheiro: "Dinheiro", transferencia: "Transferência", outro: "Outro" })[item.payment_method] || item.payment_method);
      cell(tr, item.reference || "—");
      cell(tr, money(item.amount));
      const action = document.createElement("td");
      if (item.received_at) {
        action.textContent = "Recebido em " + date(item.received_at);
      } else {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "partner-button secondary";
        button.textContent = "Confirmar recebimento";
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await invoke("confirm_receipt", { payout_id: item.id });
            say("Recebimento confirmado.");
            await load();
          } catch (error) {
            say(error.message, true);
            button.disabled = false;
          }
        });
        action.append(button);
      }
      tr.append(action);
      target.append(tr);
    });
  }
  async function load() {
    say("Carregando seus dados…");
    try {
      const data = await invoke("overview");
      $("partnerName").textContent = data.partner?.nome || "Área do Parceiro";
      $("partnerEmail").textContent = data.partner?.email || "";
      $("partnerPixKey").value = data.partner?.pix_key || "";
      $("partnerPending").textContent = money(data.totals?.pending);
      $("partnerAvailable").textContent = money(data.totals?.available);
      $("partnerPaid").textContent = money(data.totals?.paid);
      renderTable("partnerStudents", data.students || [], [
        x => x.nome, x => x.categoria, x => x.status, x => date(x.created_at)
      ], "Nenhum aluno indicado.", 4);
      renderTable("partnerCommissions", data.commissions || [], [
        x => x.descricao, x => x.student_name,
        x => x.status === "pago" ? "Acompanhamento encerrado" : (x.lessons_completed || 0) + " de " + (x.lessons_required || 0),
        x => money(x.commission_amount), x => x.status
      ], "Nenhuma comissão registrada.", 5);
      renderPayouts(data.payouts || []);
      const messages = $("partnerMessages"); messages.replaceChildren();
      if (!(data.messages || []).length) messages.append(document.createTextNode("Nenhum comunicado no momento."));
      (data.messages || []).forEach(item => {
        const article = document.createElement("article"); article.className = "partner-message";
        const title = document.createElement("h3"); title.textContent = item.message?.assunto || "Comunicado";
        const body = document.createElement("p"); body.textContent = item.message?.mensagem || "";
        const meta = document.createElement("small"); meta.textContent = date(item.message?.created_at);
        article.append(title, body, meta);
        if (!item.read_at) {
          const button = document.createElement("button"); button.type = "button"; button.className = "partner-button secondary"; button.textContent = "Marcar como lido";
          button.addEventListener("click", async () => { button.disabled = true; try { await invoke("mark_read", { recipient_id: item.id }); button.textContent = "Lido"; } catch (error) { say(error.message, true); button.disabled = false; } });
          article.append(button);
        }
        messages.append(article);
      });
      say("Dados atualizados.");
    } catch (error) { say(error.message, true); }
  }
  $("partnerLogout").addEventListener("click", async () => {
    $("partnerLogout").disabled = true;
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) { say("Não foi possível encerrar a sessão.", true); $("partnerLogout").disabled = false; return; }
    location.replace("index.html");
  });
  await load();
})();