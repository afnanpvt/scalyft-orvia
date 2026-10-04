// AudioWorklet processors for the Gemini Live call, loaded from Blob URLs so
// they need no separate build step. Both run off the main thread, so React
// re-renders can't cause mic dropouts or playback crackle.

// Mic capture: resamples whatever rate the device runs at down to 16 kHz and
// posts 40 ms Int16 chunks to the main thread.
const CAPTURE_SRC = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / 16000
    this.t = 0
    this.last = 0
    this.out = new Int16Array(640)
    this.n = 0
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true
    const get = i => (i < 0 ? this.last : ch[i])
    while (this.t < ch.length - 1) {
      const i0 = Math.floor(this.t)
      const a = get(i0)
      const s = a + (get(i0 + 1) - a) * (this.t - i0)
      this.out[this.n++] = Math.max(-1, Math.min(1, s)) * 0x7fff
      if (this.n === this.out.length) {
        this.port.postMessage(this.out.buffer, [this.out.buffer])
        this.out = new Int16Array(640)
        this.n = 0
      }
      this.t += this.ratio
    }
    this.t -= ch.length
    this.last = ch[ch.length - 1]
    return true
  }
}
registerProcessor("orvia-capture", CaptureProcessor)
`

// Playback: a FIFO of Float32 chunks played back to back. Waits for ~80 ms of
// audio (or 120 ms of waiting) before starting so network jitter doesn't cause
// gaps, and reports playing/idle (debounced 250 ms) for the "speaking" state.
// Posting "clear" drops everything queued, for barge-in.
const PLAYBACK_SRC = `
class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.q = []
    this.cur = null
    this.off = 0
    this.buffered = 0
    this.playing = false
    this.waited = 0
    this.idle = 0
    this.port.onmessage = e => {
      if (e.data === "clear") {
        this.q = []; this.cur = null; this.off = 0; this.buffered = 0; this.waited = 0
        this.setPlaying(false)
      } else {
        this.q.push(e.data)
        this.buffered += e.data.length
      }
    }
  }
  setPlaying(p) {
    if (p !== this.playing) { this.playing = p; this.port.postMessage(p) }
  }
  process(_inputs, outputs) {
    const out = outputs[0][0]
    if (!this.playing) {
      if (this.buffered === 0) { this.waited = 0; return true }
      this.waited += out.length
      if (this.buffered < sampleRate * 0.08 && this.waited < sampleRate * 0.12) return true
      this.setPlaying(true)
    }
    let i = 0
    while (i < out.length) {
      if (!this.cur) {
        this.cur = this.q.shift() || null
        this.off = 0
        if (!this.cur) break
      }
      const n = Math.min(out.length - i, this.cur.length - this.off)
      out.set(this.cur.subarray(this.off, this.off + n), i)
      i += n; this.off += n; this.buffered -= n
      if (this.off >= this.cur.length) this.cur = null
    }
    if (i < out.length) {
      this.idle += out.length - i
      if (this.idle > sampleRate * 0.25) { this.idle = 0; this.waited = 0; this.setPlaying(false) }
    } else {
      this.idle = 0
    }
    return true
  }
}
registerProcessor("orvia-playback", PlaybackProcessor)
`

function moduleUrl(src: string) {
  return URL.createObjectURL(new Blob([src], { type: "application/javascript" }))
}

export async function loadCaptureWorklet(ctx: AudioContext) {
  const url = moduleUrl(CAPTURE_SRC)
  try { await ctx.audioWorklet.addModule(url) } finally { URL.revokeObjectURL(url) }
}

export async function loadPlaybackWorklet(ctx: AudioContext) {
  const url = moduleUrl(PLAYBACK_SRC)
  try { await ctx.audioWorklet.addModule(url) } finally { URL.revokeObjectURL(url) }
}
