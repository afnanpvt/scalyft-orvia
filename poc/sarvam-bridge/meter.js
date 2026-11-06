// Per-call usage and cost estimate. List prices (checked Oct 2026), no discounts or taxes.
// Override the exchange rate with USD_INR.

const USD_INR = Number(process.env.USD_INR || 88);

const RATES = {
  vapiUsdPerMin: 0.05, // Vapi platform fee, provider costs are billed separately
  sarvamSttInrPerHour: 30, // Saaras, streaming
  sarvamTtsInrPer1kChars: 3, // Bulbul v3
  sarvamLlmInrPerMTok: { in: 29.28, out: 73.2 }, // Sarvam 105B
  gpt4oUsdPerMTok: { in: 2.5, out: 10 }, // OpenAI gpt-4o
};

// Rough token count for a mixed English / Indic string. Indic scripts cost about one
// token per character on GPT-4o; Latin text about one per four. Only used for the
// live GPT-4o estimate, replaced by Vapi's own numbers once the call ends.
function estimateTokens(text) {
  let indic = 0;
  let latin = 0;
  for (const ch of String(text || "")) {
    if (ch.charCodeAt(0) > 0x0900) indic++;
    else latin++;
  }
  return Math.ceil(indic * 0.9 + latin / 4);
}

function newSession({ llm, lang, speakers, promptTokens, direct = false }) {
  return {
    startedAt: Date.now(),
    endedAt: null,
    llm, // "openai" | "sarvam" | "sarvam-conv"
    direct, // true = browser talks to the bridge, no Vapi in the middle
    lang,
    speakers: speakers || {},
    promptTokens: promptTokens || 0,
    sttSeconds: 0,
    ttsChars: 0,
    ttsRequests: 0,
    turns: 0,
    toolCalls: 0,
    historyTokens: 0,
    llmIn: 0, // metered (Sarvam) or estimated (OpenAI)
    llmOut: 0,
    llmBasis: llm !== "openai" || direct ? "metered" : "estimated",
    vapi: null, // end-of-call-report, when it arrives
  };
}

const inr = (n) => Math.round(n * 100) / 100;

function snapshot(s, now = Date.now()) {
  if (!s) return null;
  const secs = Math.max(0, ((s.endedAt || now) - s.startedAt) / 1000);
  const mins = secs / 60;
  const lines = [];

  const vapiFeeInr = inr(mins * RATES.vapiUsdPerMin * USD_INR);
  lines.push(
    s.direct
      ? { key: "line", role: "Phone line", provider: "None", model: "direct browser test", usage: "browser to bridge", inr: 0, basis: "not used" }
      : { key: "line", role: "Phone line", provider: "Vapi", model: "web call", usage: `${Math.round(secs)}s`, inr: vapiFeeInr, basis: "estimated" },
  );
  lines.push({
    key: "stt",
    role: "Listening",
    provider: "Sarvam",
    model: "Saaras v4",
    usage: `${Math.round(s.sttSeconds)}s of audio`,
    inr: inr((s.sttSeconds / 3600) * RATES.sarvamSttInrPerHour),
    basis: "metered",
  });

  let llmIn = s.llmIn;
  let llmOut = s.llmOut;
  let llmBasis = s.llmBasis;
  const v = s.vapi?.costBreakdown;
  if (s.llm === "openai" && v && Number.isFinite(v.llmPromptTokens)) {
    llmIn = v.llmPromptTokens;
    llmOut = v.llmCompletionTokens || 0;
    llmBasis = "reported by Vapi";
  }
  const sarvamBrain = s.llm !== "openai";
  const llmInr =
    sarvamBrain
      ? (llmIn / 1e6) * RATES.sarvamLlmInrPerMTok.in + (llmOut / 1e6) * RATES.sarvamLlmInrPerMTok.out
      : ((llmIn / 1e6) * RATES.gpt4oUsdPerMTok.in + (llmOut / 1e6) * RATES.gpt4oUsdPerMTok.out) * USD_INR;
  lines.push({
    key: "llm",
    role: "Brain",
    provider: sarvamBrain ? "Sarvam" : "OpenAI",
    model: { openai: "gpt-4o", sarvam: "Sarvam 105B", "sarvam-conv": "Sarvam 105B Conversations" }[s.llm] || s.llm,
    usage: `${llmIn.toLocaleString("en-IN")} in / ${llmOut.toLocaleString("en-IN")} out tokens, ${s.turns} turns`,
    inr: inr(llmInr),
    basis: llmBasis,
  });

  const speakerList = [...new Set(Object.values(s.speakers))];
  lines.push({
    key: "tts",
    role: "Voice",
    provider: "Sarvam",
    model: `Bulbul v3${speakerList.length ? ` · ${speakerList.join(", ")}` : ""}`,
    usage: `${s.ttsChars.toLocaleString("en-IN")} characters, ${s.ttsRequests} sentences`,
    inr: inr((s.ttsChars / 1000) * RATES.sarvamTtsInrPer1kChars),
    basis: "metered",
  });

  const totalInr = inr(lines.reduce((a, l) => a + l.inr, 0));
  return {
    live: !s.endedAt,
    seconds: Math.round(secs),
    lines,
    totalInr,
    totalUsd: Math.round((totalInr / USD_INR) * 1000) / 1000,
    perMinInr: mins >= 0.25 ? inr(totalInr / mins) : null,
    direct: !!s.direct,
    withVapiInr: s.direct ? inr(totalInr + vapiFeeInr) : null, // what the same call costs once a phone line is added
    toolCalls: s.toolCalls,
    vapiReport: s.vapi
      ? {
          totalUsd: s.vapi.cost,
          breakdown: s.vapi.costBreakdown || null,
          endedReason: s.vapi.endedReason || null,
          durationSeconds: s.vapi.durationSeconds ?? null,
        }
      : null,
    usdInr: USD_INR,
  };
}

module.exports = { RATES, USD_INR, estimateTokens, newSession, snapshot };
