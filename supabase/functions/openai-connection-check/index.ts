import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

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

  if (!OPENAI_API_KEY) {
    return json({
      connected: false,
      error: "OPENAI_API_KEY não está configurada nos segredos da função.",
    }, 503);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-6.2-astra",
        input: "Responda somente com a palavra OK.",
        max_output_tokens: 16,
        store: false,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 401) {
        return json({
          connected: false,
          error: "A OpenAI recusou a chave. Confira se a chave foi copiada corretamente.",
        }, 502);
      }
      if (status === 429) {
        return json({
          connected: false,
          error: "A API respondeu com limite ou ausência de crédito disponível.",
        }, 502);
      }
      return json({
        connected: false,
        error: `A API da OpenAI respondeu com status ${status}.`,
      }, 502);
    }

    const data = await response.json();
    const outputText = (data.output ?? [])
      .filter((item: any) => item.type === "message")
      .flatMap((item: any) => item.content ?? [])
      .filter((item: any) => item.type === "output_text")
      .map((item: any) => item.text ?? "")
      .join(" ")
      .trim();

    if (!outputText) {
      return json({
        connected: false,
        error: "A API respondeu, mas não retornou texto de confirmação.",
      }, 502);
    }

    return json({
      connected: true,
      message: "A chave foi aceita e a API de IA respondeu corretamente.",
      model: "gpt-6.2-astra",
    });
  } catch (error) {
    console.error(
      "OpenAI connection check failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return json({
      connected: false,
      error: "Não foi possível concluir a comunicação com a API da OpenAI.",
    }, 502);
  }
});
