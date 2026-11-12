
"use strict";

/* =========================================
   MARCUS INSTRUTOR
   Controle de aulas e financeiro
========================================= */

const STORAGE_KEY = "marcus_instrutor_novo_v1";

const HORARIOS = [
  "07:00 - 07:50",
  "08:00 - 08:50",
  "09:00 - 09:50",
  "10:00 - 10:50",
  "11:00 - 11:50",
  "14:00 - 14:50",
  "15:00 - 15:50",
  "16:00 - 16:50",
  "17:00 - 17:50",
  "18:00 - 18:50"
];

const estadoInicial = {
  alunos: [],
  veiculos: [],
  aulas: [],
  produtos: [
    { id: "p1", nome: "Aula avulsa", preco: 0, aulas: 1 },
    { id: "p2", nome: "Pacote de 5 aulas", preco: 0, aulas: 5 },
    { id: "p3", nome: "Pacote de 10 aulas", preco: 0, aulas: 10 },
    { id: "p4", nome: "Pacote de 20 aulas", preco: 0, aulas: 20 }
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

    if (!dados) {
      return structuredClone(estadoInicial);
    }

    const recuperado = JSON.parse(dados);

    return {
      ...structuredClone(estadoInicial),
      ...recuperado,
      vendas: recuperado.vendas || []
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

  if (totalAlunos) totalAlunos.textContent = db.alunos.length;

  if (totalAgendadas) {
    totalAgendadas.textContent =
      db.aulas.filter(a => a.status === "Agendada").length;
  }

  if (totalRealizadas) {
    totalRealizadas.textContent =
      db.aulas.filter(a => a.status === "Realizada").length;
  }

  if (saldoCaixa) saldoCaixa.textContent = moeda(calcularSaldo());

  const proximas = document.getElementById("proximasAulas");

  if (proximas) {
    const aulas = db.aulas
      .filter(a => a.status === "Agendada")
      .sort((a, b) =>
        (a.data + a.horario).localeCompare(b.data + b.horario)
      )
      .slice(0, 5);

    proximas.innerHTML = aulas.length
      ? aulas.map(a => `
          <div class="record">
            <strong>${escapar(nomeAluno(a.alunoId))}</strong>
            <p>${formatarData(a.data)} • ${escapar(a.horario)}</p>
          </div>
        `).join("")
      : '<div class="empty-state">Nenhuma aula agendada.</div>';
  }
}

function calcularSaldo() {
  return db.movimentacoes.reduce((total, item) => {
    return total + (
      item.tipo === "entrada"
        ? Number(item.valor)
        : -Number(item.valor)
    );
  }, 0);
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
  const aluno = db.alunos.find(a => a.id === id) || {};

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
        ${opcoes(
          ["Em aberto", "Finalizado", "Aprovado"],
          aluno.situacao || "Em aberto"
        )}
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

  const dados = Object.fromEntries(
    new FormData(evento.target).entries()
  );

  const nome = dados.nome.trim();

  if (!nome) {
    mostrarAviso("Informe o nome do aluno.");
    return;
  }

  const duplicado = db.alunos.find(a =>
    a.nome.toLowerCase() === nome.toLowerCase() &&
    a.id !== alunoEditando
  );

  if (duplicado) {
    mostrarAviso("Já existe um aluno com esse nome.");
    return;
  }

  const alunoAnterior = db.alunos.find(a => a.id === alunoEditando);

  const aluno = {
    id: alunoEditando || gerarId(),
    nome,
    telefone: dados.telefone,
    cpf: dados.cpf,
    endereco: dados.endereco,
    categoria: dados.categoria,
    situacao: dados.situacao,
    contratadas: Number(alunoAnterior?.contratadas || 0),
    saldo: Number(alunoAnterior?.saldo || 0)
  };

  if (alunoEditando) {
    const indice = db.alunos.findIndex(a => a.id === alunoEditando);
    if (indice >= 0) db.alunos[indice] = aluno;
  } else {
    db.alunos.push(aluno);
  }

  salvarDados();
  fecharModal();
  listarAlunos();
  atualizarSeletoresAlunos();
  mostrarAviso("Aluno salvo com sucesso!");
  alunoEditando = null;
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

  const dados = Object.fromEntries(
    new FormData(evento.target).entries()
  );

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
        ${db.alunos.map(a => `
          <option value="${a.id}" ${aula.alunoId === a.id ? "selected" : ""}>
            ${escapar(a.nome)}
          </option>
        `).join("")}
      </select>

      <label>Data</label>
      <input name="data" type="date" required
        value="${escapar(aula.data || dataHoje())}">

      <label>Horário</label>
      <select name="horario" required>
        <option value="">Selecione</option>
        ${HORARIOS.map(h => `
          <option value="${h}" ${aula.horario === h ? "selected" : ""}>
            ${h}
          </option>
        `).join("")}
      </select>

      <label>Veículo</label>
      <select name="veiculoId" required>
        <option value="">Selecione</option>
        ${db.veiculos.map(v => `
          <option value="${v.id}" ${aula.veiculoId === v.id ? "selected" : ""}>
            ${escapar(v.modelo)} - ${escapar(v.placa)}
          </option>
        `).join("")}
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

  const dados = Object.fromEntries(
    new FormData(evento.target).entries()
  );

  const conflito = db.aulas.find(a =>
    a.id !== aulaEditando &&
    a.data === dados.data &&
    a.horario === dados.horario &&
    a.status !== "Cancelada" &&
    dados.status !== "Cancelada"
  );

  if (conflito) {
    mostrarAviso("Este dia e horário já estão ocupados.");
    return;
  }

  const anterior = db.aulas.find(a => a.id === aulaEditando);

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
    if (aula.status === "Realizada") {
      const aluno = db.alunos.find(a => a.id === aula.alunoId);

      if (!aluno || Number(aluno.saldo || 0) < 1) {
        mostrarAviso("Este aluno não possui aulas disponíveis.");
        return;
      }
    }

    ajustarSaldoAula(aula, 1);
    db.aulas.push(aula);
  }

  salvarDados();
  fecharModal();
  listarAulas();
  listarAlunos();
  atualizarSeletoresAlunos();
  mostrarAviso("Aula salva com sucesso!");
  aulaEditando = null;
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

  const filtroData =
    document.getElementById("filtroDataAulas")?.value || "";

  const filtroAluno =
    document.getElementById("filtroAlunoAulas")?.value || "";

  const aulas = db.aulas
    .filter(a => !filtroData || a.data === filtroData)
    .filter(a => !filtroAluno || a.alunoId === filtroAluno)
    .sort((a, b) =>
      (a.data + a.horario).localeCompare(b.data + b.horario)
    );

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

  const aula = db.aulas.find(a => a.id === id);
  if (aula) ajustarSaldoAula(aula, -1);

  db.aulas = db.aulas.filter(a => a.id !== id);

  salvarDados();
  listarAulas();
  listarAlunos();
  mostrarAviso("Aula excluída.");
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
    .reduce((s, m) => s + Number(m.valor), 0);

  const despesas = db.movimentacoes
    .filter(m => m.tipo === "saida")
    .reduce((s, m) => s + Number(m.valor), 0);

  const elEntradas = document.getElementById("totalEntradas");
  const elDespesas = document.getElementById("totalDespesas");
  const elSaldo = document.getElementById("saldoFinanceiro");

  if (elEntradas) elEntradas.textContent = moeda(entradas);
  if (elDespesas) elDespesas.textContent = moeda(despesas);
  if (elSaldo) elSaldo.textContent = moeda(entradas - despesas);
}

function listarMovimentacoes() {
  const lista = document.getElementById("listaMovimentacoes");
  if (!lista) return;

  const movimentacoes = [...db.movimentacoes].reverse();

  lista.innerHTML = movimentacoes.length
    ? movimentacoes.map(m => `
        <div class="record">
          <strong>${escapar(m.descricao)}</strong>
          <p>${formatarData(m.data)} • ${
            m.tipo === "entrada" ? "Entrada" : "Saída"
          }</p>
          <strong>${moeda(m.valor)}</strong>
        </div>
      `).join("")
    : '<div class="empty-state">Nenhuma movimentação registrada.</div>';
}

/* NOVA VENDA */

function abrirVenda() {
  if (!db.alunos.length) {
    mostrarAviso("Cadastre um aluno antes de realizar uma venda.");
    return;
  }

  abrirModal(`
    <h2>Nova venda</h2>

    <form id="formVenda">
      <label>Aluno</label>
      <select name="alunoId" required>
        <option value="">Selecione o aluno</option>
        ${db.alunos.map(a => `
          <option value="${a.id}">${escapar(a.nome)}</option>
        `).join("")}
      </select>

      <div id="itensVenda">
        ${db.produtos.map(p => `
          <div class="sale-item">
            <label>
              <input type="checkbox" name="produto" value="${p.id}">
              ${escapar(p.nome)} - ${moeda(p.preco)}
            </label>
            <input type="number" min="1" value="1"
              data-quantidade="${p.id}" aria-label="Quantidade">
          </div>
        `).join("")}
      </div>

      <label>Desconto (R$)</label>
      <input name="desconto" type="number" min="0" step="0.01" value="0">

      <div class="panel">
        Total: <strong id="totalVenda">${moeda(0)}</strong>
      </div>

      <div class="modal-actions">
        <button type="button" class="secondary-button" data-close>Cancelar</button>
        <button type="submit" class="primary-button">Confirmar venda</button>
      </div>
    </form>
  `);

  document.getElementById("formVenda").addEventListener("change", calcularVenda);
  document.getElementById("formVenda").addEventListener("input", calcularVenda);
  document.getElementById("formVenda").onsubmit = salvarVenda;
}

function calcularVenda() {
  const formulario = document.getElementById("formVenda");
  if (!formulario) return 0;

  let total = 0;

  formulario.querySelectorAll('input[name="produto"]:checked').forEach(check => {
    const produto = db.produtos.find(p => p.id === check.value);
    const quantidade = numero(
      formulario.querySelector(`[data-quantidade="${check.value}"]`)?.value
    );

    if (produto) total += produto.preco * quantidade;
  });

  total -= numero(formulario.elements.desconto?.value);
  total = Math.max(0, total);

  document.getElementById("totalVenda").textContent = moeda(total);
  return total;
}

function salvarVenda(evento) {
  evento.preventDefault();

  const formulario = evento.target;
  const alunoId = formulario.elements.alunoId.value;
  const selecionados = [
    ...formulario.querySelectorAll('input[name="produto"]:checked')
  ];

  if (!selecionados.length) {
    mostrarAviso("Selecione pelo menos um produto ou serviço.");
    return;
  }

  let total = 0;
  let totalAulas = 0;
  const descricoes = [];

  selecionados.forEach(check => {
    const produto = db.produtos.find(p => p.id === check.value);
    const quantidade = numero(
      formulario.querySelector(`[data-quantidade="${check.value}"]`).value
    );

    if (produto && quantidade > 0) {
      total += produto.preco * quantidade;
      totalAulas += produto.aulas * quantidade;
      descricoes.push(`${produto.nome} x${quantidade}`);
    }
  });

  if (totalAulas <= 0) {
    mostrarAviso("A venda precisa adicionar pelo menos uma aula.");
    return;
  }

  const desconto = numero(formulario.elements.desconto.value);
  total = Math.max(0, total - desconto);

  const aluno = db.alunos.find(a => a.id === alunoId);
  if (!aluno) return;

  const venda = {
    id: gerarId(),
    alunoId,
    descricao: descricoes.join(", "),
    aulasVendidas: totalAulas,
    aulasDevolvidas: 0,
    valorTotal: total,
    valorDevolvido: 0,
    data: dataHoje()
  };

  db.vendas.push(venda);

  aluno.saldo = Number(aluno.saldo || 0) + totalAulas;
  aluno.contratadas = Number(aluno.contratadas || 0) + totalAulas;

  db.movimentacoes.push({
    id: gerarId(),
    tipo: "entrada",
    descricao: `Venda para ${aluno.nome}: ${venda.descricao}`,
    valor: total,
    alunoId,
    vendaId: venda.id,
    data: dataHoje()
  });

  salvarDados();
  fecharModal();
  listarAlunos();
  listarMovimentacoes();
  atualizarFinanceiro();

  mostrarAviso(`${totalAulas} aulas adicionadas ao saldo do aluno.`);
}

/* DEVOLUÇÃO PARCIAL OU TOTAL */

function abrirDevolucao() {
  if (!db.vendas.length) {
    mostrarAviso("Ainda não existem vendas para devolver.");
    return;
  }

  const vendasDisponiveis = db.vendas.filter(v =>
    Number(v.aulasVendidas) > Number(v.aulasDevolvidas || 0)
  );

  if (!vendasDisponiveis.length) {
    mostrarAviso("Não existem aulas disponíveis para devolução.");
    return;
  }

  abrirModal(`
    <h2>Devolução de aulas</h2>

    <form id="formDevolucao">
      <label>Venda / aluno</label>
      <select name="vendaId" id="selectVendaDevolucao" required>
        <option value="">Selecione a venda</option>
        ${vendasDisponiveis.map(v => {
          const aluno = db.alunos.find(a => a.id === v.alunoId);
          const disponiveis =
            Number(v.aulasVendidas) - Number(v.aulasDevolvidas || 0);

          return `
            <option value="${v.id}">
              ${escapar(aluno?.nome || "Aluno não encontrado")} —
              ${escapar(v.descricao)} —
              ${disponiveis} aula(s) disponíveis
            </option>
          `;
        }).join("")}
      </select>

      <label>Quantidade de aulas para devolver</label>
      <input name="quantidade" id="quantidadeDevolucao"
        type="number" min="1" step="1" required>

      <div class="panel" id="resumoDevolucao">
        Selecione uma venda para consultar os limites.
      </div>

      <div class="modal-actions">
        <button type="button" class="secondary-button" data-close>Cancelar</button>
        <button type="submit" class="primary-button">Confirmar devolução</button>
      </div>
    </form>
  `);

  document.getElementById("selectVendaDevolucao")
    .addEventListener("change", atualizarResumoDevolucao);

  document.getElementById("quantidadeDevolucao")
    .addEventListener("input", atualizarResumoDevolucao);

  document.getElementById("formDevolucao").onsubmit = salvarDevolucao;
}

function atualizarResumoDevolucao() {
  const formulario = document.getElementById("formDevolucao");
  if (!formulario) return;

  const vendaId = formulario.elements.vendaId.value;
  const venda = db.vendas.find(v => v.id === vendaId);
  const resumo = document.getElementById("resumoDevolucao");

  if (!venda) {
    resumo.textContent = "Selecione uma venda para consultar os limites.";
    return;
  }

  const quantidadeDisponivel =
    Number(venda.aulasVendidas) - Number(venda.aulasDevolvidas || 0);

  const quantidade = numero(formulario.elements.quantidade.value);
  const aluno = db.alunos.find(a => a.id === venda.alunoId);

  const valorPorAula = Number(venda.valorTotal || 0) /
    Math.max(1, Number(venda.aulasVendidas || 1));

  const valorEstimado = valorPorAula * quantidade;

  resumo.innerHTML = `
    <p><strong>Aluno:</strong> ${escapar(aluno?.nome || "")}</p>
    <p><strong>Quantidade disponível nesta venda:</strong> ${quantidadeDisponivel}</p>
    <p><strong>Saldo atual do aluno:</strong> ${Number(aluno?.saldo || 0)}</p>
    <p><strong>Valor estimado da devolução:</strong> ${moeda(valorEstimado)}</p>
    <small>O valor é calculado proporcionalmente ao preço original da venda.</small>
  `;
}

function salvarDevolucao(evento) {
  evento.preventDefault();

  const formulario = evento.target;
  const vendaId = formulario.elements.vendaId.value;
  const quantidade = numero(formulario.elements.quantidade.value);

  const venda = db.vendas.find(v => v.id === vendaId);
  if (!venda) {
    mostrarAviso("Venda não encontrada.");
    return;
  }

  const aluno = db.alunos.find(a => a.id === venda.alunoId);
  if (!aluno) {
    mostrarAviso("Aluno não encontrado.");
    return;
  }

  const quantidadeDisponivel =
    Number(venda.aulasVendidas) - Number(venda.aulasDevolvidas || 0);

  if (!Number.isInteger(quantidade) || quantidade < 1) {
    mostrarAviso("Informe uma quantidade inteira válida.");
    return;
  }

  if (quantidade > quantidadeDisponivel) {
    mostrarAviso("A quantidade supera as aulas disponíveis nesta venda.");
    return;
  }

  if (quantidade > Number(aluno.saldo || 0)) {
    mostrarAviso(
      "Não é possível devolver aulas que já foram utilizadas."
    );
    return;
  }

  const valorPorAula =
    Number(venda.valorTotal || 0) /
    Math.max(1, Number(venda.aulasVendidas || 1));

  const valorDevolvido = Math.min(
    Number(venda.valorTotal || 0) - Number(venda.valorDevolvido || 0),
    valorPorAula * quantidade
  );

  venda.aulasDevolvidas =
    Number(venda.aulasDevolvidas || 0) + quantidade;

  venda.valorDevolvido =
    Number(venda.valorDevolvido || 0) + valorDevolvido;

  aluno.saldo = Math.max(0, Number(aluno.saldo || 0) - quantidade);
  aluno.contratadas = Math.max(
    0,
    Number(aluno.contratadas || 0) - quantidade
  );

  db.movimentacoes.push({
    id: gerarId(),
    tipo: "saida",
    descricao: `Devolução de ${quantidade} aula(s) para ${aluno.nome}`,
    valor: valorDevolvido,
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
    `Devolução de ${quantidade} aula(s) registrada.`
  );
}

/* DESPESAS */

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

    const dados = Object.fromEntries(
      new FormData(evento.target).entries()
    );

    if (numero(dados.valor) <= 0) {
      mostrarAviso("Informe um valor válido.");
      return;
    }

    registrarMovimentacao(
      "saida",
      dados.descricao,
      numero(dados.valor)
    );

    fecharModal();
    listarMovimentacoes();
    atualizarFinanceiro();
    mostrarAviso("Despesa registrada.");
  };
}

/* PRODUTOS E SERVIÇOS */

function abrirProdutos() {
  abrirModal(`
    <h2>Produtos e serviços</h2>
    <p>Cadastre pacotes e serviços com seus preços e quantidades de aulas.</p>

    <div id="listaProdutos">
      ${db.produtos.map(p => `
        <div class="record">
          <strong>${escapar(p.nome)}</strong>
          <p>${moeda(p.preco)} • ${p.aulas} aula(s)</p>
          <button type="button" data-edit-produto="${p.id}">Editar</button>
          <button type="button" data-delete-produto="${p.id}">Excluir</button>
        </div>
      `).join("")}
    </div>

    <button id="btnAdicionarProduto" class="primary-button" type="button">
      + Adicionar produto
    </button>
  `);
}

function editarProduto(id = null) {
  const produto = db.produtos.find(p => p.id === id) || {};

  abrirModal(`
    <h2>${id ? "Editar produto" : "Novo produto"}</h2>

    <form id="formProduto">
      <label>Nome</label>
      <input name="nome" required value="${escapar(produto.nome)}">

      <label>Preço (R$)</label>
      <input name="preco" type="number" min="0" step="0.01"
        value="${produto.preco ?? 0}" required>

      <label>Quantidade de aulas adicionadas</label>
      <input name="aulas" type="number" min="1" step="1"
        value="${produto.aulas ?? 1}" required>

      <div class="modal-actions">
        <button type="button" class="secondary-button" data-close>Cancelar</button>
        <button type="submit" class="primary-button">Salvar</button>
      </div>
    </form>
  `);

  document.getElementById("formProduto").onsubmit = evento => {
    evento.preventDefault();

    const dados = Object.fromEntries(
      new FormData(evento.target).entries()
    );

    const aulas = numero(dados.aulas);
    const preco = numero(dados.preco);

    if (!Number.isInteger(aulas) || aulas < 1 || preco < 0) {
      mostrarAviso("Confira a quantidade de aulas e o preço.");
      return;
    }

    const novo = {
      id: id || gerarId(),
      nome: dados.nome.trim(),
      preco,
      aulas
    };

    if (id) {
      const indice = db.produtos.findIndex(p => p.id === id);
      if (indice >= 0) db.produtos[indice] = novo;
    } else {
      db.produtos.push(novo);
    }

    salvarDados();
    abrirProdutos();
    mostrarAviso("Produto salvo.");
  };
}

function excluirProduto(id) {
  if (!confirmar("Excluir este produto?")) return;

  db.produtos = db.produtos.filter(p => p.id !== id);
  salvarDados();
  abrirProdutos();
}

/* =========================================
   RELATÓRIOS
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

function mostrarRelatorio(conteudo) {
  const resultado = document.getElementById("resultadoRelatorio");

  resultado.innerHTML = `
    <div class="panel printable-report">
      ${conteudo}
      <button id="btnImprimirRelatorio" class="primary-button" type="button">
        Imprimir / Salvar PDF
      </button>
    </div>
  `;

  relatorioAtual = conteudo;
}

/* =========================================
   BACKUP E RESTAURAÇÃO
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
  const arquivo = input.files[0];

  if (!arquivo) {
    mostrarAviso("Selecione um arquivo de backup.");
    return;
  }

  const leitor = new FileReader();

  leitor.onload = () => {
    try {
      const dados = JSON.parse(leitor.result);

      const campos = [
        "alunos",
        "veiculos",
        "aulas",
        "produtos",
        "movimentacoes",
        "configuracoes"
      ];

      if (!dados || !campos.every(c => c in dados)) {
        throw new Error("Estrutura inválida");
      }

      if (!campos.slice(0, 5).every(c => Array.isArray(dados[c]))) {
        throw new Error("Dados inválidos");
      }

      if (!confirmar("Restaurar este backup substituirá os dados atuais. Continuar?")) {
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

      mostrarAviso("Backup restaurado com sucesso!");
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

    document.querySelector(".brand h1").textContent =
      db.configuracoes.nome;

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

  if (evento.target.closest("#btnAdicionarProduto")) {
    editarProduto();
    return;
  }

  if (evento.target.closest("#btnImprimirRelatorio")) {
    window.print();
    return;
  }
});

document.getElementById("btnNovoAluno").onclick =
  () => abrirFormularioAluno();

document.getElementById("btnNovoVeiculo").onclick =
  () => abrirFormularioVeiculo();

document.getElementById("btnNovaAula").onclick =
  () => abrirFormularioAula();

document.getElementById("btnNovaVenda").onclick = abrirVenda;
document.getElementById("btnNovaDespesa").onclick = abrirDespesa;
document.getElementById("btnProdutos").onclick = abrirProdutos;

const botaoDevolucao = document.getElementById("btnDevolucao");
if (botaoDevolucao) {
  botaoDevolucao.onclick = abrirDevolucao;
}

document.getElementById("btnRelatorioAluno").onclick =
  gerarRelatorioAluno;

document.getElementById("btnRelatorioPeriodo").onclick =
  gerarRelatorioPeriodo;

document.getElementById("btnRelatorioDiario").onclick =
  gerarRelatorioDiario;

document.getElementById("btnExportarBackup").onclick =
  exportarBackup;

document.getElementById("btnImportarBackup").onclick =
  importarBackup;

document.getElementById("btnSalvarConfiguracoes").onclick =
  salvarConfiguracoes;

document.getElementById("btnLogout").onclick = () => {
  mostrarAviso("Não há sessão de usuário ativa.");
};

document.getElementById("buscaAlunos").addEventListener(
  "input", listarAlunos
);

document.getElementById("buscaVeiculos").addEventListener(
  "input", listarVeiculos
);

document.getElementById("filtroDataAulas").addEventListener(
  "change", listarAulas
);

document.getElementById("filtroAlunoAulas").addEventListener(
  "change", listarAulas
);

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

  document.querySelector(".brand h1").textContent =
    db.configuracoes.nome;

  atualizarPainel();
  atualizarSeletoresAlunos();
  listarAlunos();
  listarVeiculos();
  listarAulas();
  listarMovimentacoes();
  atualizarFinanceiro();
  mostrarPagina("inicio");

  console.log("Marcus Instrutor iniciado.");
}

iniciarAplicativo();
