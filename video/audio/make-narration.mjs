// Voice-only narration for a video. One TTS request for the whole script (the
// free tier allows only ~10 requests a day per model), then the pauses in the
// audio are used to find where each unit starts, so the animation is timed to
// the real voice.
//
//   GEMINI_API_KEY=... node audio/make-narration.mjs <script>     (script: exotic | day)
//
// Writes public/<out>/narration.wav and src/<timing>.json. The key is read
// from the environment only. Add a script to SCRIPTS to make another video.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs"
import { spawnSync } from "node:child_process"

// Each unit is one visual beat. Units end in full stops so the voice pauses.
const SCRIPTS = {
  exotic: {
    out: "vo2", timing: "vo2-timing.json", voice: "Algieba",
    units: [
      "Your phone rings.",
      "Your hands are full.",
      "So the customer calls someone else.",
      "Meet Orvia.",
      "An AI receptionist that answers every call, day and night.",
      "She finds a time, books the job, and updates your calendar, instantly.",
      "Every call is summarized, so you always know what happened.",
      "Plumbing.",
      "Dental.",
      "H V A C.",
      "Real estate.",
      "Whatever you run, she fits in.",
      "Hear her for yourself.",
      "Try the live demo, no signup.",
    ],
  },
  day: {
    out: "vo-day", timing: "vo-day-timing.json", voice: "Sulafat",
    units: [
      "Six fifteen AM.",
      "A leaking tap, booked before breakfast.",
      "Twelve forty.",
      "A dental cleaning, booked on a lunch break.",
      "Six fifty-five PM.",
      "An air conditioner that will not cool. Booked.",
      "Two oh three AM.",
      "A burst pipe, and everyone is asleep. Except Orvia.",
      "Four calls. Four bookings.",
      "No night shift. No missed calls.",
      "Orvia. Open twenty-four hours.",
      "Try the live demo, no signup.",
    ],
  },
}

// Light, minimal cut: gender neutral wording, shows the dashboard and calls page.
SCRIPTS.clean = {
  out: "vo-clean", timing: "vo-clean-timing.json", voice: "Algieba",
  units: [
    "Your phone rings.",
    "Your hands are full.",
    "So the customer calls someone else.",
    "Meet Orvia.",
    "An AI receptionist that answers every call, day and night.",
    "It finds a time, books the job, and updates your calendar, instantly.",
    "Every booking and lead lands in one dashboard.",
    "Every call is summarized, so you always know what happened.",
    "Plumbing.",
    "Dental.",
    "H V A C.",
    "Real estate.",
    "Whatever you run, it fits in.",
    "Hear it for yourself.",
    "Try the live demo, no signup.",
  ],
}

const NAME = process.argv[2] || "exotic"
const cfg = SCRIPTS[NAME]
if (!cfg) { console.error(`Unknown script "${NAME}". Choose: ${Object.keys(SCRIPTS).join(", ")}`); process.exit(1) }
const UNITS = cfg.units
const VOICE = process.env.TTS_VOICE || cfg.voice
const MODELS = (process.env.TTS_MODEL || "gemini-3.1-flash-tts-preview,gemini-3.8-flash-lite-tts,gemini-2.5-flash-preview-tts,gemini-3.8-flash-tts").split(",")

mkdirSync(`public/${cfg.out}`, { recursive: true })
mkdirSync(`out/${cfg.out}`, { recursive: true })
const raw = `out/${cfg.out}/raw.wav`

function wav(pcm, rate) {
  const h = Buffer.alloc(44)
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12)
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24)
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

async function synth() {
  if (existsSync(raw) && !process.env.FORCE) return
  const KEY = process.env.GEMINI_API_KEY
  if (!KEY) { console.error("Set GEMINI_API_KEY first."); process.exit(1) }
  const body = {
    contents: [{ parts: [{ text: UNITS.join(" ") }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } },
  }
  for (const model of MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": KEY }, body: JSON.stringify(body),
    })
    const text = await res.text()
    if (!res.ok) { console.error(`${model}: HTTP ${res.status} ${text.slice(0, 140).replace(/\s+/g, " ")}`); continue }
    const part = JSON.parse(text).candidates?.[0]?.content?.parts?.find(p => p.inlineData)
    if (!part) { console.error(`${model}: no audio`); continue }
    const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType ?? "")?.[1] ?? 24000)
    writeFileSync(raw, wav(Buffer.from(part.inlineData.data, "base64"), rate))
    console.log(`narrated with ${model}, voice ${VOICE}`)
    return
  }
  throw new Error("No TTS model accepted the request")
}

await synth()

// Speech runs from amplitude, merged across tiny dips (consonants).
const b = readFileSync(raw), rate = b.readUInt32LE(24)
const s = new Int16Array(b.buffer.slice(b.byteOffset + 44, b.byteOffset + b.length - ((b.length - 44) % 2)))
const win = Math.round(rate * 0.01)
const loud = []
for (let i = 0; i + win <= s.length; i += win) {
  let m = 0
  for (let j = i; j < i + win; j++) m = Math.max(m, Math.abs(s[j]))
  loud.push(m > 700)
}
const segs = []
let start = -1
loud.forEach((on, i) => {
  if (on && start < 0) start = i
  if (!on && start >= 0) { segs.push([start * 0.01, i * 0.01]); start = -1 }
})
if (start >= 0) segs.push([start * 0.01, loud.length * 0.01])
const merged = []
for (const g of segs) {
  const last = merged[merged.length - 1]
  if (last && g[0] - last[1] < 0.12) last[1] = g[1]
  else merged.push([...g])
}
console.log(`${merged.length} speech runs; need ${UNITS.length} units`)
if (process.env.DEBUG) merged.forEach((g, i) => console.log(`run ${i}: ${g[0].toFixed(2)}-${g[1].toFixed(2)} (${(g[1] - g[0]).toFixed(2)}s)`))

// Assign runs to units: contiguous groups whose lengths best match each
// unit's share of the script (by letters), preferring to cut at long pauses.
const weight = UNITS.map(t => t.replace(/[^A-Za-z]/g, "").length)
const totalW = weight.reduce((a, b) => a + b, 0)
const span = merged[merged.length - 1][1] - merged[0][0]
const expected = weight.map(w => (w / totalW) * span)
const R = merged.length, U = UNITS.length
const cost = (u, a, b) => {
  const d = merged[b][1] - merged[a][0]
  return ((d - expected[u]) ** 2) / expected[u]
}
const best = Array.from({ length: U + 1 }, () => new Array(R + 1).fill(Infinity))
const from = Array.from({ length: U + 1 }, () => new Array(R + 1).fill(-1))
best[0][0] = 0
for (let u = 1; u <= U; u++) {
  for (let b = u; b <= R; b++) {
    for (let a = u - 1; a < b; a++) {
      if (best[u - 1][a] === Infinity) continue
      const gapBonus = a > 0 ? Math.min(0.6, merged[a][0] - merged[a - 1][1]) * 1.5 : 0
      const c = best[u - 1][a] + cost(u - 1, a, b - 1) - gapBonus
      if (c < best[u][b]) { best[u][b] = c; from[u][b] = a }
    }
  }
}
if (best[U][R] === Infinity) { console.error("Could not split the audio into the expected units"); process.exit(2) }
const units = []
for (let u = U, b = R; u >= 1; u--) { const a = from[u][b]; units.unshift([merged[a][0], merged[b - 1][1]]); b = a }
units.forEach((u, i) => console.log(`${String(i).padStart(2)} ${u[0].toFixed(2)}-${u[1].toFixed(2)}  ${UNITS[i]}`))

// Normalize loudness, add a short lead-in and a tail.
const LEAD = 0.5, TAIL = 1.4
const dur = units[units.length - 1][1] + LEAD + TAIL
const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-af",
  `highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=7,adelay=${LEAD * 1000}|${LEAD * 1000},apad=whole_dur=${dur.toFixed(3)}`,
  "-ar", "48000", "-ac", "1", "-t", dur.toFixed(3), `public/${cfg.out}/narration.wav`], { encoding: "utf8" })
if (r.status !== 0) { console.error(r.stderr); process.exit(1) }

const fps = 30
writeFileSync(`src/${cfg.timing}`, JSON.stringify({
  fps,
  durationInFrames: Math.ceil(dur * fps),
  units: units.map((u, i) => ({ text: UNITS[i], start: +(u[0] + LEAD).toFixed(3), end: +(u[1] + LEAD).toFixed(3) })),
}, null, 2) + "\n")
console.log(`wrote public/${cfg.out}/narration.wav (${dur.toFixed(1)}s) and src/${cfg.timing}`)
