"use strict";

/* =========================================
   CENTRAL DO INSTRUTOR
========================================= */

const STORAGE_KEY = "marcus_instrutor_novo_v1";
const STORAGE_KEY_ATUAL = (() => {
  const usuarioId = window.sessionStorage?.getItem("marcus_admin_user_id");
  return usuarioId ? `${STORAGE_KEY}:user:${usuarioId}` : null;
})();

const HORARIOS = [
  "07:00 - 07:50", "08:00 - 08:50",
  "09:00 - 09:50", "10:00 - 10:50",
  "11:00 - 11:50", "14:00 - 14:50",
  "15:00 - 15:50", "16:00 - 16:50",
  "17:00 - 17:50", "18:00 - 18:50",
  "19:00 - 19:50"
];

const estadoInicial = {
  alunos: [],
  veiculos: [],
  aulas: [],
  produtos: [],
  vendas: [],
  movimentacoes: [],
  configuracoes: {
    nome: "Central do Instrutor",
    corPrincipal: "#12345a",
    corSecundaria: "#e8edf3",
    logo: ""
  }
};

let db = carregarDados(STORAGE_KEY_ATUAL);
let alunoEditando = null;
let veiculoEditando = null;
let aulaEditando = null;
let relatorioAtual = null;
let adminSupabaseUserId = null;
let adminAlunosSupabaseAtivo = false;
let idProdutoEditando = null;
let mostrarVeiculosInativos = false;

/* =========================================
   FUNÇÕES BÁSICAS
========================================= */

function carregarDados(chave) {
  if (!chave) return structuredClone(estadoInicial);
  try {
    const dados = localStorage.getItem(chave);

    if (!dados) return structuredClone(estadoInicial);

    const recuperado = JSON.parse(dados);

    return {
      ...structuredClone(estadoInicial),
      ...recuperado,
      // Produtos antigos salvos no navegador não devem reaparecer após a limpeza.
      produtos: [],
      vendas: recuperado.vendas || [],
      movimentacoes: recuperado.movimentacoes || []
    };
  } catch (erro) {
    console.error("Erro ao carregar dados:", erro);
    return structuredClone(estadoInicial);
  }
}

function persistirDadosLocais() {
  if (!STORAGE_KEY_ATUAL) {
    console.warn("Armazenamento local não vinculado a uma conta autenticada; gravação ignorada.");
    return false;
  }
  localStorage.setItem(STORAGE_KEY_ATUAL, JSON.stringify(db));
  return true;
}

function salvarDados() {
  persistirDadosLocais();
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

function textoSemLinks(mensagem) {
  return String(mensagem ?? "").replace(/\b(?:https?:\/\/|www\.)[^\s<]+/gi, "[link ocultado]");
}

function mostrarAviso(mensagem) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const aviso = document.createElement("div");
  aviso.className = "toast";
  aviso.textContent = textoSemLinks(mensagem);
  container.appendChild(aviso);

  setTimeout(() => aviso.remove(), 3500);
}

function confirmar(mensagem) {
  return new Promise(resolve => {
    const container = document.getElementById("modalContainer");
    if (!container) {
      resolve(false);
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const dialog = document.createElement("div");
    dialog.className = "modal-box";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-describedby", "textoConfirmacao");

    const titulo = document.createElement("h2");
    titulo.id = "tituloConfirmacao";
    const texto = document.createElement("p");
    texto.id = "textoConfirmacao";
    texto.style.whiteSpace = "pre-line";
    texto.textContent = textoSemLinks(mensagem);

    const acoes = document.createElement("div");
    acoes.className = "modal-actions";
    const cancelar = document.createElement("button");
    cancelar.type = "button";
    cancelar.className = "secondary-button";
    cancelar.textContent = "Cancelar";
    const confirmarBotao = document.createElement("button");
    confirmarBotao.type = "button";
    confirmarBotao.className = "primary-button";
    confirmarBotao.style.backgroundColor = "#198754";
    confirmarBotao.style.color = "#ffffff";
    confirmarBotao.style.borderColor = "#198754";
    confirmarBotao.textContent = "Confirmar";
    acoes.append(cancelar, confirmarBotao);
    dialog.append(texto, acoes);
    overlay.append(dialog);
    container.replaceChildren(overlay);

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    let finalizado = false;
    const finalizar = resultado => {
      if (finalizado) return;
      finalizado = true;
      document.removeEventListener("keydown", aoTeclar);
      container.replaceChildren();
      document.body.style.overflow = overflowAnterior;
      resolve(resultado);
    };
    const aoTeclar = evento => {
      if (evento.key === "Escape") finalizar(false);
    };
    document.addEventListener("keydown", aoTeclar);
    cancelar.addEventListener("click", () => finalizar(false));
    confirmarBotao.addEventListener("click", () => finalizar(true));
    cancelar.focus();
  });
}

window.MarcusConfirm = confirmar;

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
  if (nome === "alunos" && adminAlunosSupabaseAtivo) {
    atualizarStatusConvitesAlunos(false);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function atualizarTela(nome) {
  switch (nome) {
    case "inicio":
      atualizarPainel();
      atualizarProximosExamesPainel();
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
    case "orcamentos":
      listarOrcamentos();
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



async function atualizarProximosExamesPainel() {
  const host = document.getElementById("proximosExames");
  if (!host) return;
  const cliente = window.getMarcusSupabase?.();
  if (!cliente || !adminSupabaseUserId) {
    host.textContent = "Não foi possível carregar os exames agendados.";
    return;
  }
  host.textContent = "Carregando exames...";
  try {
    const { data, error } = await cliente
      .from("student_practical_exams")
      .select("id,scheduled_at,students(nome,telefone)")
      .eq("owner_id", adminSupabaseUserId)
      .eq("status", "agendado")
      .order("scheduled_at", { ascending: true })
      .limit(12);
    if (error) throw error;
    const exames = data || [];
    host.classList.toggle("empty-state", exames.length === 0);
    host.innerHTML = exames.length
      ? exames.map(exame => {
          const quando = new Date(exame.scheduled_at);
          const dataHora = Number.isNaN(quando.getTime())
            ? "Data não disponível"
            : quando.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
          const telefone = String(exame.students?.telefone || "").trim();
          const numeroDiscagem = telefone.replace(/\D/g, "");
          const numeroWhatsApp = numeroDiscagem && (numeroDiscagem.length === 10 || numeroDiscagem.length === 11) ? "55" + numeroDiscagem : numeroDiscagem;
          const contato = numeroDiscagem
            ? `<a class="exame-telefone" href="tel:${escapar(numeroDiscagem)}">Telefone: ${escapar(telefone)} · Ligar</a>${numeroWhatsApp ? ` <a class="exame-whatsapp" href="https://wa.me/${escapar(numeroWhatsApp)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}`
            : `<span class="form-hint">Telefone não informado</span>`;
          return `<div class="record exame-painel-item">
            <div><strong>${escapar(exame.students?.nome || "Aluno")}</strong><p>${escapar(dataHora)}</p><p>${contato}</p><span class="form-hint">Exame prático agendado</span></div>
            <div class="exame-painel-acoes">
              <button type="button" class="primary-button" data-exame-resultado="aprovado" data-exame-id="${escapar(exame.id)}">Aprovado</button>
              <button type="button" class="secondary-button" data-exame-resultado="reprovado" data-exame-id="${escapar(exame.id)}">Reprovado</button>
              <button type="button" class="secondary-button" data-exame-cancelar="${escapar(exame.id)}">Cancelar</button>
            </div>
          </div>`;
        }).join("")
      : "Nenhum exame aguardando resultado.";
    host.querySelectorAll("[data-exame-resultado]").forEach(botao => {
      botao.addEventListener("click", async () => {
        const resultado = botao.dataset.exameResultado;
        const exameId = botao.dataset.exameId;
        const label = resultado === "aprovado" ? "APROVADO" : "REPROVADO";
        if (!(await confirmar("Confirmar resultado " + label + "? Esta ação consumirá 1 Aluguel de Veículo e não poderá ser desfeita."))) return;
        const botoes = host.querySelectorAll("[data-exame-resultado], [data-exame-cancelar]");
        botoes.forEach(b => b.disabled = true);
        try {
          const { error: rpcError } = await cliente.rpc("record_student_practical_exam_result", {
            p_exam_id: exameId,
            p_resultado: resultado
          });
          if (rpcError) throw rpcError;
          mostrarAviso("Resultado " + label.toLowerCase() + " registrado. Um aluguel foi consumido.");
          await atualizarProximosExamesPainel();
          atualizarPainel();
        } catch (erro) {
          console.error("Falha ao registrar resultado do exame:", erro);
          mostrarAviso(erro?.message || "Não foi possível registrar o resultado do exame.");
          botoes.forEach(b => b.disabled = false);
        }
      });
    });
    host.querySelectorAll("[data-exame-cancelar]").forEach(botao => {
      botao.addEventListener("click", async () => {
        const exameId = botao.dataset.exameCancelar;
        if (!(await confirmar("Cancelar este exame por não comparecimento do aluno? O exame ficará registrado como cancelado e nenhum aluguel será consumido."))) return;
        const botoes = host.querySelectorAll("[data-exame-resultado], [data-exame-cancelar]");
        botoes.forEach(b => b.disabled = true);
        try {
          const { error: rpcError } = await cliente.rpc("cancel_student_practical_exam", {
            p_exam_id: exameId
          });
          if (rpcError) throw rpcError;
          mostrarAviso("Exame cancelado. Nenhum aluguel foi consumido.");
          await atualizarProximosExamesPainel();
          atualizarPainel();
        } catch (erro) {
          console.error("Falha ao cancelar exame:", erro);
          mostrarAviso(erro?.message || "Não foi possível cancelar o exame.");
          botoes.forEach(b => b.disabled = false);
        }
      });
    });
  } catch (erro) {
    console.error("Erro ao carregar próximos exames:", erro);
    host.textContent = "Não foi possível carregar os exames agendados.";
  }
}

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
      ? aulas.map(a => {
          const aluno = db.alunos.find(item => String(item.id) === String(a.alunoId));
          const telefoneAluno = String(aluno?.telefone || "").replace(/\D/g, "");
          const whatsappAluno = telefoneAluno && (telefoneAluno.length === 10 || telefoneAluno.length === 11) ? "55" + telefoneAluno : telefoneAluno;
          return `
          <div class="record">
            <strong>${escapar(nomeAluno(a.alunoId))}</strong>
            <p>${formatarData(a.data)} • ${escapar(a.horario)}</p>
            ${whatsappAluno ? `<p><a class="exame-whatsapp" href="https://wa.me/${escapar(whatsappAluno)}" target="_blank" rel="noopener noreferrer">WhatsApp do aluno</a></p>` : '<p class="form-hint">WhatsApp não disponível: telefone não informado.</p>'}
            <div class="record-actions">
              <button
                type="button"
                data-realizar-aula="${a.id}"
                class="primary-button confirm-lesson-button"
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
        `}).join("")
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




async function alterarStatusAulaPainel(id, novoStatus) {
 const aula=db.aulas.find(a=>String(a.id)===String(id)); if(!aula||aula.status!=="Agendada")return;
 if(!adminAlunosSupabaseAtivo||!adminSupabaseUserId){mostrarAviso("Não foi possível conectar ao Supabase. A situação da aula não foi alterada.");return;}
 if(novoStatus==="Cancelada"){if(!(await confirmar("Deseja realmente cancelar esta aula?")))return;} else if(novoStatus!=="Realizada")return;
 const cliente=window.getMarcusSupabase?.();if(!cliente){mostrarAviso("Conexão com o Supabase indisponível. Tente novamente.");return;}
 try{const {error}=await cliente.from("lessons").update({status:statusAulaParaBanco(novoStatus)}).eq("id",aula.id).eq("owner_id",adminSupabaseUserId);if(error)throw error;
 await sincronizarAulasAdminSupabase();await sincronizarSaldoAlunoAdminSupabase(aula.alunoId);listarAlunos();listarAulas();atualizarPainel();
 mostrarAviso(novoStatus==="Realizada"?"Aula marcada como realizada. Saldo atualizado.":"Aula cancelada. Nenhuma aula foi descontada.");
 }catch(erro){console.error("Erro ao atualizar situação da aula no Supabase:",erro);mostrarAviso(String(erro?.message||"").includes("SALDO_AULAS_INSUFICIENTE")?"Este aluno não possui aulas disponíveis.":"Não foi possível atualizar a situação da aula. Tente novamente.");}
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

      <label>E-mail</label>
      <input name="email" type="email" maxlength="254" autocomplete="email" value="${escapar(aluno.email)}">

      <label>Telefone</label>
      <input name="telefone" type="tel" value="${escapar(aluno.telefone)}">

      <label>CPF</label>
      <input name="cpf" value="${escapar(aluno.cpf)}">

      <label>Endereço</label>
      <input name="endereco" value="${escapar(aluno.endereco)}">

      <label>Parceiro indicador</label>
      <select name="partner_id" id="alunoParceiro"><option value="">Sem parceiro</option></select>

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
  carregarParceirosNoFormulario(aluno.partner_id || null);
}

async function carregarParceirosNoFormulario(partnerId = null) {
  const select = document.getElementById("alunoParceiro");
  const cliente = window.getMarcusSupabase?.();
  if (!select || !cliente || !adminSupabaseUserId) return;
  select.dataset.partnerColumnAvailable = "false";
  try {
    const { data, error } = await cliente.from("partners").select("id,nome,status")
      .eq("owner_id", adminSupabaseUserId).order("nome");
    if (error) throw error;
    select.dataset.partnerColumnAvailable = "true";
    select.replaceChildren(new Option("Sem parceiro", ""));
    (data || []).forEach(partner => {
      const option = new Option(partner.nome + (partner.status === "aprovado" ? "" : " (" + partner.status + ")"), partner.id);
      select.append(option);
    });
    select.value = partnerId || "";
  } catch (error) {
    console.error("Não foi possível carregar os parceiros para o cadastro do aluno:", error);
    select.replaceChildren(new Option("Sem parceiro", ""));
    if (partnerId) select.append(new Option("Parceiro já vinculado (lista indisponível)", partnerId));
    select.value = partnerId || "";
  }
}




async function salvarAluno(evento) {
  evento.preventDefault();

  if (!adminAlunosSupabaseAtivo || !adminSupabaseUserId) {
    mostrarAviso("Não foi possível conectar ao Supabase. O aluno não foi salvo.");
    return;
  }

  const formulario = evento.currentTarget;
  const botaoSalvar = formulario.querySelector('button[type="submit"]');
  const dados = Object.fromEntries(new FormData(formulario).entries());
  const nome = String(dados.nome || "").trim();

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
    String(a.nome || "").trim().toLowerCase() === nome.toLowerCase() &&
    String(a.id) !== String(alunoEditando)
  );

  if (duplicado) {
    mostrarAviso("Já existe um aluno com esse nome.");
    return;
  }

  const cliente = window.getMarcusSupabase?.();
  if (!cliente) {
    mostrarAviso("Conexão com o Supabase indisponível. Tente novamente.");
    return;
  }

  const payload = {
    owner_id: adminSupabaseUserId,
    nome,
    email: String(dados.email || "").trim().toLowerCase() || null,
    telefone: dados.telefone?.trim() || null,
    cpf: dados.cpf?.trim() || null,
    endereco: dados.endereco?.trim() || null,
    categoria: dados.categoria || "B",
    status: ({
      "Em aberto": "em_aberto",
      "Finalizado": "finalizado",
      "Aprovado": "aprovado"
    })[dados.situacao] || "em_aberto",
    aulas_compradas: Number(alunoAnterior?.contratadas || 0),
    aulas_restantes: Number(alunoAnterior?.saldo || 0)
  };
  if (document.getElementById("alunoParceiro")?.dataset.partnerColumnAvailable === "true") {
    payload.partner_id = String(dados.partner_id || "").trim() || null;
  }

  if (botaoSalvar) {
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando...";
  }

  try {
    let resposta;
    if (alunoAnterior) {
      resposta = await cliente
        .from("students")
        .update(payload)
        .eq("id", alunoAnterior.id)
        .eq("owner_id", adminSupabaseUserId)
        .select("*")
        .single();
    } else {
      const { owner_id, ...novosDados } = payload;
      resposta = await cliente
        .from("students")
        .insert({ ...novosDados, owner_id })
        .select("*")
        .single();
    }

    if (resposta.error) throw resposta.error;

    const salvo = resposta.data;
    const aluno = {
      id: salvo.id,
      nome: salvo.nome || "",
      email: salvo.email || "",
      telefone: salvo.telefone || "",
      cpf: salvo.cpf || "",
      endereco: salvo.endereco || "",
      partner_id: salvo.partner_id || null,
      categoria: salvo.categoria || "B",
      situacao: statusAlunoParaTela(salvo.status),
      contratadas: Number(salvo.aulas_compradas || 0),
      saldo: Number(salvo.aulas_restantes || 0),
      alugueisComprados: Number(alunoAnterior?.alugueisComprados || 0),
      alugueisDisponiveis: Number(alunoAnterior?.alugueisDisponiveis || 0)
    };

    if (alunoAnterior) {
      const indice = db.alunos.findIndex(a => String(a.id) === String(alunoAnterior.id));
      if (indice >= 0) db.alunos[indice] = aluno;
    } else {
      db.alunos.push(aluno);
    }

    persistirDadosLocais();
    alunoEditando = null;
    fecharModal();
    listarAlunos();
    atualizarSeletoresAlunos();
    atualizarPainel();
    mostrarAviso("Aluno salvo no Supabase com sucesso!");
  } catch (erro) {
    console.error("Erro ao salvar aluno no Supabase:", erro);
    mostrarAviso("Não foi possível salvar o aluno na nuvem. Nenhuma alteração local foi aplicada.");
  } finally {
    if (botaoSalvar) {
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = "Salvar aluno";
    }
  }
}



async function atualizarStatusConvitesAlunos(mostrarMensagem = true) {
  const cliente = window.getMarcusSupabase?.();
  if (!cliente || !adminSupabaseUserId || !adminAlunosSupabaseAtivo) return;
  const botao = document.getElementById("btnAtualizarConvites");
  if (botao) {
    botao.disabled = true;
    botao.textContent = "Atualizando...";
  }
  try {
    const { data, error } = await cliente.from("students")
      .select("id,user_id,invited_at")
      .eq("owner_id", adminSupabaseUserId);
    if (error) throw error;
    const statusPorId = new Map((data || []).map(item => [String(item.id), item]));
    db.alunos = db.alunos.map(aluno => {
      const status = statusPorId.get(String(aluno.id));
      return status ? { ...aluno, user_id: status.user_id || null, invited_at: status.invited_at || null } : aluno;
    });
    listarAlunos();
    if (mostrarMensagem) mostrarAviso("Situação dos convites atualizada.");
  } catch (erro) {
    console.error("Erro ao atualizar situação dos convites:", erro);
    if (mostrarMensagem) mostrarAviso("Não foi possível atualizar os convites. Tente novamente.");
  } finally {
    if (botao) {
      botao.disabled = false;
      botao.textContent = "Atualizar convites";
    }
  }
}

function listarAlunos() {
  const lista = document.getElementById("listaAlunos");
  if (!lista) return;
  const busca = String(document.getElementById("buscaAlunos")?.value || "").trim().toLocaleLowerCase("pt-BR");
  const alunos = db.alunos.filter(a => String(a.nome || "").toLocaleLowerCase("pt-BR").includes(busca));
  lista.innerHTML = alunos.length
    ? alunos.map(a => `
        <button type="button" class="quote-list-name student-list-name" data-open-aluno="${escapar(a.id)}"><span>${escapar(a.nome)}</span></button>
      `).join("")
    : '<div class="empty-state">Nenhum aluno encontrado.</div>';
}

function abrirDetalhesAluno(id) {
  const aluno = db.alunos.find(item => String(item.id) === String(id));
  if (!aluno) { mostrarAviso("Não foi possível localizar o aluno."); return; }
  const acesso = aluno.user_id ? "Conta vinculada" : aluno.invited_at ? "Convite enviado ou aguardando confirmação" : "Ainda não convidado";
  abrirModal(`
    <h2>${escapar(aluno.nome)}</h2>
    <div class="record-info">
      <p><strong>E-mail:</strong> ${escapar(aluno.email || "Não informado")}</p>
      <p><strong>Telefone:</strong> ${escapar(aluno.telefone || "Não informado")}</p>
      <p><strong>CPF:</strong> ${escapar(aluno.cpf || "Não informado")}</p>
      <p><strong>Endereço:</strong> ${escapar(aluno.endereco || "Não informado")}</p>
      <p><strong>Categoria:</strong> ${escapar(aluno.categoria || "Não informada")}</p>
      <p><strong>Situação:</strong> ${escapar(aluno.situacao || "Em aberto")}</p>
      <p><strong>Aulas contratadas:</strong> ${Number(aluno.contratadas || 0)}</p>
      <p><strong>Aulas restantes:</strong> ${Number(aluno.saldo || 0)}</p>
      <p><strong>Aluguéis disponíveis:</strong> ${Number(aluno.alugueisDisponiveis || 0)} de ${Number(aluno.alugueisComprados || 0)} comprados</p>
      <p><strong>Acesso do aluno:</strong> ${escapar(acesso)}</p>
    </div>
    <div class="record-actions">
      ${aluno.email ? `<button type="button" data-invite-aluno="${escapar(aluno.id)}">${aluno.user_id ? "Reenviar acesso" : aluno.invited_at ? "Reenviar convite" : "Enviar convite"}</button>` : ""}
      <button type="button" data-open-student-exams="${escapar(aluno.id)}">Exames</button>
      <button type="button" data-edit-aluno="${escapar(aluno.id)}">Editar</button>
      <button type="button" data-delete-aluno="${escapar(aluno.id)}">Excluir</button>
      <button type="button" class="secondary-button" data-close>Fechar</button>
    </div>
  `);
}

async function enviarConviteAluno(id, botao) {
  const aluno = db.alunos.find(item => String(item.id) === String(id));
  if (!aluno) {
    mostrarAviso("Não foi possível localizar o aluno.");
    return;
  }
  if (!aluno.email) {
    mostrarAviso("Cadastre o e-mail do aluno antes de enviar o convite.");
    return;
  }
  const reenviarAcesso = Boolean(aluno.user_id);
  const acao = reenviarAcesso ? "Reenviar link de acesso" : "Enviar convite";
  if (!await confirmar(acao + " para " + aluno.nome + " (" + aluno.email + ")?\n\nConfira se este e-mail foi informado pelo próprio aluno. O cadastro só será vinculado depois que o titular confirmar o acesso pelo link enviado.")) return;

  const textoOriginal = botao?.textContent || "Enviar convite";
  if (botao) {
    botao.disabled = true;
    botao.textContent = reenviarAcesso ? "Reenviando..." : "Enviando...";
  }
  try {
    const cliente = window.getMarcusSupabase?.();
    if (!cliente || !adminAlunosSupabaseAtivo || !adminSupabaseUserId) {
      throw new Error("Conexão administrativa com o Supabase indisponível.");
    }
    const { data, error } = await cliente.functions.invoke("admin-manage-instructors", {
      body: { action: "invite_student", student_id: aluno.id }
    });
    if (error) {
      let detalhe = "";
      try { detalhe = (await error.context.json()).error || ""; } catch (_) {}
      throw new Error(detalhe || "Não foi possível enviar o convite.");
    }
    if (!data?.ok) throw new Error(data?.error || "Não foi possível enviar o convite.");
    if (!aluno.user_id) aluno.invited_at = new Date().toISOString();
    listarAlunos();
    mostrarAviso(data.message || "Convite enviado com sucesso.");
  } catch (erro) {
    console.error("Erro ao enviar convite de aluno:", erro);
    mostrarAviso(erro.message || "Não foi possível enviar o convite.");
    if (botao) {
      botao.disabled = false;
      botao.textContent = textoOriginal;
    }
  }
}

async function excluirAluno(id) {
  if (db.aulas.some(a => String(a.alunoId) === String(id))) {
    mostrarAviso("Este aluno possui aulas vinculadas. Não é possível excluí-lo.");
    return;
  }

  if (!adminAlunosSupabaseAtivo || !adminSupabaseUserId) {
    mostrarAviso("Não foi possível conectar ao Supabase. O aluno não foi excluído.");
    return;
  }

  if (!(await confirmar("Deseja realmente excluir este aluno?"))) return;

  const cliente = window.getMarcusSupabase?.();
  if (!cliente) {
    mostrarAviso("Conexão com o Supabase indisponível. Tente novamente.");
    return;
  }

  try {
    const { error } = await cliente
      .from("students")
      .delete()
      .eq("id", id)
      .eq("owner_id", adminSupabaseUserId);

    if (error) throw error;

    db.alunos = db.alunos.filter(a => String(a.id) !== String(id));
    persistirDadosLocais();
    listarAlunos();
    atualizarSeletoresAlunos();
    atualizarPainel();
    mostrarAviso("Aluno excluído do Supabase.");
  } catch (erro) {
    console.error("Erro ao excluir aluno do Supabase:", erro);
    mostrarAviso("Não foi possível excluir. Verifique se há aulas ou vendas vinculadas.");
  }
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

      <label>Situação</label>
      <select name="ativo">
        <option value="true" ${veiculo.ativo !== false ? "selected" : ""}>Ativo</option>
        <option value="false" ${veiculo.ativo === false ? "selected" : ""}>Inativo</option>
      </select>

      <div class="modal-actions">
        <button type="button" class="secondary-button" data-close>Cancelar</button>
        <button type="submit" class="primary-button">Salvar veículo</button>
      </div>
    </form>
  `);

  document.getElementById("formVeiculo").onsubmit = salvarVeiculo;
}

async function salvarVeiculo(evento) {
  evento.preventDefault();

  if (!adminAlunosSupabaseAtivo || !adminSupabaseUserId) {
    mostrarAviso("Não foi possível conectar ao Supabase. O veículo não foi salvo.");
    return;
  }

  const formulario = evento.currentTarget;
  const botaoSalvar = formulario.querySelector('button[type="submit"]');
  const dados = Object.fromEntries(new FormData(formulario).entries());
  const placa = String(dados.placa || "").trim().toUpperCase();
  const modelo = String(dados.modelo || "").trim();

  if (!modelo || !placa) {
    mostrarAviso("Informe o modelo e a placa do veículo.");
    return;
  }

  const duplicado = db.veiculos.find(v =>
    String(v.placa || "").trim().toUpperCase() === placa &&
    String(v.id) !== String(veiculoEditando)
  );

  if (duplicado) {
    mostrarAviso("Já existe um veículo com essa placa.");
    return;
  }

  const cliente = window.getMarcusSupabase?.();
  if (!cliente) {
    mostrarAviso("Conexão com o Supabase indisponível. Tente novamente.");
    return;
  }

  const payload = {
    owner_id: adminSupabaseUserId,
    tipo: dados.tipo,
    nome: modelo,
    placa,
    categoria: dados.categoria,
    ativo: dados.ativo !== "false"
  };

  if (botaoSalvar) {
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando...";
  }

  try {
    let resposta;
    if (veiculoEditando !== null) {
      resposta = await cliente
        .from("vehicles")
        .update(payload)
        .eq("id", veiculoEditando)
        .eq("owner_id", adminSupabaseUserId)
        .select("*")
        .single();
    } else {
      resposta = await cliente
        .from("vehicles")
        .insert(payload)
        .select("*")
        .single();
    }

    if (resposta.error) throw resposta.error;

    const salvo = resposta.data;
    const veiculo = {
      id: salvo.id,
      tipo: salvo.tipo || "Carro",
      modelo: salvo.nome || "",
      placa: salvo.placa || "",
      categoria: salvo.categoria || "B",
      ativo: salvo.ativo !== false
    };

    if (veiculoEditando !== null) {
      const indice = db.veiculos.findIndex(v => String(v.id) === String(veiculoEditando));
      if (indice >= 0) db.veiculos[indice] = veiculo;
    } else {
      db.veiculos.push(veiculo);
    }

    fecharModal();
    listarVeiculos();
    atualizarSeletoresAlunos();
    mostrarAviso("Veículo salvo no Supabase com sucesso!");
    veiculoEditando = null;
  } catch (erro) {
    console.error("Erro ao salvar veículo no Supabase:", erro);
    mostrarAviso("Não foi possível salvar o veículo na nuvem.");
  } finally {
    if (botaoSalvar) {
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = "Salvar veículo";
    }
  }
}

function listarVeiculos() {
  const lista = document.getElementById("listaVeiculos");
  if (!lista) return;
  const busca = String(document.getElementById("buscaVeiculos")?.value || "").toLocaleLowerCase("pt-BR");
  const todos = db.veiculos.filter(v => mostrarVeiculosInativos || v.ativo !== false);
  const veiculos = todos.filter(v =>
    String(v.modelo || "").toLocaleLowerCase("pt-BR").includes(busca) ||
    String(v.placa || "").toLocaleLowerCase("pt-BR").includes(busca)
  );
  const alternar = document.getElementById("btnAlternarVeiculosInativos");
  if (alternar) alternar.textContent = mostrarVeiculosInativos ? "Ocultar veículos inativos" : "Mostrar veículos inativos";
  lista.innerHTML = veiculos.length
    ? veiculos.map(v => `
        <div class="record">
          <strong>${escapar(v.modelo)}</strong>
          <p>${escapar(v.tipo)} • Placa: ${escapar(v.placa)}</p>
          <p>Categoria: ${escapar(v.categoria)} · ${v.ativo === false ? "Inativo" : "Ativo"}</p>
          <div class="record-actions">
            <button type="button" data-edit-veiculo="${escapar(v.id)}">Editar</button>
            <button type="button" data-toggle-veiculo="${escapar(v.id)}">${v.ativo === false ? "Reativar" : "Inativar"}</button>
            <button type="button" data-delete-veiculo="${escapar(v.id)}">Excluir</button>
          </div>
        </div>
      `).join("")
    : '<div class="empty-state">' + (mostrarVeiculosInativos ? "Nenhum veículo encontrado." : "Nenhum veículo ativo encontrado.") + '</div>';
}

async function alterarStatusVeiculo(id) {
  const veiculo = db.veiculos.find(v => String(v.id) === String(id));
  if (!veiculo) return;
  const novoStatus = veiculo.ativo === false;
  if (!novoStatus && !(await confirmar("Inativar este veículo? Ele deixará de aparecer em novos agendamentos. As aulas já registradas serão preservadas."))) return;
  if (!adminAlunosSupabaseAtivo || !adminSupabaseUserId) {
    mostrarAviso("Não foi possível conectar ao Supabase. A situação do veículo não foi alterada.");
    return;
  }
  const cliente = window.getMarcusSupabase?.();
  if (!cliente) { mostrarAviso("Conexão com o Supabase indisponível."); return; }
  try {
    const { data, error } = await cliente.from("vehicles")
      .update({ ativo: novoStatus })
      .eq("id", id).eq("owner_id", adminSupabaseUserId)
      .select("id,ativo").single();
    if (error) throw error;
    veiculo.ativo = data.ativo !== false;
    listarVeiculos();
    atualizarSeletoresAlunos();
    mostrarAviso(novoStatus ? "Veículo reativado." : "Veículo inativado. As aulas anteriores foram preservadas.");
  } catch (erro) {
    console.error("Erro ao alterar situação do veículo:", erro);
    mostrarAviso("Não foi possível alterar a situação do veículo. Tente novamente.");
  }
}

async function excluirVeiculo(id) {
  if (db.aulas.some(a => String(a.veiculoId) === String(id))) {
    mostrarAviso("Este veículo possui aulas vinculadas.");
    return;
  }

  if (!adminAlunosSupabaseAtivo || !adminSupabaseUserId) {
    mostrarAviso("Não foi possível conectar ao Supabase. O veículo não foi excluído.");
    return;
  }

  if (!(await confirmar("Excluir este veículo?"))) return;

  const cliente = window.getMarcusSupabase?.();
  if (!cliente) {
    mostrarAviso("Conexão com o Supabase indisponível. Tente novamente.");
    return;
  }

  try {
    const { error } = await cliente
      .from("vehicles")
      .delete()
      .eq("id", id)
      .eq("owner_id", adminSupabaseUserId);

    if (error) throw error;

    db.veiculos = db.veiculos.filter(v => String(v.id) !== String(id));
    listarVeiculos();
    atualizarSeletoresAlunos();
    mostrarAviso("Veículo excluído do Supabase.");
  } catch (erro) {
    console.error("Erro ao excluir veículo no Supabase:", erro);
    mostrarAviso("Não foi possível excluir. Verifique se há aulas vinculadas.");
  }
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

  if (!db.veiculos.some(v => v.ativo !== false || String(v.id) === String(db.aulas.find(a => String(a.id) === String(id))?.veiculoId))) {
    mostrarAviso("Cadastre ou reative um veículo para agendar uma nova aula.");
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
        ${db.veiculos.filter(v => v.ativo !== false || String(v.id) === String(aula.veiculoId)).map(v => `<option value="${v.id}" ${aula.veiculoId === v.id ? "selected" : ""}>${escapar(v.modelo)} - ${escapar(v.placa)}${v.ativo === false ? " (Inativo · aula já vinculada)" : ""}</option>`).join("")}
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


async function salvarAula(evento) {
 evento.preventDefault(); if(!adminAlunosSupabaseAtivo||!adminSupabaseUserId){mostrarAviso("Não foi possível conectar ao Supabase. A aula não foi salva.");return;}
 const formulario=evento.currentTarget,botaoSalvar=formulario.querySelector('button[type="submit"]'),dados=Object.fromEntries(new FormData(formulario).entries());
 const anterior=aulaEditando!==null?db.aulas.find(a=>String(a.id)===String(aulaEditando)):null;
 if(aulaEditando!==null&&!anterior){mostrarAviso("Não foi possível localizar a aula para edição.");return;}
 const alunoNovo=db.alunos.find(a=>String(a.id)===String(dados.alunoId)),veiculoNovo=db.veiculos.find(v=>String(v.id)===String(dados.veiculoId));
 if(!alunoNovo||!veiculoNovo || (veiculoNovo.ativo === false && String(anterior?.veiculoId) !== String(veiculoNovo.id))){mostrarAviso("Selecione um aluno e um veículo ativo válido para novos agendamentos.");return;}
 const conflito=db.aulas.find(a=>String(a.id)!==String(aulaEditando)&&a.data===dados.data&&a.horario===dados.horario&&String(a.veiculoId)===String(dados.veiculoId)&&a.status!=="Cancelada"&&dados.status!=="Cancelada");
 if(conflito){mostrarAviso("Este veículo já possui uma aula neste dia e horário.");return;}
 const payload={owner_id:adminSupabaseUserId,student_id:dados.alunoId,vehicle_id:dados.veiculoId,data_aula:dados.data,horario:horarioTelaParaBanco(dados.horario),status:statusAulaParaBanco(dados.status),observacoes:String(dados.observacoes||"").trim()||null};
 const cliente=window.getMarcusSupabase?.();if(!cliente){mostrarAviso("Conexão com o Supabase indisponível. Tente novamente.");return;}
 if(botaoSalvar){botaoSalvar.disabled=true;botaoSalvar.textContent="Salvando...";}
 try{let resposta;if(anterior){resposta=await cliente.from("lessons").update(payload).eq("id",anterior.id).eq("owner_id",adminSupabaseUserId).select("*").single();}else{resposta=await cliente.from("lessons").insert(payload).select("*").single();}
 if(resposta.error)throw resposta.error;await sincronizarAulasAdminSupabase();
 for(const studentId of new Set([anterior?.alunoId,dados.alunoId].filter(Boolean)))await sincronizarSaldoAlunoAdminSupabase(studentId);
 aulaEditando=null;fecharModal();listarAulas();listarAlunos();atualizarSeletoresAlunos();atualizarPainel();mostrarAviso(anterior?"Aula atualizada no Supabase com sucesso!":"Aula agendada no Supabase com sucesso!");
 }catch(erro){console.error("Erro ao salvar aula no Supabase:",erro);mostrarAviso(String(erro?.message||"").includes("SALDO_AULAS_INSUFICIENTE")?"Este aluno não possui aulas disponíveis.":"Não foi possível salvar a aula na nuvem. Nenhuma alteração local foi aplicada.");}
 finally{if(botaoSalvar){botaoSalvar.disabled=false;botaoSalvar.textContent="Salvar aula";}}
}

/* =========================================
   AGENDAMENTO DE VÁRIAS AULAS
========================================= */

function abrirAgendamentoLote() {
  if (!db.alunos.length) {
    mostrarAviso("Cadastre um aluno primeiro.");
    return;
  }

  if (!db.veiculos.some(v => v.ativo !== false)) {
    mostrarAviso("Cadastre ou reative um veículo para agendar novas aulas.");
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
        ${db.veiculos.filter(v => v.ativo !== false).map(v => `
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


async function salvarAgendamentoLote(evento) {
 evento.preventDefault();if(!adminAlunosSupabaseAtivo||!adminSupabaseUserId){mostrarAviso("Não foi possível conectar ao Supabase. As aulas não foram agendadas.");return;}
 const formulario=evento.currentTarget,botaoSalvar=formulario.querySelector('button[type="submit"]'),dados=new FormData(formulario),alunoId=dados.get("alunoId"),veiculoId=dados.get("veiculoId"),quantidade=Math.max(1,Math.min(50,Number(document.getElementById("quantidadeAulasLote").value)||1));
 if(!db.alunos.some(a=>String(a.id)===String(alunoId))){mostrarAviso("Selecione um aluno válido.");return;}if(!db.veiculos.some(v=>String(v.id)===String(veiculoId) && v.ativo !== false)){mostrarAviso("Selecione um veículo ativo válido.");return;}
 const novasAulas=[];for(let i=0;i<quantidade;i++){const data=dados.get(`data_${i}`),horario=dados.get(`horario_${i}`);if(!data||!horario){mostrarAviso(`Preencha a data e o horário da aula ${i+1}.`);return;}
 if(db.aulas.some(a=>a.data===data&&a.horario===horario&&String(a.veiculoId)===String(veiculoId)&&a.status!=="Cancelada")){mostrarAviso(`Aula ${i+1}: este veículo já possui aula nessa data e horário.`);return;}
 if(novasAulas.some(a=>a.data_aula===data&&a.horario===horarioTelaParaBanco(horario))){mostrarAviso(`Aula ${i+1}: existe outra aula deste lote no mesmo dia e horário.`);return;}
 novasAulas.push({owner_id:adminSupabaseUserId,student_id:alunoId,vehicle_id:veiculoId,data_aula:data,horario:horarioTelaParaBanco(horario),status:"agendada",observacoes:null});}
 const cliente=window.getMarcusSupabase?.();if(!cliente){mostrarAviso("Conexão com o Supabase indisponível. Tente novamente.");return;}if(botaoSalvar){botaoSalvar.disabled=true;botaoSalvar.textContent="Salvando...";}
 try{const {error}=await cliente.from("lessons").insert(novasAulas);if(error)throw error;await sincronizarAulasAdminSupabase();fecharModal();listarAulas();listarAlunos();atualizarSeletoresAlunos();atualizarPainel();mostrarAviso(`${novasAulas.length} aulas agendadas no Supabase com sucesso!`);}
 catch(erro){console.error("Erro ao agendar lote no Supabase:",erro);mostrarAviso("Não foi possível agendar todas as aulas na nuvem. Nenhuma aula foi confirmada.");}
 finally{if(botaoSalvar){botaoSalvar.disabled=false;botaoSalvar.textContent="Salvar todas as aulas";}}
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

async function excluirAula(id) {
 const aula=db.aulas.find(a=>String(a.id)===String(id));if(!aula)return;
 if(!adminAlunosSupabaseAtivo||!adminSupabaseUserId){mostrarAviso("Não foi possível conectar ao Supabase. A aula não foi excluída.");return;}
 if(!(await confirmar("Deseja excluir esta aula?")))return;
 const cliente=window.getMarcusSupabase?.();if(!cliente){mostrarAviso("Conexão com o Supabase indisponível. Tente novamente.");return;}
 try{const {error}=await cliente.from("lessons").delete().eq("id",aula.id).eq("owner_id",adminSupabaseUserId);if(error)throw error;
 await sincronizarAulasAdminSupabase();if(aula.status==="Realizada")await sincronizarSaldoAlunoAdminSupabase(aula.alunoId);
 listarAulas();listarAlunos();atualizarPainel();mostrarAviso("Aula excluída do Supabase.");
 }catch(erro){console.error("Erro ao excluir aula do Supabase:",erro);mostrarAviso("Não foi possível excluir a aula. Tente novamente.");}
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


function normalizarDataFinanceira(data) {
  if (!data) return "";

  const texto = String(data).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return texto;
  }

  const brasileira = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (brasileira) {
    return `${brasileira[3]}-${brasileira[2]}-${brasileira[1]}`;
  }

  return "";
}

function obterPeriodoFinanceiro() {
  const tipo = document.getElementById("filtroFinanceiroTipo")?.value || "diario";
  const hoje = normalizarDataFinanceira(dataHoje());

  const campoDia = document.getElementById("dataFinanceiroDia");
  const campoMes = document.getElementById("dataFinanceiroMes");
  const campoAno = document.getElementById("dataFinanceiroAno");

  if (tipo === "mensal") {
    const mesAtual = hoje ? hoje.slice(0, 7) : "";
    const mes = campoMes?.value || mesAtual;

    return {
      tipo,
      inicio: mes ? `${mes}-01` : "",
      fim: mes ? `${mes}-31` : "",
      titulo: mes ? `Mês: ${mes.split("-").reverse().join("/")}` : "Relatório mensal"
    };
  }

  if (tipo === "anual") {
    const anoAtual = hoje ? hoje.slice(0, 4) : "";
    const ano = campoAno?.value || anoAtual;

    return {
      tipo,
      inicio: ano ? `${ano}-01-01` : "",
      fim: ano ? `${ano}-12-31` : "",
      titulo: ano ? `Ano: ${ano}` : "Relatório anual"
    };
  }

  const dia = campoDia?.value || hoje;

  return {
    tipo: "diario",
    inicio: dia,
    fim: dia,
    titulo: dia ? `Dia: ${dia.split("-").reverse().join("/")}` : "Relatório diário"
  };
}

function obterMovimentacoesFiltradas() {
  const periodo = obterPeriodoFinanceiro();

  if (!periodo.inicio || !periodo.fim) return [];

  return db.movimentacoes.filter(m => {
    const data = normalizarDataFinanceira(m.data);
    return data >= periodo.inicio && data <= periodo.fim;
  });
}

function atualizarFinanceiro() {
  const movimentos = obterMovimentacoesFiltradas();

  const entradas = movimentos
    .filter(m => m.tipo === "entrada")
    .reduce((s, m) => s + Number(m.valor || 0), 0);

  const saidas = movimentos
    .filter(m => m.tipo === "saida")
    .reduce((s, m) => s + Number(m.valor || 0), 0);

  const elEntradas = document.getElementById("totalEntradas");
  const elDespesas = document.getElementById("totalDespesas");
  const elSaldo = document.getElementById("saldoFinanceiro");

  if (elEntradas) elEntradas.textContent = moeda(entradas);
  if (elDespesas) elDespesas.textContent = moeda(saidas);
  if (elSaldo) elSaldo.textContent = moeda(entradas - saidas);
}


function abrirReciboComoPDF(dados) {
  // Recibo em documento isolado: evita que os estilos de impressão do aplicativo
  // ocultem o conteúdo e produzam uma página/PDF em branco.
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("O navegador bloqueou a abertura do recibo. Permita pop-ups e tente novamente.");
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[char]);
  const itens = (dados.itens || []).map(item => `
    <tr><td>${esc(item.descricao || "Item")}</td>
    <td class="center">${esc(item.quantidade ?? 1)}</td>
    <td class="right">${esc(item.unitario || "")}</td>
    <td class="right">${esc(item.total || "")}</td></tr>`).join("");
  const logo = dados.logo ? `<img class="logo" src="${esc(dados.logo)}" alt="Logo">` : "";
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Recibo de pagamento</title>
    <style>
      @page{size:A4;margin:16mm}
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;background:#fff;color:#17212f;font:12px Arial,Helvetica,sans-serif}
      body{width:100%;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .cabecalho{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #1e3a5f;padding-bottom:14px;margin-bottom:24px}
      h1{font-size:20px;margin:0 0 5px} h2{text-align:center;font-size:18px;margin:24px 0}
      p{margin:5px 0;line-height:1.4}.logo{max-width:105px;max-height:75px;object-fit:contain}
      table{width:100%;border-collapse:collapse;margin-top:20px}
      th,td{padding:9px 7px;border-bottom:1px solid #dce2eb;text-align:left}
      th{background:#f3f6fa}.center{text-align:center}.right{text-align:right}
      .total{text-align:right;font-size:18px;font-weight:bold;margin:22px 0}
      .assinatura{margin:65px auto 0;text-align:center;width:240px;border-top:1px solid #444;padding-top:8px}
      @media screen{body{max-width:800px;margin:24px auto;padding:24px;box-shadow:0 1px 8px #0002}}
    </style></head><body>
    <div class="cabecalho"><div><h1>${esc(dados.responsavel || "Responsável")}</h1>
    ${dados.documento ? `<p>CPF/CNPJ: ${esc(dados.documento)}</p>` : ""}
    ${dados.celular ? `<p>WhatsApp: ${esc(dados.celular)}</p>` : ""}
    ${dados.endereco ? `<p>${esc(dados.endereco)}</p>` : ""}</div>${logo}</div>
    <h2>RECIBO DE PAGAMENTO</h2>
    <p><strong>Recebemos de:</strong> ${esc(dados.aluno || "Aluno")}</p>
    <p><strong>Data da venda:</strong> ${esc(dados.data || "—")}</p>
    <p><strong>Forma de pagamento:</strong> ${esc(dados.pagamento || "Não informada")}</p>
    <p><strong>Situação:</strong> ${esc(dados.status || "CONFIRMADA")}</p>
    <table><thead><tr><th>Descrição</th><th class="center">Qtd.</th><th class="right">Valor unit.</th><th class="right">Total</th></tr></thead><tbody>${itens}</tbody></table>
    <div class="total">Total: ${esc(dados.total || "R$ 0,00")}</div>
    ${dados.desconto ? `<p><strong>Desconto aplicado:</strong> ${esc(dados.desconto)}</p>` : ""}
    ${dados.devolvido ? `<p><strong>Devoluções registradas:</strong> ${esc(dados.devolvido)}</p>` : ""}
    ${dados.observacoes ? `<p><strong>Observações:</strong> ${esc(dados.observacoes)}</p>` : ""}
    <p>Este recibo comprova o registro da venda acima. Guarde-o para seu controle.</p>
    <div class="assinatura"><strong>${esc(dados.responsavel || "Responsável")}</strong><br>Responsável</div>
    <script>window.onload=function(){var imgs=Array.from(document.images);Promise.all(imgs.map(function(i){return i.complete?Promise.resolve():new Promise(function(r){i.onload=i.onerror=r;});})).then(function(){setTimeout(function(){window.focus();window.print();},250);});};</script>
    </body></html>`;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}

async function imprimirReciboVendaAdmin(vendaId) {
  const venda = db.vendas.find(item => String(item.id) === String(vendaId));
  if (!venda) return mostrarAviso("Venda não encontrada.");
  const aluno = db.alunos.find(item => String(item.id) === String(venda.alunoId));
  const perfil = {
    nome: document.getElementById("contratanteNome")?.value?.trim() || db.configuracoes?.nome || "Responsável",
    documento: document.getElementById("contratanteDocumento")?.value?.trim() || "",
    celular: document.getElementById("contratanteCelular")?.value?.trim() || "",
    endereco: document.getElementById("contratanteEndereco")?.value?.trim() || ""
  };
  const itens = (venda.itens || []).map(item => ({
    descricao: item.nome || "Item",
    quantidade: Number(item.quantidade || 1),
    unitario: moeda(item.precoUnitario || 0),
    total: moeda(item.total || 0)
  }));
  try {
    await abrirReciboComoPDF({
      responsavel: perfil.nome, documento: perfil.documento, celular: perfil.celular, endereco: perfil.endereco,
      logo: db.configuracoes?.logo || "",
      aluno: aluno?.nome || venda.nomeAluno || "Aluno",
      data: formatarData(venda.data), pagamento: venda.formaPagamento || "Não informada",
      status: String(venda.status || "confirmada").toLowerCase() === "confirmada" ? "CONFIRMADA" : "CANCELADA",
      itens, total: moeda(venda.valorTotal || 0),
      desconto: Number(venda.desconto || 0) > 0 ? moeda(venda.desconto) : "",
      devolvido: Number(venda.valorDevolvido || 0) > 0 ? moeda(venda.valorDevolvido) : ""
    });
  } catch (error) {
    mostrarAviso(error.message || "Não foi possível gerar o PDF do recibo.");
  }
}

function listarMovimentacoes() {
  const lista = document.getElementById("listaMovimentacoes");
  if (!lista) return;

  const movimentos = obterMovimentacoesFiltradas();
  const vendasAgrupadas = new Map();
  const avulsas = [];

  movimentos.forEach(movimento => {
    if (movimento.vendaId) {
      if (!vendasAgrupadas.has(movimento.vendaId)) vendasAgrupadas.set(movimento.vendaId, []);
      vendasAgrupadas.get(movimento.vendaId).push(movimento);
    } else {
      avulsas.push(movimento);
    }
  });

  const cartoesVenda = [...vendasAgrupadas.entries()].map(([vendaId, itens]) => {
    const venda = db.vendas.find(item => String(item.id) === String(vendaId));
    const aluno = venda ? db.alunos.find(item => String(item.id) === String(venda.alunoId)) : null;
    const dataMaisRecente = itens.map(item => String(item.data || "")).sort().reverse()[0] || "";
    const totalEntrada = itens.filter(item => item.tipo === "entrada").reduce((s, item) => s + Number(item.valor || 0), 0);
    const totalDevolvido = itens.filter(item => item.tipo === "saida").reduce((s, item) => s + Number(item.valor || 0), 0);
    const linhas = [...itens].sort((a, b) => String(b.data || "").localeCompare(String(a.data || ""))).map(item => {
      const entrada = item.tipo === "entrada";
      const devolucao = !entrada && /^devolu/i.test(String(item.descricao || ""));
      return `<div class="finance-sale-line">
        <span class="finance-line-icon ${entrada ? "finance-line-in" : "finance-line-out"}">${entrada ? "↗" : "↙"}</span>
        <div class="finance-line-copy"><strong>${escapar(item.descricao || (entrada ? "Entrada da venda" : "Saída da venda"))}</strong><span>${escapar(formatarData(item.data))} · ${devolucao ? "Devolução" : entrada ? "Entrada" : "Saída"}</span></div>
        <strong class="finance-line-value ${entrada ? "finance-positive" : "finance-negative"}">${entrada ? "+" : "−"}${moeda(item.valor)}</strong>
      </div>`;
    }).join("");
    const possuiAluguel = (venda?.itens || []).some(item => item.fixedItemKey === "aluguel_veiculo");
    const acao = venda && itens.some(item => item.tipo === "entrada")
      ? `<button type="button" class="secondary-button finance-action" data-print-sale="${escapar(venda.id)}">Imprimir recibo</button>
         ${!possuiAluguel ? `<button type="button" class="secondary-button finance-action" data-delete-venda="${escapar(venda.id)}">Excluir venda</button>` : ""}`
      : "";
    return {
      data: venda?.createdAt || venda?.data || dataMaisRecente,
      html: `<article class="finance-sale-card">
        <div class="finance-sale-heading">
          <div><span class="finance-kicker">VENDA</span><h4>${escapar(aluno?.nome || "Aluno não identificado")}</h4>
            <p>${venda ? escapar(formatarData(venda.data)) : "Venda vinculada"} ${venda?.formaPagamento ? "· " + escapar(venda.formaPagamento) : ""}</p></div>
          <div class="finance-sale-total"><span>Valor da venda</span><strong>${moeda(venda?.valorTotal ?? totalEntrada)}</strong></div>
        </div>
        <div class="finance-sale-lines">${linhas}</div>
        <div class="finance-sale-footer"><span>Entradas no período: <strong>${moeda(totalEntrada)}</strong></span><span>Devoluções no período: <strong>${moeda(totalDevolvido)}</strong></span>${acao}</div>
      </article>`
    };
  });

  const cartoesAvulsos = avulsas.map(item => {
    const entrada = item.tipo === "entrada";
    return {
      data: String(item.data || ""),
      html: `<article class="finance-movement-card">
        <span class="finance-line-icon ${entrada ? "finance-line-in" : "finance-line-out"}">${entrada ? "↗" : "↙"}</span>
        <div class="finance-line-copy"><strong>${escapar(item.descricao)}</strong><span>${escapar(formatarData(item.data))} · ${entrada ? "Entrada" : "Despesa"}</span></div>
        <strong class="finance-line-value ${entrada ? "finance-positive" : "finance-negative"}">${entrada ? "+" : "−"}${moeda(item.valor)}</strong>
        ${!entrada ? `<button type="button" class="secondary-button finance-action" data-delete-despesa="${escapar(item.id)}">Excluir despesa</button>` : ""}
      </article>`
    };
  });

  const cartoes = [...cartoesVenda, ...cartoesAvulsos].sort((a, b) => {
    const dataA = Date.parse(a.data) || Date.parse(String(a.data || "") + "T00:00:00");
    const dataB = Date.parse(b.data) || Date.parse(String(b.data || "") + "T00:00:00");
    return dataB - dataA;
  });
  lista.innerHTML = cartoes.map(item => item.html).join("") ||
    '<div class="empty-state">Nenhuma movimentação neste período.</div>';
}




function gerarRelatorioFinanceiro() {
  const periodo = obterPeriodoFinanceiro();
  const movimentos = obterMovimentacoesFiltradas();

  const entradas = movimentos
    .filter(m => m.tipo === "entrada")
    .reduce((s, m) => s + Number(m.valor || 0), 0);

  const saidas = movimentos
    .filter(m => m.tipo === "saida")
    .reduce((s, m) => s + Number(m.valor || 0), 0);

  const linhas = movimentos.map(m => `
    <tr>
      <td>${escapar(formatarData(m.data))}</td>
      <td>${escapar(m.descricao)}</td>
      <td>${m.tipo === "entrada" ? "Entrada" : "Saída"}</td>
      <td>${moeda(m.valor)}</td>
    </tr>
  `).join("");

  mostrarRelatorio(`
    <h2>Relatório Financeiro</h2>
    <p><strong>${escapar(periodo.titulo)}</strong></p>

    <div class="report-table">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Descrição</th>
            <th>Tipo</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
          ${linhas || '<tr><td colspan="4">Nenhuma movimentação neste período.</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="resumo-financeiro">
      <p><strong>Total de entradas:</strong> ${moeda(entradas)}</p>
      <p><strong>Total de despesas:</strong> ${moeda(saidas)}</p>
      <h3>Saldo do período: ${moeda(entradas - saidas)}</h3>
    </div>
  `);

  const resultado = document.getElementById("resultadoRelatorio");
  const cabecalho = resultado?.querySelector(".cabecalho-relatorio p");

  if (cabecalho) {
    cabecalho.textContent = "Relatório financeiro";
  }

  mostrarPagina("relatorios");

  resultado?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
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
        const tipo = "servico";

        return `
          <div class="record">
            <div class="record-info">
              <strong>${escapar(p.nome)}</strong>
              <p>Tipo: <strong>Serviço</strong></p>
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
  idProdutoEditando = id;
  const produto = db.produtos.find(p => String(p.id) === String(id)) || {};

  const tipoAtual = "servico";

  abrirModal(`
    <h2>${id ? "Editar produto" : "Cadastrar produto"}</h2>

    <form id="formProduto">
      <label>Nome do produto ou serviço</label>
      <input name="nome" required
        value="${escapar(produto.nome || "")}">

      <label>Tipo</label>
      <select name="tipo" required>
        <option value="servico" selected>Serviço</option>
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

  document.getElementById("formProduto").onsubmit = salvarProduto;
}

async function salvarProduto(evento) {
  evento.preventDefault();

  if (!adminAlunosSupabaseAtivo || !adminSupabaseUserId) {
    mostrarAviso("Não foi possível conectar ao Supabase. O produto não foi salvo.");
    return;
  }

  const formulario = evento.currentTarget;
  const botaoSalvar = formulario.querySelector('button[type="submit"]');
  const dados = Object.fromEntries(new FormData(formulario).entries());
  const nome = String(dados.nome || "").trim();
  const preco = numero(dados.preco);
  const tipo = "servico";

  if (!nome || preco <= 0) {
    mostrarAviso("Confira o nome e o valor.");
    return;
  }

  const duplicado = db.produtos.find(p =>
    String(p.nome || "").trim().toLowerCase() === nome.toLowerCase() &&
    String(p.id) !== String(idProdutoEditando)
  );

  if (duplicado) {
    mostrarAviso("Já existe um produto com esse nome.");
    return;
  }

  const cliente = window.getMarcusSupabase?.();
  if (!cliente) {
    mostrarAviso("Conexão com o Supabase indisponível. Tente novamente.");
    return;
  }

  const produtoAnterior = idProdutoEditando
    ? db.produtos.find(p => String(p.id) === String(idProdutoEditando))
    : null;

  if (idProdutoEditando && !produtoAnterior) {
    mostrarAviso("Não foi possível localizar o produto para edição.");
    return;
  }

  if (botaoSalvar) {
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando...";
  }

  try {
    const payload = { nome, preco, tipo: "servico" };

    let resposta;
    if (produtoAnterior) {
      resposta = await cliente
        .from("products")
        .update(payload)
        .eq("id", produtoAnterior.id)
        .eq("owner_id", adminSupabaseUserId)
        .select("*")
        .single();
    } else {
      resposta = await cliente
        .from("products")
        .insert({ ...payload, owner_id: adminSupabaseUserId, ativo: true })
        .select("*")
        .single();
    }

    if (resposta.error) throw resposta.error;

    const salvo = resposta.data;
    const produtoSalvo = {
      ...produtoAnterior,
      id: salvo.id,
      nome: salvo.nome || "",
      preco: Number(salvo.preco || 0),
      tipo: "servico",
      quantidadeAulas: salvo.quantidade_aulas ?? produtoAnterior?.quantidadeAulas ?? null
    };

    if (produtoAnterior) {
      const indice = db.produtos.findIndex(p => String(p.id) === String(produtoAnterior.id));
      if (indice >= 0) db.produtos[indice] = produtoSalvo;
    } else {
      db.produtos.push(produtoSalvo);
    }

    idProdutoEditando = null;
    fecharModal();
    listarProdutos();
    mostrarAviso("Produto salvo no Supabase com sucesso!");
  } catch (erro) {
    console.error("Erro ao salvar produto no Supabase:", erro);
    mostrarAviso("Não foi possível salvar o produto na nuvem. Nenhuma alteração foi aplicada.");
  } finally {
    if (botaoSalvar) {
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = "Salvar";
    }
  }
}

async function excluirProduto(id) {
  const produto = db.produtos.find(p => String(p.id) === String(id));
  if (!produto) return;

  if (!adminAlunosSupabaseAtivo || !adminSupabaseUserId) {
    mostrarAviso("Não foi possível conectar ao Supabase. O produto não foi excluído.");
    return;
  }

  const possuiVenda = db.vendas.some(venda =>
    Array.isArray(venda.itens) &&
    venda.itens.some(item => String(item.produtoId || "") === String(id))
  );

  if (possuiVenda) {
    mostrarAviso("Este produto possui vendas vinculadas e não pode ser excluído.");
    return;
  }

  if (!(await confirmar(`Excluir o produto "${produto.nome}"?`))) return;

  const cliente = window.getMarcusSupabase?.();
  if (!cliente) {
    mostrarAviso("Conexão com o Supabase indisponível. Tente novamente.");
    return;
  }

  try {
    const { error } = await cliente
      .from("products")
      .delete()
      .eq("id", id)
      .eq("owner_id", adminSupabaseUserId);

    if (error) throw error;

    db.produtos = db.produtos.filter(p => String(p.id) !== String(id));
    listarProdutos();
    mostrarAviso("Produto excluído do Supabase.");
  } catch (erro) {
    console.error("Erro ao excluir produto do Supabase:", erro);
    mostrarAviso("Não foi possível excluir o produto. Verifique se existem vendas vinculadas.");
  }
}


/* =========================================
   VENDAS
========================================= */


async function abrirVenda() {
  if (!db.alunos.length) {
    mostrarAviso("Cadastre um aluno primeiro.");
    return;
  }

  const produtosAtivos = db.produtos.filter(p => p.ativo !== false);
  const clientePrecos = window.getMarcusSupabase?.();
  const { data: fx, error: fxError } = await clientePrecos.from("app_settings").select("aluguel_veiculo_preco,cartao_moto_pista_preco,taxa_inscricao_detran_preco,taxa_legislacao_detran_preco,taxa_direcao_detran_preco,exame_medico_preco,exame_psicotecnico_preco").eq("owner_id", adminSupabaseUserId).maybeSingle();
  if (fxError) { mostrarAviso("Não foi possível carregar os preços dos itens fixos."); return; }
  const itensFixos = [
    {key:"aluguel_veiculo",nome:"Aluguel de Veículo",preco:Number(fx?.aluguel_veiculo_preco||0)},
    {key:"cartao_moto_pista",nome:"Cartão Moto Pista",preco:Number(fx?.cartao_moto_pista_preco||0)},
    {key:"taxa_inscricao_detran",nome:"Taxa de inscrição (Detran)",preco:Number(fx?.taxa_inscricao_detran_preco||0)},
    {key:"taxa_legislacao_detran",nome:"Taxa de Legislação (Detran)",preco:Number(fx?.taxa_legislacao_detran_preco||0)},
    {key:"taxa_direcao_detran",nome:"Taxa de direção (Detran)",preco:Number(fx?.taxa_direcao_detran_preco||0)},
    {key:"exame_medico",nome:"Exame médico",preco:Number(fx?.exame_medico_preco||0)},
    {key:"exame_psicotecnico",nome:"Exame psicotécnico",preco:Number(fx?.exame_psicotecnico_preco||0)}
  ].filter(x=>x.preco>0);
  if (!produtosAtivos.length && !itensFixos.length) { mostrarAviso("Cadastre produtos/serviços ou configure os preços em Produtos e Serviços."); return; }

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
        ${produtosAtivos.map(p =>
          `<option value="${p.id}">${escapar(p.nome)} — ${moeda(p.preco)}</option>`
        ).join("")}
        ${itensFixos.map(x => `<option value="fixed:${x.key}">${x.nome} — ${moeda(x.preco)}</option>`).join("")}
      </select>

      <label>Quantidade</label>
      <input id="quantidadeVenda" type="number" min="1" step="1" value="1">

      <button type="button" id="adicionarItemVenda" class="secondary-button">
        Adicionar item
      </button>

      <section class="sale-summary" aria-label="Resumo da venda">
        <div class="sale-summary-heading">
          <div><span class="sale-eyebrow">CONFERÊNCIA</span><h3>Resumo da venda</h3></div>
          <span class="sale-summary-tag">Pedido</span>
        </div>
        <div class="sale-items-section">
          <strong class="sale-section-title">Itens adicionados</strong>
          <div id="itensCarrinhoVenda" class="sale-items-list">
            <div class="sale-empty"><span class="sale-empty-icon">＋</span><span><strong>Nenhum item adicionado</strong><small>Escolha um produto ou serviço acima.</small></span></div>
          </div>
        </div>
        <div class="sale-breakdown">
          <div class="sale-breakdown-card"><span>Produtos</span><strong id="subtotalProdutosVenda">R$ 0,00</strong></div>
          <div class="sale-breakdown-card"><span>Serviços</span><strong id="subtotalServicosVenda">R$ 0,00</strong></div>
        </div>
        <div class="sale-discount-row"><span><strong>Desconto nos serviços</strong><small>Não altera o valor dos produtos</small></span><strong id="descontoAplicadoVenda">R$ 0,00</strong></div>
        <div class="sale-total-card"><span>TOTAL DA VENDA</span><strong id="totalVenda">R$ 0,00</strong></div>
        <div class="sale-lessons"><span class="sale-lessons-icon">▣</span><span><strong>Aulas que serão adicionadas</strong><small>Créditos de aulas incluídos nesta venda</small></span><b><strong id="aulasVenda">0</strong><small> aulas</small></b></div>
      </section>

      <label>Tipo de desconto</label>
      <select id="tipoDescontoVenda" name="descontoTipo">
        <option value="valor">Valor fixo (R$)</option>
        <option value="percentual">Percentual (%)</option>
      </select>

      <label id="rotuloDescontoVenda" for="valorDescontoVenda">Desconto em reais (R$)</label>
      <input id="valorDescontoVenda" name="descontoValor" type="number" min="0" step="0.01" value="0">

      <label>Forma de pagamento do pedido</label>
      <select name="formaPagamento" required>
        <option value="">Selecione</option>
        <option value="Pix">Pix</option>
        <option value="Dinheiro">Dinheiro</option>
        <option value="Cartão de débito">Cartão de débito</option>
        <option value="Cartão de crédito">Cartão de crédito</option>
        <option value="Transferência bancária">Transferência bancária</option>
        <option value="Outro">Outro</option>
      </select>

      <div class="modal-actions">
        <button type="button" class="secondary-button" data-close>Cancelar</button>
        <button type="submit" class="primary-button">Confirmar venda</button>
      </div>
    </form>
  `);

  const formulario = document.getElementById("formVenda");
  const campoProduto = document.getElementById("produtoVenda");
  const campoQuantidade = document.getElementById("quantidadeVenda");
  const campoTipoDesconto = document.getElementById("tipoDescontoVenda");
  const campoValorDesconto = document.getElementById("valorDescontoVenda");
  const rotuloDesconto = document.getElementById("rotuloDescontoVenda");

  function obterResumoDesconto(subtotalServicos, subtotalGeral) {
    const tipo = campoTipoDesconto.value;
    const informado = numero(campoValorDesconto.value);
    if (subtotalServicos <= 0) {
      return { valido: informado === 0, desconto: 0, total: subtotalGeral };
    }
    if (!Number.isFinite(informado) || informado < 0) {
      return { valido: false, desconto: 0, total: subtotalGeral };
    }
    if (tipo === "percentual") {
      if (informado >= 100) return { valido: false, desconto: 0, total: subtotalGeral };
      const desconto = Math.round(subtotalServicos * informado) / 100;
      return { valido: true, desconto, total: subtotalGeral - desconto };
    }
    if (informado >= subtotalServicos && informado > 0) {
      return { valido: false, desconto: 0, total: subtotalGeral };
    }
    const desconto = Math.round(informado * 100) / 100;
    return { valido: true, desconto, total: subtotalGeral - desconto };
  }

  function atualizarCarrinho() {
    const lista = document.getElementById("itensCarrinhoVenda");
    lista.innerHTML = itensCarrinho.length
      ? itensCarrinho.map((item, indice) => `
          <div class="sale-item-row">
            <div class="sale-item-main">
              <span class="sale-item-kind">${item.tipo === "servico" ? "SERVIÇO" : "PRODUTO"}</span>
              <strong>${escapar(item.nome)}</strong>
              <small>${item.quantidade} ${item.quantidade === 1 ? "unidade" : "unidades"} · ${moeda(item.precoUnitario)} cada${item.aulasContratadas > 0 ? ` · ${item.aulasContratadas} aulas` : ""}</small>
            </div>
            <div class="sale-item-values"><strong>${moeda(item.total)}</strong><button type="button" class="sale-remove-item" data-remover-item="${indice}" aria-label="Remover ${escapar(item.nome)}">Remover</button></div>
          </div>
        `).join("")
      : '<div class="sale-empty"><span class="sale-empty-icon">＋</span><span><strong>Nenhum item adicionado</strong><small>Escolha um produto ou serviço acima.</small></span></div>';

    const subtotalProdutos = Math.round(itensCarrinho.filter(item => item.tipo === "produto").reduce((s, item) => s + item.total, 0) * 100) / 100;
    const subtotalServicos = Math.round(itensCarrinho.filter(item => item.tipo === "servico").reduce((s, item) => s + item.total, 0) * 100) / 100;
    const subtotalGeral = Math.round((subtotalProdutos + subtotalServicos) * 100) / 100;
    const aulas = itensCarrinho.reduce((s, item) => s + item.aulasContratadas, 0);
    const temServicos = subtotalServicos > 0;
    if (!temServicos) campoValorDesconto.value = "0";
    campoTipoDesconto.disabled = !temServicos;
    campoValorDesconto.disabled = !temServicos;
    rotuloDesconto.textContent = temServicos
      ? (campoTipoDesconto.value === "percentual" ? "Desconto percentual sobre serviços (%)" : "Desconto em reais sobre serviços (R$)")
      : "Desconto indisponível: adicione um serviço";
    const resumo = obterResumoDesconto(subtotalServicos, subtotalGeral);
    document.getElementById("subtotalProdutosVenda").textContent = moeda(subtotalProdutos);
    document.getElementById("subtotalServicosVenda").textContent = moeda(subtotalServicos);
    document.getElementById("descontoAplicadoVenda").textContent =
      resumo.valido ? moeda(resumo.desconto) : "Desconto inválido";
    document.getElementById("totalVenda").textContent =
      resumo.valido ? moeda(resumo.total) : moeda(subtotalGeral);
    document.getElementById("aulasVenda").textContent = aulas;
  }

  campoTipoDesconto.onchange = () => {
    const percentual = campoTipoDesconto.value === "percentual";
    rotuloDesconto.textContent = percentual ? "Desconto percentual (%)" : "Desconto em reais (R$)";
    campoValorDesconto.step = percentual ? "0.01" : "0.01";
    campoValorDesconto.value = "0";
    atualizarCarrinho();
  };
  campoValorDesconto.oninput = atualizarCarrinho;

  document.getElementById("adicionarItemVenda").onclick = () => {
    const fixo = campoProduto.value.startsWith("fixed:") ? itensFixos.find(x => x.key === campoProduto.value.slice(6)) : null;
    const produto = produtosAtivos.find(p => p.id === campoProduto.value);
    const quantidade = numero(campoQuantidade.value);

    if ((!produto && !fixo) || !Number.isInteger(quantidade) || quantidade < 1) {
      mostrarAviso("Selecione um item e informe uma quantidade válida.");
      return;
    }

    if (fixo) { itensCarrinho.push({produtoId:null,fixedItemKey:fixo.key,nome:fixo.nome,tipo:"produto",quantidade,precoUnitario:fixo.preco,total:Math.round(fixo.preco*quantidade*100)/100,aulasContratadas:0}); campoProduto.value=""; campoQuantidade.value="1"; atualizarCarrinho(); return; }
    const tipo = produto.tipo ||
      (/pacote\s*(bronze|prata|ouro)|aula avulsa/i.test(produto.nome || "")
        ? "servico" : "produto");

    const minimo = produto.quantidadeAulasMin;
    const maximo = produto.quantidadeAulasMax;
    if ((minimo != null && quantidade < Number(minimo)) ||
        (maximo != null && quantidade > Number(maximo))) {
      mostrarAviso(`A quantidade deste pacote deve ficar entre ${minimo ?? 1} e ${maximo ?? "sem limite"} aulas.`);
      return;
    }

    const preco = Number(produto.preco);
    if (preco <= 0) {
      mostrarAviso("O item possui um valor inválido.");
      return;
    }

    const temFaixa = minimo != null || maximo != null;
    const aulasContratadas = tipo === "servico"
      ? (temFaixa ? quantidade : quantidade * Math.max(1, Number(produto.quantidadeAulas || 1)))
      : 0;

    itensCarrinho.push({
      produtoId: produto.id,
      fixedItemKey: null,
      nome: produto.nome,
      tipo,
      quantidade,
      precoUnitario: preco,
      total: Math.round(preco * quantidade * 100) / 100,
      aulasContratadas
    });

    campoProduto.value = "";
    campoQuantidade.value = "1";
    atualizarCarrinho();
  };

  document.getElementById("itensCarrinhoVenda").onclick = evento => {
    const botao = evento.target.closest("[data-remover-item]");
    if (!botao) return;
    itensCarrinho.splice(Number(botao.dataset.removerItem), 1);
    atualizarCarrinho();
  };

  formulario.onsubmit = evento => salvarVenda(evento, itensCarrinho);
}

function calcularVenda() {
  const total = document.getElementById("totalVenda");
  if (!total) return 0;
  return numero(total.textContent.replace(/[^\\d,.-]/g, "").replace(",", "."));
}

async function salvarVenda(evento, itensCarrinho) {
  evento.preventDefault();

  const formulario = evento.currentTarget;
  const alunoId = formulario.elements.alunoId.value;
  const formaPagamento = formulario.elements.formaPagamento.value;
  const descontoTipo = formulario.elements.descontoTipo.value;
  const descontoValor = numero(formulario.elements.descontoValor.value);
  const subtotalBruto = Math.round(itensCarrinho.reduce((s, item) => s + item.total, 0) * 100) / 100;
  const subtotalServicos = Math.round(itensCarrinho.filter(item => item.tipo === "servico").reduce((s, item) => s + item.total, 0) * 100) / 100;
  const botao = formulario.querySelector('button[type="submit"]');

  if (!adminAlunosSupabaseAtivo || !adminSupabaseUserId) {
    mostrarAviso("A conexão administrativa com o Supabase não está ativa.");
    return;
  }
  if (!db.alunos.some(a => a.id === alunoId) || !itensCarrinho.length || !formaPagamento) {
    mostrarAviso("Selecione o aluno, adicione itens e informe a forma de pagamento.");
    return;
  }
  if (!Number.isFinite(descontoValor) || descontoValor < 0 ||
      (descontoValor > 0 && subtotalServicos <= 0) ||
      (descontoTipo === "percentual" && descontoValor >= 100) ||
      (descontoTipo === "valor" && descontoValor >= subtotalServicos && descontoValor > 0)) {
    mostrarAviso("O desconto só pode ser aplicado aos serviços e deve ser menor que o subtotal dos serviços.");
    return;
  }

  botao.disabled = true;
  botao.textContent = "Registrando...";

  try {
    const cliente = window.getMarcusSupabase?.();
    if (!cliente) throw new Error("Conexão com o Supabase indisponível.");

    const saleId = formulario.dataset.saleId || (formulario.dataset.saleId = crypto.randomUUID());
    const { data, error } = await cliente.rpc("create_sale_with_fixed_items", {
      p_sale_id:saleId, p_student_id:alunoId, p_payment_method:formaPagamento, p_notes:null,
      p_items:itensCarrinho.map(item=>item.fixedItemKey?{fixed_item_key:item.fixedItemKey,quantidade:item.quantidade}:{product_id:item.produtoId,quantidade:item.quantidade}),
      p_discount_type:descontoTipo, p_discount_value:descontoValor
    });

    if (error) throw error;

    // A função SQL grava venda, itens, saldo do aluno e lançamento financeiro
    // em uma única transação. Uma falha posterior de atualização da tela não
    // deve ser apresentada como se a venda tivesse falhado.
    const saleTotal = Number.isFinite(Number(data?.total))
      ? Number(data.total)
      : Math.max(0, subtotalBruto - (descontoTipo === "percentual"
          ? Math.round(subtotalServicos * descontoValor) / 100
          : descontoValor));
    try {
      await carregarDadosAdminSupabase();
      listarAlunos();
      listarMovimentacoes();
      atualizarFinanceiro();
      atualizarPainel();
      fecharModal();
      const aulas = Number(data?.aulas_adicionadas || 0);
      mostrarAviso(
        aulas > 0
          ? `Venda registrada! ${aulas} aulas adicionadas ao aluno. Total recebido: ${moeda(saleTotal)}.`
          : `Venda registrada! Total recebido: ${moeda(saleTotal)}.`
      );
    } catch (refreshError) {
      console.error("Venda confirmada no banco, mas a atualização da tela falhou:", refreshError);
      fecharModal();
      mostrarAviso(`Venda registrada no Supabase por ${moeda(saleTotal)}. A tela não conseguiu atualizar; recarregue o aplicativo para conferir o saldo.`);
    }
  } catch (erro) {
    console.error("Falha ao registrar venda no Supabase:", erro);
    mostrarAviso(erro.message || "Não foi possível registrar a venda.");
    botao.disabled = false;
    botao.textContent = "Confirmar venda";
  }
}


/* =========================================
   ORÇAMENTOS — MÓDULO INDEPENDENTE
========================================= */
let orcamentosCache=[];
function renderizarListaOrcamentos(){
 const host=document.getElementById("listaOrcamentos");if(!host)return;
 const termo=String(document.getElementById("buscaOrcamentos")?.value||"").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");
 const filtrados=orcamentosCache.filter(q=>String(q.client_name||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").includes(termo));
 host.classList.toggle("empty-state",!filtrados.length);
 host.innerHTML=filtrados.length?filtrados.map(q=>'<button type="button" class="quote-list-name" data-open-quote="'+q.id+'"><span>'+escapar(q.client_name)+'</span></button>').join(""):'<div class="empty-state">'+(orcamentosCache.length?'Nenhum orçamento encontrado.':'Nenhum orçamento salvo.')+'</div>';
}
async function listarOrcamentos(){
 const host=document.getElementById("listaOrcamentos");if(!host)return;
 const client=window.getMarcusSupabase?.();if(!client||!adminSupabaseUserId){host.textContent="Conexão indisponível.";return;}
 host.innerHTML='<div class="empty-state">Carregando orçamentos...</div>';
 try{
  const {data,error}=await client.from("sales_quotes").select("id,client_name,total,created_at,converted_sale_id").eq("owner_id",adminSupabaseUserId).order("created_at",{ascending:false});
  if(error)throw error;
  orcamentosCache=data||[];
  renderizarListaOrcamentos();
 }catch(e){console.error(e);host.innerHTML='<div class="empty-state">Não foi possível carregar os orçamentos.</div>';}
}

async function abrirOrcamento(){
 const client=window.getMarcusSupabase?.();if(!client||!adminSupabaseUserId){mostrarAviso("Conexão com a nuvem indisponível.");return;}
 const {data:fx,error:fxError}=await client.from("app_settings").select("aluguel_veiculo_preco,cartao_moto_pista_preco,taxa_inscricao_detran_preco,taxa_legislacao_detran_preco,taxa_direcao_detran_preco,exame_medico_preco,exame_psicotecnico_preco").eq("owner_id",adminSupabaseUserId).maybeSingle();
 if(fxError){mostrarAviso("Não foi possível carregar os preços dos itens fixos.");return;}
 const products=db.produtos.filter(p=>p.ativo!==false);
 const fixed=[{key:"aluguel_veiculo",nome:"Aluguel de Veículo",preco:Number(fx?.aluguel_veiculo_preco||0)},{key:"cartao_moto_pista",nome:"Cartão Moto Pista",preco:Number(fx?.cartao_moto_pista_preco||0)},{key:"taxa_inscricao_detran",nome:"Taxa de inscrição (Detran)",preco:Number(fx?.taxa_inscricao_detran_preco||0)},{key:"taxa_legislacao_detran",nome:"Taxa de Legislação (Detran)",preco:Number(fx?.taxa_legislacao_detran_preco||0)},{key:"taxa_direcao_detran",nome:"Taxa de direção (Detran)",preco:Number(fx?.taxa_direcao_detran_preco||0)},{key:"exame_medico",nome:"Exame médico",preco:Number(fx?.exame_medico_preco||0)},{key:"exame_psicotecnico",nome:"Exame psicotécnico",preco:Number(fx?.exame_psicotecnico_preco||0)}].filter(x=>x.preco>0);
 if(!products.length&&!fixed.length){mostrarAviso("Cadastre produtos/serviços ou configure os preços antes de criar um orçamento.");return;}
 const items=[];
 const productOptions=products.map(p=>'<option value="'+p.id+'">'+escapar(p.nome)+' — '+moeda(p.preco)+'</option>').join("");
 const fixedOptions=fixed.map(x=>'<option value="fixed:'+x.key+'">'+x.nome+' — '+moeda(x.preco)+'</option>').join("");
 abrirModal('<h2>Novo orçamento</h2><form id="formOrcamento"><label for="orcamentoNome">Nome do cliente</label><input id="orcamentoNome" name="clientName" required maxlength="160" placeholder="Nome da pessoa" autocomplete="off"><label for="orcamentoProduto">Produto ou serviço</label><select id="orcamentoProduto"><option value="">Selecione</option>'+productOptions+fixedOptions+'</select><label for="orcamentoQuantidade">Quantidade</label><input id="orcamentoQuantidade" type="number" min="1" step="1" value="1"><button id="orcamentoAdicionarItem" type="button" class="secondary-button">Adicionar item</button><div class="panel quote-editor-items"><h3>Itens do orçamento</h3><div id="orcamentoItens"><div class="empty-state">Nenhum item adicionado.</div></div></div><label for="orcamentoTipoDesconto">Tipo de desconto</label><select id="orcamentoTipoDesconto"><option value="valor">Valor fixo (R$)</option><option value="percentual">Percentual (%)</option></select><label for="orcamentoValorDesconto">Desconto sobre serviços</label><input id="orcamentoValorDesconto" type="number" min="0" step="0.01" value="0"><div class="sale-total-card"><span>TOTAL DO ORÇAMENTO</span><strong id="orcamentoTotal">R$ 0,00</strong></div><label for="orcamentoObservacoes">Observações (opcional)</label><textarea id="orcamentoObservacoes" rows="2" maxlength="1000"></textarea><div class="modal-actions"><button type="button" class="secondary-button" data-close>Cancelar</button><button type="submit" class="primary-button">Salvar orçamento</button></div><p id="orcamentoStatus" class="form-hint" role="status"></p></form>');
 const form=document.getElementById("formOrcamento"),productField=document.getElementById("orcamentoProduto"),qtyField=document.getElementById("orcamentoQuantidade"),discountField=document.getElementById("orcamentoValorDesconto"),discountType=document.getElementById("orcamentoTipoDesconto");
 function calc(){
  const gross=items.reduce((s,x)=>s+x.subtotal,0),services=items.filter(x=>x.tipo_item==="servico").reduce((s,x)=>s+x.subtotal,0),v=Number(discountField.value||0);let discount=0,valid=Number.isFinite(v)&&v>=0;
  if(services<=0){if(v>0)valid=false;}else if(discountType.value==="percentual"){if(v>=100)valid=false;else discount=Math.round(services*v)/100;}else if(v>=services&&v>0)valid=false;else discount=Math.round(v*100)/100;
  const total=Math.round((gross-discount)*100)/100;document.getElementById("orcamentoTotal").textContent=valid?moeda(total):"Desconto inválido";
  return {gross,discount,total,valid};
 }
 function render(){
  const host=document.getElementById("orcamentoItens");
  host.innerHTML=items.length?items.map((x,i)=>'<div class="quote-editor-row"><div><strong>'+escapar(x.descricao)+'</strong><small>'+x.quantidade+' × '+moeda(x.preco_unitario)+'</small></div><strong>'+moeda(x.subtotal)+'</strong><button type="button" class="sale-remove-item" data-quote-remove="'+i+'">Remover</button></div>').join(""):'<div class="empty-state">Nenhum item adicionado.</div>';
  calc();
 }
 document.getElementById("orcamentoAdicionarItem").onclick=()=>{
  const val=productField.value,q=Number(qtyField.value),f=val.startsWith("fixed:")?fixed.find(x=>x.key===val.slice(6)):null,p=products.find(x=>String(x.id)===val);
  if((!f&&!p)||!Number.isInteger(q)||q<1){mostrarAviso("Selecione um item e informe uma quantidade válida.");return;}
  const type=f?"produto":(p.tipo||"servico"),price=f?f.preco:Number(p.preco),min=p?.quantidadeAulasMin,max=p?.quantidadeAulasMax;
  if(!Number.isFinite(price)||price<=0){mostrarAviso("O item possui preço inválido.");return;}
  if((min!=null&&q<Number(min))||(max!=null&&q>Number(max))){mostrarAviso("A quantidade está fora dos limites deste pacote.");return;}
  const lessons=type==="servico"?(min!=null||max!=null?q:q*Math.max(1,Number(p?.quantidadeAulas||1))):0;
  items.push({product_id:f?null:p.id,fixed_item_key:f?.key||null,descricao:f?.nome||p.nome,tipo_item:type,quantidade:q,preco_unitario:price,subtotal:Math.round(price*q*100)/100,aulas_contratadas:lessons});
  productField.value="";qtyField.value="1";render();
 };
 document.getElementById("orcamentoItens").onclick=e=>{const b=e.target.closest("[data-quote-remove]");if(b){items.splice(Number(b.dataset.quoteRemove),1);render();}};
 discountField.oninput=calc;discountType.onchange=calc;
 form.onsubmit=async e=>{
  e.preventDefault();const name=form.elements.clientName.value.trim(),r=calc(),status=document.getElementById("orcamentoStatus"),btn=form.querySelector('button[type="submit"]');
  if(!name||!items.length||!r.valid||r.total<=0){mostrarAviso("Informe o nome, adicione itens e confira o desconto.");return;}
  btn.disabled=true;btn.textContent="Salvando...";
  try{
   const {error}=await client.from("sales_quotes").insert({owner_id:adminSupabaseUserId,client_name:name,items,subtotal:r.gross,discount_type:discountType.value,discount_value:Number(discountField.value||0),discount:r.discount,total:r.total,notes:document.getElementById("orcamentoObservacoes").value.trim()||null});
   if(error)throw error;fecharModal();await listarOrcamentos();mostrarAviso("Orçamento salvo. Nenhuma venda ou movimentação financeira foi criada.");
  }catch(err){console.error(err);status.textContent=err.message||"Não foi possível salvar.";btn.disabled=false;btn.textContent="Salvar orçamento";}
 };
}

async function abrirDetalhesOrcamento(id){
 const client=window.getMarcusSupabase?.();if(!client||!adminSupabaseUserId)return;
 const {data:q,error}=await client.from("sales_quotes").select("*").eq("id",id).eq("owner_id",adminSupabaseUserId).single();
 if(error||!q){mostrarAviso("Não foi possível abrir este orçamento.");return;}
 const rows=(q.items||[]).map(x=>'<div class="quote-editor-row"><div><strong>'+escapar(x.descricao)+'</strong><small>'+Number(x.quantidade)+' × '+moeda(x.preco_unitario)+'</small></div><strong>'+moeda(x.subtotal)+'</strong></div>').join("");
 abrirModal('<span class="eyebrow">ORÇAMENTO</span><h2>'+escapar(q.client_name)+'</h2><p>'+new Date(q.created_at).toLocaleDateString("pt-BR")+'</p><div class="quote-detail-items">'+rows+'</div><div class="quote-detail-totals"><div>Subtotal <strong>'+moeda(q.subtotal)+'</strong></div><div>Desconto <strong>'+moeda(q.discount)+'</strong></div><div class="quote-total-final">Total <strong>'+moeda(q.total)+'</strong></div></div>'+(q.notes?'<p><strong>Observações:</strong> '+escapar(q.notes)+'</p>':'')+(q.converted_sale_id?'<p class="form-hint">Este orçamento já foi convertido em venda.</p>':'')+'<div class="modal-actions quote-actions"><button type="button" class="secondary-button" data-close>Fechar</button><button type="button" class="secondary-button" data-print-quote="'+q.id+'">Imprimir / PDF</button>'+(q.converted_sale_id?'':'<button type="button" class="primary-button quote-convert-button" style="background:#198754;color:#fff;border-color:#198754" data-convert-quote="'+q.id+'">Converter em venda</button>')+'<button type="button" class="danger-button quote-delete-button" style="background:#fde7ef;color:#b42318;border-color:#f8c5d5" data-delete-quote="'+q.id+'">Excluir orçamento</button></div>');
}

async function excluirOrcamento(id){
 if(!(await confirmar("Deseja excluir este orçamento? Esta ação não afeta vendas nem o financeiro.")))return;
 const client=window.getMarcusSupabase?.();if(!client||!adminSupabaseUserId)return;
 const {error}=await client.from("sales_quotes").delete().eq("id",id).eq("owner_id",adminSupabaseUserId);
 if(error){mostrarAviso(error.message||"Não foi possível excluir o orçamento.");return;}
 fecharModal();await listarOrcamentos();mostrarAviso("Orçamento excluído.");
}

async function abrirConversaoOrcamento(id){
 const client=window.getMarcusSupabase?.();if(!client||!adminSupabaseUserId)return;
 const {data:q,error}=await client.from("sales_quotes").select("id,client_name,total").eq("id",id).eq("owner_id",adminSupabaseUserId).single();
 if(error||!q){mostrarAviso("Não foi possível localizar o orçamento.");return;}
 const options=db.alunos.map(a=>'<option value="'+a.id+'">'+escapar(a.nome)+'</option>').join("");
 abrirModal('<h2>Converter orçamento em venda</h2><p>Cliente: <strong>'+escapar(q.client_name)+'</strong><br>Total: <strong>'+moeda(q.total)+'</strong></p><form id="formConverterOrcamento" data-quote-id="'+q.id+'"><label for="quoteStudent">Vincular a aluno já cadastrado (opcional)</label><select id="quoteStudent" name="studentId"><option value="">Cadastrar o cliente somente ao confirmar a venda</option>'+options+'</select><label for="quotePayment">Forma de pagamento</label><select id="quotePayment" name="payment" required><option value="">Selecione</option><option>Pix</option><option>Dinheiro</option><option>Cartão de débito</option><option>Cartão de crédito</option><option>Transferência bancária</option><option>Outro</option></select><div class="modal-actions"><button type="button" class="secondary-button" data-close>Cancelar</button><button type="submit" class="primary-button">Confirmar venda e lançar no financeiro</button></div><p class="form-hint">O aluno só será cadastrado se você confirmar a venda. Se cancelar, nenhum aluno será criado.</p></form>');
 document.getElementById("formConverterOrcamento").onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button[type="submit"]');if(!form.elements.payment.value){mostrarAviso("Selecione a forma de pagamento.");return;}
  btn.disabled=true;btn.textContent="Registrando venda...";
  try{
   const {data,error}=await client.rpc("convert_sales_quote_to_sale",{p_quote_id:q.id,p_sale_id:crypto.randomUUID(),p_student_id:form.elements.studentId.value||null,p_payment_method:form.elements.payment.value});
   if(error)throw error;await carregarDadosAdminSupabase();fecharModal();await listarOrcamentos();listarAlunos();listarMovimentacoes();atualizarFinanceiro();atualizarPainel();mostrarAviso("Venda confirmada e lançada no financeiro: "+moeda(data?.total??q.total)+".");
  }catch(err){console.error(err);mostrarAviso(err.message||"Não foi possível converter o orçamento.");btn.disabled=false;btn.textContent="Confirmar venda e lançar no financeiro";}
 };
}

async function imprimirOrcamento(id){
 const win=window.open("","_blank");if(!win){mostrarAviso("Permita a abertura da janela de impressão para gerar o PDF.");return;}
 const client=window.getMarcusSupabase?.();if(!client||!adminSupabaseUserId){win.close();return;}
 const {data:q,error}=await client.from("sales_quotes").select("*").eq("id",id).eq("owner_id",adminSupabaseUserId).single();
 if(error||!q){win.close();mostrarAviso("Não foi possível preparar o PDF.");return;}
 const rows=(q.items||[]).map(x=>'<tr><td>'+escapar(x.descricao)+'</td><td>'+Number(x.quantidade)+'</td><td>'+moeda(x.preco_unitario)+'</td><td>'+moeda(x.subtotal)+'</td></tr>').join("");
 const logo=db.configuracoes?.logo||"https://central-do-instrutor.pages.dev/assets/logo-central.webp";
 const doc='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Orçamento - '+escapar(q.client_name)+'</title><style>body{font:14px Arial,sans-serif;color:#172033;margin:32px}header{display:flex;align-items:center;gap:18px;border-bottom:2px solid #12345a;padding-bottom:16px}header img{max-width:150px;max-height:70px;object-fit:contain}h1{font-size:24px;color:#12345a;margin:0}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:10px;border-bottom:1px solid #d9e0e8;text-align:left}th{background:#eef3f8}.totais{margin:24px 0 0 auto;width:260px}.totais div{display:flex;justify-content:space-between;padding:6px}.total{font-size:20px;font-weight:bold;color:#12345a;border-top:2px solid #12345a}.obs{margin-top:28px}@media print{body{margin:15mm}}</style></head><body><header><img src="'+logo+'" alt="Central do Instrutor"><div><h1>ORÇAMENTO</h1><p>Proposta para: <strong>'+escapar(q.client_name)+'</strong><br>Data: '+new Date(q.created_at).toLocaleDateString("pt-BR")+'</p></div></header><table><thead><tr><th>Descrição</th><th>Qtd.</th><th>Valor unitário</th><th>Subtotal</th></tr></thead><tbody>'+rows+'</tbody></table><div class="totais"><div><span>Subtotal</span><strong>'+moeda(q.subtotal)+'</strong></div><div><span>Desconto</span><strong>'+moeda(q.discount)+'</strong></div><div class="total"><span>Total</span><strong>'+moeda(q.total)+'</strong></div></div>'+(q.notes?'<div class="obs"><strong>Observações</strong><p>'+escapar(q.notes)+'</p></div>':'')+'<script>window.onload=function(){window.print();};</script></body></html>';
 win.document.write(doc);win.document.close();
}

/* =========================================
   DEVOLUÇÕES
========================================= */

function abrirDevolucao() {
  const vendasDisponiveis = db.vendas.map(venda => {
    const aluno = db.alunos.find(item => String(item.id) === String(venda.alunoId));
    const itens = (venda.itens || []).map(item => {
      if (!item.saleItemId) return null;
      const tipo = item.tipo === "produto" ? "produto" : "servico";
      const original = tipo === "produto" ? Number(item.quantidade || 0) : Number(item.aulasContratadas || 0);
      const devolvida = tipo === "produto" ? Number(item.quantidadeDevolvida || 0) : Number(item.aulasDevolvidas || 0);
      const saldoCompra = item.fixedItemKey === "aluguel_veiculo" ? Number(item.alugueisDisponiveisNaCompra || 0) : Infinity;
      const disponiveis = Math.min(Math.max(0, original - devolvida), saldoCompra);
      if (disponiveis <= 0) return null;
      const liquido = Number(item.valorLiquido ?? item.total ?? 0);
      const unitario = tipo === "produto" ? (original > 0 ? liquido / original : 0) : Number(item.valorPorAula || 0);
      return { valor: tipo + ":" + item.saleItemId, tipo, item, disponiveis, unitario, unidade: item.fixedItemKey === "aluguel_veiculo" ? "aluguel(is)" : tipo === "produto" ? "unidade(s)" : "aula(s)" };
    }).filter(Boolean);
    return { venda, aluno, itens };
  }).filter(g => g.itens.length && g.venda.status !== "cancelada");
  if (!vendasDisponiveis.length) { mostrarAviso("Não existem vendas com itens disponíveis para devolução."); return; }

  abrirModal(`
    <h2>Devolução por venda</h2>
    <p class="refund-modal-intro">Selecione a venda e informe a quantidade de cada item que deseja devolver.</p>
    <form id="formDevolucao">
      <label for="buscaVendaDevolucao">Pesquisar venda</label>
      <input id="buscaVendaDevolucao" type="search" placeholder="Buscar por cliente, data ou pagamento">
      <label for="devolucaoVenda">Vendas disponíveis</label>
      <select name="vendaId" id="devolucaoVenda" required>
        <option value="">Selecione uma venda</option>
        ${vendasDisponiveis.map(g => `<option value="${escapar(g.venda.id)}">${escapar(g.aluno?.nome || "Cliente")} · ${escapar(formatarData(g.venda.data))} · ${moeda(g.venda.valorTotal)}</option>`).join("")}
      </select>
      <div id="devolucaoResumoVenda" class="refund-sale-summary">Selecione uma venda para visualizar os itens.</div>
      <div id="devolucaoItensQuantidade" class="refund-item-quantity-list"><p>Os itens e quantidades aparecerão aqui.</p></div>
      <div id="devolucaoPrevia" class="refund-preview"><strong>Resumo da devolução</strong><p>Selecione uma venda e informe as quantidades.</p></div>
      <div class="modal-actions">
        <button type="button" class="secondary-button" data-close>Cancelar</button>
        <button type="submit" class="primary-button">Confirmar devolução</button>
      </div>
    </form>
  `);

  const form = document.getElementById("formDevolucao");
  const select = form.elements.vendaId;
  const search = document.getElementById("buscaVendaDevolucao");
  const resumo = document.getElementById("devolucaoResumoVenda");
  const lista = document.getElementById("devolucaoItensQuantidade");
  const previa = document.getElementById("devolucaoPrevia");
  let grupoAtual = null;

  search.addEventListener("input", () => {
    const term = search.value.trim().toLocaleLowerCase("pt-BR");
    [...select.options].forEach((o,i) => { if(i) o.hidden = !!term && !o.textContent.toLocaleLowerCase("pt-BR").includes(term); });
    if (select.selectedOptions[0]?.hidden) { select.value=""; select.dispatchEvent(new Event("change")); }
  });

  const atualizar = () => {
    const rows = [...lista.querySelectorAll("[data-refund-item]")];
    const escolhidos = rows.map(row => {
      const input = row.querySelector("[data-refund-qty]");
      const qty = Number(input.value);
      const max = Number(input.max);
      return { id: row.dataset.refundItem, tipo: row.dataset.tipo, qty, max, unit: Number(row.dataset.unit), remainingValue: Number(row.dataset.remainingValue), label: row.dataset.label };
    }).filter(x => x.qty > 0);
    const invalid = rows.some(row => {
      const input=row.querySelector("[data-refund-qty]");
      return input.value !== "" && (!Number.isInteger(Number(input.value)) || Number(input.value)<0 || Number(input.value)>Number(input.max));
    });
    const total = escolhidos.reduce((sum,x)=>sum+Math.min(x.unit*x.qty,x.remainingValue),0);
    previa.innerHTML = invalid ? "<strong>Confira as quantidades</strong><p>Use números inteiros dentro do saldo disponível de cada item.</p>" :
      escolhidos.length ? "<strong>Resumo da devolução</strong><p>Itens selecionados: <strong>"+escolhidos.length+"</strong></p><p class=\"refund-preview-total\">Estorno estimado: <strong>"+moeda(total)+"</strong></p>" :
      "<strong>Resumo da devolução</strong><p>Informe a quantidade de pelo menos um item.</p>";
    return {escolhidos,invalid};
  };

  select.addEventListener("change", () => {
    grupoAtual = vendasDisponiveis.find(g=>String(g.venda.id)===select.value) || null;
    if (!grupoAtual) {
      resumo.textContent="Selecione uma venda para visualizar os itens.";
      lista.innerHTML="<p>Os itens e quantidades aparecerão aqui.</p>";
      atualizar(); return;
    }
    resumo.innerHTML = "<strong>"+escapar(grupoAtual.aluno?.nome || "Cliente")+"</strong><span>Data: "+escapar(formatarData(grupoAtual.venda.data))+" · Responsável: "+escapar(grupoAtual.venda.nomeResponsavel || grupoAtual.venda.responsavelNome || "Conta responsável")+"</span><span>Pagamento: "+escapar(grupoAtual.venda.formaPagamento || "Não informado")+" · Valor total: "+moeda(grupoAtual.venda.valorTotal)+"</span>";
    lista.innerHTML = grupoAtual.itens.map(o => {
      const label=String(o.item.nome || (o.tipo==="produto"?"Produto":"Serviço"));
      const remainingValue=Math.max(0,Number(o.item.valorLiquido ?? o.item.total ?? 0)-Number(o.item.valorDevolvido||0));
      return '<div class="refund-item-quantity-card" data-refund-item="'+escapar(o.item.saleItemId)+'" data-tipo="'+o.tipo+'" data-unit="'+o.unitario+'" data-remaining-value="'+remainingValue+'" data-label="'+escapar(label)+'"><div><strong>'+escapar(label)+'</strong><span>Disponível para devolver: '+o.disponiveis+' '+o.unidade+'</span></div><label>Quantidade a devolver<input type="number" data-refund-qty min="0" max="'+o.disponiveis+'" step="1" value="0" inputmode="numeric"></label></div>';
    }).join("");
    lista.querySelectorAll("[data-refund-qty]").forEach(input=>input.addEventListener("input",atualizar));
    atualizar();
  });

  form.onsubmit = salvarDevolucao;
}

async function salvarDevolucao(evento) {
  evento.preventDefault();
  const form=evento.currentTarget;
  const rows=[...form.querySelectorAll("[data-refund-item]")];
  const items=rows.map(row=>({sale_item_id:row.dataset.refundItem,quantity:Number(row.querySelector("[data-refund-qty]").value),tipo:row.dataset.tipo}))
    .filter(x=>x.quantity>0);
  const botao=form.querySelector('button[type="submit"]');
  if(!form.elements.vendaId.value||!items.length||items.some(x=>!Number.isInteger(x.quantity)||x.quantity<1)){
    mostrarAviso("Selecione uma venda e informe uma quantidade válida para cada item."); return;
  }
  if(!adminAlunosSupabaseAtivo){mostrarAviso("A conexão administrativa com o Supabase não está ativa.");return;}
  botao.disabled=true;botao.textContent="Registrando...";
  try{
    const cliente=window.getMarcusSupabase?.();
    if(!cliente)throw new Error("Conexão com o Supabase indisponível.");
    const payload=items.map(({sale_item_id,quantity})=>({sale_item_id,quantity}));
    const {error}=await cliente.rpc("refund_sale_items_batch",{p_items:payload});
    if(error)throw error;
    await carregarDadosAdminSupabase();
    fecharModal();listarAlunos();listarMovimentacoes();atualizarFinanceiro();atualizarPainel();
    mostrarAviso("Devolução registrada. Todos os itens foram processados juntos e os valores atualizados.");
  }catch(erro){
    console.error("Falha ao registrar devolução:",erro);
    mostrarAviso(erro.message||"Não foi possível registrar a devolução. Nenhum item foi alterado.");
    botao.disabled=false;botao.textContent="Confirmar devolução";
  }
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

  document.getElementById("formDespesa").onsubmit = async evento => {
    evento.preventDefault();

    const formulario = evento.target;
    const botao = formulario.querySelector('button[type="submit"]');
    const dados = Object.fromEntries(new FormData(formulario).entries());
    const descricao = String(dados.descricao || "").trim();
    const valor = numero(dados.valor);

    if (valor <= 0 || !descricao) {
      mostrarAviso("Informe descrição e valor válidos.");
      return;
    }

    try {
      const cliente = window.getMarcusSupabase?.();
      if (!cliente || !adminAlunosSupabaseAtivo || !adminSupabaseUserId) {
        throw new Error("A sessão administrativa do Supabase não está disponível.");
      }

      botao.disabled = true;
      botao.textContent = "Salvando...";

      const { error } = await cliente
        .from("financial_transactions")
        .insert({
          owner_id: adminSupabaseUserId,
          student_id: null,
          sale_id: null,
          tipo: "saida",
          descricao,
          valor,
          data_movimento: dataHoje(),
          status: "confirmado"
        });

      if (error) throw error;

      await carregarDadosAdminSupabase();
      fecharModal();
      listarMovimentacoes();
      atualizarFinanceiro();
      atualizarPainel();
      mostrarAviso("Despesa registrada no Supabase.");
    } catch (erro) {
      console.error("Falha ao registrar despesa no Supabase:", erro);
      mostrarAviso(erro.message || "Não foi possível registrar a despesa.");
      botao.disabled = false;
      botao.textContent = "Registrar despesa";
    }
  };
}


async function excluirVenda(id) {
  const venda = db.vendas.find(v => v.id === id);
  if (!venda) return;
  if ((venda.itens || []).some(item => item.fixedItemKey === "aluguel_veiculo")) {
    mostrarAviso("Esta venda contém aluguéis de veículo e deve permanecer no histórico. Use a opção de devolução para ajustar o saldo.");
    return;
  }

  if (!(await confirmar("Excluir esta venda e seus lançamentos financeiros?"))) {
    return;
  }

  try {
    const cliente = window.getMarcusSupabase?.();
    if (!cliente) throw new Error("Conexão com o Supabase indisponível.");

    const { error } = await cliente.rpc("admin_delete_sale", {
      p_sale_id: id
    });
    if (error) throw error;

    await carregarDadosAdminSupabase();
    listarAlunos();
    listarMovimentacoes();
    atualizarFinanceiro();
    atualizarPainel();
    mostrarAviso("Venda excluída e saldo atualizado.");
  } catch (erro) {
    console.error("Falha ao excluir venda:", erro);
    mostrarAviso(erro.message || "Não foi possível excluir a venda.");
  }
}




async function excluirDespesa(id) {
  const movimento = db.movimentacoes.find(m =>
    m.id === id && m.tipo === "saida" && !m.vendaId
  );

  if (!movimento) return;
  if (!(await confirmar("Excluir esta despesa?"))) return;

  try {
    const cliente = window.getMarcusSupabase?.();
    if (!cliente || !adminAlunosSupabaseAtivo || !adminSupabaseUserId) {
      throw new Error("A sessão administrativa do Supabase não está disponível.");
    }

    const { error } = await cliente
      .from("financial_transactions")
      .delete()
      .eq("id", id)
      .eq("owner_id", adminSupabaseUserId)
      .eq("tipo", "saida")
      .is("sale_id", null);

    if (error) throw error;

    await carregarDadosAdminSupabase();
    listarMovimentacoes();
    atualizarFinanceiro();
    atualizarPainel();
    mostrarAviso("Despesa excluída do Supabase.");
  } catch (erro) {
    console.error("Falha ao excluir despesa do Supabase:", erro);
    mostrarAviso(erro.message || "Não foi possível excluir a despesa.");
  }
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
                ${assinatura ? '<td class="celula-assinatura"></td>' : ""}
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
    db.configuracoes.nome || "Central do Instrutor"
  );

  const logoEmpresa = db.configuracoes?.logo || "";

  let estilo = document.getElementById("estiloRelatorio");

  if (!estilo) {
    estilo = document.createElement("style");
    estilo.id = "estiloRelatorio";
    document.head.appendChild(estilo);
  }

  // ATUALIZA O CSS SEMPRE, MESMO QUE JÁ EXISTA
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
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      justify-content: flex-start !important;
      gap: 16px !important;
      text-align: left !important;
      border-bottom: 2px solid #12345a;
      padding-bottom: 12px;
      margin-bottom: 20px;
      width: 100%;
    }

    #resultadoRelatorio .logo-relatorio {
      display: block !important;
      width: auto !important;
      max-width: 110px !important;
      max-height: 85px !important;
      height: auto !important;
      object-fit: contain;
      margin: 0 !important;
      flex: 0 0 auto !important;
    }

    #resultadoRelatorio .identificacao-relatorio {
      display: block !important;
      flex: 1 1 auto !important;
      text-align: left !important;
    }

    #resultadoRelatorio .identificacao-relatorio h1 {
      color: #12345a;
      margin: 0 0 5px;
      text-align: left !important;
    }

    #resultadoRelatorio .identificacao-relatorio p {
      margin: 0;
      text-align: left !important;
    }

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

    @page relatorio {
      size: A4;
      margin: 15mm 12mm 12mm 12mm;
    }

    @media print {
      body.relatorio-impressao {
        page: relatorio !important;
        height: auto !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
      }

      body.relatorio-impressao * {
        visibility: hidden !important;
      }

      /* Mantém somente os elementos necessários para chegar ao relatório. */
      body.relatorio-impressao #app,
      body.relatorio-impressao #mainContent,
      body.relatorio-impressao #page-relatorios {
        display: block !important;
        position: static !important;
        transform: none !important;
        animation: none !important;
        break-before: auto !important;
        page-break-before: auto !important;
        break-after: auto !important;
        page-break-after: auto !important;
        width: auto !important;
        height: auto !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
      }

      body.relatorio-impressao #app > .topbar,
      body.relatorio-impressao #app > .bottom-menu,
      body.relatorio-impressao #app > #modalContainer,
      body.relatorio-impressao #app > #toastContainer,
      body.relatorio-impressao #mainContent > .page:not(#page-relatorios),
      body.relatorio-impressao #page-relatorios > :not(#resultadoRelatorio) {
        display: none !important;
      }

      body.relatorio-impressao #resultadoRelatorio,
      body.relatorio-impressao #resultadoRelatorio * {
        visibility: visible !important;
      }

      body.relatorio-impressao #resultadoRelatorio {
        display: block !important;
        position: static !important;
        box-sizing: border-box !important;
        width: 100% !important;
        height: auto !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 10mm !important;
        border: 0 !important;
        box-shadow: none !important;
        overflow: visible !important;
        transform: none !important;
        animation: none !important;
        break-before: auto !important;
        page-break-before: auto !important;
        break-after: auto !important;
        page-break-after: auto !important;
        break-inside: auto !important;
        page-break-inside: auto !important;
      }

      body.relatorio-impressao #resultadoRelatorio .acoes-relatorio {
        display: none !important;
      }

      body.relatorio-impressao #resultadoRelatorio th {
        background: #e8edf3 !important;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }

      body.relatorio-impressao #resultadoRelatorio tr {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
  `;

  resultado.innerHTML = `
    <div class="cabecalho-relatorio">
      <div class="identificacao-relatorio">
        <h1>${nomeEmpresa}</h1>
        <p>Relatório de controle de aulas</p>
      </div>
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

  if (logoEmpresa) {
    const cabecalho = resultado.querySelector(".cabecalho-relatorio");
    const identificacao = resultado.querySelector(".identificacao-relatorio");

    if (cabecalho && identificacao) {
      const imagemLogo = document.createElement("img");

      imagemLogo.className = "logo-relatorio";
      imagemLogo.alt = "Logo da empresa";
      imagemLogo.src = logoEmpresa;

      // FORÇA O ALINHAMENTO LADO A LADO
      cabecalho.style.setProperty("display", "flex", "important");
      cabecalho.style.setProperty("flex-direction", "row", "important");
      cabecalho.style.setProperty("align-items", "center", "important");
      cabecalho.style.setProperty("justify-content", "flex-start", "important");
      cabecalho.style.setProperty("text-align", "left", "important");
      cabecalho.style.setProperty("gap", "16px", "important");

      imagemLogo.style.setProperty("display", "block", "important");
      imagemLogo.style.setProperty("width", "auto", "important");
      imagemLogo.style.setProperty("max-width", "110px", "important");
      imagemLogo.style.setProperty("max-height", "85px", "important");
      imagemLogo.style.setProperty("height", "auto", "important");
      imagemLogo.style.setProperty("margin", "0", "important");
      imagemLogo.style.setProperty("flex", "0 0 auto", "important");

      identificacao.style.setProperty("display", "block", "important");
      identificacao.style.setProperty("flex", "1 1 auto", "important");
      identificacao.style.setProperty("text-align", "left", "important");

      cabecalho.insertBefore(imagemLogo, identificacao);
    }
  }

  document.getElementById("imprimirRelatorio").onclick = () => {
    document.body.classList.add("relatorio-impressao");

    const limparModoImpressao = () => {
      document.body.classList.remove("relatorio-impressao");
    };

    window.addEventListener("afterprint", limparModoImpressao, { once: true });
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

  leitor.onload = async () => {
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

      if (!(await confirmar("Restaurar o backup e substituir os dados atuais?"))) {
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
  const logo = db.configuracoes?.logo || "";
  if (logo) {
    const imagem = document.createElement("img");
    imagem.src = logo;
    imagem.alt = "Logomarca da conta";
    elemento.replaceChildren(imagem);
  } else {
    elemento.textContent = "MI";
  }
}

function atualizarPreviewLogoAdmin(url) {
  const preview = document.getElementById("logoEmpresaPreview");
  const remover = document.getElementById("btnRemoverLogoEmpresa");
  if (preview) {
    preview.src = url || "";
    preview.hidden = !url;
  }
  if (remover) remover.hidden = !url;
}

function validarArquivoLogo(arquivo) {
  const tipos = ["image/png", "image/jpeg", "image/webp"];
  if (!arquivo) return;
  if (!tipos.includes(arquivo.type)) throw new Error("Use uma imagem PNG, JPG ou WEBP.");
  if (arquivo.size > 2 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 2 MB.");
}

function caminhoLogoConta(usuarioId) {
  return String(usuarioId) + "/logo";
}

function carregarConfiguracoes() {
  const nome = document.getElementById("nomeEmpresa");
  const principal = document.getElementById("corPrincipal");
  const secundaria = document.getElementById("corSecundaria");
  const arquivo = document.getElementById("logoEmpresa");
  const remover = document.getElementById("btnRemoverLogoEmpresa");

  if (nome) nome.value = db.configuracoes.nome;
  if (principal) principal.value = db.configuracoes.corPrincipal;
  if (secundaria) secundaria.value = db.configuracoes.corSecundaria;
  if (arquivo) arquivo.value = "";
  atualizarPreviewLogoAdmin(db.configuracoes.logo || "");
  if (remover) remover.onclick = removerLogoEmpresa;
}

async function salvarConfiguracoes() {
  const cliente = window.getMarcusSupabase?.();
  if (!cliente || !adminAlunosSupabaseAtivo || !adminSupabaseUserId) {
    mostrarAviso("Não foi possível salvar: conexão administrativa com o Supabase indisponível.");
    return;
  }

  const botao = document.getElementById("btnSalvarConfiguracoes");
  const nome = document.getElementById("nomeEmpresa").value.trim() || "Central do Instrutor";
  const corPrincipal = document.getElementById("corPrincipal").value;
  const corSecundaria = document.getElementById("corSecundaria").value;
  const arquivo = document.getElementById("logoEmpresa")?.files?.[0] || null;
  if (botao) { botao.disabled = true; botao.textContent = "Salvando..."; }

  try {
    validarArquivoLogo(arquivo);
    let logoUrl = db.configuracoes.logo || null;
    if (arquivo) {
      const caminho = caminhoLogoConta(adminSupabaseUserId);
      const { error: uploadError } = await cliente.storage
        .from("instructor-logos")
        .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type, cacheControl: "0" });
      if (uploadError) throw uploadError;
      const { data: publicData } = cliente.storage.from("instructor-logos").getPublicUrl(caminho);
      logoUrl = publicData?.publicUrl ? `${publicData.publicUrl}?v=${Date.now()}` : null;
      if (!logoUrl) throw new Error("Não foi possível obter o endereço da logomarca.");
    }

    const { error } = await cliente.from("app_settings").upsert({
      owner_id: adminSupabaseUserId,
      nome_empresa: nome,
      cor_principal: corPrincipal,
      cor_secundaria: corSecundaria,
      logo_url: logoUrl
    }, { onConflict: "owner_id" });
    if (error) throw error;

    db.configuracoes.nome = nome;
    db.configuracoes.corPrincipal = corPrincipal;
    db.configuracoes.corSecundaria = corSecundaria;
    db.configuracoes.logo = logoUrl || "";
    db.configuracoes.logo_url = logoUrl || "";
    document.documentElement.style.setProperty("--primary", corPrincipal);
    document.documentElement.style.setProperty("--secondary", corSecundaria);
    const titulo = document.querySelector(".brand h1");
    if (titulo) titulo.textContent = nome;
    aplicarLogo();
    atualizarPreviewLogoAdmin(logoUrl);
    salvarDados();
    mostrarAviso("Configurações e logomarca salvas na nuvem.");
  } catch (erro) {
    console.error("Erro ao salvar configurações no Supabase:", erro);
    mostrarAviso(erro?.message || "Não foi possível salvar as configurações. Nenhuma alteração foi confirmada.");
  } finally {
    if (botao) { botao.disabled = false; botao.textContent = "Salvar configurações"; }
  }
}

async function removerLogoEmpresa() {
  const cliente = window.getMarcusSupabase?.();
  if (!cliente || !adminSupabaseUserId || !db.configuracoes.logo) return;
  if (!(await confirmar("Deseja remover a logomarca desta conta?"))) return;
  const botao = document.getElementById("btnRemoverLogoEmpresa");
  if (botao) { botao.disabled = true; botao.textContent = "Removendo..."; }
  try {
    const caminho = caminhoLogoConta(adminSupabaseUserId);
    const { error: storageError } = await cliente.storage.from("instructor-logos").remove([caminho]);
    if (storageError) throw storageError;
    const { error } = await cliente.from("app_settings")
      .update({ logo_url: null }).eq("owner_id", adminSupabaseUserId);
    if (error) throw error;
    db.configuracoes.logo = "";
    db.configuracoes.logo_url = "";
    aplicarLogo();
    atualizarPreviewLogoAdmin("");
    salvarDados();
    mostrarAviso("Logomarca removida desta conta.");
  } catch (erro) {
    console.error("Erro ao remover logomarca:", erro);
    mostrarAviso("Não foi possível remover a logomarca. Tente novamente.");
  } finally {
    if (botao) { botao.disabled = false; botao.textContent = "Remover logomarca"; }
  }
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
  const tipoContrato = evento.target.closest("[data-tipo-contrato]");

  if (tipoContrato) {
    const tipo = tipoContrato.dataset.tipoContrato;
    if (typeof window.tipoC === "function") {
      window.tipoC(tipo);
    } else {
      // Alternância de emergência: permite voltar entre as abas
      // mesmo quando o arquivo contratos.js não foi carregado.
      const cliente = document.getElementById("formContratoCliente");
      const parceiro = document.getElementById("formContratoParceiro");
      const titulo = document.getElementById("tituloTipoContrato");
      const preview = document.getElementById("contratoPreview");

      if (cliente && parceiro && titulo) {
        cliente.hidden = tipo !== "cliente";
        parceiro.hidden = tipo !== "parceiro";
        cliente.style.display = tipo === "cliente" ? "block" : "none";
        parceiro.style.display = tipo === "parceiro" ? "block" : "none";
        titulo.textContent = tipo === "cliente"
          ? "Contrato de cliente"
          : "Contrato de parceiro";

        if (preview) preview.innerHTML = "";

        document.querySelectorAll("[data-tipo-contrato]").forEach(botao => {
          const ativo = botao.dataset.tipoContrato === tipo;
          botao.classList.toggle("active", ativo);
          botao.classList.toggle("primary-button", ativo);
          botao.classList.toggle("secondary-button", !ativo);
        });
      }
    }
    return;
  }

  const pagina = evento.target.closest("[data-page]");

  if (pagina) {
    mostrarPagina(pagina.dataset.page);
    return;
  }

  if (evento.target.closest("[data-close]")) {
    fecharModal();
    return;
  }

  const convidarAluno = evento.target.closest("[data-invite-aluno]");
  if (convidarAluno) {
    enviarConviteAluno(convidarAluno.dataset.inviteAluno, convidarAluno);
    return;
  }

  const editarPrecoFixo = evento.target.closest("[data-edit-preco-fixo]");
  if (editarPrecoFixo) { abrirEditorPrecoFixo(editarPrecoFixo.dataset.editPrecoFixo); return; }

  const abrirAluno = evento.target.closest("[data-open-aluno]");
  if (abrirAluno) {
    abrirDetalhesAluno(abrirAluno.dataset.openAluno);
    return;
  }

  const abrirExamesAluno = evento.target.closest("[data-open-student-exams]");
  if (abrirExamesAluno) {
    if (window.MarcusExamsRentals?.openForStudent) window.MarcusExamsRentals.openForStudent(abrirExamesAluno.dataset.openStudentExams);
    else mostrarAviso("O módulo de exames ainda está carregando. Atualize a página e tente novamente.");
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

  const alternarVeiculoBotao = evento.target.closest("[data-toggle-veiculo]");
  if (alternarVeiculoBotao) {
    alterarStatusVeiculo(alternarVeiculoBotao.dataset.toggleVeiculo);
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

  const imprimirReciboBotao = evento.target.closest("[data-print-sale]");
  if (imprimirReciboBotao) {
    imprimirReciboVendaAdmin(imprimirReciboBotao.dataset.printSale);
    return;
  }

  const excluirVendaBotao = evento.target.closest("[data-delete-venda]");
  if (excluirVendaBotao) {
    excluirVenda(excluirVendaBotao.dataset.deleteVenda);
    return;
  }

  const abrirQuote = evento.target.closest("[data-open-quote]");
  if(abrirQuote){abrirDetalhesOrcamento(abrirQuote.dataset.openQuote);return;}
  const excluirQuote = evento.target.closest("[data-delete-quote]");
  if(excluirQuote){excluirOrcamento(excluirQuote.dataset.deleteQuote);return;}
  const converterQuote = evento.target.closest("[data-convert-quote]");
  if(converterQuote){abrirConversaoOrcamento(converterQuote.dataset.convertQuote);return;}
  const imprimirQuote = evento.target.closest("[data-print-quote]");
  if(imprimirQuote){imprimirOrcamento(imprimirQuote.dataset.printQuote);return;}

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
const botaoAtualizarConvites = document.getElementById("btnAtualizarConvites");
if (botaoAtualizarConvites) {
  botaoAtualizarConvites.onclick = () => atualizarStatusConvitesAlunos(true);
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
const botaoNovoOrcamento = document.getElementById("btnNovoOrcamento");
if(botaoNovoOrcamento) botaoNovoOrcamento.onclick=abrirOrcamento;

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
const buscaOrcamentos = document.getElementById("buscaOrcamentos");
if (buscaOrcamentos) {
  buscaOrcamentos.addEventListener("input", renderizarListaOrcamentos);
}

const botaoDevolucao = document.getElementById("btnDevolucao");
if (botaoDevolucao) {
  botaoDevolucao.onclick = abrirDevolucao;
}

function configurarFiltrosFinanceiros() {
  const tipo = document.getElementById("filtroFinanceiroTipo");
  const campoDia = document.getElementById("dataFinanceiroDia");
  const campoMes = document.getElementById("dataFinanceiroMes");
  const campoAno = document.getElementById("dataFinanceiroAno");

  const areaDia = document.getElementById("filtroFinanceiroDia");
  const areaMes = document.getElementById("filtroFinanceiroMes");
  const areaAno = document.getElementById("filtroFinanceiroAno");

  const botaoImprimir = document.getElementById("btnImprimirRelatorioFinanceiro");

  if (!tipo || !campoDia || !campoMes || !campoAno) return;

  const hoje = normalizarDataFinanceira(dataHoje());

  if (!campoDia.value) campoDia.value = hoje;
  if (!campoMes.value) campoMes.value = hoje.slice(0, 7);
  if (!campoAno.value) campoAno.value = hoje.slice(0, 4);

  function atualizarFiltros() {
    const periodo = tipo.value;

    if (areaDia) areaDia.hidden = periodo !== "diario";
    if (areaMes) areaMes.hidden = periodo !== "mensal";
    if (areaAno) areaAno.hidden = periodo !== "anual";

    atualizarFinanceiro();
    listarMovimentacoes();
  }

  tipo.addEventListener("change", atualizarFiltros);
  campoDia.addEventListener("change", atualizarFiltros);
  campoMes.addEventListener("change", atualizarFiltros);
  campoAno.addEventListener("change", atualizarFiltros);

  if (botaoImprimir) {
    botaoImprimir.onclick = gerarRelatorioFinanceiro;
  }

  atualizarFiltros();
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

const buscaAlunos = document.getElementById("buscaAlunos");
if (buscaAlunos) {
  buscaAlunos.addEventListener("input", listarAlunos);
}

const buscaVeiculos = document.getElementById("buscaVeiculos");
if (buscaVeiculos) {
  buscaVeiculos.addEventListener("input", listarVeiculos);
}
const botaoAlternarVeiculosInativos = document.getElementById("btnAlternarVeiculosInativos");
if (botaoAlternarVeiculosInativos) {
  botaoAlternarVeiculosInativos.addEventListener("click", () => {
    mostrarVeiculosInativos = !mostrarVeiculosInativos;
    listarVeiculos();
  });
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
   SUPABASE — CARREGAMENTO SEGURO DO ADMIN
   Esta etapa é somente leitura. Não migra nem
   sobrescreve dados locais automaticamente.
========================================= */

function statusAulaParaBanco(status) { return ({ "Realizada":"realizada","Cancelada":"cancelada","Agendada":"agendada" })[status] || "agendada"; }

function horarioTelaParaBanco(horario) { return String(horario || "").split(" - ")[0].trim() + ":00"; }

function aulaBancoParaTela(aula) { return { id:aula.id, alunoId:aula.student_id, data:aula.data_aula, horario:horarioBancoParaTela(aula.horario), veiculoId:aula.vehicle_id || "", status:statusAulaParaTela(aula.status), observacoes:aula.observacoes || "" }; }

async function sincronizarAulasAdminSupabase() { const cliente=window.getMarcusSupabase?.(); if(!cliente||!adminAlunosSupabaseAtivo||!adminSupabaseUserId) throw new Error("Conexão administrativa com Supabase indisponível."); const {data,error}=await cliente.from("lessons").select("*").eq("owner_id",adminSupabaseUserId).order("data_aula").order("horario"); if(error) throw error; db.aulas=(data||[]).map(aulaBancoParaTela); }

async function sincronizarSaldoAlunoAdminSupabase(studentId) { if(!studentId)return; const cliente=window.getMarcusSupabase?.(); if(!cliente||!adminSupabaseUserId)throw new Error("Conexão administrativa com Supabase indisponível."); const {data,error}=await cliente.from("students").select("id,aulas_compradas,aulas_restantes").eq("id",studentId).eq("owner_id",adminSupabaseUserId).single(); if(error)throw error; const aluno=db.alunos.find(a=>String(a.id)===String(studentId)); if(aluno){aluno.contratadas=Number(data.aulas_compradas||0);aluno.saldo=Number(data.aulas_restantes||0);} }

function statusAulaParaTela(status) {
  const valor = String(status || "").toLowerCase();
  if (valor === "realizada") return "Realizada";
  if (valor === "cancelada") return "Cancelada";
  return "Agendada";
}

function statusAlunoParaTela(status) {
  const mapa = {
    em_aberto: "Em aberto",
    finalizado: "Finalizado",
    aprovado: "Aprovado"
  };
  return mapa[String(status || "").toLowerCase()] || "Em aberto";
}

function horarioBancoParaTela(horario) {
  const inicio = String(horario || "").slice(0, 5);
  if (!inicio) return "";
  const [hora, minuto] = inicio.split(":").map(Number);
  const data = new Date(2000, 0, 1, hora || 0, minuto || 0);
  data.setMinutes(data.getMinutes() + 50);
  const fim = data.toTimeString().slice(0, 5);
  return `${inicio} - ${fim}`;
}

function existeDadoLocalOperacional() {
  return ["alunos", "veiculos", "aulas", "vendas", "movimentacoes"]
    .some(chave => Array.isArray(db[chave]) && db[chave].length > 0);
}

async function carregarDadosAdminSupabase() {
  const cliente = window.getMarcusSupabase?.();
  if (!cliente) throw new Error("Cliente Supabase não disponível.");

  const { data: sessaoData, error: erroSessao } = await cliente.auth.getSession();
  if (erroSessao) throw erroSessao;
  const usuario = sessaoData?.session?.user;
  if (!usuario?.id) throw new Error("Sessão administrativa não encontrada.");

  const { data: perfil, error: erroPerfil } = await cliente
    .from("profiles")
    .select("id, role")
    .eq("id", usuario.id)
    .maybeSingle();

  if (erroPerfil) throw erroPerfil;
  const papelEsperado = window.MARCUS_PANEL_ROLE === "instrutor" ? "instrutor" : "admin";
  if (perfil?.role !== papelEsperado) {
    throw new Error("A conta atual não possui permissão para esta área.");
  }

  const chaveEsperada = `${STORAGE_KEY}:user:${usuario.id}`;
  if (STORAGE_KEY_ATUAL !== chaveEsperada) {
    throw new Error("O armazenamento local não corresponde à conta autenticada. Atualize a página e entre novamente.");
  }

  db = carregarDados(STORAGE_KEY_ATUAL);

  const tabelas = [
    "students", "vehicles", "lessons", "products",
    "sales", "sale_items", "financial_transactions", "app_settings"
  ];

  const resultados = await Promise.all(tabelas.map(async tabela => {
    const consulta = await cliente.from(tabela).select("*").eq("owner_id", usuario.id);
    if (consulta.error) throw new Error(`Falha ao carregar ${tabela}: ${consulta.error.message}`);
    return [tabela, consulta.data || []];
  }));

  const dados = Object.fromEntries(resultados);

  // A política RLS limita a leitura aos créditos da própria conta; a tabela
  // libera somente as colunas necessárias para calcular o saldo por compra.
  const rentalCreditsResult = await cliente.from("student_rental_credits")
    .select("sale_item_id,quantity_purchased,quantity_refunded,quantity_consumed");
  const rentalCreditLedgerMissing = rentalCreditsResult.error &&
    (["42P01", "PGRST205"].includes(rentalCreditsResult.error.code) ||
     /student_rental_credits.*(schema cache|does not exist|not found)/i.test(rentalCreditsResult.error.message || ""));
  if (rentalCreditsResult.error && !rentalCreditLedgerMissing) throw rentalCreditsResult.error;
  const creditsBySaleItem = new Map((rentalCreditsResult.data || []).map(credit => [credit.sale_item_id, credit]));
  const rentalCreditAvailability = new Map((dados.sale_items || [])
    .filter(item => item.fixed_item_key === "aluguel_veiculo")
    .map(item => {
      const credit = creditsBySaleItem.get(item.id);
      const fallback = Math.max(0, Number(item.quantidade || 0) - Number(item.quantidade_devolvida || 0));
      const available = credit
        ? Math.max(0, Number(credit.quantity_purchased || 0) - Number(credit.quantity_refunded || 0) - Number(credit.quantity_consumed || 0))
        : rentalCreditLedgerMissing ? fallback : 0;
      return [item.id, available];
    }));

  const configuracoesNuvem = dados.app_settings?.[0] || null;
  db.configuracoes = {
    ...db.configuracoes,
    nome: configuracoesNuvem?.nome_empresa || db.configuracoes.nome,
    corPrincipal: configuracoesNuvem?.cor_principal || db.configuracoes.corPrincipal,
    corSecundaria: configuracoesNuvem?.cor_secundaria || db.configuracoes.corSecundaria,
    logo: configuracoesNuvem?.logo_url || "",
    logo_url: configuracoesNuvem?.logo_url || ""
  };
  aplicarLogo();

  // A partir desta etapa, a lista de alunos do painel admin tem o Supabase
  // como fonte oficial. Os registros antigos do navegador permanecem
  // preservados no localStorage, mas não são misturados com os da nuvem.
  adminSupabaseUserId = usuario.id;
  adminAlunosSupabaseAtivo = true;

  if (window.MarcusContractorProfile) {
    try {
      await window.MarcusContractorProfile.carregar(cliente, usuario.id);
      window.MarcusContractorProfile.vincular(() => cliente, () => usuario.id);
    } catch (erroCadastro) {
      console.error("Não foi possível carregar o cadastro do responsável:", erroCadastro);
      const statusCadastro = document.getElementById("statusDadosContratante");
      if (statusCadastro) statusCadastro.textContent = "Não foi possível carregar seus dados. Confira a conexão e tente novamente.";
    }
  }
  db.alunos = (dados.students || []).map(a => ({
    id: a.id,
    nome: a.nome || "",
    email: a.email || "",
    telefone: a.telefone || "",
    cpf: a.cpf || "",
    endereco: a.endereco || "",
    categoria: a.categoria || "B",
    situacao: statusAlunoParaTela(a.status),
    contratadas: Number(a.aulas_compradas || 0),
    saldo: Number(a.aulas_restantes || 0),
    alugueisComprados: Number(a.alugueis_comprados || 0),
    alugueisDisponiveis: Number(a.alugueis_disponiveis || 0),
    user_id: a.user_id || null,
    invited_at: a.invited_at || null,
    partner_id: a.partner_id || null
  }));

  const temDadosNuvem = tabelas.some(tabela => dados[tabela].length > 0);

  if (!temDadosNuvem) {
    console.info("Supabase admin: ainda não há registros operacionais nesta conta.");
    return { carregado: false, motivo: "nuvem_vazia" };
  }

  // O Supabase é a fonte oficial dos dados operacionais do painel admin.
  // Os registros antigos do navegador não são mesclados nem utilizados.
  const produtosPorId = new Map(dados.products.map(p => [p.id, p]));
  const alunos = dados.students.map(a => ({
    id: a.id,
    nome: a.nome || "",
    email: a.email || "",
    telefone: a.telefone || "",
    cpf: a.cpf || "",
    endereco: a.endereco || "",
    categoria: a.categoria || "B",
    situacao: statusAlunoParaTela(a.status),
    contratadas: Number(a.aulas_compradas || 0),
    saldo: Number(a.aulas_restantes || 0),
    alugueisComprados: Number(a.alugueis_comprados || 0),
    alugueisDisponiveis: Number(a.alugueis_disponiveis || 0),
    user_id: a.user_id || null,
    invited_at: a.invited_at || null,
    partner_id: a.partner_id || null
  }));

  const veiculos = dados.vehicles.map(v => ({
    id: v.id,
    tipo: v.tipo || "Carro",
    modelo: v.nome || "",
    placa: v.placa || "",
    categoria: v.categoria || "B",
    ativo: v.ativo !== false
  }));

  const aulas = dados.lessons.map(a => ({
    id: a.id,
    alunoId: a.student_id,
    data: a.data_aula,
    horario: horarioBancoParaTela(a.horario),
    veiculoId: a.vehicle_id || "",
    status: statusAulaParaTela(a.status),
    observacoes: a.observacoes || ""
  }));

  const produtos = dados.products.map(p => ({
    id: p.id,
    nome: p.nome || "",
    preco: Number(p.preco || 0),
    tipo: (
      p.quantidade_aulas != null ||
      p.quantidade_aulas_min != null ||
      p.quantidade_aulas_max != null ||
      ["bronze", "prata", "ouro"].includes(String(p.app_product_id || "").toLowerCase())
    ) ? "servico" : (p.tipo === "produto" ? "produto" : "servico"),
    quantidadeAulas: p.quantidade_aulas ?? null,
    descricao: p.descricao || "",
    ativo: p.ativo !== false,
    appProductId: p.app_product_id || null,
    quantidadeAulasMin: p.quantidade_aulas_min ?? null,
    quantidadeAulasMax: p.quantidade_aulas_max ?? null,
    formaCobranca: p.forma_cobranca || null,
    obrigatorioConclusao: p.obrigatorio_conclusao === true
  }));

  const vendas = dados.sales.map(v => {
    const itens = dados.sale_items.filter(item => item.sale_id === v.id).map(item => {
      const produto = produtosPorId.get(item.product_id);
      const tipo = item.tipo_item ||
        (produto?.tipo === "produto" &&
         produto?.quantidadeAulas == null &&
         produto?.quantidadeAulasMin == null &&
         produto?.quantidadeAulasMax == null &&
         !["bronze", "prata", "ouro"].includes(String(produto?.appProductId || "").toLowerCase())
          ? "produto" : "servico");
      return {
        saleItemId: item.id,
        fixedItemKey: item.fixed_item_key || null,
        produtoId: item.product_id,
        nome: item.descricao || produto?.nome || "Item",
        tipo,
        quantidade: Number(item.quantidade || 1),
        precoUnitario: Number(item.valor_unitario || 0),
        total: Number(item.subtotal || 0),
        valorLiquido: Number(item.valor_liquido ?? item.subtotal ?? 0),
        aulasContratadas: Number(item.aulas_contratadas || 0),
        aulasDevolvidas: Number(item.aulas_devolvidas || 0),
        valorPorAula: Number(item.valor_por_aula || 0),
        valorDevolvido: Number(item.valor_devolvido || 0),
        quantidadeDevolvida: Number(item.quantidade_devolvida || 0),
        alugueisDisponiveisNaCompra: Number(rentalCreditAvailability.get(item.id) || 0)
      };
    });
    const aluno = alunos.find(a => a.id === v.student_id);
    const descricao = itens.map(item => `${item.nome} (${item.quantidade})`).join(", ");
    return {
      id: v.id,
      alunoId: v.student_id,
      itens,
      pacote: descricao,
      descricao: v.observacoes || descricao,
      aulasVendidas: itens.reduce((total, item) => total + Number(item.aulasContratadas || 0), 0),
      aulasDevolvidas: itens.reduce((total, item) => total + Number(item.aulasDevolvidas || 0), 0),
      subtotalBruto: Number(v.subtotal_bruto ?? v.total ?? 0),
      descontoTipo: v.desconto_tipo || "valor",
      descontoValor: Number(v.desconto_valor || 0),
      desconto: Number(v.desconto || 0),
      valorTotal: Number(v.total || 0),
      valorDevolvido: itens.reduce((total, item) => total + Number(item.valorDevolvido || 0), 0),
      data: v.data_venda,
      createdAt: v.created_at || null,
      formaPagamento: v.forma_pagamento || "",
      status: v.status || "confirmada",
      nomeAluno: aluno?.nome || ""
    };
  });

  const movimentacoes = dados.financial_transactions.map(m => ({
    id: m.id,
    tipo: m.tipo,
    descricao: m.descricao || "",
    valor: Number(m.valor || 0),
    alunoId: m.student_id || null,
    vendaId: m.sale_id || null,
    data: m.data_movimento,
    status: m.status || "confirmado"
  }));

  const configuracao = dados.app_settings[0];
  const configuracoes = configuracao ? {
    nome: configuracao.nome_empresa || "Central do Instrutor",
    corPrincipal: configuracao.cor_principal || "#12345a",
    corSecundaria: configuracao.cor_secundaria || "#e8edf3",
    // Preserva o logo local existente enquanto o Storage não é configurado.
    logo: configuracao.logo_url || db.configuracoes?.logo || ""
  } : structuredClone(db.configuracoes || estadoInicial.configuracoes);

  db = {
    ...structuredClone(estadoInicial),
    alunos,
    veiculos,
    aulas,
    produtos,
    vendas,
    movimentacoes,
    configuracoes
  };

  console.info("Dados operacionais do administrador carregados do Supabase.");
  return { carregado: true, motivo: "sucesso" };
}

function avisarDadosLegadosNaoVinculados() {
  const chaveAviso = "marcus_legacy_storage_notice";
  if (!STORAGE_KEY_ATUAL || window.sessionStorage.getItem(chaveAviso)) return;

  const dadosBrutos = localStorage.getItem(STORAGE_KEY);
  if (!dadosBrutos) return;

  let temDadosLegados = false;
  try {
    const dadosLegados = JSON.parse(dadosBrutos);
    temDadosLegados = ["alunos", "veiculos", "aulas", "vendas", "movimentacoes"]
      .some(chave => Array.isArray(dadosLegados?.[chave]) && dadosLegados[chave].length > 0);
  } catch {
    temDadosLegados = true;
  }

  if (!temDadosLegados) return;
  window.sessionStorage.setItem(chaveAviso, "1");
  mostrarAviso("Encontramos dados locais antigos sem vínculo com uma conta. Eles foram preservados no navegador, mas não foram carregados para evitar misturar dados entre administradores. A importação precisa ser conferida separadamente.");
}

async function prepararDadosAdmin() {
  avisarDadosLegadosNaoVinculados();
  try {
    const resultado = await carregarDadosAdminSupabase();
    if (resultado.motivo === "conflito_local_nuvem") {
      mostrarAviso("Há dados locais e na nuvem. Mantivemos os dados locais desta conta para evitar mistura. A migração será feita com conferência.");
    }
  } catch (erro) {
    console.error("Não foi possível carregar os dados administrativos do Supabase:", erro);
    mostrarAviso("Não foi possível consultar a nuvem. Os dados locais vinculados a esta conta foram mantidos.");
  }
}

/* =========================================
   INICIALIZAÇÃO
========================================= */

const CONFIG_PRODUTOS_FIXOS = {
  aluguel_veiculo: {nome:"Aluguel de Veículo", coluna:"aluguel_veiculo_preco"},
  cartao_moto_pista: {nome:"Cartão Moto Pista", coluna:"cartao_moto_pista_preco"},
  taxa_inscricao_detran: {nome:"Taxa de inscrição (Detran)", coluna:"taxa_inscricao_detran_preco"},
  taxa_legislacao_detran: {nome:"Taxa de Legislação (Detran)", coluna:"taxa_legislacao_detran_preco"},
  taxa_direcao_detran: {nome:"Taxa de direção (Detran)", coluna:"taxa_direcao_detran_preco"},
  exame_medico: {nome:"Exame médico", coluna:"exame_medico_preco"},
  exame_psicotecnico: {nome:"Exame psicotécnico", coluna:"exame_psicotecnico_preco"}
};

async function carregarPrecosItensFixos() {
  const client=window.getMarcusSupabase?.(); if(!client||!adminSupabaseUserId)return;
  const colunas=Object.values(CONFIG_PRODUTOS_FIXOS).map(x=>x.coluna).join(",");
  const {data,error}=await client.from("app_settings").select(colunas).eq("owner_id",adminSupabaseUserId).maybeSingle();
  const status=document.getElementById("statusPrecosFixos");
  if(error){if(status)status.textContent="Não foi possível carregar os preços.";return;}
  const lista=document.getElementById("listaPrecosFixos");
  if(lista)lista.innerHTML=Object.entries(CONFIG_PRODUTOS_FIXOS).map(([key,item])=>
    `<button type="button" class="secondary-button" data-edit-preco-fixo="${key}" style="display:block;width:100%;text-align:left;margin:6px 0">${item.nome}</button>`
  ).join("");
}
function abrirEditorPrecoFixo(key){
  const item=CONFIG_PRODUTOS_FIXOS[key]; if(!item)return;
  const client=window.getMarcusSupabase?.();
  if(!client||!adminSupabaseUserId){mostrarAviso("Não foi possível acessar os preços desta conta.");return;}
  client.from("app_settings").select(item.coluna).eq("owner_id",adminSupabaseUserId).maybeSingle().then(({data,error})=>{
    if(error){mostrarAviso("Não foi possível carregar o preço deste produto.");return;}
    const valor=Number(data?.[item.coluna]||0).toFixed(2);
    abrirModal(`
      <h2>${item.nome}</h2>
      <form id="formPrecoFixo">
        <label for="valorPrecoFixo">Preço (R$)</label>
        <input id="valorPrecoFixo" type="number" min="0" step="0.01" value="${valor}" required>
        <button id="btnSalvarPrecoFixo" class="primary-button" type="submit">Salvar preço</button>
        <p id="statusPrecoFixo" class="form-hint" role="status"></p>
      </form>`);
    document.getElementById("formPrecoFixo").addEventListener("submit",evento=>{
      evento.preventDefault();
      salvarPrecoFixo(key);
    });
  });
}
async function salvarPrecoFixo(key){
  const item=CONFIG_PRODUTOS_FIXOS[key],client=window.getMarcusSupabase?.();
  const campo=document.getElementById("valorPrecoFixo"),botao=document.getElementById("btnSalvarPrecoFixo"),status=document.getElementById("statusPrecoFixo");
  const preco=Number(campo?.value);
  if(!item||!client||!adminSupabaseUserId||!Number.isFinite(preco)||preco<0){if(status)status.textContent="Informe um preço válido.";return;}
  if(botao){botao.disabled=true;botao.textContent="Salvando...";}
  try{
    const {error}=await client.from("app_settings").upsert({owner_id:adminSupabaseUserId,[item.coluna]:preco},{onConflict:"owner_id"});
    if(error)throw error;
    fecharModal();
    mostrarAviso("Preço salvo com sucesso.");
  }catch(error){
    console.error("Falha ao salvar preço fixo:",error);
    if(status)status.textContent=error.message||"Não foi possível salvar o preço.";
    if(botao){botao.disabled=false;botao.textContent="Salvar preço";}
  }
}

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
  configurarFiltrosFinanceiros();
  listarMovimentacoes();
  atualizarFinanceiro();
  listarProdutos();
  carregarPrecosItensFixos();
  document.getElementById("btnSalvarPrecosFixos")?.addEventListener("click",salvarPrecosItensFixos);
  mostrarPagina("inicio");

  console.log("Central do Instrutor iniciado.");
          }

prepararDadosAdmin().finally(() => iniciarAplicativo());

/* =========================================
   LIMPAR TODOS OS REGISTROS
========================================= */

async function limparTodosRegistros() {
  if (!(await confirmar(
    "ATENÇÃO!\n\nDeseja apagar TODOS os alunos, veículos, aulas, vendas, despesas e movimentações?\n\nEssa ação não poderá ser desfeita."
  ))) {
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

// A limpeza de dados é executada somente mediante solicitação administrativa explícita.
