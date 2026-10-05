import React from "react"
import { AbsoluteFill, Audio, random, staticFile, useCurrentFrame } from "remotion"
import { Logo, FONT, MONO, typed } from "./theme"
import { Beat, CheckGlyph, FPS, Glass, Kinetic, P, PhoneGlyph, Spark, TOTAL, U, World, clamp, lin, sp, useAbs, useL } from "./kit"

// "Exotic" cut: voice only, no music. Every beat is timed to the narration
// (src/vo2-timing.json, written by audio/make-narration.mjs).

const sec = (s: number) => Math.round(s * FPS)

function useAnchors() {
  const { W, H, V } = useL()
  return V
    ? { sx: W / 2, sy: H * 0.6, hx: W * 0.08, hy: H * 0.09, hw: W * 0.84 }
    : { sx: W * 0.69, sy: H * 0.5, hx: W * 0.07, hy: H * 0.5, hw: W * 0.5 }
}

// Headline block: top of the screen on a phone, left column on landscape.
const Headline: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const a = useAnchors()
  const { V } = useL()
  return (
    <div style={{ position: "absolute", left: a.hx, top: a.hy, width: a.hw, transform: V ? undefined : "translateY(-50%)", display: "flex", flexDirection: "column", gap: 14 }}>
      {children}
    </div>
  )
}

const H1 = (m: number, V: boolean) => (V ? 104 : 108) * m

// ─── A. The phone rings ──────────────────────────────────

const cardPose = (f: number) => ({ ry: Math.sin(f * 0.045) * 14, rx: Math.cos(f * 0.037) * 7, ty: Math.sin(f * 0.09) * 8 })

const CallCard: React.FC<{ f: number; m: number; tint?: number }> = ({ f, m, tint = 0 }) => {
  const burst = (f % 27) / 27
  const wiggle = f % 27 < 13 ? Math.sin(f * 1.9) * 13 : 0
  return (
    <Glass m={m} glow="rgba(16,185,129,0.25)" style={{ width: 620 * m, height: 380 * m, padding: 40 * m, position: "relative", overflow: "hidden", fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28 * m }}>
        <div style={{ position: "relative", width: 104 * m, height: 104 * m, flexShrink: 0 }}>
          {[0, 1, 2].map(i => {
            const p = (burst + i / 3) % 1
            return <span key={i} style={{ position: "absolute", inset: -p * 60 * m, borderRadius: 999, border: `${2 * m}px solid ${P.mint}`, opacity: (1 - p) * 0.7 }} />
          })}
          <div style={{ position: "absolute", inset: 0, borderRadius: 999, background: `linear-gradient(135deg, ${P.mint}, ${P.green})`, display: "flex", alignItems: "center", justifyContent: "center", transform: `rotate(${wiggle}deg)`, boxShadow: `0 0 ${40 * m}px rgba(16,185,129,0.6)` }}>
            <PhoneGlyph size={48 * m} />
          </div>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 22 * m, letterSpacing: "0.14em", textTransform: "uppercase", color: P.dim, fontWeight: 600 }}>Incoming call</p>
          <p style={{ margin: `${4 * m}px 0 0`, fontSize: 62 * m, fontWeight: 650, letterSpacing: "-0.04em", color: P.white }}>Mike R.</p>
        </div>
      </div>
      <p style={{ margin: `${26 * m}px 0 0`, fontSize: 28 * m, color: P.dim }}>Burst pipe · 7:42 AM</p>
      <div style={{ position: "absolute", left: 40 * m, right: 40 * m, bottom: 36 * m, display: "flex", gap: 20 * m }}>
        {[["#EF4444", "Decline"], [P.green, "Answer"]].map(([c, l]) => (
          <div key={l} style={{ flex: 1, height: 72 * m, borderRadius: 999, background: `${c}33`, border: `${2 * m}px solid ${c}`, display: "flex", alignItems: "center", justifyContent: "center", color: P.white, fontSize: 26 * m, fontWeight: 600 }}>{l}</div>
        ))}
      </div>
      {tint > 0 && <div style={{ position: "absolute", inset: 0, background: `rgba(239,68,68,${0.35 * tint})`, borderRadius: 30 * m }} />}
    </Glass>
  )
}

const BeatRing: React.FC = () => {
  const f = useAbs()
  const { m, V, fps } = useL()
  const a = useAnchors()
  const enter = sp(f, fps, 4, { damping: 12, stiffness: 90 })
  const pose = cardPose(f)
  const flash = Math.max(0, 1 - (f % 27) / 10) * 0.25
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: a.sx - 520 * m, top: a.sy - 520 * m, width: 1040 * m, height: 1040 * m, borderRadius: 999, background: `radial-gradient(circle, rgba(16,185,129,${flash}), transparent 60%)` }} />
      <div style={{ position: "absolute", left: a.sx - 310 * m, top: a.sy - 190 * m, perspective: 1400 * m }}>
        <div style={{ transform: `translateY(${(1 - enter) * 340 * m + pose.ty * m}px) rotateY(${pose.ry + (1 - enter) * 50}deg) rotateX(${pose.rx}deg) scale(${(0.7 + 0.3 * enter) * (V ? 1.15 : 1)})` }}>
          <CallCard f={f} m={m} />
        </div>
      </div>
      <Headline>
        <Kinetic text="Your phone rings." start={U[0].s - 5} size={H1(m, V)} />
        <Kinetic text="Your hands are full." start={U[1].s - 5} size={H1(m, V)} color={P.dim} />
      </Headline>
    </AbsoluteFill>
  )
}

// ─── B. The customer calls someone else ──────────────────

const SHARDS: [number, number][][] = (() => {
  const c: [number, number] = [0.5, 0.5]
  const ring: [number, number][] = [[0, 0], [0.5, 0], [1, 0], [1, 1], [0.5, 1], [0, 1]]
  return ring.map((p, i) => [c, p, ring[(i + 1) % ring.length]])
})()

const BeatLost: React.FC = () => {
  const f = useAbs()
  const { m, V, fps } = useL()
  const a = useAnchors()
  const tStamp = U[2].s + 12, tBreak = U[2].s + 34
  const pose = cardPose(f)
  const stampP = sp(f, fps, tStamp, { damping: 9, stiffness: 220 })
  const tint = clamp(f, tStamp, tStamp + 8)
  const k = Math.max(0, f - tBreak)
  const kk = clamp(f, tBreak, tBreak + 46)
  const shake = (f - tStamp >= 0 && f - tStamp < 12 ? 10 * (1 - (f - tStamp) / 12) : 0) + (k > 0 && k < 14 ? 14 * (1 - k / 14) : 0)
  const sx = Math.sin(f * 7) * shake * m, sy = Math.cos(f * 9) * shake * m
  const comp = sp(f, fps, tBreak + 8, { damping: 14, stiffness: 110 })
  return (
    <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px)` }}>
      <div style={{ position: "absolute", left: a.sx - 310 * m, top: a.sy - 190 * m, perspective: 1400 * m }}>
        <div style={{ transform: `translateY(${pose.ty * m}px) rotateY(${pose.ry}deg) rotateX(${pose.rx}deg)`, position: "relative", width: 620 * m, height: 380 * m }}>
          {f < tBreak && <CallCard f={f} m={m} tint={tint} />}
          {f >= tBreak && SHARDS.map((poly, i) => {
            const cx = poly.reduce((s, p) => s + p[0], 0) / 3 - 0.5, cy = poly.reduce((s, p) => s + p[1], 0) / 3 - 0.5
            const dir = Math.atan2(cy, cx)
            const dist = (360 + random(`s${i}`) * 260) * m * kk
            return (
              <div key={i} style={{
                position: "absolute", inset: 0, clipPath: `polygon(${poly.map(p => `${p[0] * 100}% ${p[1] * 100}%`).join(",")})`,
                transform: `translate(${Math.cos(dir) * dist}px, ${Math.sin(dir) * dist + kk * kk * 420 * m}px) rotateZ(${(random(`r${i}`) - 0.5) * 520 * kk}deg) rotateX(${kk * 220 * (random(`x${i}`) - 0.3)}deg)`,
                opacity: 1 - Math.pow(kk, 2.2),
              }}><CallCard f={f} m={m} tint={1} /></div>
            )
          })}
          {f >= tStamp && f < tBreak + 16 && (
            <div style={{
              position: "absolute", left: "50%", top: "46%", transform: `translate(-50%, -50%) rotate(-12deg) scale(${0.4 + stampP * 0.6 + (1 - stampP) * 2.6})`, opacity: Math.min(1, stampP * 2) * (f < tBreak ? 1 : 1 - (f - tBreak) / 16),
              padding: `${6 * m}px ${28 * m}px`, border: `${8 * m}px solid #EF4444`, borderRadius: 18 * m, color: "#EF4444", fontFamily: FONT, fontWeight: 800, fontSize: 96 * m, letterSpacing: "0.04em", whiteSpace: "nowrap",
              textShadow: `0 0 ${30 * m}px rgba(239,68,68,0.6)`,
            }}>MISSED</div>
          )}
        </div>
      </div>
      {f >= tStamp && f < tStamp + 22 && (
        <span style={{ position: "absolute", left: a.sx - 300 * m, top: a.sy - 300 * m, width: 600 * m, height: 600 * m, borderRadius: 999, border: `${6 * m}px solid rgba(239,68,68,${1 - (f - tStamp) / 22})`, transform: `scale(${0.2 + ((f - tStamp) / 22) * 2.2})` }} />
      )}
      <div style={{
        position: "absolute", left: a.sx - 290 * m, top: a.sy + (V ? 110 : 70) * m, width: 580 * m, opacity: Math.min(1, comp * 1.5),
        transform: `translateX(${(1 - comp) * 700 * m}px) rotate(${(1 - comp) * 8}deg)`,
      }}>
        <Glass m={m} glow="rgba(251,113,133,0.2)" style={{ padding: `${26 * m}px ${32 * m}px`, display: "flex", alignItems: "center", gap: 24 * m, fontFamily: FONT }}>
          <div style={{ width: 62 * m, height: 62 * m, borderRadius: 999, background: P.rose, display: "flex", alignItems: "center", justifyContent: "center" }}><CheckGlyph size={32 * m} draw={clamp(f, tBreak + 20, tBreak + 34)} /></div>
          <div>
            <p style={{ margin: 0, fontSize: 30 * m, fontWeight: 650, color: P.white, letterSpacing: "-0.02em" }}>Booked with someone else</p>
            <p style={{ margin: `${2 * m}px 0 0`, fontSize: 24 * m, color: P.dim }}>Next result on Google</p>
          </div>
        </Glass>
      </div>
      <Headline>
        <Kinetic text="So the customer calls someone else." start={U[2].s - 4} size={H1(m, V) * 0.92} tint={{ someone: P.rose, else: P.rose }} />
      </Headline>
    </AbsoluteFill>
  )
}

// ─── C. Meet Orvia ───────────────────────────────────────

const BeatMeet: React.FC = () => {
  const f = useAbs()
  const { W, H, m, fps } = useL()
  const cx = W / 2, cy = H * 0.42
  const t0 = U[3].s - 6
  const conv = clamp(f, t0 - 14, t0 + 4)
  const pop = sp(f, fps, t0 + 4, { damping: 9, stiffness: 150 })
  const logoOp = clamp(f, t0 + 3, t0 + 7)
  const rays = clamp(f, t0 + 4, t0 + 12) * (1 - clamp(f, t0 + 14, t0 + 50))
  const sweep = clamp(f, t0 + 12, t0 + 44, -0.3, 1.3)
  const blobs = [0, 1, 2, 3, 4, 5].map(i => {
    const ang = (i / 6) * Math.PI * 2 + (1 - conv) * 3, rad = (1 - conv) * 420 * m
    return { x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad, c: [P.mint, P.cyan, P.violet][i % 3] }
  })
  return (
    <AbsoluteFill>
      <svg width="0" height="0"><defs><filter id="goo"><feGaussianBlur in="SourceGraphic" stdDeviation={16 * m} result="b" /><feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" /></filter></defs></svg>
      <div style={{ position: "absolute", inset: 0, filter: "url(#goo)", opacity: 1 - logoOp }}>
        {blobs.map((b, i) => <span key={i} style={{ position: "absolute", left: b.x - 54 * m, top: b.y - 54 * m, width: 108 * m, height: 108 * m, borderRadius: 999, background: b.c }} />)}
        <span style={{ position: "absolute", left: cx - 70 * m, top: cy - 70 * m, width: 140 * m, height: 140 * m, borderRadius: 999, background: P.mint }} />
      </div>
      <div style={{ position: "absolute", left: cx - 700 * m, top: cy - 700 * m, width: 1400 * m, height: 1400 * m, opacity: rays * 0.9, transform: `rotate(${f * 1.4}deg)`,
        background: "repeating-conic-gradient(from 0deg, rgba(52,211,153,0.55) 0deg 3deg, transparent 3deg 15deg)",
        maskImage: "radial-gradient(circle, black 5%, transparent 60%)", WebkitMaskImage: "radial-gradient(circle, black 5%, transparent 60%)" }} />
      {[0, 1].map(i => { const p = clamp(f, t0 + 4 + i * 5, t0 + 30 + i * 5); return p > 0 && p < 1 ? <span key={i} style={{ position: "absolute", left: cx - 200 * m, top: cy - 200 * m, width: 400 * m, height: 400 * m, borderRadius: 999, border: `${4 * m}px solid rgba(52,211,153,${0.8 * (1 - p)})`, transform: `scale(${0.3 + p * 3})` }} /> : null })}
      <div style={{ position: "absolute", left: cx - 120 * m, top: cy - 120 * m, opacity: logoOp, transform: `scale(${0.2 + pop * 0.8}) rotate(${(1 - pop) * -40}deg)`, filter: `drop-shadow(0 0 ${50 * m}px rgba(52,211,153,0.7))` }}>
        <Logo size={240 * m} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: cy + 170 * m, textAlign: "center" }}>
        <p style={{ margin: `0 0 ${6 * m}px`, fontFamily: FONT, fontSize: 40 * m, color: P.dim, letterSpacing: "0.34em", textTransform: "uppercase", opacity: clamp(f, t0 + 2, t0 + 14) }}>Meet</p>
        <div style={{ position: "relative", display: "inline-block", fontFamily: FONT, fontSize: 210 * m, fontWeight: 700, letterSpacing: `${-0.05 + (1 - clamp(f, t0 + 6, t0 + 24)) * 0.5}em`, color: P.white, opacity: clamp(f, t0 + 6, t0 + 16), filter: `blur(${(1 - clamp(f, t0 + 6, t0 + 22)) * 18}px)` }}>
          Orvia
          <span style={{ position: "absolute", inset: 0, background: `linear-gradient(100deg, transparent ${sweep * 100 - 20}%, rgba(255,255,255,0.9) ${sweep * 100}%, transparent ${sweep * 100 + 20}%)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Orvia</span>
        </div>
      </div>
    </AbsoluteFill>
  )
}

// ─── D. Answers every call, day and night ────────────────

const BeatOrb: React.FC = () => {
  const f = useAbs()
  const { m, V, fps } = useL()
  const a = useAnchors()
  const enter = sp(f, fps, U[4].s - 8, { damping: 16, stiffness: 90 })
  const N = 72, R = 205 * m
  const env = 0.65 + 0.35 * Math.sin(f * 0.33) * Math.sin(f * 0.11 + 1)
  const sunA = f * 0.05
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: a.sx, top: a.sy, transform: `scale(${(0.4 + enter * 0.6) * (V ? 1.28 : 1)})`, opacity: enter }}>
        {/* day / night ring, tilted */}
        <div style={{ position: "absolute", left: -330 * m, top: -330 * m, width: 660 * m, height: 660 * m, perspective: 1400 * m }}>
          <div style={{ position: "absolute", inset: 0, transform: "rotateX(70deg)", transformStyle: "preserve-3d" }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: 999, border: `${2 * m}px dashed rgba(255,255,255,0.28)`, transform: `rotateZ(${f * 0.5}deg)`, transformStyle: "preserve-3d" }}>
              {Array.from({ length: 24 }, (_, i) => (
                <span key={i} style={{ position: "absolute", left: "50%", top: 0, width: 2 * m, height: (i % 6 === 0 ? 22 : 11) * m, background: "rgba(255,255,255,0.4)", transformOrigin: `50% ${330 * m}px`, transform: `translateX(-50%) rotate(${i * 15}deg)` }} />
              ))}
              {/* The glow is part of the gradient, not a box-shadow: shadows get clipped to a square in a 3D layer. */}
              <span style={{ position: "absolute", left: "50%", top: "50%", width: 170 * m, height: 170 * m, marginLeft: -85 * m, marginTop: -85 * m, borderRadius: 999, background: "radial-gradient(circle, #FDE68A 0 17%, #F59E0B 20%, rgba(245,158,11,0.45) 30%, transparent 62%)", transform: `rotate(${sunA}rad) translateX(${330 * m}px) rotate(${-sunA}rad) rotateZ(${-f * 0.5}deg) rotateX(-70deg)` }} />
              <span style={{ position: "absolute", left: "50%", top: "50%", width: 150 * m, height: 150 * m, marginLeft: -75 * m, marginTop: -75 * m, borderRadius: 999, background: "radial-gradient(circle, transparent 0 18%, rgba(139,92,246,0.5) 28%, transparent 62%)", transform: `rotate(${sunA + Math.PI}rad) translateX(${330 * m}px) rotate(${-sunA - Math.PI}rad) rotateZ(${-f * 0.5}deg) rotateX(-70deg)` }}>
                <span style={{ position: "absolute", left: "50%", top: "50%", width: 46 * m, height: 46 * m, marginLeft: -23 * m, marginTop: -23 * m, borderRadius: 999, boxShadow: `inset ${-14 * m}px ${-4 * m}px 0 0 #C4B5FD` }} />
              </span>
            </div>
          </div>
        </div>
        {/* radial waveform */}
        {Array.from({ length: N }, (_, i) => {
          const amp = Math.abs(Math.sin(f * 0.21 + i * 0.55)) * Math.abs(Math.sin(f * 0.13 + i * 0.23 + 1))
          const h = (16 + 86 * amp * env) * m
          const hue = i / N
          const c = hue < 0.5 ? P.mint : hue < 0.8 ? P.cyan : P.violet
          return <span key={i} style={{ position: "absolute", left: -3.5 * m, top: -3.5 * m, width: 7 * m, height: h, borderRadius: 99, background: c, opacity: 0.55 + amp * 0.45, boxShadow: `0 0 ${10 * m}px ${c}`,
            transformOrigin: `50% 0`, transform: `rotate(${(i / N) * 360 + f * 0.3}deg) translateY(${R}px)` }} />
        })}
        <div style={{ position: "absolute", left: -150 * m, top: -150 * m, width: 300 * m, height: 300 * m, borderRadius: 999, background: "radial-gradient(circle at 35% 30%, rgba(52,211,153,0.55), rgba(8,40,32,0.9) 70%)", border: `${2 * m}px solid rgba(52,211,153,0.6)`, boxShadow: `0 0 ${80 * m}px rgba(16,185,129,${0.35 + 0.25 * env})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Logo size={128 * m} />
        </div>
      </div>
      <Headline>
        <Kinetic text="Answers every call," start={U[4].s - 4} size={H1(m, V) * 0.9} />
        <Kinetic text="day and night." start={U[4].s + 52} size={H1(m, V) * 0.9} tint={{ day: P.amber, night: "#A78BFA" }} />
      </Headline>
    </AbsoluteFill>
  )
}

// ─── E. Finds a time, books the job, updates the calendar ─

const COLS = 7, ROWS = 5, TC = 4, TR = 2
const BUSY = new Set(["0,1", "1,3", "2,0", "2,4", "3,3", "5,1", "5,3", "6,0", "6,4", "1,0", "4,4"])

const BeatBook: React.FC = () => {
  const f = useAbs()
  const { m, V, fps, W } = useL()
  const a = useAnchors()
  const s0 = U[5].s
  const tFind = s0, tBook = s0 + 34, tUpd = s0 + 63, tInst = s0 + 113
  const PW = (V ? 900 : 880) * m, PH = (V ? 560 : 540) * m
  const cw = PW / COLS, ch = PH / ROWS
  const rx = lin(f, s0 - 14, tInst + 18, 66, 26), rz = lin(f, s0 - 14, tInst + 18, -32, -10)
  const sweep = lin(f, tFind + 4, tFind + 34, -2, COLS + ROWS)
  const dock = clamp(f, tBook - 18, tBook)
  const draw = clamp(f, tBook + 6, tBook + 20)
  const enter = sp(f, fps, s0 - 14, { damping: 18, stiffness: 80 })
  const step = (i: number, t: number, text: string, delay: number) => {
    const done = f >= t + delay
    return (
      <div key={i} style={{ display: "flex", alignItems: "center", gap: 22 * m, opacity: clamp(f, t - 6, t + 6) }}>
        <div style={{ width: 54 * m, height: 54 * m, borderRadius: 999, background: done ? P.green : "transparent", border: `${3 * m}px solid ${done ? P.green : P.line}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: done ? `0 0 ${24 * m}px rgba(16,185,129,0.6)` : undefined }}>
          <CheckGlyph size={28 * m} draw={clamp(f, t + delay, t + delay + 10)} />
        </div>
        <Kinetic text={text} start={t - 3} size={(V ? 66 : 70) * m} color={done ? P.white : P.dim} stagger={0.9} />
      </div>
    )
  }
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: a.sx - PW / 2, top: a.sy - PH / 2 + (V ? 60 * m : 0), width: PW, height: PH, perspective: 1800 * m, opacity: enter }}>
        <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: `rotateX(${rx}deg) rotateZ(${rz}deg) scale(${0.85 + enter * 0.15})` }}>
          <div style={{ position: "absolute", inset: -24 * m, borderRadius: 28 * m, background: "rgba(255,255,255,0.04)", border: `${Math.max(1, m)}px solid ${P.line}`, boxShadow: `0 ${60 * m}px ${120 * m}px rgba(0,0,0,0.6)` }} />
          {Array.from({ length: COLS * ROWS }, (_, n) => {
            const c = n % COLS, r = Math.floor(n / COLS)
            const busy = BUSY.has(`${c},${r}`)
            const glow = Math.max(0, 1 - Math.abs(c + r - sweep) / 1.7) * (busy ? 0.3 : 1)
            const rowHit = f >= tUpd && r === TR ? clamp(f, tUpd, tUpd + 16) : 0
            return <div key={n} style={{
              position: "absolute", left: c * cw + 4 * m, top: r * ch + 4 * m, width: cw - 8 * m, height: ch - 8 * m, borderRadius: 14 * m,
              background: busy ? "rgba(139,92,246,0.22)" : `rgba(255,255,255,${0.05 + glow * 0.12})`,
              border: `${Math.max(1, m)}px solid ${busy ? "rgba(139,92,246,0.4)" : `rgba(52,211,153,${0.15 + glow * 0.75 + rowHit * 0.3})`}`,
              boxShadow: glow > 0.2 || rowHit ? `0 0 ${24 * m * Math.max(glow, rowHit)}px rgba(52,211,153,${Math.max(glow, rowHit) * 0.8})` : undefined,
            }} />
          })}
          {/* the booking, hovering then docking */}
          {f >= tBook - 22 && (
            <div style={{
              position: "absolute", left: TC * cw + 4 * m - 20 * m, top: TR * ch + 4 * m - 6 * m, width: cw - 8 * m + 40 * m, height: ch - 8 * m + 12 * m, borderRadius: 16 * m,
              background: `linear-gradient(135deg, ${P.mint}, ${P.green})`, color: "#04130D", fontFamily: FONT, display: "flex", flexDirection: "column", justifyContent: "center", padding: `0 ${16 * m}px`,
              transform: `translateZ(${(1 - dock) * 300 * m}px) scale(${1.25 - dock * 0.25})`, opacity: clamp(f, tBook - 22, tBook - 14),
              boxShadow: `0 ${(1 - dock) * 80 * m}px ${60 * m}px rgba(16,185,129,${0.3 + (1 - dock) * 0.3})`,
            }}>
              <span style={{ fontSize: 24 * m, fontWeight: 700, letterSpacing: "-0.02em" }}>10:15 · Sarah K.</span>
              <span style={{ fontSize: 19 * m, opacity: 0.8 }}>Leak repair</span>
              <span style={{ position: "absolute", right: 12 * m, top: 10 * m }}><CheckGlyph size={24 * m} color="#04130D" draw={draw} /></span>
            </div>
          )}
          <Spark cx={TC * cw + cw / 2} cy={TR * ch + ch / 2} f={f} start={tBook} dist={190 * m} size={9 * m} />
          {f >= tBook && f < tBook + 24 && <span style={{ position: "absolute", left: TC * cw - 20 * m, top: TR * ch - 20 * m, width: cw + 40 * m, height: ch + 40 * m, borderRadius: 24 * m, border: `${4 * m}px solid ${P.mint}`, opacity: 1 - (f - tBook) / 24, transform: `scale(${1 + (f - tBook) * 0.05})` }} />}
        </div>
      </div>
      {f >= tInst - 4 && f < tInst + 18 && Array.from({ length: 7 }, (_, i) => {
        const p = lin(f, tInst - 4 + i, tInst + 12 + i)
        return <span key={i} style={{ position: "absolute", top: `${14 + i * 12}%`, left: `${-30 + p * 160}%`, width: "30%", height: 3 * m, borderRadius: 3, background: `linear-gradient(90deg, transparent, ${P.mint}, transparent)`, opacity: 0.8 }} />
      })}
      <div style={{ position: "absolute", left: a.hx, top: V ? a.hy : a.hy, width: a.hw, transform: V ? undefined : "translateY(-50%)", display: "flex", flexDirection: "column", gap: (V ? 22 : 30) * m }}>
        {step(0, tFind - 4, "Finds a time.", 14)}
        {step(1, tBook - 4, "Books the job.", 10)}
        {step(2, tUpd - 4, "Updates your calendar.", 14)}
        <div style={{ opacity: clamp(f, tInst - 4, tInst + 4), transform: `translateX(${(1 - clamp(f, tInst - 4, tInst + 6)) * -40 * m}px)`, display: "flex", alignItems: "center", gap: 14 * m }}>
          <svg width={44 * m} height={44 * m} viewBox="0 0 24 24" fill={P.amber}><path d="M13 2L4 14h6l-1 8 9-12h-6z" /></svg>
          <span style={{ fontFamily: FONT, fontSize: 52 * m, fontWeight: 700, color: P.amber, letterSpacing: "-0.03em" }}>Instantly.</span>
        </div>
      </div>
    </AbsoluteFill>
  )
}

// ─── F. Every call, summarized ───────────────────────────

const ROWS_DATA = [
  { n: "Mike R.", s: "Burst pipe, urgent", t: "Booked", c: P.green, i: "M" },
  { n: "Dana L.", s: "AC not cooling", t: "Callback", c: P.amber, i: "D" },
  { n: "Chris P.", s: "Whitening enquiry", t: "Lead", c: P.violet, i: "C" },
  { n: "Sarah K.", s: "Leak repair", t: "Booked", c: P.green, i: "S" },
  { n: "Marcus T.", s: "Water heater quote", t: "Lead", c: P.violet, i: "M" },
  { n: "Elena V.", s: "Drain cleaning", t: "Booked", c: P.green, i: "E" },
  { n: "Tom H.", s: "Showing request", t: "Booked", c: P.green, i: "T" },
]

const BeatCalls: React.FC = () => {
  const f = useAbs()
  const { m, V, fps } = useL()
  const a = useAnchors()
  const s0 = U[6].s
  const enter = sp(f, fps, s0 - 14, { damping: 16, stiffness: 90 })
  const rot = clamp(f, s0 - 8, s0 + 80, 0, (360 / ROWS_DATA.length) * 3)
  const Rd = 330 * m, step = 360 / ROWS_DATA.length
  const summary = "Burst pipe in the kitchen. Emergency visit booked for 2:15 PM. Customer confirmed."
  const text = typed(summary, f, s0 + 8, 1.05)
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: a.sx - 270 * m + (V ? 0 : 60 * m), top: a.sy - (V ? 270 : 280) * m, width: 540 * m, height: 560 * m, perspective: 1500 * m, opacity: enter, transform: `translateX(${(1 - enter) * 160 * m}px)` }}>
        <div style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, transformStyle: "preserve-3d" }}>
          {ROWS_DATA.map((r, i) => {
            const th = ((i * step - rot + 540) % 360) - 180
            const vis = Math.max(0, Math.cos((th * Math.PI) / 180))
            const front = Math.max(0, 1 - Math.abs(th) / 25)
            return (
              <div key={i} style={{ position: "absolute", left: 0, right: 0, top: 560 * m / 2 - 56 * m, height: 112 * m, transform: `rotateX(${-th}deg) translateZ(${Rd}px)`, opacity: vis > 0.15 ? 0.25 + vis * 0.75 : 0, backfaceVisibility: "hidden" }}>
                <Glass m={m} glow={front > 0.5 ? `${r.c}55` : undefined} style={{ height: "100%", display: "flex", alignItems: "center", gap: 22 * m, padding: `0 ${26 * m}px`, borderRadius: 22 * m, borderColor: front > 0.5 ? r.c : P.line, fontFamily: FONT }}>
                  <div style={{ width: 62 * m, height: 62 * m, borderRadius: 999, background: `${r.c}33`, color: r.c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 * m, fontWeight: 700, flexShrink: 0 }}>{r.i}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 30 * m, fontWeight: 650, color: P.white, letterSpacing: "-0.02em" }}>{r.n}</p>
                    <p style={{ margin: `${2 * m}px 0 0`, fontSize: 23 * m, color: P.dim }}>{r.s}</p>
                  </div>
                  <span style={{ fontSize: 22 * m, fontWeight: 650, color: r.c, background: `${r.c}26`, padding: `${6 * m}px ${16 * m}px`, borderRadius: 999 }}>{r.t}</span>
                </Glass>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ position: "absolute", left: a.hx, top: V ? a.hy : a.hy, width: a.hw, transform: V ? undefined : "translateY(-50%)", display: "flex", flexDirection: "column", gap: 28 * m }}>
        <Kinetic text="Every call," start={s0 - 4} size={H1(m, V)} />
        <Kinetic text="summarized." start={s0 + 8} size={H1(m, V)} color={P.mint} />
        <div style={{ opacity: clamp(f, s0 + 4, s0 + 16), marginTop: 6 * m, maxWidth: (V ? 900 : 700) * m }}>
          <Glass m={m} style={{ padding: `${22 * m}px ${28 * m}px`, borderRadius: 22 * m, fontFamily: FONT }}>
            <p style={{ margin: 0, fontSize: 19 * m, letterSpacing: "0.14em", textTransform: "uppercase", color: P.mint, fontWeight: 700 }}>Call summary</p>
            <p style={{ margin: `${10 * m}px 0 0`, fontSize: (V ? 30 : 31) * m, lineHeight: 1.35, color: P.white, minHeight: 3 * 31 * 1.35 * m, letterSpacing: "-0.01em" }}>
              {text}<span style={{ opacity: Math.floor(f / 8) % 2 ? 0 : 1, color: P.mint }}>|</span>
            </p>
          </Glass>
        </div>
      </div>
    </AbsoluteFill>
  )
}

// ─── G. Whatever you run, she fits in ────────────────────

const NICHE_CHIPS = [
  { n: "Plumbing", c: P.green, u: 7 },
  { n: "Dental", c: P.violet, u: 8 },
  { n: "HVAC", c: P.cyan, u: 9 },
  { n: "Real estate", c: P.amber, u: 10 },
  { n: "Your business", c: P.rose, u: 11 },
]

const BeatNiches: React.FC = () => {
  const f = useAbs()
  const { m, V, fps } = useL()
  const a = useAnchors()
  const tTight = U[11].s
  const tight = clamp(f, tTight, tTight + 26)
  const rx = (V ? 400 : 400) * m * (1 - tight * 0.08), ry = (V ? 200 : 185) * m * (1 - tight * 0.08)
  const spin = f * 0.02 + tight * 0.5
  const enter = sp(f, fps, U[7].s - 20, { damping: 16, stiffness: 90 })
  const chips = NICHE_CHIPS.map((c, i) => {
    const ang = spin + (i / NICHE_CHIPS.length) * Math.PI * 2 + 0.6
    const depth = (Math.sin(ang) + 1) / 2
    return { ...c, i, x: Math.cos(ang) * rx, y: Math.sin(ang) * ry, depth }
  }).sort((p, q) => p.depth - q.depth)
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: a.sx, top: a.sy, opacity: enter }}>
        {[1, 1.28].map((k, j) => (
          <div key={j} style={{ position: "absolute", left: -rx * k, top: -ry * k, width: rx * 2 * k, height: ry * 2 * k, borderRadius: "50%", border: `${2 * m}px ${j ? "dashed" : "solid"} rgba(255,255,255,${j ? 0.16 : 0.28})`, boxShadow: j ? undefined : `0 0 ${40 * m}px rgba(52,211,153,0.2)` }} />
        ))}
        <div style={{ position: "absolute", zIndex: 5, left: -90 * m, top: -90 * m, filter: `drop-shadow(0 0 ${40 * m}px rgba(52,211,153,${0.4 + 0.3 * tight}))`, transform: `scale(${1 + 0.08 * Math.sin(f * 0.2) + tight * 0.15})` }}>
          <Logo size={180 * m} />
        </div>
        {chips.map(c => {
          const t = U[c.u].s - 4
          const pop = sp(f, fps, t, { damping: 10, stiffness: 160 })
          if (f < t) return null
          const hot = f >= U[c.u].s - 4 && f < U[c.u].e + 14
          const sc = (0.78 + 0.34 * c.depth) * (hot ? 1.18 : 1) * (0.3 + pop * 0.7) * (V ? 1.2 : 1)
          return (
            <div key={c.i} style={{ position: "absolute", left: c.x, top: c.y, transform: `translate(-50%, -50%) scale(${sc})`, zIndex: (c.depth > 0.5 ? 10 : 1) + (hot && c.depth > 0.5 ? 20 : 0), opacity: (0.55 + 0.45 * c.depth) * Math.min(1, pop * 2) }}>
              <div style={{ padding: `${14 * m}px ${30 * m}px`, borderRadius: 999, background: `linear-gradient(135deg, ${c.c}${hot ? "66" : "30"}, rgba(255,255,255,0.05))`, border: `${2 * m}px solid ${hot ? c.c : `${c.c}88`}`, boxShadow: hot ? `0 0 ${50 * m}px ${c.c}` : `0 ${10 * m}px ${30 * m}px rgba(0,0,0,0.4)`, display: "flex", alignItems: "center", gap: 14 * m, whiteSpace: "nowrap", fontFamily: FONT }}>
                <span style={{ width: 16 * m, height: 16 * m, borderRadius: 999, background: c.c, boxShadow: `0 0 ${14 * m}px ${c.c}` }} />
                <span style={{ fontSize: 38 * m, fontWeight: 650, color: P.white, letterSpacing: "-0.03em" }}>{c.n}</span>
              </div>
              {f >= t && f < t + 22 && <span style={{ position: "absolute", left: "50%", top: "50%", width: 120 * m, height: 120 * m, marginLeft: -60 * m, marginTop: -60 * m, borderRadius: 999, border: `${3 * m}px solid ${c.c}`, opacity: 1 - (f - t) / 22, transform: `scale(${1 + (f - t) / 5})` }} />}
            </div>
          )
        })}
      </div>
      <div style={{ position: "absolute", left: a.hx, top: a.hy, width: a.hw, transform: V ? undefined : "translateY(-50%)", display: "flex", flexDirection: "column", gap: 6 * m }}>
        {NICHE_CHIPS.slice(0, 4).map(c => (
          <Kinetic key={c.n} text={c.n} start={U[c.u].s - 4} size={(V ? 74 : 86) * m} color={f > tTight ? "rgba(245,246,248,0.28)" : P.white} tint={f > tTight ? {} : { [c.n.split(" ")[0].toLowerCase()]: c.c }} />
        ))}
        <div style={{ marginTop: 20 * m }}>
          <Kinetic text="Whatever you run, she fits in." start={tTight - 4} size={(V ? 54 : 58) * m} color={P.mint} />
        </div>
      </div>
    </AbsoluteFill>
  )
}

// ─── H. Hear her for yourself ────────────────────────────

const BeatCta: React.FC = () => {
  const f = useAbs()
  const { W, H, m, V, fps } = useL()
  const t0 = U[12].s
  const tBtn = U[13].s - 6
  const tClick = U[13].s + 40
  const cx = W / 2
  const warp = clamp(f, t0 - 12, t0 + 14)
  const press = f >= tClick && f < tClick + 8 ? 0.94 : 1
  const btn = sp(f, fps, tBtn, { damping: 13, stiffness: 110 })
  const bx = cx, by = H * (V ? 0.6 : 0.68)
  // cursor travels along a curve to the button
  const cp = clamp(f, tBtn + 8, tClick - 2)
  const curX = bx + (1 - cp) * (V ? 260 : 520) * m + Math.sin(cp * Math.PI) * -70 * m
  const curY = by + (1 - cp) * (V ? 360 : 300) * m + Math.sin(cp * Math.PI) * 60 * m + 20 * m
  const fin = clamp(f, tClick + 20, tClick + 50)
  return (
    <AbsoluteFill>
      {/* warp streaks */}
      {Array.from({ length: 64 }, (_, i) => {
        const ang = random(`w${i}`) * Math.PI * 2, len = (0.2 + random(`l${i}`) * 0.8) * Math.max(W, H)
        const t = (1 - warp) * (1 - warp)
        return <span key={i} style={{ position: "absolute", left: cx, top: H * 0.42, width: len * 0.5 * (1 - warp * 0.8), height: 2.5 * m, borderRadius: 3, background: `linear-gradient(90deg, transparent, ${i % 3 ? P.mint : P.cyan})`, transformOrigin: "0 50%", transform: `rotate(${ang}rad) translateX(${(0.05 + t * 1.2) * Math.max(W, H) * 0.5}px)`, opacity: (1 - warp) * 0.9 }} />
      })}
      <div style={{ position: "absolute", left: 0, right: 0, top: H * (V ? 0.26 : 0.2), textAlign: "center", padding: `0 ${60 * m}px` }}>
        <Kinetic text="Hear her" start={t0 - 4} size={(V ? 150 : 150) * m} align="center" />
        <Kinetic text="for yourself." start={t0 + 8} size={(V ? 150 : 150) * m} align="center" color={P.mint} />
      </div>
      <div style={{ position: "absolute", left: bx, top: by, transform: `translate(-50%, -50%) scale(${(0.5 + btn * 0.5) * press})`, opacity: Math.min(1, btn * 1.4) }}>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", inset: -14 * m, borderRadius: 999, background: `linear-gradient(135deg, ${P.mint}, ${P.cyan}, ${P.violet})`, filter: `blur(${24 * m}px)`, opacity: 0.55 + 0.2 * Math.sin(f * 0.15) }} />
          <div style={{ position: "relative", padding: `${34 * m}px ${78 * m}px`, borderRadius: 999, background: "#fff", color: "#07080B", fontFamily: FONT, fontSize: 54 * m, fontWeight: 700, letterSpacing: "-0.03em", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 20 * m }}>
            <PhoneGlyph size={46 * m} color="#07080B" /> Try the live demo
          </div>
        </div>
        <p style={{ margin: `${24 * m}px 0 0`, textAlign: "center", fontFamily: FONT, fontSize: 32 * m, color: P.dim, letterSpacing: "-0.01em", opacity: clamp(f, tBtn + 14, tBtn + 28) }}>No signup. Just talk.</p>
      </div>
      {f >= tClick && f < tClick + 30 && <span style={{ position: "absolute", left: bx - 120 * m, top: by - 120 * m, width: 240 * m, height: 240 * m, borderRadius: 999, border: `${4 * m}px solid rgba(255,255,255,${0.8 * (1 - (f - tClick) / 30)})`, transform: `scale(${0.4 + ((f - tClick) / 30) * 3.4})` }} />}
      <Spark cx={bx} cy={by} f={f} start={tClick} n={36} dist={300 * m} size={11 * m} life={40} />
      {cp > 0 && f < tClick + 14 && (
        <svg width={56 * m} height={56 * m} viewBox="0 0 24 24" style={{ position: "absolute", left: curX, top: curY, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.5))", opacity: clamp(f, tBtn + 8, tBtn + 14) * (1 - clamp(f, tClick + 6, tClick + 14)) }}>
          <path d="M4 2l16 9-7 2-3 7z" fill="#fff" stroke="#07080B" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      )}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: H * (V ? 0.1 : 0.1), display: "flex", justifyContent: "center", alignItems: "center", gap: 22 * m, opacity: fin, transform: `translateY(${(1 - fin) * 30 * m}px)` }}>
        <Logo size={72 * m} />
        <span style={{ fontFamily: FONT, fontSize: 56 * m, fontWeight: 700, color: P.white, letterSpacing: "-0.04em" }}>Orvia</span>
      </div>
    </AbsoluteFill>
  )
}

// ─── The cut ─────────────────────────────────────────────

export const ExoticAd: React.FC = () => {
  const aTo = U[2].s - 4
  const bTo = U[3].s - 8
  const cTo = U[4].s - 6
  const dTo = U[5].s - 4
  const eTo = U[6].s - 4
  const fTo = U[7].s - 8
  const gTo = U[12].s - 6
  return (
    <AbsoluteFill style={{ background: P.ink }}>
      <World />
      <Beat from={0} to={aTo}><BeatRing /></Beat>
      <Beat from={aTo - 10} to={bTo}><BeatLost /></Beat>
      <Beat from={bTo - 10} to={cTo}><BeatMeet /></Beat>
      <Beat from={cTo - 10} to={dTo}><BeatOrb /></Beat>
      <Beat from={dTo - 10} to={eTo}><BeatBook /></Beat>
      <Beat from={eTo - 10} to={fTo}><BeatCalls /></Beat>
      <Beat from={fTo - 10} to={gTo}><BeatNiches /></Beat>
      <Beat from={gTo - 10} to={TOTAL}><BeatCta /></Beat>
      <Audio src={staticFile("vo2/narration.wav")} />
    </AbsoluteFill>
  )
}
