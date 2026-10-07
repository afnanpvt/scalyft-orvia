// Shared pieces for the series cuts: the dashboard palette, per-language fonts,
// narration timing, captions, brand mark and the closing call to action.

import React, { createContext, useContext } from "react"
import { AbsoluteFill, Audio, Easing, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion"
import { loadFont as loadDeva } from "@remotion/google-fonts/NotoSansDevanagari"
import { loadFont as loadTamil } from "@remotion/google-fonts/NotoSansTamil"
import { loadFont as loadTelugu } from "@remotion/google-fonts/NotoSansTelugu"
import copy from "./copy.json"
import timings from "./timings.json"
import { FONT, Logo, MONO, PhoneIcon } from "../theme"

export { MONO, Logo, PhoneIcon }
export { Check } from "../theme"

const deva = loadDeva("normal", { weights: ["400", "500", "600", "700"], subsets: ["devanagari"] })
const tamil = loadTamil("normal", { weights: ["400", "500", "600", "700"], subsets: ["tamil"] })
const telugu = loadTelugu("normal", { weights: ["400", "500", "600", "700"], subsets: ["telugu"] })
export const STACK = [FONT, deva.fontFamily, tamil.fontFamily, telugu.fontFamily].map(f => `"${f}"`).join(", ") + ", sans-serif"

export type Lang = keyof typeof copy.langs
export type Concept = keyof typeof copy.units
export interface Timing { fps: number; durationInFrames: number; units: { text: string; start: number; end: number }[] }
export const TIMINGS = timings as unknown as Record<string, Timing>
export const LANGS = copy.langs as Record<string, { market: "intl" | "in"; label: string; voice: string; rate: string }>
export type UI = typeof copy.ui.en
export const UIS = copy.ui as Record<string, UI>
export const FLOWS = copy.flow as Record<string, { caller: string; agent: string; service: string; time: string }>

// The dashboard's light tokens.
export const T = {
  bg: "#F5F5F7", card: "#FFFFFF", ink: "#0A0A0B", muted: "#6B6B76", line: "rgba(10,10,11,0.08)", chip: "#F0F0F3",
  green: "#10B981", greenLight: "#34D399", greenText: "#059669", wash: "#D1FAE5",
  red: "#EF4444", redText: "#DC2626", redWash: "#FEE2E2", amber: "#F59E0B", indigo: "#6366F1", sky: "#0EA5E9",
}
export const shadow = (m: number, k = 1) => `0 ${24 * m * k}px ${70 * m * k}px rgba(10,10,11,0.12), 0 ${2 * m}px ${6 * m}px rgba(10,10,11,0.05)`

const ease = Easing.bezier(0.16, 1, 0.3, 1)
export const clamp = (f: number, a: number, b: number, from = 0, to = 1) =>
  interpolate(f, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease })
export const lin = (f: number, a: number, b: number, from = 0, to = 1) =>
  interpolate(f, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
export const sp = (f: number, fps: number, delay = 0, config: Record<string, number> = {}) =>
  spring({ frame: f - delay, fps, config: { damping: 15, stiffness: 120, mass: 0.9, ...config } })
export const typed = (text: string, f: number, start: number, cps = 1.6) => text.slice(0, Math.max(0, Math.floor((f - start) * cps)))

interface Ctx { concept: Concept; lang: Lang; market: "intl" | "in"; U: { s: number; e: number; text: string }[]; ui: UI; total: number }
const SeriesCtx = createContext<Ctx>(null as unknown as Ctx)

// m = 1 at a 1080px short side so both aspect ratios share one design.
export function useS() {
  const c = useContext(SeriesCtx)
  const f = useCurrentFrame()
  const { width: W, height: H, fps } = useVideoConfig()
  return { ...c, f, W, H, fps, V: H > W, m: Math.min(W, H) / 1080 }
}

export const durationOf = (concept: string, lang: string) => TIMINGS[`${concept}.${lang}`].durationInFrames

// ─── Captions, brand, CTA ────────────────────────────────

const Captions: React.FC = () => {
  const { f, U, m, V, H } = useS()
  const last = U.length - 1
  const i = U.findIndex((u, j) => f >= u.s - 4 && f < (U[j + 1]?.s ?? 1e9) - 4)
  if (i < 0 || i >= last) return null
  const u = U[i]
  const p = clamp(f, u.s - 4, u.s + 8) * (1 - clamp(f, u.e + 10, u.e + 20))
  return (
    <div style={{ position: "absolute", left: "7%", right: "7%", bottom: H * (V ? 0.07 : 0.065), textAlign: "center", fontFamily: STACK, fontSize: (V ? 50 : 44) * m, fontWeight: 600, lineHeight: 1.25, letterSpacing: "-0.02em", color: T.ink, opacity: p, transform: `translateY(${(1 - p) * 18 * m}px)` }}>
      {u.text}
    </div>
  )
}

const Brand: React.FC = () => {
  const { m, V, ui } = useS()
  return (
    <div style={{ position: "absolute", left: (V ? 52 : 64) * m, top: (V ? 56 : 52) * m, display: "flex", alignItems: "center", gap: 14 * m, fontFamily: STACK }}>
      <Logo size={46 * m} dark />
      <span style={{ fontSize: 34 * m, fontWeight: 700, letterSpacing: "-0.04em", color: T.ink }}>Orvia</span>
      <span style={{ marginLeft: 6 * m, padding: `${6 * m}px ${16 * m}px`, borderRadius: 999, background: T.wash, color: T.greenText, fontSize: 20 * m, fontWeight: 650, whiteSpace: "nowrap" }}>{ui.aiTag}</span>
    </div>
  )
}

export const Confetti: React.FC<{ cx: number; cy: number; start: number; dist: number; n?: number }> = ({ cx, cy, start, dist, n = 30 }) => {
  const { f, m } = useS()
  const t = (f - start) / 40
  if (t < 0 || t > 1) return null
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const a = random(`a${i}`) * Math.PI * 2, d = (0.3 + random(`d${i}`) * 0.7) * dist, e = 1 - Math.pow(1 - t, 3)
        const c = [T.green, T.greenLight, T.ink, T.amber][i % 4]
        return <span key={i} style={{ position: "absolute", left: cx + Math.cos(a) * d * e - 6 * m, top: cy + Math.sin(a) * d * e - 6 * m + t * t * 90 * m, width: 12 * m * (1 - t * 0.6), height: 12 * m * (1 - t * 0.6), borderRadius: i % 2 ? 99 : 3, background: c, opacity: 1 - t, transform: `rotate(${t * 360 * (i % 2 ? 1 : -1)}deg)` }} />
      })}
    </>
  )
}

// A pointer that travels through [frame, x, y] points and fades after the last.
export const Pointer: React.FC<{ pts: [number, number, number][]; size?: number }> = ({ pts, size = 54 }) => {
  const { f, m } = useS()
  if (f < pts[0][0] - 6 || f > pts[pts.length - 1][0] + 16) return null
  const xs = pts.map(p => p[0])
  const x = interpolate(f, xs, pts.map(p => p[1]), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) })
  const y = interpolate(f, xs, pts.map(p => p[2]), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) })
  const o = clamp(f, pts[0][0] - 6, pts[0][0]) * (1 - clamp(f, pts[pts.length - 1][0] + 6, pts[pts.length - 1][0] + 16))
  const last = pts[pts.length - 1][0]
  const press = f >= last - 3 && f < last + 3 ? 0.88 : 1
  return (
    <svg width={size * m} height={size * m} viewBox="0 0 24 24" style={{ position: "absolute", left: x, top: y, opacity: o, transform: `scale(${press})`, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.3))" }}>
      <path d="M4 2l16 9-7 2-3 7z" fill={T.ink} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

export const Ripple: React.FC<{ cx: number; cy: number; at: number; size?: number }> = ({ cx, cy, at, size = 220 }) => {
  const { f, m } = useS()
  const t = (f - at) / 26
  if (t < 0 || t > 1) return null
  return <span style={{ position: "absolute", left: cx - (size * m) / 2, top: cy - (size * m) / 2, width: size * m, height: size * m, borderRadius: "50%", border: `${4 * m}px solid rgba(16,185,129,${0.9 * (1 - t)})`, transform: `scale(${0.4 + t * 2.6})` }} />
}

const Cta: React.FC = () => {
  const { f, U, ui, W, H, V, m, fps } = useS()
  const s = U[U.length - 1].s
  const veil = clamp(f, s - 10, s + 8)
  if (veil <= 0) return null
  const logo = sp(f, fps, s + 2, { damping: 13, stiffness: 100 })
  const btn = sp(f, fps, s + 10, { damping: 13, stiffness: 110 })
  const tClick = s + 52
  const press = f >= tClick && f < tClick + 8 ? 0.95 : 1
  const bx = W / 2, by = H * (V ? 0.58 : 0.64)
  const cp = clamp(f, s + 24, tClick - 2)
  const cx = bx + (1 - cp) * (V ? 260 : 420) * m + Math.sin(cp * Math.PI) * -50 * m
  const cy = by + (1 - cp) * (V ? 300 : 220) * m + Math.sin(cp * Math.PI) * 40 * m + 20 * m
  return (
    <AbsoluteFill style={{ opacity: veil, background: T.bg }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 38%, rgba(16,185,129,0.2), transparent 62%)` }} />
      <div style={{ position: "absolute", left: W / 2 - 110 * m, top: H * (V ? 0.26 : 0.18), width: 220 * m, transform: `scale(${0.5 + 0.5 * logo})`, opacity: Math.min(1, logo * 1.4), filter: `drop-shadow(0 ${20 * m}px ${40 * m}px rgba(10,10,11,0.18))` }}>
        <Logo size={220 * m} dark />
      </div>
      <div style={{ position: "absolute", left: W / 2, top: H * (V ? 0.42 : 0.44), transform: "translateX(-50%)", fontFamily: STACK, fontSize: 68 * m, fontWeight: 700, letterSpacing: "-0.04em", color: T.ink, opacity: clamp(f, s + 6, s + 20) }}>Orvia</div>
      <div style={{ position: "absolute", left: bx, top: by, width: W * 0.94, transform: `translate(-50%, -50%) scale(${(0.6 + 0.4 * btn) * press})`, opacity: Math.min(1, btn * 1.4), textAlign: "center", fontFamily: STACK }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 18 * m, padding: `${28 * m}px ${(V ? 48 : 64) * m}px`, borderRadius: 999, background: T.ink, color: T.bg, fontSize: (V ? 38 : 46) * m, fontWeight: 650, letterSpacing: "-0.02em", maxWidth: "100%", boxShadow: shadow(m) }}>
          <PhoneIcon size={40 * m} color={T.bg} /> {ui.demo}
        </div>
        <p style={{ margin: `${22 * m}px 0 0`, fontSize: 30 * m, color: T.muted, opacity: clamp(f, s + 18, s + 32) }}>{ui.nosignup}</p>
      </div>
      <Ripple cx={bx} cy={by} at={tClick} />
      <Confetti cx={bx} cy={by} start={tClick} dist={320 * m} />
      {cp > 0 && f < tClick + 14 && (
        <svg width={54 * m} height={54 * m} viewBox="0 0 24 24" style={{ position: "absolute", left: cx, top: cy, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.3))", opacity: clamp(f, s + 24, s + 30) * (1 - clamp(f, tClick + 6, tClick + 14)) }}>
          <path d="M4 2l16 9-7 2-3 7z" fill={T.ink} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      )}
    </AbsoluteFill>
  )
}

// A faint dotted backdrop shared by every scene.
const Backdrop: React.FC = () => {
  const { f, m } = useS()
  return (
    <AbsoluteFill style={{ background: T.bg }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(rgba(10,10,11,0.09) ${1.6 * m}px, transparent ${1.8 * m}px)`, backgroundSize: `${34 * m}px ${34 * m}px`, backgroundPosition: `${(f * 0.25) % (34 * m)}px 0`, maskImage: "radial-gradient(ellipse at center, black 25%, transparent 75%)", WebkitMaskImage: "radial-gradient(ellipse at center, black 25%, transparent 75%)" }} />
    </AbsoluteFill>
  )
}

export const Shell: React.FC<{ concept: Concept; lang: Lang; children: React.ReactNode }> = ({ concept, lang, children }) => {
  const t = TIMINGS[`${concept}.${lang}`]
  const U = t.units.map(u => ({ s: Math.round(u.start * t.fps), e: Math.round(u.end * t.fps), text: u.text }))
  const ctx: Ctx = { concept, lang, market: LANGS[lang].market, U, ui: UIS[lang], total: t.durationInFrames }
  return (
    <SeriesCtx.Provider value={ctx}>
      <AbsoluteFill style={{ fontFamily: STACK }}>
        <style>{"p,h1,h2,h3{margin:0}"}</style>
        <Backdrop />
        {children}
        <Captions />
        <Brand />
        <Cta />
        <Audio src={staticFile(`series/${concept}.${lang}.wav`)} />
      </AbsoluteFill>
    </SeriesCtx.Provider>
  )
}

// Mock data per market. Names and amounts are illustrative.
export const DATA = {
  intl: {
    cur: "$", loc: "en-US",
    missed: [
      { who: "Jenna W.", t: "1:05 PM", v: 320, slot: "Tue 9:00 AM" },
      { who: "Mike R.", t: "4:40 PM", v: 180, slot: "Wed 2:30 PM" },
      { who: "Sara L.", t: "11:52 PM", v: 450, slot: "Thu 8:00 AM" },
    ],
    names: ["Jenna W.", "Mike R.", "Sara L.", "Omar K."],
  },
  in: {
    cur: "₹", loc: "en-IN",
    missed: [
      { who: "Priya S.", t: "1:05 PM", v: 1200, slot: "Tue 10:00 AM" },
      { who: "Rahul K.", t: "4:40 PM", v: 800, slot: "Wed 4:30 PM" },
      { who: "Meena R.", t: "11:52 PM", v: 2500, slot: "Thu 11:00 AM" },
    ],
    names: ["Priya S.", "Rahul K.", "Meena R.", "Arjun V."],
  },
} as const
export const money = (market: "intl" | "in", n: number) => `${DATA[market].cur}${Math.round(n).toLocaleString(DATA[market].loc)}`

export const Glyph: React.FC<{ kind: "drop" | "tooth" | "snow" | "house" | "cross" | "scissors" | "cap"; size: number; color?: string }> = ({ kind, size, color = "#fff" }) => {
  const d: Record<string, React.ReactNode> = {
    drop: <path d="M12 3C12 3 6 10 6 14a6 6 0 0 0 12 0c0-4-6-11-6-11z" />,
    tooth: <path d="M7 4C4.8 4 3.5 5.6 3.5 8c0 3 1.5 4.5 2 7 .4 2 1 5 2 5s1.2-4 2-4h2c.8 0 1 4 2 4s1.6-3 2-5c.5-2.5 2-4 2-7 0-2.4-1.3-4-3.5-4-1.3 0-2 .7-3 .7S8.3 4 7 4z" />,
    snow: <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 2 3-2M9 20l3-2 3 2" />,
    house: <path d="M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6" />,
    cross: <path d="M12 5v14M5 12h14" />,
    scissors: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M8.1 8.1L20 20M8.1 15.9L20 4" /></>,
    cap: <path d="M2 9l10-5 10 5-10 5zM6 11.5V16c3 2.5 9 2.5 12 0v-4.5" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d[kind]}</svg>
}
export const GLYPHS = {
  intl: ["drop", "tooth", "snow", "house"],
  in: ["cross", "scissors", "cap", "snow"],
} as const
export const NICHE_COLORS = [T.sky, T.indigo, T.green, T.amber]
