import React from "react"
import { Composition, Sequence } from "remotion"
import { CallScene, Cta, Dashboard, Hook, Industries, Reveal } from "./scenes"

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

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Orvia16x9" component={Ad} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
    <Composition id="Orvia9x16" component={Ad} durationInFrames={TOTAL} fps={30} width={1080} height={1920} />
  </>
)
