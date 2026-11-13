"use strict";

/* =========================================
   MARCUS INSTRUTOR
========================================= */

const STORAGE_KEY = "marcus_instrutor_novo_v1";

const HORARIOS = [
  "07:00 - 07:50", "08:00 - 08:50",
  "09:00 - 09:50", "10:00 - 10:50",
  "11:00 - 11:50", "14:00 - 14:50",
  "15:00 - 15:50", "16:00 - 16:50",
  "17:00 - 17:50", "18:00 - 18:50"
];

const estadoInicial = {
  alunos: [],
  veiculos: [],
  aulas: [],
  produtos: [
    { id: "bronze", nome: "Pacote Bronze", preco: 80 },
    { id: "prata", nome: "Pacote Prata", preco: 75 },
    { id: "ouro", nome: "Pacote Ouro", preco: 70 }
  ],
  vendas: [],
  movimentacoes: [],
  configuracoes: {
    nome: "Marcus Instrutor",
    corPrincipal: "#12345a",
    corSecundaria: "#e8edf3",
    logo: ""
  }
};

let db = carregarDados();
let alunoEditando = null;
let veiculoEditando = null;
let aulaEditando = null;
let relatorioAtual = null;

/* =========================================
   FUNÇÕES BÁSICAS
========================================= */

function carregarDados() {
  try {
    const dados = localStorage.getItem(STORAGE_KEY);

    if (!dados) return structuredClone(estadoInicial);

    const recuperado = JSON.parse(dados);
    const produtosPadrao = structuredClone(estadoInicial.produtos);
    const produtosAntigos = recuperado.produtos || [];

    const manterProdutos = produtosAntigos.some(p =>
      !["p1", "p2", "p3", "p4"].includes(p.id)
    );

    return {
      ...structuredClone(estadoInicial),
      ...recuperado,
      produtos: manterProdutos ? produtosAntigos : produtosPadrao,
      vendas: recuperado.vendas || [],
      movimentacoes: recuperado.movimentacoes || []
    };
  } catch (erro) {
    console.error("Erro ao carregar dados:", erro);
    return structuredClone(estadoInicial);
  }
}

function salvarDados() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  atualizarPainel();
}

function gerarId() {
  return Date.now().toString(36) +
    Math.random().toString(36).substring(2, 9);
}

function escapar(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, caractere => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[caractere]);
}

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function dataHoje() {
  const agora = new Date();
  const local = new Date(
    agora.getTime() - agora.getTimezoneOffset() * 60000
  );
  return local.toISOString().slice(0, 10);
}

function formatarData(data) {
  if (!data) return "";
  const partes = data.split("-");
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function numero(valor) {
  return Number(String(valor || "0").replace(",", ".")) || 0;
}

function mostrarAviso(mensagem) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const aviso = document.createElement("div");
  aviso.className = "toast";
  aviso.textContent = mensagem;
  container.appendChild(aviso);

  setTimeout(() => aviso.remove(), 3500);
}

function confirmar(mensagem) {
  return window.confirm(mensagem);
}

/* =========================================
   NAVEGAÇÃO
========================================= */

function mostrarPagina(nome) {
  document.querySelectorAll(".page").forEach(pagina => {
    pagina.classList.remove("active");
  });

  document.querySelectorAll(".menu-item").forEach(botao => {
    botao.classList.toggle(
      "active",
      botao.dataset.page === nome
    );
  });

  const pagina = document.getElementById("page-" + nome);

  if (pagina) pagina.classList.add("active");

  atualizarTela(nome);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function atualizarTela(nome) {
  switch (nome) {
    case "inicio":
      atualizarPainel();
      break;
    case "alunos":
      listarAlunos();
      break;
    case "veiculos":
      listarVeiculos();
      break;
    case "aulas":
      listarAulas();
      break;
    case "financeiro":
      listarMovimentacoes();
      atualizarFinanceiro();
      break;
    case "produtos":
      listarProdutos();
      break;
    case "relatorios":
      atualizarSeletoresAlunos();
      break;
    case "configuracoes":
      carregarConfiguracoes();
      break;
  }
}

/* =========================================
   PAINEL
========================================= */



function atualizarPainel() {
  const totalAlunos = document.getElementById("totalAlunos");
  const totalAgendadas = document.getElementById("totalAgendadas");
  const totalRealizadas = document.getElementById("totalRealizadas");
  const saldoCaixa = document.getElementById("saldoCaixa");

  if (totalAlunos) {
    totalAlunos.textContent = db.alunos.length;
  }

  if (totalAgendadas) {
    totalAgendadas.textContent =
      db.aulas.filter(a => a.status === "Agendada").length;
  }

  if (totalRealizadas) {
    totalRealizadas.textContent =
      db.aulas.filter(a => a.status === "Realizada").length;
  }

  // Calcula somente o saldo das movimentações de hoje
  const hoje = dataHoje();

  const movimentacoesHoje = db.movimentacoes.filter(m => {
    if (!m.data) return false;

    const data = String(m.data).trim();
    let dataNormalizada = data;

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
      const partes = data.split("/");
      dataNormalizada = `${partes[2]}-${partes[1]}-${partes[0]}`;
    } else if (/^\d{4}-\d{2}-\d{2}/.test(data)) {
      dataNormalizada = data.substring(0, 10);
    }

    return dataNormalizada === hoje;
  });

  const entradasHoje = movimentacoesHoje
    .filter(m => m.tipo === "entrada")
    .reduce((total, m) => total + Number(m.valor || 0), 0);

  const saidasHoje = movimentacoesHoje
    .filter(m => m.tipo === "saida")
    .reduce((total, m) => total + Number(m.valor || 0), 0);

  if (saldoCaixa) {
    saldoCaixa.textContent = moeda(entradasHoje - saidasHoje);
  }

  // Atualiza as próximas aulas
  const proximas = document.getElementById("proximasAulas");

  if (proximas) {
    function normalizarData(data) {
      if (!data) return "";

      const valor = String(data).trim();

      if (/^\d{4}-\d{2}-\d{2}/.test(valor)) {
        return valor.substring(0, 10);
      }

      if (/^\d{2}\/\d{2}\/\d{4}$/.test(valor)) {
        const partes = valor.split("/");
        return `${partes[2]}-${partes[1]}-${partes[0]}`;
      }

      return valor;
    }

    const aulas = db.aulas
      .filter(a =>
        String(a.status || "").trim() === "Agendada" &&
        normalizarData(a.data) === hoje
      )
      .sort((a, b) =>
        (a.horario || "").localeCompare(b.horario || "")
      )
      .slice(0, 12);

    proximas.innerHTML = aulas.length
      ? aulas.map(a => `
          <div class="record">
            <strong>${escapar(nomeAluno(a.alunoId))}</strong>
            <p>${formatarData(a.data)} • ${escapar(a.horario)}</p>

            <div class="record-actions">
              <button
                type="button"
                data-realizar-aula="${a.id}"
                class="primary-button"
              >
                Realizada
              </button>

              <button
                type="button"
                data-cancelar-aula="${a.id}"
                class="secondary-button"
              >
                Cancelada
              </button>
            </div>
          </div>
        `).join("")
      : '<div class="empty-state">Nenhuma aula agendada para hoje.</div>';

    proximas.onclick = evento => {
      const realizar = evento.target.closest("[data-realizar-aula]");
      const cancelar = evento.target.closest("[data-cancelar-aula]");

      if (realizar) {
        alterarStatusAulaPainel(
          realizar.dataset.realizarAula,
          "Realizada"
        );
      }

      if (cancelar) {
        alterarStatusAulaPainel(
          cancelar.dataset.cancelarAula,
          "Cancelada"
        );
      }
    };
  }
}




function alterarStatusAulaPainel(id, novoStatus) {
  const aula = db.aulas.find(a => a.id === id);

  if (!aula || aula.status !== "Agendada") return;

  if (novoStatus === "Realizada") {
    const aluno = db.alunos.find(a => a.id === aula.alunoId);

    if (!aluno || Number(aluno.saldo || 0) < 1) {
      mostrarAviso("Este aluno não possui aulas disponíveis.");
      return;
    }

    aula.status = "Realizada";
    ajustarSaldoAula(aula, 1);

  } else if (novoStatus === "Cancelada") {
    if (!confirmar("Deseja realmente cancelar esta aula?")) return;

    aula.status = "Cancelada";
  } else {
    return;
  }

  salvarDados();
  listarAlunos();
  listarAulas();
  atualizarPainel();

  mostrarAviso(
    novoStatus === "Realizada"
      ? "Aula marcada como realizada. Saldo atualizado."
      : "Aula cancelada. Nenhuma aula foi descontada."
  );
}


/* =========================================
   ALUNOS
========================================= */

function nomeAluno(id) {
  const aluno = db.alunos.find(a => a.id === id);
  return aluno ? aluno.nome : "Aluno não encontrado";
}


function abrirFormularioAluno(id = null) {
  alunoEditando = id;

  const aluno = id !== null
    ? db.alunos.find(a => String(a.id) === String(id)) || {}
    : {};

  abrirModal(`
    <h2>${id ? "Editar aluno" : "Novo aluno"}</h2>

    <form id="formAluno">
      <label>Nome completo</label>
      <input name="nome" required value="${escapar(aluno.nome)}">

      <label>Telefone</label>
      <input name="telefone" type="tel" value="${escapar(aluno.telefone)}">

      <label>CPF</label>
      <input name="cpf" value="${escapar(aluno.cpf)}">

      <label>Endereço</label>
      <input name="endereco" value="${escapar(aluno.endereco)}">

      <label>Categoria em andamento</label>
      <select name="categoria">
        ${opcoes(["A", "B", "AB"], aluno.categoria || "B")}
      </select>

      <label>Situação</label>
      <select name="situacao">
        ${opcoes(["Em aberto", "Finalizado", "Aprovado"], aluno.situacao || "Em aberto")}
      </select>

      <div class="panel">
        <strong>Controle de aulas</strong>
        <p>As quantidades serão controladas automaticamente pelas vendas, devoluções e aulas realizadas.</p>
        <p>Aulas restantes: <strong>${Number(aluno.saldo || 0)}</strong></p>
      </div>

      <div class="modal-actions">
        <button type="button" class="secondary-button" data-close>Cancelar</button>
        <button type="submit" class="primary-button">Salvar aluno</button>
      </div>
    </form>
  `);

  document.getElementById("formAluno").onsubmit = salvarAluno;
}




function salvarAluno(evento) {
  evento.preventDefault();

  const dados = Object.fromEntries(new FormData(evento.target).entries());
  const nome = dados.nome.trim();

  if (!nome) {
    mostrarAviso("Informe o nome do aluno.");
    return;
  }

  const alunoAnterior = alunoEditando !== null
    ? db.alunos.find(a => String(a.id) === String(alunoEditando))
    : null;

  if (alunoEditando !== null && !alunoAnterior) {
    mostrarAviso("Não foi possível localizar o aluno para edição.");
    return;
  }

  const duplicado = db.alunos.find(a =>
    a.nome.toLowerCase() === nome.toLowerCase() &&
    String(a.id) !== String(alunoEditando)
  );

  if (duplicado) {
    mostrarAviso("Já existe um aluno com esse nome.");
    return;
  }

  const aluno = {
    id: alunoAnterior ? alunoAnterior.id : gerarId(),
    nome,
    telefone: dados.telefone,
    cpf: dados.cpf,
    endereco: dados.endereco,
    categoria: dados.categoria,
    situacao: dados.situacao,
    contratadas: Number(alunoAnterior?.contratadas || 0),
    saldo: Number(alunoAnterior?.saldo || 0)
  };

  if (alunoAnterior) {
    const indice = db.alunos.findIndex(
      a => String(a.id) === String(alunoEditando)
    );

    db.alunos[indice] = aluno;
  } else {
    db.alunos.push(aluno);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));

  alunoEditando = null;

  fecharModal();
  listarAlunos();
  atualizarSeletoresAlunos();
  atualizarPainel();

  mostrarAviso("Aluno salvo com sucesso!");
}


function listarAlunos() {
  const lista = document.getElementById("listaAlunos");
  if (!lista) return;

  const busca = (
    document.getElementById("buscaAlunos")?.value || ""
  ).toLowerCase();

  const alunos = db.alunos.filter(a =>
    a.nome.toLowerCase().includes(busca) ||
    String(a.cpf || "").includes(busca)
  );

  lista.innerHTML = alunos.length
    ? alunos.map(a => `
        <div class="record">
          <div class="record-info">
            <strong>${escapar(a.nome)}</strong>
            <p>Telefone: ${escapar(a.telefone || "Não informado")}</p>
            <p>Categoria: ${escapar(a.categoria)}</p>
            <p>Situação: ${escapar(a.situacao)}</p>
            <p>Aulas restantes: <strong>${Number(a.saldo || 0)}</strong></p>
          </div>
          <div class="record-actions">
            <button type="button" data-edit-aluno="${a.id}">Editar</button>
            <button type="button" data-delete-aluno="${a.id}">Excluir</button>
          </div>
        </div>
      `).join("")
    : '<div class="empty-state">Nenhum aluno encontrado.</div>';
}

function excluirAluno(id) {
  if (db.aulas.some(a => a.alunoId === id)) {
    mostrarAviso("Este aluno possui aulas vinculadas. Não é possível excluí-lo.");
    return;
  }

  if (!confirmar("Deseja realmente excluir este aluno?")) return;

  db.alunos = db.alunos.filter(a => a.id !== id);
  salvarDados();
  listarAlunos();
  atualizarSeletoresAlunos();
  mostrarAviso("Aluno excluído.");
                            }
/* =========================================
   VEÍCULOS
========================================= */

function abrirFormularioVeiculo(id = null) {
  veiculoEditando = id;
  const veiculo = db.veiculos.find(v => v.id === id) || {};

  abrirModal(`
    <h2>${id ? "Editar veículo" : "Novo veículo"}</h2>
    <form id="formVeiculo">
      <label>Tipo de veículo</label>
      <select name="tipo">
        ${opcoes(["Carro", "Moto"], veiculo.tipo || "Carro")}
      </select>

      <label>Modelo</label>
      <input name="modelo" required value="${escapar(veiculo.modelo)}">

      <label>Placa</label>
      <input name="placa" required value="${escapar(veiculo.placa)}">

      <label>Categoria</label>
      <select name="categoria">
        ${opcoes(["A", "B"], veiculo.categoria || "B")}
      </select>

      <div class="modal-actions">
        <button type="button" class="secondary-button" data-close>Cancelar</button>
        <button type="submit" class="primary-button">Salvar veículo</button>
      </div>
    </form>
  `);

  document.getElementById("formVeiculo").onsubmit = salvarVeiculo;
}

function salvarVeiculo(evento) {
  evento.preventDefault();

  const dados = Object.fromEntries(new FormData(evento.target).entries());
  const placa = dados.placa.trim().toUpperCase();

  const duplicado = db.veiculos.find(v =>
    v.placa.toUpperCase() === placa &&
    v.id !== veiculoEditando
  );

  if (duplicado) {
    mostrarAviso("Já existe um veículo com essa placa.");
    return;
  }

  const veiculo = {
    id: veiculoEditando || gerarId(),
    tipo: dados.tipo,
    modelo: dados.modelo.trim(),
    placa,
    categoria: dados.categoria
  };

  if (veiculoEditando) {
    const indice = db.veiculos.findIndex(v => v.id === veiculoEditando);
    if (indice >= 0) db.veiculos[indice] = veiculo;
  } else {
    db.veiculos.push(veiculo);
  }

  salvarDados();
  fecharModal();
  listarVeiculos();
  mostrarAviso("Veículo salvo!");
  veiculoEditando = null;
}

function listarVeiculos() {
  const lista = document.getElementById("listaVeiculos");
  if (!lista) return;

  const busca = (
    document.getElementById("buscaVeiculos")?.value || ""
  ).toLowerCase();

  const veiculos = db.veiculos.filter(v =>
    v.modelo.toLowerCase().includes(busca) ||
    v.placa.toLowerCase().includes(busca)
  );

  lista.innerHTML = veiculos.length
    ? veiculos.map(v => `
        <div class="record">
          <strong>${escapar(v.modelo)}</strong>
          <p>${escapar(v.tipo)} • Placa: ${escapar(v.placa)}</p>
          <p>Categoria: ${escapar(v.categoria)}</p>
          <div class="record-actions">
            <button type="button" data-edit-veiculo="${v.id}">Editar</button>
            <button type="button" data-delete-veiculo="${v.id}">Excluir</button>
          </div>
        </div>
      `).join("")
    : '<div class="empty-state">Nenhum veículo encontrado.</div>';
}

function excluirVeiculo(id) {
  if (db.aulas.some(a => a.veiculoId === id)) {
    mostrarAviso("Este veículo possui aulas vinculadas.");
    return;
  }

  if (!confirmar("Excluir este veículo?")) return;

  db.veiculos = db.veiculos.filter(v => v.id !== id);
  salvarDados();
  listarVeiculos();
  mostrarAviso("Veículo excluído.");
}

/* =========================================
   AULAS
========================================= */

function abrirFormularioAula(id = null) {
  aulaEditando = id;
  const aula = db.aulas.find(a => a.id === id) || {};

  if (!db.alunos.length) {
    mostrarAviso("Cadastre um aluno primeiro.");
    return;
  }

  if (!db.veiculos.length) {
    mostrarAviso("Cadastre um veículo primeiro.");
    return;
  }

  abrirModal(`
    <h2>${id ? "Editar aula" : "Agendar aula"}</h2>
    <form id="formAula">
      <label>Aluno</label>
      <select name="alunoId" required>
        <option value="">Selecione</option>
        ${db.alunos.map(a => `<option value="${a.id}" ${aula.alunoId === a.id ? "selected" : ""}>${escapar(a.nome)}</option>`).join("")}
      </select>

      <label>Data</label>
      <input name="data" type="date" required value="${escapar(aula.data || dataHoje())}">

      <label>Horário</label>
      <select name="horario" required>
        <option value="">Selecione</option>
        ${HORARIOS.map(h => `<option value="${h}" ${aula.horario === h ? "selected" : ""}>${h}</option>`).join("")}
      </select>

      <label>Veículo</label>
      <select name="veiculoId" required>
        <option value="">Selecione</option>
        ${db.veiculos.map(v => `<option value="${v.id}" ${aula.veiculoId === v.id ? "selected" : ""}>${escapar(v.modelo)} - ${escapar(v.placa)}</option>`).join("")}
      </select>

      <label>Situação</label>
      <select name="status">
        ${opcoes(["Agendada", "Realizada", "Cancelada"], aula.status || "Agendada")}
      </select>

      <label>Observações</label>
      <textarea name="observacoes">${escapar(aula.observacoes)}</textarea>

      <div class="modal-actions">
        <button type="button" class="secondary-button" data-close>Cancelar</button>
        <button type="submit" class="primary-button">Salvar aula</button>
      </div>
    </form>
  `);

  document.getElementById("formAula").onsubmit = salvarAula;
}


function salvarAula(evento) {
  evento.preventDefault();

  const dados = Object.fromEntries(new FormData(evento.target).entries());
  const anterior = db.aulas.find(a => a.id === aulaEditando);

  const conflito = db.aulas.find(a =>
    a.id !== aulaEditando &&
    a.data === dados.data &&
    a.horario === dados.horario &&
    a.veiculoId === dados.veiculoId &&
    a.status !== "Cancelada" &&
    dados.status !== "Cancelada"
  );

  if (conflito) {
    mostrarAviso("Este veículo já possui uma aula neste dia e horário.");
    return;
  }

  const alunoNovo = db.alunos.find(a => a.id === dados.alunoId);
  const saldoDisponivel = Number(alunoNovo?.saldo || 0) +
    (anterior?.status === "Realizada" && anterior.alunoId === dados.alunoId ? 1 : 0);

  if (dados.status === "Realizada" && saldoDisponivel < 1) {
    mostrarAviso("Este aluno não possui aulas disponíveis.");
    return;
  }

  const aula = {
    id: aulaEditando || gerarId(),
    alunoId: dados.alunoId,
    data: dados.data,
    horario: dados.horario,
    veiculoId: dados.veiculoId,
    status: dados.status,
    observacoes: dados.observacoes || ""
  };

  if (anterior) {
    ajustarSaldoAula(anterior, -1);
    ajustarSaldoAula(aula, 1);

    const indice = db.aulas.findIndex(a => a.id === aulaEditando);
    db.aulas[indice] = aula;
  } else {
    ajustarSaldoAula(aula, 1);
    db.aulas.push(aula);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (erro) {
    console.error("Erro ao salvar aula:", erro);
    mostrarAviso("Não foi possível salvar a aula.");
    return;
  }

  aulaEditando = null;

  try {
    fecharModal();
  } catch (erro) {
    console.error("Erro ao fechar formulário:", erro);
  }

  try {
    listarAulas();
  } catch (erro) {
    console.error("Erro ao atualizar aulas:", erro);
  }

  try {
    listarAlunos();
  } catch (erro) {
    console.error("Erro ao atualizar alunos:", erro);
  }

  try {
    atualizarSeletoresAlunos();
  } catch (erro) {
    console.error("Erro ao atualizar seletores:", erro);
  }

  try {
    atualizarPainel();
  } catch (erro) {
    console.error("Erro ao atualizar painel:", erro);
  }

  mostrarAviso("Aula salva com sucesso!");
}


/* =========================================
   AGENDAMENTO DE VÁRIAS AULAS
========================================= */

function abrirAgendamentoLote() {
  if (!db.alunos.length) {
    mostrarAviso("Cadastre um aluno primeiro.");
    return;
  }

  if (!db.veiculos.length) {
    mostrarAviso("Cadastre um veículo primeiro.");
    return;
  }

  abrirModal(`
    <h2>Agendar várias aulas</h2>

    <form id="formAgendamentoLote">

      <label>Aluno</label>
      <select name="alunoId" required>
        <option value="">Selecione o aluno</option>
        ${db.alunos.map(a => `
          <option value="${a.id}">
            ${escapar(a.nome)}
          </option>
        `).join("")}
      </select>

      <label>Veículo para todas as aulas</label>
      <select name="veiculoId" required>
        <option value="">Selecione o veículo</option>
        ${db.veiculos.map(v => `
          <option value="${v.id}">
            ${escapar(v.modelo)} - ${escapar(v.placa)}
          </option>
        `).join("")}
      </select>

      <label>Quantidade de aulas</label>
      <input
        id="quantidadeAulasLote"
        type="number"
        min="1"
        max="50"
        value="10"
        required
      >

      <p class="muted">
        Escolha uma data e um horário para cada aula.
      </p>

      <div id="camposAulasLote"></div>

      <div class="modal-actions">
        <button
          type="button"
          class="secondary-button"
          data-close
        >
          Cancelar
        </button>

        <button
          type="submit"
          class="primary-button"
        >
          Salvar todas as aulas
        </button>
      </div>

    </form>
  `);

  const quantidade = document.getElementById("quantidadeAulasLote");
  const formulario = document.getElementById("formAgendamentoLote");

  quantidade.addEventListener("change", () => {
    renderizarCamposAgendamentoLote();
  });

  formulario.onsubmit = salvarAgendamentoLote;

  renderizarCamposAgendamentoLote(false);
}


function renderizarCamposAgendamentoLote(preservar = true) {
  const quantidadeInput = document.getElementById("quantidadeAulasLote");
  const container = document.getElementById("camposAulasLote");

  if (!quantidadeInput || !container) return;

  const dadosAnteriores = [];

  if (preservar) {
    container.querySelectorAll(".campo-aula-lote").forEach(campo => {
      dadosAnteriores.push({
        data: campo.querySelector(".lote-data")?.value || "",
        horario: campo.querySelector(".lote-horario")?.value || ""
      });
    });
  }

  const quantidade = Math.max(
    1,
    Math.min(50, Number(quantidadeInput.value) || 1)
  );

  quantidadeInput.value = quantidade;

  container.innerHTML = Array.from(
    { length: quantidade },
    (_, indice) => {
      const anterior = dadosAnteriores[indice] || {};
      const data = anterior.data || dataHoje();

      return `
        <div class="campo-aula-lote panel">
          <h3>Aula ${indice + 1}</h3>

          <label>Data</label>
          <input
            class="lote-data"
            name="data_${indice}"
            type="date"
            value="${escapar(data)}"
            required
          >

          <label>Horário</label>
          <select
            class="lote-horario"
            name="horario_${indice}"
            required
          >
            <option value="">Selecione o horário</option>

            ${HORARIOS.map(h => `
              <option
                value="${h}"
                ${anterior.horario === h ? "selected" : ""}
              >
                ${h}
              </option>
            `).join("")}

          </select>
        </div>
      `;
    }
  ).join("");
}


function salvarAgendamentoLote(evento) {
  evento.preventDefault();

  const formulario = evento.target;
  const dados = new FormData(formulario);

  const alunoId = dados.get("alunoId");
  const veiculoId = dados.get("veiculoId");

  const quantidade = Math.max(
    1,
    Math.min(
      50,
      Number(document.getElementById("quantidadeAulasLote").value) || 1
    )
  );

  if (!db.alunos.some(a => a.id === alunoId)) {
    mostrarAviso("Selecione um aluno válido.");
    return;
  }

  if (!db.veiculos.some(v => v.id === veiculoId)) {
    mostrarAviso("Selecione um veículo válido.");
    return;
  }

  const novasAulas = [];

  for (let i = 0; i < quantidade; i++) {
    const data = dados.get(`data_${i}`);
    const horario = dados.get(`horario_${i}`);

    if (!data || !horario) {
      mostrarAviso(`Preencha a data e o horário da aula ${i + 1}.`);
      return;
    }

    const conflitoExistente = db.aulas.find(a =>
      a.data === data &&
      a.horario === horario &&
      a.veiculoId === veiculoId &&
      a.status !== "Cancelada"
    );

    if (conflitoExistente) {
      mostrarAviso(
        `Aula ${i + 1}: este veículo já possui aula nessa data e horário.`
      );
      return;
    }

    const conflitoLote = novasAulas.find(a =>
      a.data === data &&
      a.horario === horario &&
      a.veiculoId === veiculoId
    );

    if (conflitoLote) {
      mostrarAviso(
        `Aula ${i + 1}: existe outra aula deste lote no mesmo dia e horário.`
      );
      return;
    }

    novasAulas.push({
      id: gerarId(),
      alunoId,
      data,
      horario,
      veiculoId,
      status: "Agendada",
      observacoes: ""
    });
  }

  db.aulas.push(...novasAulas);

  salvarDados();
  fecharModal();

  listarAulas();
  listarAlunos();
  atualizarSeletoresAlunos();
  atualizarPainel();

  mostrarAviso(
    `${novasAulas.length} aulas agendadas com sucesso!`
  );
}


function ajustarSaldoAula(aula, fator) {
  if (aula.status !== "Realizada") return;

  const aluno = db.alunos.find(a => a.id === aula.alunoId);
  if (aluno) {
    aluno.saldo = Math.max(0, Number(aluno.saldo || 0) - fator);
  }
}

function listarAulas() {
  const lista = document.getElementById("listaAulas");
  if (!lista) return;

  const filtroData = document.getElementById("filtroDataAulas")?.value || "";
  const filtroAluno = document.getElementById("filtroAlunoAulas")?.value || "";

  const aulas = db.aulas
    .filter(a => !filtroData || a.data === filtroData)
    .filter(a => !filtroAluno || a.alunoId === filtroAluno)
    .sort((a, b) => (a.data + a.horario).localeCompare(b.data + b.horario));

  lista.innerHTML = aulas.length
    ? aulas.map(a => {
        const veiculo = db.veiculos.find(v => v.id === a.veiculoId);
        const aluno = db.alunos.find(x => x.id === a.alunoId);

        const numeroAula = db.aulas.filter(x =>
          x.alunoId === a.alunoId &&
          x.status === "Realizada" &&
          (x.data + x.horario).localeCompare(a.data + a.horario) <= 0
        ).length;

        return `
          <div class="record">
            <strong>${escapar(aluno?.nome || "Aluno não encontrado")}</strong>
            <p>${formatarData(a.data)} • ${escapar(a.horario)}</p>
            <p>Veículo: ${escapar(veiculo?.modelo || "Não encontrado")}</p>
            <p>Situação: ${escapar(a.status)}</p>
            <p>Aula realizada: ${a.status === "Realizada" ? numeroAula : "—"}</p>
            <div class="record-actions">
              <button type="button" data-edit-aula="${a.id}">Editar</button>
              <button type="button" data-delete-aula="${a.id}">Excluir</button>
            </div>
          </div>
        `;
      }).join("")
    : '<div class="empty-state">Nenhuma aula encontrada.</div>';
}

function excluirAula(id) {
  if (!confirmar("Deseja excluir esta aula?")) return;

  try {
    const aula = db.aulas.find(
      a => String(a.id) === String(id)
    );

    if (aula) {
      ajustarSaldoAula(aula, -1);
    }

    db.aulas = db.aulas.filter(
      a => String(a.id) !== String(id)
    );

    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));

    mostrarAviso("Aula excluída.");

    try {
      listarAulas();
    } catch (erro) {
      console.error("Erro ao atualizar aulas:", erro);
    }

    try {
      listarAlunos();
    } catch (erro) {
      console.error("Erro ao atualizar alunos:", erro);
    }

    try {
      atualizarPainel();
    } catch (erro) {
      console.error("Erro ao atualizar painel:", erro);
    }

  } catch (erro) {
    console.error("Erro ao excluir aula:", erro);
    mostrarAviso("Erro ao excluir a aula. Tente novamente.");
  }
}
/* =========================================
   FINANCEIRO
========================================= */

function registrarMovimentacao(tipo, descricao, valor, alunoId = null) {
  db.movimentacoes.push({
    id: gerarId(),
    tipo,
    descricao,
    valor: Number(valor),
    alunoId,
    data: dataHoje()
  });

  salvarDados();
}

function atualizarFinanceiro() {
  const entradas = db.movimentacoes
    .filter(m => m.tipo === "entrada")
    .reduce((s, m) => s + Number(m.valor || 0), 0);

  const saidas = db.movimentacoes
    .filter(m => m.tipo === "saida")
    .reduce((s, m) => s + Number(m.valor || 0), 0);

  const elEntradas = document.getElementById("totalEntradas");
  const elDespesas = document.getElementById("totalDespesas");
  const elSaldo = document.getElementById("saldoFinanceiro");

  if (elEntradas) elEntradas.textContent = moeda(entradas);
  if (elDespesas) elDespesas.textContent = moeda(saidas);
  if (elSaldo) elSaldo.textContent = moeda(entradas - saidas);
}

function listarMovimentacoes() {
  const lista = document.getElementById("listaMovimentacoes");
  if (!lista) return;

  const movimentos = [...db.movimentacoes].reverse();

  lista.innerHTML = movimentos.map(m => {
    const venda = m.vendaId
      ? db.vendas.find(v => v.id === m.vendaId)
      : null;

    let acao = "";

    if (m.tipo === "saida" && !m.vendaId) {
      acao = `<button type="button" data-delete-despesa="${m.id}">Excluir despesa</button>`;
    } else if (m.tipo === "entrada" && venda) {
      acao = `<button type="button" data-delete-venda="${venda.id}">Excluir venda</button>`;
    }

    return `
      <div class="record">
        <strong>${escapar(m.descricao)}</strong>
        <p>${formatarData(m.data)} • ${m.tipo === "entrada" ? "Entrada" : "Saída"}</p>
        <strong>${moeda(m.valor)}</strong>
        <div class="record-actions">${acao}</div>
      </div>
    `;
  }).join("") || '<div class="empty-state">Nenhuma movimentação.</div>';
}

/* =========================================
   PRODUTOS E SERVIÇOS
========================================= */

function listarProdutos() {
  const lista = document.getElementById("listaProdutos");
  if (!lista) return;

  const campoBusca = document.getElementById("buscaProdutos");
  const busca = (campoBusca?.value || "").trim().toLowerCase();

  const produtos = db.produtos.filter(p =>
    String(p.nome || "").toLowerCase().includes(busca)
  );

  lista.innerHTML = produtos.length
    ? produtos.map(p => {
        const tipo = p.tipo ||
          (/pacote\s*(bronze|prata|ouro)|aula avulsa/i.test(p.nome || "")
            ? "servico"
            : "produto");

        return `
          <div class="record">
            <div class="record-info">
              <strong>${escapar(p.nome)}</strong>
              <p>Classificação: <strong>${tipo === "servico" ? "Serviço" : "Produto"}</strong></p>
              <p>Valor: <strong>${moeda(p.preco)}</strong></p>
            </div>

            <div class="record-actions">
              <button type="button" data-edit-produto="${escapar(p.id)}">
                Editar
              </button>

              <button type="button" data-delete-produto="${escapar(p.id)}">
                Excluir
              </button>
            </div>
          </div>
        `;
      }).join("")
    : '<div class="empty-state">Nenhum produto encontrado.</div>';
}

function editarProduto(id = null) {
  const produto = db.produtos.find(p => p.id === id) || {};

  const tipoAtual = produto.tipo ||
    (/pacote\s*(bronze|prata|ouro)|aula avulsa/i.test(produto.nome || "")
      ? "servico"
      : "produto");

  abrirModal(`
    <h2>${id ? "Editar produto" : "Cadastrar produto"}</h2>

    <form id="formProduto">
      <label>Nome do produto ou serviço</label>
      <input name="nome" required
        value="${escapar(produto.nome || "")}">

      <label>Classificação</label>
      <select name="tipo" required>
        <option value="servico" ${tipoAtual === "servico" ? "selected" : ""}>
          Serviço
        </option>
        <option value="produto" ${tipoAtual === "produto" ? "selected" : ""}>
          Produto
        </option>
      </select>

      <label>Valor (R$)</label>
      <input name="preco" type="number"
        min="0.01" step="0.01" required
        value="${produto.preco ?? ""}">

      <div class="modal-actions">
        <button type="button" class="secondary-button"
          data-close>Cancelar</button>

        <button type="submit" class="primary-button">
          Salvar
        </button>
      </div>
    </form>
  `);

  document.getElementById("formProduto").onsubmit = evento => {
    evento.preventDefault();

    const dados = Object.fromEntries(
      new FormData(evento.target).entries()
    );

    const nome = dados.nome.trim();
    const preco = numero(dados.preco);
    const tipo = dados.tipo;

    if (!nome || preco <= 0 ||
        !["servico", "produto"].includes(tipo)) {
      mostrarAviso("Confira o nome, a classificação e o valor.");
      return;
    }

    const duplicado = db.produtos.find(p =>
      p.nome.toLowerCase() === nome.toLowerCase() &&
      p.id !== id
    );

    if (duplicado) {
      mostrarAviso("Já existe um produto com esse nome.");
      return;
    }

    if (id) {
      const indice = db.produtos.findIndex(p => p.id === id);

      if (indice >= 0) {
        db.produtos[indice] = {
          ...db.produtos[indice],
          nome,
          preco,
          tipo
        };
      }
    } else {
      db.produtos.push({
        id: gerarId(),
        nome,
        preco,
        tipo
      });
    }

    salvarDados();
    fecharModal();
    listarProdutos();
    mostrarAviso("Cadastro salvo com sucesso!");
  };
}

function excluirProduto(id) {
  const produto = db.produtos.find(p => p.id === id);
  if (!produto) return;

  if (!confirmar(`Excluir o produto "${produto.nome}"?`)) return;

  db.produtos = db.produtos.filter(p => p.id !== id);

  salvarDados();
  listarProdutos();
  mostrarAviso("Produto excluído.");
}


/* =========================================
   VENDAS
========================================= */


function abrirVenda() {
  if (!db.alunos.length) {
    mostrarAviso("Cadastre um aluno primeiro.");
    return;
  }

  if (!db.produtos.length) {
    mostrarAviso("Cadastre um produto primeiro.");
    return;
  }

  const itensCarrinho = [];

  abrirModal(`
    <h2>Nova venda</h2>

    <form id="formVenda">
      <label>Aluno</label>
      <select name="alunoId" required>
        <option value="">Selecione</option>
        ${db.alunos.map(a =>
          `<option value="${a.id}">${escapar(a.nome)}</option>`
        ).join("")}
      </select>

      <label>Produto ou serviço</label>
      <select id="produtoVenda">
        <option value="">Selecione</option>
        ${db.produtos.map(p =>
          `<option value="${p.id}" data-preco="${p.preco}">
            ${escapar(p.nome)} — ${moeda(p.preco)}
          </option>`
        ).join("")}
      </select>

      <label>Quantidade</label>
      <input id="quantidadeVenda" type="number" min="1" step="1" value="1">

      <button type="button" id="adicionarItemVenda" class="secondary-button">
        Adicionar item
      </button>

      <div class="panel">
        <strong>Itens da venda</strong>
        <div id="itensCarrinhoVenda">
          <p>Nenhum item adicionado.</p>
        </div>
        <p>Total: <strong id="totalVenda">R$ 0,00</strong></p>
        <p>Aulas que serão adicionadas:
          <strong id="aulasVenda">0</strong>
        </p>
      </div>

      <div class="modal-actions">
        <button type="button" class="secondary-button" data-close>
          Cancelar
        </button>
        <button type="submit" class="primary-button">
          Confirmar venda
        </button>
      </div>
    </form>
  `);

  const formulario = document.getElementById("formVenda");
  const campoProduto = document.getElementById("produtoVenda");
  const campoQuantidade = document.getElementById("quantidadeVenda");

  function atualizarCarrinho() {
    const lista = document.getElementById("itensCarrinhoVenda");

    lista.innerHTML = itensCarrinho.length
      ? itensCarrinho.map((item, indice) => `
          <div class="record">
            <strong>${escapar(item.nome)}</strong>
            <p>Classificação: ${item.tipo === "servico" ? "Serviço" : "Produto"}</p>
            <p>Quantidade: ${item.quantidade}</p>
            <p>Subtotal: ${moeda(item.total)}</p>
            <button type="button" data-remover-item="${indice}">
              Remover
            </button>
          </div>
        `).join("")
      : "<p>Nenhum item adicionado.</p>";

    const total = itensCarrinho.reduce((s, item) => s + item.total, 0);
    const aulas = itensCarrinho.reduce(
      (s, item) => s + (item.tipo === "servico" ? item.quantidade : 0),
      0
    );

    document.getElementById("totalVenda").textContent = moeda(total);
    document.getElementById("aulasVenda").textContent = aulas;
  }

  document.getElementById("adicionarItemVenda").onclick = () => {
    const produto = db.produtos.find(p => p.id === campoProduto.value);
    const quantidade = numero(campoQuantidade.value);

    if (!produto || !Number.isInteger(quantidade) || quantidade < 1) {
      mostrarAviso("Selecione um item e informe uma quantidade válida.");
      return;
    }

    const tipo = produto.tipo ||
      (/pacote\s*(bronze|prata|ouro)|aula avulsa/i.test(produto.nome || "")
        ? "servico"
        : "produto");

    const preco = Number(produto.preco);

    if (preco <= 0) {
      mostrarAviso("O item possui um valor inválido.");
      return;
    }

    itensCarrinho.push({
      produtoId: produto.id,
      nome: produto.nome,
      tipo,
      quantidade,
      precoUnitario: preco,
      total: preco * quantidade
    });

    campoProduto.value = "";
    campoQuantidade.value = "1";
    atualizarCarrinho();
  };

  document.getElementById("itensCarrinhoVenda").onclick = evento => {
    const botao = evento.target.closest("[data-remover-item]");
    if (!botao) return;

    const indice = Number(botao.dataset.removerItem);
    itensCarrinho.splice(indice, 1);
    atualizarCarrinho();
  };

  formulario.onsubmit = evento => salvarVenda(evento, itensCarrinho);
}

function calcularVenda() {
  const total = document.getElementById("totalVenda");
  if (!total) return 0;

  return numero(
    total.textContent.replace(/[^\d,.-]/g, "").replace(",", ".")
  );
}

function salvarVenda(evento, itensCarrinho) {
  evento.preventDefault();

  const formulario = evento.target;

  const aluno = db.alunos.find(a =>
    a.id === formulario.elements.alunoId.value
  );

  if (!aluno || !itensCarrinho.length) {
    mostrarAviso("Selecione o aluno e adicione pelo menos um item.");
    return;
  }

  const total = itensCarrinho.reduce((s, item) => s + item.total, 0);

  const aulasVendidas = itensCarrinho.reduce(
    (s, item) => s + (item.tipo === "servico" ? item.quantidade : 0),
    0
  );

  const descricaoItens = itensCarrinho.map(item =>
    `${item.nome} (${item.quantidade})`
  ).join(", ");

  const venda = {
    id: gerarId(),
    alunoId: aluno.id,
    itens: itensCarrinho.map(item => ({
      ...item,
      aulasDevolvidas: 0,
      valorDevolvido: 0
    })),
    pacote: descricaoItens,
    descricao: descricaoItens,
    aulasVendidas,
    aulasDevolvidas: 0,
    valorTotal: total,
    valorDevolvido: 0,
    data: dataHoje()
  };

  db.vendas.push(venda);

  if (aulasVendidas > 0) {
    aluno.saldo = Number(aluno.saldo || 0) + aulasVendidas;
    aluno.contratadas = Number(aluno.contratadas || 0) + aulasVendidas;
  }

  db.movimentacoes.push({
    id: gerarId(),
    tipo: "entrada",
    descricao: `Venda para ${aluno.nome}: ${descricaoItens}`,
    valor: total,
    alunoId: aluno.id,
    vendaId: venda.id,
    data: dataHoje()
  });

  salvarDados();
  fecharModal();
  listarAlunos();
  listarMovimentacoes();
  atualizarFinanceiro();

  mostrarAviso(
    aulasVendidas > 0
      ? `Venda registrada! ${aulasVendidas} aulas adicionadas ao aluno.`
      : "Venda de produtos registrada com sucesso!"
  );
}

/* =========================================
   DEVOLUÇÕES
========================================= */

function abrirDevolucao() {
  const opcoes = [];

  db.vendas.forEach(venda => {
    const aluno = db.alunos.find(a => a.id === venda.alunoId);

    if (Array.isArray(venda.itens)) {
      venda.itens.forEach((item, indice) => {
        if (item.tipo !== "servico") return;

        const disponiveis =
          Number(item.quantidade || 0) -
          Number(item.aulasDevolvidas || 0);

        if (disponiveis > 0) {
          opcoes.push({
            valor: `${venda.id}::${indice}`,
            texto: `${aluno?.nome || "Aluno"} — ${item.nome} — ${disponiveis} aulas`
          });
        }
      });
    } else {
      const disponiveis =
        Number(venda.aulasVendidas || 0) -
        Number(venda.aulasDevolvidas || 0);

      if (disponiveis > 0) {
        opcoes.push({
          valor: `${venda.id}::legacy`,
          texto: `${aluno?.nome || "Aluno"} — ${venda.descricao} — ${disponiveis} aulas`
        });
      }
    }
  });

  if (!opcoes.length) {
    mostrarAviso("Não existem aulas disponíveis para devolução.");
    return;
  }

  abrirModal(`
    <h2>Devolução de aulas</h2>

    <form id="formDevolucao">
      <label>Item da venda</label>
      <select name="itemVenda" required>
        <option value="">Selecione</option>
        ${opcoes.map(o =>
          `<option value="${o.valor}">${escapar(o.texto)}</option>`
        ).join("")}
      </select>

      <label>Quantidade para devolver</label>
      <input name="quantidade" type="number" min="1" step="1" required>

      <div class="modal-actions">
        <button type="button" class="secondary-button" data-close>
          Cancelar
        </button>
        <button type="submit" class="primary-button">
          Confirmar devolução
        </button>
      </div>
    </form>
  `);

  document.getElementById("formDevolucao").onsubmit = salvarDevolucao;
}

function salvarDevolucao(evento) {
  evento.preventDefault();

  const formulario = evento.target;
  const [vendaId, indiceItem] = formulario.elements.itemVenda.value.split("::");

  const venda = db.vendas.find(v => v.id === vendaId);
  const quantidade = numero(formulario.elements.quantidade.value);

  if (!venda || !Number.isInteger(quantidade) || quantidade < 1) {
    mostrarAviso("Informe uma devolução válida.");
    return;
  }

  const aluno = db.alunos.find(a => a.id === venda.alunoId);

  if (!aluno || quantidade > Number(aluno.saldo || 0)) {
    mostrarAviso("Quantidade indisponível ou aulas já utilizadas.");
    return;
  }

  let disponiveis;
  let preco;
  let valor;

  if (indiceItem === "legacy") {
    disponiveis =
      Number(venda.aulasVendidas || 0) -
      Number(venda.aulasDevolvidas || 0);

    preco = Number(
      venda.precoUnitario ||
      venda.valorTotal / venda.aulasVendidas
    );

    if (quantidade > disponiveis) {
      mostrarAviso("Quantidade maior que o disponível para devolução.");
      return;
    }

    valor = Math.min(
      preco * quantidade,
      Number(venda.valorTotal) - Number(venda.valorDevolvido || 0)
    );

    venda.aulasDevolvidas = Number(venda.aulasDevolvidas || 0) + quantidade;
    venda.valorDevolvido = Number(venda.valorDevolvido || 0) + valor;
  } else {
    const item = venda.itens?.[Number(indiceItem)];

    if (!item || item.tipo !== "servico") {
      mostrarAviso("Item de serviço não encontrado.");
      return;
    }

    disponiveis =
      Number(item.quantidade || 0) -
      Number(item.aulasDevolvidas || 0);

    if (quantidade > disponiveis) {
      mostrarAviso("Quantidade maior que o disponível para devolução.");
      return;
    }

    preco = Number(item.precoUnitario || 0);
    valor = Math.min(
      preco * quantidade,
      Number(item.total) - Number(item.valorDevolvido || 0)
    );

    item.aulasDevolvidas = Number(item.aulasDevolvidas || 0) + quantidade;
    item.valorDevolvido = Number(item.valorDevolvido || 0) + valor;

    venda.aulasDevolvidas = Number(venda.aulasDevolvidas || 0) + quantidade;
    venda.valorDevolvido = Number(venda.valorDevolvido || 0) + valor;
  }

  aluno.saldo = Number(aluno.saldo || 0) - quantidade;
  aluno.contratadas = Math.max(
    0,
    Number(aluno.contratadas || 0) - quantidade
  );

  db.movimentacoes.push({
    id: gerarId(),
    tipo: "saida",
    descricao: `Devolução de ${quantidade} aula(s) para ${aluno.nome}`,
    valor,
    alunoId: aluno.id,
    vendaId: venda.id,
    data: dataHoje()
  });

  salvarDados();
  fecharModal();
  listarAlunos();
  listarMovimentacoes();
  atualizarFinanceiro();
  mostrarAviso("Devolução registrada.");
}


/* =========================================
   DESPESAS E EXCLUSÕES FINANCEIRAS
========================================= */

function abrirDespesa() {
  abrirModal(`
    <h2>Nova despesa</h2>
    <form id="formDespesa">
      <label>Descrição</label>
      <input name="descricao" required>
      <label>Valor (R$)</label>
      <input name="valor" type="number" min="0.01" step="0.01" required>
      <div class="modal-actions">
        <button type="button" class="secondary-button" data-close>Cancelar</button>
        <button type="submit" class="primary-button">Registrar despesa</button>
      </div>
    </form>
  `);

  document.getElementById("formDespesa").onsubmit = evento => {
    evento.preventDefault();

    const dados = Object.fromEntries(new FormData(evento.target).entries());
    const valor = numero(dados.valor);

    if (valor <= 0 || !dados.descricao.trim()) {
      mostrarAviso("Informe descrição e valor válidos.");
      return;
    }

    registrarMovimentacao("saida", dados.descricao.trim(), valor);
    fecharModal();
    listarMovimentacoes();
    atualizarFinanceiro();
    mostrarAviso("Despesa registrada.");
  };
}


function excluirVenda(id) {
  const venda = db.vendas.find(v => v.id === id);
  if (!venda) return;

  const aluno = db.alunos.find(a => a.id === venda.alunoId);

  if (!aluno) {
    mostrarAviso("Aluno da venda não encontrado.");
    return;
  }

  let aulasLiquidas = 0;

  if (Array.isArray(venda.itens)) {
    aulasLiquidas = venda.itens.reduce((total, item) => {
      if (item.tipo !== "servico") return total;

      const quantidade = Number(item.quantidade || 0);
      const devolvidas = Number(item.aulasDevolvidas || 0);

      return total + Math.max(0, quantidade - devolvidas);
    }, 0);
  } else {
    aulasLiquidas =
      Number(venda.aulasVendidas || 0) -
      Number(venda.aulasDevolvidas || 0);
  }

  if (Number(aluno.saldo || 0) < aulasLiquidas) {
    mostrarAviso(
      "Não é possível excluir: parte das aulas já foi utilizada."
    );
    return;
  }

  if (!confirmar("Excluir esta venda e seus lançamentos financeiros?")) {
    return;
  }

  if (aulasLiquidas > 0) {
    aluno.saldo = Number(aluno.saldo || 0) - aulasLiquidas;

    aluno.contratadas = Math.max(
      0,
      Number(aluno.contratadas || 0) - aulasLiquidas
    );
  }

  db.vendas = db.vendas.filter(v => v.id !== id);
  db.movimentacoes = db.movimentacoes.filter(m => m.vendaId !== id);

  salvarDados();
  listarAlunos();
  listarMovimentacoes();
  atualizarFinanceiro();

  mostrarAviso("Venda excluída e saldo atualizado.");
}


function excluirDespesa(id) {
  const movimento = db.movimentacoes.find(m =>
    m.id === id && m.tipo === "saida" && !m.vendaId
  );

  if (!movimento) return;
  if (!confirmar("Excluir esta despesa?")) return;

  db.movimentacoes = db.movimentacoes.filter(m => m.id !== id);

  salvarDados();
  listarMovimentacoes();
  atualizarFinanceiro();
  mostrarAviso("Despesa excluída.");
      }
/* =========================================
   SELETORES E RELATÓRIOS
========================================= */

function atualizarSeletoresAlunos() {
  const selects = [
    document.getElementById("filtroAlunoAulas"),
    document.getElementById("relatorioAluno")
  ];

  selects.forEach(select => {
    if (!select) return;

    const valorAnterior = select.value;
    const primeiro = select.id === "filtroAlunoAulas"
      ? "Todos os alunos"
      : "Selecione um aluno";

    select.innerHTML = `<option value="">${primeiro}</option>` +
      db.alunos.map(a => `
        <option value="${a.id}">${escapar(a.nome)}</option>
      `).join("");

    select.value = valorAnterior;
  });
}

function gerarRelatorioAluno() {
  const id = document.getElementById("relatorioAluno").value;

  if (!id) {
    mostrarAviso("Selecione um aluno.");
    return;
  }

  const aluno = db.alunos.find(a => a.id === id);
  if (!aluno) return;

  const aulas = db.aulas
    .filter(a => a.alunoId === id)
    .sort((a, b) =>
      (a.data + a.horario).localeCompare(b.data + b.horario)
    );

  const realizadas = aulas.filter(a => a.status === "Realizada").length;

  mostrarRelatorio(`
    <h2>Relatório individual de aulas</h2>
    <p><strong>Aluno:</strong> ${escapar(aluno.nome)}</p>
    <p><strong>Categoria:</strong> ${escapar(aluno.categoria)}</p>
    <p><strong>Total contratado:</strong> ${Number(aluno.contratadas || 0)}</p>
    <p><strong>Realizadas:</strong> ${realizadas}</p>
    <p><strong>Restantes:</strong> ${Number(aluno.saldo || 0)}</p>
    ${tabelaAulas(aulas)}
  `);
}

function gerarRelatorioPeriodo() {
  const inicio = document.getElementById("relatorioInicio").value;
  const fim = document.getElementById("relatorioFim").value;

  if (!inicio || !fim || inicio > fim) {
    mostrarAviso("Informe um período válido.");
    return;
  }

  const aulas = db.aulas.filter(a =>
    a.data >= inicio && a.data <= fim
  );

  mostrarRelatorio(`
    <h2>Relatório por período</h2>
    <p>De ${formatarData(inicio)} até ${formatarData(fim)}</p>
    ${tabelaAulas(aulas)}
  `);
}

function gerarRelatorioDiario() {
  const data = document.getElementById("relatorioData").value;

  if (!data) {
    mostrarAviso("Selecione uma data.");
    return;
  }

  const aulas = db.aulas
    .filter(a => a.data === data && a.status !== "Cancelada")
    .sort((a, b) => a.horario.localeCompare(b.horario));

  mostrarRelatorio(`
    <h2>Lista diária de aulas</h2>
    <p>Data: ${formatarData(data)}</p>
    ${tabelaAulas(aulas, true)}
  `);
}

function tabelaAulas(aulas, assinatura = false) {
  if (!aulas.length) return "<p>Nenhuma aula encontrada.</p>";

  return `
    <div class="report-table">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Horário</th>
            <th>Aluno</th>
            <th>Veículo</th>
            <th>Situação</th>
            ${assinatura ? "<th>Assinatura</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${aulas.map(a => {
            const veiculo = db.veiculos.find(v => v.id === a.veiculoId);

            return `
              <tr>
                <td>${formatarData(a.data)}</td>
                <td>${escapar(a.horario)}</td>
                <td>${escapar(nomeAluno(a.alunoId))}</td>
                <td>${escapar(veiculo?.modelo || "")}</td>
                <td>${escapar(a.status)}</td>
                ${assinatura ? "<td>__________________</td>" : ""}
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

/* RELATÓRIO EM NOVA TELA */

function mostrarRelatorio(conteudo) {
  relatorioAtual = conteudo;

  const resultado = document.getElementById("resultadoRelatorio");

  if (!resultado) {
    mostrarAviso("Área de exibição do relatório não encontrada.");
    return;
  }

  const nomeEmpresa = escapar(
    db.configuracoes.nome || "Marcus Instrutor"
  );

  let estilo = document.getElementById("estiloRelatorio");

  if (!estilo) {
    estilo = document.createElement("style");
    estilo.id = "estiloRelatorio";

    estilo.textContent = `
      #resultadoRelatorio {
        background: #fff;
        color: #222;
        padding: 18px;
        margin-top: 20px;
        border-radius: 10px;
        border: 1px solid #ddd;
      }

      #resultadoRelatorio .cabecalho-relatorio {
        text-align: center;
        border-bottom: 2px solid #12345a;
        padding-bottom: 12px;
        margin-bottom: 20px;
      }

      #resultadoRelatorio h1,
      #resultadoRelatorio h2 {
        color: #12345a;
      }

      #resultadoRelatorio table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 15px;
      }

      #resultadoRelatorio th,
      #resultadoRelatorio td {
        border: 1px solid #999;
        padding: 8px;
        text-align: left;
        font-size: 13px;
      }

      #resultadoRelatorio th {
        background: #e8edf3;
        color: #12345a;
      }

      #resultadoRelatorio .acoes-relatorio {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin: 20px 0;
      }

      #resultadoRelatorio .acoes-relatorio button {
        padding: 12px 16px;
        border: 0;
        border-radius: 6px;
        background: #12345a;
        color: white;
        cursor: pointer;
      }

      #resultadoRelatorio .acoes-relatorio .fechar {
        background: #555;
      }

      @media print {
        body * {
          visibility: hidden !important;
        }

        #resultadoRelatorio,
        #resultadoRelatorio * {
          visibility: visible !important;
        }

        #resultadoRelatorio {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 10mm !important;
          border: 0 !important;
          box-shadow: none !important;
        }

        #resultadoRelatorio .acoes-relatorio {
          display: none !important;
        }

        #resultadoRelatorio th {
          background: #e8edf3 !important;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }

        #resultadoRelatorio tr {
          page-break-inside: avoid;
        }
      }
    `;

    document.head.appendChild(estilo);
  }

  resultado.innerHTML = `
    <div class="cabecalho-relatorio">
      <h1>${nomeEmpresa}</h1>
      <p>Relatório de controle de aulas</p>
    </div>

    <main>
      ${conteudo}
    </main>

    <div class="acoes-relatorio">
      <button type="button" id="imprimirRelatorio">
        Imprimir / Salvar PDF
      </button>

      <button type="button" id="fecharRelatorio" class="fechar">
        Fechar relatório
      </button>
    </div>
  `;

  document.getElementById("imprimirRelatorio").onclick = () => {
    window.print();
  };

  document.getElementById("fecharRelatorio").onclick = () => {
    resultado.innerHTML = "";
    relatorioAtual = null;
  };

  resultado.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


/* =========================================
   BACKUP
========================================= */

function exportarBackup() {
  const arquivo = new Blob(
    [JSON.stringify(db, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(arquivo);
  const link = document.createElement("a");

  link.href = url;
  link.download = `backup-marcus-instrutor-${dataHoje()}.json`;
  link.click();

  URL.revokeObjectURL(url);
  mostrarAviso("Backup exportado.");
}

function importarBackup() {
  const input = document.getElementById("arquivoBackup");
  const arquivo = input?.files?.[0];

  if (!arquivo) {
    mostrarAviso("Selecione um arquivo de backup.");
    return;
  }

  const leitor = new FileReader();

  leitor.onload = () => {
    try {
      const dados = JSON.parse(leitor.result);

      const campos = [
        "alunos", "veiculos", "aulas",
        "produtos", "movimentacoes", "configuracoes"
      ];

      if (!dados || !campos.every(c => c in dados)) {
        throw new Error("Estrutura inválida");
      }

      if (!campos.slice(0, 5).every(c => Array.isArray(dados[c]))) {
        throw new Error("Dados inválidos");
      }

      if (!confirmar("Restaurar o backup e substituir os dados atuais?")) {
        return;
      }

      db = {
        ...structuredClone(estadoInicial),
        ...dados,
        vendas: dados.vendas || []
      };

      salvarDados();
      atualizarSeletoresAlunos();
      atualizarPainel();
      listarAlunos();
      listarVeiculos();
      listarAulas();
      listarMovimentacoes();
      atualizarFinanceiro();

      mostrarAviso("Backup restaurado!");
      input.value = "";
    } catch (erro) {
      mostrarAviso("Arquivo de backup inválido.");
    }
  };

  leitor.readAsText(arquivo);
}

/* =========================================
   CONFIGURAÇÕES
========================================= */
function aplicarLogo() {
  const elemento = document.querySelector(".brand-icon");

  if (!elemento) return;

  const logo = db.configuracoes?.logo;

  if (logo) {
    const imagem = document.createElement("img");
    imagem.src = logo;
    imagem.alt = "Logo do aplicativo";
    elemento.replaceChildren(imagem);
  } else {
    elemento.textContent = "MI";
  }
                                 }
function carregarConfiguracoes() {
  const nome = document.getElementById("nomeEmpresa");
  const principal = document.getElementById("corPrincipal");
  const secundaria = document.getElementById("corSecundaria");

  if (nome) nome.value = db.configuracoes.nome;
  if (principal) principal.value = db.configuracoes.corPrincipal;
  if (secundaria) secundaria.value = db.configuracoes.corSecundaria;
}

function salvarConfiguracoes() {
  db.configuracoes.nome =
    document.getElementById("nomeEmpresa").value.trim() || "Marcus Instrutor";

  db.configuracoes.corPrincipal =
    document.getElementById("corPrincipal").value;

  db.configuracoes.corSecundaria =
    document.getElementById("corSecundaria").value;

  const arquivo = document.getElementById("logoEmpresa").files[0];

  const aplicar = () => {
    document.documentElement.style.setProperty(
      "--primary",
      db.configuracoes.corPrincipal
    );

    document.documentElement.style.setProperty(
      "--secondary",
      db.configuracoes.corSecundaria
    );

    const titulo = document.querySelector(".brand h1");
    if (titulo) titulo.textContent = db.configuracoes.nome;

    aplicarLogo();

    salvarDados();
    mostrarAviso("Configurações salvas.");
  };

  if (!arquivo) {
    aplicar();
    return;
  }

  const leitor = new FileReader();

  leitor.onload = () => {
    db.configuracoes.logo = leitor.result;
    aplicar();
  };

  leitor.readAsDataURL(arquivo);
}
/* =========================================
   MODAIS
========================================= */

function abrirModal(conteudo) {
  const container = document.getElementById("modalContainer");

  container.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <button type="button" class="modal-close" data-close aria-label="Fechar">×</button>
        ${conteudo}
      </div>
    </div>
  `;

  document.body.style.overflow = "hidden";
}

function fecharModal() {
  document.getElementById("modalContainer").innerHTML = "";
  document.body.style.overflow = "";
}

function opcoes(valores, selecionado) {
  return valores.map(valor => `
    <option value="${valor}" ${valor === selecionado ? "selected" : ""}>
      ${valor}
    </option>
  `).join("");
     }

/* =========================================
   EVENTOS DO APLICATIVO
========================================= */

document.addEventListener("click", evento => {
  const pagina = evento.target.closest("[data-page]");

  if (pagina) {
    mostrarPagina(pagina.dataset.page);
    return;
  }

  if (evento.target.closest("[data-close]")) {
    fecharModal();
    return;
  }

  const editarAluno = evento.target.closest("[data-edit-aluno]");
  if (editarAluno) {
    abrirFormularioAluno(editarAluno.dataset.editAluno);
    return;
  }

  const excluirAlunoBotao = evento.target.closest("[data-delete-aluno]");
  if (excluirAlunoBotao) {
    excluirAluno(excluirAlunoBotao.dataset.deleteAluno);
    return;
  }

  const editarVeiculo = evento.target.closest("[data-edit-veiculo]");
  if (editarVeiculo) {
    abrirFormularioVeiculo(editarVeiculo.dataset.editVeiculo);
    return;
  }

  const excluirVeiculoBotao = evento.target.closest("[data-delete-veiculo]");
  if (excluirVeiculoBotao) {
    excluirVeiculo(excluirVeiculoBotao.dataset.deleteVeiculo);
    return;
  }

  const editarAula = evento.target.closest("[data-edit-aula]");
  if (editarAula) {
    abrirFormularioAula(editarAula.dataset.editAula);
    return;
  }

  const excluirAulaBotao = evento.target.closest("[data-delete-aula]");
  if (excluirAulaBotao) {
    excluirAula(excluirAulaBotao.dataset.deleteAula);
    return;
  }

  const editarProdutoBotao = evento.target.closest("[data-edit-produto]");
  if (editarProdutoBotao) {
    editarProduto(editarProdutoBotao.dataset.editProduto);
    return;
  }

  const excluirProdutoBotao = evento.target.closest("[data-delete-produto]");
  if (excluirProdutoBotao) {
    excluirProduto(excluirProdutoBotao.dataset.deleteProduto);
    return;
  }

  if (evento.target.closest("#btnNovoProduto")) {
    editarProduto();
    return;
  }

  const excluirVendaBotao = evento.target.closest("[data-delete-venda]");
  if (excluirVendaBotao) {
    excluirVenda(excluirVendaBotao.dataset.deleteVenda);
    return;
  }

  const excluirDespesaBotao = evento.target.closest("[data-delete-despesa]");
  if (excluirDespesaBotao) {
    excluirDespesa(excluirDespesaBotao.dataset.deleteDespesa);
    return;
  }
});

/* =========================================
   BOTÕES PRINCIPAIS
========================================= */

const botaoNovoAluno = document.getElementById("btnNovoAluno");
if (botaoNovoAluno) {
  botaoNovoAluno.onclick = () => abrirFormularioAluno();
}

const botaoNovoVeiculo = document.getElementById("btnNovoVeiculo");
if (botaoNovoVeiculo) {
  botaoNovoVeiculo.onclick = () => abrirFormularioVeiculo();
}

const botaoNovaAula = document.getElementById("btnNovaAula");
if (botaoNovaAula) {
  botaoNovaAula.onclick = () => abrirFormularioAula();
}
const botaoAgendamentoLote = document.getElementById("btnAgendamentoLote");
if (botaoAgendamentoLote) {
  botaoAgendamentoLote.onclick = abrirAgendamentoLote;
     }
const botaoNovaVenda = document.getElementById("btnNovaVenda");
if (botaoNovaVenda) {
  botaoNovaVenda.onclick = abrirVenda;
}

/* BOTÃO NOVA DESPESA */

const botaoNovaDespesa = document.getElementById("btnNovaDespesa");
if (botaoNovaDespesa) {
  botaoNovaDespesa.onclick = abrirDespesa;
}

/* PÁGINA DE PRODUTOS */

const botaoProdutos = document.getElementById("btnProdutos");
if (botaoProdutos) {
  botaoProdutos.onclick = () => mostrarPagina("produtos");
}

/* BUSCA DE PRODUTOS */

const buscaProdutos = document.getElementById("buscaProdutos");
if (buscaProdutos) {
  buscaProdutos.addEventListener("input", listarProdutos);
}

const botaoDevolucao = document.getElementById("btnDevolucao");
if (botaoDevolucao) {
  botaoDevolucao.onclick = abrirDevolucao;
}

const botaoRelatorioAluno = document.getElementById("btnRelatorioAluno");
if (botaoRelatorioAluno) {
  botaoRelatorioAluno.onclick = gerarRelatorioAluno;
}

const botaoRelatorioPeriodo = document.getElementById("btnRelatorioPeriodo");
if (botaoRelatorioPeriodo) {
  botaoRelatorioPeriodo.onclick = gerarRelatorioPeriodo;
}

const botaoRelatorioDiario = document.getElementById("btnRelatorioDiario");
if (botaoRelatorioDiario) {
  botaoRelatorioDiario.onclick = gerarRelatorioDiario;
}

const botaoExportarBackup = document.getElementById("btnExportarBackup");
if (botaoExportarBackup) {
  botaoExportarBackup.onclick = exportarBackup;
}

const botaoImportarBackup = document.getElementById("btnImportarBackup");
if (botaoImportarBackup) {
  botaoImportarBackup.onclick = importarBackup;
}

const botaoSalvarConfiguracoes = document.getElementById("btnSalvarConfiguracoes");
if (botaoSalvarConfiguracoes) {
  botaoSalvarConfiguracoes.onclick = salvarConfiguracoes;
}

const botaoLogout = document.getElementById("btnLogout");
if (botaoLogout) {
  botaoLogout.onclick = () => {
    mostrarAviso("Não há sessão de usuário ativa.");
  };
}

const buscaAlunos = document.getElementById("buscaAlunos");
if (buscaAlunos) {
  buscaAlunos.addEventListener("input", listarAlunos);
}

const buscaVeiculos = document.getElementById("buscaVeiculos");
if (buscaVeiculos) {
  buscaVeiculos.addEventListener("input", listarVeiculos);
}

const filtroDataAulas = document.getElementById("filtroDataAulas");
if (filtroDataAulas) {
  filtroDataAulas.addEventListener("change", listarAulas);
}

const filtroAlunoAulas = document.getElementById("filtroAlunoAulas");
if (filtroAlunoAulas) {
  filtroAlunoAulas.addEventListener("change", listarAulas);
}

/* =========================================
   INICIALIZAÇÃO
========================================= */

function iniciarAplicativo() {
  document.documentElement.style.setProperty(
    "--primary",
    db.configuracoes.corPrincipal
  );

  document.documentElement.style.setProperty(
    "--secondary",
    db.configuracoes.corSecundaria
  );

  const titulo = document.querySelector(".brand h1");
  if (titulo) titulo.textContent = db.configuracoes.nome;

  aplicarLogo();

  atualizarPainel();
  atualizarSeletoresAlunos();
  listarAlunos();
  listarVeiculos();
  listarAulas();
  listarMovimentacoes();
  atualizarFinanceiro();
  listarProdutos();
  mostrarPagina("inicio");

  console.log("Marcus Instrutor iniciado.");
          }

iniciarAplicativo();

/* =========================================
   LIMPAR TODOS OS REGISTROS
========================================= */

function limparTodosRegistros() {
  if (!confirmar(
    "ATENÇÃO!\n\nDeseja apagar TODOS os alunos, veículos, aulas, vendas, despesas e movimentações?\n\nEssa ação não poderá ser desfeita."
  )) {
    return;
  }

  db.alunos = [];
  db.veiculos = [];
  db.aulas = [];
  db.vendas = [];
  db.movimentacoes = [];

  salvarDados();

  atualizarSeletoresAlunos();
  listarAlunos();
  listarVeiculos();
  listarAulas();
  listarMovimentacoes();
  atualizarFinanceiro();
  atualizarPainel();

  mostrarAviso("Todos os registros foram apagados.");
}

const painelBackup = document.querySelector("#page-backup");

if (painelBackup) {
  const painelLimpeza = document.createElement("div");

  painelLimpeza.className = "panel";
  painelLimpeza.innerHTML = `
    <h3>Limpar todos os registros</h3>
    <p>Apaga alunos, veículos, aulas, vendas e despesas.</p>
    <button
      id="btnLimparRegistros"
      type="button"
      class="primary-button"
      style="background:#b42318"
    >
      Limpar todos os registros
    </button>
  `;

  painelBackup.appendChild(painelLimpeza);

  document.getElementById("btnLimparRegistros").onclick =
    limparTodosRegistros;
}
