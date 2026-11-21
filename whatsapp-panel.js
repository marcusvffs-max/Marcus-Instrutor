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
          <p>Atualize o status dos pedidos e encerre conversas pelo painel. Encerrar uma conversa pausa a Assistente Virtual por 48 horas.</p>
        </div>

        <div class="panel">
          <h3>Pendentes e em atendimento</h3>
          <div id="listaAtendimentosWhatsapp" class="list-container">
            <div class="empty-state">Aguardando autenticação para consultar os atendimentos.</div>
          </div>
        </div>

        <div class="panel">
          <h3>Conversas recentes</h3>
          <div id="listaConversasWhatsapp" class="list-container">
            <div class="empty-state">Aguardando autenticação para consultar as conversas.</div>
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

  function formatarMoeda(valor) {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return "Não informado";
    return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
    const numeroWhatsApp = telefone.replace(/\\D/g, "");
    const linkWhatsApp = numeroWhatsApp
      ? `<a class="whatsapp-open-link" href="https://wa.me/${numeroWhatsApp}" target="_blank" rel="noopener noreferrer">Abrir conversa no WhatsApp</a>`
      : "";

    const dados = pedido.dados_propostos && typeof pedido.dados_propostos === "object"
      ? pedido.dados_propostos
      : {};
    const mensagem = typeof dados.mensagem === "string"
      ? escaparHtml(dados.mensagem)
      : "";
    const tipoSolicitacao = pedido.tipo_solicitacao === "duvida_outros_detran"
      ? "Dúvida — Outros assuntos"
      : pedido.tipo_solicitacao === "intencao_compra_adicionais"
        ? "Intenção de contratação de adicionais"
        : pedido.tipo_solicitacao === "intencao_compra_pacote"
          ? "Intenção de contratação de pacote"
          : "Pedido de atendimento humano";

    let detalhesPacote = "";
    if (pedido.tipo_solicitacao === "intencao_compra_pacote" || pedido.tipo_solicitacao === "intencao_compra_adicionais") {
      const adicionais = Array.isArray(dados.adicionais_selecionados) ? dados.adicionais_selecionados : [];
      const adicionaisPendentes = Array.isArray(dados.adicionais_obrigatorios_nao_selecionados)
        ? dados.adicionais_obrigatorios_nao_selecionados
        : [];
      const adicionaisHtml = adicionais.length
        ? `<p><strong>Adicionais selecionados (separados):</strong><br>${adicionais.map(item =>
            `${escaparHtml(item?.nome || "Adicional")}: ${formatarMoeda(item?.valor)}`
          ).join("<br>")}</p>`
        : "";
      const pendentesHtml = adicionaisPendentes.length
        ? `<p><strong>Outros itens obrigatórios:</strong><br>${adicionaisPendentes.map(item =>
            `${escaparHtml(item?.nome || "Adicional")}: ${formatarMoeda(item?.valor)}`
          ).join("<br>")}</p>`
        : "";
      const somenteAdicionais = pedido.tipo_solicitacao === "intencao_compra_adicionais" ||
        dados.tipo_contratacao === "somente_adicionais";
      detalhesPacote = somenteAdicionais
        ? `
          <div style="margin:8px 0;padding:10px;border:1px solid var(--border);border-radius:10px;">
            <p><strong>Contratação:</strong> Somente adicionais, sem pacote de aulas</p>
            ${adicionaisHtml}
            <p><strong>Total dos adicionais:</strong> ${formatarMoeda(dados.valor_total_adicionais_selecionados ?? dados.valor_total_com_adicionais)}</p>
          </div>
        `
        : `
          <div style="margin:8px 0;padding:10px;border:1px solid var(--border);border-radius:10px;">
            <p><strong>Pacote:</strong> ${escaparHtml(dados.pacote || "Não informado")}</p>
            <p><strong>Quantidade:</strong> ${escaparHtml(dados.quantidade_aulas ?? "Não informada")} aulas</p>
            <p><strong>Valor por aula:</strong> ${formatarMoeda(dados.valor_por_aula)}</p>
            <p><strong>Valor total das aulas:</strong> ${formatarMoeda(dados.valor_total_aulas)}</p>
            ${adicionaisHtml}
            ${pendentesHtml}
            <small>Os adicionais são cobrados separadamente do valor das aulas.</small>
          </div>
        `;
    }

    const opcoesStatus = Object.entries(STATUS).map(([valor, rotulo]) =>
      `<option value="${valor}" ${pedido.atendimento_status === valor ? "selected" : ""}>${rotulo}</option>`
    ).join("");

    return `
      <article class="whatsapp-request">
        <div class="whatsapp-request-info">
          <strong>${nome}</strong>
          <span>${telefoneSeguro || "Telefone não informado"}</span>
          <small>${escaparHtml(tipoSolicitacao)} · Recebido em ${escaparHtml(formatarData(pedido.created_at))}</small>
          ${detalhesPacote}
          ${mensagem ? `<p style="margin:8px 0;white-space:pre-wrap;overflow-wrap:anywhere;">${mensagem}</p>` : ""}
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

      const { data, error } = await supabase.functions.invoke("admin-manage-instructors", {
        body: {
          action: "update_whatsapp_request_status",
          request_id: id,
          status: novoStatus,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Não foi possível atualizar o status.");

      await carregarAtendimentosWhatsapp();
    } catch (erro) {
      console.error("Erro ao alterar status do atendimento:", erro);
      window.alert("Não foi possível salvar o status. Tente novamente.");
      seletor.disabled = false;
    }
  }

  function renderizarConversaWhatsapp(conversa) {
    const nome = escaparHtml(conversa.nome_contato || "Cliente WhatsApp");
    const telefone = escaparHtml(conversa.telefone || "Telefone não informado");
    const encerrada = conversa.status === "encerrada";
    const status = {
      aguardando: "Aguardando escolha",
      aguardando_escolha: "Aguardando escolha",
      atendimento_ia: "Assistente Virtual",
      atendimento_humano: "Atendimento humano",
      aberta: "Aberta",
      encerrada: "Encerrada",
    }[conversa.status] || "Em andamento";
    const pausa = conversa.ai_paused_until
      ? ` · Assistente pausada até ${escaparHtml(formatarData(conversa.ai_paused_until))}`
      : "";
    return `
      <article class="whatsapp-request">
        <div class="whatsapp-request-info">
          <strong>${nome}</strong>
          <span>${telefone}</span>
          <small>Status: ${escaparHtml(status)} · Última atividade: ${escaparHtml(formatarData(conversa.ultima_mensagem_em || conversa.updated_at))}${pausa}</small>
        </div>
        <div class="whatsapp-request-actions">
          <button type="button" class="secondary-button" data-ver-mensagens="${escaparHtml(conversa.id)}" aria-expanded="false">Ver mensagens</button>
          ${encerrada ? "" : `<button type="button" class="secondary-button" data-encerrar-conversa="${escaparHtml(conversa.id)}">Encerrar conversa (pausa 48h)</button>`}
          <a class="whatsapp-open-link" href="https://wa.me/${String(conversa.telefone || "").replace(/\\D/g, "")}" target="_blank" rel="noopener noreferrer">Abrir conversa no WhatsApp</a>
        </div>
        <div class="whatsapp-transcript" id="historico-conversa-${escaparHtml(conversa.id)}" hidden></div>
      </article>
    `;
  }

  function renderizarMensagemWhatsapp(mensagem) {
    const enviada = mensagem.direcao === "saida";
    const tipo = String(mensagem.tipo_mensagem || "mensagem");
    const conteudo = typeof mensagem.conteudo === "string" && mensagem.conteudo.trim()
      ? escaparHtml(mensagem.conteudo).split(String.fromCharCode(10)).join("<br>")
      : escaparHtml({
        image: "Imagem recebida/enviada (prévia não disponível)",
        video: "Vídeo recebido/enviado (prévia não disponível)",
        audio: "Áudio recebido/enviado (prévia não disponível)",
        document: "Documento recebido/enviado (prévia não disponível)",
        sticker: "Figurinha recebida/enviada",
        location: "Localização compartilhada",
      }[tipo] || "Conteúdo não textual ou indisponível");
    const status = enviada && mensagem.status_provedor
      ? `<small class="whatsapp-message-status">Status: ${escaparHtml(mensagem.status_provedor)}</small>`
      : "";
    return `
      <div class="whatsapp-message ${enviada ? "whatsapp-message-out" : "whatsapp-message-in"}">
        <div class="whatsapp-message-bubble">
          <small>${enviada ? "Instrutor" : "Cliente"} · ${escaparHtml(formatarData(mensagem.created_at))}</small>
          <div>${conteudo}</div>
          ${status}
        </div>
      </div>
    `;
  }

  async function carregarHistoricoConversaWhatsapp(conversationId, botao, offset = 0, carregarAnteriores = false) {
    const area = document.getElementById(`historico-conversa-${conversationId}`);
    if (!area) return;
    if (!carregarAnteriores && !area.hidden) {
      area.hidden = true;
      botao.setAttribute("aria-expanded", "false");
      botao.textContent = "Ver mensagens";
      return;
    }

    area.hidden = false;
    botao.setAttribute("aria-expanded", "true");
    botao.textContent = "Ocultar mensagens";
    if (!carregarAnteriores) area.innerHTML = '<div class="empty-state">Carregando mensagens...</div>';

    const supabase = typeof window.getMarcusSupabase === "function"
      ? window.getMarcusSupabase()
      : null;
    if (!supabase) {
      area.innerHTML = '<div class="empty-state">Entre novamente no aplicativo para consultar as mensagens.</div>';
      return;
    }

    const botaoPaginacao = carregarAnteriores ? botao : null;
    if (botaoPaginacao) botaoPaginacao.disabled = true;
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-instructors", {
        body: { action: "list_whatsapp_messages", conversation_id: conversationId, offset },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Não foi possível consultar as mensagens.");
      const mensagens = Array.isArray(data.messages) ? data.messages : [];
      if (!carregarAnteriores) {
        area.innerHTML = mensagens.length
          ? `<div class="whatsapp-transcript-heading">Histórico de mensagens · ${mensagens.length} mais recentes</div>
             ${data.has_more ? `<button type="button" class="secondary-button whatsapp-load-older" data-carregar-anteriores="${escaparHtml(conversationId)}" data-offset="${Number(data.next_offset) || 0}">Carregar mensagens anteriores</button>` : ""}
             <div data-lista-mensagens>${mensagens.map(renderizarMensagemWhatsapp).join("")}</div>`
          : '<div class="empty-state">Ainda não há mensagens registradas nesta conversa.</div>';
      } else {
        const listaMensagens = area.querySelector("[data-lista-mensagens]");
        if (listaMensagens && mensagens.length) {
          listaMensagens.insertAdjacentHTML("afterbegin", mensagens.map(renderizarMensagemWhatsapp).join(""));
        }
        if (botaoPaginacao) {
          if (data.has_more) {
            botaoPaginacao.dataset.offset = String(Number(data.next_offset) || 0);
            botaoPaginacao.disabled = false;
          } else {
            botaoPaginacao.remove();
          }
        }
      }
      area.scrollTop = carregarAnteriores ? area.scrollTop : area.scrollHeight;
    } catch (erro) {
      console.error("Erro ao carregar histórico da conversa:", erro);
      if (!carregarAnteriores) area.innerHTML = '<div class="empty-state">Não foi possível carregar as mensagens. Tente novamente.</div>';
      else {
        if (botaoPaginacao) botaoPaginacao.disabled = false;
        window.alert("Não foi possível carregar as mensagens anteriores. Tente novamente.");
      }
    }
  }

  async function encerrarConversaWhatsapp(evento) {
    const botao = evento.target.closest("[data-encerrar-conversa]");
    if (!botao) return;
    const conversationId = botao.dataset.encerrarConversa;
    if (!conversationId) return;
    if (!window.confirm("Encerrar esta conversa? A Assistente Virtual ficará pausada por 48 horas. O cliente poderá reativá-la enviando “Olá”.")) return;

    const supabase = typeof window.getMarcusSupabase === "function"
      ? window.getMarcusSupabase()
      : null;
    if (!supabase) {
      window.alert("Não foi possível conectar ao painel. Entre novamente no aplicativo.");
      return;
    }

    botao.disabled = true;
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-instructors", {
        body: { action: "close_whatsapp_conversation", conversation_id: conversationId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Não foi possível encerrar a conversa.");
      await carregarAtendimentosWhatsapp();
    } catch (erro) {
      console.error("Erro ao encerrar conversa do WhatsApp:", erro);
      window.alert("Não foi possível encerrar a conversa. Tente novamente.");
      botao.disabled = false;
    }
  }

  async function carregarAtendimentosWhatsapp() {
    const lista = document.getElementById("listaAtendimentosWhatsapp");
    const historico = document.getElementById("historicoAtendimentosWhatsapp");
    const conversas = document.getElementById("listaConversasWhatsapp");
    const supabase = typeof window.getMarcusSupabase === "function"
      ? window.getMarcusSupabase()
      : null;

    if (!lista || !supabase) {
      atualizarContador(0);
      if (lista) lista.innerHTML = '<div class="empty-state">Não foi possível conectar ao painel. Entre novamente no aplicativo.</div>';
      if (historico) historico.innerHTML = '<div class="empty-state">Entre no aplicativo para consultar o histórico.</div>';
      if (conversas) conversas.innerHTML = '<div class="empty-state">Entre no aplicativo para consultar as conversas.</div>';
      return;
    }

    lista.innerHTML = '<div class="empty-state">Carregando atendimentos...</div>';
    if (historico) historico.innerHTML = '<div class="empty-state">Carregando histórico...</div>';
    if (conversas) conversas.innerHTML = '<div class="empty-state">Carregando conversas...</div>';

    try {
      const { data: sessao, error: erroUsuario } = await supabase.auth.getUser();
      if (erroUsuario || !sessao.user) throw new Error("Sessão administrativa não encontrada.");

      const base = supabase
        .from("ai_requests")
        .select("id, nome_solicitante, telefone_solicitante, created_at, atendimento_status, tipo_solicitacao, dados_propostos")
        .eq("owner_id", sessao.user.id)
        .eq("canal", "whatsapp")
        .in("tipo_solicitacao", ["atendimento_humano", "duvida_outros_detran", "intencao_compra_pacote", "intencao_compra_adicionais"]);

      const [abertos, encerrados] = await Promise.all([
        base.in("atendimento_status", ["pendente", "em_atendimento"]).order("created_at", { ascending: false }),
        supabase
          .from("ai_requests")
          .select("id, nome_solicitante, telefone_solicitante, created_at, atendimento_status, tipo_solicitacao, dados_propostos")
          .eq("owner_id", sessao.user.id)
          .eq("canal", "whatsapp")
          .in("tipo_solicitacao", ["atendimento_humano", "duvida_outros_detran", "intencao_compra_pacote"])
          .in("atendimento_status", ["concluido", "cancelado"])
          .order("created_at", { ascending: false })
      ]);

      if (abertos.error) throw abertos.error;
      if (encerrados.error) throw encerrados.error;

      const pedidosAbertos = Array.isArray(abertos.data) ? abertos.data : [];
      const pedidosEncerrados = Array.isArray(encerrados.data) ? encerrados.data : [];
      let listaConversas = [];
      let erroListaConversas = false;
      try {
        const { data: conversasData, error: conversasError } = await supabase.functions.invoke("admin-manage-instructors", {
          body: { action: "list_whatsapp_conversations" },
        });
        if (conversasError || !conversasData?.ok) throw conversasError || new Error(conversasData?.error || "A listagem de conversas ainda não está disponível.");
        listaConversas = Array.isArray(conversasData.conversations) ? conversasData.conversations : [];
      } catch (erroConversas) {
        erroListaConversas = true;
        console.warn("Listagem de conversas WhatsApp indisponível:", erroConversas);
      }

      atualizarContador(pedidosAbertos.length);
      lista.innerHTML = pedidosAbertos.length
        ? pedidosAbertos.map(renderizarPedido).join("")
        : '<div class="empty-state">Nenhum atendimento pendente ou em andamento.</div>';

      if (historico) {
        historico.innerHTML = pedidosEncerrados.length
          ? pedidosEncerrados.map(renderizarPedido).join("")
          : '<div class="empty-state">Nenhum atendimento concluído ou cancelado.</div>';
      }
      if (conversas) {
        conversas.innerHTML = erroListaConversas
          ? '<div class="empty-state">A lista de conversas será habilitada quando a atualização do serviço WhatsApp estiver disponível.</div>'
          : (listaConversas.length
            ? listaConversas.map(renderizarConversaWhatsapp).join("")
            : '<div class="empty-state">Nenhuma conversa ativa no momento.</div>');
      }
    } catch (erro) {
      console.error("Erro ao carregar atendimentos do WhatsApp:", erro);
      atualizarContador(0);
      lista.innerHTML = '<div class="empty-state">Não foi possível carregar os atendimentos. Verifique sua conexão e tente novamente.</div>';
      if (historico) historico.innerHTML = '<div class="empty-state">Não foi possível carregar o histórico.</div>';
      if (conversas) conversas.innerHTML = '<div class="empty-state">Não foi possível carregar as conversas.</div>';
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
  const conversas = document.getElementById("listaConversasWhatsapp");
  if (lista) {
    lista.addEventListener("change", alterarStatusAtendimento);
    lista.addEventListener("click", encerrarConversaWhatsapp);
  }
  if (historico) historico.addEventListener("change", alterarStatusAtendimento);
  if (conversas) conversas.addEventListener("click", function (evento) {
    const botaoAntigas = evento.target.closest("[data-carregar-anteriores]");
    if (botaoAntigas) {
      carregarHistoricoConversaWhatsapp(botaoAntigas.dataset.carregarAnteriores, botaoAntigas, Number(botaoAntigas.dataset.offset) || 0, true);
      return;
    }
    const botaoMensagens = evento.target.closest("[data-ver-mensagens]");
    if (botaoMensagens) {
      carregarHistoricoConversaWhatsapp(botaoMensagens.dataset.verMensagens, botaoMensagens);
      return;
    }
    encerrarConversaWhatsapp(evento);
  });

  window.addEventListener("marcus-authenticated", carregarAtendimentosWhatsapp);
  window.addEventListener("marcus-unauthenticated", function () {
    atualizarContador(0);
    if (lista) lista.innerHTML = '<div class="empty-state">Entre no aplicativo para consultar os atendimentos.</div>';
    if (historico) historico.innerHTML = '<div class="empty-state">Entre no aplicativo para consultar o histórico.</div>';
    if (conversas) conversas.innerHTML = '<div class="empty-state">Entre no aplicativo para consultar as conversas.</div>';
  });

  window.carregarAtendimentosWhatsapp = carregarAtendimentosWhatsapp;
})();
