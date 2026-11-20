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
    studentEditingId: null,
    studentSearch: "",
    vehicleEditingId: null,
    vehicleSearch: "",
    lessonEditingId: null,
    lessonSearch: "",
    lessonStatusFilter: ""
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
      return '<article class="student-card">' +
        '<div class="student-card-main">' +
          '<div class="student-card-heading"><h4>' + escapeHtml(student.nome) + '</h4>' +
            '<span class="student-status ' + statusClass + '">' + escapeHtml(studentStatusLabel(student.status)) + '</span></div>' +
          '<div class="student-card-details">' +
            '<span><small>Telefone</small><strong>' + escapeHtml(student.telefone || "Não informado") + '</strong></span>' +
            '<span><small>Categoria</small><strong>' + escapeHtml(student.categoria || "Não definida") + '</strong></span>' +
            '<span><small>Aulas restantes</small><strong class="student-balance">' + escapeHtml(student.aulas_restantes ?? 0) + '</strong></span>' +
          '</div>' +
          (student.email ? '<p class="student-card-email">' + escapeHtml(student.email) + '</p>' : '') +
        '</div>' +
        '<div class="student-card-actions">' +
          '<button class="button button-outline button-small" type="button" data-student-action="edit" data-student-id="' + escapeHtml(student.id) + '">Editar</button>' +
          '<button class="button button-danger button-small" type="button" data-student-action="delete" data-student-id="' + escapeHtml(student.id) + '">Excluir</button>' +
        '</div>' +
      '</article>';
    }).join("");
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

    const scheduled = sortLessons(state.lessons.filter(lesson =>
      String(lesson.status || "").toLowerCase() === "agendada"
    ));

    if (!scheduled.length) {
      container.innerHTML = '<div class="empty-state">Você não possui aulas agendadas.</div>';
      return;
    }

    container.innerHTML = scheduled.slice(0, 12).map(lesson => {
      const student = state.students.find(item => item.id === lesson.student_id);
      const remaining = Number(student?.aulas_restantes || 0);
      return '<article class="upcoming-lesson-card">' +
        '<div class="upcoming-lesson-date"><strong>' + escapeHtml(formatDate(lesson.data_aula)) +
        '</strong><span>' + escapeHtml(String(lesson.horario || "").slice(0, 5)) + '</span></div>' +
        '<div class="upcoming-lesson-info"><strong>' + escapeHtml(studentName(lesson.student_id)) +
        '</strong><span>' + escapeHtml(vehicleName(lesson.vehicle_id)) + '</span>' +
        '<small>Aula ' + escapeHtml(lesson.numero_aula ?? "—") +
        ' · Saldo: ' + escapeHtml(remaining) + '</small></div>' +
        '<div class="upcoming-lesson-actions">' +
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
    if (!window.confirm("Deseja " + actionLabel + " para " + studentName(lesson.student_id) + "?")) return;

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
    updateLessonBalanceHint();
    el("aulaAluno").focus();
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
    if (!window.confirm("Deseja excluir esta aula de " + studentName(lesson.student_id) + "?")) return;
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
    if (!window.confirm('Deseja excluir o veículo "' + vehicleLabel(vehicle) + '"?')) return;
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

  async function loadOwnData() {
    const [studentsResult, lessonsResult, vehiclesResult] = await Promise.all([
      state.supabase.from("students")
        .select("id,nome,email,telefone,cpf,endereco,categoria,status,aulas_compradas,aulas_restantes")
        .order("nome", { ascending: true }),
      state.supabase.from("lessons")
        .select("id,student_id,data_aula,horario,numero_aula,status,vehicle_id,observacoes")
        .order("data_aula", { ascending: true })
        .order("horario", { ascending: true }),
      state.supabase.from("vehicles")
        .select("id,nome,tipo,categoria,placa")
        .order("tipo", { ascending: true })
    ]);

    const firstError = studentsResult.error || lessonsResult.error || vehiclesResult.error;
    if (firstError) throw firstError;

    state.students = studentsResult.data || [];
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
    renderVehicles();
    renderLessons();
    renderUpcomingLessons();
    updateStudentSelect();
    updateLessonSelects();
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
      el("alunoAulasCompradas").value = student.aulas_compradas ?? 0;
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
    el("filtroBuscaAlunos").addEventListener("input", event => {
      state.studentSearch = event.target.value;
      renderStudents();
    });
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

    el("btnRelatorioAluno").addEventListener("click", reportByStudent);
    el("btnRelatorioPeriodo").addEventListener("click", reportByPeriod);
    el("btnRelatorioDiario").addEventListener("click", reportDaily);
    el("btnSair").addEventListener("click", signOut);
    el("dataDiaria").value = localToday();

    function navigateInstructorPage(page) {
      document.querySelectorAll("[data-view]").forEach(section => {
        section.classList.toggle("active-view", section.dataset.view === page);
      });
      document.querySelectorAll("[data-instructor-page]").forEach(button => {
        button.classList.toggle("active", button.dataset.instructorPage === page);
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
