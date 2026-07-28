// api/coach.js — MYG Coach proxy, v2 (Session 76: SSE streaming)
//
// Replaces the buffered proxy. Two modes, chosen by the CLIENT per request:
//   body.stream === true  → forward stream:true to Anthropic and pipe the
//                           SSE bytes straight through, untouched. Used by
//                           the conversational Coach path so tokens render
//                           as the model emits them.
//   otherwise             → exactly the old behavior: await the full JSON
//                           and return it. The survey voicing call and the
//                           judgment harness use this path unchanged (the
//                           voicing validator needs complete text).
//
// Edge runtime, deliberately: streaming responses on the Node serverless
// runtime fight the platform's buffering and duration limits; the edge
// runtime streams natively and keeps the connection open as long as bytes
// flow. No other behavior differs.
//
// Env: expects ANTHROPIC_API_KEY (same variable the v1 proxy used — if
// your project named it differently, change the one process.env line).

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const wantStream = body && body.stream === true;

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (wantStream && upstream.ok && upstream.body) {
    // Pipe the SSE bytes through untouched. The client reconstructs the
    // message from the events; nothing here parses or buffers.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "x-myg-proxy": "2",
      },
    });
  }

  // Non-streaming (or upstream error, which arrives as JSON even when
  // stream was requested): return the body as-is with the upstream status.
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json",
      "x-myg-proxy": "2",
    },
  });
}
