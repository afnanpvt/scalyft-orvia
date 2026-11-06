const test = require("node:test");
const assert = require("node:assert");
const { makeSplitter, speakable } = require("./sentences");

function run(chunks) {
  const out = [];
  const s = makeSplitter((x) => out.push(x));
  for (const c of chunks) s.push(c);
  s.flush();
  return out;
}

test("splits on sentence ends across token boundaries", () => {
  assert.deepEqual(run(["சரி, நாளைக்கு ", "பண்ணிடலாம். உங்க ", "பேர் என்ன?"]), ["சரி, நாளைக்கு பண்ணிடலாம்.", "உங்க பேர் என்ன?"]);
});

test("does not split inside times or decimals", () => {
  assert.deepEqual(run(["Doctor is free at 2.30 PM tomorrow. Shall I book it?"]), ["Doctor is free at 2.30 PM tomorrow.", "Shall I book it?"]);
});

test("Hindi danda counts as a terminator", () => {
  assert.deepEqual(run(["ठीक है, कल पाँच बजे। आपका नाम क्या है?"]), ["ठीक है, कल पाँच बजे।", "आपका नाम क्या है?"]);
});

test("short pieces merge into the next sentence", () => {
  assert.deepEqual(run(["Ok. Tomorrow at five works for me."]), ["Ok. Tomorrow at five works for me."]);
});

test("trailing text without a terminator is flushed", () => {
  assert.deepEqual(run(["சரிங்க, நாளைக்கு பார்க்கலாம்"]), ["சரிங்க, நாளைக்கு பார்க்கலாம்"]);
});

test("speakable strips markdown", () => {
  assert.equal(speakable("**Booked** for _tomorrow_ #1"), "Booked for tomorrow 1");
});
