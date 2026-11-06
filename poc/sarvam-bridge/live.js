// Direct voice pipeline, no Vapi: browser mic -> Sarvam STT -> LLM (+tools) -> Sarvam TTS -> browser.
//
// Browser protocol (one WebSocket):
//   client -> server  text   {type:"start"}            begin the call (greeting plays)
//                     binary raw PCM16 mono, 16 kHz     microphone audio
//   server -> client  binary raw PCM16 mono, 24 kHz     the assistant's voice
//                     text   {type:"transcript", role, text}
//                            {type:"state", state:"thinking"}
//                            {type:"clear"}              caller interrupted, drop queued audio
//                            {type:"latency", ms, waitMs, brainMs, voiceMs}
//                            {type:"ended"} | {type:"error", message}

const { streamChat } = require("./llm");
const { makeSplitter, speakable } = require("./sentences");
const { digitsPending } = require("./lib");

const MIC_RATE = 16000;
const OUT_RATE = 24000;
const MAX_TOOL_ROUNDS = 4;
const ASKS_FOR_NUMBER = /number|phone|mobile|contact|நம்பர்|எண்|மொபைல்|नंबर|नम्बर|मोबाइल|ನಂಬರ್|ನಂಬರ|ಮೊಬೈಲ್|నంబర్|నంబరు|మొబైల్/i;

function providerFor(llm, cfg) {
  if (llm === "openai") {
    if (!cfg.openaiKey) throw new Error("GPT-4o without Vapi needs OPENAI_API_KEY in the bridge .env. Pick a Sarvam brain, or add the key.");
    return {
      url: "https://api.openai.com/v1/chat/completions",
      headers: { Authorization: `Bearer ${cfg.openaiKey}` },
      model: "gpt-4o",
      extra: { temperature: 0.5, max_tokens: 200 },
    };
  }
  return {
    url: "https://api.sarvam.ai/v1/chat/completions",
    headers: { "api-subscription-key": cfg.sarvamKey },
    model: llm === "sarvam" ? "sarvam-105b" : "sarvam-105b-conversations",
    // Thinking off (adds seconds). Keep the repetition penalty small: at 0.4 the model
    // started reaching for words from other languages to avoid repeating Tamil ones.
    extra: { temperature: 0.5, max_tokens: 200, reasoning_effort: null, frequency_penalty: 0.1 },
  };
}

// Sarvam STT with voice-activity events. Phrases are merged into one caller turn once
// they have been quiet for mergeMs. In auto mode, STT pins to the caller's language
// after their first real sentence, because short openers are often misheard.
function createListener({ sarvam, language, lockable, mergeMs: initialMergeMs, onTurn, onSpeechStart, onSpeechEnd, onAudioSeconds }) {
  let lang = language;
  let mergeMs = initialMergeMs;
  let stt = null;
  let speaking = false;
  let buffered = [];
  let flushTimer = null;
  let maxWait = null;
  let locking = false;
  const pending = [];
  let closed = false;

  function flush(force) {
    if (!buffered.length || (speaking && !force)) return;
    clearTimeout(flushTimer);
    clearTimeout(maxWait);
    maxWait = null;
    const text = buffered.join(" ");
    buffered = [];
    onTurn(text);
  }
  const schedule = () => {
    clearTimeout(flushTimer);
    const wait = digitsPending(buffered.join(" ")) ? Math.max(mergeMs, 2300) : mergeMs;
    if (!speaking) flushTimer = setTimeout(() => flush(false), wait);
  };

  function send(socket, pcm) {
    try {
      socket.transcribe({ audio: pcm.toString("base64"), sample_rate: MIC_RATE, encoding: "audio/wav" });
    } catch (e) {
      console.error("STT send failed:", e.message);
    }
  }

  async function open(code) {
    const socket = await sarvam.speechToTextStreaming.connect({
      model: "saaras:v4",
      mode: "transcribe",
      "language-code": code,
      sample_rate: MIC_RATE,
      input_audio_codec: "pcm_s16le",
      high_vad_sensitivity: "true",
      vad_signals: "true",
    });
    socket.on("message", (m) => {
      if (socket !== stt) return;
      if (m.type === "events") {
        const sig = m.data && m.data.signal_type;
        if (sig === "START_SPEECH") {
          speaking = true;
          clearTimeout(flushTimer);
          onSpeechStart();
        } else if (sig === "END_SPEECH") {
          speaking = false;
          onSpeechEnd();
          schedule();
        }
      } else if (m.type === "data" && m.data && m.data.transcript) {
        const detected = m.data.language_code;
        console.log(`LIVE STT (${detected || "?"}): ${m.data.transcript}`);
        buffered.push(m.data.transcript);
        schedule();
        if (!maxWait) maxWait = setTimeout(() => flush(true), 4000); // in case END_SPEECH never comes
        if (lang === "unknown" && !locking && lockable.has(detected) && m.data.transcript.trim().split(/\s+/).length >= 2) {
          locking = true;
          open(detected)
            .then((next) => {
              const old = stt;
              stt = next;
              lang = detected;
              console.log(`LIVE STT locked to ${detected}`);
              try { old && old.close(); } catch { /* closed */ }
            })
            .catch((e) => console.error("STT lock failed:", e.message))
            .finally(() => { locking = false; });
        }
      }
    });
    socket.on("error", (e) => console.error("Sarvam STT error:", e.message || e));
    await socket.waitForOpen();
    return socket;
  }

  return {
    async start() {
      stt = await open(lang);
      for (const chunk of pending.splice(0)) send(stt, chunk);
    },
    write(pcm) {
      onAudioSeconds(pcm.length / 2 / MIC_RATE);
      if (stt) send(stt, pcm);
      else pending.push(pcm);
    },
    close() {
      closed = true;
      clearTimeout(flushTimer);
      clearTimeout(maxWait);
      try { stt && stt.close(); } catch { /* closed */ }
    },
    setMergeMs(ms) { mergeMs = ms; },
    get closed() { return closed; },
  };
}

function attachLive(ws, query, deps) {
  const { sarvam, cfg, voices, detectTtsLanguage, makeSampleAligner, buildAssistant, executeTool, meter, sessions, STT_CODES, LOCKABLE } = deps;
  const lang = String(query.lang || "auto");
  const llm = ["openai", "sarvam", "sarvam-conv"].includes(query.llm) ? query.llm : "sarvam-conv";
  const send = (obj) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(obj));
  const fail = (message) => { send({ type: "error", message }); ws.close(); };

  let provider;
  let assistant;
  try {
    provider = providerFor(llm, cfg);
    assistant = buildAssistant({ lang, publicUrl: "http://direct", token: "direct", llm: llm === "openai" ? "openai" : "sarvam" });
  } catch (e) {
    return fail(e.message);
  }

  const systemPrompt = assistant.model.messages[0].content;
  const tools = assistant.model.tools.map((t) => ({ type: "function", function: t.function }));
  const messages = [{ role: "system", content: systemPrompt }];

  const sess = meter.newSession({
    llm, lang, direct: true,
    promptTokens: meter.estimateTokens(systemPrompt),
  });
  sessions.push(sess);
  if (sessions.length > 20) sessions.shift();

  // ---- audio out ------------------------------------------------------------
  let gen = 0; // bumps on every new reply and every interruption
  let audioEndsAt = 0; // when the browser will finish playing what we sent
  let ttsChain = Promise.resolve();
  let lastSpeechEndAt = 0;
  let marks = null; // timing of the reply in progress

  const aiSpeaking = () => Date.now() < audioEndsAt;

  async function speak(text, myGen) {
    if (myGen !== gen) return;
    const clean = speakable(text);
    if (!clean) return;
    send({ type: "transcript", role: "assistant", text: clean });
    const language = detectTtsLanguage(clean);
    const speaker = voices[language] || voices["en-IN"];
    const align = makeSampleAligner();
    try {
      const resp = await sarvam.textToSpeech.convertStream({
        text: clean,
        model: "bulbul:v3",
        language_code: language,
        speaker,
        speech_sample_rate: OUT_RATE,
        output_audio_codec: "linear16",
        enable_preprocessing: true, // says 6:30 PM and English words properly
        temperature: cfg.ttsTemperature,
        pace: cfg.ttsPace,
      });
      const stream = typeof resp.stream === "function" ? resp.stream() : resp;
      for await (const chunk of stream) {
        if (myGen !== gen) return; // interrupted: stop sending
        const pcm = align(chunk);
        if (!pcm.length || ws.readyState !== ws.OPEN) continue;
        if (marks && !marks.audioAt) {
          marks.audioAt = Date.now();
          const base = lastSpeechEndAt || marks.turnAt;
          send({
            type: "latency",
            ms: Math.max(0, marks.audioAt - base),
            waitMs: Math.max(0, marks.turnAt - base),
            brainMs: (marks.sentenceAt || marks.audioAt) - marks.turnAt,
            voiceMs: marks.audioAt - (marks.sentenceAt || marks.audioAt),
          });
        }
        ws.send(pcm);
        audioEndsAt = Math.max(audioEndsAt, Date.now()) + (pcm.length / 2 / OUT_RATE) * 1000;
      }
      sess.ttsChars += clean.length;
      sess.ttsRequests++;
      sess.speakers[language] = speaker;
    } catch (e) {
      console.error("LIVE TTS failed:", e.message);
      send({ type: "error", message: "Voice failed: " + e.message });
    }
  }

  function interrupt() {
    gen++;
    audioEndsAt = 0;
    send({ type: "clear" });
    if (abort) abort.abort();
  }

  // ---- the reply loop ---------------------------------------------------------
  let abort = null;

  async function respond() {
    const myGen = ++gen;
    abort = new AbortController();
    const signal = abort.signal;
    marks = { turnAt: Date.now(), sentenceAt: 0, audioAt: 0 };
    send({ type: "state", state: "thinking" });
    let spoken = "";

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const splitter = makeSplitter((sentence) => {
          if (myGen !== gen) return;
          if (!marks.sentenceAt) marks.sentenceAt = Date.now();
          spoken += (spoken ? " " : "") + sentence;
          ttsChain = ttsChain.then(() => speak(sentence, myGen));
        });
        const out = await streamChat({
          url: provider.url,
          headers: provider.headers,
          body: { ...provider.extra, model: provider.model, messages, tools },
          signal,
          onText: (t) => myGen === gen && splitter.push(t),
        });
        splitter.flush();
        sess.turns++;
        if (out.usage) {
          sess.llmIn += out.usage.prompt_tokens || 0;
          sess.llmOut += out.usage.completion_tokens || 0;
        }
        if (myGen !== gen) return;

        if (!out.toolCalls.length) {
          if (out.text) messages.push({ role: "assistant", content: out.text });
          break;
        }
        messages.push({
          role: "assistant",
          content: out.text || null,
          tool_calls: out.toolCalls.map((c, i) => ({ id: c.id || `call_${round}_${i}`, type: "function", function: { name: c.name, arguments: c.arguments || "{}" } })),
        });
        for (const [i, c] of out.toolCalls.entries()) {
          let args = {};
          try { args = JSON.parse(c.arguments || "{}"); } catch { /* model sent bad JSON, run with no args */ }
          sess.toolCalls++;
          const result = executeTool(c.name, args, "direct");
          messages.push({ role: "tool", tool_call_id: c.id || `call_${round}_${i}`, content: JSON.stringify(result) });
        }
      }
      await ttsChain;
      // Phone numbers are dictated in chunks with pauses; wait longer for them.
      if (myGen === gen) listener.setMergeMs(ASKS_FOR_NUMBER.test(spoken) ? cfg.mergeMs * 4.5 : cfg.mergeMs);
      if (myGen === gen && /bye bye/i.test(spoken)) {
        setTimeout(() => { send({ type: "ended" }); ws.close(); }, Math.max(0, audioEndsAt - Date.now()) + 300);
      }
    } catch (e) {
      if (e.name === "AbortError" || myGen !== gen) return; // interrupted on purpose
      console.error("LIVE reply failed:", e.message);
      send({ type: "error", message: e.message });
    }
  }

  // ---- listening --------------------------------------------------------------
  let bargeTimer = null;
  const listener = createListener({
    sarvam,
    language: STT_CODES[lang] || "unknown",
    lockable: LOCKABLE,
    mergeMs: cfg.mergeMs,
    onAudioSeconds: (s) => { sess.sttSeconds += s; },
    onSpeechStart: () => {
      // Echo blips are short, real interruptions last: only cut the assistant off
      // if the caller is still talking after a moment.
      if (aiSpeaking()) {
        clearTimeout(bargeTimer);
        bargeTimer = setTimeout(() => { console.log("LIVE barge-in"); interrupt(); }, 350);
      }
    },
    onSpeechEnd: () => {
      lastSpeechEndAt = Date.now();
      clearTimeout(bargeTimer);
    },
    onTurn: (text) => {
      console.log(`LIVE TURN: ${text}`);
      if (aiSpeaking() || abort) interrupt();
      messages.push({ role: "user", content: text });
      send({ type: "transcript", role: "user", text });
      respond();
    },
  });

  let started = false;
  ws.on("message", async (data, isBinary) => {
    if (isBinary) {
      if (started) listener.write(Buffer.from(data));
      return;
    }
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.type === "start" && !started) {
      started = true;
      try {
        await listener.start();
      } catch (e) {
        return fail("Could not start listening: " + e.message);
      }
      // Greeting goes through the same path as any reply.
      messages.push({ role: "assistant", content: assistant.firstMessage });
      const myGen = ++gen;
      marks = { turnAt: Date.now(), sentenceAt: Date.now(), audioAt: 0 };
      ttsChain = ttsChain.then(() => speak(assistant.firstMessage, myGen));
    }
  });

  ws.on("close", () => {
    sess.endedAt = Date.now();
    clearTimeout(bargeTimer);
    gen++;
    if (abort) abort.abort();
    listener.close();
  });
  ws.on("error", (e) => console.error("LIVE ws error:", e.message));
}

module.exports = { attachLive, providerFor };
