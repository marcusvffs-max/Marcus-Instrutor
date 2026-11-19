"use strict";

(function () {
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
            <h2>Atendimentos pendentes</h2>
          </div>
          <button id="btnAtualizarAtendimentosWhatsapp" class="secondary-button" type="button">
            Atualizar
          </button>
        </div>

        <div class="whatsapp-summary">
          <div>
            <span class="card-label">Clientes aguardando atendimento humano</span>
            <strong id="totalAtendimentosWhatsapp">0</strong>
          </div>
          <p>Quando o cliente escolhe falar diretamente com Marcus, a Assistente Virtual pausa a conversa e registra o pedido aqui.</p>
        </div>

        <div id="listaAtendimentosWhatsapp" class="list-container">
          <div class="empty-state">Aguardando autenticação para consultar os atendimentos.</div>
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

  async function carregarAtendimentosWhatsapp() {
    const lista = document.getElementById("listaAtendimentosWhatsapp");
    const supabase = typeof window.getMarcusSupabase === "function"
      ? window.getMarcusSupabase()
      : null;

    if (!lista || !supabase) {
      atualizarContador(0);
      if (lista) {
        lista.innerHTML = '<div class="empty-state">Não foi possível conectar ao painel. Entre novamente no aplicativo.</div>';
      }
      return;
    }

    lista.innerHTML = '<div class="empty-state">Carregando atendimentos pendentes...</div>';

    try {
      const { data: sessao, error: erroUsuario } = await supabase.auth.getUser();

      if (erroUsuario || !sessao.user) {
        throw new Error("Sessão administrativa não encontrada.");
      }

      const { data, error } = await supabase
        .from("ai_requests")
        .select("id, nome_solicitante, telefone_solicitante, created_at")
        .eq("owner_id", sessao.user.id)
        .eq("canal", "whatsapp")
        .eq("tipo_solicitacao", "atendimento_humano")
        .eq("status", "pendente")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const pedidos = Array.isArray(data) ? data : [];
      atualizarContador(pedidos.length);

      if (!pedidos.length) {
        lista.innerHTML = '<div class="empty-state">Nenhum cliente aguardando atendimento humano no momento.</div>';
        return;
      }

      lista.innerHTML = pedidos.map(pedido => {
        const nome = escaparHtml(pedido.nome_solicitante || "Cliente WhatsApp");
        const telefone = String(pedido.telefone_solicitante || "");
        const telefoneSeguro = escaparHtml(telefone);
        const numeroWhatsApp = telefone.replace(/\D/g, "");
        const linkWhatsApp = numeroWhatsApp
          ? `<a class="whatsapp-open-link" href="https://wa.me/${numeroWhatsApp}" target="_blank" rel="noopener noreferrer">Abrir conversa no WhatsApp</a>`
          : "";

        return `
          <article class="whatsapp-request">
            <div class="whatsapp-request-info">
              <strong>${nome}</strong>
              <span>${telefoneSeguro || "Telefone não informado"}</span>
              <small>Pedido recebido em ${escaparHtml(formatarData(pedido.created_at))}</small>
            </div>
            <div class="whatsapp-request-actions">
              <span class="whatsapp-pending-label">Aguardando Marcus</span>
              ${linkWhatsApp}
            </div>
          </article>
        `;
      }).join("");
    } catch (erro) {
      console.error("Erro ao carregar atendimentos do WhatsApp:", erro);
      atualizarContador(0);
      lista.innerHTML = '<div class="empty-state">Não foi possível carregar os atendimentos. Verifique sua conexão e tente novamente.</div>';
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

  window.addEventListener("marcus-authenticated", carregarAtendimentosWhatsapp);
  window.addEventListener("marcus-unauthenticated", function () {
    atualizarContador(0);
    const lista = document.getElementById("listaAtendimentosWhatsapp");
    if (lista) lista.innerHTML = '<div class="empty-state">Entre no aplicativo para consultar os atendimentos.</div>';
  });

  window.carregarAtendimentosWhatsapp = carregarAtendimentosWhatsapp;
})();
