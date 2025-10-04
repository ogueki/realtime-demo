import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

/**
 * フロントから呼ばれるエンドポイント。
 * OpenAIに「Realtime用の短命セッション」を作ってもらい、
 * その client_secret（数分で失効）を返します。
 *
 * 公式: /v1/realtime/sessions に POST（WebRTC用） 
 */
app.post("/session", async (req, res) => {
  try {
    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        // model: "gpt-4o-mini-realtime-preview",
        model: "gpt-realtime",
        voice: "marin",
        modalities: ["audio", "text"]
      })
    });

    if (!r.ok) {
      const errTxt = await r.text();
      return res.status(500).json({ error: errTxt });
    }
    const data = await r.json();
    // data.client_secret.value がフロントからのWebRTC接続で使うトークン
    res.json({ client_secret: data.client_secret, id: data.id });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

const port = process.env.PORT || 5173;
app.listen(port, () => {
  console.log(`Server running: http://localhost:${port}`);
});
