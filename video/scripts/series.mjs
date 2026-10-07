// Render helper for the series cuts. Bundles once, then renders many.
//
//   node scripts/series.mjs stills <id-regex> [fractions, e.g. 0.1,0.4,0.9]
//   node scripts/series.mjs render <id-regex>
//
// Videos land in out/series/<intl|india>/<concept>-<lang>-<ratio>.mp4
// and skip anything already rendered unless FORCE=1.

import { bundle } from "@remotion/bundler"
import { renderMedia, renderStill, selectComposition, getCompositions } from "@remotion/renderer"
import { mkdirSync, existsSync, renameSync, rmSync } from "node:fs"
import path from "node:path"

const [mode = "render", pattern = ".*", fr = "0.1,0.3,0.5,0.7,0.9"] = process.argv.slice(2)
const re = new RegExp(pattern)
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), onProgress: () => {} })
const comps = (await getCompositions(serveUrl)).filter(c => re.test(c.id) && /^(missed|ten|niches|flow|dash)-/.test(c.id))
console.log(`${comps.length} compositions`)

for (const c of comps) {
  const comp = await selectComposition({ serveUrl, id: c.id })
  const [concept, lang, ratio] = c.id.split("-").length === 4 ? [c.id.split("-")[0], c.id.split("-").slice(1, 3).join("-"), c.id.split("-")[3]] : c.id.split("-")
  const market = lang === "en" ? "intl" : "india"
  if (mode === "stills") {
    mkdirSync("out/series-stills", { recursive: true })
    for (const x of fr.split(",").map(Number)) {
      const frame = Math.min(comp.durationInFrames - 1, Math.round(comp.durationInFrames * x))
      await renderStill({ serveUrl, composition: comp, frame, output: `out/series-stills/${c.id}-${String(frame).padStart(4, "0")}.png` })
    }
    console.log(`stills ${c.id}`)
  } else {
    const dir = `out/series/${market}`
    mkdirSync(dir, { recursive: true })
    const out = `${dir}/${concept}-${lang}-${ratio}.mp4`
    if (existsSync(out) && !process.env.FORCE) { console.log(`skip ${out}`); continue }
    const t0 = Date.now(), part = `${out}.part.mp4`
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await renderMedia({ serveUrl, composition: comp, codec: "h264", crf: 16, outputLocation: part, concurrency: Number(process.env.CONC || 4), audioBitrate: "192k" })
        renameSync(part, out)
        console.log(`rendered ${out} in ${Math.round((Date.now() - t0) / 1000)}s`)
        break
      } catch (e) {
        console.log(`retry ${attempt} ${out}: ${String(e).slice(0, 120)}`)
        rmSync(part, { force: true })
        if (attempt === 3) throw e
      }
    }
  }
}
