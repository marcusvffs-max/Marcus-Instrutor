"use strict";
(function () {
  const $ = id => document.getElementById(id);
  const statusEl = $("statusParceirosAdmin");
  const listEl = $("listaParceirosAdmin");
  let partners = [];
  let client = null;
  let ownerId = null;
  let initialized = false;
  let initializing = false;

  const say = (message, error = false) => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.state = error ? "error" : "ok";
  };
  const money = value => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const invoke = async (action, payload = {}) => {
    if (!client) throw new Error("Sessão administrativa indisponível.");
    const { data, error } = await client.functions.invoke("admin-manage-partners", { body: { action, ...payload } });
    if (error) {
      let detail = error.message || "Falha na comunicação com o módulo de parceiros.";
      try { const body = await error.context?.json?.(); if (body?.error) detail = body.error; } catch (_) {}
      throw new Error(detail);
    }
    if (data?.error) throw new Error(data.error);
    return data || {};
  };
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const statusLabel = value => ({ pendente: "Pendente", aprovado: "Aprovado", reprovado: "Reprovado", suspenso: "Suspenso" }[value] || value || "—");

  async function loadPartners() {
    say("Carregando parceiros…");
    listEl.replaceChildren(make("p", "empty-state", "Carregando…"));
    try {
      const result = await invoke("list");
      partners = Array.isArray(result.partners) ? result.partners : [];
      renderPartners();
      const referrals = Array.isArray(result.referrals) ? result.referrals : [];
      const quotes = Array.isArray(result.quotes) ? result.quotes : [];
      renderReferrals(referrals);
      renderQuotes(quotes);
      updatePartnerMenuBadge(referrals, quotes);
      await refreshPaymentPartners();
      say(partners.length ? partners.length + " parceiro(s) cadastrado(s)." : "Nenhum parceiro cadastrado ainda.");
    } catch (error) {
      listEl.replaceChildren(make("p", "empty-state", error.message));
      say(error.message, true);
    }
  }

  function updatePartnerMenuBadge(referrals, quotes) {
    const badge = $("badgeMenuParceiros");
    if (!badge) return;
    const count = referrals.filter(item => item.status === "pendente_aprovacao").length +
      quotes.filter(item => item.status === "pendente").length;
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count === 0;
    badge.setAttribute("aria-label", count + " atualizações pendentes em Parceiros");
  }

  function renderReferrals(rows) {
    rows = rows.filter(item => item.status === "pendente_aprovacao");
    const target = $("listaIndicacoesParceiros");
    if (!target) return;
    target.replaceChildren();
    if (!rows.length) { target.append(make("p", "empty-state", "Nenhuma indicação pendente.")); return; }
    rows.forEach(item => {
      const card = make("article", "partner-admin-card");
      card.append(make("strong", "", item.nome));
      card.append(make("p", "partner-admin-meta", [item.partner_name, item.telefone, item.cpf, item.categoria].filter(Boolean).join(" · ")));
      if (item.endereco) card.append(make("p", "partner-admin-meta", item.endereco));
      const actions = make("div", "partner-admin-actions");
      [["aprovado","Aprovar cadastro"],["reprovado","Reprovar"]].forEach(([status,label]) => {
        const button = make("button", "button button-secondary", label);
        button.type = "button";
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            const result = await invoke("review_student", { partner_student_id: item.id, status });
            say(result.message || "Indicação atualizada.");
            await loadPartners();
          } catch (error) { say(error.message, true); button.disabled = false; }
        });
        actions.append(button);
      });
      card.append(actions);
      target.append(card);
    });
  }

  function renderQuotes(rows) {
    const target = $("listaOrcamentosParceiros");
    if (!target) return;
    target.replaceChildren();
    if (!rows.length) { target.append(make("p", "empty-state", "Nenhum orçamento pendente.")); return; }
    rows.forEach(item => {
      const card = make("article", "partner-admin-card");
      card.append(make("strong", "", item.student_name + " · " + item.partner_name));
      (item.items || []).forEach(line => {
        card.append(make("p", "partner-admin-meta",
          line.descricao + " · " + line.quantidade + " × " + money(line.valor_unitario) +
          " = " + money(line.subtotal) + (line.tipo_item === "servico" ? " · " + line.aulas_contratadas + " aula(s)" : " · produto")));
      });
      card.append(make("p", "partner-admin-meta", "Total do orçamento: " + money(item.total)));
      if (item.observacoes) card.append(make("p", "partner-admin-meta", item.observacoes));
      const actions = make("div", "partner-admin-actions");
      [["aprovado","Aprovar orçamento"],["reprovado","Reprovar orçamento"]].forEach(([status,label]) => {
        const button = make("button", "button button-secondary", label);
        button.type = "button";
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            const result = await invoke("review_quote", { quote_id: item.id, status });
            say(result.message || "Orçamento atualizado.");
            await loadPartners();
          } catch (error) { say(error.message, true); button.disabled = false; }
        });
        actions.append(button);
      });
      card.append(actions);
      target.append(card);
    });
  }

  function renderPartners() {
    listEl.replaceChildren();
    if (!partners.length) {
      listEl.append(make("p", "empty-state", "Nenhum parceiro cadastrado."));
      return;
    }
    partners.forEach(partner => {
      const card = make("article", "partner-admin-card");
      const header = make("div", "partner-admin-card-head");
      if (partner.status === "aprovado") {
        const selectLabel = make("label", "partner-recipient-select");
        const recipient = make("input", ""); recipient.type = "checkbox"; recipient.value = partner.id; recipient.dataset.parceiroSelecionado = "true";
        selectLabel.append(recipient, document.createTextNode("Selecionar para comunicado"));
        card.append(selectLabel);
      }
      const identity = make("div", "");
      identity.append(make("strong", "", partner.nome), make("small", "", partner.email));
      const state = make("span", "partner-status partner-status-" + partner.status, statusLabel(partner.status));
      header.append(identity, state);
      const details = make("p", "partner-admin-meta", [partner.telefone, partner.cpf_cnpj].filter(Boolean).join(" · ") || "Sem telefone/documento");
      const pixLabel = make("label", "partner-pix-admin-label", "Chave PIX (administrador)");
      const pixInput = make("input", "");
      pixInput.type = "text"; pixInput.maxLength = 120; pixInput.value = partner.pix_key || "";
      pixLabel.append(pixInput);
      const savePix = make("button", "button button-secondary", "Salvar PIX");
      savePix.type = "button";
      savePix.addEventListener("click", async () => {
        savePix.disabled = true;
        try {
          const result = await invoke("update_pix_key", { partner_id: partner.id, pix_key: pixInput.value });
          partner.pix_key = result.pix_key || null;
          say("Chave PIX atualizada para " + partner.nome + ".");
        } catch (error) { say(error.message, true); }
        finally { savePix.disabled = false; }
      });
      const actions = make("div", "partner-admin-actions");
      const commissionLabel = make("label", "", "Comissão (%)");
      const commission = make("input", "");
      commission.type = "number"; commission.min = "0"; commission.max = "100"; commission.step = "0.01";
      commission.value = String(partner.commission_percent ?? 0);
      commissionLabel.append(commission);
      const saveCommission = make("button", "button button-secondary", "Salvar comissão");
      saveCommission.type = "button";
      saveCommission.addEventListener("click", async () => {
        saveCommission.disabled = true;
        try {
          await invoke("update_commission", { partner_id: partner.id, commission_percent: Number(commission.value) });
          partner.commission_percent = Number(commission.value);
          say("Comissão atualizada para " + partner.nome + ".");
        } catch (error) { say(error.message, true); }
        finally { saveCommission.disabled = false; }
      });
      const statusSelect = make("select", "partner-status-select");
      [["pendente","Pendente"],["aprovado","Aprovar"],["suspenso","Suspender"],["reprovado","Reprovar"]].forEach(([value,label]) => {
        const option = make("option", "", label); option.value = value; option.selected = value === partner.status; statusSelect.append(option);
      });
      const saveStatus = make("button", "button button-secondary", "Atualizar situação");
      saveStatus.type = "button";
      saveStatus.addEventListener("click", async () => {
        saveStatus.disabled = true;
        try {
          const result = await invoke("update_status", { partner_id: partner.id, status: statusSelect.value });
          partner.status = result.partner?.status || statusSelect.value;
          renderPartners();
          await refreshPaymentPartners();
          say("Situação de " + partner.nome + " atualizada.");
        } catch (error) { say(error.message, true); }
        finally { saveStatus.disabled = false; }
      });
      actions.append(commissionLabel, saveCommission, statusSelect, saveStatus);
      card.append(header, details, pixLabel, savePix, actions);
      if (!partner.user_id) card.append(make("small", "partner-admin-warning", "Convite ainda não vinculado a uma conta."));
      listEl.append(card);
    });
  }

  async function refreshPaymentPartners() {
    const select = $("selectParceiroPagamento");
    if (!select) return;
    select.replaceChildren();
    const placeholder = make("option", "", "Selecione um parceiro");
    placeholder.value = ""; select.append(placeholder);
    partners.filter(p => p.status === "aprovado").forEach(p => {
      const option = make("option", "", p.nome); option.value = p.id; select.append(option);
    });
    await loadAvailableCommissions();
  }

  async function loadAvailableCommissions() {
    const select = $("selectParceiroPagamento");
    const target = $("listaComissoesParceiro");
    if (!select || !target) return;
    target.replaceChildren();
    if (!select.value) { target.append(make("p", "empty-state", "Selecione um parceiro para consultar as comissões disponíveis.")); return; }
    try {
      const { data, error } = await client.from("partner_commissions")
        .select("id,descricao,commission_amount,created_at")
        .eq("owner_id", ownerId).eq("partner_id", select.value).eq("status", "disponivel")
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!data?.length) { target.append(make("p", "empty-state", "Nenhuma comissão disponível para pagamento.")); return; }
      data.forEach(item => {
        const label = make("label", "partner-commission-option");
        const input = make("input", ""); input.type = "checkbox"; input.value = item.id;
        const description = make("span", "", (item.descricao || "Comissão") + " — " + money(item.commission_amount));
        label.append(input, description); target.append(label);
      });
    } catch (error) { target.append(make("p", "empty-state", error.message)); }
  }

  async function invitePartner(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await invoke("invite", {
        nome: $("novoParceiroNome").value,
        email: $("novoParceiroEmail").value,
        telefone: $("novoParceiroTelefone").value,
        cpf_cnpj: $("novoParceiroDocumento").value,
        commission_percent: Number($("novaComissaoParceiro").value)
      });
      form.reset();
      $("novaComissaoParceiro").value = "5";
      $("modalCadastroParceiro").hidden = true;
      say(result.message || "Convite enviado.");
      await loadPartners();
    } catch (error) { say(error.message, true); }
    finally { button.disabled = false; }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const all = $("mensagemTodosParceiros").checked;
    const ids = [...document.querySelectorAll("[data-parceiro-selecionado]:checked")].map(input => input.value);
    if (!all && !ids.length) { say("Selecione ao menos um parceiro aprovado ou marque enviar para todos.", true); return; }
    button.disabled = true;
    try {
      const result = await invoke("send_message", {
        assunto: $("assuntoMensagemParceiros").value,
        mensagem: $("textoMensagemParceiros").value,
        todos_aprovados: all,
        partner_ids: all ? [] : ids
      });
      form.reset();
      say(result.message || "Mensagem enviada.");
    } catch (error) { say(error.message, true); }
    finally { button.disabled = false; }
  }

  async function openPayoutReport() {
    const modal = $("modalRelatorioPagamentosParceiros");
    const target = $("listaRelatorioPagamentosParceiros");
    const summary = $("resumoRelatorioPagamentosParceiros");
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    target.replaceChildren(make("p", "empty-state", "Carregando pagamentos…"));
    summary.textContent = "";
    try {
      const { data, error } = await client.from("partner_payouts")
        .select("id,partner_id,amount,payment_method,reference,paid_at,received_at")
        .eq("owner_id", ownerId).order("paid_at", { ascending: false });
      if (error) throw error;
      const rows = data || [];
      const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const confirmed = rows.filter(row => !!row.received_at).length;
      summary.textContent = rows.length + " pagamento(s) · Total " + money(total) +
        " · " + confirmed + " confirmado(s) · " + (rows.length - confirmed) + " aguardando confirmação";
      target.replaceChildren();
      if (!rows.length) {
        target.append(make("p", "empty-state", "Nenhum pagamento foi registrado."));
        return;
      }
      const tableWrap = make("div", "partner-report-scroll");
      const table = make("table", "partner-report-table");
      const thead = make("thead");
      const header = make("tr");
      ["Parceiro","Data do pagamento","Forma","Referência","Valor","Recebimento"].forEach(label => header.append(make("th","",label)));
      thead.append(header);
      const tbody = make("tbody");
      rows.forEach(row => {
        const partner = partners.find(item => item.id === row.partner_id);
        const tr = make("tr");
        [
          partner?.nome || "Parceiro",
          row.paid_at ? new Date(row.paid_at).toLocaleString("pt-BR") : "—",
          ({pix:"PIX",dinheiro:"Dinheiro",transferencia:"Transferência",outro:"Outro"})[row.payment_method] || row.payment_method || "—",
          row.reference || "—",
          money(row.amount),
          row.received_at ? "Confirmado em " + new Date(row.received_at).toLocaleString("pt-BR") : "Aguardando confirmação"
        ].forEach(value => tr.append(make("td","",value)));
        tbody.append(tr);
      });
      table.append(thead,tbody);
      tableWrap.append(table);
      target.append(tableWrap);
    } catch (error) {
      target.replaceChildren(make("p","empty-state",error.message));
      say(error.message,true);
    }
  }

  async function recordPayout(event) {
    event.preventDefault();
    const ids = [...document.querySelectorAll("#listaComissoesParceiro input:checked")].map(input => input.value);
    if (!ids.length) { say("Selecione as comissões que serão pagas.", true); return; }
    const button = $("btnRegistrarPagamentoParceiro");
    button.disabled = true;
    try {
      const result = await invoke("record_payout", {
        partner_id: $("selectParceiroPagamento").value,
        commission_ids: ids,
        payment_method: $("metodoPagamentoParceiro").value,
        reference: $("referenciaPagamentoParceiro").value
      });
      $("referenciaPagamentoParceiro").value = "";
      say(result.message || "Pagamento registrado.");
      await loadAvailableCommissions();
    } catch (error) { say(error.message, true); }
    finally { button.disabled = false; }
  }

  function installStyles() {
    if (document.getElementById("partner-admin-styles")) return;
    const style = document.createElement("style"); style.id = "partner-admin-styles";
    style.textContent = `.partner-report-scroll{overflow:auto}.partner-report-table{width:100%;border-collapse:collapse}.partner-report-table th,.partner-report-table td{text-align:left;padding:10px;border-bottom:1px solid #e2e8f0;font-size:.88rem;vertical-align:top}.partner-report-table th{color:#64748b;font-size:.76rem;text-transform:uppercase}@media print{body *{visibility:hidden!important}#modalRelatorioPagamentosParceiros,#modalRelatorioPagamentosParceiros *{visibility:visible!important}#modalRelatorioPagamentosParceiros{position:absolute!important;inset:0!important;display:block!important;background:#fff!important;padding:0!important}#modalRelatorioPagamentosParceiros .partner-modal-backdrop,#modalRelatorioPagamentosParceiros button{display:none!important}#modalRelatorioPagamentosParceiros .partner-modal-dialog{max-height:none!important;overflow:visible!important;box-shadow:none!important;width:100%!important;padding:0!important}}.partner-invite-launcher{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.partner-modal[hidden]{display:none}.partner-modal{position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px}.partner-modal-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.68)}.partner-modal-dialog{position:relative;z-index:1;width:min(100%,620px);max-height:90vh;overflow:auto;background:#fff;color:#172033;border-radius:18px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.28)}.partner-modal-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.partner-modal-head h3{margin:0}@media(max-width:520px){.partner-modal-dialog{padding:16px}.partner-invite-launcher{align-items:stretch}.partner-invite-launcher button{width:100%}}.partner-admin-card{border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin:10px 0;background:#fff}.partner-admin-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}.partner-admin-card-head strong,.partner-admin-card-head small{display:block}.partner-admin-card-head small,.partner-admin-meta{color:#64748b;margin:5px 0}.partner-status{border-radius:20px;padding:5px 10px;font-size:.78rem;font-weight:700;background:#eef2f7}.partner-status-aprovado{background:#dcfce7;color:#166534}.partner-status-pendente{background:#fef3c7;color:#92400e}.partner-status-suspenso,.partner-status-reprovado{background:#fee2e2;color:#991b1b}.partner-admin-actions{display:flex;align-items:end;gap:8px;flex-wrap:wrap;margin-top:12px}.partner-admin-actions label{display:grid;gap:5px;font-size:.85rem}.partner-admin-actions input,.partner-status-select{max-width:150px;padding:9px;border:1px solid #cbd5e1;border-radius:8px;font:inherit}.partner-admin-warning{display:block;color:#92400e;margin-top:9px}.partner-recipient-select,.partner-commission-option{display:flex;align-items:center;gap:9px;padding:8px 0;font-size:.9rem}.partner-recipient-select{margin-bottom:8px}`;
    document.head.append(style);
  }

  async function init() {
    if (initialized || initializing) return;
    const trigger = $("btnAtualizarParceiros");
    const openInvite = $("btnAbrirCadastroParceiro");
    const inviteModal = $("modalCadastroParceiro");
    const closeInvite = $("btnFecharCadastroParceiro");
    const invite = $("formNovoParceiro");
    const message = $("formMensagemParceiros");
    const payout = $("formPagamentoParceiro");
    const reportModal = $("modalRelatorioPagamentosParceiros");
    if (!trigger || !openInvite || !inviteModal || !closeInvite || !invite || !message || !payout || !reportModal) return;
    client = window.getMarcusSupabase?.();
    if (!client) { say("Cliente Supabase não encontrado.", true); return; }
    initializing = true;
    let authData, authError;
    try {
      ({ data: authData, error: authError } = await client.auth.getUser());
    } catch (error) {
      initializing = false;
      say(error.message || "Não foi possível validar a sessão administrativa.", true);
      return;
    }
    if (authError || !authData?.user?.id) { initializing = false; say("Sessão administrativa não encontrada.", true); return; }
    ownerId = authData.user.id;
    initialized = true;
    initializing = false;
    installStyles();
    trigger.addEventListener("click", loadPartners);
    const closeInviteModal = () => { inviteModal.hidden = true; };
    openInvite.addEventListener("click", () => { inviteModal.hidden = false; $("novoParceiroNome").focus(); });
    closeInvite.addEventListener("click", closeInviteModal);
    inviteModal.addEventListener("click", event => { if (event.target === inviteModal || event.target.hasAttribute("data-close-partner-modal")) closeInviteModal(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape") { if (!inviteModal.hidden) closeInviteModal(); if (!reportModal.hidden) closeReport(); } });
    invite.addEventListener("submit", invitePartner);
    message.addEventListener("submit", sendMessage);
    payout.addEventListener("submit", recordPayout);
    $("btnRelatorioPagamentosParceiros").addEventListener("click", openPayoutReport);
    const closeReport = () => { reportModal.hidden = true; if (inviteModal.hidden) document.body.style.overflow = ""; };
    $("btnFecharRelatorioPagamentosParceiros").addEventListener("click", closeReport);
    reportModal.addEventListener("click", event => { if (event.target === reportModal || event.target.hasAttribute("data-close-report")) closeReport(); });
    $("btnImprimirRelatorioPagamentosParceiros").addEventListener("click", () => window.print());
    $("selectParceiroPagamento").addEventListener("change", loadAvailableCommissions);
    $("mensagemTodosParceiros").addEventListener("change", event => {
      document.querySelectorAll("[data-parceiro-selecionado]").forEach(input => { input.disabled = event.target.checked; });
    });
    loadPartners();
    window.setInterval(() => { if (document.visibilityState === "visible") loadPartners(); }, 30000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  window.addEventListener("marcus-authenticated", init);
})();