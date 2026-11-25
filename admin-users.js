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
    .users-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px 16px;align-items:start;padding:16px;margin:12px 0;border:1px solid #d9e2ec;border-radius:14px;background:#fff;box-shadow:0 3px 14px rgba(15,23,42,.06)}
    .users-item[hidden]{display:none}
    .users-item-info{min-width:0;padding:2px 0}.users-item-info strong{display:block;font-size:1rem;color:#172033;overflow-wrap:anywhere}
    .users-item small{display:block;color:#64748b;margin-top:5px;overflow-wrap:anywhere}
    .users-role{align-self:start;font-size:.82rem;background:#eef2f7;padding:6px 10px;border-radius:20px;white-space:nowrap;font-weight:700}
    .users-item-actions{grid-column:1/-1;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding-top:12px;border-top:1px solid #e8edf3}
    .users-item-actions select{min-height:36px;max-width:190px;padding:7px 9px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#172033;font:inherit;font-size:.84rem}
    .users-item-actions button{border:0;border-radius:8px;padding:9px 11px;font:inherit;font-size:.82rem;font-weight:650;cursor:pointer}
    .users-link{background:#e0f2fe;color:#075985}
    @media(max-width:520px){.users-dialog{padding:16px}.users-item{grid-template-columns:minmax(0,1fr)}.users-role{justify-self:start}.users-item-actions{grid-column:1}.users-item-actions select{max-width:none;flex:1 1 100%}.users-item-actions button{flex:1 1 42%}}
    .users-resend{background:#e8edf3;color:#172033}.users-delete{background:#fee2e2;color:#991b1b}
    .users-access{display:block;margin-top:7px;font-size:.82rem;font-weight:700}.users-access.active{color:#16794b}.users-access.blocked{color:#b42318}.users-activate{background:#dbeafe;color:#12345a}
    .users-item-actions button:disabled{opacity:.55;cursor:wait}
    .users-filters{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 8px}
    .users-filter{border:1px solid #cbd5e1;background:#f8fafc;color:#334155;border-radius:20px;padding:8px 12px;font:inherit;font-size:.84rem;font-weight:600;cursor:pointer}
    .users-filter.active{background:#12345a;border-color:#12345a;color:#fff}
  `;
  document.head.appendChild(style);

  function create(tag, attrs = {}, text = "") {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    if (text) el.textContent = text;
    return el;
  }

  function confirmAction(message) {
    return new Promise(resolve => {
      const overlayConfirm = create("div", { class: "users-overlay", role: "dialog", "aria-modal": "true", "aria-labelledby": "usersConfirmTitle" });
      const dialogConfirm = create("div", { class: "users-dialog" });
      const titleConfirm = create("h2", { id: "usersConfirmTitle" }, "Confirmação");
      const safeMessage = String(message ?? "").replace(/\b(?:https?:\/\/|www\.)[^\s<]+/gi, "[link ocultado]");
      const textConfirm = create("p", {}, safeMessage);
      textConfirm.style.whiteSpace = "pre-line";
      textConfirm.style.overflowWrap = "anywhere";
      const actionsConfirm = create("div", { class: "users-actions" });
      actionsConfirm.style.justifyContent = "flex-end";
      const cancelConfirm = create("button", { class: "users-secondary", type: "button" }, "Cancelar");
      const acceptConfirm = create("button", { class: "users-primary", type: "button" }, "Confirmar");
      actionsConfirm.append(cancelConfirm, acceptConfirm);
      dialogConfirm.append(titleConfirm, textConfirm, actionsConfirm);
      overlayConfirm.append(dialogConfirm);
      document.body.append(overlayConfirm);

      let finished = false;
      const finish = value => {
        if (finished) return;
        finished = true;
        document.removeEventListener("keydown", onKey);
        overlayConfirm.remove();
        resolve(value);
      };
      const onKey = event => { if (event.key === "Escape") finish(false); };
      document.addEventListener("keydown", onKey);
      cancelConfirm.addEventListener("click", () => finish(false));
      acceptConfirm.addEventListener("click", () => finish(true));
      cancelConfirm.focus();
    });
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
  const filters = create("div", { class: "users-filters", role: "group", "aria-label": "Filtrar usuários por tipo de acesso" });
  const filterOptions = [
    ["todos", "Todos"],
    ["usuario", "Alunos"],
    ["instrutor", "Instrutores"],
    ["admin", "Administradores"],
  ];
  let activeUserFilter = "todos";

  function applyUserFilter() {
    filters.querySelectorAll("button[data-user-filter]").forEach((filterButton) => {
      const selected = filterButton.dataset.userFilter === activeUserFilter;
      filterButton.classList.toggle("active", selected);
      filterButton.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    list.querySelectorAll(".users-item[data-role]").forEach((item) => {
      item.hidden = activeUserFilter !== "todos" && item.dataset.role !== activeUserFilter;
    });
  }

  filterOptions.forEach(([value, label]) => {
    const filterButton = create("button", {
      class: "users-filter" + (value === activeUserFilter ? " active" : ""),
      type: "button",
      "data-user-filter": value,
      "aria-pressed": value === activeUserFilter ? "true" : "false"
    }, label);
    filterButton.addEventListener("click", () => {
      activeUserFilter = value;
      applyUserFilter();
    });
    filters.append(filterButton);
  });

  dialog.append(head, form, message, list);
  form.append(nameLabel, nameInput, emailLabel, emailInput, roleLabel, roleSelect, actions);
  overlay.append(dialog);
  document.body.append(overlay);

  function closeModal() {
    overlay.hidden = true;
    stopAccessCountdownRefresh();
  }
  close.addEventListener("click", closeModal);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) closeModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !overlay.hidden) closeModal(); });

  async function call(action, extra = {}) {
    // A gestão de usuários usa a função principal, que envia os e-mails
    // por SMTP e aceita origens Preview autorizadas. A função isolada de
    // Preview não possui o fluxo de envio de e-mails.
    const functionName = "admin-manage-instructors";
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: { action, ...extra },
    });
    if (error) {
      let detail = "";
      try {
        const context = error.context;
        if (context?.clone) {
          const payload = await context.clone().json();
          detail = payload?.error || payload?.message || "";
        } else if (context?.json) {
          const payload = await context.json();
          detail = payload?.error || payload?.message || "";
        }
      } catch (_) {
        try {
          const context = error.context;
          if (context?.clone) detail = (await context.clone().text()).trim();
        } catch (_) {}
      }
      throw new Error(detail || error.message || "Não foi possível concluir a solicitação.");
    }
    if (!data?.ok) throw new Error(data?.error || "Não foi possível concluir a solicitação.");
    return data;
  }

  let accessRefreshTimer = null;

  function accessDays(until) {
    if (!until) return null;
    const remaining = new Date(until).getTime() - Date.now();
    return remaining > 0 ? Math.ceil(remaining / 86400000) : 0;
  }

  function updateAccessCountdowns() {
    list.querySelectorAll("[data-access-until]").forEach((access) => {
      const until = access.dataset.accessUntil || null;
      const days = accessDays(until);
      access.classList.toggle("active", days > 0);
      access.classList.toggle("blocked", days === null || days === 0);
      access.textContent = days === null ? "Acesso bloqueado · ainda não liberado" :
        days === 0 ? "Acesso expirado · renovação necessária" :
        "Acesso liberado · faltam " + days + (days === 1 ? " dia" : " dias");
    });

    list.querySelectorAll("button[data-activate-until]").forEach((activate) => {
      const days = accessDays(activate.dataset.activateUntil || null);
      activate.textContent = days > 0 ? "Renovar 31 dias" : "Liberar por 31 dias";
    });
  }

  function startAccessCountdownRefresh() {
    if (accessRefreshTimer !== null) window.clearInterval(accessRefreshTimer);
    updateAccessCountdowns();
    accessRefreshTimer = window.setInterval(updateAccessCountdowns, 60_000);
  }

  function stopAccessCountdownRefresh() {
    if (accessRefreshTimer !== null) {
      window.clearInterval(accessRefreshTimer);
      accessRefreshTimer = null;
    }
  }

  async function loadUsers() {
    list.replaceChildren(create("strong", {}, "Usuários cadastrados"), filters);
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
        const item = create("div", { class: "users-item", "data-role": user.role || "sem-perfil" });
        const info = create("div", { class: "users-item-info" });
        info.append(create("strong", {}, user.nome || "Sem nome"));
        info.append(create("small", {}, user.email || "Sem e-mail"));
        if (user.role === "instrutor") {
          const days = accessDays(user.instructor_access_until);
          const access = create("span", {
            class: "users-access " + (days > 0 ? "active" : "blocked"),
            "data-access-until": user.instructor_access_until || ""
          });
          info.append(access);
        }
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
        let activate = null;
        if (user.role === "instrutor") {
          const days = accessDays(user.instructor_access_until);
          activate = create("button", {
            class: "users-activate",
            type: "button",
            "data-activate-until": user.instructor_access_until || ""
          }, days > 0 ? "Renovar 31 dias" : "Liberar por 31 dias");
          activate.addEventListener("click", async () => {
            const currentDays = accessDays(activate.dataset.activateUntil || null);
            const verb = currentDays > 0 ? "renovar" : "liberar";
            if (!await confirmAction("Deseja " + verb + " o acesso de " + (user.nome || user.email) + " por mais 31 dias?")) return;
            activate.disabled = true;
            activate.textContent = "Ativando...";
            try {
              const result = await call("activate_access", { user_id: user.id });
              message.textContent = result.message || "Acesso liberado por 31 dias.";
              await loadUsers();
            } catch (error) {
              message.textContent = error.message;
              activate.disabled = false;
              updateAccessCountdowns();
            }
          });
        }
        const remove = create("button", { class: "users-delete", type: "button" }, "Excluir");
        let linkStudent = null;
        if (user.role === "usuario") {
          linkStudent = create("button", { class: "users-link", type: "button" }, "Vincular aluno");
          linkStudent.addEventListener("click", async () => {
            const email = String(user.email || "").trim();
            if (!email) { message.textContent = "Esta conta não possui e-mail para localizar o cadastro do aluno."; return; }
            linkStudent.disabled = true;
            linkStudent.textContent = "Localizando...";
            try {
              const { data: authResult, error: authError } = await supabase.auth.getUser();
              if (authError || !authResult?.user?.id) throw new Error("Não foi possível identificar a conta administradora.");
              const { data: matches, error: lookupError } = await supabase.from("students")
                .select("id,nome,user_id").eq("owner_id", authResult.user.id).ilike("email", email).limit(2);
              if (lookupError) throw lookupError;
              if (!matches?.length) throw new Error("Não encontrei, na sua conta, um cadastro de aluno com o e-mail " + email + ".");
              if (matches.length > 1) throw new Error("Há mais de um cadastro de aluno com esse e-mail. Corrija a duplicidade antes de vincular.");
              const student = matches[0];
              if (student.user_id === user.id) { message.textContent = "A conta já está vinculada ao cadastro de " + student.nome + "."; return; }
              if (student.user_id) throw new Error("O cadastro de " + student.nome + " já está vinculado a outra conta. Nenhuma alteração foi feita.");
              if (!await confirmAction("Foi encontrado o cadastro de " + student.nome + " pelo e-mail " + email + ". Enviar um link para o titular confirmar o vínculo? A associação só será concluída depois que o próprio aluno confirmar pelo e-mail.")) return;
              linkStudent.textContent = "Enviando...";
              const result = await call("invite_student", { student_id: student.id });
              message.textContent = result.message || "Link de confirmação enviado. O aluno precisa confirmar para concluir o vínculo.";
              await loadUsers();
            } catch (error) {
              message.textContent = error.message || "Não foi possível iniciar o vínculo do aluno.";
            } finally {
              if (linkStudent?.isConnected) { linkStudent.disabled = false; linkStudent.textContent = "Vincular aluno"; }
            }
          });
        }
        saveRole.addEventListener("click", async () => {
          if (roleEditor.value === user.role) {
            message.textContent = "Esse usuário já possui esse tipo de acesso.";
            return;
          }
          const selectedLabel = roleEditor.options[roleEditor.selectedIndex].textContent;
          if (!await confirmAction(`Alterar o acesso de ${user.nome || user.email} para ${selectedLabel}?`)) return;
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
          if (!await confirmAction(`Enviar um novo link de acesso para ${user.email}?`)) return;
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
          if (!await confirmAction(`Tem certeza de que deseja excluir o usuário ${user.nome || user.email}? Essa ação não pode ser desfeita.`)) return;
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
        controls.append(roleEditor, saveRole);
        if (activate) controls.append(activate);
        controls.append(resend);
        if (linkStudent) controls.append(linkStudent);
        controls.append(remove);
        item.append(info, role, controls);
        list.append(item);
      });
      applyUserFilter();
    } catch (error) {
      loading.textContent = error.message;
    }
  }

  button.addEventListener("click", async () => {
    overlay.hidden = false;
    message.textContent = "";
    await loadUsers();
    if (!overlay.hidden) startAccessCountdownRefresh();
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
