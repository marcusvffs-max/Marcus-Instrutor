"use strict";

(function iniciarTesteGeminiPreviewAdmin() {
  if (window.__marcusGeminiPreviewTestLoaded) return;
  window.__marcusGeminiPreviewTestLoaded = true;

  const client = typeof window.getMarcusSupabase === "function"
    ? window.getMarcusSupabase()
    : null;

  if (!client) {
    console.error("Teste Gemini Preview: cliente Supabase indisponível.");
    return;
  }

  const style = document.createElement("style");
  style.textContent = `
    #marcusGeminiPreviewTest {
      position: fixed;
      right: 16px;
      bottom: 18px;
      z-index: 9998;
      width: min(360px, calc(100vw - 32px));
      font-family: inherit;
      color: #172033;
    }
    #marcusGeminiPreviewTest details {
      background: #fff;
      border: 1px solid #cbd5e1;
      border-radius: 14px;
      box-shadow: 0 8px 28px rgba(15, 23, 42, .18);
      overflow: hidden;
    }
    #marcusGeminiPreviewTest summary {
      cursor: pointer;
      padding: 13px 16px;
      background: #12345a;
      color: #fff;
      font-weight: 700;
      font-size: 14px;
      list-style-position: inside;
    }
    #marcusGeminiPreviewTest .marcus-preview-body {
      padding: 14px;
      font-size: 13px;
      line-height: 1.45;
    }
    #marcusGeminiPreviewTest button {
      width: 100%;
      border: 0;
      border-radius: 9px;
      padding: 11px 13px;
      background: #1769aa;
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }
    #marcusGeminiPreviewTest button:disabled {
      opacity: .6;
      cursor: wait;
    }
    #marcusGeminiPreviewResult {
      margin-top: 10px;
      padding: 10px;
      border-radius: 8px;
      background: #f1f5f9;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      max-height: 220px;
      overflow: auto;
    }
    #marcusGeminiPreviewResult[data-state="success"] {
      background: #ecfdf5;
      color: #065f46;
    }
    #marcusGeminiPreviewResult[data-state="error"] {
      background: #fef2f2;
      color: #991b1b;
    }
  `;
  document.head.appendChild(style);

  const panel = document.createElement("section");
  panel.id = "marcusGeminiPreviewTest";
  panel.innerHTML = `
    <details>
      <summary>Teste de segurança da Assistente Virtual</summary>
      <div class="marcus-preview-body">
        <p>Verifica a sessão administrativa e a proteção da função. Usa uma pergunta genérica, sem dados pessoais. Não envia mensagens pelo WhatsApp nem altera conversas.</p>
        <button type="button" id="marcusRunGeminiPreviewTest">Executar teste</button>
        <div id="marcusGeminiPreviewResult" role="status" aria-live="polite">Aguardando execução.</div>
      </div>
    </details>
  `;
  document.body.appendChild(panel);

  const button = panel.querySelector("#marcusRunGeminiPreviewTest");
  const result = panel.querySelector("#marcusGeminiPreviewResult");

  button.addEventListener("click", async function () {
    button.disabled = true;
    button.textContent = "Testando...";
    result.dataset.state = "";
    result.textContent = "Verificando sua sessão e chamando a função com autenticação...";

    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session) {
        throw new Error("Não há sessão ativa. Saia e entre novamente no aplicativo.");
      }

      const { data, error } = await client.functions.invoke("gemini-assistant-preview", {
        body: { message: "Quais são as formas de pagamento aceitas?" }
      });

      if (error) {
        let detail = error.message || "A função recusou a chamada.";
        if (error.context && typeof error.context.json === "function") {
          try {
            const payload = await error.context.json();
            detail = payload.error || payload.message || detail;
          } catch (_) {}
        }
        throw new Error(detail);
      }

      if (!data || data.ok !== true || data.mode !== "preview_only") {
        throw new Error((data && (data.error || data.message)) || "A função respondeu, mas não confirmou o modo preview_only.");
      }

      result.dataset.state = "success";
      result.textContent =
        "SUCESSO: sessão aceita e função executada.\n" +
        "Modo: " + data.mode + "\n" +
        "Modelo configurado: " + (data.model || "não informado") + "\n" +
        "Intenção retornada: " + (data.intent || "não informada") + "\n\n" +
        "Este teste confirma a autenticação e a rota de prévia. Não envia mensagens pelo WhatsApp nem grava alterações.";
    } catch (error) {
      result.dataset.state = "error";
      result.textContent = "TESTE NÃO CONCLUÍDO\n" + (error && error.message ? error.message : "Erro inesperado.");
    } finally {
      button.disabled = false;
      button.textContent = "Executar teste novamente";
    }
  });
})();
