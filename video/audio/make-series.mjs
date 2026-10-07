// Voice-over for the series videos. Each unit is synthesized on its own with
// Edge TTS (no key, no daily quota), so its start and end are exact. The units
// are placed on one track with gaps, loudness-normalized, and the timing is
// merged into src/series/timings.json.
//
//   node audio/make-series.mjs [concept|all] [lang|all]
//
// Needs `pip install edge-tts` and ffmpeg. Clips are cached in out/series-tts.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"

const copy = JSON.parse(readFileSync("src/series/copy.json", "utf8"))
const TIMINGS = "src/series/timings.json"
const timings = existsSync(TIMINGS) ? JSON.parse(readFileSync(TIMINGS, "utf8")) : {}
const [wantC = "all", wantL = "all"] = process.argv.slice(2)

const FPS = 30, RATE = 48000, LEAD = 0.5, TAIL = 1.7, GAP = 0.5, MIN_SLOT = 2.0
mkdirSync("out/series-tts", { recursive: true })
mkdirSync("public/series", { recursive: true })

const run = (cmd, args) => new Promise(res => {
  const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] })
  let err = ""
  p.stderr.on("data", d => (err += d))
  p.on("close", code => res({ code, err }))
})

async function clip(voice, rate, text) {
  const id = createHash("sha1").update(`${voice}|${rate}|${text}`).digest("hex").slice(0, 16)
  const raw = `out/series-tts/${id}.raw`
  if (existsSync(raw)) return readFileSync(raw)
  for (let a = 0; a < 4; a++) {
    const mp3 = `out/series-tts/${id}.mp3`
    const t = await run("python", ["-m", "edge_tts", "--voice", voice, `--rate=${rate}`, "--text", text, "--write-media", mp3])
    if (t.code === 0 && existsSync(mp3)) {
      const c = await run("ffmpeg", ["-v", "error", "-y", "-i", mp3, "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse", "-ar", String(RATE), "-ac", "1", "-f", "s16le", raw])
      if (c.code === 0) return readFileSync(raw)
    }
    await new Promise(r => setTimeout(r, 800 * (a + 1)))
  }
  throw new Error(`TTS failed: ${voice} ${text}`)
}

async function pool(items, n, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) } }))
  return out
}

function wav(pcm) {
  const h = Buffer.alloc(44)
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12)
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24)
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

for (const [concept, byLang] of Object.entries(copy.units)) {
  if (wantC !== "all" && wantC !== concept) continue
  for (const [lang, units] of Object.entries(byLang)) {
    if (wantL !== "all" && wantL !== lang) continue
    const key = `${concept}.${lang}`
    const out = `public/series/${key}.wav`
    if (timings[key] && existsSync(out) && !process.env.FORCE) { console.log(`skip ${key}`); continue }
    const cfg = copy.langs[lang]
    const pcms = await pool(units, 4, u => clip(cfg.voice, cfg.rate, u))
    const secs = pcms.map(b => b.length / 2 / RATE)
    let t = LEAD
    const placed = pcms.map((b, i) => {
      const s = t, e = t + secs[i]
      t = s + Math.max(secs[i] + GAP, MIN_SLOT)
      return { s, e }
    })
    const total = placed[placed.length - 1].e + TAIL
    const track = Buffer.alloc(Math.ceil(total * RATE) * 2)
    pcms.forEach((b, i) => b.copy(track, Math.round(placed[i].s * RATE) * 2))
    const tmp = `out/series-tts/${key}.wav`
    writeFileSync(tmp, wav(track))
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", tmp, "-af", "highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=7", "-ar", String(RATE), "-ac", "1", out], { encoding: "utf8" })
    if (r.status !== 0) { console.error(r.stderr); process.exit(1) }
    timings[key] = {
      fps: FPS, durationInFrames: Math.ceil(total * FPS),
      units: placed.map((p, i) => ({ text: units[i], start: +p.s.toFixed(3), end: +p.e.toFixed(3) })),
    }
    writeFileSync(TIMINGS, JSON.stringify(timings, null, 2) + "\n")
    console.log(`${key}  ${total.toFixed(1)}s  ${units.length} units`)
  }
}
