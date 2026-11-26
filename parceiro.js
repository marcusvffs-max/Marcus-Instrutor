"use strict";
(async function () {
  const $ = id => document.getElementById(id);
  const host = location.hostname;
  const qa = host === ""marcusinstrutor-git-qa-production-readin-52425c-marcusvffs-2839.vercel.app"" || host === "marcusinstrutor-git-feature-acessos-alun-ffc22b-marcusvffs-2839.vercel.app" || host === "marcusinstrutor-git-feature-relatorios-i-bc78ff-marcusvffs-2839.vercel.app" || /^marcusinstrutor-[a-z0-9]{9}-marcusvffs-2839\.vercel\.app$/.test(host);
  const url = qa ? "https://voyjssflroiwdyaacthh.supabase.co" : "https://ydyqagqsuqntuibzgwzd.supabase.co";
  const key = qa ? "sb_publishable_YpDyl5xJknD9NJ-i2fDn9Q_F4jjkLm9" : "sb_publishable_hgqXLoA9BQvZy0L3dEEJ-A_WfoUq7tU";
  const client = window.supabase?.createClient(url, key, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, storage: window.sessionStorage } });
  const say = (message, error = false) => { $("partnerStatus").textContent = message; $("partnerStatus").classList.toggle("partner-error", error); };
  const money = value => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const date = value => value ? new Date(value).toLocaleDateString("pt-BR") : "—";
  const cell = (row, text, span) => { const td = document.createElement("td"); td.textContent = text ?? "—"; if (span) td.colSpan = span; row.append(td); };
  let availableProducts = [];
  let quoteItems = [];
  let activePartnerForm = null;
  function openPartnerForm(formId, title) {
    const form = $(formId), modal = $("partnerModal"), body = $("partnerModalBody");
    if (!form || !modal || !body) return;
    if (activePartnerForm) closePartnerForm();
    const marker = document.createComment("partner-form-" + formId);
    form.parentNode.insertBefore(marker, form);
    body.append(form); form.hidden = false;
    $("partnerModalTitle").textContent = title; modal.hidden = false;
    activePartnerForm = { form, marker }; document.body.style.overflow = "hidden";
  }
  function closePartnerForm() {
    if (!activePartnerForm) return;
    const { form, marker } = activePartnerForm;
    marker.parentNode?.insertBefore(form, marker); marker.remove(); form.hidden = true;
    $("partnerModal").hidden = true; $("partnerModalBody").replaceChildren();
    document.body.style.overflow = ""; activePartnerForm = null;
  }
  $("partnerModalClose")?.addEventListener("click", closePartnerForm);
  $("partnerModal")?.addEventListener("click", event => {
    if (event.target === $("partnerModal") || event.target.hasAttribute("data-close-partner-modal")) closePartnerForm();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closePartnerForm();
      closePartnerMessages();
      closePartnerPayments();
      closePartnerListModals();
    }
  });
  $("btnOpenStudentForm")?.addEventListener("click", () => openPartnerForm("partnerStudentForm", "Cadastrar aluno indicado"));
  $("btnOpenQuoteForm")?.addEventListener("click", () => openPartnerForm("partnerQuoteForm", "Montar orçamento"));
  const partnerListModalIds = [];
  function installPartnerListPopups() {
    const configs = [
      ["partnerReferrals", "Minhas indicações", "Abrir indicações"],
      ["partnerQuotes", "Meus orçamentos", "Abrir orçamentos"],
      ["partnerStudents", "Alunos aprovados", "Abrir alunos aprovados"],
      ["partnerCommissions", "Minhas comissões", "Abrir comissões"],
      ["partnerPayouts", "Histórico de pagamentos", "Abrir histórico de pagamentos"]
    ];
    configs.forEach(([tbodyId, title, buttonText]) => {
      const tbody = $(tbodyId);
      const section = tbody?.closest(".partner-section");
      const scroll = tbody?.closest(".partner-scroll");
      if (!tbody || !section || !scroll || section.dataset.popupReady === "true") return;
      section.dataset.popupReady = "true";
      const modal = document.createElement("div");
      modal.className = "partner-modal";
      modal.id = "partnerListModal_" + tbodyId;
      modal.hidden = true;
      const backdrop = document.createElement("div");
      backdrop.className = "partner-modal-backdrop";
      const dialog = document.createElement("section");
      dialog.className = "partner-modal-dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      const head = document.createElement("header");
      head.className = "partner-modal-head";
      const heading = document.createElement("h2");
      heading.textContent = title;
      const close = document.createElement("button");
      close.type = "button";
      close.className = "partner-modal-close";
      close.textContent = "✕";
      close.setAttribute("aria-label", "Fechar");
      const closeModal = () => {
        modal.hidden = true;
        if (!activePartnerForm && $("partnerMessagesModal").hidden && $("partnerPaymentsModal").hidden &&
            partnerListModalIds.every(id => $(id)?.hidden)) document.body.style.overflow = "";
      };
      close.addEventListener("click", closeModal);
      backdrop.addEventListener("click", closeModal);
      head.append(heading, close);
      dialog.append(head, scroll);
      modal.append(backdrop, dialog);
      document.body.append(modal);
      partnerListModalIds.push(modal.id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "partner-button secondary";
      button.textContent = buttonText;
      button.addEventListener("click", () => {
        partnerListModalIds.forEach(id => { if (id !== modal.id && $(id)) $(id).hidden = true; });
        modal.hidden = false;
        document.body.style.overflow = "hidden";
      });
      section.append(button);
    });
  }
  function closePartnerListModals() {
    partnerListModalIds.forEach(id => { if ($(id)) $(id).hidden = true; });
    if (!activePartnerForm && $("partnerMessagesModal").hidden && $("partnerPaymentsModal").hidden) {
      document.body.style.overflow = "";
    }
  }
  function closePartnerMessages() {
    $("partnerMessagesModal").hidden = true;
    if (!activePartnerForm && $("partnerPaymentsModal").hidden) document.body.style.overflow = "";
  }
  function closePartnerPayments() {
    $("partnerPaymentsModal").hidden = true;
    if (!activePartnerForm && $("partnerMessagesModal").hidden) document.body.style.overflow = "";
  }
  $("btnPartnerMessages")?.addEventListener("click", () => {
    closePartnerPayments();
    $("partnerMessagesModal").hidden = false;
    document.body.style.overflow = "hidden";
  });
  $("btnPartnerPayments")?.addEventListener("click", () => {
    closePartnerMessages();
    $("partnerPaymentsModal").hidden = false;
    document.body.style.overflow = "hidden";
  });
  $("partnerPaymentsClose")?.addEventListener("click", closePartnerPayments);
  $("partnerPaymentsModal")?.addEventListener("click", event => {
    if (event.target === $("partnerPaymentsModal") || event.target.hasAttribute("data-close-payments-modal")) closePartnerPayments();
  });
  $("partnerMessagesClose")?.addEventListener("click", closePartnerMessages);
  $("partnerMessagesModal")?.addEventListener("click", event => {
    if (event.target === $("partnerMessagesModal") || event.target.hasAttribute("data-close-messages-modal")) closePartnerMessages();
  });
  if (!client) { say("Não foi possível carregar a autenticação.", true); return; }
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError || !sessionData.session) { location.replace("index.html"); return; }
  const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", sessionData.session.user.id).maybeSingle();
  if (profileError || profile?.role !== "parceiro") { await client.auth.signOut({ scope: "local" }); location.replace("index.html"); return; }
  installPartnerListPopups();

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
    const notifications = $("partnerPaymentNotifications");
    target.replaceChildren();
    notifications.replaceChildren();
    const pending = rows.filter(item => !item.received_at);
    const badge = $("partnerPaymentsBadge");
    if (badge) {
      badge.textContent = String(pending.length);
      badge.hidden = pending.length === 0;
    }
    if (!pending.length) {
      const empty = document.createElement("p");
      empty.textContent = "Nenhum pagamento aguardando confirmação.";
      notifications.append(empty);
    } else {
      pending.forEach(item => {
        const card = document.createElement("article");
        card.className = "partner-message";
        const title = document.createElement("h3");
        title.textContent = "Pagamento de " + money(item.amount);
        const details = document.createElement("p");
        details.textContent = date(item.paid_at) + " · " +
          (({ pix: "PIX", dinheiro: "Dinheiro", transferencia: "Transferência", outro: "Outro" })[item.payment_method] || item.payment_method) +
          (item.reference ? " · " + item.reference : "");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "partner-button";
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
        card.append(title, details, button);
        notifications.append(card);
      });
    }
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
      action.textContent = item.received_at ? "Recebido em " + date(item.received_at) : "Aguardando confirmação";
      tr.append(action);
      target.append(tr);
    });
  }
  function populateQuoteControls(referrals, products) {
    const students = $("partnerQuoteStudent");
    const productSelect = $("partnerQuoteProduct");
    students.replaceChildren(new Option("Selecione um aluno", ""));
    referrals.filter(x => x.status !== "reprovado").forEach(item => {
      students.append(new Option(item.nome + (item.status === "aprovado" ? "" : " (aguardando aprovação)"), item.id));
    });
    productSelect.replaceChildren(new Option("Selecione um item", ""));
    products.forEach(item => {
      productSelect.append(new Option(item.nome + " — " + money(item.preco), item.id));
    });
    renderQuoteItems();
  }
  function renderQuoteItems() {
    const target = $("partnerQuoteItems");
    target.replaceChildren();
    if (!quoteItems.length) { target.textContent = "Nenhum item adicionado."; return; }
    let total = 0;
    quoteItems.forEach((item, index) => {
      total += item.subtotal;
      const row = document.createElement("div");
      row.className = "partner-message";
      const description = document.createElement("span");
      description.textContent = item.nome + " · " + item.quantidade + " × " + money(item.preco) + " = " + money(item.subtotal);
      const remove = document.createElement("button");
      remove.type = "button"; remove.className = "partner-button secondary"; remove.textContent = "Remover";
      remove.addEventListener("click", () => { quoteItems.splice(index, 1); renderQuoteItems(); });
      row.append(description, remove);
      target.append(row);
    });
    const totalLine = document.createElement("strong");
    totalLine.textContent = "Total estimado: " + money(total);
    target.append(totalLine);
  }
  async function load() {
    say("Carregando seus dados…");
    try {
      const data = await invoke("overview");
      $("partnerName").textContent = data.partner?.nome || "Área do Parceiro";
      $("partnerEmail").textContent = data.partner?.email || "";
      $("partnerPixKey").value = data.partner?.pix_key || "";
      availableProducts = data.products || [];
      const referrals = data.referrals || [];
      renderTable("partnerReferrals", referrals, [
        x => x.nome, x => x.categoria, x => ({ pendente_aprovacao: "Aguardando aprovação", aprovado: "Aprovado", reprovado: "Reprovado" })[x.status] || x.status,
        x => date(x.created_at)
      ], "Nenhuma indicação enviada.", 4);
      renderTable("partnerQuotes", data.quotes || [], [
        x => x.student_name, x => date(x.created_at), x => money(x.total),
        x => ({ pendente: "Aguardando aprovação", aprovado: "Aprovado", reprovado: "Reprovado", cancelado: "Cancelado" })[x.status] || x.status
      ], "Nenhum orçamento enviado.", 4);
      populateQuoteControls(referrals, availableProducts);
      $("partnerPending").textContent = money(data.totals?.pending);
      $("partnerAvailable").textContent = money(data.totals?.available);
      $("partnerPaid").textContent = money(data.totals?.paid);
      renderTable("partnerStudents", data.students || [], [
        x => x.nome, x => x.categoria, x => x.status, x => date(x.created_at)
      ], "Nenhum aluno indicado.", 4);
      renderTable("partnerCommissions", data.commissions || [], [
        x => x.descricao, x => x.student_name,
        x => x.status === "pago" ? "Acompanhamento encerrado" : Math.max(0, (x.lessons_required || 0) - (x.lessons_completed || 0)) + " restantes · " + (x.lessons_completed || 0) + "/" + (x.lessons_required || 0),
        x => money(x.commission_amount), x => x.status
      ], "Nenhuma comissão registrada.", 5);
      renderPayouts(data.payouts || []);
      const messages = $("partnerMessages"); messages.replaceChildren();
      const unreadMessages = (data.messages || []).filter(item => !item.read_at);
      const badge = $("partnerUpdatesBadge");
      if (badge) { badge.textContent = String(unreadMessages.length); badge.hidden = unreadMessages.length === 0; }
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
  $("btnPartnerRefresh")?.addEventListener("click", async () => {
    const button = $("btnPartnerRefresh");
    if (!button || button.disabled) return;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "Atualizando…";
    try { await load(); }
    finally { button.disabled = false; button.textContent = original; }
  });
  $("partnerStudentForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await invoke("create_student", {
        nome: $("referralName").value,
        telefone: $("referralPhone").value,
        cpf: $("referralCpf").value,
        endereco: $("referralAddress").value,
        categoria: $("referralCategory").value,
      });
      form.reset(); closePartnerForm();
      say(result.message || "Aluno enviado para aprovação.");
      await load();
    } catch (error) { say(error.message, true); }
    finally { button.disabled = false; }
  });
  $("partnerAddQuoteItem").addEventListener("click", () => {
    const product = availableProducts.find(x => x.id === $("partnerQuoteProduct").value);
    const quantity = Number($("partnerQuoteQuantity").value);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      say("Selecione um produto ou serviço e informe uma quantidade válida.", true);
      return;
    }
    const price = Number(product.preco || 0);
    if (price <= 0) { say("O item selecionado não possui preço válido.", true); return; }
    quoteItems.push({ product_id: product.id, nome: product.nome, preco: price, quantidade: quantity, subtotal: Math.round(price * quantity * 100) / 100 });
    renderQuoteItems();
    say("Item adicionado ao orçamento.");
  });
  $("partnerQuoteForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!quoteItems.length) { say("Adicione ao menos um item ao orçamento.", true); return; }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await invoke("create_quote", {
        partner_student_id: $("partnerQuoteStudent").value,
        items: quoteItems.map(item => ({ product_id: item.product_id, quantidade: item.quantidade })),
        observacoes: $("partnerQuoteNotes").value,
      });
      quoteItems = [];
      form.reset(); closePartnerForm();
      renderQuoteItems();
      say(result.message || "Orçamento enviado para aprovação.");
      await load();
    } catch (error) { say(error.message, true); }
    finally { button.disabled = false; }
  });
  $("partnerLogout").addEventListener("click", async () => {
    $("partnerLogout").disabled = true;
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) { say("Não foi possível encerrar a sessão.", true); $("partnerLogout").disabled = false; return; }
    location.replace("index.html");
  });
  await load();
  window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 30000);
})();