// Five short cuts in the dashboard theme. Every scene is timed to its own
// narration (kit.U), so the same visuals work in any language.

import React from "react"
import { AbsoluteFill } from "remotion"
import {
  Check, Concept, Confetti, DATA, FLOWS, GLYPHS, Glyph, Lang, Logo, MONO, NICHE_COLORS, Pointer, PhoneIcon, Ripple, Shell, T,
  clamp, lin, money, shadow, sp, typed, useS,
} from "./kit"

const Pill: React.FC<{ children: React.ReactNode; m: number; bg?: string; color?: string; size?: number }> = ({ children, m, bg = T.wash, color = T.greenText, size = 22 }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 * m, padding: `${7 * m}px ${16 * m}px`, borderRadius: 999, background: bg, color, fontSize: size * m, fontWeight: 650, whiteSpace: "nowrap" }}>{children}</span>
)
const card = (m: number, extra: React.CSSProperties = {}): React.CSSProperties => ({ background: T.card, borderRadius: 28 * m, border: `${Math.max(1, m)}px solid ${T.line}`, boxShadow: shadow(m), ...extra })
const Bars: React.FC<{ n: number; w: number; h: number; on: boolean; color: string }> = ({ n, w, h, on, color }) => {
  const { f, m } = useS()
  return (
    <div style={{ display: "flex", alignItems: "center", gap: w * 0.8 * m, height: h * m }}>
      {Array.from({ length: n }, (_, j) => {
        const a = on ? Math.abs(Math.sin(f * 0.3 + j * 0.7)) * Math.abs(Math.sin(j * 0.45 + f * 0.1)) : 0.05
        return <span key={j} style={{ width: w * m, height: (0.1 + a * 0.9) * h * m, borderRadius: 99, background: j % 2 ? color : T.ink, opacity: on ? 0.35 + a * 0.65 : 0.2 }} />
      })}
    </div>
  )
}

// ─── 1. Missed: the cost of a missed call, then the same calls booked ──

const MissedScene: React.FC = () => {
  const { f, U, ui, market, m, W, H, V, fps } = useS()
  const rows = DATA[market].missed
  const total = rows.reduce((a, r) => a + r.v, 0)
  const hero = V ? { x: W / 2, y: H * 0.205, d: 290 * m } : { x: W * 0.27, y: H * 0.4, d: 330 * m }
  const list = V ? { x: W / 2, y: H * 0.335, w: 920 * m } : { x: W * 0.68, y: H * 0.21, w: 800 * m }
  const tot = V ? { x: W / 2, y: H * 0.64, w: 800 * m } : { x: W * 0.27, y: H * 0.63, w: 520 * m }
  const rowH = (V ? 150 : 132) * m, gap = 18 * m
  const green = clamp(f, U[3].s - 6, U[3].s + 24)
  const ring = f < U[3].s + 6
  const shake = Math.sin(f * 1.5) * 9 * (f % 52 < 32 ? 1 : 0.1)
  const orb = sp(f, fps, U[3].s, { damping: 11, stiffness: 100 })
  const flip = clamp(f, U[6].s - 8, U[6].s + 10)
  const val = clamp(f, U[2].s + 2, U[2].s + 46, 0, total)
  const totIn = clamp(f, U[2].s - 8, U[2].s + 8)
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 35%, rgba(239,68,68,${0.17 * (1 - green)}), transparent 62%), radial-gradient(ellipse at 50% 35%, rgba(16,185,129,${0.24 * green}), transparent 64%)` }} />
      {/* ringing phone, then the Orvia mark */}
      {ring && [0, 1, 2].map(r => {
        const t = ((f + r * 14) % 42) / 42
        return <span key={r} style={{ position: "absolute", left: hero.x - hero.d / 2, top: hero.y - hero.d / 2, width: hero.d, height: hero.d, borderRadius: "50%", border: `${3 * m}px solid ${T.red}`, opacity: (1 - t) * 0.45 * (1 - green), transform: `scale(${1 + t * 0.7})` }} />
      })}
      <div style={{ position: "absolute", left: hero.x - hero.d / 2, top: hero.y - hero.d / 2, width: hero.d, height: hero.d, borderRadius: "50%", background: T.redWash, display: "flex", alignItems: "center", justifyContent: "center", opacity: (1 - green) * clamp(f, 0, 10), transform: `rotate(${shake}deg) scale(${1 - 0.4 * green})`, boxShadow: shadow(m, 0.7) }}>
        <PhoneIcon size={hero.d * 0.46} color={T.red} />
      </div>
      <div style={{ position: "absolute", left: hero.x - hero.d / 2, top: hero.y - hero.d / 2, width: hero.d, height: hero.d, display: "flex", alignItems: "center", justifyContent: "center", opacity: Math.min(1, orb * 1.5), transform: `scale(${0.4 + 0.6 * orb})`, filter: `drop-shadow(0 ${16 * m}px ${44 * m}px rgba(16,185,129,0.45))` }}>
        <Logo size={hero.d * 0.86} dark />
      </div>
      <div style={{ position: "absolute", left: hero.x - 160 * m, top: hero.y + hero.d / 2 + 26 * m, width: 320 * m, display: "flex", justifyContent: "center", opacity: clamp(f, U[4].s, U[4].s + 10) }}>
        <Bars n={24} w={7} h={52} on={f >= U[4].s && f < U[5].s + 20} color={T.green} />
      </div>
      {/* the three calls */}
      {rows.map((r, i) => {
        const tIn = U[1].s + Math.round((i * (U[1].e - U[1].s)) / 3)
        const p = sp(f, fps, tIn, { damping: 13, stiffness: 110 })
        const bT = U[5].s + Math.round((i * (U[5].e - U[5].s)) / 3)
        const ang = clamp(f, bT, bT + 18) * 180
        const back = ang > 90
        const c = back ? T.green : T.red
        return (
          <div key={i} style={{ position: "absolute", left: list.x - list.w / 2, top: list.y + i * (rowH + gap), width: list.w, height: rowH, perspective: 1400 * m, opacity: Math.min(1, p * 1.6), transform: `translateY(${(1 - p) * -80 * m}px)` }}>
            <div style={{ ...card(m, { width: "100%", height: "100%", padding: `0 ${30 * m}px`, display: "flex", alignItems: "center", gap: 22 * m, boxShadow: `${shadow(m, 0.6)}${back ? `, 0 0 0 ${2 * m}px rgba(16,185,129,0.35)` : ""}`, transform: `rotateX(${ang}deg)` }) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 22 * m, width: "100%", transform: back ? "rotateX(180deg)" : undefined }}>
                <span style={{ width: 68 * m, height: 68 * m, borderRadius: "50%", background: back ? T.wash : T.redWash, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {back ? <Check size={36 * m} color={T.greenText} /> : <PhoneIcon size={32 * m} color={T.red} />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 34 * m, fontWeight: 650, letterSpacing: "-0.03em", color: T.ink }}>{r.who}</p>
                  <p style={{ fontSize: 23 * m, color: back ? T.greenText : T.muted, marginTop: 3 * m, whiteSpace: "nowrap" }}>{back ? `${ui.booked} · ${r.slot}` : `${ui.missed} · ${r.t}`}</p>
                </div>
                <Pill m={m} bg={back ? T.wash : T.redWash} color={c === T.green ? T.greenText : T.redText} size={28}>{back ? "+" : "−"}{money(market, r.v)}</Pill>
              </div>
            </div>
          </div>
        )
      })}
      {/* running total */}
      <div style={{ position: "absolute", left: tot.x - tot.w / 2, top: tot.y, width: tot.w, opacity: totIn, transform: `translateY(${(1 - totIn) * 40 * m}px)` }}>
        <div style={{ ...card(m, { padding: `${24 * m}px ${34 * m}px`, textAlign: "center", boxShadow: `${shadow(m, 0.8)}${flip > 0.5 ? `, 0 0 ${50 * m}px rgba(16,185,129,0.35)` : ""}` }) }}>
          <p style={{ fontSize: 26 * m, fontWeight: 600, color: flip > 0.5 ? T.greenText : T.redText }}>{flip > 0.5 ? ui.saved : ui.lost}</p>
          <p style={{ fontFamily: MONO, fontSize: (V ? 120 : 108) * m, fontWeight: 600, letterSpacing: "-0.05em", lineHeight: 1.1, color: flip > 0.5 ? T.greenText : T.redText, transform: `scale(${1 + 0.06 * Math.sin(flip * Math.PI)})` }}>{flip > 0.5 ? "+" : "−"}{money(market, val)}</p>
        </div>
      </div>
    </AbsoluteFill>
  )
}

// ─── 2. Ten seconds: how the live demo works ─────────────

const TenScene: React.FC = () => {
  const { f, U, ui, market, m, W, H, V, fps } = useS()
  const names = DATA[market].names
  const win = V ? { x: W / 2, y: H * 0.5, w: 930 * m, h: 1010 * m } : { x: W * 0.6, y: H * 0.5, w: 980 * m, h: 640 * m }
  const tm = V ? { x: W / 2, y: H * 0.155, d: 250 * m } : { x: W * 0.16, y: H * 0.5, d: 330 * m }
  const hdr = 76 * m
  const left = win.x - win.w / 2, top = win.y - win.h / 2
  const bodyCx = win.x, bodyCy = top + hdr + (win.h - hdr) / 2
  const pad = 56 * m, cg = 24 * m, chW = (win.w - 2 * pad - cg) / 2, chH = (V ? 170 : 130) * m
  const gridTop = top + hdr + 150 * m
  const chip0 = { x: left + pad + chW / 2, y: gridTop + chH / 2 }
  const tPick = U[1].s + 38, tCall = U[2].s + 32
  const callD = (V ? 300 : 240) * m
  const intro = sp(f, fps, 2, { damping: 14, stiffness: 90 })
  const tilt = Math.sin(f * 0.02) * 4
  const r = 1 - lin(f, U[1].s, U[4].s + 36)
  const secs = Math.ceil(10 * r - 0.001)
  const done = r <= 0
  const lay = (a: number, b: number) => clamp(f, a - 6, a + 8) * (1 - clamp(f, b - 2, b + 8))
  const bookP = sp(f, fps, U[4].s + 4, { damping: 13, stiffness: 90 })
  const ringR = tm.d / 2 - 14 * m, circ = 2 * Math.PI * ringR
  return (
    <AbsoluteFill>
      {/* countdown */}
      <div style={{ position: "absolute", left: tm.x - tm.d / 2, top: tm.y - tm.d / 2, width: tm.d, height: tm.d, opacity: Math.min(1, intro * 1.5), transform: `scale(${0.6 + 0.4 * intro})` }}>
        <svg width={tm.d} height={tm.d} style={{ position: "absolute", inset: 0 }}>
          <circle cx={tm.d / 2} cy={tm.d / 2} r={ringR} fill={T.card} stroke={T.chip} strokeWidth={14 * m} />
          <circle cx={tm.d / 2} cy={tm.d / 2} r={ringR} fill="none" stroke={T.green} strokeWidth={14 * m} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.max(0.0001, r))} transform={`rotate(-90 ${tm.d / 2} ${tm.d / 2})`} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          {done ? <Check size={tm.d * 0.4} color={T.greenText} /> : <span style={{ fontFamily: MONO, fontSize: tm.d * 0.36, fontWeight: 600, letterSpacing: "-0.05em", color: T.ink, lineHeight: 1 }}>{Math.min(10, secs)}</span>}
        </div>
      </div>
      {/* the demo window */}
      <div style={{ position: "absolute", left, top, width: win.w, height: win.h, perspective: 2200 * m, opacity: Math.min(1, intro * 1.4) }}>
        <div style={{ ...card(m, { position: "absolute", inset: 0, overflow: "hidden", borderRadius: 34 * m, transformOrigin: "50% 50%", transform: `translateY(${(1 - intro) * 120 * m}px) rotateX(${(1 - intro) * 30 + 3}deg) rotateY(${tilt - 4}deg)` }) }}>
          <div style={{ height: hdr, display: "flex", alignItems: "center", gap: 12 * m, padding: `0 ${28 * m}px`, borderBottom: `${Math.max(1, m)}px solid ${T.line}`, background: T.bg }}>
            {["#FF5F57", "#FEBC2E", "#28C840"].map(c => <span key={c} style={{ width: 16 * m, height: 16 * m, borderRadius: 99, background: c }} />)}
            <span style={{ marginLeft: 18 * m, display: "flex", alignItems: "center", gap: 10 * m, fontSize: 26 * m, fontWeight: 650, color: T.ink }}><Logo size={30 * m} dark />Orvia</span>
          </div>
          {/* 1. pick */}
          <div style={{ position: "absolute", left: 0, right: 0, top: hdr, bottom: 0, opacity: lay(U[1].s, U[2].s), padding: pad }}>
            <p style={{ fontSize: 36 * m, fontWeight: 650, color: T.ink, letterSpacing: "-0.02em" }}>{ui.pick}</p>
            <div style={{ position: "absolute", left: pad, top: 150 * m - 0, width: win.w - 2 * pad, display: "grid", gridTemplateColumns: "1fr 1fr", gap: cg }}>
              {ui.niches.map((n, i) => {
                const sel = i === 0 && f >= tPick
                return (
                  <div key={i} style={{ height: chH, borderRadius: 24 * m, border: `${(sel ? 3 : 1.5) * m}px solid ${sel ? T.green : T.line}`, background: sel ? T.wash : T.card, display: "flex", alignItems: "center", gap: 20 * m, padding: `0 ${26 * m}px`, transform: `scale(${sel ? 1.03 : 1})`, transition: "none" }}>
                    <span style={{ width: 64 * m, height: 64 * m, borderRadius: 18 * m, background: NICHE_COLORS[i], display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Glyph kind={GLYPHS[market][i]} size={34 * m} /></span>
                    <span style={{ fontSize: 32 * m, fontWeight: 650, color: T.ink, letterSpacing: "-0.02em", flex: 1 }}>{n}</span>
                    {sel && <Check size={34 * m} color={T.greenText} />}
                  </div>
                )
              })}
            </div>
          </div>
          {/* 2. press call */}
          <div style={{ position: "absolute", left: 0, right: 0, top: hdr, bottom: 0, opacity: lay(U[2].s, U[3].s), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 * m }}>
            <div style={{ width: callD, height: callD, borderRadius: "50%", background: `linear-gradient(135deg, ${T.greenLight}, ${T.green})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 ${20 * m}px ${60 * m}px rgba(16,185,129,0.45)`, transform: `scale(${f >= tCall && f < tCall + 6 ? 0.93 : 1 + 0.03 * Math.sin(f * 0.25)})` }}>
              <PhoneIcon size={callD * 0.42} color="#fff" />
            </div>
            <p style={{ fontSize: 34 * m, fontWeight: 650, color: T.ink }}>{ui.press}</p>
          </div>
          {/* 3. talking */}
          <div style={{ position: "absolute", left: 0, right: 0, top: hdr, bottom: 0, opacity: lay(U[3].s, U[4].s), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30 * m }}>
            <Pill m={m} size={28}><span style={{ width: 14 * m, height: 14 * m, borderRadius: 99, background: T.green, opacity: 0.5 + 0.5 * Math.sin(f * 0.3) }} />{ui.live}</Pill>
            <Bars n={36} w={9} h={130} on color={T.green} />
            <p style={{ fontSize: 30 * m, color: T.muted }}>{ui.talk}</p>
          </div>
          {/* 4. the booking */}
          <div style={{ position: "absolute", left: 0, right: 0, top: hdr, bottom: 0, opacity: clamp(f, U[4].s, U[4].s + 8), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30 * m, perspective: 1400 * m }}>
            <div style={{ ...card(m, { width: win.w * 0.78, padding: `${30 * m}px ${34 * m}px`, transform: `translateY(${(1 - bookP) * 160 * m}px) rotateX(${(1 - bookP) * -50}deg)`, opacity: Math.min(1, bookP * 1.5) }) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 22 * m }}>
                <span style={{ width: 72 * m, height: 72 * m, borderRadius: "50%", background: T.wash, color: T.greenText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 * m, fontWeight: 700 }}>{names[0][0]}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 36 * m, fontWeight: 650, letterSpacing: "-0.03em", color: T.ink }}>{names[0]}</p>
                  <p style={{ fontSize: 24 * m, color: T.muted, marginTop: 4 * m }}>{ui.niches[0]} · {DATA[market].missed[0].slot}</p>
                </div>
                <Pill m={m} size={26}><Check size={26 * m} color={T.greenText} />{ui.booked}</Pill>
              </div>
            </div>
            <div style={{ opacity: clamp(f, U[5].s, U[5].s + 12), transform: `translateY(${(1 - clamp(f, U[5].s, U[5].s + 12)) * 20 * m}px)` }}><Pill m={m} size={28}><Check size={28 * m} color={T.greenText} />{ui.nosignup}</Pill></div>
          </div>
        </div>
      </div>
      <Pointer pts={[[U[1].s + 4, left + win.w * 0.95, top + win.h * 0.9], [tPick, chip0.x + 24 * m, chip0.y + 14 * m]]} />
      <Ripple cx={chip0.x + 24 * m} cy={chip0.y + 14 * m} at={tPick} size={140} />
      <Pointer pts={[[U[2].s + 6, left + win.w * 0.8, top + win.h * 0.85], [tCall, bodyCx + 30 * m, bodyCy - 20 * m]]} />
      <Ripple cx={bodyCx} cy={bodyCy - 30 * m} at={tCall} size={callD / m} />
      <Confetti cx={bodyCx} cy={bodyCy} start={U[4].s + 22} dist={300 * m} n={22} />
    </AbsoluteFill>
  )
}

// ─── 3. Niches: one AI, a ring of businesses ─────────────

const NichesScene: React.FC = () => {
  const { f, U, ui, market, m, W, H, V, fps } = useS()
  const names = DATA[market].names
  const cw = (V ? 760 : 580) * m, ch = (V ? 820 : 640) * m, R = (V ? 860 : 680) * m
  const c = { x: W / 2, y: H * (V ? 0.44 : 0.45) }
  let rot = clamp(f, 0, U[1].s + 6, -270, 0)
  for (let k = 1; k <= 3; k++) rot += 90 * sp(f, fps, U[k + 1].s - 8, { damping: 20, stiffness: 70, mass: 1 })
  const glow = clamp(f, U[5].s - 4, U[5].s + 20)
  const intro = clamp(f, 0, 18)
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 48%, rgba(16,185,129,${0.1 + 0.2 * glow}), transparent 60%)` }} />
      <div style={{ position: "absolute", left: c.x, top: c.y, width: 0, height: 0, perspective: 2300 * m, opacity: intro }}>
        <div style={{ position: "absolute", left: 0, top: 0, transformStyle: "preserve-3d", transform: `translateZ(${-R}px) rotateY(${-rot}deg) scale(${0.85 + 0.15 * intro})` }}>
          {ui.niches.map((n, i) => {
            const booked = f > U[i + 1].s + 46 || f > U[5].s
            const col = NICHE_COLORS[i]
            return (
              <div key={i} style={{ position: "absolute", left: -cw / 2, top: -ch / 2, width: cw, height: ch, backfaceVisibility: "hidden", transform: `rotateY(${i * 90}deg) translateZ(${R}px)` }}>
                <div style={{ ...card(m, { width: "100%", height: "100%", overflow: "hidden", borderRadius: 36 * m, display: "flex", flexDirection: "column" }) }}>
                  <div style={{ height: "44%", background: `linear-gradient(135deg, ${col}, ${col}CC)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Glyph kind={GLYPHS[market][i]} size={ch * 0.24} />
                  </div>
                  <div style={{ flex: 1, padding: `${24 * m}px ${32 * m}px`, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <p style={{ fontSize: 52 * m, fontWeight: 700, letterSpacing: "-0.04em", color: T.ink, lineHeight: 1.1 }}>{n}</p>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 * m }}>
                      <div>
                        <p style={{ fontSize: 28 * m, fontWeight: 650, color: T.ink }}>{names[i]}</p>
                        <p style={{ fontSize: 22 * m, color: T.muted, marginTop: 2 * m }}>{DATA[market].missed[i % 3].slot}</p>
                      </div>
                      {booked
                        ? <Pill m={m} size={24}><Check size={24 * m} color={T.greenText} />{ui.booked}</Pill>
                        : <Pill m={m} size={24}><span style={{ width: 11 * m, height: 11 * m, borderRadius: 99, background: T.green, opacity: 0.5 + 0.5 * Math.sin(f * 0.3 + i) }} />{ui.live}</Pill>}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: c.y + ch / 2 + 36 * m, display: "flex", justifyContent: "center", gap: 14 * m }}>
        {ui.niches.map((n, i) => {
          const p = sp(f, fps, U[6].s + i * 7, { damping: 12, stiffness: 120 })
          return (
            <span key={i} style={{ opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 30 * m}px)`, display: "inline-flex", alignItems: "center", gap: 10 * m, padding: `${9 * m}px ${20 * m}px`, borderRadius: 999, background: T.card, border: `${Math.max(1, m)}px solid ${T.line}`, boxShadow: shadow(m, 0.3), fontSize: 24 * m, fontWeight: 650, color: T.ink, whiteSpace: "nowrap" }}>
              <span style={{ width: 34 * m, height: 34 * m, borderRadius: 11 * m, background: NICHE_COLORS[i], display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Glyph kind={GLYPHS[market][i]} size={20 * m} /></span>{n}
            </span>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

// ─── 4. Flow: from the call to the calendar ──────────────

const FlowScene: React.FC = () => {
  const { f, U, ui, lang, market, m, W, H, V, fps } = useS()
  const fl = FLOWS[lang]
  const names = DATA[market].names
  const pw = V ? 900 * m : 520 * m, ph = V ? 408 * m : 560 * m, g = V ? 40 * m : 74 * m
  const x0 = V ? (W - pw) / 2 : (W - (3 * pw + 2 * g)) / 2
  const y0 = V ? H * 0.145 : (H - ph) / 2 - 10 * m
  const pos = (i: number) => V ? { x: x0, y: y0 + i * (ph + g) } : { x: x0 + i * (pw + g), y: y0 }
  const inP = (i: number, at: number) => sp(f, fps, at, { damping: 14, stiffness: 100 })
  const dash = clamp(f, U[6].s - 4, U[6].s + 16)
  const dim = dash
  const panel = (i: number, at: number, title: string, body: React.ReactNode, ax: number) => {
    const p = inP(i, at)
    const { x, y } = pos(i)
    return (
      <div key={i} style={{ position: "absolute", left: x, top: y, width: pw, height: ph, perspective: 1500 * m, opacity: Math.min(1, p * 1.5) * (1 - 0.72 * dim), transform: `scale(${1 - 0.06 * dim})` }}>
        <div style={{ ...card(m, { width: "100%", height: "100%", padding: `${26 * m}px ${30 * m}px`, overflow: "hidden", transform: `translate${V ? "X" : "Y"}(${(1 - p) * (V ? -ax : ax) * m}px) rotate${V ? "Y" : "X"}(${(1 - p) * (V ? 40 : -35)}deg)` }) }}>
          <p style={{ fontSize: 22 * m, fontWeight: 650, color: T.muted, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 14 * m }}>{title}</p>
          {body}
        </div>
      </div>
    )
  }
  // A: the caller
  const live = f >= U[1].s
  const A = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 20 * m }}>
        <span style={{ position: "relative", width: 76 * m, height: 76 * m }}>
          {!live && [0, 1].map(r => { const t = ((f + r * 20) % 40) / 40; return <span key={r} style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `${3 * m}px solid ${T.green}`, opacity: (1 - t) * 0.6, transform: `scale(${1 + t * 0.7})` }} /> })}
          <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: T.wash, color: T.greenText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 * m, fontWeight: 700 }}>{names[0][0]}</span>
        </span>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 34 * m, fontWeight: 650, letterSpacing: "-0.03em", color: T.ink }}>{names[0]}</p>
          <p style={{ fontSize: 22 * m, color: T.muted, marginTop: 3 * m }}>{fl.service}</p>
        </div>
        <Pill m={m} bg={live ? T.wash : T.chip} color={live ? T.greenText : T.muted}>{live ? ui.live : "···"}</Pill>
      </div>
      <div style={{ marginTop: 18 * m }}><Bars n={30} w={6} h={40} on={f >= U[1].s && f < U[4].e} color={T.green} /></div>
      <div style={{ marginTop: 14 * m, padding: `${14 * m}px ${20 * m}px`, borderRadius: 22 * m, borderBottomLeftRadius: 6 * m, background: T.chip, fontSize: 25 * m, lineHeight: 1.3, color: T.ink, opacity: f >= U[2].s - 8 ? 1 : 0, minHeight: 20 * m }}>{typed(fl.caller, f, U[2].s - 8, 1.1)}</div>
      <div style={{ marginTop: 12 * m, marginLeft: "auto", maxWidth: "88%", padding: `${14 * m}px ${20 * m}px`, borderRadius: 22 * m, borderBottomRightRadius: 6 * m, background: T.ink, color: "#fff", fontSize: 25 * m, lineHeight: 1.3, opacity: f >= U[4].s - 20 ? 1 : 0 }}>{typed(fl.agent, f, U[4].s - 20, 1.1)}</div>
    </>
  )
  // B: Orvia
  const chips = [names[0], fl.service, `${ui.tomorrow} ${fl.time}`]
  const B = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 * m }}>
      <div style={{ position: "relative", width: (V ? 110 : 150) * m, height: (V ? 110 : 150) * m, filter: `drop-shadow(0 ${14 * m}px ${34 * m}px rgba(16,185,129,${0.2 + 0.3 * (live ? 1 : 0)}))` }}>
        {live && [0, 1].map(r => { const t = ((f + r * 22) % 44) / 44; return <span key={r} style={{ position: "absolute", inset: 0, borderRadius: 34 * m, border: `${3 * m}px solid ${T.green}`, opacity: (1 - t) * 0.5, transform: `scale(${1 + t * 0.5})` }} /> })}
        <Logo size={(V ? 110 : 150) * m} dark />
      </div>
      <Pill m={m}>{live ? ui.talk : ui.aiTag}</Pill>
      <div style={{ display: "flex", flexDirection: V ? "row" : "column", flexWrap: "wrap", justifyContent: "center", gap: 12 * m, alignItems: "center", marginTop: 6 * m }}>
        {chips.map((c, i) => {
          const p = sp(f, fps, U[2].s + 14 + i * 14, { damping: 12, stiffness: 120 })
          return <span key={i} style={{ opacity: Math.min(1, p * 1.6), transform: `translateX(${(1 - p) * -50 * m}px)`, padding: `${8 * m}px ${20 * m}px`, borderRadius: 14 * m, background: T.chip, fontSize: 24 * m, fontWeight: 600, color: T.ink, whiteSpace: "nowrap" }}>{c}</span>
        })}
      </div>
    </div>
  )
  // C: the calendar and the summary
  const cols = 5, rws = 4
  const scan = lin(f, U[3].s, U[3].e + 6, 0, cols * rws)
  const bookP = sp(f, fps, U[4].s, { damping: 10, stiffness: 140 })
  const sum = clamp(f, U[5].s, U[5].s + 30)
  const C = (
    <>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 * m, position: "relative" }}>
        {Array.from({ length: cols * rws }, (_, k) => {
          const hit = k === 7
          const lit = scan > k && scan < k + 4 && f < U[4].s
          return (
            <div key={k} style={{ height: (V ? 52 : 56) * m, borderRadius: 12 * m, background: hit && f >= U[4].s ? T.green : lit ? T.wash : T.chip, border: `${Math.max(1, m)}px solid ${lit ? "rgba(16,185,129,0.4)" : "transparent"}`, display: "flex", alignItems: "center", justifyContent: "center", transform: hit && f >= U[4].s ? `scale(${0.85 + 0.15 * bookP})` : undefined }}>
              {hit && f >= U[4].s && <Check size={26 * m} color="#fff" />}
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 22 * m, padding: `${18 * m}px ${22 * m}px`, borderRadius: 20 * m, background: T.chip, opacity: sum, transform: `translateY(${(1 - sum) * 24 * m}px)` }}>
        <p style={{ fontSize: 21 * m, fontWeight: 650, color: T.greenText, marginBottom: 12 * m, letterSpacing: "0.04em", textTransform: "uppercase" }}>{ui.summary}</p>
        {[0.92, 0.7, 0.82].map((w, i) => <div key={i} style={{ height: 12 * m, borderRadius: 6 * m, background: "rgba(10,10,11,0.16)", width: `${w * 100 * clamp(f, U[5].s + 8 + i * 8, U[5].s + 26 + i * 8)}%`, marginTop: i ? 10 * m : 0 }} />)}
      </div>
    </>
  )
  // connectors
  const line = (i: number, at: number) => {
    const a = pos(i), b = pos(i + 1)
    const p = clamp(f, at, at + 16)
    const x1 = V ? a.x + pw / 2 : a.x + pw, y1 = V ? a.y + ph : a.y + ph / 2
    const x2 = V ? b.x + pw / 2 : b.x, y2 = V ? b.y : b.y + ph / 2
    return <div key={i} style={{ position: "absolute", left: Math.min(x1, x2), top: Math.min(y1, y2), width: V ? 6 * m : Math.abs(x2 - x1), height: V ? Math.abs(y2 - y1) : 6 * m, marginLeft: V ? -3 * m : 0, marginTop: V ? 0 : -3 * m, borderRadius: 3 * m, background: `linear-gradient(${V ? "180deg" : "90deg"}, ${T.green} ${p * 100}%, transparent ${p * 100}%)`, opacity: 1 - 0.8 * dim }} />
  }
  const dp = sp(f, fps, U[6].s, { damping: 12, stiffness: 90 })
  return (
    <AbsoluteFill>
      {line(0, U[1].s)}
      {line(1, U[3].s - 6)}
      {panel(0, 0, ui.calls, A, 90)}
      {panel(1, U[1].s - 6, "Orvia", B, 90)}
      {panel(2, U[3].s - 6, ui.calendar, C, 90)}
      <div style={{ position: "absolute", left: W / 2 - (V ? 420 : 400) * m, top: H * (V ? 0.38 : 0.36), width: (V ? 840 : 800) * m, perspective: 1600 * m, opacity: Math.min(1, dp * 1.5) }}>
        <div style={{ ...card(m, { padding: `${26 * m}px ${32 * m}px`, borderRadius: 32 * m, transform: `translateY(${(1 - dp) * 160 * m}px) rotateX(${(1 - dp) * -55}deg)`, boxShadow: `${shadow(m)}, 0 0 0 ${2 * m}px rgba(16,185,129,0.3)` }) }}>
          <p style={{ fontSize: 24 * m, fontWeight: 650, color: T.muted, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 18 * m }}>{ui.dashboard}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 22 * m }}>
            <span style={{ width: 68 * m, height: 68 * m, borderRadius: "50%", background: T.wash, color: T.greenText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 * m, fontWeight: 700 }}>{names[0][0]}</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 34 * m, fontWeight: 650, letterSpacing: "-0.03em", color: T.ink }}>{names[0]}</p>
              <p style={{ fontSize: 23 * m, color: T.muted, marginTop: 3 * m }}>{fl.service} · {ui.tomorrow} {fl.time}</p>
            </div>
            <Pill m={m} size={26}><Check size={26 * m} color={T.greenText} />{ui.booked}</Pill>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}

// ─── 5. Dash: the dashboard itself ───────────────────────

const DashScene: React.FC = () => {
  const { f, U, ui, market, m, W, H, V, fps } = useS()
  const names = DATA[market].names
  const intro = sp(f, fps, 2, { damping: 15, stiffness: 80 })
  const dev = sp(f, fps, U[6].s - 2, { damping: 14, stiffness: 80 })
  const ww = (V ? 960 : 1420) * m, wh = (V ? 1150 : 740) * m
  const sx = 1 - 0.14 * dev, shiftX = V ? 0 : -230 * m * dev, shiftY = V ? -90 * m * dev : 0
  const wx = W / 2 - ww / 2 + shiftX, wy = H * (V ? 0.46 : 0.49) - wh / 2 + shiftY
  const tilt = (1 - intro) * 26 + 3
  const side = V ? 0 : 190 * m
  const pad = 36 * m
  const innerW = ww - side - 2 * pad
  const kpis = [
    { l: ui.calls, v: 128, at: U[0].s, hi: 0 },
    { l: ui.bookings, v: 74, at: U[1].s, hi: clamp(f, U[3].s - 4, U[3].s + 10) * (1 - clamp(f, U[4].s - 2, U[4].s + 8)) },
    { l: ui.leads, v: 36, at: U[1].s + 10, hi: clamp(f, U[4].s - 4, U[4].s + 10) * (1 - clamp(f, U[5].s - 2, U[5].s + 8)) },
  ]
  const gk = 18 * m, kw = (innerW - 2 * gk) / 3
  const pts = [18, 30, 24, 46, 38, 62, 56, 80, 72, 96]
  const cwid = V ? innerW : innerW * 0.58, chh = (V ? 250 : 250) * m
  const path = pts.map((v, i) => [(i / (pts.length - 1)) * cwid, chh - (v / 110) * chh] as const)
  const dstr = path.reduce((acc, p, i, a) => {
    if (i === 0) return `M${p[0]},${p[1]}`
    const q = a[i - 1], cx = (q[0] + p[0]) / 2
    return `${acc} C${cx},${q[1]} ${cx},${p[1]} ${p[0]},${p[1]}`
  }, "")
  const draw = clamp(f, U[1].s, U[1].e + 20)
  const rowsOn = clamp(f, U[2].s, U[2].e)
  const open = clamp(f, U[5].s, U[5].s + 18)
  const phone = V ? { w: 290 * m, h: 540 * m } : { w: 330 * m, h: 640 * m }
  const phoneX = V ? W * 0.62 : W * 0.5 + ww * 0.5 - 270 * m, phoneY = V ? H * 0.55 : H * 0.49 - phone.h / 2
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: wx, top: wy, width: ww, height: wh, perspective: 2400 * m, opacity: Math.min(1, intro * 1.5), transform: `scale(${sx})` }}>
        <div style={{ ...card(m, { position: "absolute", inset: 0, overflow: "hidden", borderRadius: 34 * m, display: "flex", transform: `translateY(${(1 - intro) * 140 * m}px) rotateX(${tilt}deg) rotateY(${Math.sin(f * 0.02) * 2 + (V ? 0 : -3 * (1 - dev))}deg)` }) }}>
          {!V && (
            <div style={{ width: side, background: T.bg, borderRight: `${Math.max(1, m)}px solid ${T.line}`, padding: `${28 * m}px ${22 * m}px` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 * m, marginBottom: 34 * m }}><Logo size={38 * m} dark /><span style={{ fontSize: 28 * m, fontWeight: 700, letterSpacing: "-0.04em", color: T.ink }}>Orvia</span></div>
              {[ui.dashboard, ui.calls, ui.calendar, ui.leads].map((n, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 * m, padding: `${12 * m}px ${14 * m}px`, borderRadius: 14 * m, background: i === 0 ? T.card : "transparent", boxShadow: i === 0 ? shadow(m, 0.25) : undefined, fontSize: 22 * m, fontWeight: i === 0 ? 650 : 500, color: i === 0 ? T.ink : T.muted, marginBottom: 6 * m, whiteSpace: "nowrap" }}>
                  <span style={{ width: 14 * m, height: 14 * m, borderRadius: 5 * m, background: i === 0 ? T.green : T.line }} />{n}
                </div>
              ))}
            </div>
          )}
          <div style={{ flex: 1, padding: pad, position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 * m }}>
              <p style={{ fontSize: 40 * m, fontWeight: 700, letterSpacing: "-0.04em", color: T.ink }}>{ui.dashboard}</p>
              <Pill m={m} bg={T.chip} color={T.muted} size={20}>{ui.live}</Pill>
            </div>
            <div style={{ display: "flex", gap: gk }}>
              {kpis.map((k, i) => {
                const p = sp(f, fps, k.at + 2, { damping: 13, stiffness: 110 })
                const v = Math.round(clamp(f, k.at + 4, k.at + 50, 0, k.v))
                return (
                  <div key={i} style={{ width: kw, ...card(m, { padding: `${18 * m}px ${22 * m}px`, boxShadow: k.hi > 0 ? `${shadow(m, 0.5)}, 0 0 0 ${3 * m}px rgba(16,185,129,${0.7 * k.hi}), 0 0 ${40 * m * k.hi}px rgba(16,185,129,0.35)` : shadow(m, 0.35), opacity: Math.min(1, p * 1.6), transform: `translateY(${(1 - p) * 40 * m}px) scale(${1 + 0.03 * k.hi})` }) }}>
                    <p style={{ fontSize: 21 * m, color: T.muted, whiteSpace: "nowrap" }}>{k.l}</p>
                    <p style={{ fontFamily: MONO, fontSize: (V ? 64 : 62) * m, fontWeight: 600, letterSpacing: "-0.05em", color: T.ink, lineHeight: 1.15 }}>{v}</p>
                  </div>
                )
              })}
            </div>
            <div style={{ display: "flex", flexDirection: V ? "column" : "row", gap: gk, marginTop: gk }}>
              <div style={{ ...card(m, { width: V ? "100%" : cwid + 2 * 24 * m, padding: `${22 * m}px ${24 * m}px`, boxShadow: shadow(m, 0.35) }) }}>
                <svg width={cwid} height={chh} style={{ display: "block", overflow: "visible" }}>
                  <defs>
                    <linearGradient id="ovF" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.green} stopOpacity="0.28" /><stop offset="100%" stopColor={T.green} stopOpacity="0" /></linearGradient>
                  </defs>
                  <path d={`${dstr} L${cwid},${chh} L0,${chh} Z`} fill="url(#ovF)" opacity={draw} />
                  <path d={dstr} fill="none" stroke={T.green} strokeWidth={5 * m} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
                  {draw > 0.95 && <circle cx={path[7][0]} cy={path[7][1]} r={9 * m} fill="#fff" stroke={T.green} strokeWidth={4 * m} />}
                </svg>
              </div>
              <div style={{ flex: 1, ...card(m, { padding: `${14 * m}px ${20 * m}px`, boxShadow: shadow(m, 0.35), minWidth: 0 }) }}>
                {names.map((n, i) => {
                  const p = clamp(f, U[2].s + i * 9, U[2].s + i * 9 + 16)
                  const first = i === 0
                  return (
                    <div key={i} style={{ padding: `${12 * m}px 0`, borderBottom: i < 3 ? `${Math.max(1, m)}px solid ${T.line}` : undefined, opacity: p, transform: `translateX(${(1 - p) * 60 * m}px)` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 * m }}>
                        <span style={{ width: 42 * m, height: 42 * m, borderRadius: "50%", background: T.wash, color: T.greenText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 * m, fontWeight: 700, flexShrink: 0 }}>{n[0]}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 22 * m, fontWeight: 650, color: T.ink, whiteSpace: "nowrap" }}>{n}</p>
                          <p style={{ fontSize: 17 * m, color: T.muted, whiteSpace: "nowrap" }}>{ui.niches[i]}</p>
                        </div>
                        <Pill m={m} size={17}>{ui.booked}</Pill>
                      </div>
                      {first && (
                        <div style={{ overflow: "hidden", height: open * 62 * m, opacity: open }}>
                          <div style={{ marginTop: 10 * m, padding: `${10 * m}px ${14 * m}px`, borderRadius: 12 * m, background: T.chip }}>
                            <p style={{ fontSize: 15 * m, fontWeight: 650, color: T.greenText, marginBottom: 6 * m, textTransform: "uppercase", letterSpacing: "0.04em" }}>{ui.summary}</p>
                            {[0.9, 0.62].map((w, j) => <div key={j} style={{ height: 8 * m, borderRadius: 4 * m, background: "rgba(10,10,11,0.16)", width: `${w * 100}%`, marginTop: j ? 7 * m : 0 }} />)}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* the same dashboard on a phone */}
      <div style={{ position: "absolute", left: phoneX, top: phoneY, width: phone.w, height: phone.h, opacity: Math.min(1, dev * 1.5), transform: `translateX(${(1 - dev) * 300 * m}px) rotate(${(1 - dev) * 8 + 2}deg)`, borderRadius: 52 * m, background: T.ink, padding: 12 * m, boxShadow: shadow(m, 1.2) }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 42 * m, background: T.bg, padding: `${44 * m}px ${20 * m}px ${20 * m}px`, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 * m, marginBottom: 22 * m }}><Logo size={34 * m} dark /><span style={{ fontSize: 26 * m, fontWeight: 700, letterSpacing: "-0.04em", color: T.ink }}>Orvia</span></div>
          {kpis.map((k, i) => (
            <div key={i} style={{ ...card(m, { padding: `${14 * m}px ${18 * m}px`, marginBottom: 12 * m, borderRadius: 22 * m, boxShadow: shadow(m, 0.2) }) }}>
              <p style={{ fontSize: 17 * m, color: T.muted, whiteSpace: "nowrap" }}>{k.l}</p>
              <p style={{ fontFamily: MONO, fontSize: 44 * m, fontWeight: 600, letterSpacing: "-0.05em", color: T.ink, lineHeight: 1.15 }}>{k.v}</p>
            </div>
          ))}
          <div style={{ ...card(m, { padding: `${12 * m}px ${14 * m}px`, borderRadius: 22 * m, boxShadow: shadow(m, 0.2) }) }}>
            <svg width="100%" viewBox={`0 0 ${cwid} ${chh}`} style={{ display: "block" }}><path d={dstr} fill="none" stroke={T.green} strokeWidth={8} strokeLinecap="round" /></svg>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}

const SCENES: Record<Concept, React.FC> = { missed: MissedScene, ten: TenScene, niches: NichesScene, flow: FlowScene, dash: DashScene }

export const SeriesVideo: React.FC<{ concept: Concept; lang: Lang }> = ({ concept, lang }) => {
  const Scene = SCENES[concept]
  return <Shell concept={concept} lang={lang}><Scene /></Shell>
}
