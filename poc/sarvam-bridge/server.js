require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const http = require("http");
const path = require("path");
const { Readable } = require("stream");
const { WebSocketServer } = require("ws");
const { SarvamAIClient } = require("sarvamai");
const { detectTtsLanguage, customerChannel, makeSampleAligner, STT_CODES, LOCKABLE } = require("./lib");
const { buildAssistant } = require("./assistant");
const { openSlots, book } = require("./tools");
const meter = require("./meter");
const { estimateTokens, newSession, snapshot } = meter;
const { attachLive } = require("./live");

const { SARVAM_API_KEY, BRIDGE_TOKEN, VAPI_PUBLIC_KEY } = process.env;
if (!SARVAM_API_KEY || !BRIDGE_TOKEN) {
  console.error("Set SARVAM_API_KEY and BRIDGE_TOKEN in .env (see .env.example)");
  process.exit(1);
}

// Wait this long after the caller's last phrase before sending the turn to Vapi.
// Any new speech in that window cancels the send, so mid-sentence pauses don't
// trigger a reply.
const MERGE_MS = Number(process.env.MERGE_MS || 500);
const TTS_TEMPERATURE = Number(process.env.TTS_TEMPERATURE || 0.6);
const TTS_PACE = Number(process.env.TTS_PACE || 1.0);

// Bulbul v3 speaker per language. Changeable live from the /voices page.
const voices = {
  "kn-IN": process.env.TTS_SPEAKER_KN || "ishita",
  "te-IN": process.env.TTS_SPEAKER_TE || "ishita",
  "ta-IN": process.env.TTS_SPEAKER_TA || "ishita",
  "hi-IN": process.env.TTS_SPEAKER_HI || "ishita",
  "en-IN": process.env.TTS_SPEAKER_EN || "ishita",
};

const sarvam = new SarvamAIClient({ apiSubscriptionKey: SARVAM_API_KEY });

// Open transcriber sockets, keyed by Vapi call id when the start frame carries one.
// Vapi builds the conversation history from transcripts on BOTH channels. Without
// an "assistant" transcript it never records the AI's replies, so every LLM turn
// sees only the caller's messages and starts over. We already know exactly what the
// AI said (we synthesised it), so we report that text on the assistant channel
// instead of paying to transcribe the AI's own audio.
const transcriberSockets = new Map();

// One usage/cost meter per call. Single-tester PoC: anything that can't be matched to
// a call by id goes to the newest one.
const sessions = [];
let lastConfig = { promptTokens: 0, llm: "openai", lang: "auto" };

function currentSession() {
  return sessions[sessions.length - 1] || null;
}

function sessionFor(callId) {
  return (callId && transcriberSockets.get(callId)?.session) || currentSession();
}

function findSocket(callId) {
  let ws = callId && transcriberSockets.get(callId);
  if (!ws && callId) {
    // Vapi's start frame carries no call id, but voice requests do. The first voice
    // request of a call (the greeting) arrives while exactly one socket is still
    // unclaimed, so claim it for this call id. Keeps parallel calls apart.
    const unclaimed = [...transcriberSockets.entries()].filter(([key, s]) => key.startsWith("anon-") && s.readyState === s.OPEN);
    if (unclaimed.length === 1) {
      const [key, sock] = unclaimed[0];
      transcriberSockets.delete(key);
      transcriberSockets.set(callId, sock);
      sock.callKey = callId;
      if (sock.session) sock.session.callId = callId;
      ws = sock;
      console.log(`BIND ${key} -> call ${callId}`);
    }
  }
  return ws && ws.readyState === ws.OPEN ? ws : null;
}

function reportAssistantSpeech(callId, text) {
  const ws = findSocket(callId);
  if (!ws) {
    console.warn(`No transcriber socket for call ${callId || "?"}; assistant text not recorded`);
    return;
  }
  ws.send(JSON.stringify({ type: "transcriber-response", transcription: text, channel: "assistant", transcriptType: "final" }));
}

// Last non-null "usage":{...} object in an SSE tail, found by brace matching.
function extractUsage(text) {
  let found = null;
  let from = 0;
  for (;;) {
    const at = text.indexOf('"usage":', from);
    if (at < 0) break;
    from = at + 8;
    const open = text.indexOf("{", at);
    if (open < 0 || text.slice(at + 8, open).trim() !== "") continue; // "usage":null
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}" && --depth === 0) {
        try { found = JSON.parse(text.slice(open, i + 1)); } catch { /* partial */ }
        break;
      }
    }
  }
  return found;
}

function tokenOk(provided) {
  const a = Buffer.from(String(provided || ""));
  const b = Buffer.from(BRIDGE_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Browser pages. Open them through the public tunnel URL with ?token=BRIDGE_TOKEN
app.get("/test", (req, res) => {
  if (!tokenOk(req.query.token)) return res.status(401).send("unauthorized");
  res.sendFile(path.join(__dirname, "test.html"));
});
app.get("/voices", (req, res) => {
  if (!tokenOk(req.query.token)) return res.status(401).send("unauthorized");
  res.sendFile(path.join(__dirname, "voices.html"));
});

// Voice picker: play a sample, then make it the live voice for that language.
app.get("/api/voices", (req, res) => {
  if (!tokenOk(req.query.token)) return res.status(401).json({ error: "unauthorized" });
  res.json(voices);
});
app.post("/api/voices", (req, res) => {
  if (!tokenOk(req.query.token)) return res.status(401).json({ error: "unauthorized" });
  const { language, speaker } = req.body || {};
  if (!voices[language] || !/^[a-z_]+$/.test(speaker || "")) return res.status(400).json({ error: "bad voice" });
  voices[language] = speaker;
  console.log(`VOICE ${language} -> ${speaker}`);
  res.json(voices);
});
app.get("/api/sample", async (req, res) => {
  if (!tokenOk(req.query.token)) return res.status(401).send("unauthorized");
  const text = String(req.query.text || "").slice(0, 300);
  const speaker = String(req.query.speaker || "");
  if (!text || !/^[a-z_]+$/.test(speaker)) return res.status(400).send("bad request");
  try {
    const r = await sarvam.textToSpeech.convert({
      text,
      model: "bulbul:v3",
      speaker,
      language_code: detectTtsLanguage(text),
      speech_sample_rate: 24000,
      temperature: TTS_TEMPERATURE,
      pace: TTS_PACE,
    });
    res.setHeader("Content-Type", "audio/wav");
    res.end(Buffer.from(r.audios.join(""), "base64"));
  } catch (e) {
    console.error("Sample failed:", e?.message || e);
    res.status(500).send("sample failed");
  }
});

// ---- Mock booking tools (same names/args as Orvia's real ones) -------------------
const bookings = [];
const activity = []; // newest last; the test page polls this to show tool use

function note(kind, text) {
  activity.push({ t: Date.now(), kind, text });
  if (activity.length > 200) activity.shift();
}

// One place that runs a tool, used by the Vapi webhook and the direct pipeline.
function executeTool(name, args, callId) {
  let result;
  if (name === "check_availability") {
    result = openSlots(args.date, bookings);
    note("tool", `check_availability ${args.date} -> ${(result.slots_voice || []).join(", ") || result.message || result.error}`);
  } else if (name === "book_appointment") {
    result = book(args, bookings, callId);
    note(result.success ? "booked" : "tool", result.success ? `Booked ${result.booking.service} for ${result.booking.name}, ${result.booking.when}` : `book_appointment refused: ${result.error}`);
  } else {
    result = { error: `Unknown tool ${name}` };
  }
  console.log(`TOOL ${name}(${JSON.stringify(args)}) -> ${JSON.stringify(result).slice(0, 200)}`);
  return result;
}

app.post("/api/tools/:token", (req, res) => {
  if (!tokenOk(req.params.token)) return res.status(401).json({ error: "unauthorized" });
  const msg = req.body?.message || {};
  const callId = msg.call?.id;
  const list = msg.toolCallList || msg.toolCalls || [];
  const results = list.map((tc) => {
    const name = tc.name || tc.function?.name;
    let args = tc.arguments ?? tc.function?.arguments ?? {};
    if (typeof args === "string") {
      try { args = JSON.parse(args); } catch { args = {}; }
    }
    let result;
    const sess = sessionFor(callId);
    if (sess) {
      sess.toolCalls++;
      if (sess.llm === "openai") {
        // A tool round trip is one more model request carrying the whole history.
        sess.turns++;
        sess.llmIn += sess.promptTokens + sess.historyTokens;
        sess.llmOut += 30;
      }
    }
    result = executeTool(name, args, callId);
    return { toolCallId: tc.id, name, result: JSON.stringify(result) };
  });
  res.json({ results });
});

app.get("/api/bookings", (req, res) => {
  if (!tokenOk(req.query.token)) return res.status(401).json({ error: "unauthorized" });
  res.json({ bookings, activity: activity.filter((a) => a.t > Number(req.query.since || 0)) });
});
app.delete("/api/bookings", (req, res) => {
  if (!tokenOk(req.query.token)) return res.status(401).json({ error: "unauthorized" });
  bookings.length = 0;
  activity.length = 0;
  res.json({ ok: true });
});

// Vapi posts the end-of-call report here: its own cost breakdown, which we show
// next to our estimate so the estimate can be checked.
app.post("/api/vapi-events/:token", (req, res) => {
  if (!tokenOk(req.params.token)) return res.status(401).json({ error: "unauthorized" });
  const m = req.body?.message || {};
  if (m.type === "end-of-call-report") {
    // Strict match: Vapi also reports calls that never connected, and those must not
    // be charged to whichever call happens to be newest.
    const sess = sessions.find((s) => s.callId && s.callId === m.call?.id);
    const report = {
      cost: m.cost ?? null,
      costBreakdown: m.costBreakdown ?? null,
      endedReason: m.endedReason ?? null,
      durationSeconds: m.durationSeconds ?? (m.durationMinutes != null ? m.durationMinutes * 60 : null),
    };
    if (sess) sess.vapi = report;
    console.log(`VAPI REPORT ${sess ? "matched" : "ignored (no matching call)"} cost=${report.cost} ended=${report.endedReason} breakdown=${JSON.stringify(report.costBreakdown)}`);
  }
  res.json({ ok: true });
});

// What the test page shows: the stack in use, plus usage and cost for the newest call.
app.get("/api/meter", (req, res) => {
  if (!tokenOk(req.query.token)) return res.status(401).json({ error: "unauthorized" });
  res.json({ session: snapshot(currentSession()), voices, rates: meter.RATES, openaiDirect: !!process.env.OPENAI_API_KEY });
});

// Transient assistant for the test page, so no Vapi private key is needed.
// The bridge URLs are derived from the request host, so open /test via the tunnel.
app.get("/api/assistant-config", (req, res) => {
  if (!tokenOk(req.query.token)) return res.status(401).json({ error: "unauthorized" });
  if (!VAPI_PUBLIC_KEY) return res.status(500).json({ error: "VAPI_PUBLIC_KEY not set" });
  const proto = req.get("x-forwarded-proto") || req.protocol;
  const publicUrl = `${proto}://${req.get("x-forwarded-host") || req.get("host")}`;
  try {
    const assistant = buildAssistant({
      lang: String(req.query.lang || "auto"),
      llm: ["sarvam", "sarvam-conv"].includes(req.query.llm) ? req.query.llm : "openai",
      publicUrl,
      token: BRIDGE_TOKEN,
      clinic: process.env.CLINIC_NAME,
    });
    lastConfig = {
      promptTokens: estimateTokens(assistant.model.messages[0].content),
      llm: assistant.model.provider === "custom-llm" ? (String(req.query.llm) === "sarvam" ? "sarvam" : "sarvam-conv") : "openai",
      lang: String(req.query.lang || "auto"),
    };
    res.json({ publicKey: VAPI_PUBLIC_KEY, assistant });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Vapi custom-llm: Vapi POSTs OpenAI-style chat requests to <url>/chat/completions.
// The token rides in the path because Vapi appends the suffix to the URL.
app.post("/llm/:token/chat/completions", async (req, res) => {
  if (!tokenOk(req.params.token)) return res.status(401).json({ error: "unauthorized" });
  const started = Date.now();
  try {
    // Sarvam models think before answering by default, which adds seconds. Turn it off.
    // The penalties discourage re-saying the same acknowledgement every turn.
    const body = {
      ...req.body,
      stream_options: { include_usage: true },
      reasoning_effort: null,
      frequency_penalty: 0.1,
    };
    const upstream = await fetch("https://api.sarvam.ai/v1/chat/completions", {
      method: "POST",
      headers: { "api-subscription-key": SARVAM_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    console.log(`LLM ${body.model} -> ${upstream.status} after ${Date.now() - started}ms`);
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    if (!upstream.ok) {
      const text = await upstream.text();
      console.error("LLM error body:", text.slice(0, 300));
      return res.end(text);
    }
    // Forward the stream untouched while watching for the usage block Sarvam appends.
    const sess = currentSession();
    if (sess) sess.turns++;
    let tail = "";
    for await (const chunk of Readable.fromWeb(upstream.body)) {
      res.write(chunk);
      tail = (tail + chunk.toString("utf8")).slice(-4000);
    }
    res.end();
    const u = extractUsage(tail);
    if (u && sess) {
      sess.llmIn += u.prompt_tokens || 0;
      sess.llmOut += u.completion_tokens || 0;
    }
  } catch (err) {
    console.error("LLM proxy failed:", err?.message || err);
    if (!res.headersSent) res.status(500).json({ error: "LLM proxy failed" });
  }
});

// Vapi custom-voice: POST { message: { type: "voice-request", text, sampleRate } }
// Reply: raw headerless 16-bit mono PCM at message.sampleRate, streamed as it is
// generated so the caller hears the first syllable in ~0.2-0.4s, not after the whole
// sentence is rendered.
app.post("/api/synthesize", async (req, res) => {
  if (!tokenOk(req.query.token)) return res.status(401).json({ error: "unauthorized" });
  const { message } = req.body || {};
  if (message?.type !== "voice-request" || !message.text) {
    return res.status(400).json({ error: "Expected a voice-request with text" });
  }
  const started = Date.now();
  const language = detectTtsLanguage(message.text);
  const speaker = voices[language] || voices["en-IN"];
  try {
    const resp = await sarvam.textToSpeech.convertStream({
      text: message.text,
      model: "bulbul:v3",
      language_code: language,
      speaker,
      speech_sample_rate: message.sampleRate,
      output_audio_codec: "linear16",
      enable_preprocessing: true,
      temperature: TTS_TEMPERATURE,
      pace: TTS_PACE,
    });
    const stream = typeof resp.stream === "function" ? resp.stream() : resp;
    const align = makeSampleAligner();
    let first = null;
    let bytes = 0;
    res.setHeader("Content-Type", "application/octet-stream");
    for await (const chunk of stream) {
      const pcm = align(chunk);
      if (!pcm.length) continue;
      if (first === null) first = Date.now() - started;
      bytes += pcm.length;
      res.write(pcm);
    }
    res.end();
    console.log(`TTS ${language}/${speaker} first ${first}ms, ${bytes}B in ${Date.now() - started}ms: ${message.text}`);
    reportAssistantSpeech(message.call?.id, message.text);
    const sess = sessionFor(message.call?.id);
    if (sess) {
      sess.ttsChars += message.text.length;
      sess.ttsRequests++;
      sess.speakers[language] = speaker;
      if (sess.llm === "openai") {
        const t = estimateTokens(message.text);
        sess.llmOut += t;
        sess.historyTokens += t;
      }
    }
  } catch (err) {
    console.error("TTS failed:", err?.statusCode || "", err?.message || err);
    if (!res.headersSent) res.status(500).json({ error: "TTS failed" });
    else res.end();
  }
});

// Vapi custom-transcriber: WebSocket. Text frame {type:"start",sampleRate,...}, then
// binary stereo PCM. We answer with {type:"transcriber-response", ...} frames.
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const liveWss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");
  if (!tokenOk(url.searchParams.get("token"))) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    return socket.destroy();
  }
  if (url.pathname === "/api/live") {
    const query = Object.fromEntries(url.searchParams);
    return liveWss.handleUpgrade(req, socket, head, (ws) =>
      attachLive(ws, query, {
        sarvam,
        cfg: { sarvamKey: SARVAM_API_KEY, openaiKey: process.env.OPENAI_API_KEY || "", mergeMs: MERGE_MS, ttsTemperature: TTS_TEMPERATURE, ttsPace: TTS_PACE },
        voices,
        detectTtsLanguage,
        makeSampleAligner,
        buildAssistant,
        executeTool,
        meter,
        sessions,
        STT_CODES,
        LOCKABLE,
      }),
    );
  }
  if (url.pathname !== "/api/custom-transcriber") {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    return socket.destroy();
  }
  // A picked language pins STT to it. "auto" detects, then locks (see below).
  const lang = STT_CODES[url.searchParams.get("lang")] || "unknown";
  const llmParam = url.searchParams.get("llm");
  const llm = ["sarvam", "sarvam-conv"].includes(llmParam) ? llmParam : "openai";
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, lang, llm, url.searchParams.get("lang") || "auto"));
});

wss.on("connection", (ws, initialLanguage, llm, langParam) => {
  console.log(`Vapi connected to custom transcriber (STT ${initialLanguage})`);
  let stt = null;
  let language = initialLanguage;
  let sampleRate = 16000;
  let speaking = false;
  let buffered = [];
  let flushTimer = null;
  const pending = [];

  let maxWaitTimer = null;

  function flush(force = false) {
    if (!buffered.length || (speaking && !force) || ws.readyState !== ws.OPEN) return;
    clearTimeout(flushTimer);
    clearTimeout(maxWaitTimer);
    maxWaitTimer = null;
    const transcription = buffered.join(" ");
    buffered = [];
    console.log(`TURN: ${transcription}`);
    const sess = ws.session;
    if (sess) {
      sess.turns += sess.llm === "openai" ? 1 : 0; // Sarvam turns are counted in the LLM proxy
      if (sess.llm === "openai") {
        sess.llmIn += sess.promptTokens + sess.historyTokens;
        sess.llmOut += 0;
      }
      sess.historyTokens += estimateTokens(transcription);
    }
    ws.send(JSON.stringify({ type: "transcriber-response", transcription, channel: "customer", transcriptType: "final" }));
  }

  function scheduleFlush() {
    clearTimeout(flushTimer);
    if (!speaking) flushTimer = setTimeout(flush, MERGE_MS);
  }

  function send(pcm) {
    try {
      stt.transcribe({ audio: pcm.toString("base64"), sample_rate: sampleRate, encoding: "audio/wav" });
    } catch (e) {
      console.error("STT send failed:", e?.message || e);
    }
  }

  async function openStt(code) {
    const socket = await sarvam.speechToTextStreaming.connect({
      model: "saaras:v4",
      mode: "transcribe",
      "language-code": code,
      sample_rate: sampleRate,
      input_audio_codec: "pcm_s16le",
      high_vad_sensitivity: "true",
      vad_signals: "true",
    });
    socket.on("message", (m) => {
      if (socket !== stt) return; // a socket we've already swapped out
      if (m.type === "events") {
        const signal = m.data?.signal_type;
        if (signal === "START_SPEECH") {
          speaking = true;
          clearTimeout(flushTimer);
        } else if (signal === "END_SPEECH") {
          speaking = false;
          scheduleFlush();
        }
        return;
      }
      if (m.type === "data" && m.data?.transcript) {
        const detected = m.data.language_code;
        console.log(`STT (${detected || "?"}): ${m.data.transcript}`);
        buffered.push(m.data.transcript);
        scheduleFlush();
        // Safety net in case an END_SPEECH signal never arrives.
        if (!maxWaitTimer) maxWaitTimer = setTimeout(() => flush(true), 4000);
        maybeLock(detected, m.data.transcript);
      }
    });
    socket.on("error", (e) => console.error("Sarvam STT error:", e?.message || e));
    await socket.waitForOpen();
    return socket;
  }

  // Auto mode: short phrases get mis-detected ("பல் வலி" heard as English "Pallavi").
  // Once a real sentence comes in an Indian language, pin STT to it for the rest of
  // the call. Saaras still transcribes English words mixed into that language.
  let locking = false;
  function maybeLock(detected, text) {
    if (language !== "unknown" || locking || !LOCKABLE.has(detected)) return;
    if (text.trim().split(/\s+/).length < 2) return;
    locking = true;
    openStt(detected)
      .then((socket) => {
        const old = stt;
        stt = socket;
        language = detected;
        console.log(`STT locked to ${detected}`);
        try { old?.close(); } catch { /* already closed */ }
      })
      .catch((e) => console.error("STT lock failed:", e?.message || e))
      .finally(() => { locking = false; });
  }

  ws.on("message", (data, isBinary) => {
    if (!isBinary) {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "start") {
          sampleRate = msg.sampleRate || 16000;
          ws.callKey = msg.call?.id || `anon-${crypto.randomUUID()}`;
          transcriberSockets.set(ws.callKey, ws);
          ws.session = newSession({ llm, lang: langParam, promptTokens: lastConfig.promptTokens });
          if (msg.call?.id) ws.session.callId = msg.call.id;
          sessions.push(ws.session);
          if (sessions.length > 20) sessions.shift();
          openStt(language)
            .then((socket) => {
              stt = socket;
              for (const chunk of pending.splice(0)) send(chunk);
            })
            .catch((e) => {
              console.error("STT startup failed:", e?.message || e);
              ws.close(1011, "Transcriber startup failed");
            });
        }
      } catch {
        /* ignore non-JSON control frames */
      }
      return;
    }
    const pcm = customerChannel(data);
    if (ws.session) ws.session.sttSeconds += pcm.length / 2 / sampleRate;
    if (stt) send(pcm);
    else pending.push(pcm);
  });

  ws.on("error", (e) => console.error("WS error:", e?.message || e));
  ws.on("close", () => {
    console.log("Vapi disconnected");
    if (ws.session) ws.session.endedAt = Date.now();
    if (ws.callKey && transcriberSockets.get(ws.callKey) === ws) transcriberSockets.delete(ws.callKey);
    clearTimeout(flushTimer);
    clearTimeout(maxWaitTimer);
    try { stt?.close(); } catch { /* already closed */ }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Sarvam bridge on :${PORT} (voices ${JSON.stringify(voices)})`));
