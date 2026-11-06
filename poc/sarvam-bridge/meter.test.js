const test = require("node:test");
const assert = require("node:assert");
const { newSession, snapshot, estimateTokens } = require("./meter");

test("Sarvam-only call: costs follow the published rates", () => {
  const s = newSession({ llm: "sarvam", lang: "ta", speakers: { "ta-IN": "ishita" }, promptTokens: 800 });
  s.endedAt = s.startedAt + 60_000; // one minute
  s.sttSeconds = 60; // ₹30/hour -> ₹0.50
  s.ttsChars = 1000; // ₹3 per 1000
  s.llmIn = 1_000_000; // ₹29.28
  s.llmOut = 1_000_000; // ₹73.20
  const snap = snapshot(s);
  const by = Object.fromEntries(snap.lines.map((l) => [l.key, l.inr]));
  assert.equal(by.stt, 0.5);
  assert.equal(by.tts, 3);
  assert.equal(by.llm, 102.48);
  assert.equal(by.line, 4.4); // $0.05 * 88
  assert.equal(snap.totalInr, 110.38);
  assert.equal(snap.live, false);
});

test("GPT-4o tokens switch to Vapi's numbers once the report arrives", () => {
  const s = newSession({ llm: "openai", lang: "auto", promptTokens: 800 });
  s.llmIn = 5000;
  s.llmOut = 500;
  assert.equal(snapshot(s).lines.find((l) => l.key === "llm").basis, "estimated");
  s.endedAt = s.startedAt + 1000;
  s.vapi = { cost: 0.07, costBreakdown: { llmPromptTokens: 12000, llmCompletionTokens: 600, llm: 0.036 } };
  const llm = snapshot(s).lines.find((l) => l.key === "llm");
  assert.equal(llm.basis, "reported by Vapi");
  assert.match(llm.usage, /12,000 in \/ 600 out/);
});

test("token estimate weights Indic script above Latin", () => {
  assert.ok(estimateTokens("வணக்கம் நண்பா") > estimateTokens("hello friend"));
});
