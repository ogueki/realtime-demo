// api/session.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(405).json({ error: "Method Not Allowed. Use POST /api/session" });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key || !key.trim()) {
    console.error("[/api/session] Missing OPENAI_API_KEY");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(500).json({ error: "Server misconfig: OPENAI_API_KEY is not set in Vercel." });
  }

  try {
    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-realtime",           // 低コストなら gpt-4o-mini-realtime-preview
        voice: "cedar",                  // 初期の声（会話中は前端で上書き可）
        modalities: ["audio", "text"]
      })
    });

    if (!r.ok) {
      const errTxt = await r.text();
      console.error("[/api/session] OpenAI error:", r.status, errTxt);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.status(500).json({ error: `OpenAI API error (${r.status}): ${errTxt}` });
    }

    const data = await r.json();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).json({ client_secret: data.client_secret, id: data.id });
  } catch (e) {
    console.error("[/api/session] Unexpected error:", e);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(500).json({ error: String(e) });
  }
}
