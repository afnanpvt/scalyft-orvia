const test = require("node:test");
const assert = require("node:assert");
const { detectTtsLanguage, wavToRawPcm, customerChannel, makeSampleAligner, digitsPending } = require("./lib");

test("digitsPending is true only while a phone number is half-said", () => {
  assert.equal(digitsPending("என் பேரு கார்த்திக். நம்பர் 98765."), true);
  assert.equal(digitsPending("98765 43210"), false);
  assert.equal(digitsPending("நாளைக்கு 5 மணி"), false);
  assert.equal(digitsPending("வணக்கம்"), false);
});

test("aligner never emits half a sample", () => {
  const align = makeSampleAligner();
  const a = align(Buffer.from([1, 2, 3]));
  const b = align(Buffer.from([4, 5, 6, 7, 8]));
  const c = align(Buffer.from([9]));
  const d = align(Buffer.from([10]));
  assert.deepEqual([...a], [1, 2]);
  assert.deepEqual([...b], [3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...c], []);
  assert.deepEqual([...d], [9, 10]);
});

test("detects the reply script", () => {
  assert.equal(detectTtsLanguage("ನಮಸ್ಕಾರ, ನಾನು ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?"), "kn-IN");
  assert.equal(detectTtsLanguage("నమస్కారం, నేను ఎలా సహాయం చేయగలను?"), "te-IN");
  assert.equal(detectTtsLanguage("வணக்கம், நான் உங்களுக்கு எப்படி உதவ முடியும்?"), "ta-IN");
  assert.equal(detectTtsLanguage("नमस्ते, मैं आपकी कैसे मदद कर सकती हूँ?"), "hi-IN");
  assert.equal(detectTtsLanguage("Hello, how can I help?"), "en-IN");
});

test("mixed text follows the dominant script", () => {
  assert.equal(detectTtsLanguage("Smile Dental ಕ್ಲಿನಿಕ್‌ಗೆ ಸ್ವಾಗತ"), "kn-IN");
});

test("wavToRawPcm skips non-data chunks", () => {
  const pcm = Buffer.from([1, 2, 3, 4, 5, 6]);
  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0, "ascii");
  fmt.writeUInt32LE(16, 4);
  const list = Buffer.alloc(8 + 4);
  list.write("LIST", 0, "ascii");
  list.writeUInt32LE(4, 4);
  list.write("data", 8, "ascii"); // "data" inside another chunk must not confuse us
  const dataHead = Buffer.alloc(8);
  dataHead.write("data", 0, "ascii");
  dataHead.writeUInt32LE(pcm.length, 4);
  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "ascii");
  riff.write("WAVE", 8, "ascii");
  const wav = Buffer.concat([riff, fmt, list, dataHead, pcm]);
  assert.deepEqual([...wavToRawPcm(wav)], [...pcm]);
});

test("wavToRawPcm rejects non-WAV input", () => {
  assert.throws(() => wavToRawPcm(Buffer.from("not a wav file at all")));
});

test("customerChannel keeps only channel 0", () => {
  // frames: [L0,R0],[L1,R1] as 16-bit samples
  const stereo = Buffer.from([1, 0, 9, 9, 2, 0, 9, 9]);
  assert.deepEqual([...customerChannel(stereo)], [1, 0, 2, 0]);
});
