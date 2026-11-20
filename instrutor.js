"use strict";

(function () {
  const SUPABASE_URL = "https://ydyqagqsuqntuibzgwzd.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_hgqXLoA9BQvZy0L3dEEJ-A_WfoUq7tU";

  const el = id => document.getElementById(id);
  const state = { supabase: null, user: null, profile: null, students: [], lessons: [], vehicles: [] };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[char]);
  }

  function showMessage(message, isError = true) {
    const target = el("mensagem");
    if (!target) return;
    target.textContent = message || "";
    target.style.color = isError ? "#a12b2b" : "#16794b";
  }

  function localToday() {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function formatDate(value) {
    if (!value) return "";
    const date = String(value).slice(0, 10);
    const parts = date.split("-");
    return parts.length === 3 ? parts.reverse().join("/") : date;
  }

  function studentName(id) {
    const student = state.students.find(item => item.id === id);
    return student ? student.nome : "Aluno não encontrado";
  }

  function vehicleName(id) {
    if (!id) return "—";
    const vehicle = state.vehicles.find(item => item.id === id);
    return vehicle ? vehicle.nome : "—";
  }

  function sortLessons(items) {
    return [...items].sort((a, b) =>
      String(a.data_aula || "").localeCompare(String(b.data_aula || "")) ||
      String(a.horario || "").localeCompare(String(b.horario || ""))
    );
  }

  async function loadOwnData() {
    const [studentsResult, lessonsResult, vehiclesResult] = await Promise.all([
      state.supabase.from("students")
        .select("id,nome,categoria,aulas_compradas,aulas_restantes")
        .order("nome", { ascending: true }),
      state.supabase.from("lessons")
        .select("id,student_id,data_aula,horario,numero_aula,status,vehicle_id")
        .order("data_aula", { ascending: true })
        .order("horario", { ascending: true }),
      state.supabase.from("vehicles")
        .select("id,nome")
        .order("nome", { ascending: true })
    ]);

    const firstError = studentsResult.error || lessonsResult.error || vehiclesResult.error;
    if (firstError) throw firstError;

    state.students = studentsResult.data || [];
    state.lessons = lessonsResult.data || [];
    state.vehicles = vehiclesResult.data || [];

    el("totalAlunos").textContent = state.students.length;
    el("totalRealizadas").textContent = state.lessons.filter(item => item.status === "Realizada").length;
    el("totalAgendadas").textContent = state.lessons.filter(item => item.status === "Agendada").length;

    const select = el("filtroAluno");
    select.innerHTML = '<option value="">Selecione um aluno</option>' +
      state.students.map(student =>
        '<option value="' + escapeHtml(student.id) + '">' + escapeHtml(student.nome) + '</option>'
      ).join("");
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
        const statusClass = status === "Realizada" ? "status status-realizada" : "status";
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
    el("resultado").innerHTML =
      '<div class="result-heading"><div><h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(subtitle) + '</p></div>' +
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
      lessons.filter(item => item.status === "Realizada").length + '</strong></span>';
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
      String(item.data_aula || "").slice(0, 10) === date && item.status !== "Cancelada"
    );
    showReport("Lista diária de aulas", formatDate(date), lessons, true);
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
    if (!profile || profile.role !== "instrutor") {
      if (profile && profile.role === "admin") {
        window.location.replace("index.html");
      } else {
        await signOut();
      }
      return;
    }

    state.profile = profile;
    el("nomeInstrutor").textContent = profile.nome || state.user.email || "Instrutor";
    await loadOwnData();

    el("btnRelatorioAluno").addEventListener("click", reportByStudent);
    el("btnRelatorioPeriodo").addEventListener("click", reportByPeriod);
    el("btnRelatorioDiario").addEventListener("click", reportDaily);
    el("btnSair").addEventListener("click", signOut);
    el("dataDiaria").value = localToday();

    state.supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) window.location.replace("index.html");
    });
  }

  initialize().catch(error => {
    console.error("Falha ao abrir área do instrutor:", error);
    showMessage("Não foi possível carregar seus relatórios. Verifique sua sessão e as permissões do banco.");
  });
})();
