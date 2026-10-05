// Narrates the ad with Gemini TTS, then mixes voice over the soundtrack
// (the music ducks under each line) and muxes it onto both video cuts.
//
//   GEMINI_API_KEY=... node audio/make-voiceover.mjs
//
// Needs out/audio.wav (npm run audio) and the silent renders in out/.
// The key is read from the environment and never written to disk.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"

const KEY = process.env.GEMINI_API_KEY
if (!KEY) { console.error("Set GEMINI_API_KEY first."); process.exit(1) }

const MODEL = process.env.TTS_MODEL || "gemini-3.8-flash-tts"
const VOICE = process.env.TTS_VOICE || "Orus"
// Leave empty: this model reads a style prefix aloud instead of obeying it.
const STYLE = process.env.TTS_STYLE ?? ""

// start = seconds into the narrated cut where the speech itself begins.
// The cut (see NarratedAd in src/Root.tsx) is 35.67s: scenes are held longer
// so every line has room, and the score is retimed to match (make-audio --vo).
export const LINES = [
  { id: "hook", start: 0.5, text: "Every missed call is a missed job." },
  { id: "meet", start: 4.55, text: "Meet Orvia. The AI front desk that answers every call." },
  { id: "call", start: 9.25, text: "A customer calls with a leaking sink. Priya picks up, finds a time, and books it. No one lifts a finger." },
  { id: "dash", start: 16.35, text: "Every booking, lead and appointment, live in one dashboard." },
  { id: "niches", start: 22.6, text: "Dental, plumbing, H V A C, real estate, support. One agent for every front desk." },
  { id: "cta", start: 30.3, text: "Hear it for yourself. Try the live demo, no signup." },
]

mkdirSync("out/vo", { recursive: true })

function wav(pcm, rate) {
  const h = Buffer.alloc(44)
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12)
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24)
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

async function speak(line) {
  const path = `out/vo/${line.id}.wav`
  if (existsSync(path) && !process.env.FORCE) return path
  const body = {
    contents: [{ parts: [{ text: STYLE ? `${STYLE}: ${line.text}` : line.text }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } },
  }
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": KEY }, body: JSON.stringify(body),
    })
    if (res.ok) {
      const json = await res.json()
      const part = json.candidates?.[0]?.content?.parts?.find(p => p.inlineData)
      if (part) {
        const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType ?? "")?.[1] ?? 24000)
        writeFileSync(path, wav(Buffer.from(part.inlineData.data, "base64"), rate))
        return path
      }
      console.error(`${line.id}: no audio in response, retrying`)
    } else {
      const text = await res.text()
      console.error(`${line.id}: HTTP ${res.status} ${text.slice(0, 120).replace(/\s+/g, " ")}`)
      // Free tier is rate limited per minute: wait it out.
      if (res.status === 429 && /PerDay/.test(text)) throw new Error(`${MODEL} hit its daily free quota; try TTS_MODEL=<another tts model>`)
      if (res.status === 429) { await new Promise(r => setTimeout(r, 25_000 * attempt)); continue }
    }
    await new Promise(r => setTimeout(r, 1500 * attempt))
  }
  throw new Error(`TTS failed for ${line.id}`)
}


// Seconds of silence before the speech starts (and the speech length).
function speechSpan(path) {
  const b = readFileSync(path), rate = b.readUInt32LE(24)
  const s = new Int16Array(b.buffer.slice(b.byteOffset + 44, b.byteOffset + b.length - ((b.length - 44) % 2)))
  let a = 0, z = s.length - 1
  while (a < s.length && Math.abs(s[a]) < 800) a++
  while (z > 0 && Math.abs(s[z]) < 800) z--
  return { lead: a / rate, len: (z - a) / rate }
}

const SECONDS = 1070 / 30
const files = []
for (const line of LINES) {
  const path = await speak(line)
  const { lead, len } = speechSpan(path)
  files.push({ ...line, path, delay: Math.max(0, line.start - lead), len })
  console.log(`${line.id}: speaks ${line.start.toFixed(2)}s to ${(line.start + len).toFixed(2)}s`)
}
files.forEach((x, i) => { const next = files[i + 1]; if (next && x.start + x.len > next.start) console.warn(`warning: ${x.id} runs into ${next.id}`) })

// Mix: delayed voice lines -> light compression; music ducks under the voice.
const inputs = ["-i", "out/audio-vo.wav"]
files.forEach(x => inputs.push("-i", x.path))
const chains = files.map((x, i) =>
  `[${i + 2}:a]aresample=44100,pan=stereo|c0=c0|c1=c0,adelay=${Math.round(x.delay * 1000)}|${Math.round(x.delay * 1000)}[v${i}]`)
const vlabels = files.map((_, i) => `[v${i}]`).join("")
const graph = [
  ...chains,
  `${vlabels}amix=inputs=${files.length}:normalize=0:dropout_transition=0,acompressor=threshold=-20dB:ratio=3:attack=5:release=90,volume=1.4,apad=whole_dur=${SECONDS.toFixed(3)},asplit=2[va][vs]`,
  `[1:a]volume=0.75[m]`,
  `[m][vs]sidechaincompress=threshold=0.02:ratio=9:attack=15:release=350:makeup=1[md]`,
  `[md][va]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=8[out]`,
].join(";")

for (const cut of ["16x9", "9x16"]) {
  const src = `out/narrated-${cut}.mp4`, dst = `out/orvia-${cut}-narrated.mp4`
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", src, ...inputs, "-filter_complex", graph, "-map", "0:v", "-map", "[out]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", SECONDS.toFixed(3), dst], { encoding: "utf8" })
  if (r.status !== 0) { console.error(r.stderr); process.exit(1) }
  console.log("wrote", dst)
}
