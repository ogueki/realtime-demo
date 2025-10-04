// Vercelサーバレス関数: POST /api/session
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  try {
    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-realtime",        // 品質重視。安価にするなら 4o-mini-realtime-preview
        voice: "alloy",
        modalities: ["audio", "text"]
      })
    });
    if (!r.ok) {
      const errTxt = await r.text();
      return res.status(500).json({ error: errTxt });
    }
    const data = await r.json();
    return res.status(200).json({ client_secret: data.client_secret, id: data.id });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}