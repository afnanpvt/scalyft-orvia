// Shared pieces for the light "Clean" cut: minimal palette (ink, white, grey,
// one green), timing from the narration, beat transitions, kinetic text.

import React, { createContext, useContext } from "react"
import { AbsoluteFill, Easing, Sequence, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion"
import timing from "./vo-clean-timing.json"
import { FONT } from "./theme"

export const FPS = timing.fps
export const TOTAL = timing.durationInFrames
export const U = timing.units.map(u => ({ s: Math.round(u.start * FPS), e: Math.round(u.end * FPS), text: u.text }))

// One accent only. Everything else is ink, white or grey.
export const K = {
  bg: "#F5F5F7",
  card: "#FFFFFF",
  ink: "#0A0A0B",
  muted: "#6B6B76",
  faint: "#A1A1AA",
  line: "rgba(10,10,11,0.08)",
  wash: "rgba(10,10,11,0.045)",
  green: "#10B981",
  greenDark: "#059669",
  greenWash: "#D1FAE5",
  shadow: "0 30px 80px rgba(10,10,11,0.10), 0 2px 6px rgba(10,10,11,0.05)",
}

export const ease = Easing.bezier(0.16, 1, 0.3, 1)
export const clamp = (f: number, a: number, b: number, from = 0, to = 1) =>
  interpolate(f, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease })
export const lin = (f: number, a: number, b: number, from = 0, to = 1) =>
  interpolate(f, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
export const sp = (f: number, fps: number, delay = 0, config: Record<string, number> = {}) =>
  spring({ frame: f - delay, fps, config: { damping: 15, stiffness: 120, mass: 0.9, ...config } })

// m = 1 at a 1080px short side, so both cuts share one design.
export function useL() {
  const { width, height, fps } = useVideoConfig()
  const V = height > width
  return { W: width, H: height, V, m: Math.min(width, height) / 1080, fps }
}

const BeatCtx = createContext(0)
export const useAbs = () => useCurrentFrame() + useContext(BeatCtx)

const BeatInner: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const f = useCurrentFrame()
  const inn = clamp(f, 0, 12)
  const out = clamp(f, dur - 10, dur)
  const blur = (1 - inn) * 14 + out * 10
  return (
    <AbsoluteFill style={{
      opacity: inn * (1 - out), transform: `scale(${1.07 - 0.07 * inn - 0.05 * out})`,
      filter: blur > 0.4 ? `blur(${blur}px)` : undefined,
    }}>{children}</AbsoluteFill>
  )
}

export const Beat: React.FC<{ from: number; to: number; children: React.ReactNode }> = ({ from, to, children }) => (
  <Sequence from={from} durationInFrames={to - from}>
    <BeatCtx.Provider value={from}>
      <BeatInner dur={to - from}>{children}</BeatInner>
    </BeatCtx.Provider>
  </Sequence>
)

// Plain paper background with a faint, slowly drifting dot grid.
export const Paper: React.FC = () => {
  const f = useCurrentFrame()
  const { m } = useL()
  return (
    <AbsoluteFill style={{ background: K.bg, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(10,10,11,0.09) 1.2px, transparent 1.4px)", backgroundSize: `${54 * m}px ${54 * m}px`, backgroundPosition: `${(f * 0.25) % (54 * m)}px ${(f * 0.25) % (54 * m)}px`, maskImage: "radial-gradient(ellipse at center, black 20%, transparent 78%)", WebkitMaskImage: "radial-gradient(ellipse at center, black 20%, transparent 78%)" }} />
    </AbsoluteFill>
  )
}

export const Card: React.FC<{ children?: React.ReactNode; style?: React.CSSProperties; m: number; radius?: number }> = ({ children, style, m, radius = 28 }) => (
  <div style={{ background: K.card, border: `${Math.max(1, m)}px solid ${K.line}`, borderRadius: radius * m, boxShadow: K.shadow, ...style }}>{children}</div>
)

export const Pill: React.FC<{ children: React.ReactNode; m: number; tone?: "green" | "grey" | "ink" }> = ({ children, m, tone = "green" }) => {
  const c = tone === "green" ? { fg: K.greenDark, bg: K.greenWash } : tone === "ink" ? { fg: "#fff", bg: K.ink } : { fg: K.muted, bg: K.wash }
  return <span style={{ display: "inline-block", padding: `${6 * m}px ${16 * m}px`, borderRadius: 999, background: c.bg, color: c.fg, fontSize: 21 * m, fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap", fontFamily: FONT }}>{children}</span>
}

// Words flip up in 3D, letter by letter. start is an absolute frame.
export const Kinetic: React.FC<{
  text: string; start: number; size: number; weight?: number; color?: string; align?: "left" | "center"
  tint?: Record<string, string>; stagger?: number; style?: React.CSSProperties
}> = ({ text, start, size, weight = 650, color = K.ink, align = "left", tint = {}, stagger = 1.2, style }) => {
  const f = useAbs()
  let k = 0
  return (
    <div style={{ perspective: 900, fontFamily: FONT, fontSize: size, fontWeight: weight, letterSpacing: "-0.045em", lineHeight: 1.04, textAlign: align, color, ...style }}>
      {text.split(" ").map((w, wi) => {
        const clean = w.replace(/[^A-Za-z]/g, "").toLowerCase()
        return (
          <span key={wi} style={{ display: "inline-block", whiteSpace: "nowrap", marginRight: size * 0.24 }}>
            {w.split("").map((ch, ci) => {
              const p = clamp(f, start + k++ * stagger, start + k * stagger + 14)
              return (
                <span key={ci} style={{
                  display: "inline-block", transformOrigin: "50% 100%", opacity: p,
                  transform: `rotateX(${(1 - p) * -95}deg) translateY(${(1 - p) * size * 0.35}px)`,
                  filter: p < 1 ? `blur(${(1 - p) * 8}px)` : undefined, color: tint[clean] ?? color,
                }}>{ch}</span>
              )
            })}
          </span>
        )
      })}
    </div>
  )
}

export const Spark: React.FC<{ cx: number; cy: number; f: number; start: number; n?: number; dist: number; size: number; life?: number }> = ({ cx, cy, f, start, n = 26, dist, size, life = 34 }) => {
  const t = (f - start) / life
  if (t < 0 || t > 1) return null
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const a = random(`a${i}`) * Math.PI * 2, d = (0.35 + random(`d${i}`) * 0.65) * dist
        const e = 1 - Math.pow(1 - t, 3)
        const c = i % 3 === 0 ? K.ink : K.green
        return <span key={i} style={{ position: "absolute", left: cx + Math.cos(a) * d * e - size / 2, top: cy + Math.sin(a) * d * e - size / 2 + t * t * dist * 0.25, width: size * (1 - t * 0.7), height: size * (1 - t * 0.7), borderRadius: 999, background: c, opacity: 1 - t }} />
      })}
    </>
  )
}

export const PhoneGlyph: React.FC<{ size: number; color?: string }> = ({ size, color = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
)

export const CheckGlyph: React.FC<{ size: number; color?: string; draw?: number }> = ({ size, color = "#fff", draw = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
  </svg>
)
