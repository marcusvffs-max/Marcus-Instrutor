import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const MODEL = "gemini-2.5-flash-lite";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  if (!GEMINI_API_KEY) {
    return json({
      connected: false,
      error: "GEMINI_API_KEY não está configurada nos segredos da função.",
    }, 503);
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": GEMINI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: "Responda somente com a palavra OK." }],
          }],
          generationConfig: {
            maxOutputTokens: 16,
            temperature: 0,
          },
        }),
      },
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const apiStatus = response.status;
      const apiCode = typeof data?.error?.status === "string"
        ? data.error.status
        : "UNKNOWN";

      let message = "O Google Gemini recusou a solicitação.";
      if (apiStatus === 400 || apiStatus === 401 || apiStatus === 403) {
        message = "A chave ou a configuração da API Gemini foi recusada. Confira a chave e o projeto no Google AI Studio.";
      } else if (apiStatus === 429) {
        message = "O limite gratuito de solicitações do Gemini foi atingido ou a cota está temporariamente indisponível.";
      } else if (apiStatus >= 500) {
        message = "O serviço Gemini está temporariamente indisponível.";
      }

      return json({
        connected: false,
        error: message,
        api_status: apiStatus,
        api_code: apiCode,
      }, 502);
    }

    const outputText = (data?.candidates ?? [])
      .flatMap((candidate: any) => candidate?.content?.parts ?? [])
      .map((part: any) => typeof part?.text === "string" ? part.text : "")
      .join(" ")
      .trim();

    if (!outputText) {
      return json({
        connected: false,
        error: "O Gemini respondeu, mas não retornou texto de confirmação.",
      }, 502);
    }

    return json({
      connected: true,
      message: "A chave foi aceita e o Gemini respondeu corretamente.",
      model: MODEL,
      test_response: outputText,
    });
  } catch (error) {
    console.error(
      "Gemini connection check failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return json({
      connected: false,
      error: "Não foi possível concluir a comunicação com a API Gemini.",
    }, 502);
  }
});
