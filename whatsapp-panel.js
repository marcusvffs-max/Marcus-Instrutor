"use strict";

(function () {
  const STATUS = {
    pendente: "Pendente",
    em_atendimento: "Em atendimento",
    concluido: "Concluído",
    cancelado: "Cancelado"
  };

  const botaoAbrir = document.createElement("button");
  botaoAbrir.type = "button";
  botaoAbrir.id = "btnAtendimentosWhatsapp";
  botaoAbrir.className = "icon-button whatsapp-alert-button";
  botaoAbrir.setAttribute("aria-label", "Ver atendimentos pendentes do WhatsApp");
  botaoAbrir.innerHTML = 'Atendimentos <span id="badgeAtendimentosWhatsapp" class="whatsapp-alert-badge" hidden>0</span>';

  const marca = document.querySelector(".topbar .brand");
  if (marca) marca.insertAdjacentElement("afterend", botaoAbrir);

  const main = document.getElementById("mainContent");
  if (main) {
    main.insertAdjacentHTML("beforeend", `
      <section id="page-whatsapp" class="page">
        <div class="page-heading">
          <div>
            <span class="eyebrow">WHATSAPP BUSINESS</span>
            <h2>Atendimentos</h2>
          </div>
          <button id="btnAtualizarAtendimentosWhatsapp" class="secondary-button" type="button">
            Atualizar
          </button>
        </div>

        <div class="whatsapp-summary">
          <div>
            <span class="card-label">Atendimentos em aberto</span>
            <strong id="totalAtendimentosWhatsapp">0</strong>
          </div>
          <p>Altere o status manualmente. Abrir o WhatsApp ou trocar mensagens não muda a situação do atendimento.</p>
        </div>

        <div class="panel">
          <h3>Pendentes e em atendimento</h3>
          <div id="listaAtendimentosWhatsapp" class="list-container">
            <div class="empty-state">Aguardando autenticação para consultar os atendimentos.</div>
          </div>
        </div>

        <div class="panel">
          <h3>Histórico — concluídos e cancelados</h3>
          <div id="historicoAtendimentosWhatsapp" class="list-container">
            <div class="empty-state">O histórico será exibido aqui.</div>
          </div>
        </div>
      </section>
    `);
  }

  function escaparHtml(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caractere => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[caractere]);
  }

  function formatarData(valor) {
    if (!valor) return "Data não informada";
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return "Data não informada";
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(data);
  }

  function atualizarContador(total) {
    const badge = document.getElementById("badgeAtendimentosWhatsapp");
    const resumo = document.getElementById("totalAtendimentosWhatsapp");

    if (badge) {
      badge.textContent = String(total);
      badge.hidden = total < 1;
    }

    if (resumo) resumo.textContent = String(total);
  }

  function renderizarPedido(pedido) {
    const nome = escaparHtml(pedido.nome_solicitante || "Cliente WhatsApp");
    const telefone = String(pedido.telefone_solicitante || "");
    const telefoneSeguro = escaparHtml(telefone);
    const numeroWhatsApp = telefone.replace(/\D/g, "");
    const linkWhatsApp = numeroWhatsApp
      ? `<a class="whatsapp-open-link" href="https://wa.me/${numeroWhatsApp}" target="_blank" rel="noopener noreferrer">Abrir conversa no WhatsApp</a>`
      : "";

    const opcoesStatus = Object.entries(STATUS).map(([valor, rotulo]) =>
      `<option value="${valor}" ${pedido.atendimento_status === valor ? "selected" : ""}>${rotulo}</option>`
    ).join("");

    return `
      <article class="whatsapp-request">
        <div class="whatsapp-request-info">
          <strong>${nome}</strong>
          <span>${telefoneSeguro || "Telefone não informado"}</span>
          <small>Pedido recebido em ${escaparHtml(formatarData(pedido.created_at))}</small>
          <label style="display:block;margin-top:8px;font-size:12px;font-weight:700;" for="status-atendimento-${escaparHtml(pedido.id)}">Status do atendimento</label>
          <select
            id="status-atendimento-${escaparHtml(pedido.id)}"
            class="whatsapp-status-select"
            data-status-atendimento="${escaparHtml(pedido.id)}"
            style="min-height:38px;max-width:220px;padding:7px 10px;border:1px solid var(--border);border-radius:9px;background:var(--surface);color:var(--text);"
          >${opcoesStatus}</select>
        </div>
        <div class="whatsapp-request-actions">
          <span class="whatsapp-pending-label">${escaparHtml(STATUS[pedido.atendimento_status] || "Pendente")}</span>
          ${linkWhatsApp}
        </div>
      </article>
    `;
  }

  async function alterarStatusAtendimento(evento) {
    const seletor = evento.target.closest("[data-status-atendimento]");
    if (!seletor) return;

    const id = seletor.dataset.statusAtendimento;
    const novoStatus = seletor.value;
    const supabase = typeof window.getMarcusSupabase === "function"
      ? window.getMarcusSupabase()
      : null;

    if (!supabase || !STATUS[novoStatus]) {
      window.alert("Não foi possível atualizar o status. Entre novamente no aplicativo.");
      return;
    }

    seletor.disabled = true;

    try {
      const { data: sessao, error: erroUsuario } = await supabase.auth.getUser();
      if (erroUsuario || !sessao.user) throw new Error("Sessão administrativa não encontrada.");

      const { error } = await supabase
        .from("ai_requests")
        .update({ atendimento_status: novoStatus })
        .eq("id", id)
        .eq("owner_id", sessao.user.id)
        .eq("tipo_solicitacao", "atendimento_humano");

      if (error) throw error;

      await carregarAtendimentosWhatsapp();
    } catch (erro) {
      console.error("Erro ao alterar status do atendimento:", erro);
      window.alert("Não foi possível salvar o status. Tente novamente.");
      seletor.disabled = false;
    }
  }

  async function carregarAtendimentosWhatsapp() {
    const lista = document.getElementById("listaAtendimentosWhatsapp");
    const historico = document.getElementById("historicoAtendimentosWhatsapp");
    const supabase = typeof window.getMarcusSupabase === "function"
      ? window.getMarcusSupabase()
      : null;

    if (!lista || !supabase) {
      atualizarContador(0);
      if (lista) lista.innerHTML = '<div class="empty-state">Não foi possível conectar ao painel. Entre novamente no aplicativo.</div>';
      if (historico) historico.innerHTML = '<div class="empty-state">Entre no aplicativo para consultar o histórico.</div>';
      return;
    }

    lista.innerHTML = '<div class="empty-state">Carregando atendimentos...</div>';
    if (historico) historico.innerHTML = '<div class="empty-state">Carregando histórico...</div>';

    try {
      const { data: sessao, error: erroUsuario } = await supabase.auth.getUser();
      if (erroUsuario || !sessao.user) throw new Error("Sessão administrativa não encontrada.");

      const base = supabase
        .from("ai_requests")
        .select("id, nome_solicitante, telefone_solicitante, created_at, atendimento_status")
        .eq("owner_id", sessao.user.id)
        .eq("canal", "whatsapp")
        .eq("tipo_solicitacao", "atendimento_humano");

      const [abertos, encerrados] = await Promise.all([
        base.in("atendimento_status", ["pendente", "em_atendimento"]).order("created_at", { ascending: false }),
        supabase
          .from("ai_requests")
          .select("id, nome_solicitante, telefone_solicitante, created_at, atendimento_status")
          .eq("owner_id", sessao.user.id)
          .eq("canal", "whatsapp")
          .eq("tipo_solicitacao", "atendimento_humano")
          .in("atendimento_status", ["concluido", "cancelado"])
          .order("created_at", { ascending: false })
      ]);

      if (abertos.error) throw abertos.error;
      if (encerrados.error) throw encerrados.error;

      const pedidosAbertos = Array.isArray(abertos.data) ? abertos.data : [];
      const pedidosEncerrados = Array.isArray(encerrados.data) ? encerrados.data : [];

      atualizarContador(pedidosAbertos.length);
      lista.innerHTML = pedidosAbertos.length
        ? pedidosAbertos.map(renderizarPedido).join("")
        : '<div class="empty-state">Nenhum atendimento pendente ou em andamento.</div>';

      if (historico) {
        historico.innerHTML = pedidosEncerrados.length
          ? pedidosEncerrados.map(renderizarPedido).join("")
          : '<div class="empty-state">Nenhum atendimento concluído ou cancelado.</div>';
      }
    } catch (erro) {
      console.error("Erro ao carregar atendimentos do WhatsApp:", erro);
      atualizarContador(0);
      lista.innerHTML = '<div class="empty-state">Não foi possível carregar os atendimentos. Verifique sua conexão e tente novamente.</div>';
      if (historico) historico.innerHTML = '<div class="empty-state">Não foi possível carregar o histórico.</div>';
    }
  }

  if (botaoAbrir) {
    botaoAbrir.addEventListener("click", function () {
      if (typeof window.mostrarPagina === "function") {
        window.mostrarPagina("whatsapp");
      }
      carregarAtendimentosWhatsapp();
    });
  }

  const botaoAtualizar = document.getElementById("btnAtualizarAtendimentosWhatsapp");
  if (botaoAtualizar) {
    botaoAtualizar.addEventListener("click", carregarAtendimentosWhatsapp);
  }

  const lista = document.getElementById("listaAtendimentosWhatsapp");
  const historico = document.getElementById("historicoAtendimentosWhatsapp");
  if (lista) lista.addEventListener("change", alterarStatusAtendimento);
  if (historico) historico.addEventListener("change", alterarStatusAtendimento);

  window.addEventListener("marcus-authenticated", carregarAtendimentosWhatsapp);
  window.addEventListener("marcus-unauthenticated", function () {
    atualizarContador(0);
    if (lista) lista.innerHTML = '<div class="empty-state">Entre no aplicativo para consultar os atendimentos.</div>';
    if (historico) historico.innerHTML = '<div class="empty-state">Entre no aplicativo para consultar o histórico.</div>';
  });

  window.carregarAtendimentosWhatsapp = carregarAtendimentosWhatsapp;
})();
