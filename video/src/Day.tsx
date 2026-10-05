import React from "react"
import { AbsoluteFill, Audio, Easing, interpolate, random, staticFile, useCurrentFrame } from "remotion"
import timing from "./vo-day-timing.json"
import { Check, FONT, Logo, MONO, PhoneIcon, typed } from "./theme"
import { clamp, lin, sp, useL } from "./kit"

// "Open 24 Hours": four calls across one day. The dashboard's own light
// theme, with the scene sliding into the dark theme at night. Voice only.

const FPS = timing.fps
const TOTAL = timing.durationInFrames
const U = timing.units.map(u => ({ s: Math.round(u.start * FPS), e: Math.round(u.end * FPS), text: u.text }))
export const DAY_TOTAL = TOTAL

const G = { green: "#10B981", greenLight: "#34D399", amber: "#F59E0B", rose: "#EF4444" }

// ─── Time of day ─────────────────────────────────────────

// [frame, minutes since midnight of day one]. The clock rolls between calls.
const KEYS: [number, number][] = [
  [0, 0], [U[0].s + 6, 375],
  [U[2].s - 28, 375], [U[2].s + 2, 760],
  [U[4].s - 28, 760], [U[4].s + 2, 1135],
  [U[6].s - 32, 1135], [U[6].s, 1563],
  [U[7].e + 6, 1563], [U[8].s + 30, 1980],
  [TOTAL, 1980],
]
const roll = Easing.inOut(Easing.cubic)
function minutesAt(f: number) {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [f0, m0] = KEYS[i], [f1, m1] = KEYS[i + 1]
    if (f <= f1) return f1 === f0 ? m1 : m0 + (m1 - m0) * roll(Math.min(1, Math.max(0, (f - f0) / (f1 - f0))))
  }
  return KEYS[KEYS.length - 1][1]
}
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const bump = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2))

function useDay() {
  const f = useCurrentFrame()
  const m = minutesAt(f)
  const speed = Math.abs(minutesAt(f + 1) - minutesAt(f - 1)) / 2
  const h = (m / 60) % 24
  const n = 1 - smooth(4.5, 6.5, h) * (1 - smooth(19.5, 21.5, h))
  const warm = Math.min(1, bump(h, 6.2, 2.2) * 0.9 + bump(h, 18.3, 2.0))
  return { f, m, h, n, warm, speed, T: theme(n) }
}

// ─── Theme (the dashboard's light and dark tokens, blended) ─

const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const mix = (a: string, b: string, t: number) => {
  const x = hex(a), y = hex(b)
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`
}
function theme(n: number) {
  const c = Math.round(10 + 245 * n)
  return {
    bg: mix("#F5F5F7", "#0C0C0E", n), card: mix("#FFFFFF", "#1C1C1F", n), ink: mix("#0A0A0B", "#EBEBF0", n),
    muted: mix("#6B6B76", "#9A9AA6", n), chip: mix("#F0F0F3", "#27272B", n),
    line: `rgba(${c},${c},${c},${0.08 + 0.03 * n})`,
    wash: mix("#D1FAE5", "#0B3B2C", n), greenText: mix("#059669", "#34D399", n),
    shadow: (m: number) => `0 ${24 * m}px ${70 * m}px rgba(${Math.round(10 * (1 - n))},${Math.round(10 * (1 - n))},${Math.round(11 * (1 - n))},${0.1 + 0.5 * n}), 0 ${2 * m}px ${6 * m}px rgba(0,0,0,${0.04 + 0.2 * n})`,
  }
}
type Th = ReturnType<typeof theme>

// ─── Layout ──────────────────────────────────────────────

function useLay() {
  const { W, H, V, m } = useL()
  const cw = (V ? 920 : 640) * m
  const k = cw / (640 * m)
  return {
    W, H, V, m, k, cw,
    dial: V ? { x: W / 2, y: H * 0.205, D: 470 * m } : { x: W * 0.235, y: H * 0.47, D: 500 * m },
    card: V ? { x: W / 2, y: H * 0.56 } : { x: W * 0.69, y: H * 0.43 },
    ledgerY: V ? H * 0.78 : H * 0.8,
    capY: V ? H * 0.9 : H * 0.925,
  }
}

// ─── World ───────────────────────────────────────────────

const World: React.FC = () => {
  const { f, h, n, warm, T } = useDay()
  const { W, H, m } = useLay()
  // Sun by day, moon by night, each riding an arc across the sky.
  const sunP = Math.min(1, Math.max(0, (h - 5) / 14))
  const hh = h < 12 ? h + 24 : h
  const moonP = Math.min(1, Math.max(0, (hh - 19) / 10))
  const pos = (p: number) => ({ x: W * (0.08 + 0.84 * p), y: H * (0.62 - 0.46 * Math.sin(Math.PI * p)) })
  const sun = pos(sunP), moon = pos(moonP)
  const R = 620 * m
  return (
    <AbsoluteFill style={{ background: T.bg, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: sun.x - R / 2, top: sun.y - R / 2, width: R, height: R, borderRadius: "50%", background: `radial-gradient(circle, rgba(255,196,120,${0.5 * (1 - n)}), transparent 62%)` }} />
      <div style={{ position: "absolute", left: moon.x - R / 2, top: moon.y - R / 2, width: R, height: R, borderRadius: "50%", background: `radial-gradient(circle, rgba(140,160,255,${0.22 * n}), transparent 62%)` }} />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 110%, rgba(247,170,120,${0.28 * warm * (1 - n)}), transparent 60%)` }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${T.line} ${1.6 * m}px, transparent ${1.8 * m}px)`, backgroundSize: `${34 * m}px ${34 * m}px`, backgroundPosition: `${(f * 0.2) % (34 * m)}px 0`, opacity: 0.9, maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)", WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)" }} />
    </AbsoluteFill>
  )
}

// ─── The 24-hour dial ────────────────────────────────────

const DIAL_STOPS = "#1B2236 0deg, #232C45 60deg, #F2B28C 97deg, #FBE3B0 130deg, #FFF3D1 180deg, #FBE3B0 230deg, #F4A573 285deg, #343A66 315deg, #1B2236 360deg"

const Dial: React.FC<{ logo: number }> = ({ logo }) => {
  const { f, m: minutes, n, speed, T } = useDay()
  const { m } = useLay()
  const L = useLay()
  const p = dialPose(f, L)
  const D = p.D
  const ringW = 44 * m * (D / (500 * m))
  const total = Math.floor(minutes) % 1440
  const hr = Math.floor(total / 60), mn = total % 60
  const h12 = hr % 12 || 12
  const ampm = hr < 12 ? "AM" : "PM"
  const angle = (minutes % 1440) / 1440 * 360
  const blur = Math.min(7, speed * 0.1)
  const hand = (op: number, child: React.ReactNode) => <span style={{ position: "absolute", left: "50%", top: ringW / 2 - 24 * m, width: 48 * m, height: 48 * m, marginLeft: -24 * m, opacity: op }}>{child}</span>
  return (
    <div style={{ position: "absolute", left: p.x - D / 2, top: p.y - D / 2, width: D, height: D, perspective: 1600 * m }}>
      <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: `rotateX(${14 - logo * 14}deg) rotateY(${Math.sin(f * 0.02) * 9 * (1 - logo)}deg)` }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: T.shadow(m), background: T.card }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: `conic-gradient(from 0deg, ${DIAL_STOPS})`, WebkitMask: `radial-gradient(circle, transparent ${D / 2 - ringW}px, #000 ${D / 2 - ringW + 1}px)`, mask: `radial-gradient(circle, transparent ${D / 2 - ringW}px, #000 ${D / 2 - ringW + 1}px)`, transform: `rotate(${logo * f * 0.4}deg)` }} />
        {Array.from({ length: 24 }, (_, i) => (
          <span key={i} style={{ position: "absolute", inset: 0, transform: `rotate(${i * 15}deg)` }}>
            <span style={{ position: "absolute", left: "50%", top: ringW + 8 * m, width: 2 * m, height: (i % 6 === 0 ? 16 : 8) * m, marginLeft: -1 * m, background: T.muted, opacity: 0.5 }} />
          </span>
        ))}
        <span style={{ position: "absolute", inset: 0, transform: `rotate(${angle}deg)`, opacity: 1 - logo * 0.6 }}>
          {hand(1 - n, <span style={{ display: "block", width: "100%", height: "100%", borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #FFF1B8, #F59E0B)", boxShadow: `0 0 ${24 * m}px rgba(245,158,11,0.8)`, border: `${3 * m}px solid #fff` }} />)}
          {hand(n, <span style={{ display: "block", width: "100%", height: "100%", borderRadius: "50%", background: "#1B2236", border: `${3 * m}px solid #C7D2FE`, boxShadow: `0 0 ${24 * m}px rgba(140,160,255,0.8)`, position: "relative", overflow: "hidden" }}><span style={{ position: "absolute", left: 14 * m, top: -4 * m, width: 34 * m, height: 34 * m, borderRadius: "50%", background: "#1B2236" }} /><span style={{ position: "absolute", left: 5 * m, top: 6 * m, width: 26 * m, height: 26 * m, borderRadius: "50%", boxShadow: `inset ${-8 * m}px ${-2 * m}px 0 0 #C7D2FE` }} /></span>)}
        </span>
        <div style={{ position: "absolute", left: ringW + 24 * m, top: ringW + 24 * m, right: ringW + 24 * m, bottom: ringW + 24 * m, borderRadius: "50%", background: T.card, border: `${Math.max(1, m)}px solid ${T.line}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: MONO, color: T.ink }}>
          <div style={{ opacity: 1 - logo, filter: `blur(${blur}px)`, textAlign: "center" }}>
            <div style={{ fontSize: 92 * m * (D / (500 * m)), fontWeight: 600, letterSpacing: "-0.05em", lineHeight: 1 }}>{h12}:{String(mn).padStart(2, "0")}</div>
            <div style={{ fontSize: 30 * m, letterSpacing: "0.3em", color: T.muted, marginTop: 8 * m, fontWeight: 500 }}>{ampm}</div>
          </div>
          <div style={{ position: "absolute", opacity: logo, transform: `scale(${0.6 + 0.4 * logo})` }}><Logo size={150 * m * (D / (500 * m))} dark={n < 0.5} /></div>
        </div>
      </div>
    </div>
  )
}

// The dial slides to the middle for the ending.
function dialPose(f: number, L: ReturnType<typeof useLay>) {
  const t = clamp(f, U[10].s - 14, U[10].s + 18)
  const endX = L.W / 2, endY = L.V ? L.H * 0.3 : L.H * 0.285
  const endD = (L.V ? 560 : 430) * L.m
  return { x: L.dial.x + (endX - L.dial.x) * t, y: L.dial.y + (endY - L.dial.y) * t, D: L.dial.D + (endD - L.dial.D) * t }
}

// ─── Call card ───────────────────────────────────────────

const CALLS = [
  { name: "Jenna W.", ini: "J", svc: "Leaking tap", niche: "Plumbing", c: "#10B981", caller: "My kitchen tap won't stop dripping.", agent: "I can send someone at 9:00 AM. Shall I book it?", out: "Booked · 9:00 AM", short: "9:00 AM", t: "6:15 AM" },
  { name: "Omar K.", ini: "O", svc: "Teeth cleaning", niche: "Dental", c: "#6366F1", caller: "Do you have a cleaning slot this week?", agent: "Friday at 3:30 PM is open. Booking it now.", out: "Booked · Fri 3:30 PM", short: "Fri 3:30", t: "12:40 PM" },
  { name: "Rachel T.", ini: "R", svc: "AC not cooling", niche: "HVAC", c: "#0EA5E9", caller: "Our air conditioner has stopped cooling.", agent: "A technician can visit Saturday at 10:00 AM.", out: "Booked · Sat 10:00 AM", short: "Sat 10:00", t: "6:55 PM" },
  { name: "Daniel M.", ini: "D", svc: "Burst pipe", niche: "Plumbing", c: "#EF4444", caller: "A pipe just burst. There's water everywhere!", agent: "Stay calm. I'm sending an emergency plumber now.", out: "Emergency visit · 6:30 AM", short: "6:30 AM", t: "2:03 AM", emergency: true },
]

const callTimes = (i: number) => {
  const a = U[2 * i].s, b = U[2 * i + 1].s, bEnd = U[2 * i + 1].e
  const tIn = a - 10
  const tOut = i < 3 ? U[2 * (i + 1)].s - 30 : U[8].s - 8
  return { a, b, bEnd, tIn, tOut }
}

const CardView: React.FC<{ i: number; f: number }> = ({ i, f }) => {
  const c = CALLS[i]
  const { T, n } = useDay()
  const { m, k, cw } = useLay()
  const { a, b, bEnd } = callTimes(i)
  const done = f >= bEnd - 8
  const speaking = f >= a && f < bEnd
  const pulse = (f % 36) / 36
  const outP = clamp(f, bEnd - 12, bEnd + 2)
  const tool1 = clamp(f, b + 8, b + 16), tool2 = clamp(f, b + 26, b + 34)
  return (
    <div style={{ width: cw, background: T.card, borderRadius: 34 * m * k, border: `${Math.max(1, m)}px solid ${T.line}`, boxShadow: `${T.shadow(m)}${c.emergency ? `, 0 0 ${70 * m * (0.5 + 0.5 * Math.sin(f * 0.2))}px rgba(239,68,68,${0.35 * clamp(f, a, a + 20)})` : ""}`, padding: 36 * m * k, fontFamily: FONT, color: T.ink, position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 * m * k }}>
        <div style={{ width: 72 * m * k, height: 72 * m * k, borderRadius: "50%", background: `${c.c}22`, color: c.c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 * m * k, fontWeight: 700, flexShrink: 0 }}>{c.ini}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 34 * m * k, fontWeight: 650, letterSpacing: "-0.03em" }}>{c.name}</p>
          <p style={{ margin: `${2 * m}px 0 0`, fontSize: 22 * m * k, color: T.muted }}>{c.svc} · <span style={{ color: c.c, fontWeight: 600 }}>{c.niche}</span></p>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 * m * k, padding: `${8 * m * k}px ${18 * m * k}px`, borderRadius: 999, fontSize: 22 * m * k, fontWeight: 650, background: done ? T.wash : T.chip, color: done ? T.greenText : T.muted, whiteSpace: "nowrap" }}>
          {done ? <Check size={22 * m * k} color={n > 0.5 ? "#34D399" : "#059669"} /> : (
            <span style={{ position: "relative", width: 12 * m * k, height: 12 * m * k }}>
              <span style={{ position: "absolute", inset: -7 * m * k * pulse, borderRadius: 99, background: G.green, opacity: 0.4 * (1 - pulse) }} />
              <span style={{ position: "absolute", inset: 0, borderRadius: 99, background: G.green }} />
            </span>
          )}
          {done ? "Booked" : "Live"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 * m * k, height: 46 * m * k, margin: `${18 * m * k}px 0 ${12 * m * k}px` }}>
        {Array.from({ length: 34 }, (_, j) => {
          const amp = speaking ? Math.abs(Math.sin(f * 0.3 + j * 0.7)) * Math.abs(Math.sin(j * 0.45 + f * 0.1)) : 0.04
          return <span key={j} style={{ width: 6 * m * k, height: (0.1 + amp * 0.9) * 46 * m * k, borderRadius: 99, background: j % 2 ? c.c : T.ink, opacity: speaking ? 0.35 + amp * 0.65 : 0.2 }} />
        })}
      </div>
      <div style={{ minHeight: 160 * m * k, display: "flex", flexDirection: "column", gap: 12 * m * k }}>
        <div style={{ alignSelf: "flex-start", maxWidth: "88%", padding: `${14 * m * k}px ${22 * m * k}px`, borderRadius: 24 * m * k, borderBottomLeftRadius: 8 * m * k, background: T.chip, fontSize: 25 * m * k, lineHeight: 1.3, letterSpacing: "-0.01em", opacity: f >= a + 6 ? 1 : 0 }}>
          {typed(c.caller, f, a + 6, 1.4)}
        </div>
        <div style={{ alignSelf: "flex-end", maxWidth: "88%", padding: `${14 * m * k}px ${22 * m * k}px`, borderRadius: 24 * m * k, borderBottomRightRadius: 8 * m * k, background: T.ink, color: T.card, fontSize: 25 * m * k, lineHeight: 1.3, letterSpacing: "-0.01em", opacity: f >= b + 2 ? 1 : 0 }}>
          {typed(c.agent, f, b + 2, 1.5)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 12 * m * k, margin: `${14 * m * k}px 0`, minHeight: 38 * m * k, fontFamily: MONO, fontSize: 19 * m * k, fontWeight: 600 }}>
        {[["check_availability", tool1, true], ["book_appointment", tool2, f >= bEnd - 8]].map(([name, p, ok], j) => (
          <span key={j} style={{ opacity: p as number, transform: `translateY(${(1 - (p as number)) * 10 * m}px)`, padding: `${7 * m * k}px ${14 * m * k}px`, borderRadius: 999, background: ok ? T.wash : T.chip, color: ok ? T.greenText : T.muted }}>{ok ? "✓ " : ""}{name as string}</span>
        ))}
      </div>
      <div style={{ height: 64 * m * k, borderRadius: 20 * m * k, background: c.emergency ? "linear-gradient(135deg, #F87171, #EF4444)" : `linear-gradient(135deg, ${G.greenLight}, ${G.green})`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 * m * k, fontWeight: 650, letterSpacing: "-0.02em", opacity: outP, transform: `translateY(${(1 - outP) * 30 * m}px) scale(${0.96 + 0.04 * outP})` }}>
        {c.out}
      </div>
    </div>
  )
}

// Each call arrives (and leaves) in its own 3D way.
const CallStage: React.FC = () => {
  const { f, n } = useDay()
  const { m, card, cw } = useLay()
  const { fps } = useL()
  return (
    <>
      {CALLS.map((c, i) => {
        const { tIn, tOut } = callTimes(i)
        if (f < tIn || f > tOut + 18) return null
        const e = (cfg: Record<string, number>) => sp(f, fps, tIn, cfg)
        let tr = "", extra: React.CSSProperties = {}
        if (i === 0) { const p = e({ damping: 13, stiffness: 100 }); tr = `translateY(${(1 - p) * 140 * m}px) rotateX(${(1 - p) * -88}deg)`; extra = { transformOrigin: "50% 100%" } }
        else if (i === 1) { const p = e({ damping: 14, stiffness: 95 }); tr = `translateX(${(1 - p) * 760 * m}px) rotateY(${(1 - p) * -80}deg)`; extra = { transformOrigin: "100% 50%" } }
        else if (i === 2) { const p = e({ damping: 8, stiffness: 120 }); tr = `translateY(${(1 - p) * -900 * m}px) rotateZ(${(1 - p) * 9}deg)`; extra = {} }
        else { const p = e({ damping: 16, stiffness: 80 }); tr = `translateY(${(1 - p) * 520 * m}px) scale(${0.85 + 0.15 * p})`; extra = { filter: `blur(${(1 - p) * 12}px)` } }
        const o = clamp(f, tOut, tOut + 16)
        const fold = o > 0 ? `rotateX(${o * -75}deg) translateY(${o * -160 * m}px)` : ""
        return (
          <div key={i} style={{ position: "absolute", left: card.x - cw / 2, top: card.y - 270 * m * (cw / (640 * m)), perspective: 1800 * m, opacity: (1 - o) * clamp(f, tIn, tIn + 6) }}>
            <div style={{ transform: `${tr} ${fold}`, transformOrigin: o > 0 ? "50% 0%" : undefined, ...(o > 0 ? {} : extra) }}>
              <CardView i={i} f={f} />
            </div>
            {i === 3 && f >= U[7].s + 60 && [0, 1].map(r => {
              const t = ((f - U[7].s - 60 + r * 20) % 40) / 40
              return <span key={r} style={{ position: "absolute", inset: 0, borderRadius: 34 * m, border: `${3 * m}px solid ${G.green}`, opacity: (1 - t) * 0.7, transform: `scale(${1 + t * 0.12})`, pointerEvents: "none" }} />
            })}
          </div>
        )
      })}
    </>
  )
}

// ─── Ledger (a row that fills as bookings land) ──────────

const Ledger: React.FC = () => {
  const { f, T, n } = useDay()
  const { m, W, V, cw, card, ledgerY } = useLay()
  const gap = 14 * m, w = (cw - gap * 3) / 4
  const hide = clamp(f, U[8].s + 40, U[8].s + 56)
  return (
    <div style={{ position: "absolute", left: card.x - cw / 2, top: ledgerY, width: cw, display: "flex", gap, perspective: 1200 * m, opacity: 1 - hide }}>
      {CALLS.map((c, i) => {
        const t = callTimes(i).bEnd - 6
        const p = clamp(f, t, t + 14)
        return (
          <div key={i} style={{ width: w, height: (V ? 96 : 84) * m, borderRadius: 20 * m, background: T.card, border: `${Math.max(1, m)}px solid ${T.line}`, boxShadow: T.shadow(m * 0.5), padding: `0 ${14 * m}px`, display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 * m, fontFamily: FONT, opacity: p, transform: `rotateX(${(1 - p) * 90}deg) translateY(${(1 - p) * 20 * m}px)`, transformOrigin: "50% 0%" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 * m, fontFamily: MONO, fontSize: (V ? 23 : 20) * m, fontWeight: 600, color: T.ink }}>
              <span style={{ width: 10 * m, height: 10 * m, borderRadius: 99, background: c.c }} />{c.t}
            </span>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: (V ? 21 : 18) * m, color: T.muted, whiteSpace: "nowrap" }}>{c.niche}<Check size={(V ? 22 : 18) * m} color={n > 0.5 ? "#34D399" : "#059669"} /></span>
          </div>
        )
      })}
    </div>
  )
}

// ─── The tally ───────────────────────────────────────────

const Tally: React.FC = () => {
  const { f, T } = useDay()
  const { m, k, cw, card, V } = useLay()
  const { fps } = useL()
  const t0 = U[8].s - 4
  if (f < t0 || f > U[10].s - 2) return null
  const out = clamp(f, U[10].s - 14, U[10].s - 2)
  const kpi = (i: number, label: string, to: number) => {
    const p = sp(f, fps, t0 + i * 8, { damping: 12, stiffness: 110 })
    const v = Math.round(clamp(f, t0 + 6 + i * 8, t0 + 44 + i * 8, 0, to))
    return (
      <div key={label} style={{ flex: 1, background: T.card, borderRadius: 30 * m, border: `${Math.max(1, m)}px solid ${T.line}`, boxShadow: T.shadow(m), padding: `${28 * m}px ${32 * m}px`, fontFamily: FONT, opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 90 * m}px) rotateX(${(1 - p) * -40}deg)` }}>
        <p style={{ margin: 0, fontSize: 24 * m, color: T.muted }}>{label}</p>
        <p style={{ margin: `${6 * m}px 0 0`, fontFamily: MONO, fontSize: 150 * m * (V ? 0.9 : 1), fontWeight: 600, letterSpacing: "-0.06em", color: T.ink, lineHeight: 1.05 }}>{v}</p>
      </div>
    )
  }
  const strike = (i: number, label: string, badge: string, t: number) => {
    const p = clamp(f, t, t + 10), s = clamp(f, t + 12, t + 26)
    return (
      <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${22 * m}px ${30 * m}px`, borderRadius: 24 * m, background: T.card, border: `${Math.max(1, m)}px solid ${T.line}`, boxShadow: T.shadow(m * 0.6), fontFamily: FONT, opacity: p, transform: `translateX(${(1 - p) * (i ? 120 : -120) * m}px)` }}>
        <span style={{ position: "relative", fontSize: 38 * m, fontWeight: 650, letterSpacing: "-0.03em", color: T.ink }}>
          {label}
          <span style={{ position: "absolute", left: -6 * m, top: "54%", height: 5 * m, width: `${s * 108}%`, background: G.rose, borderRadius: 4 }} />
        </span>
        <span style={{ opacity: clamp(f, t + 22, t + 32), fontSize: 24 * m, fontWeight: 650, color: T.greenText, background: T.wash, padding: `${8 * m}px ${18 * m}px`, borderRadius: 999 }}>{badge}</span>
      </div>
    )
  }
  return (
    <div style={{ position: "absolute", left: card.x - cw / 2, top: card.y - 270 * m * k, width: cw, perspective: 1600 * m, opacity: 1 - out, transform: `translateY(${out * -60 * m}px)` }}>
      <div style={{ display: "flex", gap: 22 * m, flexDirection: "row" }}>
        {kpi(0, "Calls answered", 4)}
        {kpi(1, "Appointments booked", 4)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 * m, marginTop: 26 * m }}>
        {strike(0, "Night shift", "Not needed", U[9].s - 6)}
        {strike(1, "Missed calls", "0", U[9].s + 24)}
      </div>
    </div>
  )
}

// ─── Ending ──────────────────────────────────────────────

const Finale: React.FC = () => {
  const { f, T } = useDay()
  const { m, W, H, V } = useLay()
  const { fps } = useL()
  const t0 = U[10].s - 6
  const tClick = U[11].s + 34
  const btn = sp(f, fps, U[11].s - 4, { damping: 13, stiffness: 110 })
  const press = f >= tClick && f < tClick + 8 ? 0.95 : 1
  const bx = W / 2, by = H * (V ? 0.7 : 0.82)
  const cp = clamp(f, U[11].s + 6, tClick - 2)
  const cx = bx + (1 - cp) * (V ? 260 : 460) * m + Math.sin(cp * Math.PI) * -60 * m
  const cy = by + (1 - cp) * (V ? 320 : 240) * m + Math.sin(cp * Math.PI) * 50 * m + 24 * m
  if (f < t0) return null
  const head = clamp(f, U[10].s - 4, U[10].s + 12)
  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, top: H * (V ? 0.5 : 0.52), textAlign: "center", fontFamily: FONT, color: T.ink, opacity: head, transform: `translateY(${(1 - head) * 40 * m}px)`, padding: `0 ${40 * m}px` }}>
        <p style={{ margin: 0, fontSize: (V ? 132 : 120) * m, fontWeight: 650, letterSpacing: "-0.05em", lineHeight: 1 }}>Open <span style={{ color: T.greenText }}>24 hours.</span></p>
        <p style={{ margin: `${14 * m}px 0 0`, fontSize: 38 * m, color: T.muted, letterSpacing: "-0.02em", opacity: clamp(f, U[10].s + 14, U[10].s + 28) }}>Your AI front desk, always on.</p>
      </div>
      <div style={{ position: "absolute", left: bx, top: by, transform: `translate(-50%, -50%) scale(${(0.6 + 0.4 * btn) * press})`, opacity: Math.min(1, btn * 1.4), textAlign: "center", fontFamily: FONT }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 18 * m, padding: `${30 * m}px ${70 * m}px`, borderRadius: 999, background: T.ink, color: T.bg, fontSize: 50 * m, fontWeight: 650, letterSpacing: "-0.03em", whiteSpace: "nowrap", boxShadow: T.shadow(m) }}>
          <PhoneIcon size={42 * m} color={T.bg} /> Try the live demo
        </div>
        <p style={{ margin: `${20 * m}px 0 0`, fontSize: 30 * m, color: T.muted, opacity: clamp(f, U[11].s + 8, U[11].s + 22) }}>No signup. Just talk.</p>
      </div>
      {f >= tClick && f < tClick + 28 && <span style={{ position: "absolute", left: bx - 110 * m, top: by - 110 * m, width: 220 * m, height: 220 * m, borderRadius: "50%", border: `${4 * m}px solid rgba(16,185,129,${0.9 * (1 - (f - tClick) / 28)})`, transform: `scale(${0.4 + ((f - tClick) / 28) * 3.2})` }} />}
      {f >= tClick && f < tClick + 40 && Array.from({ length: 30 }, (_, i) => {
        const t = (f - tClick) / 40, a = random(`a${i}`) * Math.PI * 2, d = (0.3 + random(`d${i}`) * 0.7) * 320 * m, e = 1 - Math.pow(1 - t, 3)
        const c = [G.green, G.greenLight, T.ink, G.amber][i % 4]
        return <span key={i} style={{ position: "absolute", left: bx + Math.cos(a) * d * e - 6 * m, top: by + Math.sin(a) * d * e - 6 * m + t * t * 90 * m, width: 12 * m * (1 - t * 0.6), height: 12 * m * (1 - t * 0.6), borderRadius: i % 2 ? 99 : 3, background: c, opacity: 1 - t, transform: `rotate(${t * 360 * (i % 2 ? 1 : -1)}deg)` }} />
      })}
      {cp > 0 && f < tClick + 14 && (
        <svg width={54 * m} height={54 * m} viewBox="0 0 24 24" style={{ position: "absolute", left: cx, top: cy, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.3))", opacity: clamp(f, U[11].s + 6, U[11].s + 12) * (1 - clamp(f, tClick + 6, tClick + 14)) }}>
          <path d="M4 2l16 9-7 2-3 7z" fill={T.ink} stroke={T.bg} strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      )}
    </>
  )
}

// ─── Captions and brand ──────────────────────────────────

const Captions: React.FC = () => {
  const { f, T } = useDay()
  const { m, W, capY, V } = useLay()
  const i = U.findIndex((u, j) => f >= u.s - 4 && f < (U[j + 1]?.s ?? 1e9) - 4)
  if (i < 0 || i >= 10) return null
  const u = U[i]
  const p = clamp(f, u.s - 4, u.s + 6) * (1 - clamp(f, u.e + 8, u.e + 16))
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: capY, textAlign: "center", fontFamily: FONT, fontSize: (V ? 50 : 46) * m, fontWeight: 600, letterSpacing: "-0.03em", color: T.ink, opacity: p, transform: `translateY(${(1 - p) * 16 * m}px)`, padding: `0 ${60 * m}px` }}>
      {u.text}
    </div>
  )
}

const Brand: React.FC = () => {
  const { T, n } = useDay()
  const { m, V } = useLay()
  return (
    <div style={{ position: "absolute", left: (V ? 56 : 64) * m, top: (V ? 56 : 52) * m, display: "flex", alignItems: "center", gap: 14 * m, fontFamily: FONT }}>
      <Logo size={46 * m} dark={n < 0.5} />
      <span style={{ fontSize: 34 * m, fontWeight: 700, letterSpacing: "-0.04em", color: T.ink }}>Orvia</span>
    </div>
  )
}

// ─── The cut ─────────────────────────────────────────────

const Scene: React.FC = () => {
  const f = useCurrentFrame()
  const { m } = useLay()
  const logo = clamp(f, U[10].s - 10, U[10].s + 14)
  return (
    <AbsoluteFill style={{ perspective: 2400 * m }}>
      <AbsoluteFill style={{ transform: `rotateY(${Math.sin(f * 0.012) * 2.2}deg) rotateX(${Math.cos(f * 0.01) * 1.4}deg)` }}>
        <Dial logo={logo} />
        <CallStage />
        <Ledger />
        <Tally />
        <Finale />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

export const DayAd: React.FC = () => (
  <AbsoluteFill>
    <World />
    <Scene />
    <Captions />
    <Brand />
    <Audio src={staticFile("vo-day/narration.wav")} />
  </AbsoluteFill>
)
