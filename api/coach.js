// api/coach.js
// Vercel serverless function. Coach's request comes in from the browser,
// this adds your Anthropic API key (read from the server environment, never
// shipped to the client), forwards it to Anthropic, and returns the result.
//
// The key lives ONLY in Vercel → Settings → Environment Variables as
// ANTHROPIC_API_KEY. It is never in this file, never in the app, never in git.

export default async function handler(req, res) {
  // Coach only ever POSTs. Reject anything else.
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Misconfiguration guard: the env var isn't set in Vercel.
    return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY" });
  }

  try {
    // req.body is already parsed by Vercel for JSON requests. The app sends
    // { model, max_tokens, system, messages } — we forward it untouched and
    // just attach the auth + version headers.
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();
    // Pass Anthropic's status through so the app can tell success from error.
    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(502).json({ error: "Upstream call failed", detail: String(e) });
  }
}
