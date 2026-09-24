export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/analyze" && request.method === "POST") {
      try {
        const { prompt, maxTokens } = await request.json();
        if (!prompt || typeof prompt !== "string") {
          return new Response(JSON.stringify({ error: "Kein Prompt übergeben" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const result = await env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct", {
          messages: [
            {
              role: "system",
              content:
                "Du bist ein hilfreicher, freundlicher Trainings- und Reflexions-Assistent für eine persönliche Dashboard-App. Antworte immer auf Deutsch, in kurzen, natürlichen Sätzen, ohne Aufzählungszeichen, außer explizit danach gefragt.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: Math.min(maxTokens || 500, 1024),
        });

        return new Response(JSON.stringify({ text: result.response || "" }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Serverfehler bei der Analyse" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Alles andere: die gebaute Website ausliefern
    return env.ASSETS.fetch(request);
  },
};
