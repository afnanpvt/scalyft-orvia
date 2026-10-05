import React from "react"
import { AbsoluteFill, Audio, random, staticFile } from "remotion"
import { Logo, FONT, MONO, typed } from "./theme"
import { Beat, Card, CheckGlyph, K, Kinetic, Paper, PhoneGlyph, Pill, Spark, TOTAL, U, clamp, lin, sp, useAbs, useL } from "./clean-kit"

// "Clean" cut: light, minimal (ink, white, grey and one green), voice only.
// Gender neutral wording. Every beat is timed to the narration in
// src/vo-clean-timing.json (written by audio/make-narration.mjs clean).

function useAnchors() {
  const { W, H, V } = useL()
  return V
    ? { sx: W / 2, sy: H * 0.6, hx: W * 0.08, hy: H * 0.09, hw: W * 0.84 }
    : { sx: W * 0.69, sy: H * 0.5, hx: W * 0.07, hy: H * 0.5, hw: W * 0.5 }
}

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

// ─── 1. The phone rings ──────────────────────────────────

const pose = (f: number) => ({ ry: Math.sin(f * 0.045) * 14, rx: Math.cos(f * 0.037) * 7, ty: Math.sin(f * 0.09) * 8 })

const CallCard: React.FC<{ f: number; m: number; fade?: number }> = ({ f, m, fade = 0 }) => {
  const burst = (f % 27) / 27
  const wiggle = f % 27 < 13 ? Math.sin(f * 1.9) * 13 : 0
  return (
    <Card m={m} style={{ width: 620 * m, height: 380 * m, padding: 40 * m, position: "relative", overflow: "hidden", fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28 * m }}>
        <div style={{ position: "relative", width: 104 * m, height: 104 * m, flexShrink: 0 }}>
          {[0, 1, 2].map(i => {
            const p = (burst + i / 3) % 1
            return <span key={i} style={{ position: "absolute", inset: -p * 60 * m, borderRadius: 999, border: `${2 * m}px solid ${K.green}`, opacity: (1 - p) * 0.6 }} />
          })}
          <div style={{ position: "absolute", inset: 0, borderRadius: 999, background: K.green, display: "flex", alignItems: "center", justifyContent: "center", transform: `rotate(${wiggle}deg)` }}>
            <PhoneGlyph size={48 * m} />
          </div>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 22 * m, letterSpacing: "0.14em", textTransform: "uppercase", color: K.muted, fontWeight: 600 }}>Incoming call</p>
          <p style={{ margin: `${4 * m}px 0 0`, fontSize: 62 * m, fontWeight: 650, letterSpacing: "-0.04em", color: K.ink }}>Mike R.</p>
        </div>
      </div>
      <p style={{ margin: `${26 * m}px 0 0`, fontSize: 28 * m, color: K.muted }}>Burst pipe · 7:42 AM</p>
      <div style={{ position: "absolute", left: 40 * m, right: 40 * m, bottom: 36 * m, display: "flex", gap: 20 * m }}>
        {[["Decline", K.wash, K.ink], ["Answer", K.ink, "#fff"]].map(([l, bg, fg]) => (
          <div key={l} style={{ flex: 1, height: 72 * m, borderRadius: 999, background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 * m, fontWeight: 600 }}>{l}</div>
        ))}
      </div>
      {fade > 0 && <div style={{ position: "absolute", inset: 0, background: `rgba(10,10,11,${0.12 * fade})` }} />}
    </Card>
  )
}

const BeatRing: React.FC = () => {
  const f = useAbs()
  const { m, V, fps } = useL()
  const a = useAnchors()
  const enter = sp(f, fps, 4, { damping: 12, stiffness: 90 })
  const p = pose(f)
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: a.sx - 310 * m, top: a.sy - 190 * m, perspective: 1400 * m }}>
        <div style={{ transform: `translateY(${(1 - enter) * 340 * m + p.ty * m}px) rotateY(${p.ry + (1 - enter) * 50}deg) rotateX(${p.rx}deg) scale(${(0.7 + 0.3 * enter) * (V ? 1.15 : 1)})` }}>
          <CallCard f={f} m={m} />
        </div>
      </div>
      <Headline>
        <Kinetic text="Your phone rings." start={U[0].s - 5} size={H1(m, V)} />
        <Kinetic text="Your hands are full." start={U[1].s - 5} size={H1(m, V)} color={K.faint} />
      </Headline>
    </AbsoluteFill>
  )
}

// ─── 2. The customer calls someone else ──────────────────

const SHARDS: [number, number][][] = (() => {
  const c: [number, number] = [0.5, 0.5]
  const ring: [number, number][] = [[0, 0], [0.5, 0], [1, 0], [1, 1], [0.5, 1], [0, 1]]
  return ring.map((q, i) => [c, q, ring[(i + 1) % ring.length]])
})()

const BeatLost: React.FC = () => {
  const f = useAbs()
  const { m, V, fps } = useL()
  const a = useAnchors()
  const tStamp = U[2].s + 12, tBreak = U[2].s + 34
  const p = pose(f)
  const stampP = sp(f, fps, tStamp, { damping: 9, stiffness: 220 })
  const dim = clamp(f, tStamp, tStamp + 8)
  const k = Math.max(0, f - tBreak)
  const kk = clamp(f, tBreak, tBreak + 46)
  const shake = (f - tStamp >= 0 && f - tStamp < 12 ? 9 * (1 - (f - tStamp) / 12) : 0) + (k > 0 && k < 14 ? 12 * (1 - k / 14) : 0)
  const comp = sp(f, fps, tBreak + 8, { damping: 14, stiffness: 110 })
  return (
    <AbsoluteFill style={{ transform: `translate(${Math.sin(f * 7) * shake * m}px, ${Math.cos(f * 9) * shake * m}px)` }}>
      <div style={{ position: "absolute", left: a.sx - 310 * m, top: a.sy - 190 * m, perspective: 1400 * m }}>
        <div style={{ transform: `translateY(${p.ty * m}px) rotateY(${p.ry}deg) rotateX(${p.rx}deg) scale(${V ? 1.15 : 1})`, position: "relative", width: 620 * m, height: 380 * m }}>
          {f < tBreak && <CallCard f={f} m={m} fade={dim} />}
          {f >= tBreak && SHARDS.map((poly, i) => {
            const cx = poly.reduce((s, q) => s + q[0], 0) / 3 - 0.5, cy = poly.reduce((s, q) => s + q[1], 0) / 3 - 0.5
            const dir = Math.atan2(cy, cx)
            const dist = (340 + random(`s${i}`) * 240) * m * kk
            return (
              <div key={i} style={{
                position: "absolute", inset: 0, clipPath: `polygon(${poly.map(q => `${q[0] * 100}% ${q[1] * 100}%`).join(",")})`,
                transform: `translate(${Math.cos(dir) * dist}px, ${Math.sin(dir) * dist + kk * kk * 400 * m}px) rotateZ(${(random(`r${i}`) - 0.5) * 520 * kk}deg) rotateX(${kk * 220 * (random(`x${i}`) - 0.3)}deg)`,
                opacity: 1 - Math.pow(kk, 2.2),
              }}><CallCard f={f} m={m} fade={1} /></div>
            )
          })}
          {f >= tStamp && f < tBreak + 16 && (
            <div style={{
              position: "absolute", left: "50%", top: "46%", transform: `translate(-50%, -50%) rotate(-12deg) scale(${0.4 + stampP * 0.6 + (1 - stampP) * 2.6})`,
              opacity: Math.min(1, stampP * 2) * (f < tBreak ? 1 : 1 - (f - tBreak) / 16), padding: `${6 * m}px ${28 * m}px`, border: `${8 * m}px solid ${K.ink}`, borderRadius: 18 * m,
              color: K.ink, fontFamily: FONT, fontWeight: 800, fontSize: 96 * m, letterSpacing: "0.04em", whiteSpace: "nowrap", background: "rgba(245,245,247,0.82)",
            }}>MISSED</div>
          )}
        </div>
      </div>
      {f >= tStamp && f < tStamp + 22 && <span style={{ position: "absolute", left: a.sx - 300 * m, top: a.sy - 300 * m, width: 600 * m, height: 600 * m, borderRadius: 999, border: `${5 * m}px solid rgba(10,10,11,${0.5 * (1 - (f - tStamp) / 22)})`, transform: `scale(${0.2 + ((f - tStamp) / 22) * 2.2})` }} />}
      <div style={{ position: "absolute", left: a.sx - 290 * m, top: a.sy + (V ? 130 : 80) * m, width: 580 * m, opacity: Math.min(1, comp * 1.5), transform: `translateX(${(1 - comp) * 700 * m}px) rotate(${(1 - comp) * 8}deg)` }}>
        <Card m={m} style={{ padding: `${26 * m}px ${32 * m}px`, display: "flex", alignItems: "center", gap: 24 * m, fontFamily: FONT }}>
          <div style={{ width: 62 * m, height: 62 * m, borderRadius: 999, background: K.ink, display: "flex", alignItems: "center", justifyContent: "center" }}><CheckGlyph size={32 * m} draw={clamp(f, tBreak + 20, tBreak + 34)} /></div>
          <div>
            <p style={{ margin: 0, fontSize: 30 * m, fontWeight: 650, color: K.ink, letterSpacing: "-0.02em" }}>Booked with someone else</p>
            <p style={{ margin: `${2 * m}px 0 0`, fontSize: 24 * m, color: K.muted }}>Next result on Google</p>
          </div>
        </Card>
      </div>
      <Headline>
        <Kinetic text="So the customer calls someone else." start={U[2].s - 4} size={H1(m, V) * 0.92} tint={{ someone: K.faint, else: K.faint }} />
      </Headline>
    </AbsoluteFill>
  )
}

// ─── 3. Meet Orvia ───────────────────────────────────────

const BeatMeet: React.FC = () => {
  const f = useAbs()
  const { W, H, m, fps } = useL()
  const cx = W / 2, cy = H * 0.42
  const t0 = U[3].s - 6
  const conv = clamp(f, t0 - 14, t0 + 4)
  const pop = sp(f, fps, t0 + 4, { damping: 9, stiffness: 150 })
  const logoOp = clamp(f, t0 + 3, t0 + 7)
  const blobs = [0, 1, 2, 3, 4, 5].map(i => {
    const ang = (i / 6) * Math.PI * 2 + (1 - conv) * 3, rad = (1 - conv) * 420 * m
    return { x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad }
  })
  return (
    <AbsoluteFill>
      <svg width="0" height="0"><defs><filter id="goo"><feGaussianBlur in="SourceGraphic" stdDeviation={16 * m} result="b" /><feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" /></filter></defs></svg>
      <div style={{ position: "absolute", inset: 0, filter: "url(#goo)", opacity: 1 - logoOp }}>
        {blobs.map((b, i) => <span key={i} style={{ position: "absolute", left: b.x - 54 * m, top: b.y - 54 * m, width: 108 * m, height: 108 * m, borderRadius: 999, background: i % 2 ? K.ink : K.green }} />)}
        <span style={{ position: "absolute", left: cx - 70 * m, top: cy - 70 * m, width: 140 * m, height: 140 * m, borderRadius: 999, background: K.ink }} />
      </div>
      {[0, 1, 2].map(i => { const p = clamp(f, t0 + 4 + i * 5, t0 + 34 + i * 5); return p > 0 && p < 1 ? <span key={i} style={{ position: "absolute", left: cx - 200 * m, top: cy - 200 * m, width: 400 * m, height: 400 * m, borderRadius: 999, border: `${3 * m}px solid rgba(10,10,11,${0.22 * (1 - p)})`, transform: `scale(${0.3 + p * 3})` }} /> : null })}
      <div style={{ position: "absolute", left: cx - 120 * m, top: cy - 120 * m, opacity: logoOp, transform: `scale(${0.2 + pop * 0.8}) rotate(${(1 - pop) * -40}deg)`, filter: `drop-shadow(0 ${24 * m}px ${40 * m}px rgba(10,10,11,0.2))` }}>
        <Logo size={240 * m} dark />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: cy + 170 * m, textAlign: "center" }}>
        <p style={{ margin: `0 0 ${6 * m}px`, fontFamily: FONT, fontSize: 40 * m, color: K.muted, letterSpacing: "0.34em", textTransform: "uppercase", opacity: clamp(f, t0 + 2, t0 + 14) }}>Meet</p>
        <div style={{ display: "inline-block", fontFamily: FONT, fontSize: 210 * m, fontWeight: 700, color: K.ink, letterSpacing: `${-0.05 + (1 - clamp(f, t0 + 6, t0 + 24)) * 0.5}em`, opacity: clamp(f, t0 + 6, t0 + 16), filter: `blur(${(1 - clamp(f, t0 + 6, t0 + 22)) * 18}px)` }}>Orvia</div>
        <div style={{ margin: `${8 * m}px auto 0`, height: 6 * m, width: 260 * m * clamp(f, t0 + 24, t0 + 44), background: K.green, borderRadius: 6 * m }} />
      </div>
    </AbsoluteFill>
  )
}

// ─── 4. Answers every call, day and night ────────────────

const BeatOrb: React.FC = () => {
  const f = useAbs()
  const { m, V, fps } = useL()
  const a = useAnchors()
  const enter = sp(f, fps, U[4].s - 8, { damping: 16, stiffness: 90 })
  const N = 72, R = 205 * m
  const env = 0.65 + 0.35 * Math.sin(f * 0.33) * Math.sin(f * 0.11 + 1)
  const sunA = f * 0.05
  const RING = 330 * m
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: a.sx, top: a.sy, transform: `scale(${(0.4 + enter * 0.6) * (V ? 1.28 : 1)})`, opacity: enter }}>
        <div style={{ position: "absolute", left: -RING, top: -RING, width: RING * 2, height: RING * 2, perspective: 1400 * m }}>
          <div style={{ position: "absolute", inset: 0, transform: "rotateX(70deg)", transformStyle: "preserve-3d" }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: 999, border: `${2 * m}px dashed rgba(10,10,11,0.28)`, transform: `rotateZ(${f * 0.5}deg)`, transformStyle: "preserve-3d" }}>
              {Array.from({ length: 24 }, (_, i) => (
                <span key={i} style={{ position: "absolute", left: "50%", top: 0, width: 2 * m, height: (i % 6 === 0 ? 22 : 11) * m, background: "rgba(10,10,11,0.35)", transformOrigin: `50% ${RING}px`, transform: `translateX(-50%) rotate(${i * 15}deg)` }} />
              ))}
              {/* day and night markers, turned to face the camera */}
              <span style={{ position: "absolute", left: "50%", top: "50%", width: 50 * m, height: 50 * m, marginLeft: -25 * m, marginTop: -25 * m, borderRadius: 999, background: "#fff", border: `${3 * m}px solid ${K.ink}`, transform: `rotate(${sunA}rad) translateX(${RING}px) rotate(${-sunA}rad) rotateZ(${-f * 0.5}deg) rotateX(-70deg)` }} />
              <span style={{ position: "absolute", left: "50%", top: "50%", width: 50 * m, height: 50 * m, marginLeft: -25 * m, marginTop: -25 * m, borderRadius: 999, background: K.ink, transform: `rotate(${sunA + Math.PI}rad) translateX(${RING}px) rotate(${-sunA - Math.PI}rad) rotateZ(${-f * 0.5}deg) rotateX(-70deg)` }} />
            </div>
          </div>
        </div>
        {Array.from({ length: N }, (_, i) => {
          const amp = Math.abs(Math.sin(f * 0.21 + i * 0.55)) * Math.abs(Math.sin(f * 0.13 + i * 0.23 + 1))
          const h = (14 + 80 * amp * env) * m
          return <span key={i} style={{ position: "absolute", left: -3 * m, top: -3 * m, width: 6 * m, height: h, borderRadius: 99, background: amp > 0.62 ? K.green : K.ink, opacity: 0.25 + amp * 0.75, transformOrigin: "50% 0", transform: `rotate(${(i / N) * 360 + f * 0.3}deg) translateY(${R}px)` }} />
        })}
        <div style={{ position: "absolute", left: -150 * m, top: -150 * m, width: 300 * m, height: 300 * m, borderRadius: 999, background: "#fff", border: `${Math.max(1, m)}px solid ${K.line}`, boxShadow: K.shadow, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Logo size={128 * m} dark />
        </div>
      </div>
      <Headline>
        <Kinetic text="Answers every call," start={U[4].s - 4} size={H1(m, V) * 0.9} />
        <Kinetic text="day and night." start={U[4].s + 50} size={H1(m, V) * 0.9} color={K.green} />
      </Headline>
    </AbsoluteFill>
  )
}

// ─── 5. Finds a time, books the job, updates the calendar ─

const COLS = 7, ROWS = 5, TC = 4, TR = 2
const BUSY = new Set(["0,1", "1,3", "2,0", "2,4", "3,3", "5,1", "5,3", "6,0", "6,4", "1,0", "4,4"])

const BeatBook: React.FC = () => {
  const f = useAbs()
  const { m, V, fps } = useL()
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
        <div style={{ width: 54 * m, height: 54 * m, borderRadius: 999, background: done ? K.green : "transparent", border: `${3 * m}px solid ${done ? K.green : "rgba(10,10,11,0.18)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <CheckGlyph size={28 * m} draw={clamp(f, t + delay, t + delay + 10)} />
        </div>
        <Kinetic text={text} start={t - 3} size={(V ? 66 : 70) * m} color={done ? K.ink : K.faint} stagger={0.9} />
      </div>
    )
  }
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: a.sx - PW / 2, top: a.sy - PH / 2 + (V ? 60 * m : 0), width: PW, height: PH, perspective: 1800 * m, opacity: enter }}>
        <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: `rotateX(${rx}deg) rotateZ(${rz}deg) scale(${0.85 + enter * 0.15})` }}>
          <div style={{ position: "absolute", inset: -24 * m, borderRadius: 28 * m, background: "#fff", border: `${Math.max(1, m)}px solid ${K.line}`, boxShadow: `0 ${50 * m}px ${100 * m}px rgba(10,10,11,0.18)` }} />
          {Array.from({ length: COLS * ROWS }, (_, n) => {
            const c = n % COLS, r = Math.floor(n / COLS)
            const busy = BUSY.has(`${c},${r}`)
            const glow = Math.max(0, 1 - Math.abs(c + r - sweep) / 1.7) * (busy ? 0.25 : 1)
            const rowHit = f >= tUpd && r === TR ? clamp(f, tUpd, tUpd + 16) : 0
            const g = Math.max(glow, rowHit)
            return <div key={n} style={{
              position: "absolute", left: c * cw + 4 * m, top: r * ch + 4 * m, width: cw - 8 * m, height: ch - 8 * m, borderRadius: 14 * m,
              background: busy ? "rgba(10,10,11,0.07)" : g > 0.05 ? `rgba(16,185,129,${0.06 + g * 0.2})` : K.wash,
              border: `${Math.max(1, m)}px solid ${g > 0.1 && !busy ? `rgba(16,185,129,${0.2 + g * 0.8})` : K.line}`,
            }} />
          })}
          {f >= tBook - 22 && (
            <div style={{
              position: "absolute", left: TC * cw + 4 * m - 20 * m, top: TR * ch + 4 * m - 6 * m, width: cw - 8 * m + 40 * m, height: ch - 8 * m + 12 * m, borderRadius: 16 * m,
              background: K.green, color: "#fff", fontFamily: FONT, display: "flex", flexDirection: "column", justifyContent: "center", padding: `0 ${16 * m}px`,
              transform: `translateZ(${(1 - dock) * 300 * m}px) scale(${1.25 - dock * 0.25})`, opacity: clamp(f, tBook - 22, tBook - 14),
              boxShadow: `0 ${(1 - dock) * 80 * m + 10 * m}px ${50 * m}px rgba(16,185,129,${0.2 + (1 - dock) * 0.25})`,
            }}>
              <span style={{ fontSize: 24 * m, fontWeight: 700, letterSpacing: "-0.02em" }}>10:15 · Sarah K.</span>
              <span style={{ fontSize: 19 * m, opacity: 0.85 }}>Leak repair</span>
              <span style={{ position: "absolute", right: 12 * m, top: 10 * m }}><CheckGlyph size={24 * m} draw={draw} /></span>
            </div>
          )}
          <Spark cx={TC * cw + cw / 2} cy={TR * ch + ch / 2} f={f} start={tBook} dist={190 * m} size={9 * m} />
          {f >= tBook && f < tBook + 24 && <span style={{ position: "absolute", left: TC * cw - 20 * m, top: TR * ch - 20 * m, width: cw + 40 * m, height: ch + 40 * m, borderRadius: 24 * m, border: `${4 * m}px solid ${K.green}`, opacity: 1 - (f - tBook) / 24, transform: `scale(${1 + (f - tBook) * 0.05})` }} />}
        </div>
      </div>
      <div style={{ position: "absolute", left: a.hx, top: a.hy, width: a.hw, transform: V ? undefined : "translateY(-50%)", display: "flex", flexDirection: "column", gap: (V ? 22 : 30) * m }}>
        {step(0, tFind - 4, "Finds a time.", 14)}
        {step(1, tBook - 4, "Books the job.", 10)}
        {step(2, tUpd - 4, "Updates your calendar.", 14)}
        <div style={{ opacity: clamp(f, tInst - 4, tInst + 4), transform: `translateX(${(1 - clamp(f, tInst - 4, tInst + 6)) * -40 * m}px)`, display: "flex", alignItems: "center", gap: 14 * m }}>
          <span style={{ fontFamily: FONT, fontSize: 52 * m, fontWeight: 700, color: K.green, letterSpacing: "-0.03em" }}>Instantly.</span>
        </div>
      </div>
    </AbsoluteFill>
  )
}

// ─── 6 + 7. The dashboard, then the calls page ───────────

const DAYS = ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"]
const SERIES = [3, 6, 4, 2, 3, 4, 7]

function curve(pts: [number, number][]): string {
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`
  }
  return d
}

const CALLS = [
  { n: "Mike R.", i: "M", s: "Burst pipe, urgent visit", t: "7:42 AM", o: "Booked" },
  { n: "Dana L.", i: "D", s: "AC not cooling", t: "9:15 AM", o: "Callback" },
  { n: "Chris P.", i: "C", s: "Asked about whitening", t: "11:03 AM", o: "Lead" },
  { n: "Sarah K.", i: "S", s: "Leak repair tomorrow", t: "12:40 PM", o: "Booked" },
  { n: "Marcus T.", i: "M", s: "Water heater quote", t: "2:20 PM", o: "Lead" },
  { n: "Elena V.", i: "E", s: "Drain cleaning", t: "4:05 PM", o: "Booked" },
]
const NAV = ["Overview", "Demo", "Calls", "Appointments", "Leads"]

const StatusCard: React.FC<{ m: number; label: string; value: string; sub: string; dot?: boolean }> = ({ m, label, value, sub, dot }) => (
  <Card m={m} radius={20} style={{ flex: 1, padding: `${18 * m}px ${24 * m}px`, fontFamily: FONT, boxShadow: "0 1px 2px rgba(10,10,11,0.04)" }}>
    <p style={{ margin: 0, fontSize: 15 * m, letterSpacing: "0.12em", textTransform: "uppercase", color: K.muted, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 * m }}>
      {dot && <span style={{ width: 8 * m, height: 8 * m, borderRadius: 99, background: K.green }} />}{label}
    </p>
    <p style={{ margin: `${6 * m}px 0 0`, fontSize: 28 * m, fontWeight: 650, color: K.ink, letterSpacing: "-0.03em" }}>{value}</p>
    <p style={{ margin: `${2 * m}px 0 0`, fontSize: 16 * m, color: K.muted }}>{sub}</p>
  </Card>
)

const Overview: React.FC<{ f: number; m: number; t0: number; compact: boolean }> = ({ f, m, t0, compact }) => {
  const { fps } = useL()
  const bookedToday = Math.round(clamp(f, t0 + 12, t0 + 52, 0, 7))
  const CW = 700, CH = compact ? 300 : 165
  const padX = 34, base = CH - 34
  const pts: [number, number][] = SERIES.map((v, i) => [padX + (i * (CW - padX * 2)) / (SERIES.length - 1), base - (v / 8) * (CH - 62)])
  const d = curve(pts)
  const draw = clamp(f, t0 + 16, t0 + 80)
  const hover = f > t0 + 92 ? 6 : -1
  const rows = [
    { t: "9:00 AM", n: "Sarah K.", s: "Leak repair", tag: "Today", g: true },
    { t: "11:30 AM", n: "Marcus T.", s: "Water heater", tag: "Today", g: true },
    { t: "2:15 PM", n: "Elena V.", s: "Drain cleaning", tag: "Tomorrow", g: false },
  ]
  const kpi = (label: string, value: number, suffix: string, delta: string, delay: number) => {
    const p = sp(f, fps, t0 + delay)
    return (
      <Card m={m} radius={20} key={label} style={{ flex: 1, minHeight: 0, padding: `${10 * m}px ${22 * m}px`, fontFamily: FONT, opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 30 * m}px)`, boxShadow: "0 1px 2px rgba(10,10,11,0.04)" }}>
        <p style={{ margin: 0, fontSize: 16 * m, color: K.muted }}>{label}</p>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 * m, marginTop: 4 * m }}>
          <span style={{ fontFamily: MONO, fontSize: 36 * m, fontWeight: 600, letterSpacing: "-0.05em", color: K.ink }}>{Math.round(clamp(f, t0 + delay + 6, t0 + delay + 46, 0, value))}{suffix}</span>
          <span style={{ fontSize: 16 * m, fontWeight: 600, color: K.greenDark }}>{delta}</span>
        </div>
      </Card>
    )
  }
  return (
    <div style={{ position: "absolute", inset: 0, padding: `${30 * m}px ${34 * m}px`, display: "flex", flexDirection: "column", gap: 18 * m, fontFamily: FONT }}>
      <div style={{ opacity: clamp(f, t0, t0 + 12) }}>
        <p style={{ margin: 0, fontSize: 40 * m, fontWeight: 650, letterSpacing: "-0.04em", color: K.ink }}>Welcome back</p>
        <p style={{ margin: `${4 * m}px 0 0`, fontSize: 18 * m, color: K.muted }}>Monday, October 5 · 3 callers today, every one picked up.</p>
      </div>
      {!compact && (
        <div style={{ display: "flex", gap: 18 * m, opacity: clamp(f, t0 + 4, t0 + 16), transform: `translateY(${(1 - clamp(f, t0 + 4, t0 + 16)) * 20 * m}px)` }}>
          <StatusCard m={m} label="AI agent" value="Live" sub="Answering calls" dot />
          <StatusCard m={m} label="Needs attention" value="All clear" sub="No issues right now" />
          <StatusCard m={m} label="Next appointment" value="Chris Walker" sub="4:30 PM · in 1h 23m" />
        </div>
      )}
      <div style={{ display: "flex", gap: 18 * m, flexDirection: compact ? "column" : "row", flex: 1, minHeight: 0 }}>
        <Card m={m} radius={22} style={{ flex: compact ? "none" : 1.7, padding: `${24 * m}px ${28 * m}px`, display: "flex", flexDirection: "column", boxShadow: "0 1px 2px rgba(10,10,11,0.04)", opacity: clamp(f, t0 + 6, t0 + 18) }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div>
              <p style={{ margin: 0, fontSize: 18 * m, color: K.muted }}>Appointments booked today</p>
              <p style={{ margin: `${4 * m}px 0 0`, fontFamily: MONO, fontSize: 72 * m, fontWeight: 600, letterSpacing: "-0.06em", color: K.ink, lineHeight: 1 }}>{bookedToday}</p>
            </div>
            <span style={{ fontSize: 19 * m, fontWeight: 650, color: K.greenDark, opacity: clamp(f, t0 + 50, t0 + 62) }}>↑ 3 vs yesterday</span>
          </div>
          <svg viewBox={`0 0 ${CW} ${CH}`} style={{ width: "100%", height: "auto", flexShrink: 0, marginTop: "auto", overflow: "visible" }}>
            <defs>
              <linearGradient id="cs" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stopColor="#34D399" /><stop offset="100%" stopColor="#059669" /></linearGradient>
              <linearGradient id="cf" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#10B981" stopOpacity="0.22" /><stop offset="100%" stopColor="#10B981" stopOpacity="0" /></linearGradient>
              <clipPath id="creveal"><rect x="0" y="-20" width={CW * draw} height={CH + 40} /></clipPath>
            </defs>
            {hover >= 0 && <rect x={pts[hover][0] - 24} y={pts[hover][1]} width="48" height={base - pts[hover][1]} rx="14" fill="#10B981" opacity={0.18 * clamp(f, t0 + 92, t0 + 104)} />}
            <g clipPath="url(#creveal)">
              <path d={`${d} L ${pts[6][0]} ${base} L ${pts[0][0]} ${base} Z`} fill="url(#cf)" />
              <path d={d} fill="none" stroke="url(#cs)" strokeWidth="4" strokeLinecap="round" />
            </g>
            {pts.map(([x, y], i) => {
              const show = clamp(f, t0 + 16 + (i / 6) * 64, t0 + 24 + (i / 6) * 64)
              return <circle key={i} cx={x} cy={y} r={(i === hover ? 7 : 5) * show} fill={i === hover ? K.green : "#fff"} stroke={K.green} strokeWidth="2.5" />
            })}
            {DAYS.map((t, i) => <text key={t} x={pts[i][0]} y={CH - 8} textAnchor="middle" fontSize="14" fill={K.muted} fontFamily={FONT}>{t}</text>)}
          </svg>
        </Card>
        <div style={{ flex: compact ? "none" : 1, height: compact ? 130 * m : undefined, minHeight: 0, display: "flex", flexDirection: compact ? "row" : "column", gap: 14 * m }}>
          {kpi("Calls handled", 128, "", "↑ 12%", 14)}
          {kpi("New leads", 34, "", "↑ 9%", 22)}
          {kpi("Booking rate", 62, "%", "↑ 8%", 30)}
        </div>
      </div>
      <Card m={m} radius={22} style={{ padding: `${18 * m}px ${28 * m}px`, boxShadow: "0 1px 2px rgba(10,10,11,0.04)" }}>
        <p style={{ margin: `0 0 ${6 * m}px`, fontSize: 20 * m, fontWeight: 650, color: K.ink, letterSpacing: "-0.02em" }}>Coming up</p>
        {rows.slice(0, compact ? 2 : 3).map((r, i) => {
          const p = sp(f, fps, t0 + 50 + i * 10)
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 20 * m, padding: `${8 * m}px 0`, borderTop: `${Math.max(1, m)}px solid ${K.line}`, opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * 50 * m}px)` }}>
              <span style={{ fontFamily: MONO, fontSize: 17 * m, width: 120 * m, color: K.ink }}>{r.t}</span>
              <span style={{ fontSize: 19 * m, fontWeight: 600, color: K.ink, flex: 1 }}>{r.n} <span style={{ fontWeight: 400, color: K.muted }}>· {r.s}</span></span>
              <Pill m={m} tone={r.g ? "green" : "grey"}>{r.tag}</Pill>
            </div>
          )
        })}
      </Card>
    </div>
  )
}

const CallsPage: React.FC<{ f: number; m: number; t0: number; compact: boolean }> = ({ f, m, t0, compact }) => {
  const { fps } = useL()
  const summary = "Burst pipe in the kitchen. Emergency visit booked for 2:15 PM. Customer confirmed."
  const text = typed(summary, f, t0 + 24, 1.0)
  return (
    <div style={{ position: "absolute", inset: 0, padding: `${30 * m}px ${34 * m}px`, display: "flex", flexDirection: "column", gap: 20 * m, fontFamily: FONT }}>
      <div>
        <p style={{ margin: 0, fontSize: 40 * m, fontWeight: 650, letterSpacing: "-0.04em", color: K.ink }}>Calls</p>
        <p style={{ margin: `${4 * m}px 0 0`, fontSize: 18 * m, color: K.muted }}>13 calls today · every one summarized</p>
      </div>
      <div style={{ display: "flex", gap: 20 * m, flexDirection: compact ? "column" : "row", flex: 1, minHeight: 0 }}>
        <Card m={m} radius={22} style={{ flex: compact ? "none" : 1.15, padding: `${8 * m}px ${10 * m}px`, boxShadow: "0 1px 2px rgba(10,10,11,0.04)" }}>
          {CALLS.slice(0, compact ? 5 : 6).map((c, i) => {
            const p = sp(f, fps, t0 + 4 + i * 5)
            const sel = i === 0 && f > t0 + 18
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 18 * m, padding: `${12 * m}px ${16 * m}px`, borderRadius: 16 * m, background: sel ? K.wash : "transparent", opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * 60 * m}px)` }}>
                <div style={{ width: 46 * m, height: 46 * m, borderRadius: 999, background: c.o === "Booked" ? K.greenWash : K.wash, color: c.o === "Booked" ? K.greenDark : K.muted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 * m, fontWeight: 700, flexShrink: 0 }}>{c.i}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 21 * m, fontWeight: 650, color: K.ink, letterSpacing: "-0.02em" }}>{c.n}</p>
                  <p style={{ margin: `${2 * m}px 0 0`, fontSize: 16 * m, color: K.muted }}>{c.s}</p>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 14 * m, color: K.muted }}>{c.t}</span>
                <Pill m={m} tone={c.o === "Booked" ? "green" : "grey"}>{c.o}</Pill>
              </div>
            )
          })}
        </Card>
        <Card m={m} radius={22} style={{ flex: 1, padding: `${24 * m}px ${28 * m}px`, boxShadow: "0 1px 2px rgba(10,10,11,0.04)", opacity: clamp(f, t0 + 12, t0 + 26) }}>
          <p style={{ margin: 0, fontSize: 15 * m, letterSpacing: "0.12em", textTransform: "uppercase", color: K.green, fontWeight: 700 }}>Call summary</p>
          <p style={{ margin: `${12 * m}px 0 0`, fontSize: 28 * m, lineHeight: 1.35, color: K.ink, letterSpacing: "-0.02em", minHeight: 4 * 28 * 1.35 * m }}>
            {text}<span style={{ opacity: Math.floor(f / 8) % 2 ? 0 : 1, color: K.green }}>|</span>
          </p>
          <div style={{ display: "flex", gap: 10 * m, flexWrap: "wrap", marginTop: 14 * m, opacity: clamp(f, t0 + 70, t0 + 84) }}>
            <Pill m={m} tone="green">Booked</Pill><Pill m={m} tone="grey">2m 14s</Pill><Pill m={m} tone="grey">Burst pipe</Pill>
          </div>
        </Card>
      </div>
    </div>
  )
}

const BeatApp: React.FC = () => {
  const f = useAbs()
  const { W, H, V, m, fps } = useL()
  const t0 = U[6].s - 12
  const tSwap = U[7].s - 8
  const swap = clamp(f, tSwap, tSwap + 18)
  const enter = sp(f, fps, t0 - 6, { damping: 18, stiffness: 70 })
  const WW = (V ? 960 : 1560) * m, WH = (V ? 1140 : 850) * m
  const cx = W / 2, cy = H * (V ? 0.58 : 0.565)
  const sw = V ? 0 : 250 * m
  const navY = (1 - swap) * 0 + swap * 2 // nav index: Overview 0 -> Calls 2
  const cam = lin(f, t0, tSwap + 120, 0, 1)
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: cx - WW / 2, top: cy - WH / 2, width: WW, height: WH, perspective: 2400 * m }}>
        <div style={{
          position: "absolute", inset: 0, transform: `rotateY(${(1 - enter) * -18 + Math.sin(f * 0.02) * 1.2}deg) rotateX(${(1 - enter) * 10}deg) translateX(${(1 - enter) * 180 * m}px) scale(${(0.88 + enter * 0.12) * (1 + cam * 0.035)})`,
          opacity: Math.min(1, enter * 1.6), borderRadius: 28 * m, overflow: "hidden", background: K.bg, border: `${Math.max(1, m)}px solid ${K.line}`, boxShadow: "0 50px 120px rgba(10,10,11,0.18), 0 2px 8px rgba(10,10,11,0.06)",
        }}>
          {!V && (
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: sw, background: "#fff", borderRight: `${Math.max(1, m)}px solid ${K.line}`, padding: `${28 * m}px ${20 * m}px`, fontFamily: FONT }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 * m, marginBottom: 30 * m }}>
                <Logo size={40 * m} dark />
                <div><p style={{ margin: 0, fontSize: 20 * m, fontWeight: 700, color: K.ink, letterSpacing: "-0.03em" }}>Orvia</p><p style={{ margin: 0, fontSize: 12 * m, color: K.muted, letterSpacing: "0.08em" }}>AI RECEPTIONIST</p></div>
              </div>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 0, right: 0, top: navY * 58 * m, height: 50 * m, borderRadius: 14 * m, background: K.wash }} />
                {NAV.map((n, i) => (
                  <div key={n} style={{ position: "relative", height: 50 * m, marginBottom: 8 * m, display: "flex", alignItems: "center", gap: 14 * m, padding: `0 ${14 * m}px`, fontSize: 19 * m, fontWeight: i === 0 && swap < 0.5 || i === 2 && swap >= 0.5 ? 650 : 500, color: i === 0 && swap < 0.5 || i === 2 && swap >= 0.5 ? K.ink : K.muted }}>
                    <span style={{ width: 20 * m, height: 20 * m, borderRadius: 6 * m, border: `${2 * m}px solid currentColor`, opacity: 0.7 }} />{n}
                  </div>
                ))}
              </div>
              <div style={{ position: "absolute", left: 20 * m, right: 20 * m, bottom: 24 * m, padding: `${12 * m}px ${16 * m}px`, borderRadius: 14 * m, background: K.wash, display: "flex", alignItems: "center", gap: 10 * m, fontSize: 17 * m, fontWeight: 600, color: K.ink }}>
                <span style={{ width: 10 * m, height: 10 * m, borderRadius: 99, background: K.green }} />Live
              </div>
            </div>
          )}
          <div style={{ position: "absolute", left: sw, top: 0, right: 0, bottom: 0 }}>
            <div style={{ position: "absolute", inset: 0, opacity: 1 - swap, transform: `translateX(${-swap * 70 * m}px)` }}>
              <Overview f={f} m={m} t0={t0} compact={V} />
            </div>
            {swap > 0 && (
              <div style={{ position: "absolute", inset: 0, opacity: swap, transform: `translateX(${(1 - swap) * 70 * m}px)` }}>
                <CallsPage f={f} m={m} t0={tSwap + 6} compact={V} />
              </div>
            )}
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: H * (V ? 0.07 : 0.045), textAlign: "center", padding: `0 ${50 * m}px` }}>
        <div style={{ opacity: 1 - swap, height: swap >= 1 ? 0 : undefined }}>
          <Kinetic text="Every booking and lead lands in one dashboard." start={U[6].s - 4} size={(V ? 66 : 50) * m} align="center" stagger={0.6} />
        </div>
        {swap > 0 && (
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, opacity: swap }}>
            <Kinetic text="Every call is summarized." start={U[7].s - 4} size={(V ? 66 : 50) * m} align="center" stagger={0.6} />
          </div>
        )}
      </div>
    </AbsoluteFill>
  )
}

// ─── 8. Whatever you run, it fits in ─────────────────────

const NICHE_CHIPS = [
  { n: "Plumbing", u: 8 },
  { n: "Dental", u: 9 },
  { n: "HVAC", u: 10 },
  { n: "Real estate", u: 11 },
  { n: "Your business", u: 12 },
]

const BeatNiches: React.FC = () => {
  const f = useAbs()
  const { m, V, fps } = useL()
  const a = useAnchors()
  const tTight = U[12].s
  const tight = clamp(f, tTight, tTight + 26)
  const rx = (V ? 330 : 400) * m * (1 - tight * 0.08), ry = (V ? 200 : 185) * m * (1 - tight * 0.08)
  const spin = f * 0.02 + tight * 0.5
  const enter = sp(f, fps, U[8].s - 20, { damping: 16, stiffness: 90 })
  const chips = NICHE_CHIPS.map((c, i) => {
    const ang = spin + (i / NICHE_CHIPS.length) * Math.PI * 2 + 0.6
    const depth = (Math.sin(ang) + 1) / 2
    return { ...c, i, x: Math.cos(ang) * rx, y: Math.sin(ang) * ry, depth }
  }).sort((p, q) => p.depth - q.depth)
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: a.sx, top: a.sy, opacity: enter }}>
        {[1, 1.28].map((k, j) => (
          <div key={j} style={{ position: "absolute", left: -rx * k, top: -ry * k, width: rx * 2 * k, height: ry * 2 * k, borderRadius: "50%", border: `${2 * m}px ${j ? "dashed" : "solid"} rgba(10,10,11,${j ? 0.16 : 0.14})` }} />
        ))}
        <div style={{ position: "absolute", zIndex: 5, left: -90 * m, top: -90 * m, filter: `drop-shadow(0 ${16 * m}px ${30 * m}px rgba(10,10,11,0.2))`, transform: `scale(${1 + 0.05 * Math.sin(f * 0.2) + tight * 0.12})` }}>
          <Logo size={180 * m} dark />
        </div>
        {chips.map(c => {
          const t = U[c.u].s - 4
          const pop = sp(f, fps, t, { damping: 10, stiffness: 160 })
          if (f < t) return null
          const hot = f >= U[c.u].s - 4 && f < U[c.u].e + 14
          const sc = (0.78 + 0.34 * c.depth) * (hot ? 1.16 : 1) * (0.3 + pop * 0.7) * (V ? 1.2 : 1)
          return (
            <div key={c.i} style={{ position: "absolute", left: c.x, top: c.y, transform: `translate(-50%, -50%) scale(${sc})`, zIndex: (c.depth > 0.5 ? 10 : 1) + (hot && c.depth > 0.5 ? 20 : 0), opacity: (0.6 + 0.4 * c.depth) * Math.min(1, pop * 2) }}>
              <div style={{ padding: `${14 * m}px ${30 * m}px`, borderRadius: 999, background: hot ? K.ink : "#fff", border: `${Math.max(1, m)}px solid ${hot ? K.ink : K.line}`, boxShadow: hot ? `0 ${20 * m}px ${50 * m}px rgba(10,10,11,0.28)` : `0 ${10 * m}px ${30 * m}px rgba(10,10,11,0.08)`, display: "flex", alignItems: "center", gap: 14 * m, whiteSpace: "nowrap", fontFamily: FONT }}>
                <span style={{ width: 14 * m, height: 14 * m, borderRadius: 999, background: K.green }} />
                <span style={{ fontSize: 38 * m, fontWeight: 650, color: hot ? "#fff" : K.ink, letterSpacing: "-0.03em" }}>{c.n}</span>
              </div>
              {f >= t && f < t + 22 && <span style={{ position: "absolute", left: "50%", top: "50%", width: 120 * m, height: 120 * m, marginLeft: -60 * m, marginTop: -60 * m, borderRadius: 999, border: `${3 * m}px solid ${K.green}`, opacity: 1 - (f - t) / 22, transform: `scale(${1 + (f - t) / 5})` }} />}
            </div>
          )
        })}
      </div>
      <div style={{ position: "absolute", left: a.hx, top: a.hy, width: a.hw, transform: V ? undefined : "translateY(-50%)", display: "flex", flexDirection: "column", gap: 6 * m }}>
        {NICHE_CHIPS.slice(0, 4).map(c => (
          <Kinetic key={c.n} text={c.n} start={U[c.u].s - 4} size={(V ? 74 : 86) * m} color={f > tTight ? "rgba(10,10,11,0.22)" : K.ink} />
        ))}
        <div style={{ marginTop: 20 * m }}>
          <Kinetic text="Whatever you run, it fits in." start={tTight - 4} size={(V ? 54 : 58) * m} color={K.green} />
        </div>
      </div>
    </AbsoluteFill>
  )
}

// ─── 9. Hear it for yourself ─────────────────────────────

const BeatCta: React.FC = () => {
  const f = useAbs()
  const { W, H, m, V, fps } = useL()
  const t0 = U[13].s
  const tBtn = U[14].s - 6
  const tClick = U[14].s + 40
  const cx = W / 2
  const warp = clamp(f, t0 - 12, t0 + 14)
  const press = f >= tClick && f < tClick + 8 ? 0.94 : 1
  const btn = sp(f, fps, tBtn, { damping: 13, stiffness: 110 })
  const bx = cx, by = H * (V ? 0.6 : 0.68)
  const cp = clamp(f, tBtn + 8, tClick - 2)
  const curX = bx + (1 - cp) * (V ? 260 : 520) * m + Math.sin(cp * Math.PI) * -70 * m
  const curY = by + (1 - cp) * (V ? 360 : 300) * m + Math.sin(cp * Math.PI) * 60 * m + 20 * m
  const fin = clamp(f, tClick + 20, tClick + 50)
  return (
    <AbsoluteFill>
      {Array.from({ length: 56 }, (_, i) => {
        const ang = random(`w${i}`) * Math.PI * 2, len = (0.2 + random(`l${i}`) * 0.8) * Math.max(W, H)
        const t = (1 - warp) * (1 - warp)
        return <span key={i} style={{ position: "absolute", left: cx, top: H * 0.42, width: len * 0.5 * (1 - warp * 0.8), height: 2 * m, borderRadius: 3, background: `linear-gradient(90deg, transparent, ${i % 4 ? "rgba(10,10,11,0.35)" : K.green})`, transformOrigin: "0 50%", transform: `rotate(${ang}rad) translateX(${(0.05 + t * 1.2) * Math.max(W, H) * 0.5}px)`, opacity: (1 - warp) * 0.9 }} />
      })}
      <div style={{ position: "absolute", left: 0, right: 0, top: H * (V ? 0.26 : 0.2), textAlign: "center", padding: `0 ${60 * m}px` }}>
        <Kinetic text="Hear it" start={t0 - 4} size={150 * m} align="center" />
        <Kinetic text="for yourself." start={t0 + 8} size={150 * m} align="center" color={K.green} />
      </div>
      <div style={{ position: "absolute", left: bx, top: by, transform: `translate(-50%, -50%) scale(${(0.5 + btn * 0.5) * press})`, opacity: Math.min(1, btn * 1.4) }}>
        <div style={{ padding: `${34 * m}px ${78 * m}px`, borderRadius: 999, background: K.ink, color: "#fff", fontFamily: FONT, fontSize: 54 * m, fontWeight: 700, letterSpacing: "-0.03em", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 20 * m, boxShadow: `0 ${24 * m}px ${60 * m}px rgba(10,10,11,0.28)` }}>
          <PhoneGlyph size={46 * m} /> Try the live demo
        </div>
        <p style={{ margin: `${24 * m}px 0 0`, textAlign: "center", fontFamily: FONT, fontSize: 32 * m, color: K.muted, letterSpacing: "-0.01em", opacity: clamp(f, tBtn + 14, tBtn + 28) }}>No signup. Just talk.</p>
      </div>
      {f >= tClick && f < tClick + 30 && <span style={{ position: "absolute", left: bx - 120 * m, top: by - 120 * m, width: 240 * m, height: 240 * m, borderRadius: 999, border: `${4 * m}px solid rgba(10,10,11,${0.5 * (1 - (f - tClick) / 30)})`, transform: `scale(${0.4 + ((f - tClick) / 30) * 3.4})` }} />}
      <Spark cx={bx} cy={by} f={f} start={tClick} n={34} dist={300 * m} size={11 * m} life={40} />
      {cp > 0 && f < tClick + 14 && (
        <svg width={56 * m} height={56 * m} viewBox="0 0 24 24" style={{ position: "absolute", left: curX, top: curY, filter: "drop-shadow(0 4px 8px rgba(10,10,11,0.3))", opacity: clamp(f, tBtn + 8, tBtn + 14) * (1 - clamp(f, tClick + 6, tClick + 14)) }}>
          <path d="M4 2l16 9-7 2-3 7z" fill="#fff" stroke="#0A0A0B" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      )}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: H * 0.1, display: "flex", justifyContent: "center", alignItems: "center", gap: 22 * m, opacity: fin, transform: `translateY(${(1 - fin) * 30 * m}px)` }}>
        <Logo size={72 * m} dark />
        <span style={{ fontFamily: FONT, fontSize: 56 * m, fontWeight: 700, color: K.ink, letterSpacing: "-0.04em" }}>Orvia</span>
      </div>
    </AbsoluteFill>
  )
}

// ─── The cut ─────────────────────────────────────────────

export const CLEAN_TOTAL = TOTAL

export const CleanAd: React.FC = () => {
  const aTo = U[2].s - 4
  const bTo = U[3].s - 8
  const cTo = U[4].s - 6
  const dTo = U[5].s - 4
  const eTo = U[6].s - 8
  const fTo = U[8].s - 6
  const gTo = U[13].s - 6
  return (
    <AbsoluteFill style={{ background: K.bg }}>
      <Paper />
      <Beat from={0} to={aTo}><BeatRing /></Beat>
      <Beat from={aTo - 10} to={bTo}><BeatLost /></Beat>
      <Beat from={bTo - 10} to={cTo}><BeatMeet /></Beat>
      <Beat from={cTo - 10} to={dTo}><BeatOrb /></Beat>
      <Beat from={dTo - 10} to={eTo}><BeatBook /></Beat>
      <Beat from={eTo - 10} to={fTo}><BeatApp /></Beat>
      <Beat from={fTo - 10} to={gTo}><BeatNiches /></Beat>
      <Beat from={gTo - 10} to={TOTAL}><BeatCta /></Beat>
      <Audio src={staticFile("vo-clean/narration.wav")} />
    </AbsoluteFill>
  )
}
