import React from "react"
import { Composition, Sequence } from "remotion"
import { CallScene, Cta, Dashboard, Hook, Industries, Reveal } from "./scenes"
import { ExoticAd } from "./Exotic"
import { CleanAd, CLEAN_TOTAL } from "./Clean"
import { DayAd, DAY_TOTAL } from "./Day"
import { TOTAL as EXOTIC_TOTAL } from "./kit"
import { SeriesVideo } from "./series/Series"
import { TIMINGS, Concept, Lang } from "./series/kit"

// Scenes overlap by ~10-20 frames so each one fades or wipes over the last.
const SCENES = [
  { C: Hook, from: 0, dur: 140 },
  { C: Reveal, from: 120, dur: 100 },
  { C: CallScene, from: 210, dur: 200 },
  { C: Dashboard, from: 400, dur: 200 },
  { C: Industries, from: 590, dur: 150 },
  { C: Cta, from: 730, dur: 140 },
]
const TOTAL = 870

const Ad: React.FC = () => (
  <>
    {SCENES.map(({ C, from, dur }, i) => (
      <Sequence key={i} from={from} durationInFrames={dur}>
        <C />
      </Sequence>
    ))}
  </>
)

// Narrated cut: the same scenes, held longer so the voice has room to speak.
// Keep these starts in sync with SCENE in audio/make-audio.mjs.
const VO_HIGHLIGHTS = [23, 51, 77, 105, 134]
const VO_TOTAL = 1070

const NarratedAd: React.FC = () => (
  <>
    <Sequence from={0} durationInFrames={140}><Hook /></Sequence>
    <Sequence from={120} durationInFrames={160}><Reveal /></Sequence>
    <Sequence from={270} durationInFrames={215}><CallScene /></Sequence>
    <Sequence from={475} durationInFrames={200}><Dashboard /></Sequence>
    <Sequence from={655} durationInFrames={250}><Industries highlights={VO_HIGHLIGHTS} /></Sequence>
    <Sequence from={895} durationInFrames={VO_TOTAL - 895}><Cta /></Sequence>
  </>
)

// Series cuts: one composition per concept, language and aspect ratio.
const SERIES = Object.keys(TIMINGS).flatMap(key => {
  const [concept, lang] = key.split(".") as [Concept, Lang]
  return [["16x9", 1920, 1080], ["9x16", 1080, 1920]].map(([r, w, h]) => ({ id: `${concept}-${lang}-${r}`, concept, lang, w: w as number, h: h as number, d: TIMINGS[key].durationInFrames }))
})

export const RemotionRoot: React.FC = () => (
  <>
    {SERIES.map(s => (
      <Composition key={s.id} id={s.id} component={SeriesVideo} defaultProps={{ concept: s.concept, lang: s.lang }} durationInFrames={s.d} fps={30} width={s.w} height={s.h} />
    ))}
    <Composition id="Day16x9" component={DayAd} durationInFrames={DAY_TOTAL} fps={30} width={1920} height={1080} />
    <Composition id="Day9x16" component={DayAd} durationInFrames={DAY_TOTAL} fps={30} width={1080} height={1920} />
    <Composition id="Clean16x9" component={CleanAd} durationInFrames={CLEAN_TOTAL} fps={30} width={1920} height={1080} />
    <Composition id="Clean9x16" component={CleanAd} durationInFrames={CLEAN_TOTAL} fps={30} width={1080} height={1920} />
    <Composition id="Exotic16x9" component={ExoticAd} durationInFrames={EXOTIC_TOTAL} fps={30} width={1920} height={1080} />
    <Composition id="Exotic9x16" component={ExoticAd} durationInFrames={EXOTIC_TOTAL} fps={30} width={1080} height={1920} />
    <Composition id="Orvia16x9" component={Ad} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
    <Composition id="Orvia9x16" component={Ad} durationInFrames={TOTAL} fps={30} width={1080} height={1920} />
    <Composition id="Orvia16x9VO" component={NarratedAd} durationInFrames={VO_TOTAL} fps={30} width={1920} height={1080} />
    <Composition id="Orvia9x16VO" component={NarratedAd} durationInFrames={VO_TOTAL} fps={30} width={1080} height={1920} />
  </>
)
