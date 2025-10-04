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
const timerText = document.getElementById("timerText");

let pc, micStream, micTrack, dataChannel, sender;
let isMuted = false;
let currentVoice = "cedar";           // 初期ボイス
let isDisconnecting = false;

// === 自動切断設定 ===
const MAX_SESSION_MS = 60_000;        // 60秒で強制切断
const WARN_BEFORE_MS = 10_000;        // 残り10秒で警告
let sessionTimeout, warnTimeout, countdownInterval, sessionStartedAt;
// ====================

voiceSelect.onchange = () => { currentVoice = voiceSelect.value; };

function log(...args) {
  const s = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  logEl.textContent += s + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

async function fetchSessionToken() {
  const res = await fetch("/api/session", { method: "POST" });
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("application/json") ? await res.json() : { error: await res.text() };
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

  // マイク送信
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  micTrack = micStream.getAudioTracks()[0];
  sender = pc.addTrack(micTrack, micStream);
  pc.addTransceiver("audio", { direction: "sendrecv" });

  // データチャネル
  dataChannel = pc.createDataChannel("oai-events");
  dataChannel.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === "transcript.delta") youText.textContent = msg.delta;
      if (msg.type === "response.output_text.delta" || msg.type === "response.delta")
        botText.textContent += msg.delta;
      if (msg.type === "response.completed") log("response completed");
    } catch {}
  };

  // SDP交換
  const offer = await pc.createOffer({ offerToReceiveAudio: true });
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
    // 初回はテキストのみ（静かに起動）
    dataChannel.send(JSON.stringify({
      type: "response.create",
      response: { instructions: "日本語で丁寧かつ簡潔に。必要時のみ音声で答える。", modalities: ["text"] }
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
    startSessionTimer();             // ← 60秒タイマー開始
  } catch (e) {
    log("connect error:", e.message || e);
  }
}

function disconnect() { cleanupSession("disconnected"); }

function toggleMute() {
  if (!micTrack) return;
  isMuted = !isMuted;
  micTrack.enabled = !isMuted;
  btnMute.textContent = isMuted ? "ミュート解除" : "ミュート";
}

// 選択中ボイスで短く発話してもらう
function speakBriefly(inst = "いま選択されている声で、1〜2文だけ挨拶してください。") {
  if (dataChannel?.readyState !== "open") return;
  dataChannel.send(JSON.stringify({
    type: "response.create",
    response: { instructions: inst, modalities: ["audio", "text"], voice: currentVoice }
  }));
}

// ===== 自動切断 =====
function startSessionTimer() {
  clearSessionTimer();
  isDisconnecting = false;
  sessionStartedAt = Date.now();

  sessionTimeout = setTimeout(() => forceDisconnect("Auto-disconnect: 60s reached"), MAX_SESSION_MS);
  warnTimeout = setTimeout(() => log("⚠️ Auto-disconnect in 10s"), MAX_SESSION_MS - WARN_BEFORE_MS);

  countdownInterval = setInterval(() => {
    const remain = Math.max(0, MAX_SESSION_MS - (Date.now() - sessionStartedAt));
    if (timerText) timerText.textContent = `残り ${Math.ceil(remain / 1000)} 秒`;
    if (remain <= 0) clearInterval(countdownInterval);
  }, 250);
}

function clearSessionTimer() {
  clearTimeout(sessionTimeout);
  clearTimeout(warnTimeout);
  clearInterval(countdownInterval);
  sessionTimeout = warnTimeout = countdownInterval = null;
  if (timerText) timerText.textContent = "";
}

function forceDisconnect(reason = "Auto-disconnect") {
  if (isDisconnecting) return;
  isDisconnecting = true;
  try { if (dataChannel?.readyState === "open") dataChannel.send(JSON.stringify({ type: "response.cancel" })); } catch {}
  log(reason);
  cleanupSession("auto-disconnected");
}

function cleanupSession(label = "disconnected") {
  clearSessionTimer();
  try { if (dataChannel?.readyState === "open") dataChannel.close(); } catch {}
  try { if (micStream) micStream.getTracks().forEach(t => t.stop()); } catch {}
  try { if (pc) pc.close(); } catch {}
  btnConnect.disabled = false;
  btnDisconnect.disabled = true;
  btnMute.disabled = true;
  btnSpeak.disabled = true;
  log(label);
}
// =====================

btnConnect.onclick = connect;
btnDisconnect.onclick = disconnect;
btnMute.onclick = toggleMute;
btnSpeak.onclick = () => speakBriefly();

window.addEventListener("beforeunload", () => {
  try { if (dataChannel?.readyState === "open") dataChannel.send(JSON.stringify({ type: "response.cancel" })); } catch {}
});
