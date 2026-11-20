"use strict";

(function () {
  const SUPABASE_URL = "https://ydyqagqsuqntuibzgwzd.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_hgqXLoA9BQvZy0L3dEEJ-A_WfoUq7tU";

  const el = id => document.getElementById(id);
  const state = {
    supabase: null,
    user: null,
    profile: null,
    students: [],
    lessons: [],
    vehicles: [],
    studentEditingId: null
  };

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

  function studentStatusLabel(status) {
    const labels = {
      em_aberto: "Em aberto",
      finalizado: "Finalizado",
      aprovado: "Aprovado"
    };
    return labels[status] || status || "Em aberto";
  }

  function renderStudents() {
    const container = el("listaAlunos");
    if (!state.students.length) {
      container.innerHTML = '<div class="empty-state">Você ainda não cadastrou alunos.</div>';
      return;
    }

    container.innerHTML = '<table class="students-table"><thead><tr>' +
      '<th>Aluno</th><th>E-mail</th><th>Telefone</th><th>Categoria</th><th>Situação</th><th>Ações</th>' +
      '</tr></thead><tbody>' +
      state.students.map(student =>
        '<tr>' +
          '<td>' + escapeHtml(student.nome) + '</td>' +
          '<td>' + escapeHtml(student.email || "—") + '</td>' +
          '<td>' + escapeHtml(student.telefone || "—") + '</td>' +
          '<td>' + escapeHtml(student.categoria || "—") + '</td>' +
          '<td>' + escapeHtml(studentStatusLabel(student.status)) + '</td>' +
          '<td class="student-actions">' +
            '<button class="button button-outline button-small" type="button" data-student-action="edit" data-student-id="' + escapeHtml(student.id) + '">Editar</button>' +
            '<button class="button button-danger button-small" type="button" data-student-action="delete" data-student-id="' + escapeHtml(student.id) + '">Excluir</button>' +
          '</td>' +
        '</tr>'
      ).join("") +
      '</tbody></table>';
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

  async function loadOwnData() {
    const [studentsResult, lessonsResult, vehiclesResult] = await Promise.all([
      state.supabase.from("students")
        .select("id,nome,email,telefone,cpf,endereco,categoria,status,aulas_compradas,aulas_restantes")
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
    el("totalRealizadas").textContent = state.lessons.filter(item =>
      ["Realizada", "realizada", "realizada"].includes(item.status)
    ).length;
    el("totalAgendadas").textContent = state.lessons.filter(item =>
      ["Agendada", "agendada"].includes(item.status)
    ).length;

    renderStudents();
    updateStudentSelect();
  }

  function resetStudentForm() {
    state.studentEditingId = null;
    el("formAluno").reset();
    el("tituloFormAluno").textContent = "Cadastrar aluno";
    el("btnSalvarAluno").textContent = "Salvar aluno";
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
    }

    el("formAluno").hidden = false;
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
    if (!window.confirm('Deseja excluir o aluno "' + student.nome + '"?')) return;

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

    el("btnNovoAluno").addEventListener("click", () => openStudentForm());
    el("btnCancelarAluno").addEventListener("click", resetStudentForm);
    el("formAluno").addEventListener("submit", saveStudent);
    el("listaAlunos").addEventListener("click", event => {
      const button = event.target.closest("[data-student-action]");
      if (!button) return;
      const id = button.dataset.studentId;
      const student = state.students.find(item => item.id === id);
      if (button.dataset.studentAction === "edit" && student) openStudentForm(student);
      if (button.dataset.studentAction === "delete") deleteStudent(id);
    });

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
    showMessage("Não foi possível carregar seus dados. Verifique sua sessão e as permissões do banco.");
  });
})();
