(() => {
  "use strict";
  const supabase = window.getMarcusSupabase?.();
  const button = document.getElementById("btnUsuarios");
  if (!supabase || !button || button.dataset.usersReady === "1") return;
  button.dataset.usersReady = "1";

  const style = document.createElement("style");
  style.textContent = `
    .users-overlay[hidden]{display:none}.users-overlay{position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.62);display:flex;align-items:center;justify-content:center;padding:16px}
    .users-dialog{background:#fff;color:#172033;width:min(100%,620px);max-height:90vh;overflow:auto;border-radius:18px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.25)}
    .users-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}
    .users-head h2{margin:0;font-size:1.25rem}.users-close{border:0;background:#eef2f7;border-radius:9px;padding:9px 12px;font-size:1.1rem}
    .users-form{display:grid;gap:10px}.users-form label{font-weight:600;font-size:.92rem}.users-form input,.users-form select{width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:9px;font:inherit;background:#fff;color:#172033}
    .users-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}.users-actions button{border:0;border-radius:9px;padding:11px 15px;font:inherit;font-weight:600;cursor:pointer}
    .users-primary{background:#12345a;color:#fff}.users-secondary{background:#e8edf3;color:#172033}
    .users-message{min-height:22px;margin:8px 0;color:#334155}.users-list{margin-top:22px;border-top:1px solid #e2e8f0;padding-top:16px}
    .users-item{padding:12px 0;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .users-item small{display:block;color:#64748b;margin-top:3px}.users-role{font-size:.82rem;background:#eef2f7;padding:4px 8px;border-radius:20px;white-space:nowrap}
    .users-item-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
    .users-item-actions button{border:0;border-radius:8px;padding:8px 10px;font:inherit;font-size:.82rem;font-weight:600;cursor:pointer}
    .users-resend{background:#e8edf3;color:#172033}.users-delete{background:#fee2e2;color:#991b1b}
    .users-item-actions button:disabled{opacity:.55;cursor:wait}
  `;
  document.head.appendChild(style);

  function create(tag, attrs = {}, text = "") {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    if (text) el.textContent = text;
    return el;
  }

  const overlay = create("div", { class: "users-overlay", role: "dialog", "aria-modal": "true", "aria-labelledby": "usersTitle" });
  overlay.hidden = true;
  const dialog = create("div", { class: "users-dialog" });
  const head = create("div", { class: "users-head" });
  head.append(create("h2", { id: "usersTitle" }, "Gerenciar usuários"));
  const close = create("button", { class: "users-close", type: "button", "aria-label": "Fechar" }, "✕");
  head.append(close);
  const form = create("form", { class: "users-form" });
  const nameLabel = create("label", { for: "usersName" }, "Nome completo");
  const nameInput = create("input", { id: "usersName", name: "nome", type: "text", maxlength: "100", required: "required", placeholder: "Nome do usuário" });
  const emailLabel = create("label", { for: "usersEmail" }, "E-mail");
  const emailInput = create("input", { id: "usersEmail", name: "email", type: "email", maxlength: "254", required: "required", placeholder: "email@exemplo.com" });
  const roleLabel = create("label", { for: "usersRole" }, "Tipo de acesso");
  const roleSelect = create("select", { id: "usersRole", name: "role" });
  roleSelect.append(
    create("option", { value: "instrutor" }, "Instrutor"),
    create("option", { value: "usuario" }, "Aluno"),
    create("option", { value: "admin" }, "Administrador")
  );
  const actions = create("div", { class: "users-actions" });
  const send = create("button", { class: "users-primary", type: "submit" }, "Enviar convite");
  const refresh = create("button", { class: "users-secondary", type: "button" }, "Atualizar lista");
  actions.append(send, refresh);
  const message = create("p", { class: "users-message", role: "status", "aria-live": "polite" });
  const list = create("div", { class: "users-list" });
  list.append(create("strong", {}, "Usuários cadastrados"));
  dialog.append(head, form, message, list);
  form.append(nameLabel, nameInput, emailLabel, emailInput, roleLabel, roleSelect, actions);
  overlay.append(dialog);
  document.body.append(overlay);

  function closeModal() { overlay.hidden = true; }
  close.addEventListener("click", closeModal);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) closeModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !overlay.hidden) closeModal(); });

  async function call(action, extra = {}) {
    const { data, error } = await supabase.functions.invoke("admin-manage-instructors", {
      body: { action, ...extra },
    });
    if (error) {
      let detail = "";
      try { detail = (await error.context.json()).error || ""; } catch (_) {}
      throw new Error(detail || "Não foi possível concluir a solicitação.");
    }
    if (!data?.ok) throw new Error(data?.error || "Não foi possível concluir a solicitação.");
    return data;
  }

  async function loadUsers() {
    list.replaceChildren(create("strong", {}, "Usuários cadastrados"));
    const loading = create("p", {}, "Carregando...");
    list.append(loading);
    try {
      const result = await call("list");
      loading.remove();
      if (!result.users.length) {
        list.append(create("p", {}, "Nenhum usuário encontrado."));
        return;
      }
      result.users.forEach((user) => {
        const item = create("div", { class: "users-item" });
        const info = create("div");
        info.append(create("strong", {}, user.nome || "Sem nome"));
        info.append(create("small", {}, user.email || "Sem e-mail"));
        const role = create("span", { class: "users-role" }, user.role === "admin" ? "Administrador" : user.role === "instrutor" ? "Instrutor" : user.role === "usuario" ? "Aluno" : "Sem perfil");
        const controls = create("div", { class: "users-item-actions" });
        const roleEditor = create("select", { "aria-label": "Alterar tipo de acesso de " + (user.nome || user.email) });
        [
          ["instrutor", "Instrutor"],
          ["usuario", "Aluno"],
          ["admin", "Administrador"],
        ].forEach(([value, label]) => {
          const option = create("option", { value }, label);
          if (value === user.role) option.selected = true;
          roleEditor.append(option);
        });
        const saveRole = create("button", { class: "users-resend", type: "button" }, "Salvar acesso");
        const resend = create("button", { class: "users-resend", type: "button" }, "Reenviar acesso");
        const remove = create("button", { class: "users-delete", type: "button" }, "Excluir");
        saveRole.addEventListener("click", async () => {
          if (roleEditor.value === user.role) {
            message.textContent = "Esse usuário já possui esse tipo de acesso.";
            return;
          }
          const selectedLabel = roleEditor.options[roleEditor.selectedIndex].textContent;
          if (!window.confirm(`Alterar o acesso de ${user.nome || user.email} para ${selectedLabel}?`)) return;
          saveRole.disabled = true;
          saveRole.textContent = "Salvando...";
          try {
            const result = await call("change_role", { user_id: user.id, role: roleEditor.value });
            message.textContent = result.message || "Tipo de acesso alterado com sucesso.";
            await loadUsers();
          } catch (error) {
            message.textContent = error.message;
            saveRole.disabled = false;
            saveRole.textContent = "Salvar acesso";
          }
        });
        resend.addEventListener("click", async () => {
          if (!window.confirm(`Enviar um novo link de acesso para ${user.email}?`)) return;
          resend.disabled = true;
          resend.textContent = "Enviando...";
          try {
            const result = await call("resend", { user_id: user.id });
            message.textContent = result.message || "Novo link de acesso enviado.";
          } catch (error) {
            message.textContent = error.message;
          } finally {
            resend.disabled = false;
            resend.textContent = "Reenviar acesso";
          }
        });
        remove.addEventListener("click", async () => {
          if (!window.confirm(`Tem certeza de que deseja excluir o usuário ${user.nome || user.email}? Essa ação não pode ser desfeita.`)) return;
          remove.disabled = true;
          remove.textContent = "Excluindo...";
          try {
            const result = await call("delete", { user_id: user.id });
            message.textContent = result.message || "Usuário excluído.";
            await loadUsers();
          } catch (error) {
            message.textContent = error.message;
            remove.disabled = false;
            remove.textContent = "Excluir";
          }
        });
        controls.append(roleEditor, saveRole, resend, remove);
        item.append(info, role, controls);
        list.append(item);
      });
    } catch (error) {
      loading.textContent = error.message;
    }
  }

  button.addEventListener("click", async () => {
    overlay.hidden = false;
    message.textContent = "";
    await loadUsers();
    nameInput.focus();
  });

  refresh.addEventListener("click", loadUsers);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    send.disabled = true;
    send.textContent = "Enviando...";
    message.textContent = "";
    try {
      const result = await call("invite", {
        nome: nameInput.value.trim(),
        email: emailInput.value.trim(),
        role: roleSelect.value,
      });
      message.textContent = result.message || "Convite enviado com sucesso.";
      form.reset();
      await loadUsers();
    } catch (error) {
      message.textContent = error.message;
    } finally {
      send.disabled = false;
      send.textContent = "Enviar convite";
    }
  });
})();
