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
      await refreshPaymentPartners();
      say(partners.length ? partners.length + " parceiro(s) cadastrado(s)." : "Nenhum parceiro cadastrado ainda.");
    } catch (error) {
      listEl.replaceChildren(make("p", "empty-state", error.message));
      say(error.message, true);
    }
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
      card.append(header, details, actions);
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
    style.textContent = `.partner-admin-card{border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin:10px 0;background:#fff}.partner-admin-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}.partner-admin-card-head strong,.partner-admin-card-head small{display:block}.partner-admin-card-head small,.partner-admin-meta{color:#64748b;margin:5px 0}.partner-status{border-radius:20px;padding:5px 10px;font-size:.78rem;font-weight:700;background:#eef2f7}.partner-status-aprovado{background:#dcfce7;color:#166534}.partner-status-pendente{background:#fef3c7;color:#92400e}.partner-status-suspenso,.partner-status-reprovado{background:#fee2e2;color:#991b1b}.partner-admin-actions{display:flex;align-items:end;gap:8px;flex-wrap:wrap;margin-top:12px}.partner-admin-actions label{display:grid;gap:5px;font-size:.85rem}.partner-admin-actions input,.partner-status-select{max-width:150px;padding:9px;border:1px solid #cbd5e1;border-radius:8px;font:inherit}.partner-admin-warning{display:block;color:#92400e;margin-top:9px}.partner-recipient-select,.partner-commission-option{display:flex;align-items:center;gap:9px;padding:8px 0;font-size:.9rem}.partner-recipient-select{margin-bottom:8px}`;
    document.head.append(style);
  }

  async function init() {
    if (initialized || initializing) return;
    const trigger = $("btnAtualizarParceiros");
    const invite = $("formNovoParceiro");
    const message = $("formMensagemParceiros");
    const payout = $("formPagamentoParceiro");
    if (!trigger || !invite || !message || !payout) return;
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
    invite.addEventListener("submit", invitePartner);
    message.addEventListener("submit", sendMessage);
    payout.addEventListener("submit", recordPayout);
    $("selectParceiroPagamento").addEventListener("change", loadAvailableCommissions);
    $("mensagemTodosParceiros").addEventListener("change", event => {
      document.querySelectorAll("[data-parceiro-selecionado]").forEach(input => { input.disabled = event.target.checked; });
    });
    loadPartners();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  window.addEventListener("marcus-authenticated", init);
})();