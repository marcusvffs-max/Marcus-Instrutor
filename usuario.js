"use strict";

(function () {
  const hostPreview = window.location.hostname;
      const USAR_SUPABASE_QA = hostPreview === "marcusinstrutor-git-feature-acessos-alun-ffc22b-marcusvffs-2839.vercel.app" || /^marcusinstrutor-[a-z0-9]{9}-marcusvffs-2839\.vercel\.app$/.test(hostPreview);
  const SUPABASE_URL = USAR_SUPABASE_QA ? "https://voyjssflroiwdyaacthh.supabase.co" : "https://ydyqagqsuqntuibzgwzd.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = USAR_SUPABASE_QA ? "sb_publishable_YpDyl5xJknD9NJ-i2fDn9Q_F4jjkLm9" : "sb_publishable_hgqXLoA9BQvZy0L3dEEJ-A_WfoUq7tU";
  const el = id => document.getElementById(id);
  const state = { supabase: null, user: null };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[char]);
  }

  function formatDate(value) {
    if (!value) return "—";
    const parts = String(value).slice(0, 10).split("-");
    return parts.length === 3 ? parts.reverse().join("/") : String(value);
  }

  function formatTime(value) {
    return value ? String(value).slice(0, 5) : "—";
  }

  function showMessage(message, isError = true) {
    el("mensagem").textContent = message || "";
    el("mensagem").style.color = isError ? "#a12b2b" : "#16794b";
  }

  function renderLessons(lessons) {
    el("totalAulas").textContent = lessons.length;
    if (!lessons.length) {
      el("listaAulas").innerHTML =
        '<div class="user-empty"><div class="user-empty-icon">✓</div><strong>Nenhuma aula agendada</strong><p>Quando uma nova aula for marcada, ela aparecerá aqui.</p></div>';
      return;
    }

    const weekday = value => {
      if (!value) return "";
      const date = new Date(String(value).slice(0, 10) + "T12:00:00");
      return new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", "");
    };

    const cards = lessons.map(lesson => {
      const status = String(lesson.lesson_status || "agendada").toLowerCase();
      const statusLabels = {
        agendada: "Agendada",
        realizada: "Realizada",
        cancelada: "Cancelada",
        confirmada: "Confirmada",
        pendente: "Pendente"
      };
      const statusLabel = statusLabels[status] || status.charAt(0).toUpperCase() + status.slice(1);
      const statusClass = ["agendada", "realizada", "cancelada", "confirmada", "pendente"].includes(status)
        ? status : "outro";
      const vehicle = [lesson.vehicle_name, lesson.vehicle_plate].filter(Boolean).join(" · ") || "Veículo não informado";
      const dateParts = String(lesson.lesson_date || "").slice(0, 10).split("-");
      const day = dateParts.length === 3 ? dateParts[2] : "—";
      const month = dateParts.length === 3
        ? new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(lesson.lesson_date + "T12:00:00")).replace(".", "")
        : "";
      return '<article class="user-lesson-card">' +
        '<div class="user-lesson-date"><strong>' + escapeHtml(day) + '</strong><span>' + escapeHtml(month) + '</span><small>' + escapeHtml(weekday(lesson.lesson_date)) + '</small></div>' +
        '<div class="user-lesson-info">' +
          '<div class="user-lesson-top"><span class="user-lesson-time">◷ ' + escapeHtml(formatTime(lesson.lesson_time)) + '</span>' +
          '<span class="user-lesson-status status-' + statusClass + '">' + escapeHtml(statusLabel) + '</span></div>' +
          '<h4>' + escapeHtml(lesson.student_name || "Aula de direção") + '</h4>' +
          '<p class="user-lesson-vehicle"><span aria-hidden="true">🚘</span> ' + escapeHtml(vehicle) + '</p>' +
        '</div>' +
      '</article>';
    }).join("");

    el("listaAulas").innerHTML = '<div class="user-lesson-list">' + cards + '</div>';
  }

  async function loadInstructorName() {
    try {
      const { data, error } = await state.supabase.rpc("get_my_instructor_branding");
      if (error) throw error;
      const branding = Array.isArray(data) ? data[0] : data;
      const name = branding?.instructor_name || "";\n      configureInstructorWhatsAppButton(branding?.instructor_cellphone);
      el("nomeInstrutorResponsavel").textContent = name || "Aguardando vínculo do instrutor";
      const heading = el("nomeEmpresaInstrutor");
      if (heading && name) heading.textContent = name;
      const logo = el("logoInstrutorResponsavel");
      if (logo && branding?.logo_url) {
        const image = document.createElement("img");
        image.src = branding.logo_url;
        image.alt = "Logomarca do instrutor responsável";
        image.style.width = "100%";
        image.style.height = "100%";
        image.style.objectFit = "contain";
        logo.replaceChildren(image);
      }
    } catch (error) {
      console.warn("Não foi possível consultar a identidade visual do instrutor responsável:", error);
      try {
        const { data } = await state.supabase.rpc("get_my_instructor_name");
        el("nomeInstrutorResponsavel").textContent = data || "Aguardando vínculo do instrutor";
      } catch (_) {
        el("nomeInstrutorResponsavel").textContent = "Não disponível no momento";
      }
    }
  }

  async function loadLessons() {
    el("btnAtualizar").disabled = true;
    el("atualizadoEm").textContent = "Atualizando sua agenda...";
    showMessage("");
    try {
      const { data, error } = await state.supabase.rpc("get_my_scheduled_lessons");
      if (error) throw error;
      const lessons = Array.isArray(data) ? data : [];
      renderLessons(lessons);
      el("atualizadoEm").textContent = "Agenda atualizada.";
      showMessage("Sua lista foi atualizada.", false);
    } catch (error) {
      if (error && error.code === "P0002") {
        el("totalAulas").textContent = "—";
        el("listaAulas").innerHTML =
          '<div class="user-empty"><div class="user-empty-icon">!</div>' +
          '<strong>Acesso ainda não vinculado</strong>' +
          '<p>Sua conta foi autenticada, mas ainda não está associada a um cadastro de aluno. Entre em contato com seu instrutor para conferir o e-mail cadastrado e regularizar seu acesso. Se você já tinha uma conta antiga, informe isso ao instrutor. Por segurança, não crie outra conta nem tente fazer o vínculo por conta própria.</p></div>';
        el("atualizadoEm").textContent = "Aguardando regularização do vínculo.";
        showMessage("Fale com seu instrutor para regularizar o acesso.");
        return;
      }

      console.error("Falha ao consultar aulas do usuário:", error);
      el("listaAulas").innerHTML = '<div class="empty-state">Não foi possível carregar sua lista de aulas.</div>';
      el("atualizadoEm").textContent = "Falha ao atualizar.";
      showMessage("Não foi possível consultar suas aulas. Tente novamente ou entre em contato com o administrador.");
    } finally {
      el("btnAtualizar").disabled = false;
    }
  }

  function configureInstructorWhatsAppButton(cellphone) {
    const button = el("btnWhatsAppAssistente");
    if (!button) return;
    const digits = String(cellphone || "").replace(/\D/g, "");
    const number = digits.length === 10 || digits.length === 11 ? "55" + digits : digits;
    if (!/^55[1-9][0-9]{9,10}$/.test(number)) {
      button.hidden = true;
      button.removeAttribute("href");
      return;
    }
    button.href = "https://wa.me/" + number + "?text=" + encodeURIComponent("Olá! Sou aluno e gostaria de falar com meu instrutor.");
    button.hidden = false;
    button.setAttribute("aria-label", "Falar com meu instrutor pelo WhatsApp");
    button.title = "Falar com meu instrutor";
    const label = button.querySelector("span");
    if (label) label.textContent = "Falar com instrutor";
  }

  async function signOut() {
    await state.supabase.auth.signOut({ scope: "local" });
    window.location.replace("index.html");
  }

  async function initialize() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("Não foi possível carregar o serviço de autenticação.");
    }

    state.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, storage: window.sessionStorage }
    });

    const { data: sessionData, error: sessionError } = await state.supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      window.location.replace("index.html");
      return;
    }

    state.user = sessionData.session.user;
    const { data: profile, error: profileError } = await state.supabase.from("profiles")
      .select("id,nome,role").eq("id", state.user.id).maybeSingle();

    if (profileError) throw profileError;
    if (!profile || profile.role !== "usuario") {
      if (profile && profile.role === "instrutor") {
        window.location.replace("instrutor.html");
      } else {
        window.location.replace("index.html");
      }
      return;
    }

    el("nomeUsuario").textContent = profile.nome || state.user.email || "Usuário";
    el("btnSair").addEventListener("click", signOut);
    el("btnAtualizar").addEventListener("click", loadLessons);
    state.supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) window.location.replace("index.html");
    });
    await loadInstructorName();
    await loadLessons();

  }

  initialize().catch(error => {
    console.error("Falha ao abrir área do usuário:", error);
    showMessage("Não foi possível carregar sua lista. Verifique sua sessão e tente novamente.");
  });
})();
