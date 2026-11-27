"use strict";

(function () {
  const hostPreview = window.location.hostname;
  const USAR_SUPABASE_QA = hostPreview === "marcusinstrutor-git-feature-acessos-alun-ffc22b-marcusvffs-2839.vercel.app" ||
    hostPreview === "marcusinstrutor-git-feature-relatorios-i-bc78ff-marcusvffs-2839.vercel.app" || /^marcusinstrutor-[a-z0-9]{9}-marcusvffs-2839\.vercel\.app$/.test(hostPreview);
  const SUPABASE_URL = USAR_SUPABASE_QA ? "https://voyjssflroiwdyaacthh.supabase.co" : "https://ydyqagqsuqntuibzgwzd.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = USAR_SUPABASE_QA ? "sb_publishable_YpDyl5xJknD9NJ-i2fDn9Q_F4jjkLm9" : "sb_publishable_hgqXLoA9BQvZy0L3dEEJ-A_WfoUq7tU";

  const el = id => document.getElementById(id);
  const state = {
    supabase: null,
    user: null,
    profile: null,
    students: [],
    studentLinkFieldsAvailable: false,
    lessons: [],
    vehicles: [],
    transactions: [],
    products: [],
    fixedItemPrices: { aluguel: 0, cartao: 0 },
    sales: [],
    saleItems: [],
    rentalCreditAvailability: new Map(),
    refundSaleId: null,
    productSearch: "",
    productEditingId: null,
    saleCart: [],
    pendingSaleId: null,
    pendingSaleFingerprint: null,
    financialSearch: "",
    studentEditingId: null,
    studentSearch: "",
    vehicleEditingId: null,
    vehicleSearch: "",
    lessonEditingId: null,
    lessonSearch: "",
    lessonStatusFilter: "",
    logoUrl: "",
    contractorProfile: null
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[char]);
  }

  let activeInstructorModal = null;

  function openInstructorModal(formId) {
    const form = el(formId);
    if (!form) return;
    if (activeInstructorModal) closeInstructorModal();
    const placeholder = document.createComment("form-" + formId);
    form.parentNode.insertBefore(placeholder, form);
    const overlay = document.createElement("div");
    overlay.className = "instructor-modal-overlay";
    const dialog = document.createElement("section");
    dialog.className = "instructor-modal-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const header = document.createElement("div");
    header.className = "instructor-modal-header";
    const title = document.createElement("h2");
    title.textContent = form.querySelector("h4")?.textContent || "Cadastro";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "instructor-modal-close";
    close.setAttribute("aria-label", "Fechar");
    close.textContent = "×";
    header.append(title, close);
    dialog.append(header, form);
    overlay.append(dialog);
    document.body.append(overlay);
    form.hidden = false;
    form.classList.add("instructor-modal-form");
    document.body.classList.add("instructor-modal-open");
    const onKeyDown = event => { if (event.key === "Escape") closeInstructorModal(formId); };
    activeInstructorModal = { form, placeholder, overlay, onKeyDown };
    close.addEventListener("click", () => closeInstructorModal(formId));
    overlay.addEventListener("click", event => {
      if (event.target === overlay) closeInstructorModal(formId);
    });
    document.addEventListener("keydown", onKeyDown);
  }

  function closeInstructorModal(formId = null) {
    const modal = activeInstructorModal;
    if (!modal || (formId && modal.form.id !== formId)) return;
    document.removeEventListener("keydown", modal.onKeyDown);
    if (modal.placeholder.parentNode) {
      modal.placeholder.parentNode.insertBefore(modal.form, modal.placeholder);
      modal.placeholder.remove();
    }
    modal.form.classList.remove("instructor-modal-form");
    modal.form.hidden = true;
    modal.overlay.remove();
    document.body.classList.remove("instructor-modal-open");
    activeInstructorModal = null;
  }

  function semLinksIndesejados(message) {
    return String(message ?? "").replace(/\b(?:https?:\/\/|www\.)[^\s<]+/gi, "[link ocultado]");
  }

  function showMessage(message, isError = true) {
    const target = el("mensagem");
    if (!target) return;
    target.textContent = semLinksIndesejados(message);
    target.style.color = isError ? "#a12b2b" : "#16794b";
  }

  function confirmAction(message) {
    return new Promise(resolve => {
      const styleId = "marcus-safe-confirm-style";
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
          .marcus-confirm-overlay{position:fixed;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.62)}
          .marcus-confirm-dialog{width:min(100%,440px);padding:22px;border-radius:16px;background:#fff;color:#172033;box-shadow:0 20px 60px rgba(0,0,0,.25)}
          .marcus-confirm-dialog p{margin:0;white-space:pre-line;overflow-wrap:anywhere;line-height:1.5}
          .marcus-confirm-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}
          .marcus-confirm-actions button{border:0;border-radius:9px;padding:11px 16px;font:inherit;font-weight:650;cursor:pointer}
          .marcus-confirm-cancel{background:#e8edf3;color:#172033}
          .marcus-confirm-ok{background:#198754;color:#fff;border:1px solid #198754}
        `;
        document.head.appendChild(style);
      }

      const overlay = document.createElement("div");
      overlay.className = "marcus-confirm-overlay";
      const dialog = document.createElement("section");
      dialog.className = "marcus-confirm-dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-describedby", "marcusConfirmText");
      const title = document.createElement("h2");
      const text = document.createElement("p");
      text.id = "marcusConfirmText";
      text.textContent = semLinksIndesejados(message);
      const actions = document.createElement("div");
      actions.className = "marcus-confirm-actions";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "marcus-confirm-cancel";
      cancel.textContent = "Cancelar";
      const accept = document.createElement("button");
      accept.type = "button";
      accept.className = "marcus-confirm-ok";
      accept.textContent = "Confirmar";
      actions.append(cancel, accept);
      dialog.append(text, actions);
      overlay.append(dialog);
      document.body.appendChild(overlay);

      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      let finished = false;
      const finish = value => {
        if (finished) return;
        finished = true;
        document.removeEventListener("keydown", onKey);
        overlay.remove();
        document.body.style.overflow = previousOverflow;
        resolve(value);
      };
      const onKey = event => { if (event.key === "Escape") finish(false); };
      document.addEventListener("keydown", onKey);
      cancel.addEventListener("click", () => finish(false));
      accept.addEventListener("click", () => finish(true));
      cancel.focus();
    });
  }

  function localToday() {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }


  function applyInstructorTheme(primary, secondary) {
    const mainColor = /^#[0-9a-f]{6}$/i.test(primary || "") ? primary : "#12345a";
    const backgroundColor = /^#[0-9a-f]{6}$/i.test(secondary || "") ? secondary : "#f3f6fa";
    document.documentElement.style.setProperty("--primary", mainColor);
    document.documentElement.style.setProperty("--primary-hover", mainColor);
    document.documentElement.style.setProperty("--background", backgroundColor);
  }

  function validateInstructorLogo(file) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      throw new Error("Use uma imagem PNG, JPG ou WEBP.");
    }
    if (file.size > 2 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 2 MB.");
  }

  function renderInstructorLogo(url) {
    const preview = el("logoInstrutorPreview");
    const removeButton = el("btnRemoverLogoInstrutor");
    if (preview) {
      preview.src = url || "";
      preview.hidden = !url;
    }
    if (removeButton) removeButton.hidden = !url;
    state.logoUrl = url || "";
  }

  async function loadInstructorSettings() {
    const { data, error } = await state.supabase
      .from("app_settings")
      .select("nome_empresa,cor_principal,cor_secundaria,logo_url,contratante_nome,contratante_documento,contratante_celular,contratante_endereco")
      .eq("owner_id", state.user.id)
      .maybeSingle();
    if (error) throw error;

    state.contractorProfile = data || {};
    const name = data?.contratante_nome || data?.nome_empresa || state.profile?.nome || state.user.email || "Instrutor";
    const primary = data?.cor_principal || "#12345a";
    const secondary = data?.cor_secundaria || "#f3f6fa";
    el("nomePerfilInstrutor").value = name;
    el("corPrincipalInstrutor").value = primary;
    el("corSecundariaInstrutor").value = secondary;
    el("nomeInstrutor").textContent = name;
    renderInstructorLogo(data?.logo_url || "");
    applyInstructorTheme(primary, secondary);
  }

  async function saveInstructorSettings() {
    const button = el("btnSalvarConfiguracoesInstrutor");
    const name = el("nomePerfilInstrutor").value.trim();
    const primary = el("corPrincipalInstrutor").value;
    const secondary = el("corSecundariaInstrutor").value;
    const file = el("logoInstrutorArquivo")?.files?.[0] || null;
    if (!name) {
      showMessage("Informe seu nome para salvar as configurações.");
      el("nomePerfilInstrutor").focus();
      return;
    }

    button.disabled = true;
    button.textContent = "Salvando...";
    showMessage("");
    try {
      validateInstructorLogo(file);
      let logoUrl = state.logoUrl || null;
      if (file) {
        const path = state.user.id + "/logo";
        const { error: uploadError } = await state.supabase.storage
          .from("instructor-logos")
          .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
        if (uploadError) throw uploadError;
        const { data: publicData } = state.supabase.storage.from("instructor-logos").getPublicUrl(path);
        logoUrl = publicData?.publicUrl || null;
        if (!logoUrl) throw new Error("Não foi possível obter o endereço da logomarca.");
      }

      const { error: profileError } = await state.supabase
        .from("profiles")
        .update({ nome: name })
        .eq("id", state.user.id);
      if (profileError) throw profileError;

      const { error: settingsError } = await state.supabase
        .from("app_settings")
        .upsert({
          owner_id: state.user.id,
          nome_empresa: name,
          cor_principal: primary,
          cor_secundaria: secondary,
          logo_url: logoUrl
        }, { onConflict: "owner_id" });
      if (settingsError) throw settingsError;

      state.profile.nome = name;
      el("nomeInstrutor").textContent = name;
      renderInstructorLogo(logoUrl);
      applyInstructorTheme(primary, secondary);
      showMessage("Seu perfil, cores e logomarca foram salvos.", false);
    } catch (error) {
      console.error("Falha ao salvar perfil e aparência do instrutor:", error);
      showMessage(error?.message || "Não foi possível salvar as configurações. Confira sua conexão e tente novamente.");
    } finally {
      button.disabled = false;
      button.textContent = "Salvar alterações";
    }
  }

  async function removeInstructorLogo() {
    if (!state.logoUrl) return;
    if (!(await confirmAction("Deseja remover a logomarca desta conta?"))) return;
    const button = el("btnRemoverLogoInstrutor");
    if (button) { button.disabled = true; button.textContent = "Removendo..."; }
    try {
      const path = state.user.id + "/logo";
      const { error: storageError } = await state.supabase.storage.from("instructor-logos").remove([path]);
      if (storageError) throw storageError;
      const { error } = await state.supabase.from("app_settings")
        .update({ logo_url: null }).eq("owner_id", state.user.id);
      if (error) throw error;
      renderInstructorLogo("");
      const input = el("logoInstrutorArquivo");
      if (input) input.value = "";
      showMessage("Logomarca removida desta conta.", false);
    } catch (error) {
      console.error("Falha ao remover logomarca do instrutor:", error);
      showMessage("Não foi possível remover a logomarca. Tente novamente.");
    } finally {
      if (button) { button.disabled = false; button.textContent = "Remover logomarca"; }
    }
  }


  function formatDate(value) {
    if (!value) return "";
    const date = String(value).slice(0, 10);
    const parts = date.split("-");
    return parts.length === 3 ? parts.reverse().join("/") : date;
  }

  function currency(value) { return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

  function studentName(id) {
    const student = state.students.find(item => item.id === id);
    return student ? student.nome : "Aluno não encontrado";
  }

  function vehicleName(id) {
    if (!id) return "—";
    const vehicle = state.vehicles.find(item => item.id === id);
    return vehicle ? vehicleLabel(vehicle) : "—";
  }

  function sortLessons(items) {
    return [...items].sort((a, b) =>
      String(a.data_aula || "").localeCompare(String(b.data_aula || "")) ||
      String(a.horario || "").localeCompare(String(b.horario || ""))
    );
  }

  function studentStatusLabel(status) {
    const labels = {
      em_aberto: "Em aberto",
      finalizado: "Finalizado",
      aprovado: "Aprovado"
    };
    return labels[status] || status || "Em aberto";
  }

  function lessonStatusLabel(status) {
    const labels = { agendada: "Agendada", realizada: "Realizada", cancelada: "Cancelada" };
    return labels[String(status || "").toLowerCase()] || status || "—";
  }

  function renderStudents() {
    const container = el("listaAlunos");
    const counter = el("contadorAlunos");
    const term = String(state.studentSearch || "").trim().toLocaleLowerCase("pt-BR");
    const filtered = state.students.filter(student => {
      const searchable = [
        student.nome, student.email, student.telefone, student.cpf,
        student.categoria, studentStatusLabel(student.status)
      ].join(" ").toLocaleLowerCase("pt-BR");
      return !term || searchable.includes(term);
    });

    if (counter) {
      counter.textContent = state.students.length + (state.students.length === 1 ? " aluno cadastrado" : " alunos cadastrados");
    }
    if (!state.students.length) {
      container.innerHTML = '<div class="empty-state">Você ainda não cadastrou alunos. Use “+ Novo aluno” para começar.</div>';
      return;
    }
    if (!filtered.length) {
      container.innerHTML = '<div class="empty-state">Nenhum aluno encontrado para essa busca.</div>';
      return;
    }

    container.innerHTML = filtered.map(student => {
      const status = String(student.status || "em_aberto").toLowerCase();
      const statusClass = status === "aprovado" ? "student-status-approved" :
        status === "finalizado" ? "student-status-finished" : "student-status-open";
      const inviteTimestamp = student.invited_at ? new Date(student.invited_at).getTime() : NaN;
      const inviteAge = Date.now() - inviteTimestamp;
      const invitePending = Boolean(student.invited_at) && Number.isFinite(inviteTimestamp) && inviteAge >= 0 && inviteAge < 15 * 60 * 1000;
      const accountStatus = !state.studentLinkFieldsAvailable
        ? "Vínculo indisponível durante a atualização"
        : student.user_id ? (student.invited_at ? "Conta vinculada · aguardando primeiro acesso" : "Conta vinculada")
        : invitePending ? "Link enviado · aguardando confirmação do aluno"
        : student.invited_at ? "Solicitação expirada · pode reenviar" : "Sem convite";
      const accountClass = state.studentLinkFieldsAvailable && invitePending ? "student-status-open" :
        state.studentLinkFieldsAvailable && student.user_id ? "student-status-approved" : "";
      const inviteButton = !state.studentLinkFieldsAvailable
        ? ""
        : student.user_id
          ? student.email
            ? '<button class="button button-outline button-small" type="button" data-student-action="invite" data-student-id="' + escapeHtml(student.id) + '">Reenviar acesso</button>'
            : ""
          : invitePending
            ? '<button class="button button-outline button-small" type="button" disabled>Link enviado</button>'
            : student.email
              ? '<button class="button button-primary button-small" type="button" data-student-action="invite" data-student-id="' + escapeHtml(student.id) + '">' + (student.invited_at ? "Reenviar confirmação" : "Convidar para área do aluno") + '</button>'
              : "";
      return '<article class="student-card">' +
        '<div class="student-card-main">' +
          '<div class="student-card-heading"><h4>' + escapeHtml(student.nome) + '</h4>' +
            '<span class="student-status ' + statusClass + '">' + escapeHtml(studentStatusLabel(student.status)) + '</span></div>' +
          '<div class="student-card-details">' +
            '<span><small>Telefone</small><strong>' + escapeHtml(student.telefone || "Não informado") + '</strong></span>' +
            '<span><small>Categoria</small><strong>' + escapeHtml(student.categoria || "Não definida") + '</strong></span>' +
            '<span><small>Aulas restantes</small><strong class="student-balance">' + escapeHtml(student.aulas_restantes ?? 0) + '</strong></span>' +
            '<span><small>Aluguéis disponíveis</small><strong>' + escapeHtml(student.alugueis_disponiveis ?? 0) + ' de ' + escapeHtml(student.alugueis_comprados ?? 0) + '</strong></span>' +
          '</div>' +
          (student.email ? '<p class="student-card-email">' + escapeHtml(student.email) + '</p>' : '') +
          '<p class="student-card-email student-account-status"><small>Acesso do aluno: </small><strong class="' + accountClass + '">' + escapeHtml(accountStatus) + '</strong></p>' +
        '</div>' +
        '<div class="student-card-actions">' +
          inviteButton +
          '<button class="button button-outline button-small" type="button" data-student-action="exams" data-student-id="' + escapeHtml(student.id) + '">Exames</button><button class="button button-outline button-small" type="button" data-student-action="view-link" data-student-id="' + escapeHtml(student.id) + '">Ver vínculo</button>' +
          '<button class="button button-outline button-small" type="button" data-student-action="edit" data-student-id="' + escapeHtml(student.id) + '">Editar</button>' +
          '<button class="button button-danger button-small" type="button" data-student-action="delete" data-student-id="' + escapeHtml(student.id) + '">Excluir</button>' +
        '</div>' +
      '</article>';
    }).join("");
  }


  function renderLinkedStudents() {
    const container = el("listaAlunosVinculados");
    const counter = el("contadorAlunosVinculados");
    if (!container || !counter) return;
    const linked = state.students.filter(student => Boolean(student.user_id));
    counter.textContent = linked.length + (linked.length === 1 ? " conta vinculada" : " contas vinculadas");
    if (!state.studentLinkFieldsAvailable) {
      container.innerHTML = '<div class="empty-state">A atualização dos vínculos ainda não está disponível. Tente novamente após atualizar o aplicativo.</div>';
      return;
    }
    if (!linked.length) {
      container.innerHTML = '<div class="empty-state">Nenhum aluno possui acesso vinculado à sua conta de instrutor.</div>';
      return;
    }
    container.innerHTML = linked.map(student => {
      const waiting = Boolean(student.invited_at);
      return '<article class="student-card">' +
        '<div class="student-card-main">' +
          '<div class="student-card-heading"><h4>' + escapeHtml(student.nome) + '</h4>' +
            '<span class="student-status student-status-approved">Acesso vinculado</span></div>' +
          '<div class="student-card-details">' +
            '<span><small>E-mail</small><strong>' + escapeHtml(student.email || "Não informado") + '</strong></span>' +
            '<span><small>Telefone</small><strong>' + escapeHtml(student.telefone || "Não informado") + '</strong></span>' +
            '<span><small>Conta</small><strong>' + (waiting ? "Aguardando primeiro acesso" : "Ativa") + '</strong></span>' +
          '</div>' +
        '</div>' +
        '<div class="student-card-actions">' +
          '<button class="button button-danger button-small" type="button" data-linked-student-action="remove" data-student-id="' + escapeHtml(student.id) + '">Remover acesso</button>' +
        '</div>' +
      '</article>';
    }).join("");
  }

  async function removeStudentAppAccess(studentId) {
    const student = state.students.find(item => item.id === studentId);
    if (!student || !student.user_id) return;
    const confirmed = await confirmAction(
      'Remover o acesso ao aplicativo de "' + student.nome + '"?\n\nA conta do aluno será desativada e ele não poderá mais entrar. O cadastro, as aulas, vendas e todo o histórico permanecerão salvos na sua conta de instrutor.'
    );
    if (!confirmed) return;
    const container = el("listaAlunosVinculados");
    const button = container?.querySelector('[data-student-id="' + CSS.escape(studentId) + '"]');
    if (button) { button.disabled = true; button.textContent = "Removendo..."; }
    try {
      const { error } = await state.supabase.rpc("remove_student_app_access", { p_student_id: studentId });
      if (error) throw error;
      await loadOwnData();
      showMessage("Acesso do aluno removido. O cadastro e o histórico foram preservados.", false);
    } catch (error) {
      console.error("Falha ao remover acesso do aluno:", error);
      if (button) { button.disabled = false; button.textContent = "Remover acesso"; }
      showMessage("Não foi possível remover o acesso. Confira se a atualização de segurança do banco já foi aplicada.");
    }
  }

  function vehicleLabel(vehicle) {
    const details = [vehicle.nome, vehicle.tipo, vehicle.categoria ? "Categoria " + vehicle.categoria : null, vehicle.placa ? "Placa " + vehicle.placa : null].filter(Boolean);
    return details.join(" · ") || "Veículo sem identificação";
  }

  function renderVehicles() {
    const container = el("listaVeiculos");
    const counter = el("contadorVeiculos");
    const term = String(state.vehicleSearch || "").trim().toLocaleLowerCase("pt-BR");
    const filtered = state.vehicles.filter(vehicle => {
      const searchable = [
        vehicle.nome, vehicle.tipo, vehicle.categoria, vehicle.placa,
        vehicleLabel(vehicle)
      ].join(" ").toLocaleLowerCase("pt-BR");
      return !term || searchable.includes(term);
    });

    if (counter) {
      counter.textContent = state.vehicles.length + (state.vehicles.length === 1 ? " veículo cadastrado" : " veículos cadastrados");
    }
    if (!state.vehicles.length) {
      container.innerHTML = '<div class="empty-state">Você ainda não cadastrou veículos. Use “+ Novo veículo” para começar.</div>';
      return;
    }
    if (!filtered.length) {
      container.innerHTML = '<div class="empty-state">Nenhum veículo encontrado para essa busca.</div>';
      return;
    }

    container.innerHTML = filtered.map(vehicle => {
      const isMoto = String(vehicle.tipo || "").toLowerCase().includes("moto");
      return '<article class="vehicle-card">' +
        '<div class="vehicle-card-symbol" aria-hidden="true">' + (isMoto ? '🏍' : '🚗') + '</div>' +
        '<div class="vehicle-card-main">' +
          '<div class="vehicle-card-heading"><h4>' + escapeHtml(vehicle.nome || vehicle.tipo || "Veículo") + '</h4>' +
            '<span class="vehicle-category">Categoria ' + escapeHtml(vehicle.categoria || "—") + '</span></div>' +
          '<div class="vehicle-card-details">' +
            '<span><small>Tipo</small><strong>' + escapeHtml(vehicle.tipo || "Não informado") + '</strong></span>' +
            '<span><small>Placa</small><strong>' + escapeHtml(vehicle.placa || "Não informada") + '</strong></span>' +
          '</div>' +
        '</div>' +
        '<div class="vehicle-card-actions">' +
          '<button class="button button-outline button-small" type="button" data-vehicle-action="edit" data-vehicle-id="' + escapeHtml(vehicle.id) + '">Editar</button>' +
          '<button class="button button-danger button-small" type="button" data-vehicle-action="delete" data-vehicle-id="' + escapeHtml(vehicle.id) + '">Excluir</button>' +
        '</div>' +
      '</article>';
    }).join("");
  }

  function renderLessons() {
    const container = el("listaAulas");
    const counter = el("contadorAulas");
    const term = String(state.lessonSearch || "").trim().toLocaleLowerCase("pt-BR");
    const statusFilter = String(state.lessonStatusFilter || "").toLowerCase();
    const filtered = sortLessons(state.lessons).filter(lesson => {
      const status = String(lesson.status || "").toLowerCase();
      const searchable = [
        studentName(lesson.student_id),
        vehicleName(lesson.vehicle_id),
        formatDate(lesson.data_aula),
        String(lesson.data_aula || "").slice(0, 10),
        String(lesson.horario || "").slice(0, 5),
        lesson.numero_aula,
        lesson.observacoes,
        lessonStatusLabel(status)
      ].join(" ").toLocaleLowerCase("pt-BR");
      return (!term || searchable.includes(term)) && (!statusFilter || status === statusFilter);
    });

    if (counter) {
      counter.textContent = state.lessons.length + (state.lessons.length === 1 ? " aula cadastrada" : " aulas cadastradas");
    }
    if (!state.lessons.length) {
      container.innerHTML = '<div class="empty-state">Você ainda não cadastrou aulas. Use “+ Agendar aula” para começar.</div>';
      return;
    }
    if (!filtered.length) {
      container.innerHTML = '<div class="empty-state">Nenhuma aula encontrada com esses filtros.</div>';
      return;
    }

    container.innerHTML = filtered.map(lesson => {
      const status = String(lesson.status || "").toLowerCase();
      const statusClass = status === "realizada" ? "lesson-status-done" :
        status === "cancelada" ? "lesson-status-cancelled" : "lesson-status-scheduled";
      return '<article class="lesson-card">' +
        '<div class="lesson-card-top">' +
          '<div class="lesson-card-date"><strong>' + escapeHtml(formatDate(lesson.data_aula)) + '</strong>' +
            '<span>' + escapeHtml(String(lesson.horario || "").slice(0, 5)) + '</span></div>' +
          '<span class="lesson-status ' + statusClass + '">' + escapeHtml(lessonStatusLabel(status)) + '</span>' +
        '</div>' +
        '<div class="lesson-card-main">' +
          '<h4>' + escapeHtml(studentName(lesson.student_id)) + '</h4>' +
          '<div class="lesson-card-details">' +
            '<span><small>Veículo</small><strong>' + escapeHtml(vehicleName(lesson.vehicle_id)) + '</strong></span>' +
            '<span><small>Número da aula</small><strong>' + escapeHtml(lesson.numero_aula ?? "—") + '</strong></span>' +
          '</div>' +
          (lesson.observacoes ? '<p class="lesson-card-notes">' + escapeHtml(lesson.observacoes) + '</p>' : '') +
        '</div>' +
        '<div class="lesson-card-actions">' +
          '<button class="button button-outline button-small" type="button" data-lesson-action="edit" data-lesson-id="' + escapeHtml(lesson.id) + '">Editar</button>' +
          '<button class="button button-danger button-small" type="button" data-lesson-action="delete" data-lesson-id="' + escapeHtml(lesson.id) + '">Excluir</button>' +
        '</div>' +
      '</article>';
    }).join("");
  }

  function renderUpcomingLessons() {
    const container = el("proximasAulas");
    if (!container) return;

    const today = localToday();
    const scheduled = sortLessons(state.lessons.filter(lesson =>
      String(lesson.status || "").toLowerCase() === "agendada" &&
      String(lesson.data_aula || "").slice(0, 10) === today
    ));

    if (!scheduled.length) {
      container.innerHTML = '<div class="empty-state">Você não possui aulas agendadas para hoje.</div>';
      return;
    }

    container.innerHTML = scheduled.slice(0, 12).map(lesson => {
      const student = state.students.find(item => item.id === lesson.student_id);
      const remaining = Number(student?.aulas_restantes || 0);
      const phoneDigits = String(student?.telefone || "").replace(/\D/g, "");
      const whatsappNumber = phoneDigits && (phoneDigits.length === 10 || phoneDigits.length === 11) ? "55" + phoneDigits : phoneDigits;
      const whatsappAction = whatsappNumber
        ? '<a class="button button-outline button-small" href="https://wa.me/' + escapeHtml(whatsappNumber) + '" target="_blank" rel="noopener noreferrer">WhatsApp</a>'
        : '<span class="form-hint">Telefone não informado</span>';
      return '<article class="upcoming-lesson-card">' +
        '<div class="upcoming-lesson-date"><strong>' + escapeHtml(formatDate(lesson.data_aula)) +
        '</strong><span>' + escapeHtml(String(lesson.horario || "").slice(0, 5)) + '</span></div>' +
        '<div class="upcoming-lesson-info"><strong>' + escapeHtml(studentName(lesson.student_id)) +
        '</strong><span>' + escapeHtml(vehicleName(lesson.vehicle_id)) + '</span>' +
        '<small>Aula ' + escapeHtml(lesson.numero_aula ?? "—") +
        ' · Saldo: ' + escapeHtml(remaining) + '</small></div>' +
        '<div class="upcoming-lesson-actions">' +
        whatsappAction +
        '<button class="button button-success button-small" type="button" data-dashboard-lesson-action="realizada" data-lesson-id="' +
        escapeHtml(lesson.id) + '"' + (remaining <= 0 ? ' disabled title="Aluno sem aulas restantes"' : '') +
        '>Realizada</button>' +
        '<button class="button button-danger button-small" type="button" data-dashboard-lesson-action="cancelada" data-lesson-id="' +
        escapeHtml(lesson.id) + '">Cancelar</button>' +
        '</div></article>';
    }).join("");
  }

  async function changeScheduledLessonStatus(id, nextStatus) {
    const lesson = state.lessons.find(item => item.id === id);
    if (!lesson || String(lesson.status || "").toLowerCase() !== "agendada") return;

    const student = state.students.find(item => item.id === lesson.student_id);
    if (nextStatus === "realizada" && Number(student?.aulas_restantes || 0) <= 0) {
      showMessage("Não é possível marcar como realizada: o aluno não possui aulas restantes.");
      return;
    }

    const actionLabel = nextStatus === "realizada" ? "marcar esta aula como realizada" : "cancelar esta aula";
    if (!await confirmAction("Deseja " + actionLabel + " para " + studentName(lesson.student_id) + "?")) return;

    try {
      const { error } = await state.supabase.from("lessons")
        .update({ status: nextStatus }).eq("id", id);
      if (error) throw error;
      await loadOwnData();
      showMessage(nextStatus === "realizada"
        ? "Aula marcada como realizada. O saldo foi atualizado."
        : "Aula cancelada com sucesso.", false);
    } catch (error) {
      console.error("Falha ao atualizar situação da aula:", error);
      const detail = String(error?.message || "");
      if (detail.includes("SALDO_AULAS_INSUFICIENTE")) {
        showMessage("A aula não foi confirmada: o aluno não possui aulas restantes.");
      } else {
        showMessage("Não foi possível atualizar a aula. Tente novamente.");
      }
    }
  }

  function updateLessonSelects() {
    const studentSelect = el("aulaAluno");
    const selectedStudent = studentSelect.value;
    studentSelect.innerHTML = '<option value="">Selecione um aluno</option>' +
      state.students.map(student =>
        '<option value="' + escapeHtml(student.id) + '">' +
          escapeHtml(student.nome + " · " + (student.aulas_restantes ?? 0) + " aulas restantes") +
        '</option>'
      ).join("");
    if (state.students.some(student => student.id === selectedStudent)) studentSelect.value = selectedStudent;

    const vehicleSelect = el("aulaVeiculo");
    const selectedVehicle = vehicleSelect.value;
    vehicleSelect.innerHTML = '<option value="">Sem veículo definido</option>' +
      state.vehicles.map(vehicle =>
        '<option value="' + escapeHtml(vehicle.id) + '">' + escapeHtml(vehicleLabel(vehicle)) + '</option>'
      ).join("");
    if (state.vehicles.some(vehicle => vehicle.id === selectedVehicle)) vehicleSelect.value = selectedVehicle;

    const batchStudent = el("loteAluno");
    if (batchStudent) {
      const selected = batchStudent.value;
      batchStudent.innerHTML = '<option value="">Selecione um aluno</option>' + state.students.map(student =>
        '<option value="' + escapeHtml(student.id) + '">' + escapeHtml(student.nome + " · " + (student.aulas_restantes ?? 0) + " aulas restantes") + '</option>'
      ).join("");
      if (state.students.some(student => student.id === selected)) batchStudent.value = selected;
    }
    const batchVehicle = el("loteVeiculo");
    if (batchVehicle) {
      const selected = batchVehicle.value;
      batchVehicle.innerHTML = '<option value="">Sem veículo definido</option>' + state.vehicles.map(vehicle =>
        '<option value="' + escapeHtml(vehicle.id) + '">' + escapeHtml(vehicleLabel(vehicle)) + '</option>'
      ).join("");
      if (state.vehicles.some(vehicle => vehicle.id === selected)) batchVehicle.value = selected;
    }
  }

  function updateLessonBalanceHint() {
    const student = state.students.find(item => item.id === el("aulaAluno").value);
    const target = el("saldoAlunoAula");
    if (!student) {
      target.textContent = "Selecione o aluno para consultar o saldo de aulas.";
      return;
    }
    const remaining = Number(student.aulas_restantes || 0);
    target.textContent = "Saldo atual: " + remaining + " aula(s) restante(s)." +
      (remaining === 0 ? " Não será possível confirmar uma aula como realizada sem saldo." : "");
    target.classList.toggle("lesson-balance-empty", remaining === 0);
  }

  function resetLessonForm() {
    state.lessonEditingId = null;
    el("formAula").reset();
    el("tituloFormAula").textContent = "Agendar aula";
    el("btnSalvarAula").textContent = "Salvar aula";
    closeInstructorModal("formAula");
    el("formAula").hidden = true;
    updateLessonBalanceHint();
  }

  function openLessonForm(lesson = null) {
    el("formAula").reset();
    state.lessonEditingId = lesson ? lesson.id : null;
    el("tituloFormAula").textContent = lesson ? "Editar aula" : "Agendar aula";
    el("btnSalvarAula").textContent = lesson ? "Salvar alterações" : "Salvar aula";
    updateLessonSelects();

    if (lesson) {
      el("aulaAluno").value = lesson.student_id || "";
      el("aulaData").value = String(lesson.data_aula || "").slice(0, 10);
      el("aulaHorario").value = String(lesson.horario || "").slice(0, 5);
      el("aulaVeiculo").value = lesson.vehicle_id || "";
      el("aulaStatus").value = String(lesson.status || "agendada").toLowerCase();
      el("aulaObservacoes").value = lesson.observacoes || "";
    } else {
      el("aulaData").value = localToday();
      el("aulaStatus").value = "agendada";
    }

    el("formAula").hidden = false;
    openInstructorModal("formAula");
    updateLessonBalanceHint();
    el("aulaAluno").focus();
  }


  function openBatchLessonForm() {
    resetLessonForm();
    updateLessonSelects();
    el("formAulasLote").reset();
    el("loteDataInicial").value = localToday();
    el("loteHorarioInicial").value = "08:00";
    el("loteQuantidade").value = "4";
    el("loteIntervaloDias").value = "7";
    el("formAulasLote").hidden = false;
    openInstructorModal("formAulasLote");
    generateBatchLessonRows();
    el("loteAluno").focus();
  }

  function resetBatchLessonForm() {
    el("formAulasLote").reset();
    closeInstructorModal("formAulasLote");
    el("formAulasLote").hidden = true;
    el("listaDatasAulasLote").innerHTML = "";
  }

  function generateBatchLessonRows() {
    const count = Math.max(2, Math.min(20, Number(el("loteQuantidade").value) || 2));
    const interval = Math.max(1, Math.min(90, Number(el("loteIntervaloDias").value) || 7));
    const startDate = el("loteDataInicial").value;
    const startTime = el("loteHorarioInicial").value || "08:00";
    if (!startDate) {
      showMessage("Escolha a data da primeira aula.");
      return;
    }

    const date = new Date(startDate + "T12:00:00");
    const rows = [];
    for (let index = 0; index < count; index++) {
      if (index > 0) date.setDate(date.getDate() + interval);
      const dateValue = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
      ].join("-");
      rows.push(
        '<div class="batch-lesson-row" data-lote-row="' + index + '">' +
          '<strong>Aula ' + (index + 1) + '</strong>' +
          '<label>Data<input type="date" data-lote-data required value="' + dateValue + '"></label>' +
          '<label>Horário<input type="time" data-lote-horario required value="' + escapeHtml(startTime) + '"></label>' +
        '</div>'
      );
    }
    el("listaDatasAulasLote").innerHTML = rows.join("");
    showMessage("");
  }

  async function saveBatchLessons(event) {
    event.preventDefault();
    const studentId = el("loteAluno").value;
    const vehicleId = el("loteVeiculo").value || null;
    const student = state.students.find(item => item.id === studentId);
    const rows = [...el("listaDatasAulasLote").querySelectorAll("[data-lote-row]")].map(row => ({
      date: row.querySelector("[data-lote-data]").value,
      time: row.querySelector("[data-lote-horario]").value
    }));
    if (!student || rows.length < 2 || rows.some(row => !row.date || !row.time)) {
      showMessage("Selecione o aluno e confira as datas e os horários de todas as aulas.");
      return;
    }

    const keys = new Set();
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const key = row.date + "|" + row.time;
      if (keys.has(key)) {
        showMessage("Aula " + (index + 1) + ": existe outra aula deste lote no mesmo dia e horário.");
        return;
      }
      keys.add(key);
      const occupied = state.lessons.some(item =>
        String(item.data_aula || "").slice(0, 10) === row.date &&
        String(item.horario || "").slice(0, 5) === row.time &&
        String(item.status || "").toLowerCase() !== "cancelada"
      );
      if (occupied) {
        showMessage("Aula " + (index + 1) + ": já existe uma aula agendada nesse dia e horário.");
        return;
      }
    }

    const nextNumber = Math.max(0, ...state.lessons
      .filter(item => item.student_id === studentId)
      .map(item => Number(item.numero_aula || 0))) + 1;
    const lessons = rows.map((row, index) => ({
      owner_id: state.user.id,
      student_id: studentId,
      vehicle_id: vehicleId,
      data_aula: row.date,
      horario: row.time,
      numero_aula: nextNumber + index,
      status: "agendada",
      observacoes: null
    }));

    const button = el("btnSalvarAulasLote");
    button.disabled = true;
    button.textContent = "Agendando...";
    showMessage("");
    try {
      const { error } = await state.supabase.from("lessons").insert(lessons);
      if (error) throw error;
      resetBatchLessonForm();
      await loadOwnData();
      showMessage(lessons.length + " aulas agendadas com sucesso.", false);
    } catch (error) {
      console.error("Falha ao agendar várias aulas:", error);
      showMessage("Não foi possível agendar o lote. Nenhuma aula foi confirmada; confira os horários e tente novamente.");
    } finally {
      button.disabled = false;
      button.textContent = "Agendar todas as aulas";
    }
  }
  async function saveLesson(event) {
    event.preventDefault();
    const button = el("btnSalvarAula");
    const studentId = el("aulaAluno").value;
    const date = el("aulaData").value;
    const time = el("aulaHorario").value;
    const status = el("aulaStatus").value;
    const student = state.students.find(item => item.id === studentId);
    const previous = state.lessons.find(item => item.id === state.lessonEditingId);

    if (!student || !date || !time) {
      showMessage("Selecione o aluno e informe a data e o horário da aula.");
      return;
    }

    const requiresDebit = status === "realizada" && (
      !previous ||
      String(previous.status || "").toLowerCase() !== "realizada" ||
      previous.student_id !== studentId
    );
    if (requiresDebit && Number(student.aulas_restantes || 0) <= 0) {
      showMessage("Não é possível confirmar esta aula como realizada: o aluno não possui aulas restantes. Atualize o pacote de aulas antes de continuar.");
      return;
    }

    const occupied = state.lessons.find(item =>
      item.id !== state.lessonEditingId &&
      String(item.data_aula).slice(0, 10) === date &&
      String(item.horario).slice(0, 5) === time &&
      String(item.status || "").toLowerCase() !== "cancelada"
    );
    if (occupied) {
      showMessage("Já existe uma aula agendada nesse dia e horário. Escolha outro horário.");
      return;
    }

    const nextNumber = previous?.numero_aula ??
      (Math.max(0, ...state.lessons.filter(item => item.student_id === studentId)
        .map(item => Number(item.numero_aula || 0))) + 1);
    const lesson = {
      owner_id: state.user.id,
      student_id: studentId,
      vehicle_id: el("aulaVeiculo").value || null,
      data_aula: date,
      horario: time,
      numero_aula: nextNumber,
      status,
      observacoes: el("aulaObservacoes").value.trim() || null
    };

    button.disabled = true;
    button.textContent = "Salvando...";
    showMessage("");
    try {
      const result = previous
        ? await state.supabase.from("lessons").update(lesson).eq("id", previous.id)
        : await state.supabase.from("lessons").insert(lesson);
      if (result.error) throw result.error;
      resetLessonForm();
      await loadOwnData();
      showMessage("Aula salva com sucesso.", false);
    } catch (error) {
      console.error("Falha ao salvar aula:", error);
      const detail = String(error?.message || "");
      if (detail.includes("SALDO_AULAS_INSUFICIENTE")) {
        showMessage("A confirmação foi bloqueada: o aluno não possui aulas restantes.");
      } else {
        showMessage("Não foi possível salvar a aula. Confira os dados e tente novamente.");
      }
    } finally {
      button.disabled = false;
      button.textContent = state.lessonEditingId ? "Salvar alterações" : "Salvar aula";
    }
  }

  async function deleteLesson(id) {
    const lesson = state.lessons.find(item => item.id === id);
    if (!lesson) return;
    if (!await confirmAction("Deseja excluir esta aula de " + studentName(lesson.student_id) + "?")) return;
    try {
      const { error } = await state.supabase.from("lessons").delete().eq("id", id);
      if (error) throw error;
      await loadOwnData();
      showMessage("Aula excluída com sucesso.", false);
    } catch (error) {
      console.error("Falha ao excluir aula:", error);
      showMessage("Não foi possível excluir esta aula. Atualize a página e tente novamente.");
    }
  }

  function resetVehicleForm() {
    state.vehicleEditingId = null;
    el("formVeiculo").reset();
    el("tituloFormVeiculo").textContent = "Cadastrar veículo";
    el("btnSalvarVeiculo").textContent = "Salvar veículo";
    closeInstructorModal("formVeiculo");
    el("formVeiculo").hidden = true;
  }

  function openVehicleForm(vehicle = null) {
    el("formVeiculo").reset();
    state.vehicleEditingId = vehicle ? vehicle.id : null;
    el("tituloFormVeiculo").textContent = vehicle ? "Editar veículo" : "Cadastrar veículo";
    el("btnSalvarVeiculo").textContent = vehicle ? "Salvar alterações" : "Salvar veículo";
    if (vehicle) {
      el("veiculoTipo").value = vehicle.tipo || "";
      el("veiculoCategoria").value = vehicle.categoria || "";
      el("veiculoPlaca").value = vehicle.placa || "";
      el("veiculoNome").value = vehicle.nome || "";
    }
    el("formVeiculo").hidden = false;
    openInstructorModal("formVeiculo");
    el("veiculoTipo").focus();
  }

  async function saveVehicle(event) {
    event.preventDefault();
    const button = el("btnSalvarVeiculo");
    const vehicle = {
      tipo: el("veiculoTipo").value,
      categoria: el("veiculoCategoria").value,
      placa: el("veiculoPlaca").value.trim().toUpperCase() || null,
      nome: el("veiculoNome").value.trim() || null
    };
    if (!vehicle.tipo || !vehicle.categoria) {
      showMessage("Informe o tipo e a categoria do veículo.");
      return;
    }

    button.disabled = true;
    button.textContent = "Salvando...";
    showMessage("");
    try {
      let result;
      if (state.vehicleEditingId) {
        result = await state.supabase.from("vehicles")
          .update(vehicle).eq("id", state.vehicleEditingId);
      } else {
        result = await state.supabase.from("vehicles")
          .insert({ ...vehicle, owner_id: state.user.id });
      }
      if (result.error) throw result.error;
      resetVehicleForm();
      await loadOwnData();
      showMessage("Veículo salvo com sucesso.", false);
    } catch (error) {
      console.error("Falha ao salvar veículo:", error);
      showMessage("Não foi possível salvar o veículo. Confira os dados e tente novamente.");
    } finally {
      button.disabled = false;
      button.textContent = state.vehicleEditingId ? "Salvar alterações" : "Salvar veículo";
    }
  }

  async function deleteVehicle(id) {
    const vehicle = state.vehicles.find(item => item.id === id);
    if (!vehicle) return;
    if (!await confirmAction('Deseja excluir o veículo "' + vehicleLabel(vehicle) + '"?')) return;
    try {
      const { error } = await state.supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;
      await loadOwnData();
      showMessage("Veículo excluído com sucesso.", false);
    } catch (error) {
      console.error("Falha ao excluir veículo:", error);
      showMessage("Não foi possível excluir este veículo. Se ele já estiver vinculado a aulas, mantenha o cadastro e edite seus dados.");
    }
  }

  function updateStudentSelect() {
    const select = el("filtroAluno");
    const selected = select.value;
    select.innerHTML = '<option value="">Selecione um aluno</option>' +
      state.students.map(student =>
        '<option value="' + escapeHtml(student.id) + '">' + escapeHtml(student.nome) + '</option>'
      ).join("");
    if (state.students.some(student => student.id === selected)) select.value = selected;
  }

  function productLabel(product) {
    const type = { produto: "Produto", servico: "Serviço", pacote: "Pacote" }[product.tipo] || product.tipo;
    return product.nome + " · " + type + " · " + currency(product.preco);
  }

  function updateProductSelects() {
    const options = '<option value="">Selecione um item</option>' + state.products
      .filter(product => product.ativo)
      .map(product => '<option value="' + escapeHtml(product.id) + '">' + escapeHtml(productLabel(product)) + '</option>').join("") +
      (state.fixedItemPrices.aluguel > 0 ? '<option value="fixed:aluguel_veiculo">Aluguel de Veículo · ' + currency(state.fixedItemPrices.aluguel) + '</option>' : '') +
      (state.fixedItemPrices.cartao > 0 ? '<option value="fixed:cartao_moto_pista">Cartão Moto Pista · ' + currency(state.fixedItemPrices.cartao) + '</option>' : '');
    el("vendaProduto").innerHTML = options;
  }

  function renderProducts() {
    const term = state.productSearch.trim().toLocaleLowerCase("pt-BR");
    const filtered = state.products.filter(product => [product.nome, product.tipo, product.descricao]
      .join(" ").toLocaleLowerCase("pt-BR").includes(term));
    el("contadorProdutos").textContent = filtered.length + (filtered.length === 1 ? " item" : " itens");
    const list = el("listaProdutos");
    if (!filtered.length) {
      list.innerHTML = '<div class="empty-state">' + (state.products.length ? "Nenhum item encontrado." : "Você ainda não cadastrou produtos ou serviços.") + '</div>';
      return;
    }
    list.innerHTML = filtered.map(product => {
      const type = { produto: "Produto", servico: "Serviço", pacote: "Pacote" }[product.tipo] || product.tipo;
      const classes = product.ativo ? "product-active" : "product-inactive";
      return '<article class="product-card"><div class="product-card-main"><div class="product-card-heading"><h4>' + escapeHtml(product.nome) + '</h4><span class="product-kind">' + type + '</span><span class="product-state ' + classes + '">' + (product.ativo ? "Ativo" : "Inativo") + '</span></div><div class="product-card-details"><span><small>Preço</small><strong>' + currency(product.preco) + '</strong></span><span><small>Aulas adicionadas</small><strong>' + (product.quantidade_aulas ?? (product.tipo === "servico" ? 1 : 0)) + '</strong></span></div>' + (product.descricao ? '<p>' + escapeHtml(product.descricao) + '</p>' : '') + '</div><div class="product-card-actions"><button class="button button-outline button-small" type="button" data-product-action="edit" data-product-id="' + product.id + '">Editar</button><button class="button button-danger button-small" type="button" data-product-action="toggle" data-product-id="' + product.id + '">' + (product.ativo ? "Inativar" : "Ativar") + '</button></div></article>';
    }).join("");
  }

  function resetProductForm() {
    state.productEditingId = null;
    el("formProduto").reset();
    el("tituloFormProduto").textContent = "Cadastrar produto ou serviço";
    el("btnSalvarProduto").textContent = "Salvar item";
    el("produtoAtivo").value = "true";
    closeInstructorModal("formProduto");
    el("formProduto").hidden = true;
  }

  function openProductForm(product = null) {
    el("formProduto").reset();
    state.productEditingId = product ? product.id : null;
    el("tituloFormProduto").textContent = product ? "Editar produto ou serviço" : "Cadastrar produto ou serviço";
    el("btnSalvarProduto").textContent = product ? "Salvar alterações" : "Salvar item";
    if (product) {
      el("produtoNome").value = product.nome || "";
      el("produtoTipo").value = product.tipo || "servico";
      el("produtoPreco").value = product.preco ?? 0;
      el("produtoAulas").value = product.quantidade_aulas ?? "";
      el("produtoDescricao").value = product.descricao || "";
      el("produtoAtivo").value = String(product.ativo);
    } else {
      el("produtoAtivo").value = "true";
    }
    el("formProduto").hidden = false;
    openInstructorModal("formProduto");
    el("produtoNome").focus();
  }

  async function saveProduct(event) {
    event.preventDefault();
    const button = el("btnSalvarProduto");
    const price = Number(el("produtoPreco").value);
    const lessonsRaw = el("produtoAulas").value;
    const lessons = lessonsRaw === "" ? null : Number(lessonsRaw);
    const product = {
      nome: el("produtoNome").value.trim(),
      tipo: el("produtoTipo").value,
      preco: price,
      quantidade_aulas: lessons,
      descricao: el("produtoDescricao").value.trim() || null,
      ativo: el("produtoAtivo").value === "true"
    };
    if (!product.nome || !Number.isFinite(price) || price < 0 ||
        (lessons !== null && (!Number.isInteger(lessons) || lessons < 0))) {
      showMessage("Confira o nome, preço e quantidade de aulas.");
      return;
    }
    button.disabled = true;
    try {
      const query = state.supabase.from("products");
      const result = state.productEditingId
        ? await query.update(product).eq("id", state.productEditingId)
        : await query.insert({ ...product, owner_id: state.user.id });
      if (result.error) throw result.error;
      resetProductForm();
      await loadProductsAndSales();
      showMessage("Produto ou serviço salvo com sucesso.", false);
    } catch (error) {
      console.error("Falha ao salvar produto:", error);
      showMessage("Não foi possível salvar o item. Confira os dados e as permissões.");
    } finally {
      button.disabled = false;
    }
  }

  async function toggleProduct(id) {
    const product = state.products.find(item => item.id === id);
    if (!product) return;
    const action = product.ativo ? "inativar" : "ativar";
    if (!await confirmAction("Deseja " + action + ' "' + product.nome + '"?')) return;
    const { error } = await state.supabase.from("products").update({ ativo: !product.ativo }).eq("id", id);
    if (error) { console.error(error); showMessage("Não foi possível atualizar o item."); return; }
    await loadProductsAndSales();
    showMessage("Situação atualizada.", false);
  }

  function renderSaleCart() {
    const cart = state.saleCart;
    const total = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    el("totalVenda").textContent = currency(total);
    el("btnSalvarVenda").disabled = !cart.length || !state.students.length;
    const container = el("itensCarrinhoVenda");
    if (!cart.length) {
      container.innerHTML = '<div class="empty-state">Adicione produtos ou serviços à venda.</div>';
      return;
    }
    container.innerHTML = cart.map((item, index) =>
      '<article class="sale-cart-row"><div><strong>' + escapeHtml(item.name) + '</strong><span>' + item.quantity + ' × ' + currency(item.unitPrice) + '</span></div><strong>' + currency(item.quantity * item.unitPrice) + '</strong><button type="button" class="button button-danger button-small" data-cart-remove="' + index + '">Remover</button></article>'
    ).join("");
  }

  function addSaleCartItem() {
    const selected = el("vendaProduto").value;
    const fixedKey = selected.startsWith("fixed:") ? selected.slice(6) : null;
    const fixed = fixedKey === "aluguel_veiculo"
      ? { name:"Aluguel de Veículo", price:state.fixedItemPrices.aluguel }
      : fixedKey === "cartao_moto_pista" ? { name:"Cartão Moto Pista", price:state.fixedItemPrices.cartao } : null;
    const product = state.products.find(item => item.id === selected && item.ativo);
    const quantity = Number(el("vendaQuantidade").value);
    if ((!product && !fixed) || !Number.isInteger(quantity) || quantity <= 0) {
      showMessage("Selecione um item ativo e informe uma quantidade válida.");
      return;
    }
    const existing = state.saleCart.find(item => fixedKey ? item.fixedItemKey === fixedKey : item.productId === product.id);
    if (existing) existing.quantity += quantity;
    else state.saleCart.push(fixed
      ? { productId:null, fixedItemKey:fixedKey, name:fixed.name, unitPrice:Number(fixed.price), quantity }
      : { productId:product.id, fixedItemKey:null, name:product.nome, unitPrice:Number(product.preco), quantity });
    el("vendaProduto").value = "";
    el("vendaQuantidade").value = "1";
    renderSaleCart();
    showMessage("");
  }

  async function saveSale(event) {
    event.preventDefault();
    if (!state.saleCart.length) { showMessage("Adicione pelo menos um item à venda."); return; }
    const studentId = el("vendaAluno").value;
    if (!state.students.some(student => student.id === studentId)) { showMessage("Selecione um aluno válido."); return; }
    const button = el("btnSalvarVenda");
    const items = state.saleCart.map(item => item.fixedItemKey ? { fixed_item_key:item.fixedItemKey, quantidade:item.quantity } : { product_id:item.productId, quantidade:item.quantity });
    const saleRequest = {
      studentId,
      items,
      paymentMethod: el("vendaPagamento").value || null,
      notes: el("vendaObservacoes").value.trim() || null
    };
    const saleFingerprint = JSON.stringify(saleRequest);
    if (state.pendingSaleFingerprint !== saleFingerprint || !state.pendingSaleId) {
      state.pendingSaleId = crypto.randomUUID();
      state.pendingSaleFingerprint = saleFingerprint;
    }
    const saleId = state.pendingSaleId;
    button.disabled = true;
    button.textContent = "Registrando...";
    try {
      const { error } = await state.supabase.rpc("create_sale_with_fixed_items", {
        p_sale_id: saleId,
        p_student_id: studentId,
        p_items: items,
        p_payment_method: saleRequest.paymentMethod,
        p_notes: saleRequest.notes,
        p_discount_type: "valor",
        p_discount_value: 0
      });
      if (error) throw error;

      // A transação foi confirmada no banco; limpar o carrinho antes de atualizar as listas.
      closeInstructorModal("formVenda");
      el("formVenda").reset();
      el("vendaQuantidade").value = "1";
      state.saleCart = [];
      state.pendingSaleId = null;
      state.pendingSaleFingerprint = null;
      renderSaleCart();

      try {
        await loadOwnData();
        showMessage("Venda confirmada! A entrada financeira e o saldo de aulas foram atualizados.", false);
      } catch (refreshError) {
        console.error("Venda salva, mas houve falha ao atualizar as telas:", refreshError);
        showMessage("A venda foi registrada. Recarregue a página para atualizar os saldos e o histórico.", false);
      }
    } catch (error) {
      console.error("Falha ao registrar venda:", error);
      showMessage(error.message || "Não foi possível registrar a venda. Nenhum lançamento parcial foi salvo.");
    } finally {
      button.textContent = "Confirmar venda";
      button.disabled = !state.saleCart.length;
    }
  }

  async function saveFixedItemPrices() {
    const aluguel=Number(el("precoAluguelFixoInstrutor").value),cartao=Number(el("precoCartaoFixoInstrutor").value);
    const status=el("statusPrecosFixosInstrutor"),button=el("btnSalvarPrecosFixosInstrutor");
    if(!Number.isFinite(aluguel)||!Number.isFinite(cartao)||aluguel<0||cartao<0){status.textContent="Informe valores válidos.";return;}
    button.disabled=true;
    try{const {error}=await state.supabase.from("app_settings").upsert({owner_id:state.user.id,aluguel_veiculo_preco:aluguel,cartao_moto_pista_preco:cartao},{onConflict:"owner_id"});if(error)throw error;state.fixedItemPrices={aluguel,cartao};updateProductSelects();status.textContent="Preços salvos nesta conta.";}
    catch(error){console.error("Falha ao salvar preços fixos:",error);status.textContent=error.message||"Não foi possível salvar os preços.";}
    finally{button.disabled=false;}
  }

  async function loadProductsAndSales() {
    const [productsResult, salesResult, saleItemsResult, fixedPricesResult, rentalCreditsResult] = await Promise.all([
      state.supabase.from("products").select("id,nome,tipo,descricao,preco,quantidade_aulas,ativo").eq("owner_id", state.user.id).order("nome", { ascending: true }),
      state.supabase.from("sales").select("id,student_id,data_venda,total,forma_pagamento,status,observacoes,created_at").eq("owner_id", state.user.id).order("data_venda", { ascending: false }).order("created_at", { ascending: false }),
      state.supabase.from("sale_items").select("id,sale_id,descricao,quantidade,tipo_item,aulas_contratadas,aulas_devolvidas,valor_por_aula,valor_liquido,valor_devolvido,quantidade_devolvida,subtotal,valor_unitario,fixed_item_key").eq("owner_id", state.user.id),
      state.supabase.from("app_settings").select("aluguel_veiculo_preco,cartao_moto_pista_preco").eq("owner_id", state.user.id).maybeSingle(),
      state.supabase.from("student_rental_credits").select("sale_item_id,quantity_purchased,quantity_refunded,quantity_consumed")
    ]);
    if (productsResult.error) throw productsResult.error;
    if (salesResult.error) throw salesResult.error;
    if (saleItemsResult.error) throw saleItemsResult.error;
    if (fixedPricesResult.error) throw fixedPricesResult.error;
    const rentalCreditLedgerMissing = rentalCreditsResult.error &&
      (["42P01", "PGRST205"].includes(rentalCreditsResult.error.code) ||
       /student_rental_credits.*(schema cache|does not exist|not found)/i.test(rentalCreditsResult.error.message || ""));
    if (rentalCreditsResult.error && !rentalCreditLedgerMissing) throw rentalCreditsResult.error;
    state.products = productsResult.data || [];
    state.sales = salesResult.data || [];
    state.saleItems = saleItemsResult.data || [];
    // A RLS entrega somente os créditos da própria conta e libera apenas
    // as quatro colunas necessárias. Se o ledger ainda não existir no schema,
    // mantém compatibilidade com ambientes anteriores à migration.
    const creditsBySaleItem = new Map((rentalCreditsResult.data || []).map(credit => [credit.sale_item_id, credit]));
    state.rentalCreditAvailability = new Map(state.saleItems
      .filter(item => item.fixed_item_key === "aluguel_veiculo")
      .map(item => {
        const credit = creditsBySaleItem.get(item.id);
        const fallback = Math.max(0, Number(item.quantidade || 0) - Number(item.quantidade_devolvida || 0));
        const available = credit
          ? Math.max(0, Number(credit.quantity_purchased || 0) - Number(credit.quantity_refunded || 0) - Number(credit.quantity_consumed || 0))
          : rentalCreditLedgerMissing ? fallback : 0;
        return [item.id, available];
      }));
    state.fixedItemPrices = { aluguel:Number(fixedPricesResult.data?.aluguel_veiculo_preco||0), cartao:Number(fixedPricesResult.data?.cartao_moto_pista_preco||0) };
    const aluguelInput=el("precoAluguelFixoInstrutor"),cartaoInput=el("precoCartaoFixoInstrutor");
    if(aluguelInput)aluguelInput.value=state.fixedItemPrices.aluguel.toFixed(2);
    if(cartaoInput)cartaoInput.value=state.fixedItemPrices.cartao.toFixed(2);
    renderProducts();
    updateProductSelects();
    renderSales();
  }

  function refundableInstructorItem(item) {
    const type = item.tipo_item === "produto" ? "produto" : "servico";
    const original = type === "produto" ? Number(item.quantidade || 0) : Number(item.aulas_contratadas || 0);
    const returned = type === "produto" ? Number(item.quantidade_devolvida || 0) : Number(item.aulas_devolvidas || 0);
    const saleRemaining = Math.max(0, original - returned);
    const available = item.fixed_item_key === "aluguel_veiculo"
      ? Math.min(saleRemaining, Number(state.rentalCreditAvailability.get(item.id) || 0))
      : saleRemaining;
    const netValue = Number(item.valor_liquido ?? item.subtotal ?? 0);
    const unitValue = type === "produto"
      ? (original > 0 ? netValue / original : 0)
      : Number(item.valor_por_aula || 0);
    return { type, original, returned, available, netValue, unitValue };
  }

  function renderSales() {
    const list = el("listaVendas");
    el("contadorVendas").textContent = state.sales.length + (state.sales.length === 1 ? " venda" : " vendas");
    if (!state.sales.length) {
      list.innerHTML = '<div class="empty-state">Nenhuma venda registrada ainda.</div>';
      return;
    }
    list.innerHTML = state.sales.map(sale => {
      const items = state.saleItems.filter(item => item.sale_id === sale.id);
      const canRefund = sale.status === "confirmada" && items.some(item => refundableInstructorItem(item).available > 0);
      const itemSummary = items.map(item => {
        const info = refundableInstructorItem(item);
        return '<span class="sale-item-chip">' + escapeHtml(item.descricao || "Item") + ' · ' +
          (item.fixed_item_key === "aluguel_veiculo" ? info.available + " aluguéis disponíveis" : info.type === "produto" ? info.available + " un. disponíveis" : info.available + " aulas disponíveis") + '</span>';
      }).join("");
      return '<article class="sale-history-card"><div class="sale-history-main"><strong>' + escapeHtml(studentName(sale.student_id)) +
        '</strong><span>' + escapeHtml(formatDate(sale.data_venda)) + ' · ' + escapeHtml(sale.forma_pagamento || "Pagamento não informado") +
        '</span><div class="sale-history-items">' + itemSummary + '</div></div><strong class="sale-history-total">' + currency(sale.total) +
        '</strong><span class="sale-state ' + (sale.status === "confirmada" ? "product-active" : "product-inactive") + '">' +
        (sale.status === "confirmada" ? "Confirmada" : "Cancelada") + '</span><div class="sale-history-actions">' +
        '<button class="button button-outline button-small" type="button" data-sale-print="' + escapeHtml(sale.id) + '">Imprimir recibo</button>' +
        (canRefund ? '<button class="button button-outline button-small" type="button" data-sale-refund="' + escapeHtml(sale.id) + '">↩ Devolver itens</button>' : '') +
        '<button class="button button-danger button-small" type="button" data-sale-delete="' + escapeHtml(sale.id) + '">Excluir venda</button>' + '</div></article>';
    }).join("");
  }

  function abrirReciboComoPDF(dados) {
  // Mesmo mecanismo dos contratos/relatórios: imprime o documento atual com window.print().
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const itens = (dados.itens || []).map(item => `
    <tr><td>${esc(item.descricao || "Item")}</td>
    <td class="center">${esc(item.quantidade ?? 1)}</td>
    <td class="right">${esc(item.unitario || "")}</td>
    <td class="right">${esc(item.total || "")}</td></tr>`).join("");
  const logo = dados.logo ? `<img class="recibo-logo" src="${esc(dados.logo)}" alt="Logo">` : "";
  let style = document.getElementById("estiloImpressaoRecibo");
  if (!style) {
    style = document.createElement("style");
    style.id = "estiloImpressaoRecibo";
    document.head.appendChild(style);
  }
  style.textContent = `
    @media print {
      @page { size: A4; margin: 16mm; }
      html, body { height:auto !important; min-height:0 !important; margin:0 !important; padding:0 !important; overflow:visible !important; }
      body.printing-receipt > *:not(#reciboImpressao) { display:none !important; }
      body.printing-receipt > #reciboImpressao {
        display:block !important; position:static !important; width:auto !important;
        height:auto !important; min-height:0 !important; margin:0 !important; padding:0 !important;
        background:#fff !important; color:#17212f !important;
        font:12px Arial,sans-serif !important;
        -webkit-print-color-adjust:exact; print-color-adjust:exact;
        break-after:avoid-page !important; page-break-after:avoid !important;
      }
      #reciboImpressao table { width:100%; border-collapse:collapse; margin-top:20px; }
      #reciboImpressao th,#reciboImpressao td { padding:9px 7px; border-bottom:1px solid #dce2eb; text-align:left; }
      #reciboImpressao th { background:#f3f6fa !important; }
      #reciboImpressao .center { text-align:center; }
      #reciboImpressao .right { text-align:right; }
      #reciboImpressao .recibo-total { text-align:right; font-size:18px; font-weight:bold; margin:22px 0; }
      #reciboImpressao .recibo-cabecalho { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #1e3a5f; padding-bottom:14px; margin-bottom:24px; }
      #reciboImpressao .recibo-logo { max-width:105px; max-height:75px; object-fit:contain; }
      #reciboImpressao .recibo-assinatura { margin:65px auto 0; text-align:center; width:240px; border-top:1px solid #444; padding-top:8px; }
      #reciboImpressao p { margin:5px 0; line-height:1.4; }
    }
  `;
  const area = document.createElement("section");
  area.id = "reciboImpressao";
  area.innerHTML = `
    <div class="recibo-cabecalho"><div><h1 style="font-size:20px;margin:0 0 5px">${esc(dados.responsavel || "Responsável")}</h1>
    ${dados.documento ? `<p>CPF/CNPJ: ${esc(dados.documento)}</p>` : ""}
    ${dados.celular ? `<p>WhatsApp: ${esc(dados.celular)}</p>` : ""}
    ${dados.endereco ? `<p>${esc(dados.endereco)}</p>` : ""}</div>${logo}</div>
    <h2 style="text-align:center;font-size:18px;margin:24px 0">RECIBO DE PAGAMENTO</h2>
    <p><strong>Recebemos de:</strong> ${esc(dados.aluno || "Aluno")}</p>
    <p><strong>Data da venda:</strong> ${esc(dados.data || "—")}</p>
    <p><strong>Forma de pagamento:</strong> ${esc(dados.pagamento || "Não informada")}</p>
    <p><strong>Situação:</strong> ${esc(dados.status || "CONFIRMADA")}</p>
    <table><thead><tr><th>Descrição</th><th class="center">Qtd.</th><th class="right">Valor unit.</th><th class="right">Total</th></tr></thead><tbody>${itens}</tbody></table>
    <div class="recibo-total">Total: ${esc(dados.total || "R$ 0,00")}</div>
    ${dados.desconto ? `<p><strong>Desconto aplicado:</strong> ${esc(dados.desconto)}</p>` : ""}
    ${dados.devolvido ? `<p><strong>Devoluções registradas:</strong> ${esc(dados.devolvido)}</p>` : ""}
    ${dados.observacoes ? `<p style="white-space:pre-wrap"><strong>Observações:</strong> ${esc(dados.observacoes)}</p>` : ""}
    <p>Este recibo comprova o registro da venda acima. Guarde-o para seu controle.</p>
    <div class="recibo-assinatura"><strong>${esc(dados.responsavel || "Responsável")}</strong><br>Responsável</div>`;
  const anterior = document.getElementById("reciboImpressao");
  if (anterior) anterior.remove();
  document.body.appendChild(area);
  document.body.classList.add("printing-receipt");
  const limpar = () => {
    document.body.classList.remove("printing-receipt");
    area.remove();
    window.removeEventListener("afterprint", limpar);
  };
  window.addEventListener("afterprint", limpar, { once: true });
  // Chamada direta, igual à impressão dos contratos e relatórios.
  window.print();
}
  async function printInstructorSaleReceipt(saleId) {
    const sale = state.sales.find(item => String(item.id) === String(saleId));
    if (!sale) return showMessage("Venda não encontrada.");
    const items = state.saleItems.filter(item => item.sale_id === sale.id);
    const profile = state.contractorProfile || {};
    const responsible = profile.contratante_nome || profile.nome_empresa || state.profile?.nome || "Instrutor";
    const rows = items.map(item => {
      const info = refundableInstructorItem(item);
      const quantity = info.type === "produto" ? Number(item.quantidade || 0) : Number(item.aulas_contratadas || 0);
      const unit = info.type === "produto"
        ? (quantity ? Number(item.subtotal || item.valor_liquido || 0) / quantity : 0)
        : Number(item.valor_por_aula || 0);
      return {
        descricao: item.descricao || "Item", quantidade: quantity,
        unitario: currency(unit), total: currency(item.subtotal ?? item.valor_liquido ?? 0)
      };
    });
    try {
      await abrirReciboComoPDF({
        responsavel: responsible, documento: profile.contratante_documento || "", logo: state.logoUrl || "",
        celular: profile.contratante_celular || "", endereco: profile.contratante_endereco || "",
        aluno: studentName(sale.student_id), data: formatDate(sale.data_venda),
        pagamento: sale.forma_pagamento || "Não informada",
        status: sale.status === "confirmada" ? "CONFIRMADA" : "CANCELADA",
        itens: rows, total: currency(sale.total), observacoes: sale.observacoes || ""
      });
    } catch (error) {
      showMessage(error.message || "Não foi possível gerar o PDF do recibo.");
    }
  }

  function openInstructorRefundForm(saleId = null) {
    const availableSales = state.sales.map(sale => ({
      sale,
      items: state.saleItems.filter(item => item.sale_id === sale.id)
        .map(item => ({ item, ...refundableInstructorItem(item) }))
        .filter(entry => entry.available > 0)
    })).filter(group => group.sale.status === "confirmada" && group.items.length > 0);
    if (!availableSales.length) {
      showMessage("Não existem vendas confirmadas com itens disponíveis para devolução.");
      return;
    }
    const form = el("formDevolucaoInstrutor");
    form.reset();
    el("tituloDevolucaoInstrutor").textContent = "Devolução de produtos e serviços";
    const saleSelect = el("devolucaoVendaInstrutor");
    let saleSearch = el("buscaVendaDevolucaoInstrutor");
    if (!saleSearch) {
      saleSearch = document.createElement("input");
      saleSearch.type = "search";
      saleSearch.id = "buscaVendaDevolucaoInstrutor";
      saleSearch.placeholder = "Pesquisar venda por aluno ou data";
      saleSearch.setAttribute("aria-label", "Pesquisar venda por aluno ou data");
      saleSelect.insertAdjacentElement("beforebegin", saleSearch);
    }
    saleSearch.value = "";
    const preencherVendas = (termo = "") => {
      const normalized = termo.trim().toLocaleLowerCase("pt-BR");
      const matches = availableSales.filter(group => {
        const name = studentName(group.sale.student_id).toLocaleLowerCase("pt-BR");
        const date = String(group.sale.data_venda || "");
        return !normalized || name.includes(normalized) || date.includes(normalized) || formatDate(date).toLocaleLowerCase("pt-BR").includes(normalized);
      });
      saleSelect.innerHTML = '<option value="">' + (normalized ? "Selecione a venda encontrada" : "Digite para pesquisar uma venda") + '</option>' +
        matches.map(group => '<option value="' + escapeHtml(group.sale.id) + '">' +
          escapeHtml(studentName(group.sale.student_id)) + ' · ' + escapeHtml(formatDate(group.sale.data_venda)) +
          ' · ' + currency(group.sale.total) + '</option>').join("");
    };
    preencherVendas();
    saleSearch.oninput = () => {
      state.refundSaleId = null;
      el("resumoVendaDevolucaoInstrutor").textContent = "Selecione uma venda encontrada na pesquisa.";
      el("devolucaoItensListaInstrutor")?.replaceChildren();
      preencherVendas(saleSearch.value);
    };
    saleSelect.value = "";
    if (saleId && availableSales.some(group => String(group.sale.id) === String(saleId))) {
      const selected = availableSales.find(group => String(group.sale.id) === String(saleId));
      saleSearch.value = studentName(selected.sale.student_id);
      preencherVendas(saleSearch.value);
      saleSelect.value = saleId;
    }
    state.refundSaleId = null;
    const itemSelect = el("devolucaoItemInstrutor");
    const quantityField = el("devolucaoQuantidadeInstrutor");
    itemSelect.disabled = true;
    quantityField.disabled = true;
    itemSelect.closest("label")?.setAttribute("hidden", "");
    quantityField.closest("label")?.setAttribute("hidden", "");
    let host = el("devolucaoItensListaInstrutor");
    if (!host) {
      host = document.createElement("div");
      host.id = "devolucaoItensListaInstrutor";
      host.className = "refund-item-quantity-list";
      el("resumoVendaDevolucaoInstrutor").insertAdjacentElement("afterend", host);
    }
    host.innerHTML = '<p>Selecione uma venda para visualizar os itens.</p>';
    el("resumoVendaDevolucaoInstrutor").textContent = "Pesquise e selecione uma venda para visualizar somente os itens dela.";
    el("devolucaoPreviaInstrutor").innerHTML = "<strong>Resumo da devolução</strong><p>Selecione uma venda e informe as quantidades de um ou mais itens.</p>";
    form.onsubmit = saveInstructorRefund;
    openInstructorModal("formDevolucaoInstrutor");
    if (saleSelect.value) updateInstructorRefundSaleSelection();
  }

  function updateInstructorRefundSaleSelection() {
    const saleId = el("devolucaoVendaInstrutor").value;
    const sale = state.sales.find(item => String(item.id) === String(saleId) && item.status === "confirmada");
    state.refundSaleId = sale?.id || null;
    const items = sale ? state.saleItems.filter(item => item.sale_id === sale.id)
      .map(item => ({ item, ...refundableInstructorItem(item) }))
      .filter(entry => entry.available > 0) : [];
    el("resumoVendaDevolucaoInstrutor").innerHTML = sale
      ? '<strong>' + escapeHtml(studentName(sale.student_id)) + '</strong><span>' +
        escapeHtml(formatDate(sale.data_venda)) + ' · ' + escapeHtml(sale.forma_pagamento || "Pagamento não informado") +
        '</span><span>Valor da venda: ' + currency(sale.total) + '</span>'
      : "Selecione uma venda para visualizar os itens disponíveis.";
    const host = el("devolucaoItensListaInstrutor");
    host.innerHTML = sale && items.length ? items.map(entry => {
      const item = entry.item;
      const product = entry.type === "produto";
      const purchased = Number(product ? item.quantidade || 0 : item.aulas_contratadas || 0);
      const returned = Number(product ? item.quantidade_devolvida || 0 : item.aulas_devolvidas || 0);
      const unit = item.fixed_item_key === "aluguel_veiculo" ? "aluguel(is)" : product ? "unidade(s)" : "aula(s)";
      return '<article class="refund-item-quantity-card" data-instructor-refund-item="' + escapeHtml(item.id) + '" data-max="' + entry.available + '" data-unit-value="' + entry.unitValue + '" data-net-value="' + entry.netValue + '" data-refunded-value="' + Number(item.valor_devolvido || 0) + '">' +
        '<div><strong>' + escapeHtml(item.descricao || "Item") + '</strong><span>Comprado: ' + purchased + ' · Já devolvido: ' + returned + ' · Disponível: ' + entry.available + ' ' + unit + '</span></div>' +
        '<label>Quantidade a devolver<input type="number" data-instructor-refund-qty min="0" max="' + entry.available + '" step="1" value="0" inputmode="numeric"></label></article>';
    }).join("") : '<p>Esta venda não possui itens disponíveis para devolução.</p>';
    host.querySelectorAll("[data-instructor-refund-qty]").forEach(input => input.addEventListener("input", updateInstructorRefundPreview));
    updateInstructorRefundPreview();
  }

  function updateInstructorRefundPreview() {
    const host = el("devolucaoItensListaInstrutor");
    const rows = [...host.querySelectorAll("[data-instructor-refund-item]")];
    const chosen = [];
    let invalid = false;
    for (const row of rows) {
      const field = row.querySelector("[data-instructor-refund-qty]");
      const quantity = Number(field.value || 0);
      const max = Number(field.max);
      if (field.value !== "" && (!Number.isInteger(quantity) || quantity < 0 || quantity > max)) invalid = true;
      if (quantity > 0) {
        const refund = Math.min(Number(row.dataset.unitValue) * quantity,
          Math.max(0, Number(row.dataset.netValue) - Number(row.dataset.refundedValue)));
        chosen.push({ quantity, refund });
      }
    }
    const total = chosen.reduce((sum, item) => sum + item.refund, 0);
    el("devolucaoPreviaInstrutor").innerHTML = invalid
      ? "<strong>Confira as quantidades</strong><p>Use números inteiros dentro do saldo disponível de cada item.</p>"
      : chosen.length
        ? "<strong>Resumo da devolução</strong><p>Itens selecionados: <strong>" + chosen.length + "</strong></p><p class=\"refund-preview-total\">Estorno estimado: <strong>" + currency(total) + "</strong></p>"
        : "<strong>Resumo da devolução</strong><p>Informe a quantidade de pelo menos um item.</p>";
    return { chosen, invalid };
  }

  async function saveInstructorRefund(event) {
    event.preventDefault();
    const sale = state.sales.find(item => String(item.id) === String(state.refundSaleId) && item.status === "confirmada");
    const host = el("devolucaoItensListaInstrutor");
    const rows = [...host.querySelectorAll("[data-instructor-refund-item]")];
    const items = rows.map(row => ({
      sale_item_id: row.dataset.instructorRefundItem,
      quantity: Number(row.querySelector("[data-instructor-refund-qty]").value)
    })).filter(item => item.quantity > 0);
    const invalid = rows.some(row => {
      const field = row.querySelector("[data-instructor-refund-qty]");
      return field.value !== "" && (!Number.isInteger(Number(field.value)) || Number(field.value) < 0 || Number(field.value) > Number(field.max));
    });
    if (!sale || !items.length || invalid) {
      showMessage("Selecione uma venda e informe quantidades válidas para um ou mais itens.");
      return;
    }
    const button = el("btnConfirmarDevolucaoInstrutor");
    button.disabled = true;
    button.textContent = "Registrando...";
    try {
      const { error } = await state.supabase.rpc("refund_sale_items_batch", { p_items: items });
      if (error) throw error;
      closeInstructorModal("formDevolucaoInstrutor");
      formReset();
      state.refundSaleId = null;
      await loadOwnData();
      showMessage("Devolução registrada. Todos os itens selecionados foram processados juntos.", false);
    } catch (error) {
      console.error("Falha ao registrar devolução do instrutor:", error);
      showMessage(error.message || "Não foi possível registrar a devolução. Confira as quantidades disponíveis.");
    } finally {
      button.disabled = false;
      button.textContent = "Confirmar devolução";
    }
    function formReset() { el("formDevolucaoInstrutor").reset(); }
  }

  async function deleteInstructorSale(id) {
    const sale = state.sales.find(item => item.id === id);
    if (!sale) return;
    if (!await confirmAction("Deseja excluir esta venda? O saldo de aulas será ajustado. Se alguma aula deste pacote já tiver sido utilizada, a exclusão será bloqueada.")) return;
    try {
      const { error } = await state.supabase.rpc("delete_my_sale", { p_sale_id: id });
      if (error) throw error;
      await loadOwnData();
      showMessage("Venda excluída e saldo de aulas atualizado.", false);
    } catch (error) {
      console.error("Falha ao excluir venda do instrutor:", error);
      showMessage(error.message || "Não foi possível excluir esta venda.");
    }
  }

  async function loadFinancialData() {
    const { data, error } = await state.supabase.from("financial_transactions")
      .select("id,tipo,descricao,valor,data_movimento,status,student_id,sale_id,created_at")
      .eq("owner_id", state.user.id)
      .order("data_movimento", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    state.transactions = data || [];
    renderFinancial();
  }

  function renderFinancial() {
    const transactions = state.transactions.filter(item => String(item.status || "confirmado").toLowerCase() !== "cancelado");
    const income = transactions.filter(item => item.tipo === "entrada").reduce((sum, item) => sum + Number(item.valor || 0), 0);
    const expenses = transactions.filter(item => item.tipo === "saida").reduce((sum, item) => sum + Number(item.valor || 0), 0);
    el("financeEntradas").textContent = currency(income);
    el("financeDespesas").textContent = currency(expenses);
    el("financeSaldo").textContent = currency(income - expenses);
    const term = String(state.financialSearch || "").trim().toLocaleLowerCase("pt-BR");
    const filtered = [...state.transactions].filter(item => [
      item.descricao, item.tipo, formatDate(item.data_movimento), String(item.data_movimento || "")
    ].join(" ").toLocaleLowerCase("pt-BR").includes(term));
    el("contadorMovimentacoes").textContent = filtered.length + (filtered.length === 1 ? " movimentação" : " movimentações");
    const list = el("listaMovimentacoes");
    if (!filtered.length) {
      list.innerHTML = '<div class="empty-state">' + (state.transactions.length ? "Nenhuma movimentação encontrada." : "Nenhuma movimentação financeira cadastrada.") + '</div>';
      return;
    }
    list.innerHTML = filtered.map(item => {
      const isIncome = item.tipo === "entrada";
      const deleteButton = !isIncome && !item.sale_id
        ? '<button class="button button-danger button-small" type="button" data-expense-delete="' + escapeHtml(item.id) + '">Excluir despesa</button>'
        : "";
      return '<article class="finance-row"><div class="finance-row-icon ' + (isIncome ? "finance-income" : "finance-expense") + '">' + (isIncome ? "↗" : "↙") + '</div><div class="finance-row-main"><strong>' + escapeHtml(item.descricao) + '</strong><span>' + escapeHtml(formatDate(item.data_movimento)) + ' · ' + (isIncome ? "Entrada" : "Despesa") + '</span></div><strong class="finance-row-value ' + (isIncome ? "finance-income-text" : "finance-expense-text") + '">' + (isIncome ? "+" : "−") + currency(item.valor) + '</strong>' + deleteButton + '</article>';
    }).join("");
  }

  async function saveFinancialTransaction(event) {
    event.preventDefault();
    const button = el("btnSalvarMovimentacao");
    const transaction = {
      owner_id: state.user.id,
      tipo: el("movimentoTipo").value,
      descricao: el("movimentoDescricao").value.trim(),
      valor: Number(el("movimentoValor").value),
      data_movimento: el("movimentoData").value,
      status: "confirmado"
    };
    if (!transaction.descricao || !Number.isFinite(transaction.valor) || transaction.valor <= 0 || !transaction.data_movimento) {
      showMessage("Informe descrição, valor e data válidos.");
      return;
    }
    button.disabled = true;
    button.textContent = "Salvando...";
    try {
      const { error } = await state.supabase.from("financial_transactions").insert(transaction);
      if (error) throw error;
      closeInstructorModal("formMovimentacao");
      el("formMovimentacao").reset();
      el("movimentoData").value = localToday();
      await loadFinancialData();
      showMessage("Movimentação registrada com sucesso.", false);
    } catch (error) {
      console.error("Falha ao registrar movimentação financeira:", error);
      showMessage("Não foi possível registrar a movimentação. Confira os dados e tente novamente.");
    } finally {
      button.disabled = false;
      button.textContent = "Registrar movimentação";
    }
  }


  async function deleteInstructorExpense(id) {
    const transaction = state.transactions.find(item =>
      item.id === id && item.tipo === "saida" && !item.sale_id
    );
    if (!transaction) return;
    if (!await confirmAction("Deseja excluir esta despesa?")) return;
    try {
      const { error } = await state.supabase.from("financial_transactions")
        .delete()
        .eq("id", id)
        .eq("owner_id", state.user.id)
        .eq("tipo", "saida")
        .is("sale_id", null);
      if (error) throw error;
      await loadFinancialData();
      showMessage("Despesa excluída com sucesso.", false);
    } catch (error) {
      console.error("Falha ao excluir despesa do instrutor:", error);
      showMessage("Não foi possível excluir esta despesa. Confira suas permissões e tente novamente.");
    }
  }

  function updateInstructorContractStudentSelect() {
    const select = el("contratoAlunoInstrutor");
    if (!select) return;
    const selected = select.value;
    select.innerHTML = '<option value="">Preencher manualmente</option>' +
      state.students.map(student => '<option value="' + escapeHtml(student.id) + '">' + escapeHtml(student.nome) + '</option>').join("");
    if (state.students.some(student => student.id === selected)) select.value = selected;
  }

  function fillInstructorContractStudent() {
    const student = state.students.find(item => item.id === el("contratoAlunoInstrutor").value);
    if (!student) return;
    el("contratoNomeAluno").value = student.nome || "";
    el("contratoCpfAluno").value = student.cpf || "";
    el("contratoCategoriaAluno").value = student.categoria || "";
  }

  function moneyInWordsForContract(value) {
    const amount = Math.round((Number(value) + Number.EPSILON) * 100);
    const units = ["zero","um","dois","três","quatro","cinco","seis","sete","oito","nove"];
    const teens = ["dez","onze","doze","treze","quatorze","quinze","dezesseis","dezessete","dezoito","dezenove"];
    const tens = ["","","vinte","trinta","quarenta","cinquenta","sessenta","setenta","oitenta","noventa"];
    const hundreds = ["","cento","duzentos","trezentos","quatrocentos","quinhentos","seiscentos","setecentos","oitocentos","novecentos"];
    function words999(n) {
      if (n === 0) return "zero";
      if (n === 100) return "cem";
      const c = Math.floor(n / 100), r = n % 100;
      let result = c ? hundreds[c] : "";
      if (r) result += (result ? " e " : "") + (r < 10 ? units[r] : r < 20 ? teens[r - 10] : tens[Math.floor(r / 10)] + (r % 10 ? " e " + units[r % 10] : ""));
      return result;
    }
    const reais = Math.floor(amount / 100), cents = amount % 100;
    const realWords = reais < 1000 ? words999(reais) : String(reais);
    const centsWords = cents ? (cents === 1 ? " um centavo" : " " + words999(cents) + " centavos") : "";
    const formatted = (reais / 1000 >= 1 ? reais.toLocaleString("pt-BR") : String(reais)) + "," + String(cents).padStart(2, "0");
    return "R$ " + formatted + " (" + (reais === 1 ? "um real" : realWords + " reais") + centsWords + ")";
  }

  function generateInstructorContract() {
    const contratanteNome = el("contratanteNome").value.trim();
    const contratanteDocumento = el("contratanteDocumento").value.trim();
    const contratanteCelular = el("contratanteCelular").value.trim();
    const contratanteNacionalidade = el("contratanteNacionalidade").value.trim();
    const contratanteCivil = el("contratanteCivil").value.trim();
    const contratanteProfissao = el("contratanteProfissao").value.trim();
    const contratanteEndereco = el("contratanteEndereco").value.trim();
    const nome = el("contratoNomeAluno").value.trim();
    const cpf = el("contratoCpfAluno").value.trim();
    const categoria = el("contratoCategoriaAluno").value;
    const aulas = Number(el("contratoQuantidadeAulas").value);
    const valor = Number(el("contratoValor").value);
    const pagamento = el("contratoPagamento").value.trim();
    if (!contratanteNome || !contratanteDocumento) {
      showMessage("Preencha nome e CPF/CNPJ no menu Meu cadastro antes de gerar o contrato.");
      return;
    }
    if (!nome || !cpf || !categoria || !Number.isInteger(aulas) || aulas < 1 ||
        !Number.isFinite(valor) || valor <= 0 || !pagamento) {
      showMessage("Preencha nome, CPF, categoria, quantidade de aulas, valor e forma de pagamento do aluno.");
      return;
    }

    const city = el("contratoCidade").value.trim() || "Governador Valadares";
    const instructor = contratanteNome;
    const cartao = el("contratoCartaoMoto").checked ? "CARTÃO MOTO PISTA" : "";
    const aluguel = el("contratoAluguelVeiculo").checked ? "ALUGUEL DO VEÍCULO PARA EXAME PRÁTICO" : "";
    const services = ["Pacote de aulas adquirido", cartao, aluguel].filter(Boolean).join(", ");
    const money = moneyInWordsForContract(valor);
    const safe = escapeHtml;
    const contractorQualification = [contratanteNacionalidade, contratanteCivil, contratanteProfissao].filter(Boolean).map(safe).join(" · ");
    const clauses = [
      "<p>O CONTRATADO compromete-se a fornecer ao CONTRATANTE os seguintes serviços: " + safe(services) + ".</p>",
      "<p>O CONTRATANTE deverá estar com o pagamento em dia para o agendamento de aulas práticas e para marcação de exames junto ao DETRAN.</p>",
      "<h3>1. MATRÍCULAS</h3><p>Pelos serviços contratado(s) " + safe(categoria) + " com " + aulas + " aulas, " + safe(services) + ", o CONTRATANTE paga ao CONTRATADO a importância de " + safe(money) + ", da seguinte forma: " + safe(pagamento) + ".</p>",
      "<h3>SÃO OBRIGAÇÕES DO CONTRATADO:</h3><p>2- A realização das aulas práticas e disponibilizar ao Candidato, para a realização das aulas práticas e exame, veículos em boas condições de uso, de acordo com a sua disponibilidade.</p>",
      "<h3>3- SÃO OBRIGAÇÕES DO CONTRATANTE:</h3>" +
        "<p>3.1- Caso seja necessária a realização de novos exames o Aluno deverá arcar com as novas taxas cobradas.</p>" +
        "<p>3.2- Para marcação de retestes do CONTRATANTE junto ao DETRAN, seja por não comparecimento ou reprovação em exames, o mesmo deverá pagar ao CONTRATADO os valores referentes ao pagamento de novo aluguel do veículo quantas vezes for necessário para a conclusão do curso.</p>" +
        "<p>3.3- Em caso de adição ou mudança de categoria, o número mínimo necessário de aulas práticas será de 02 aulas práticas na categoria devidamente inclusa no presente contrato. Se houver necessidade de mais aulas que a carga horária obrigatória, o mesmo deverá adquiri-las com o CONTRATADO.</p>" +
        "<p>3.4- O CONTRATANTE está ciente e concorda que o processo de habilitação terá início assim que houver vaga do contratado, para as aulas práticas.</p>" +
        "<p>3.5- Observar e cumprir estrita e rigorosamente tudo o que lhe for determinado durante o aprendizado, inclusive no que diz respeito aos horários de aulas práticas, às quais o CONTRATANTE deverá chegar com antecedência mínima de 10 (dez) minutos do horário marcado para início. Havendo atraso do mesmo, a aula será reposta mediante pagamento da multa no valor de R$ 20,00 (vinte reais).</p>" +
        "<p>3.6- Quando o CONTRATANTE solicitar serviços junto ao CONTRATADO, deverá retirá-los nas datas indicadas nas solicitações, sob pena de perder os serviços solicitados e incorrer em novas taxas do DETRAN, bem como novos honorários do CONTRATADO.</p>" +
        "<p>3.7- É obrigação de o CONTRATANTE entrar em contato com o CONTRATADO, no prazo de 48 horas após ter requerido a marcação de seus exames para que tome ciência da data marcada e posteriormente retire o protocolo junto ao CONTRATADO.</p>" +
        "<p>3.8- Na impossibilidade de comparecer às aulas, o (a) CONTRATANTE deverá cientificar o CONTRATADO, com antecedência mínima de 24 (vinte e quatro) horas, para que seja efetivada a transferência das referidas aulas. O não cumprimento implicará em novos valores para aulas não canceladas. Para as aulas marcadas nas segundas-feiras o prazo de adiamento e transferências será até às 12h00min (doze horas) do Sábado que as antecede. A transferência fora da hipótese acima NÃO OCORRERÁ, devendo o CONTRATANTE adquirir novas aulas.</p>" +
        "<p>3.9- Os exames marcados no DETRAN são INTRANSMISSÍVEIS e se realizarão independente das condições climáticas, devendo o CONTRATANTE comparecer aos mesmos na data marcada no PROTOCOLO DO DETRAN, com um mínimo de 30 (trinta) minutos de antecedência dos mesmos, portando Carteira de Identidade, LADV, protocolo do DETRAN e lentes corretivas visuais se for o caso.</p>" +
        "<p>3.10- O CONTRATANTE após autorização do INSTRUTOR, para a marcação do exame prático, deverá dirigir-se ao CONTRATADO, no prazo máximo de 48 (quarenta e oito) horas para efetivar a solicitação de marcação dos mesmos, sob pena, de ter que submeter-se a nova avaliação prática através da aquisição de novas aulas.</p>" +
        "<p>3.11- É obrigatório portar carteira de identidade e LADV enquanto o Aluno estiver frequentando as aulas e realizando os exames. A falta destes documentos impedirá a participação nas aulas e realização de exames junto ao DETRAN.</p>" +
        "<p>3.12- Da mesma forma, é necessária a utilização de calçado adequado para a realização das aulas e dos exames práticos sob pena do Aluno não poder realizá-los. A perda da aula ou do exame, quando decorrer do fato do aluno estar utilizando vestimenta incompatível é de inteira responsabilidade do CONTRATANTE, razão pela qual a aula e o exame só serão repostos após novo pagamento.</p>" +
        "<p>3.13- Os Alunos matriculados no curso prático de condução para qualquer das categorias assumem o risco por eventuais acidentes que possam lhe ocorrer.</p>" +
        "<p>3.14- O CONTRATANTE compromete-se a informar qualquer alteração do seu telefone junto ao contratado, durante a vigência deste contrato, sob pena de não responsabilizar o CONTRATADO por danos decorrentes da impossibilidade ou dificuldade de comunicação.</p>" +
        "<p>3.15- O CONTRATANTE autoriza, desde o ato de assinatura desse contrato, em caráter irretratável, irrevogável e de forma não onerosa o uso de sua imagem, seja foto ou vídeo, para utilizar e veicular em fins de publicidade institucional, sem qualquer limitação de número de inserções e reproduções junto ao site e às redes sociais do CONTRATADO, na internet e extranet do CONTRATADO.</p>",
      "<h3>4. CONDIÇÕES GERAIS:</h3>" +
        "<p>4.1- O CONTRATANTE não comparecendo junto ao CONTRATADO no prazo de 90 dias para qualquer utilização do serviço CONTRATADO deverá efetuar nova matrícula obedecendo a disponibilidade do CONTRATADO.</p>" +
        "<p>4.2- O CONTRATADO não se responsabilizará por falhas que decorram de erro no sistema de informações do DETRAN e que comprometam a autenticação e reconhecimento das aulas. Neste caso o CONTRATADO realizará o reagendamento apenas após resposta conclusiva do DETRAN.</p>" +
        "<p>4.3- Nas aulas práticas contar-se-á o tempo a partir do momento que o veículo for colocado à disposição do CONTRATANTE, desde a locomoção até a área de treinamento e o retorno à sede do CONTRATADO, mesmo que realizado pelo Instrutor.</p>" +
        "<p>4.4- O CONTRATANTE fica ciente desde já, que a disponibilidade de vagas junto ao DETRAN para exames independe da vontade do CONTRATADO, além deste não assumir compromissos com datas e horários para marcação dos exames.</p>" +
        "<p>4.5- Conforme previsão legal contida na Resolução 168/04 CONTRAN, os processos de primeira habilitação, obrigatoriamente, deverão estar concluídos no prazo de 12 (doze) meses, contados da data de abertura dos mesmos, sob pena de cancelamento.</p>" +
        "<p>4.6- Depois de firmado o presente CONTRATO DE PRESTAÇÃO DE SERVIÇOS o mesmo poderá ser cancelado desde que o CONTRATANTE efetue o pagamento dos serviços prestados pelo CONTRATADO.</p>" +
        "<p>4.7- A título de custos administrativos será cobrado do CONTRATANTE 20% (vinte por cento) sobre o valor a ser devolvido no prazo de até 120 dias.</p>" +
        "<p>4.8- Assim CONTRATADO e CONTRATANTE firmam o presente contrato em duas vias de igual teor e forma, para os fins de direito, ficando eleito o Foro Regional da cidade, para dirimir quaisquer divergências decorrentes deste contrato. Passando o prazo estipulado, a importância paga não será devolvida, poderá ser feita somente a transferência para outro CONTRATADO, com o mesmo pagando a diferença em caso de reajuste. NÃO FAZEMOS TRANSFERÊNCIA PARA OUTRO CPF.</p>"
    ];

    el("contratoPreviewInstrutor").innerHTML =
      '<article class="contract-sheet"><header style="display:flex;align-items:flex-start;justify-content:flex-start;gap:16px;text-align:left;">' + (state.logoUrl ? '<img src="' + safe(state.logoUrl) + '" alt="Logomarca do instrutor" style="display:block;flex:0 0 auto;max-width:110px;max-height:85px;object-fit:contain;margin:0;">' : '') + '<div class="contract-brand"><h2>' + safe(instructor) + '</h2><p>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</p></div></header>' +
      '<main><p><strong>CONTRATADO(A) / INSTRUTOR(A):</strong> ' + safe(instructor) + '</p><p><strong>CPF/CNPJ:</strong> ' + safe(contratanteDocumento) + '</p>' +
      (contratanteCelular ? '<p><strong>Telefone/WhatsApp:</strong> ' + safe(contratanteCelular) + '</p>' : "") +
      (contractorQualification ? '<p><strong>Qualificação:</strong> ' + contractorQualification + '</p>' : "") +
      (contratanteEndereco ? '<p><strong>Endereço:</strong> ' + safe(contratanteEndereco) + '</p>' : "") +
      '<p><strong>CONTRATANTE / ALUNO(A):</strong> ' + safe(nome) + '</p><p><strong>CPF:</strong> ' + safe(cpf) + '</p>' +
      clauses.join("") +
      '<p class="contract-place-date">' + safe(city) + ' - ______/______/________</p>' +
      '<div class="contract-signature-space" aria-hidden="true"></div>' +
      '<div class="contract-signatures"><div><span></span><strong>' + safe(instructor) + '</strong><small>CONTRATADO(A) / INSTRUTOR(A)</small></div>' +
      '<div><span></span><strong>' + safe(nome) + '</strong><small>CONTRATANTE / ALUNO(A) · CPF ' + safe(cpf) + '</small></div></div></main></article>';
    showMessage("Contrato completo gerado. Confira todos os dados e as cláusulas antes de imprimir.", false);
  }

  function printInstructorContract() {
    if (!el("contratoPreviewInstrutor").querySelector(".contract-sheet")) {
      showMessage("Gere a pré-visualização antes de imprimir.");
      return;
    }
    document.body.classList.add("printing-contract");
    window.print();
  }

  async function exportInstructorBackup() {
    const button = el("btnExportarBackupInstrutor");
    if (!button || !state.user) return;
    button.disabled = true;
    button.textContent = "Preparando backup...";
    try {
      const { data: transactions, error: transactionsError } = await state.supabase
        .from("financial_transactions")
        .select("id,tipo,descricao,valor,data_movimento,status,student_id,sale_id,created_at")
        .eq("owner_id", state.user.id);
      if (transactionsError) throw transactionsError;
      const { data: settings, error: settingsError } = await state.supabase
        .from("app_settings")
        .select("nome_empresa,cor_principal,cor_secundaria,logo_url,contratante_nome,contratante_documento,contratante_celular,contratante_endereco,aluguel_veiculo_preco,cartao_moto_pista_preco")
        .eq("owner_id", state.user.id).maybeSingle();
      if (settingsError) throw settingsError;
      const payload = {
        format: "central-do-instrutor-instructor-backup",
        version: 1,
        exported_at: new Date().toISOString(),
        owner_id: state.user.id,
        profile: { id: state.profile?.id || state.user.id, nome: state.profile?.nome || null, email: state.user.email || null },
        app_settings: settings || {},
        data: {
          students: state.students,
          lessons: state.lessons,
          vehicles: state.vehicles,
          products: state.products,
          sales: state.sales,
          sale_items: state.saleItems,
          financial_transactions: transactions || []
        }
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "backup-central-instrutor-" + localToday() + ".json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showMessage("Backup da sua conta exportado com sucesso.", false);
    } catch (error) {
      console.error("Falha ao exportar backup do instrutor:", error);
      showMessage("Não foi possível exportar o backup. Confira suas permissões e tente novamente.");
    } finally {
      button.disabled = false;
      button.textContent = "Exportar meu backup";
    }
  }

  async function loadOwnData() {
    // Escopo explícito por proprietário: o painel do instrutor nunca deve
    // montar listas com registros de outra conta, mesmo além das políticas RLS.
    const [studentsResult, lessonsResult, vehiclesResult] = await Promise.all([
      state.supabase.from("students")
        .select("id,nome,email,telefone,cpf,endereco,categoria,status,aulas_compradas,aulas_restantes,alugueis_comprados,alugueis_disponiveis")
        .eq("owner_id", state.user.id)
        .order("nome", { ascending: true }),
      state.supabase.from("lessons")
        .select("id,student_id,data_aula,horario,numero_aula,status,vehicle_id,observacoes")
        .eq("owner_id", state.user.id)
        .order("data_aula", { ascending: true })
        .order("horario", { ascending: true }),
      state.supabase.from("vehicles")
        .select("id,nome,tipo,categoria,placa")
        .eq("owner_id", state.user.id)
        .order("tipo", { ascending: true })
    ]);

    const firstError = studentsResult.error || lessonsResult.error || vehiclesResult.error;
    if (firstError) throw firstError;

    state.students = studentsResult.data || [];
    state.studentLinkFieldsAvailable = true;
    if (state.students.length) {
      const linkFieldsResult = await state.supabase.from("students")
        .select("id,user_id,invited_at")
        .eq("owner_id", state.user.id)
        .in("id", state.students.map(student => student.id));
      if (linkFieldsResult.error) {
        const errorCode = String(linkFieldsResult.error.code || "");
        const errorMessage = String(linkFieldsResult.error.message || "").toLowerCase();
        const missingLinkColumns = errorCode === "42703" || errorCode === "PGRST204" ||
          ((errorMessage.includes("user_id") || errorMessage.includes("invited_at")) &&
            (errorMessage.includes("column") || errorMessage.includes("schema cache")));
        if (!missingLinkColumns) throw linkFieldsResult.error;
        state.studentLinkFieldsAvailable = false;
      } else {
        const linkFieldsById = new Map((linkFieldsResult.data || []).map(item => [item.id, item]));
        state.students = state.students.map(student => ({
          ...student,
          user_id: linkFieldsById.get(student.id)?.user_id || null,
          invited_at: linkFieldsById.get(student.id)?.invited_at || null
        }));
      }
    }
    state.lessons = lessonsResult.data || [];
    state.vehicles = vehiclesResult.data || [];

    el("totalAlunos").textContent = state.students.length;
    el("totalRealizadas").textContent = state.lessons.filter(item =>
      ["realizada"].includes(String(item.status || "").toLowerCase())
    ).length;
    el("totalAgendadas").textContent = state.lessons.filter(item =>
      ["agendada"].includes(String(item.status || "").toLowerCase())
    ).length;

    renderStudents();
    renderLinkedStudents();
    renderVehicles();
    renderLessons();
    renderUpcomingLessons();
    await loadFinancialData();
    await loadProductsAndSales();
    updateStudentSelect();
    updateInstructorContractStudentSelect();
    const saleStudent = el("vendaAluno");
    saleStudent.innerHTML = '<option value="">Selecione um aluno</option>' + state.students.map(student => '<option value="' + escapeHtml(student.id) + '">' + escapeHtml(student.nome) + '</option>').join("");
    renderSales();
    updateLessonSelects();
  }

  function resetStudentForm() {
    state.studentEditingId = null;
    el("formAluno").reset();
    el("tituloFormAluno").textContent = "Cadastrar aluno";
    el("btnSalvarAluno").textContent = "Salvar aluno";
    closeInstructorModal("formAluno");
    el("formAluno").hidden = true;
  }

  function openStudentForm(student = null) {
    el("formAluno").reset();
    state.studentEditingId = student ? student.id : null;
    el("tituloFormAluno").textContent = student ? "Editar aluno" : "Cadastrar aluno";
    el("btnSalvarAluno").textContent = student ? "Salvar alterações" : "Salvar aluno";

    if (student) {
      el("alunoNome").value = student.nome || "";
      el("alunoEmail").value = student.email || "";
      el("alunoTelefone").value = student.telefone || "";
      el("alunoCpf").value = student.cpf || "";
      el("alunoEndereco").value = student.endereco || "";
      el("alunoCategoria").value = student.categoria || "";
      el("alunoStatus").value = student.status || "em_aberto";
      el("alunoAulasCompradas").value = student.aulas_compradas ?? 0;
    }

    el("formAluno").hidden = false;
    openInstructorModal("formAluno");
    el("alunoNome").focus();
  }

  async function saveStudent(event) {
    event.preventDefault();
    const button = el("btnSalvarAluno");
    const student = {
      nome: el("alunoNome").value.trim(),
      email: el("alunoEmail").value.trim().toLowerCase() || null,
      telefone: el("alunoTelefone").value.trim() || null,
      cpf: el("alunoCpf").value.trim() || null,
      endereco: el("alunoEndereco").value.trim() || null,
      categoria: el("alunoCategoria").value || null,
      status: el("alunoStatus").value
    };
    const purchasedLessons = Number(el("alunoAulasCompradas").value);
    if (!Number.isInteger(purchasedLessons) || purchasedLessons < 0) {
      showMessage("Informe uma quantidade válida de aulas contratadas.");
      el("alunoAulasCompradas").focus();
      return;
    }
    const completedLessons = state.lessons.filter(item =>
      item.student_id === state.studentEditingId &&
      String(item.status || "").toLowerCase() === "realizada"
    ).length;
    if (purchasedLessons < completedLessons) {
      showMessage("A quantidade contratada não pode ser menor que o total de aulas já realizadas.");
      el("alunoAulasCompradas").focus();
      return;
    }
    student.aulas_compradas = purchasedLessons;
    student.aulas_restantes = purchasedLessons - completedLessons;

    if (!student.nome) {
      showMessage("Informe o nome do aluno.");
      el("alunoNome").focus();
      return;
    }

    button.disabled = true;
    button.textContent = "Salvando...";
    showMessage("");

    try {
      let result;
      if (state.studentEditingId) {
        result = await state.supabase.from("students")
          .update(student)
          .eq("id", state.studentEditingId);
      } else {
        result = await state.supabase.from("students")
          .insert({ ...student, owner_id: state.user.id });
      }
      if (result.error) throw result.error;

      resetStudentForm();
      await loadOwnData();
      showMessage("Aluno salvo com sucesso.", false);
    } catch (error) {
      console.error("Falha ao salvar aluno:", error);
      showMessage("Não foi possível salvar o aluno. Confira os dados e tente novamente.");
    } finally {
      button.disabled = false;
      button.textContent = state.studentEditingId ? "Salvar alterações" : "Salvar aluno";
    }
  }

  async function deleteStudent(id) {
    const student = state.students.find(item => item.id === id);
    if (!student) return;
    if (!await confirmAction('Deseja excluir o aluno "' + student.nome + '"?')) return;

    try {
      const { error } = await state.supabase.from("students").delete().eq("id", id);
      if (error) throw error;
      await loadOwnData();
      showMessage("Aluno excluído com sucesso.", false);
    } catch (error) {
      console.error("Falha ao excluir aluno:", error);
      showMessage("Não foi possível excluir este aluno. Se ele já possuir aulas vinculadas, mantenha o cadastro e apenas edite seus dados.");
    }
  }

  function reportTable(items, includeSignature) {
    const rows = sortLessons(items);
    if (!rows.length) return '<div class="empty-state">Nenhuma aula encontrada para os filtros informados.</div>';

    return '<div class="table-wrap"><table><thead><tr>' +
      '<th>Data</th><th>Horário</th><th>Aluno</th><th>Veículo</th><th>Aula</th><th>Situação</th>' +
      (includeSignature ? '<th>Assinatura</th>' : '') +
      '</tr></thead><tbody>' +
      rows.map(lesson => {
        const status = String(lesson.status || "—");
        const statusClass = ["Realizada", "realizada"].includes(status) ? "status status-realizada" : "status";
        return '<tr>' +
          '<td>' + escapeHtml(formatDate(lesson.data_aula)) + '</td>' +
          '<td>' + escapeHtml(lesson.horario || "—") + '</td>' +
          '<td>' + escapeHtml(studentName(lesson.student_id)) + '</td>' +
          '<td>' + escapeHtml(vehicleName(lesson.vehicle_id)) + '</td>' +
          '<td>' + escapeHtml(lesson.numero_aula ?? "—") + '</td>' +
          '<td><span class="' + statusClass + '">' + escapeHtml(status) + '</span></td>' +
          (includeSignature ? '<td>________________</td>' : '') +
          '</tr>';
      }).join("") +
      '</tbody></table></div>';
  }

  function showReport(title, subtitle, items, includeSignature = false, summary = "") {
    const rows = sortLessons(items);
    const reportLogo = state.logoUrl && /^(https?:|data:image\/)/i.test(state.logoUrl)
      ? '<img class="report-logo" src="' + escapeHtml(state.logoUrl) + '" alt="Logomarca do instrutor">' : "";
    el("resultado").innerHTML =
      '<div class="result-heading">' + reportLogo + '<div class="result-title"><h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(subtitle) + '</p></div>' +
      '<button id="btnImprimir" class="button print-button" type="button">Imprimir / PDF</button></div>' +
      (summary ? '<div class="result-summary">' + summary + '</div>' : '') +
      reportTable(rows, includeSignature);
    el("btnImprimir").addEventListener("click", () => window.print());
    showMessage(rows.length ? rows.length + " aula(s) encontrada(s)." : "Não há aulas para exibir.", false);
  }

  function reportByStudent() {
    const id = el("filtroAluno").value;
    if (!id) { showMessage("Selecione um aluno."); return; }
    const student = state.students.find(item => item.id === id);
    const lessons = state.lessons.filter(item => item.student_id === id);
    const summary = '<span>Contratadas: <strong>' + escapeHtml(student.aulas_compradas ?? "—") +
      '</strong></span><span>Restantes: <strong>' + escapeHtml(student.aulas_restantes ?? "—") +
      '</strong></span><span>Realizadas: <strong>' +
      lessons.filter(item => ["Realizada", "realizada"].includes(item.status)).length + '</strong></span>';
    showReport("Relatório por aluno", student.nome + " · Categoria " + (student.categoria || "—"), lessons, false, summary);
  }

  function reportByPeriod() {
    const start = el("dataInicio").value;
    const end = el("dataFim").value;
    if (!start || !end) { showMessage("Informe a data inicial e a data final."); return; }
    if (start > end) { showMessage("A data inicial não pode ser posterior à data final."); return; }
    const lessons = state.lessons.filter(item => {
      const date = String(item.data_aula || "").slice(0, 10);
      return date >= start && date <= end;
    });
    showReport("Relatório por período", formatDate(start) + " até " + formatDate(end), lessons, false);
  }

  function reportDaily() {
    const date = el("dataDiaria").value;
    if (!date) { showMessage("Informe a data da lista diária."); return; }
    const lessons = state.lessons.filter(item =>
      String(item.data_aula || "").slice(0, 10) === date && !["Cancelada", "cancelada"].includes(item.status)
    );
    showReport("Lista diária de aulas", formatDate(date), lessons, true);
  }

  async function signOut() {
    await state.supabase.auth.signOut({ scope: "local" });
    window.location.replace("index.html");
  }

  function renderAccessBlocked() {
    document.body.innerHTML = '<main class="access-blocked-page"><section class="access-blocked-card">' +
      '<div class="access-blocked-icon" aria-hidden="true">🔒</div>' +
      '<h1>Acesso temporariamente bloqueado</h1>' +
      '<p>Sua autorização ainda não foi liberada ou já venceu.</p>' +
      '<p>Seu cadastro e sua conta são conectados automaticamente. Para liberar ou renovar o acesso, regularize seu plano na Central do Instrutor.</p>' +
      '<p><a href="https://central-do-instrutor.pages.dev/" target="_blank" rel="noopener noreferrer">Abrir Central do Instrutor</a></p>' +
      '<button id="btnSairAcessoBloqueado" type="button">Sair</button>' +
      '</section></main>';
    el("btnSairAcessoBloqueado").addEventListener("click", signOut);
  }

  function renderAccessCountdown(accessUntil) {
    const banner = el("avisoValidadeAcesso");
    if (!banner) return;

    let expiresAt = new Date(accessUntil).getTime();
    const maxTimeout = 24 * 60 * 60 * 1000;
    let intervalId = null;
    let refreshIntervalId = null;
    let expirationTimeoutId = null;
    let blocked = false;
    let refreshInFlight = false;

    const refreshFromServer = async () => {
      const { data, error } = await state.supabase.from("profiles")
        .select("id,nome,role,instructor_access_until").eq("id", state.user.id).maybeSingle();
      if (error) throw error;
      if (!data || data.role !== "instrutor") return false;
      state.profile = data;
      expiresAt = data.instructor_access_until ? new Date(data.instructor_access_until).getTime() : 0;
      return expiresAt > Date.now();
    };

    const blockAccess = async () => {
      if (blocked || refreshInFlight) return;
      refreshInFlight = true;
      try {
        if (await refreshFromServer()) {
          update();
          scheduleExpirationCheck();
          return;
        }
      } catch (error) {
        console.error("Não foi possível confirmar a validade do acesso:", error);
      } finally {
        refreshInFlight = false;
      }
      if (expiresAt > Date.now()) return;
      blocked = true;
      if (intervalId !== null) window.clearInterval(intervalId);
      if (refreshIntervalId !== null) window.clearInterval(refreshIntervalId);
      if (expirationTimeoutId !== null) window.clearTimeout(expirationTimeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      renderAccessBlocked();
    };

    const update = () => {
      if (blocked) return;
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        void blockAccess();
        return;
      }
      const days = Math.ceil(remaining / 86400000);
      banner.textContent = "Autorização ativa · faltam " + days +
        (days === 1 ? " dia para o bloqueio automático." : " dias para o bloqueio automático.");
      banner.classList.toggle("access-expiry-warning", days <= 3);
    };

    const scheduleExpirationCheck = () => {
      if (blocked) return;
      if (expirationTimeoutId !== null) window.clearTimeout(expirationTimeoutId);
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        void blockAccess();
        return;
      }
      expirationTimeoutId = window.setTimeout(() => {
        update();
        if (!blocked && expiresAt > Date.now()) scheduleExpirationCheck();
      }, Math.min(remaining, maxTimeout));
    };

    const refreshAccess = async () => {
      if (blocked || refreshInFlight) return;
      try {
        await refreshFromServer();
        update();
        if (!blocked && expiresAt > Date.now()) scheduleExpirationCheck();
      } catch (error) {
        console.error("Falha ao atualizar a validade do acesso:", error);
      }
    };

    function handleVisibilityChange() {
      if (!document.hidden) void refreshAccess();
    }

    state.refreshAccessCountdown = newAccessUntil => {
      expiresAt = newAccessUntil ? new Date(newAccessUntil).getTime() : 0;
      update();
      if (!blocked && expiresAt > Date.now()) scheduleExpirationCheck();
    };

    update();
    if (blocked) return;
    scheduleExpirationCheck();
    intervalId = window.setInterval(update, 60_000);
    refreshIntervalId = window.setInterval(() => void refreshAccess(), 60_000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  async function initialize() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("Não foi possível carregar o serviço de autenticação.");
    }

    state.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, storage: window.sessionStorage }
    });
    // Compartilha o cliente autenticado e o ambiente (QA/produção) com os módulos auxiliares.
    window.getMarcusSupabase = () => state.supabase;

    const { data: sessionData, error: sessionError } = await state.supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      window.location.replace("index.html");
      return;
    }

    state.user = sessionData.session.user;
    const { data: profile, error: profileError } = await state.supabase.from("profiles")
      .select("id,nome,role,instructor_access_until").eq("id", state.user.id).maybeSingle();

    if (profileError) throw profileError;
    if (!profile || profile.role !== "instrutor") {
      if (profile && profile.role === "admin") {
        window.location.replace("index.html");
      } else {
        await signOut();
      }
      return;
    }

    const accessUntil = profile.instructor_access_until ? new Date(profile.instructor_access_until).getTime() : 0;
    if (!accessUntil || accessUntil <= Date.now()) {
      renderAccessBlocked();
      return;
    }

    state.profile = profile;
    el("nomeInstrutor").textContent = profile.nome || state.user.email || "Instrutor";
    renderAccessCountdown(profile.instructor_access_until);
    await loadInstructorSettings();
    if (window.MarcusContractorProfile) {
      const obterCliente = () => state.supabase;
      const obterUsuario = () => state.user?.id || null;
      try {
        await window.MarcusContractorProfile.carregar(state.supabase, state.user.id);
      } catch (error) {
        console.error("Não foi possível carregar a identificação do contratante:", error);
        const status = el("statusDadosContratante");
        if (status) status.textContent = "Não foi possível carregar seus dados salvos. Você ainda pode preencher e salvar novamente.";
      }
      window.MarcusContractorProfile.vincular(obterCliente, obterUsuario);
    }
    await loadOwnData();
    window.addEventListener("marcus-rentals-updated", () => {
      loadOwnData().catch(error => console.error("Falha ao atualizar os aluguéis no cadastro dos alunos:", error));
    });

    el("btnNovoAluno").addEventListener("click", () => openStudentForm());
    el("filtroBuscaAlunos").addEventListener("input", event => {
      state.studentSearch = event.target.value;
      renderStudents();
    });
    el("btnCancelarAluno").addEventListener("click", resetStudentForm);
    el("formAluno").addEventListener("submit", saveStudent);
    el("listaAlunosVinculados").addEventListener("click", event => {
      const button = event.target.closest("[data-linked-student-action]");
      if (!button) return;
      if (button.dataset.linkedStudentAction === "remove") {
        removeStudentAppAccess(button.dataset.studentId);
      }
    });
    el("listaAlunos").addEventListener("click", async event => {
      const button = event.target.closest("[data-student-action]");
      if (!button) return;
      const id = button.dataset.studentId;
      const student = state.students.find(item => item.id === id);
      if (!student) return;
      if (button.dataset.studentAction === "exams") {
        if (window.MarcusExamsRentals?.openForStudent) await window.MarcusExamsRentals.openForStudent(id);
        else showMessage("O módulo de exames ainda está carregando. Atualize a página e tente novamente.");
        return;
      }
      if (button.dataset.studentAction === "edit") openStudentForm(student);
      if (button.dataset.studentAction === "delete") deleteStudent(id);
      if (button.dataset.studentAction === "view-link") {
        if (!state.studentLinkFieldsAvailable) {
          window.alert("O recurso de vínculo de contas estará disponível assim que a atualização do banco for concluída. Seus dados e aulas continuam acessíveis.");
          return;
        }
        const requestTime = student.invited_at ? new Date(student.invited_at).getTime() : NaN;
        const requestAge = Date.now() - requestTime;
        const requestPending = Boolean(student.invited_at) && Number.isFinite(requestTime) && requestAge >= 0 && requestAge < 15 * 60 * 1000;
        const situation = student.user_id
          ? student.invited_at
            ? "Conta vinculada ao cadastro correto. Falta o aluno concluir o primeiro acesso."
            : "Conta vinculada com sucesso ao cadastro deste aluno."
          : requestPending
            ? "Link enviado. Aguarde o titular do e-mail confirmar o acesso."
            : student.invited_at
              ? "A solicitação anterior expirou. É possível reenviar a confirmação."
              : "Nenhum convite enviado. O vínculo só será concluído depois que o titular do e-mail confirmar o acesso pelo link enviado.";
        window.alert("Vínculo da conta do aluno\n\n" + student.nome + "\n" +
          (student.email || "E-mail não informado") + "\n\nSituação: " + situation);
      }
      if (button.dataset.studentAction === "invite") {
        if (!state.studentLinkFieldsAvailable) {
          showMessage("O convite ficará disponível quando a atualização do banco for concluída.");
          return;
        }
        if (!student.email) {
          showMessage("Cadastre o e-mail do aluno antes de enviar o convite.");
          return;
        }
        const isRecovery = Boolean(student.user_id);
        const actionLabel = isRecovery ? "Reenviar link de acesso" : "Enviar convite ou confirmação de acesso";
        const confirmationText = actionLabel + " para " + student.nome + " (" + student.email + ")?\n\nConfira se este e-mail foi informado pelo próprio aluno. Se já existir uma conta com esse endereço, o titular receberá um link para confirmar o vínculo. O cadastro só será associado depois que ele abrir o link.";
        if (!await confirmAction(confirmationText)) return;
        button.disabled = true;
        button.textContent = isRecovery ? "Reenviando..." : "Enviando...";
        try {
          const { data, error } = await state.supabase.functions.invoke("admin-manage-instructors", {
            body: { action: "invite_student", student_id: student.id }
          });
          if (error) {
            let detail = "";
            try { detail = (await error.context.json()).error || ""; } catch (_) {}
            throw new Error(detail || "Não foi possível enviar o convite.");
          }
          if (!data?.ok) throw new Error(data?.error || "Não foi possível enviar o convite.");
          if (!student.user_id) student.invited_at = new Date().toISOString();
          showMessage(data.message || "Convite de aluno enviado com sucesso.", false);
          renderStudents();
        } catch (error) {
          showMessage(error.message || "Não foi possível enviar o convite.");
          button.disabled = false;
          button.textContent = student.user_id ? "Reenviar acesso" : student.invited_at ? "Reenviar confirmação" : "Convidar para área do aluno";
        }
      }
    });

    el("btnNovoVeiculo").addEventListener("click", () => openVehicleForm());
    el("filtroBuscaVeiculos").addEventListener("input", event => {
      state.vehicleSearch = event.target.value;
      renderVehicles();
    });
    el("btnCancelarVeiculo").addEventListener("click", resetVehicleForm);
    el("formVeiculo").addEventListener("submit", saveVehicle);
    el("listaVeiculos").addEventListener("click", event => {
      const button = event.target.closest("[data-vehicle-action]");
      if (!button) return;
      const id = button.dataset.vehicleId;
      const vehicle = state.vehicles.find(item => item.id === id);
      if (button.dataset.vehicleAction === "edit" && vehicle) openVehicleForm(vehicle);
      if (button.dataset.vehicleAction === "delete") deleteVehicle(id);
    });

    el("btnNovaAula").addEventListener("click", () => openLessonForm());
    el("btnAgendarLote").addEventListener("click", openBatchLessonForm);
    el("btnGerarDatasLote").addEventListener("click", generateBatchLessonRows);
    el("btnCancelarAulasLote").addEventListener("click", resetBatchLessonForm);
    el("formAulasLote").addEventListener("submit", saveBatchLessons);
    el("btnSalvarConfiguracoesInstrutor").addEventListener("click", saveInstructorSettings);
    el("btnRemoverLogoInstrutor").addEventListener("click", removeInstructorLogo);
    el("btnAgendarInicio").addEventListener("click", () => {
      navigateInstructorPage("aulas");
      openLessonForm();
    });
    el("proximasAulas").addEventListener("click", event => {
      const button = event.target.closest("[data-dashboard-lesson-action]");
      if (!button || button.disabled) return;
      changeScheduledLessonStatus(button.dataset.lessonId, button.dataset.dashboardLessonAction);
    });
    el("btnCancelarAula").addEventListener("click", resetLessonForm);
    el("formAula").addEventListener("submit", saveLesson);
    el("aulaAluno").addEventListener("change", updateLessonBalanceHint);
    el("filtroBuscaAulas").addEventListener("input", event => {
      state.lessonSearch = event.target.value;
      renderLessons();
    });
    el("filtroStatusAulas").addEventListener("change", event => {
      state.lessonStatusFilter = event.target.value;
      renderLessons();
    });
    el("listaAulas").addEventListener("click", event => {
      const button = event.target.closest("[data-lesson-action]");
      if (!button) return;
      const id = button.dataset.lessonId;
      const lesson = state.lessons.find(item => item.id === id);
      if (button.dataset.lessonAction === "edit" && lesson) openLessonForm(lesson);
      if (button.dataset.lessonAction === "delete") deleteLesson(id);
    });

    el("btnNovaMovimentacao").addEventListener("click", () => {
      el("formMovimentacao").reset();
      el("movimentoData").value = localToday();
      openInstructorModal("formMovimentacao");
      el("movimentoTipo").focus();
    });
    el("formMovimentacao").addEventListener("submit", saveFinancialTransaction);
    el("listaVendas").addEventListener("click", event => {
      const printButton = event.target.closest("[data-sale-print]");
      if (printButton) {
        printInstructorSaleReceipt(printButton.dataset.salePrint);
        return;
      }
      const refundButton = event.target.closest("[data-sale-refund]");
      if (refundButton) {
        openInstructorRefundForm(refundButton.dataset.saleRefund);
        return;
      }
      const deleteButton = event.target.closest("[data-sale-delete]");
      if (deleteButton) deleteInstructorSale(deleteButton.dataset.saleDelete);
    });
    el("btnDevolucaoFinanceiro").addEventListener("click", () => openInstructorRefundForm());
    el("devolucaoVendaInstrutor").addEventListener("change", updateInstructorRefundSaleSelection);
    el("devolucaoItemInstrutor").addEventListener("change", updateInstructorRefundPreview);
    el("devolucaoQuantidadeInstrutor").addEventListener("input", updateInstructorRefundPreview);
    el("btnCancelarDevolucaoInstrutor").addEventListener("click", () => {
      closeInstructorModal("formDevolucaoInstrutor");
      el("formDevolucaoInstrutor").reset();
      state.refundSaleId = null;
    });
    el("listaMovimentacoes").addEventListener("click", event => {
      const button = event.target.closest("[data-expense-delete]");
      if (button) deleteInstructorExpense(button.dataset.expenseDelete);
    });
    el("btnNovoProduto").addEventListener("click", () => openProductForm());
    el("btnCancelarProduto").addEventListener("click", resetProductForm);
    el("formProduto").addEventListener("submit", saveProduct);
    el("filtroBuscaProdutos").addEventListener("input", event => { state.productSearch = event.target.value; renderProducts(); });
    el("listaProdutos").addEventListener("click", event => {
      const button = event.target.closest("[data-product-action]");
      if (!button) return;
      const product = state.products.find(item => item.id === button.dataset.productId);
      if (button.dataset.productAction === "edit" && product) openProductForm(product);
      if (button.dataset.productAction === "toggle") toggleProduct(button.dataset.productId);
    });
    el("btnNovaVenda").addEventListener("click", () => {
      el("formVenda").reset();
      state.saleCart = [];
      renderSaleCart();
      const studentSelect = el("vendaAluno");
      if (studentSelect && !el("buscaClienteVendaInstrutor")) {
        const search = document.createElement("input");
        search.id = "buscaClienteVendaInstrutor";
        search.type = "search";
        search.className = "search-input";
        search.placeholder = "Pesquisar cliente/aluno pelo nome";
        search.setAttribute("aria-label", "Pesquisar cliente/aluno pelo nome");
        search.autocomplete = "off";
        studentSelect.parentNode.insertBefore(search, studentSelect);
        search.addEventListener("input", () => {
          const term = search.value.trim().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase("pt-BR");
          [...studentSelect.options].forEach(option => {
            if (!option.value) { option.hidden = false; return; }
            const name = option.textContent.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase("pt-BR");
            option.hidden = !name.includes(term);
          });
          if (studentSelect.selectedOptions[0]?.hidden) studentSelect.value = "";
        });
      }
      openInstructorModal("formVenda");
      el("vendaAluno").focus();
    });
    const addItemButton = el("btnAdicionarItemVenda");
    addItemButton.addEventListener("click", addSaleCartItem);
    if (addItemButton) {
      addItemButton.classList.add("button-add-item-highlight");
      addItemButton.textContent = "＋ Adicionar item";
      addItemButton.style.cssText = "display:flex;align-items:center;justify-content:center;gap:9px;width:100%;min-height:50px;margin:12px 0 6px;padding:13px 18px;border:2px solid #12345a;border-radius:12px;background:#12345a;color:#fff;font-size:1rem;font-weight:800;letter-spacing:.2px;box-shadow:0 5px 0 rgba(18,52,90,.18),0 8px 18px rgba(18,52,90,.18);cursor:pointer";
      if (!addItemButton.nextElementSibling?.classList.contains("add-item-guidance")) {
        const hint = document.createElement("p");
        hint.className = "add-item-guidance";
        hint.textContent = "Depois de escolher o produto ou serviço e a quantidade, toque aqui para incluí-lo na venda.";
        hint.style.cssText = "margin:0 0 12px;color:#40566d;font-size:.86rem;font-weight:600;line-height:1.4";
        addItemButton.insertAdjacentElement("afterend", hint);
      }
    }
    el("btnSalvarPrecosFixosInstrutor")?.addEventListener("click", saveFixedItemPrices);
    el("itensCarrinhoVenda").addEventListener("click", event => {
      const button = event.target.closest("[data-cart-remove]");
      if (!button) return;
      state.saleCart.splice(Number(button.dataset.cartRemove), 1);
      renderSaleCart();
    });
    el("formVenda").addEventListener("submit", saveSale);
    renderSaleCart();
    el("filtroBuscaFinanceiro").addEventListener("input", event => { state.financialSearch = event.target.value; renderFinancial(); });
    el("movimentoData").value = localToday();

    el("btnGerarContratoInstrutor").addEventListener("click", generateInstructorContract);
    el("btnImprimirContratoInstrutor").addEventListener("click", printInstructorContract);
    window.addEventListener("afterprint", () => {
      document.body.classList.remove("printing-contract");
    });
    el("contratoAlunoInstrutor").addEventListener("change", fillInstructorContractStudent);
    el("btnRelatorioAluno").addEventListener("click", reportByStudent);
    el("btnRelatorioPeriodo").addEventListener("click", reportByPeriod);
    el("btnRelatorioDiario").addEventListener("click", reportDaily);
    el("btnSair").addEventListener("click", signOut);
    el("dataDiaria").value = localToday();

    function navigateInstructorPage(page) {
      document.querySelectorAll("[data-view]").forEach(section => {
        const active = section.dataset.view === page;
        section.classList.toggle("active-view", active);
        section.classList.toggle("active", active);
      });
      document.querySelectorAll("[data-instructor-page]").forEach(button => {
        const active = button.dataset.instructorPage === page;
        button.classList.toggle("active", active);
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    document.querySelectorAll("[data-instructor-page]").forEach(button => {
      button.addEventListener("click", () => navigateInstructorPage(button.dataset.instructorPage));
    });
    navigateInstructorPage("inicio");

    state.supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) window.location.replace("index.html");
    });
  }

  initialize().catch(error => {
    console.error("Falha ao abrir área do instrutor:", error);
    showMessage("Não foi possível carregar seus dados. Verifique sua sessão e as permissões do banco.");
  });
})();
