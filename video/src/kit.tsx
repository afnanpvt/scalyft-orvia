// Shared pieces for the "Exotic" cut: palette, timing from the narration,
// the persistent background, beat transitions and kinetic text.

import React, { createContext, useContext } from "react"
import { AbsoluteFill, Easing, Sequence, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion"
import timing from "./vo2-timing.json"
import { FONT } from "./theme"

export const FPS = timing.fps
export const TOTAL = timing.durationInFrames
// Narration units as frame numbers.
export const U = timing.units.map(u => ({ s: Math.round(u.start * FPS), e: Math.round(u.end * FPS), text: u.text }))

export const P = {
  ink: "#07080B",
  white: "#F5F6F8",
  dim: "rgba(245,246,248,0.62)",
  line: "rgba(255,255,255,0.14)",
  glass: "linear-gradient(145deg, rgba(255,255,255,0.11), rgba(255,255,255,0.04))",
  green: "#10B981",
  mint: "#34D399",
  cyan: "#22D3EE",
  violet: "#8B5CF6",
  amber: "#F59E0B",
  rose: "#FB7185",
}

export const ease = Easing.bezier(0.16, 1, 0.3, 1)
export const clamp = (f: number, a: number, b: number, from = 0, to = 1) =>
  interpolate(f, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease })
export const lin = (f: number, a: number, b: number, from = 0, to = 1) =>
  interpolate(f, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
export const sp = (f: number, fps: number, delay = 0, config: Record<string, number> = {}) =>
  spring({ frame: f - delay, fps, config: { damping: 15, stiffness: 120, mass: 0.9, ...config } })

// Layout helper: m = 1 at a 1080px short side, so both cuts share one design.
export function useL() {
  const { width, height, fps } = useVideoConfig()
  const V = height > width
  return { W: width, H: height, V, m: Math.min(width, height) / 1080, fps }
}

// A beat knows its own start so children can read absolute video frames.
const BeatCtx = createContext(0)
export const useAbs = () => useCurrentFrame() + useContext(BeatCtx)

const BeatInner: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const f = useCurrentFrame()
  const inn = clamp(f, 0, 12)
  const out = clamp(f, dur - 10, dur)
  const blur = (1 - inn) * 16 + out * 12
  return (
    <AbsoluteFill style={{
      opacity: inn * (1 - out), transform: `scale(${1.1 - 0.1 * inn - 0.07 * out})`,
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

// ─── Persistent background ───────────────────────────────

export const World: React.FC = () => {
  const f = useCurrentFrame()
  const { W, H, m } = useL()
  const blobs = [
    { c: "rgba(16,185,129,0.34)", x: 0.25, y: 0.3, r: 0.75, sx: 0.011, sy: 0.009 },
    { c: "rgba(139,92,246,0.30)", x: 0.78, y: 0.7, r: 0.8, sx: 0.008, sy: 0.012 },
    { c: "rgba(34,211,238,0.22)", x: 0.7, y: 0.2, r: 0.6, sx: 0.013, sy: 0.007 },
  ]
  return (
    <AbsoluteFill style={{ background: P.ink, overflow: "hidden" }}>
      {blobs.map((b, i) => {
        const x = (b.x + Math.sin(f * b.sx + i * 2) * 0.16) * W
        const y = (b.y + Math.cos(f * b.sy + i) * 0.14) * H
        const r = b.r * Math.max(W, H)
        return <div key={i} style={{ position: "absolute", left: x - r / 2, top: y - r / 2, width: r, height: r, borderRadius: 999, background: `radial-gradient(circle, ${b.c}, transparent 62%)` }} />
      })}
      {/* faint perspective grid floor */}
      <div style={{ position: "absolute", left: "-30%", right: "-30%", bottom: "-8%", height: "55%", perspective: 700 * m, opacity: 0.35 }}>
        <div style={{
          position: "absolute", inset: 0, transform: "rotateX(68deg)", transformOrigin: "50% 100%",
          backgroundImage: "linear-gradient(rgba(255,255,255,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.10) 1px, transparent 1px)",
          backgroundSize: `${90 * m}px ${90 * m}px`, backgroundPosition: `0 ${(f * 1.4) % (90 * m)}px`,
          maskImage: "linear-gradient(to top, black, transparent 85%)", WebkitMaskImage: "linear-gradient(to top, black, transparent 85%)",
        }} />
      </div>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.65) 100%)" }} />
    </AbsoluteFill>
  )
}

// ─── Building blocks ─────────────────────────────────────

export const Glass: React.FC<{ children?: React.ReactNode; style?: React.CSSProperties; m: number; glow?: string }> = ({ children, style, m, glow }) => (
  <div style={{
    background: P.glass, border: `${Math.max(1, m)}px solid ${P.line}`, borderRadius: 30 * m,
    boxShadow: `0 ${30 * m}px ${80 * m}px rgba(0,0,0,0.45)${glow ? `, 0 0 ${60 * m}px ${glow}` : ""}`,
    ...style,
  }}>{children}</div>
)

// Words flip up in 3D, letter by letter. start is an absolute frame.
export const Kinetic: React.FC<{
  text: string; start: number; size: number; weight?: number; color?: string; align?: "left" | "center"
  tint?: Record<string, string>; stagger?: number; style?: React.CSSProperties
}> = ({ text, start, size, weight = 650, color = P.white, align = "left", tint = {}, stagger = 1.2, style }) => {
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

export const Spark: React.FC<{ cx: number; cy: number; f: number; start: number; n?: number; dist: number; size: number; colors?: string[]; life?: number }> = ({ cx, cy, f, start, n = 28, dist, size, colors = [P.mint, P.cyan, P.white, P.violet], life = 34 }) => {
  const t = (f - start) / life
  if (t < 0 || t > 1) return null
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const a = random(`a${i}`) * Math.PI * 2, d = (0.35 + random(`d${i}`) * 0.65) * dist
        const e = 1 - Math.pow(1 - t, 3)
        return <span key={i} style={{
          position: "absolute", left: cx + Math.cos(a) * d * e - size / 2, top: cy + Math.sin(a) * d * e - size / 2 + t * t * dist * 0.25,
          width: size * (1 - t * 0.7), height: size * (1 - t * 0.7), borderRadius: 999, background: colors[i % colors.length], opacity: 1 - t,
          boxShadow: `0 0 ${size * 2}px ${colors[i % colors.length]}`,
        }} />
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
