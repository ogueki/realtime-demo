// public/app.js
const btnConnect = document.getElementById("btnConnect");
const btnDisconnect = document.getElementById("btnDisconnect");
const btnMute = document.getElementById("btnMute");
const voiceSelect = document.getElementById("voiceSelect");
const btnSpeak = document.getElementById("btnSpeak");
const remoteAudio = document.getElementById("remoteAudio");
const youText = document.getElementById("youText");
const botText = document.getElementById("botText");
const logEl = document.getElementById("log");

let pc;
let micStream;
let micTrack;
let dataChannel;
let isMuted = false;
let currentVoice = "alloy";
let sender;

voiceSelect.onchange = () => { currentVoice = voiceSelect.value; };

function log(...args) {
  const s = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  logEl.textContent += s + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

async function fetchSessionToken() {
  // Vercel本番のみを想定：同一オリジンで /api/session を叩く
  const res = await fetch("/api/session", { method: "POST" });
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("application/json") ? await res.json()
                                               : { error: await res.text() };
  if (!res.ok) throw new Error(body.error || "session error");
  const token = body?.client_secret?.value;
  if (!token) throw new Error("no client token");
  return token;
}

async function createPeerConnection(clientToken) {
  pc = new RTCPeerConnection();

  // 受信音声
  const inboundStream = new MediaStream();
  pc.ontrack = (e) => {
    inboundStream.addTrack(e.track);
    remoteAudio.srcObject = inboundStream;
  };

  // マイク取得＆送信
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  micTrack = micStream.getAudioTracks()[0];
  sender = pc.addTrack(micTrack, micStream);
  pc.addTransceiver("audio", { direction: "sendrecv" });

  // データチャネル（テキストイベント用）
  dataChannel = pc.createDataChannel("oai-events");
  dataChannel.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === "transcript.delta") {
        youText.textContent = msg.delta;
      }
      if (msg.type === "response.output_text.delta" || msg.type === "response.delta") {
        botText.textContent += msg.delta;
      }
      if (msg.type === "response.completed") log("response completed");
    } catch {/* バイナリ等は無視 */}
  };

  // SDP交換
  const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
  await pc.setLocalDescription(offer);

  const r = await fetch("https://api.openai.com/v1/realtime?model=gpt-realtime", {
    method: "POST",
    body: offer.sdp,
    headers: {
      "Authorization": `Bearer ${clientToken}`,
      "Content-Type": "application/sdp"
    }
  });

  const answerSDP = await r.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answerSDP });

  dataChannel.onopen = () => {
    // 初期はテキストのみ（静かに起動）
    dataChannel.send(JSON.stringify({
      type: "response.create",
      response: {
        instructions: "日本語で丁寧かつ簡潔に。必要時のみ音声で答える。",
        modalities: ["text"]
      }
    }));
    btnSpeak.disabled = false;
  };
}

async function connect() {
  try {
    const clientToken = await fetchSessionToken();
    await createPeerConnection(clientToken);

    btnConnect.disabled = true;
    btnDisconnect.disabled = false;
    btnMute.disabled = false;
    btnSpeak.disabled = false;
    botText.textContent = "";
    youText.textContent = "（話しかけてください）";
    log("connected");
  } catch (e) {
    log("connect error:", e.message || e);
  }
}

function disconnect() {
  try {
    if (dataChannel?.readyState === "open") {
      dataChannel.send(JSON.stringify({ type: "response.cancel" }));
      dataChannel.close();
    }
  } catch {}
  try { if (micStream) micStream.getTracks().forEach(t => t.stop()); } catch {}
  try { if (pc) pc.close(); } catch {}
  btnConnect.disabled = false;
  btnDisconnect.disabled = true;
  btnMute.disabled = true;
  btnSpeak.disabled = true;
  log("disconnected");
}

function toggleMute() {
  if (!micTrack) return;
  isMuted = !isMuted;
  micTrack.enabled = !isMuted;
  btnMute.textContent = isMuted ? "ミュート解除" : "ミュート";
}

// 音声確認（選択中ボイスで短く発話）
function speakBriefly(inst = "いま選択されている声で、1〜2文だけ挨拶してください。") {
  if (dataChannel?.readyState !== "open") return;
  dataChannel.send(JSON.stringify({
    type: "response.create",
    response: {
      instructions: inst,
      modalities: ["audio", "text"],
      voice: currentVoice
    }
  }));
}

btnConnect.onclick = connect;
btnDisconnect.onclick = disconnect;
btnMute.onclick = toggleMute;
btnSpeak.onclick = () => speakBriefly();
