// Asks Gemini to timestamp each phrase of the narration, as a cross-check of
// the pause-based alignment. Prints only; does not write anything.
import { readFileSync } from "node:fs"
const KEY = process.env.GEMINI_API_KEY
const wav = readFileSync("out/vo2/raw.wav").toString("base64")
const phrases = readFileSync("audio/make-narration.mjs", "utf8").match(/^  "(.+)",$/gm).map(l => l.trim().slice(1, -2))
const prompt = `This audio reads these phrases in order. For each phrase give the time in seconds when the speaker starts saying it and when they finish. Reply with JSON only: [{"phrase": "...", "start": 0.0, "end": 0.0}].\n${phrases.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
for (const model of ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-2.5-flash"]) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "audio/wav", data: wav } }] }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }),
  })
  const t = await res.text()
  if (!res.ok) { console.error(model, res.status, t.slice(0, 100).replace(/\s+/g, " ")); continue }
  console.log(model)
  for (const r of JSON.parse(JSON.parse(t).candidates[0].content.parts[0].text)) console.log(`${r.start.toFixed(2)}-${r.end.toFixed(2)}  ${r.phrase}`)
  break
}
