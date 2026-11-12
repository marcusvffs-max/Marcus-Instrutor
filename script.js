
"use strict";

// ==========================================
// MARCUS INSTRUTOR - CONTROLE DE AULAS
// ARMAZENAMENTO LOCAL + BACKUP
// ==========================================

const CHAVE_DADOS = "marcus_instrutor_dados_v1";

let dados = {
    alunos: [],
    veiculos: [],
    aulas: []
};

// ==========================================
// FUNÇÕES BÁSICAS
// ==========================================

function gerarId() {
    return Date.now().toString(36) +
        Math.random().toString(36).slice(2, 9);
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

function salvarDados() {
    try {
        localStorage.setItem(CHAVE_DADOS, JSON.stringify(dados));
        atualizarPainel();
    } catch (erro) {
        alert("Não foi possível salvar os dados. Faça um backup e verifique o espaço disponível.");
        console.error(erro);
    }
}

function carregarDados() {
    try {
        const salvo = localStorage.getItem(CHAVE_DADOS);

        if (salvo) {
            const recuperado = JSON.parse(salvo);

            dados.alunos = Array.isArray(recuperado.alunos)
                ? recuperado.alunos : [];

            dados.veiculos = Array.isArray(recuperado.veiculos)
                ? recuperado.veiculos : [];

            dados.aulas = Array.isArray(recuperado.aulas)
                ? recuperado.aulas : [];
        }
    } catch (erro) {
        alert("Não foi possível ler os dados salvos. Não faça novos cadastros antes de verificar o backup.");
        console.error(erro);
    }
}

// ==========================================
// NAVEGAÇÃO
// ==========================================

function mostrarPagina(id) {
    document.querySelectorAll(".pagina").forEach(pagina => {
        pagina.classList.remove("ativa");
    });

    const pagina = document.getElementById(id);

    if (pagina) {
        pagina.classList.add("ativa");
    }

    if (id === "inicio") atualizarPainel();
    if (id === "alunos") mostrarAlunos();
    if (id === "veiculos") mostrarVeiculos();
    if (id === "aulas") mostrarAulas();
    if (id === "relatorios") gerarRelatorio();
    if (id === "backup") mostrarBackup();
}

// ==========================================
// PAINEL PRINCIPAL
// ==========================================

function atualizarPainel() {
    const elemento = document.getElementById("resumo");
    if (!elemento) return;

    const agendadas = dados.aulas.filter(a => a.situacao === "Agendada").length;
    const realizadas = dados.aulas.filter(a => a.situacao === "Realizada").length;

    elemento.innerHTML = `
        <div class="card">Alunos cadastrados: <strong>${dados.alunos.length}</strong></div>
        <div class="card">Veículos cadastrados: <strong>${dados.veiculos.length}</strong></div>
        <div class="card">Aulas agendadas: <strong>${agendadas}</strong></div>
        <div class="card">Aulas realizadas: <strong>${realizadas}</strong></div>
    `;
}

// ==========================================
// ALUNOS
// ==========================================

function saldoAluno(alunoId) {
    const aluno = dados.alunos.find(a => a.id === alunoId);
    if (!aluno) return 0;

    const realizadas = dados.aulas.filter(a =>
        a.alunoId === alunoId && a.situacao === "Realizada"
    ).length;

    return Number(aluno.contratadas || 0) - realizadas;
}

function mostrarAlunos() {
    const area = document.getElementById("conteudoAlunos");
    if (!area) return;

    area.innerHTML = `
        <form onsubmit="salvarAluno(event)">
            <input type="hidden" id="alunoId">

            <label>Nome completo</label>
            <input id="alunoNome" required>

            <label>Telefone</label>
            <input id="alunoTelefone" type="tel">

            <label>CPF</label>
            <input id="alunoCpf">

            <label>Endereço</label>
            <input id="alunoEndereco">

            <label>Categoria</label>
            <select id="alunoCategoria" required>
                <option value="">Selecione</option>
                <option value="A">A - Moto</option>
                <option value="B">B - Carro</option>
                <option value="AB">AB - Moto e carro</option>
            </select>

            <label>Situação</label>
            <select id="alunoSituacao">
                <option>Em aberto</option>
                <option>Finalizado</option>
                <option>Aprovado</option>
            </select>

            <label>Aulas contratadas</label>
            <input id="alunoContratadas" type="number" min="0" value="0" required>

            <button class="btn" type="submit">Salvar aluno</button>
            <button class="secundario" type="button" onclick="limparAluno()">Limpar</button>
        </form>

        <h3>Alunos cadastrados</h3>
        <input id="pesquisaAluno" placeholder="Pesquisar aluno..." oninput="filtrarAlunos()">
        <div id="listaAlunos"></div>
    `;

    filtrarAlunos();
}

function salvarAluno(evento) {
    evento.preventDefault();

    const id = document.getElementById("alunoId").value;
    const nome = document.getElementById("alunoNome").value.trim();

    if (!nome) return alert("Informe o nome do aluno.");

    const aluno = {
        id: id || gerarId(),
        nome,
        telefone: document.getElementById("alunoTelefone").value.trim(),
        cpf: document.getElementById("alunoCpf").value.trim(),
        endereco: document.getElementById("alunoEndereco").value.trim(),
        categoria: document.getElementById("alunoCategoria").value,
        situacao: document.getElementById("alunoSituacao").value,
        contratadas: Number(document.getElementById("alunoContratadas").value)
    };

    const existente = id
        ? dados.alunos.find(a => a.id === id)
        : dados.alunos.find(a => a.nome.toLowerCase() === nome.toLowerCase());

    if (existente) {
        aluno.id = existente.id;
        dados.alunos = dados.alunos.map(a =>
            a.id === existente.id ? aluno : a
        );
    } else {
        dados.alunos.push(aluno);
    }

    salvarDados();
    alert("Aluno salvo com sucesso!");
    mostrarAlunos();
}

function filtrarAlunos() {
    const lista = document.getElementById("listaAlunos");
    if (!lista) return;

    const pesquisa = (
        document.getElementById("pesquisaAluno")?.value || ""
    ).toLowerCase();

    const alunos = dados.alunos.filter(a =>
        a.nome.toLowerCase().includes(pesquisa)
    );

    lista.innerHTML = alunos.length ? alunos.map(a => `
        <div class="item">
            <strong>${escapar(a.nome)}</strong>
            <p>Telefone: ${escapar(a.telefone)}</p>
            <p>Categoria: ${escapar(a.categoria)}</p>
            <p>Situação: ${escapar(a.situacao)}</p>
            <p>Aulas contratadas: ${a.contratadas}</p>
            <p>Saldo: <strong>${saldoAluno(a.id)}</strong> aulas</p>
            <button class="secundario" onclick="editarAluno('${a.id}')">Editar</button>
            <button class="perigo" onclick="excluirAluno('${a.id}')">Excluir</button>
        </div>
    `).join("") : "<p>Nenhum aluno cadastrado.</p>";
}

function editarAluno(id) {
    const a = dados.alunos.find(x => x.id === id);
    if (!a) return;

    document.getElementById("alunoId").value = a.id;
    document.getElementById("alunoNome").value = a.nome;
    document.getElementById("alunoTelefone").value = a.telefone;
    document.getElementById("alunoCpf").value = a.cpf;
    document.getElementById("alunoEndereco").value = a.endereco;
    document.getElementById("alunoCategoria").value = a.categoria;
    document.getElementById("alunoSituacao").value = a.situacao;
    document.getElementById("alunoContratadas").value = a.contratadas;

    window.scrollTo(0, 0);
}

function limparAluno() {
    mostrarAlunos();
}

function excluirAluno(id) {
    const possuiAulas = dados.aulas.some(a => a.alunoId === id);

    if (possuiAulas) {
        return alert("Este aluno possui aulas cadastradas. Não é possível excluí-lo sem antes tratar essas aulas.");
    }

    if (!confirm("Deseja excluir este aluno?")) return;

    dados.alunos = dados.alunos.filter(a => a.id !== id);
    salvarDados();
    mostrarAlunos();
}

// ==========================================
// VEÍCULOS
// ==========================================

function mostrarVeiculos() {
    const area = document.getElementById("conteudoVeiculos");
    if (!area) return;

    area.innerHTML = `
        <form onsubmit="salvarVeiculo(event)">
            <input type="hidden" id="veiculoId">

            <label>Tipo</label>
            <select id="veiculoTipo" required>
                <option value="">Selecione</option>
                <option>Carro</option>
                <option>Moto</option>
            </select>

            <label>Modelo</label>
            <input id="veiculoModelo" required>

            <label>Placa</label>
            <input id="veiculoPlaca" required>

            <label>Categoria</label>
            <select id="veiculoCategoria" required>
                <option value="">Selecione</option>
                <option value="A">A</option>
                <option value="B">B</option>
            </select>

            <button class="btn" type="submit">Salvar veículo</button>
            <button class="secundario" type="button" onclick="limparVeiculo()">Limpar</button>
        </form>

        <h3>Veículos cadastrados</h3>
        <div id="listaVeiculos"></div>
    `;

    listarVeiculos();
}

function salvarVeiculo(evento) {
    evento.preventDefault();

    const id = document.getElementById("veiculoId").value;

    const veiculo = {
        id: id || gerarId(),
        tipo: document.getElementById("veiculoTipo").value,
        modelo: document.getElementById("veiculoModelo").value.trim(),
        placa: document.getElementById("veiculoPlaca").value.trim().toUpperCase(),
        categoria: document.getElementById("veiculoCategoria").value
    };

    const existente = id
        ? dados.veiculos.find(v => v.id === id)
        : null;

    if (existente) {
        dados.veiculos = dados.veiculos.map(v =>
            v.id === id ? veiculo : v
        );
    } else {
        dados.veiculos.push(veiculo);
    }

    salvarDados();
    alert("Veículo salvo!");
    mostrarVeiculos();
}

function listarVeiculos() {
    const lista = document.getElementById("listaVeiculos");
    if (!lista) return;

    lista.innerHTML = dados.veiculos.length
        ? dados.veiculos.map(v => `
            <div class="item">
                <strong>${escapar(v.modelo)}</strong>
                <p>${escapar(v.tipo)} - ${escapar(v.categoria)}</p>
                <p>Placa: ${escapar(v.placa)}</p>
                <button class="secundario" onclick="editarVeiculo('${v.id}')">Editar</button>
                <button class="perigo" onclick="excluirVeiculo('${v.id}')">Excluir</button>
            </div>
        `).join("")
        : "<p>Nenhum veículo cadastrado.</p>";
}

function editarVeiculo(id) {
    const v = dados.veiculos.find(x => x.id === id);
    if (!v) return;

    document.getElementById("veiculoId").value = v.id;
    document.getElementById("veiculoTipo").value = v.tipo;
    document.getElementById("veiculoModelo").value = v.modelo;
    document.getElementById("veiculoPlaca").value = v.placa;
    document.getElementById("veiculoCategoria").value = v.categoria;

    window.scrollTo(0, 0);
}

function limparVeiculo() {
    mostrarVeiculos();
}

function excluirVeiculo(id) {
    if (dados.aulas.some(a => a.veiculoId === id)) {
        return alert("Este veículo possui aulas cadastradas. Não é possível excluí-lo.");
    }

    if (!confirm("Deseja excluir este veículo?")) return;

    dados.veiculos = dados.veiculos.filter(v => v.id !== id);
    salvarDados();
    mostrarVeiculos();
}

// ==========================================
// AULAS
// ==========================================

function mostrarAulas() {
    const area = document.getElementById("conteudoAulas");
    if (!area) return;

    const opcoesAlunos = dados.alunos.map(a =>
        `<option value="${a.id}">${escapar(a.nome)}</option>`
    ).join("");

    const opcoesVeiculos = dados.veiculos.map(v =>
        `<option value="${v.id}">${escapar(v.modelo)} - ${escapar(v.placa)}</option>`
    ).join("");

    area.innerHTML = `
        <form onsubmit="salvarAula(event)">
            <input type="hidden" id="aulaId">

            <label>Aluno</label>
            <select id="aulaAluno" required>
                <option value="">Selecione o aluno</option>
                ${opcoesAlunos}
            </select>

            <label>Data</label>
            <input id="aulaData" type="date" required>

            <label>Horário</label>
            <select id="aulaHorario" required>
                <option value="">Selecione</option>
                <option>07:00 - 07:50</option>
                <option>08:00 - 08:50</option>
                <option>09:00 - 09:50</option>
                <option>10:00 - 10:50</option>
                <option>11:00 - 11:50</option>
                <option>14:00 - 14:50</option>
                <option>15:00 - 15:50</option>
                <option>16:00 - 16:50</option>
                <option>17:00 - 17:50</option>
                <option>18:00 - 18:50</option>
            </select>

            <label>Veículo</label>
            <select id="aulaVeiculo" required>
                <option value="">Selecione o veículo</option>
                ${opcoesVeiculos}
            </select>

            <label>Situação</label>
            <select id="aulaSituacao">
                <option>Agendada</option>
                <option>Realizada</option>
                <option>Cancelada</option>
            </select>

            <label>Observações</label>
            <textarea id="aulaObservacao"></textarea>

            <button class="btn" type="submit">Salvar aula</button>
            <button class="secundario" type="button" onclick="limparAula()">Limpar</button>
        </form>

        <h3>Aulas cadastradas</h3>
        <label>Filtrar por aluno</label>
        <select id="filtroAulaAluno" onchange="listarAulas()">
            <option value="">Todos os alunos</option>
            ${opcoesAlunos}
        </select>

        <label>Filtrar por data</label>
        <input id="filtroAulaData" type="date" onchange="listarAulas()">

        <div id="listaAulas"></div>
    `;

    listarAulas();
}

function salvarAula(evento) {
    evento.preventDefault();

    const id = document.getElementById("aulaId").value;
    const alunoId = document.getElementById("aulaAluno").value;
    const veiculoId = document.getElementById("aulaVeiculo").value;
    const situacao = document.getElementById("aulaSituacao").value;

    const aluno = dados.alunos.find(a => a.id === alunoId);
    const veiculo = dados.veiculos.find(v => v.id === veiculoId);

    if (!aluno || !veiculo) {
        return alert("Selecione um aluno e um veículo válidos.");
    }

    if (aluno.categoria !== "AB" && aluno.categoria !== veiculo.categoria) {
        return alert("A categoria do veículo não corresponde à categoria do aluno.");
    }

    const aula = {
        id: id || gerarId(),
        alunoId,
        veiculoId,
        data: document.getElementById("aulaData").value,
        horario: document.getElementById("aulaHorario").value,
        situacao,
        observacao: document.getElementById("aulaObservacao").value.trim()
    };

    const realizadasSemEsta = dados.aulas.filter(a =>
        a.alunoId === alunoId &&
        a.situacao === "Realizada" &&
        a.id !== id
    ).length;

    if (situacao === "Realizada" &&
        realizadasSemEsta >= Number(aluno.contratadas || 0)) {
        return alert("O aluno não possui saldo de aulas disponível.");
    }

    if (id) {
        dados.aulas = dados.aulas.map(a =>
            a.id === id ? aula : a
        );
    } else {
        dados.aulas.push(aula);
    }

    salvarDados();
    alert("Aula salva com sucesso!");
    mostrarAulas();
}

function listarAulas() {
    const lista = document.getElementById("listaAulas");
    if (!lista) return;

    const alunoFiltro = document.getElementById("filtroAulaAluno")?.value || "";
    const dataFiltro = document.getElementById("filtroAulaData")?.value || "";

    const aulas = [...dados.aulas]
        .filter(a => !alunoFiltro || a.alunoId === alunoFiltro)
        .filter(a => !dataFiltro || a.data === dataFiltro)
        .sort((a, b) =>
            (a.data + a.horario).localeCompare(b.data + b.horario)
        );

    const contagem = {};

    lista.innerHTML = aulas.length ? aulas.map(a => {
        const aluno = dados.alunos.find(x => x.id === a.alunoId);
        const veiculo = dados.veiculos.find(x => x.id === a.veiculoId);

        contagem[a.alunoId] = (contagem[a.alunoId] || 0) + 1;

        return `
            <div class="item">
                <strong>${contagem[a.alunoId]}ª aula - ${escapar(aluno?.nome || "Aluno não encontrado")}</strong>
                <p>Data: ${escapar(a.data)}</p>
                <p>Horário: ${escapar(a.horario)}</p>
                <p>Veículo: ${escapar(veiculo?.modelo || "Não encontrado")}</p>
                <p>Situação: <strong>${escapar(a.situacao)}</strong></p>
                <p>${escapar(a.observacao)}</p>
                <button class="secundario" onclick="editarAula('${a.id}')">Editar</button>
                <button class="perigo" onclick="excluirAula('${a.id}')">Excluir</button>
            </div>
        `;
    }).join("") : "<p>Nenhuma aula encontrada.</p>";
}

function editarAula(id) {
    const a = dados.aulas.find(x => x.id === id);
    if (!a) return;

    document.getElementById("aulaId").value = a.id;
    document.getElementById("aulaAluno").value = a.alunoId;
    document.getElementById("aulaData").value = a.data;
    document.getElementById("aulaHorario").value = a.horario;
    document.getElementById("aulaVeiculo").value = a.veiculoId;
    document.getElementById("aulaSituacao").value = a.situacao;
    document.getElementById("aulaObservacao").value = a.observacao;

    window.scrollTo(0, 0);
}

function limparAula() {
    mostrarAulas();
}

function excluirAula(id) {
    if (!confirm("Deseja excluir esta aula?")) return;

    dados.aulas = dados.aulas.filter(a => a.id !== id);
    salvarDados();
    mostrarAulas();
}

// ==========================================
// RELATÓRIOS
// ==========================================

function gerarRelatorio() {
    const area = document.getElementById("conteudoRelatorios");
    if (!area) return;

    const opcoes = dados.alunos.map(a =>
        `<option value="${a.id}">${escapar(a.nome)}</option>`
    ).join("");

    area.innerHTML = `
        <label>Selecionar aluno</label>
        <select id="relatorioAluno" onchange="montarRelatorio()">
            <option value="">Todos os alunos</option>
            ${opcoes}
        </select>

        <button class="btn" onclick="montarRelatorio()">Gerar relatório</button>
        <button class="secundario" onclick="window.print()">Imprimir relatório A4</button>

        <div id="resultadoRelatorio"></div>
    `;

    montarRelatorio();
}

function montarRelatorio() {
    const area = document.getElementById("resultadoRelatorio");
    if (!area) return;

    const alunoId = document.getElementById("relatorioAluno")?.value || "";

    const alunos = dados.alunos.filter(a =>
        !alunoId || a.id === alunoId
    );

    area.innerHTML = alunos.map(aluno => {
        const aulas = dados.aulas
            .filter(a => a.alunoId === aluno.id)
            .sort((a, b) =>
                (a.data + a.horario).localeCompare(b.data + b.horario)
            );

        return `
            <div class="item">
                <h3>${escapar(aluno.nome)}</h3>
                <p>Categoria: ${escapar(aluno.categoria)}</p>
                <p>Contratadas: ${aluno.contratadas}</p>
                <p>Realizadas: ${aluno.contratadas - saldoAluno(aluno.id)}</p>
                <p>Saldo: ${saldoAluno(aluno.id)}</p>
                <p>Situação: ${escapar(aluno.situacao)}</p>

                <h3>Histórico de aulas</h3>

                ${aulas.length ? aulas.map((a, i) => `
                    <p>${i + 1}ª aula | ${escapar(a.data)} | ${escapar(a.horario)} | ${escapar(a.situacao)}</p>
                `).join("") : "<p>Sem aulas cadastradas.</p>"}

                <p style="margin-top:40px">
                    ______________________________________<br>
                    Assinatura do aluno
                </p>
            </div>
        `;
    }).join("") || "<p>Nenhum aluno cadastrado.</p>";
}

// ==========================================
// BACKUP
// ==========================================

function mostrarBackup() {
    const area = document.getElementById("conteudoBackup");
    if (!area) return;

    area.innerHTML = `
        <p>Faça backups regularmente para proteger seus cadastros.</p>

        <button class="btn" onclick="exportarBackup()">Baixar backup</button>

        <h3>Restaurar backup</h3>
        <input type="file" id="arquivoBackup" accept=".json,application/json">
        <button class="secundario" onclick="importarBackup()">Restaurar dados</button>
    `;
}

function exportarBackup() {
    const arquivo = new Blob(
        [JSON.stringify(dados, null, 2)],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(arquivo);
    const link = document.createElement("a");

    link.href = url;
    link.download = "backup-marcus-instrutor.json";
    link.click();

    URL.revokeObjectURL(url);
}

function importarBackup() {
    const campo = document.getElementById("arquivoBackup");
    const arquivo = campo?.files?.[0];

    if (!arquivo) {
        return alert("Selecione um arquivo de backup.");
    }

    if (!confirm("A restauração substituirá os dados atuais. Deseja continuar?")) {
        return;
    }

    const leitor = new FileReader();

    leitor.onload = () => {
        try {
            const importado = JSON.parse(leitor.result);

            if (
                !Array.isArray(importado.alunos) ||
                !Array.isArray(importado.veiculos) ||
                !Array.isArray(importado.aulas)
            ) {
                throw new Error("Formato inválido");
            }

            dados = importado;
            salvarDados();
            alert("Backup restaurado com sucesso!");
            mostrarBackup();
        } catch (erro) {
            alert("Arquivo de backup inválido. Os dados atuais foram preservados.");
            console.error(erro);
        }
    };

    leitor.readAsText(arquivo);
}

// ==========================================
// INICIALIZAÇÃO
// ==========================================

carregarDados();
atualizarPainel();

