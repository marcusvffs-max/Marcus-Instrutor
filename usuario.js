"use strict";

(function () {
  const SUPABASE_URL = "https://ydyqagqsuqntuibzgwzd.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_hgqXLoA9BQvZy0L3dEEJ-A_WfoUq7tU";
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
      el("listaAulas").innerHTML = '<div class="empty-state">Nenhuma aula agendada no momento.</div>';
      return;
    }

    const rows = lessons.map(lesson => {
      const status = String(lesson.lesson_status || "agendada");
      const vehicle = [lesson.vehicle_name, lesson.vehicle_plate]
        .filter(Boolean).join(" · ") || "Não informado";
      return '<tr>' +
        '<td>' + escapeHtml(formatDate(lesson.lesson_date)) + '</td>' +
        '<td>' + escapeHtml(formatTime(lesson.lesson_time)) + '</td>' +
        '<td>' + escapeHtml(lesson.student_name || "—") + '</td>' +
        '<td>' + escapeHtml(vehicle) + '</td>' +
        '<td><span class="status">' + escapeHtml(status === "agendada" ? "Agendada" : status) + '</span></td>' +
        '</tr>';
    }).join("");

    el("listaAulas").innerHTML =
      '<div class="table-wrap"><table><thead><tr>' +
      '<th>Data</th><th>Horário</th><th>Aluno</th><th>Veículo</th><th>Situação</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
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
      console.error("Falha ao consultar aulas do usuário:", error);
      el("listaAulas").innerHTML = '<div class="empty-state">Não foi possível carregar sua lista de aulas.</div>';
      el("atualizadoEm").textContent = "Falha ao atualizar.";
      showMessage("Não foi possível consultar suas aulas. Tente novamente ou entre em contato com o administrador.");
    } finally {
      el("btnAtualizar").disabled = false;
    }
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
    await loadLessons();
  }

  initialize().catch(error => {
    console.error("Falha ao abrir área do usuário:", error);
    showMessage("Não foi possível carregar sua lista. Verifique sua sessão e tente novamente.");
  });
})();
