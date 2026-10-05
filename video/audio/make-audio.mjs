// Synthesizes the soundtrack for the Orvia ad, no samples or licensed music.
// Voice-free and melody-free by design: a frame drum (daf) groove, a soft
// breath of air, and small UI sounds timed to the animation (30 fps).
//   node audio/make-audio.mjs  ->  out/audio.wav

import { writeFileSync, mkdirSync } from "node:fs"

const SR = 44100
const SECONDS = 29
const N = SR * SECONDS
const f = frame => frame / 30

// Deterministic noise so every render sounds the same.
let seed = 1234567
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const noise = () => rnd() * 2 - 1

// RBJ biquad
function biquad(type, freq, q = 0.707) {
  const w = (2 * Math.PI * Math.min(freq, SR * 0.45)) / SR
  const cos = Math.cos(w), alpha = Math.sin(w) / (2 * q)
  let b0, b1, b2
  const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha
  if (type === "lp") { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2 }
  else if (type === "hp") { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2 }
  else { b0 = alpha; b1 = 0; b2 = -alpha } // bandpass
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0, x1: 0, x2: 0, y1: 0, y2: 0 }
}
const run = (s, x) => {
  const y = s.b0 * x + s.b1 * s.x1 + s.b2 * s.x2 - s.a1 * s.y1 - s.a2 * s.y2
  s.x2 = s.x1; s.x1 = x; s.y2 = s.y1; s.y1 = y
  return y
}
const setCoef = (s, o) => { s.b0 = o.b0; s.b1 = o.b1; s.b2 = o.b2; s.a1 = o.a1; s.a2 = o.a2 }

// â”€â”€â”€ Voices (each returns a mono Float32Array) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function dum(vel = 1, len = 0.55) {
  const n = Math.floor(SR * len), out = new Float32Array(n)
  const body = biquad("lp", 420)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const fr = 52 + 92 * Math.exp(-t * 26)
    ph += (2 * Math.PI * fr) / SR
    const tone = Math.sin(ph) * Math.exp(-t * 8.5)
    const skin = run(body, noise()) * Math.exp(-t * 22) * 0.9
    const click = noise() * Math.exp(-t * 420) * 0.35
    out[i] = (tone * 0.95 + skin + click) * vel
  }
  return out
}

function tek(vel = 1, len = 0.16) {
  const n = Math.floor(SR * len), out = new Float32Array(n)
  const bp = biquad("bp", 2300, 1.1)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    ph += (2 * Math.PI * 360) / SR
    out[i] = (run(bp, noise()) * Math.exp(-t * 38) * 1.5 + Math.sin(ph) * Math.exp(-t * 70) * 0.25) * vel
  }
  return out
}

// The daf's ring of little metal discs.
function jingle(vel = 1, len = 0.42) {
  const n = Math.floor(SR * len), out = new Float32Array(n)
  const bp = biquad("bp", 7200, 5), hp = biquad("hp", 4500)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    out[i] = run(hp, run(bp, noise())) * Math.exp(-t * 11) * 2.2 * vel
  }
  return out
}

function tick(vel = 1, freq = 3800) {
  const n = Math.floor(SR * 0.04), out = new Float32Array(n)
  const bp = biquad("bp", freq, 2)
  for (let i = 0; i < n; i++) out[i] = run(bp, noise()) * Math.exp(-(i / SR) * 130) * 2.2 * vel
  return out
}

function pop(vel = 1, freq = 420, len = 0.16) {
  const n = Math.floor(SR * len), out = new Float32Array(n)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    ph += (2 * Math.PI * (freq + freq * 0.9 * Math.exp(-t * 55))) / SR
    out[i] = Math.sin(ph) * Math.exp(-t * 26) * 0.9 * vel
  }
  return out
}

function thud(vel = 1) {
  const n = Math.floor(SR * 0.3), out = new Float32Array(n)
  const lp = biquad("lp", 260)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    ph += (2 * Math.PI * (70 + 50 * Math.exp(-t * 30))) / SR
    out[i] = (Math.sin(ph) * Math.exp(-t * 14) + run(lp, noise()) * Math.exp(-t * 40) * 0.8) * vel
  }
  return out
}

// Filtered-noise sweep. dir > 0 rises, dir < 0 falls.
function whoosh(dur, lo, hi, dir = 1, vel = 1, q = 1.4) {
  const n = Math.floor(SR * dur), out = new Float32Array(n)
  const s = biquad("bp", lo, q)
  for (let i = 0; i < n; i++) {
    const p = i / n
    if (i % 96 === 0) {
      const k = dir > 0 ? p : 1 - p
      setCoef(s, biquad("bp", lo * Math.pow(hi / lo, k * k), q))
    }
    const env = Math.sin(Math.PI * Math.pow(p, dir > 0 ? 1.6 : 0.6))
    out[i] = run(s, noise()) * env * 1.8 * vel
  }
  return out
}

// â”€â”€â”€ Buses and placement â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const mk = () => ({ l: new Float32Array(N), r: new Float32Array(N) })
const drums = mk(), fx = mk(), air = mk()

function put(bus, t, buf, pan = 0) {
  const start = Math.floor(t * SR)
  const gl = Math.cos(((pan + 1) * Math.PI) / 4), gr = Math.sin(((pan + 1) * Math.PI) / 4)
  for (let i = 0; i < buf.length && start + i < N; i++) {
    if (start + i < 0) continue
    bus.l[start + i] += buf[i] * gl
    bus.r[start + i] += buf[i] * gr
  }
}

// Small stereo reverb: parallel combs into series allpasses.
function reverb(bus, mix, decay = 0.82) {
  const mono = new Float32Array(N)
  for (let i = 0; i < N; i++) mono[i] = (bus.l[i] + bus.r[i]) * 0.5
  const combs = side => [1557, 1617, 1491, 1422, 1277, 1356].map(d => ({ buf: new Float32Array(d + side * 23), i: 0, lp: 0 }))
  const aps = [225, 556, 441].map(d => ({ buf: new Float32Array(d), i: 0 }))
  const wet = side => {
    const cs = combs(side), as = aps.map(a => ({ buf: new Float32Array(a.buf.length), i: 0 }))
    const out = new Float32Array(N)
    for (let n = 0; n < N; n++) {
      let acc = 0
      for (const c of cs) {
        const y = c.buf[c.i]
        c.lp = y * 0.6 + c.lp * 0.4
        c.buf[c.i] = mono[n] + c.lp * decay
        c.i = (c.i + 1) % c.buf.length
        acc += y
      }
      acc /= cs.length
      for (const a of as) {
        const y = a.buf[a.i]
        a.buf[a.i] = acc + y * 0.5
        acc = y - acc * 0.5
        a.i = (a.i + 1) % a.buf.length
      }
      out[n] = acc
    }
    return out
  }
  const wl = wet(0), wr = wet(1)
  for (let i = 0; i < N; i++) { bus.l[i] += wl[i] * mix; bus.r[i] += wr[i] * mix }
}

// â”€â”€â”€ Score â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const BPM = 90, T0 = 4.0
const beat = 60 / BPM, eighth = beat / 2, sixteenth = beat / 4, bar = beat * 4

// Hook (0 to 4s): a quickening heartbeat, then a rise into the reveal.
for (let k = 0; k < 4; k++) {
  const t = 0.35 + k * 1.0, v = 0.35 + k * 0.16
  put(drums, t, dum(v), -0.1)
  put(drums, t + 0.24, dum(v * 0.7), 0.1)
}
put(fx, 2.3, whoosh(1.7, 200, 6500, 1, 0.55), 0)
put(drums, T0, dum(1.25, 0.9), 0)
put(fx, T0 - 0.02, thud(1.0), 0)
put(fx, T0, whoosh(0.9, 6000, 500, -1, 0.7), 0)

// Hook UI: words, missed-call cards.
for (let i = 0; i < 7; i++) put(fx, f(6 + i * 5 + 8), tick(0.22, 3000 + i * 160), (i - 3) * 0.08)
;[34, 54, 74].forEach((fr, i) => { put(fx, f(fr), thud(0.55), 0.35); put(fx, f(fr) + 0.04, tick(0.3, 1800), 0.35 + i * 0.05) })

// Reveal UI.
put(fx, f(134), pop(0.55, 330), 0)
put(fx, f(146), tick(0.3), 0)
put(fx, f(160), tick(0.22), 0)
put(fx, f(176), pop(0.4, 520), 0)

// The groove, a maqsum: Dum Tek . Tek | Dum . Tek .
const sections = [
  { from: T0, to: T0 + 3.0, vel: 0.5, full: false, ghost: false },
  { from: T0 + 3.0, to: 13.33, vel: 0.72, full: true, ghost: false },
  { from: 13.33, to: 19.67, vel: 0.84, full: true, ghost: true },
  { from: 19.67, to: 24.33, vel: 0.92, full: true, ghost: true },
  { from: 24.33, to: 28.0, vel: 1.0, full: true, ghost: true },
]
const pattern = ["D", "", "T", "T", "D", "", "T", ""]
for (const sec of sections) {
  for (let t = T0; t < sec.to - 1e-6; t += eighth) {
    if (t < sec.from - 1e-6) continue
    const idx = Math.round((t - T0) / eighth)
    const step = idx % 8
    const barNo = Math.floor(idx / 8)
    const hit = pattern[step]
    const swing = (step % 2) * 0.012
    const accent = step === 0 ? 1 : 0.85
    if (!sec.full) {
      if (step === 0 || step === 4) put(drums, t, dum(sec.vel * accent), -0.08)
      continue
    }
    if (hit === "D") put(drums, t + swing, dum(sec.vel * accent), -0.08)
    if (hit === "T") { put(drums, t + swing, tek(sec.vel * 0.6), 0.1); put(drums, t + swing, jingle(sec.vel * 0.16), 0.2) }
    if (sec.ghost && !hit) put(drums, t + swing, tek(sec.vel * 0.22), -0.12)
    if (sec.ghost && step % 2 === 1) put(drums, t + sixteenth * 0.5, jingle(sec.vel * 0.1), 0.25)
    // A short roll leading into every fourth bar.
    if (sec.ghost && barNo % 4 === 3 && step === 6) {
      for (let r = 0; r < 4; r++) put(drums, t + r * sixteenth * 0.5, tek(sec.vel * (0.3 + r * 0.12)), 0.1)
    }
  }
}
// Closing hit.
put(drums, 28.0, dum(1.05, 0.9), 0)
put(drums, 28.0, jingle(0.4, 0.9), 0.2)

// Call scene UI (scene starts at frame 210).
put(fx, f(210), whoosh(0.5, 400, 3500, 1, 0.3), 0)
;[222, 272, 322, 344].forEach((fr, i) => put(fx, f(fr), pop(0.32, 380 + (i % 2) * 90), i % 2 ? 0.2 : -0.2))
put(fx, f(314), tick(0.4, 2200), 0)
put(fx, f(350), pop(0.5, 420), 0.1)
put(fx, f(352), pop(0.45, 630), 0.1)
put(fx, f(352) + 0.05, whoosh(0.5, 2500, 9000, 1, 0.22), 0)
put(fx, f(362), pop(0.4, 480), 0.2)

// Dashboard (scene starts at frame 400).
put(fx, f(400), whoosh(0.55, 300, 3200, 1, 0.3), 0)
put(fx, f(426), whoosh(2.3, 500, 4200, 1, 0.34, 2), 0)
for (let i = 0; i < 7; i++) put(fx, f(426 + i * 11.7), pop(0.2, 520 + i * 28, 0.1), -0.3 + i * 0.1)
for (let i = 0; i < 14; i++) put(fx, f(414) + i * 0.1, tick(0.16, 3400 + i * 90), 0.4)
;[456, 468, 480].forEach((fr, i) => put(fx, f(fr), tick(0.32, 2400 + i * 200), 0.3))
put(fx, f(510), pop(0.5, 400), 0)

// Industries (scene starts at frame 590).
put(fx, f(590), whoosh(0.5, 300, 3000, 1, 0.3), 0)
put(fx, f(594), tick(0.3), 0)
for (let i = 0; i < 5; i++) put(fx, f(610 + i * 6), pop(0.26, 340 + i * 30, 0.12), -0.5 + i * 0.25)
for (let i = 0; i < 5; i++) put(fx, f(634 + i * 17), pop(0.34, 460), -0.5 + i * 0.25)

// Call to action (scene starts at frame 730).
put(fx, f(732), pop(0.45, 320), 0)
put(fx, f(738), whoosh(0.7, 300, 5000, 1, 0.34), 0)
put(fx, f(764), pop(0.4, 440), 0)
put(fx, f(804), tick(0.9, 1500), 0)
put(fx, f(804), thud(0.7), 0)
put(fx, f(806), whoosh(0.9, 1500, 8000, 1, 0.3), 0)

// The air bed: a soft breath that opens up at the reveal.
{
  const lp = biquad("lp", 500), bp = biquad("bp", 900, 0.6)
  for (let i = 0; i < N; i++) {
    const t = i / SR
    if (i % 256 === 0) {
      const open = Math.min(1, Math.max(0, (t - 3.8) / 1.2))
      setCoef(bp, biquad("bp", 600 + 700 * open + 180 * Math.sin(t * 0.5), 0.5))
    }
    const level = (0.5 + 0.5 * open01(t)) * (0.7 + 0.3 * Math.sin(t * 0.8 + 1))
    const x = run(bp, run(lp, noise())) * 0.5 * level
    air.l[i] = x
    air.r[i] = x * 0.92 + (i > 40 ? air.l[i - 40] * 0.08 : 0)
  }
}
function open01(t) { return Math.min(1, Math.max(0, (t - 3.8) / 1.2)) }

// â”€â”€â”€ Mix â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

reverb(drums, 0.5, 0.78)
reverb(fx, 0.35, 0.74)

const out = new Float32Array(N * 2)
let peak = 0
for (let i = 0; i < N; i++) {
  const t = i / SR
  const fade = Math.min(1, Math.max(0, (SECONDS - t) / 1.4)) * Math.min(1, t / 0.15)
  const l = (drums.l[i] * 0.95 + fx.l[i] * 0.85 + air.l[i] * 0.14) * fade
  const r = (drums.r[i] * 0.95 + fx.r[i] * 0.85 + air.r[i] * 0.14) * fade
  out[i * 2] = Math.tanh(l * 0.9)
  out[i * 2 + 1] = Math.tanh(r * 0.9)
  peak = Math.max(peak, Math.abs(out[i * 2]), Math.abs(out[i * 2 + 1]))
}

// 16-bit PCM WAV, peak normalized to -2 dBFS; ffmpeg handles loudness later.
const gain = 0.79 / Math.max(peak, 1e-6)
const data = Buffer.alloc(44 + out.length * 2)
data.write("RIFF", 0); data.writeUInt32LE(36 + out.length * 2, 4); data.write("WAVE", 8)
data.write("fmt ", 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22)
data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34)
data.write("data", 36); data.writeUInt32LE(out.length * 2, 40)
for (let i = 0; i < out.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i] * gain)) * 32767), 44 + i * 2)
mkdirSync("out", { recursive: true })
writeFileSync("out/audio.wav", data)
console.log(`wrote out/audio.wav (${SECONDS}s, peak before norm ${peak.toFixed(2)})`)
