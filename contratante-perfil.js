"use strict";

(function () {
  const CAMPOS = [
    ["contratanteNome", "contratante_nome"],
    ["contratanteDocumento", "contratante_documento"],
    ["contratanteNacionalidade", "contratante_nacionalidade"],
    ["contratanteCivil", "contratante_estado_civil"],
    ["contratanteProfissao", "contratante_profissao"],
    ["contratanteEndereco", "contratante_endereco"]
  ];
  const COLUNAS = CAMPOS.map(([, coluna]) => coluna).join(",");
  let filaSalvamento = Promise.resolve();

  function elementos() {
    return CAMPOS.map(([id, coluna]) => ({ elemento: document.getElementById(id), coluna }))
      .filter(item => item.elemento);
  }

  function coletar() {
    return Object.fromEntries(elementos().map(({ elemento, coluna }) => [
      coluna, String(elemento.value || "").trim()
    ]));
  }

  function preencher(dados) {
    for (const { elemento, coluna } of elementos()) {
      elemento.value = dados?.[coluna] || "";
    }
  }

  async function carregar(cliente, usuarioId) {
    if (!cliente || !usuarioId) throw new Error("Conta autenticada não identificada.");
    const { data, error } = await cliente.from("app_settings")
      .select(COLUNAS).eq("owner_id", usuarioId).maybeSingle();
    if (error) throw error;
    preencher(data);
    return data || null;
  }

  async function gravar(cliente, usuarioId) {
    if (!cliente || !usuarioId) throw new Error("Conta autenticada não identificada.");
    const dados = coletar();
    const { data, error } = await cliente.from("app_settings")
      .update(dados).eq("owner_id", usuarioId).select("owner_id").maybeSingle();
    if (error) throw error;
    if (data) return;

    const insercao = await cliente.from("app_settings")
      .insert({ owner_id: usuarioId, ...dados });
    if (!insercao.error) return;
    if (insercao.error.code !== "23505") throw insercao.error;

    const repeticao = await cliente.from("app_settings")
      .update(dados).eq("owner_id", usuarioId);
    if (repeticao.error) throw repeticao.error;
  }

  function vincular(obterCliente, obterUsuarioId) {
    const status = document.getElementById("statusDadosContratante");
    const botao = document.getElementById("btnSalvarDadosContratante");
    const salvar = () => {
      filaSalvamento = filaSalvamento.then(async () => {
        if (botao) {
          botao.disabled = true;
          botao.textContent = "Salvando...";
        }
        if (status) status.textContent = "Salvando seus dados na sua conta...";
        try {
          await gravar(obterCliente(), obterUsuarioId());
          if (status) status.textContent = "Dados do contratante salvos na sua conta.";
          return true;
        } catch (erro) {
          console.error("Erro ao salvar identificação do contratante:", erro);
          if (status) status.textContent = "Não foi possível salvar. Verifique sua conexão e tente novamente.";
          return false;
        } finally {
          if (botao) {
            botao.disabled = false;
            botao.textContent = "Salvar meus dados";
          }
        }
      });
      return filaSalvamento;
    };

    elementos().forEach(({ elemento }) => {
      elemento.addEventListener("change", salvar);
    });
    if (botao) botao.addEventListener("click", salvar);
  }

  window.MarcusContractorProfile = { carregar, gravar, vincular };
})();
