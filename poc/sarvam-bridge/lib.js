// Pure helpers, kept separate from server.js so they can be unit tested.

// Pick the Bulbul language for a reply from its script. The Indic script with the
// most characters wins; Latin-only text is Indian English.
const SCRIPTS = [
  { code: "kn-IN", re: /[ಀ-೿]/g },
  { code: "te-IN", re: /[ఀ-౿]/g },
  { code: "ta-IN", re: /[஀-௿]/g },
  { code: "hi-IN", re: /[ऀ-ॿ]/g },
];

function detectTtsLanguage(text, fallback = "en-IN") {
  let best = null;
  let bestCount = 0;
  for (const { code, re } of SCRIPTS) {
    const n = (text.match(re) || []).length;
    if (n > bestCount) {
      best = code;
      bestCount = n;
    }
  }
  return best || fallback;
}

// Walk the RIFF chunks and return the raw PCM from the "data" chunk.
// Safer than indexOf("data"), which can match inside another chunk.
function wavToRawPcm(wav) {
  if (wav.length < 12 || wav.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("Not a RIFF/WAV buffer");
  }
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === "data") {
      // Streamed WAVs may set size to 0 or 0xFFFFFFFF; take the rest of the buffer.
      const end = size === 0 || size === 0xffffffff ? wav.length : Math.min(wav.length, offset + 8 + size);
      return wav.subarray(offset + 8, end);
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}

// Vapi sends interleaved 16-bit stereo: ch0 = caller, ch1 = assistant.
// Only the caller channel is needed; Vapi already has the assistant's text.
function customerChannel(buffer) {
  const frames = Math.floor(buffer.length / 4);
  const out = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) buffer.copy(out, i * 2, i * 4, i * 4 + 2);
  return out;
}

// True while a phone number looks half-said: some digits heard, fewer than a full
// 10-digit mobile number. The listener waits longer before treating the turn as done.
function digitsPending(text) {
  const n = (String(text).match(/\d/g) || []).length;
  return n >= 3 && n < 10;
}

// Streamed PCM chunks can split a 16-bit sample in half. Hold the odd byte back
// so every chunk we forward is whole samples.
function makeSampleAligner() {
  let carry = null;
  return (chunk) => {
    let buf = carry ? Buffer.concat([carry, chunk]) : Buffer.from(chunk);
    carry = null;
    if (buf.length % 2) {
      carry = buf.subarray(buf.length - 1);
      buf = buf.subarray(0, buf.length - 1);
    }
    return buf;
  };
}

// Sarvam STT language codes we can lock onto, keyed by the test page's short codes.
const STT_CODES = { kn: "kn-IN", te: "te-IN", ta: "ta-IN", hi: "hi-IN", en: "en-IN" };
const LOCKABLE = new Set(["kn-IN", "te-IN", "ta-IN", "hi-IN"]);

module.exports = { detectTtsLanguage, wavToRawPcm, customerChannel, makeSampleAligner, digitsPending, STT_CODES, LOCKABLE };
