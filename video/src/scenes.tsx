import React from "react"
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion"
import { C, CTA_URL, Card, Check, FONT, Logo, MONO, Pill, PhoneIcon, clamp, ease, sp, typed, useLayout } from "./theme"

// Wraps a scene: opaque background plus a short fade/rise on entry.
const Shell: React.FC<{ bg: string; children: React.ReactNode; fade?: boolean }> = ({ bg, children, fade = true }) => {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill style={{ background: bg, fontFamily: FONT, opacity: fade ? clamp(frame, 0, 10) : 1, overflow: "hidden" }}>
      <style>{"p,h1,h2,h3{margin:0}"}</style>
      {children}
    </AbsoluteFill>
  )
}

// ─── 1. Hook ─────────────────────────────────────────────

export const Hook: React.FC = () => {
  const frame = useCurrentFrame()
  const { V, u, fps } = useLayout()
  const words = ["Every", "missed", "call", "is", "a", "missed", "job."]
  const calls = [
    { n: "Mike R.", t: "7:42 AM", d: "Burst pipe" },
    { n: "Dana L.", t: "12:15 PM", d: "AC not cooling" },
    { n: "Chris P.", t: "6:03 PM", d: "Tooth pain" },
  ]
  const lost = Math.round(clamp(frame, 46, 120, 0, 1350))

  return (
    <Shell bg={C.ink} fade={false}>
      <div style={{ position: "absolute", inset: 0, padding: (V ? 90 : 130) * u, display: "flex", flexDirection: V ? "column" : "row", gap: (V ? 70 : 110) * u, alignItems: V ? "stretch" : "center" }}>
        <div style={{ flex: V ? "none" : 1.15, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", flexWrap: "wrap", columnGap: (V ? 26 : 30) * u, rowGap: 6 * u }}>
            {words.map((w, i) => {
              const p = clamp(frame, 6 + i * 5, 24 + i * 5)
              const bad = w === "missed"
              return (
                <span key={i} style={{
                  fontSize: (V ? 132 : 112) * u, fontWeight: 650, letterSpacing: "-0.045em", lineHeight: 1.02,
                  color: bad ? C.red : "#fff", opacity: p, transform: `translateY(${(1 - p) * 40 * u}px)`, filter: `blur(${(1 - p) * 12}px)`,
                }}>{w}</span>
              )
            })}
          </div>
          <div style={{ marginTop: 56 * u, opacity: clamp(frame, 40, 56), transform: `translateY(${(1 - clamp(frame, 40, 56)) * 16 * u}px)` }}>
            <p style={{ fontSize: 26 * u, color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>Lost this week</p>
            <p style={{ fontSize: 104 * u, fontWeight: 650, color: C.red, letterSpacing: "-0.04em", marginTop: 6 * u, fontVariantNumeric: "tabular-nums" }}>
              −${lost.toLocaleString()}
            </p>
          </div>
        </div>

        <div style={{ flex: V ? "none" : 0.85, display: "flex", flexDirection: "column", gap: 26 * u }}>
          {calls.map((c, i) => {
            const delay = 34 + i * 20
            const p = sp(frame, fps, delay, { damping: 13, stiffness: 140 })
            const shake = Math.sin((frame - delay) * 1.4) * Math.max(0, 1 - (frame - delay) / 14) * 3
            return (
              <Card u={u} dark key={i} style={{
                display: "flex", alignItems: "center", gap: 26 * u, padding: `${28 * u}px ${32 * u}px`,
                opacity: Math.min(1, p * 1.4), transform: `translateX(${(1 - p) * (V ? 0 : 160) * u}px) translateY(${(1 - p) * (V ? 120 : 0) * u}px) rotate(${shake}deg)`,
              }}>
                <div style={{ width: 76 * u, height: 76 * u, borderRadius: 999, background: "rgba(248,113,113,0.16)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <PhoneIcon size={34 * u} color={C.red} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 32 * u, fontWeight: 600, color: "#fff", letterSpacing: "-0.02em" }}>Missed call · {c.n}</p>
                  <p style={{ fontSize: 24 * u, color: "rgba(255,255,255,0.5)", marginTop: 4 * u }}>{c.t} · {c.d}</p>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 30 * u, fontWeight: 600, color: C.red }}>−$450</span>
              </Card>
            )
          })}
        </div>
      </div>
    </Shell>
  )
}

// ─── 2. Reveal ───────────────────────────────────────────

export const Reveal: React.FC = () => {
  const frame = useCurrentFrame()
  const { V, u, fps } = useLayout()
  const r = clamp(frame, 0, 26, 0, 150)
  const logo = sp(frame, fps, 14, { damping: 12, stiffness: 120 })
  const pulse = (frame % 40) / 40

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT, clipPath: `circle(${r}% at 50% 50%)`, alignItems: "center", justifyContent: "center" }}>
      <style>{"p,h1,h2,h3{margin:0}"}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: 80 * u }}>
        <div style={{ transform: `scale(${0.4 + logo * 0.6}) rotate(${(1 - logo) * -18}deg)`, opacity: logo, filter: `drop-shadow(0 ${24 * u}px ${40 * u}px rgba(10,10,11,0.18))` }}>
          <Logo size={(V ? 190 : 170) * u} dark />
        </div>
        <h1 style={{ fontSize: (V ? 170 : 150) * u, fontWeight: 650, letterSpacing: "-0.05em", color: C.ink, marginTop: 50 * u, lineHeight: 1,
          opacity: clamp(frame, 26, 44), transform: `translateY(${(1 - clamp(frame, 26, 44)) * 40 * u}px)` }}>
          Meet Orvia.
        </h1>
        <p style={{ fontSize: (V ? 48 : 44) * u, color: C.muted, marginTop: 30 * u, letterSpacing: "-0.02em", maxWidth: 1100 * u, lineHeight: 1.25,
          opacity: clamp(frame, 40, 58), transform: `translateY(${(1 - clamp(frame, 40, 58)) * 24 * u}px)` }}>
          The AI front desk that answers every call.
        </p>
        <div style={{ marginTop: 44 * u, opacity: clamp(frame, 56, 72) }}>
          <Pill u={u} pulse={pulse}>Answering calls · 24/7</Pill>
        </div>
      </div>
    </AbsoluteFill>
  )
}

// ─── 3. The call ─────────────────────────────────────────

const LINES = [
  { who: "caller", text: "Hi, my kitchen sink is leaking. Can someone come tomorrow?", start: 12 },
  { who: "agent", text: "Of course! I have 10:15 AM tomorrow. Shall I book it?", start: 62 },
  { who: "caller", text: "Yes please, it's Sarah.", start: 112 },
  { who: "agent", text: "Done. You're all set for 10:15 AM tomorrow.", start: 134 },
] as const

const Waveform: React.FC<{ frame: number; level: number; u: number; color: string }> = ({ frame, level, u, color }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6 * u, height: 90 * u }}>
    {Array.from({ length: 34 }, (_, i) => {
      const a = Math.abs(Math.sin(frame * 0.32 + i * 0.7)) * Math.abs(Math.sin(i * 0.45 + frame * 0.1))
      const h = (0.08 + a * level * 0.92) * 90 * u
      return <span key={i} style={{ width: 7 * u, height: h, borderRadius: 99, background: color, opacity: 0.35 + 0.65 * a }} />
    })}
  </div>
)

export const CallScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { V, u, fps } = useLayout()
  const speaking = LINES.find((l, i) => frame >= l.start && frame < (LINES[i + 1]?.start ?? 999) - 8)
  const level = speaking ? 1 : 0.12
  const callIn = sp(frame, fps, 0, { damping: 20 })
  const calIn = sp(frame, fps, 70)
  const slot = sp(frame, fps, 142, { damping: 11, stiffness: 150 })
  const toast = sp(frame, fps, 152, { damping: 14 })
  const pulse = (frame % 40) / 40
  const secs = 3 + Math.floor(frame / fps)
  const bookingActive = frame >= 104
  const bookingDone = frame >= 140

  const hours = ["9 AM", "10 AM", "11 AM", "12 PM", "1 PM"]

  return (
    <Shell bg={C.bg}>
      <div style={{ position: "absolute", inset: 0, padding: (V ? 70 : 110) * u, display: "flex", flexDirection: V ? "column" : "row", gap: (V ? 44 : 60) * u, alignItems: "stretch" }}>
        {/* call card */}
        <Card u={u} style={{ flex: V ? "none" : 1.25, height: V ? 1000 * u : "auto", padding: 44 * u, display: "flex", flexDirection: "column", opacity: callIn, transform: `translateY(${(1 - callIn) * 60 * u}px)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 * u }}>
            <div style={{ width: 84 * u, height: 84 * u, borderRadius: 999, background: C.ink, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38 * u, fontWeight: 600 }}>P</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 36 * u, fontWeight: 650, letterSpacing: "-0.02em", color: C.ink }}>Priya</p>
              <p style={{ fontSize: 24 * u, color: C.muted, marginTop: 2 * u }}>AI receptionist</p>
            </div>
            <Pill u={u} pulse={pulse}>Live · 0:{String(secs).padStart(2, "0")}</Pill>
          </div>

          <div style={{ marginTop: 34 * u }}>
            <Waveform frame={frame} level={level} u={u} color={speaking?.who === "agent" ? C.green : C.ink} />
          </div>

          <div style={{ marginTop: 30 * u, display: "flex", flexDirection: "column", gap: 20 * u, flex: 1 }}>
            {LINES.map((l, i) => {
              if (frame < l.start) return null
              const agent = l.who === "agent"
              const p = clamp(frame, l.start, l.start + 8)
              return (
                <div key={i} style={{ alignSelf: agent ? "flex-end" : "flex-start", maxWidth: "82%", opacity: p, transform: `translateY(${(1 - p) * 18 * u}px)` }}>
                  <div style={{
                    padding: `${20 * u}px ${28 * u}px`, borderRadius: 28 * u, fontSize: 31 * u, lineHeight: 1.3, letterSpacing: "-0.015em", fontWeight: 500,
                    background: agent ? C.ink : "#F0F0F3", color: agent ? "#fff" : C.ink,
                    borderBottomRightRadius: agent ? 8 * u : 28 * u, borderBottomLeftRadius: agent ? 28 * u : 8 * u,
                  }}>
                    {typed(l.text, frame, l.start, 1.9)}
                  </div>
                </div>
              )
            })}
          </div>

          {bookingActive && (
            <div style={{
              marginTop: 22 * u, alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 14 * u,
              padding: `${12 * u}px ${22 * u}px`, borderRadius: 999, fontFamily: MONO, fontSize: 24 * u, fontWeight: 600,
              background: bookingDone ? C.greenWash : "#F0F0F3", color: bookingDone ? C.greenDark : C.muted,
              opacity: clamp(frame, 104, 112),
            }}>
              {bookingDone ? <Check size={24 * u} color={C.greenDark} /> : <span style={{ width: 14 * u, height: 14 * u, borderRadius: 99, border: `${3 * u}px solid ${C.muted}`, borderTopColor: "transparent", transform: `rotate(${frame * 18}deg)` }} />}
              book_appointment
            </div>
          )}
        </Card>

        {/* calendar */}
        <Card u={u} style={{ flex: V ? "none" : 1, padding: 44 * u, position: "relative", opacity: calIn, transform: `translateY(${(1 - calIn) * 60 * u}px)`, height: V ? 640 * u : "auto" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <p style={{ fontSize: 36 * u, fontWeight: 650, letterSpacing: "-0.02em", color: C.ink }}>Tomorrow</p>
            <p style={{ fontSize: 24 * u, color: C.muted }}>Calendar</p>
          </div>
          <div style={{ marginTop: 28 * u, display: "flex", flexDirection: "column" }}>
            {hours.map((h, i) => (
              <div key={h} style={{ display: "flex", alignItems: "stretch", gap: 24 * u, height: (V ? 78 : 96) * u, borderTop: `${Math.max(1, u)}px solid ${C.border}`, position: "relative" }}>
                <span style={{ width: 100 * u, paddingTop: 12 * u, fontSize: 24 * u, color: C.muted, fontFamily: MONO, fontWeight: 500 }}>{h}</span>
                {i === 1 && (
                  <div style={{
                    position: "absolute", left: 124 * u, right: 0, top: 8 * u, bottom: 8 * u, borderRadius: 20 * u,
                    background: `linear-gradient(135deg, ${C.greenLight}, ${C.green})`, color: "#fff",
                    display: "flex", flexDirection: "column", justifyContent: "center", padding: `0 ${26 * u}px`,
                    opacity: Math.min(1, slot * 1.5), transform: `scale(${0.7 + slot * 0.3})`, transformOrigin: "left center",
                    boxShadow: `0 ${14 * u}px ${34 * u}px rgba(16,185,129,${0.35 * slot})`,
                  }}>
                    <p style={{ fontSize: 28 * u, fontWeight: 650, letterSpacing: "-0.02em" }}>10:15 · Sarah K.</p>
                    <p style={{ fontSize: 22 * u, opacity: 0.9, marginTop: 2 * u }}>Leak repair</p>
                  </div>
                )}
                {i === 1 && frame >= 142 && (
                  <span style={{ position: "absolute", left: 124 * u, top: 8 * u, bottom: 8 * u, right: 0, borderRadius: 20 * u, border: `${4 * u}px solid ${C.green}`,
                    opacity: Math.max(0, 1 - (frame - 142) / 22), transform: `scale(${1 + (frame - 142) * 0.012})` }} />
                )}
              </div>
            ))}
          </div>

          <div style={{
            position: "absolute", left: 44 * u, right: 44 * u, bottom: 40 * u, display: "flex", alignItems: "center", gap: 18 * u,
            padding: `${22 * u}px ${28 * u}px`, borderRadius: 24 * u, background: C.ink, color: "#fff",
            opacity: Math.min(1, toast * 1.5), transform: `translateY(${(1 - toast) * 50 * u}px)`,
          }}>
            <div style={{ width: 48 * u, height: 48 * u, borderRadius: 99, background: C.green, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Check size={26 * u} color="#fff" />
            </div>
            <div>
              <p style={{ fontSize: 28 * u, fontWeight: 650, letterSpacing: "-0.02em" }}>Booked by Priya</p>
              <p style={{ fontSize: 22 * u, color: "rgba(255,255,255,0.6)" }}>No one lifted a finger</p>
            </div>
          </div>
        </Card>
      </div>
    </Shell>
  )
}

// ─── 4. Dashboard ────────────────────────────────────────

const DAYS = ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"]
const SERIES = [3, 6, 4, 2, 3, 4, 7]

function curve(pts: [number, number][]): string {
  // Catmull-Rom to cubic Bezier, tension 0.5.
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`
  }
  return d
}

const Kpi: React.FC<{ label: string; value: number; suffix?: string; delta: string; delay: number; u: number }> = ({ label, value, suffix = "", delta, delay, u }) => {
  const frame = useCurrentFrame()
  const { fps } = useLayout()
  const p = sp(frame, fps, delay)
  const n = Math.round(clamp(frame, delay + 6, delay + 50, 0, value))
  return (
    <Card u={u} style={{ flex: 1, padding: `${30 * u}px ${34 * u}px`, opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 40 * u}px)` }}>
      <p style={{ fontSize: 24 * u, color: C.muted, letterSpacing: "-0.01em" }}>{label}</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16 * u, marginTop: 10 * u }}>
        <span style={{ fontFamily: MONO, fontSize: 70 * u, fontWeight: 600, letterSpacing: "-0.05em", color: C.ink }}>{n}{suffix}</span>
        <span style={{ fontSize: 24 * u, fontWeight: 600, color: C.greenDark }}>{delta}</span>
      </div>
    </Card>
  )
}

export const Dashboard: React.FC = () => {
  const frame = useCurrentFrame()
  const { V, u, fps } = useLayout()
  const cam = interpolate(frame, [0, 200], [1, 1.035])
  const chartW = (V ? 860 : 920) * u, chartH = (V ? 360 : 400) * u
  const pad = 40 * u
  const max = 8
  const pts: [number, number][] = SERIES.map((v, i) => [pad + (i * (chartW - pad * 2)) / (SERIES.length - 1), chartH - 56 * u - (v / max) * (chartH - 110 * u)])
  const d = curve(pts)
  const draw = clamp(frame, 26, 96)
  const heroIn = sp(frame, fps, 6)
  const rows = [
    { t: "9:00 AM", n: "Sarah K.", s: "Leak repair", tag: "Today", g: true },
    { t: "11:30 AM", n: "Marcus T.", s: "Water heater", tag: "Today", g: true },
    { t: "2:15 PM", n: "Elena V.", s: "Drain cleaning", tag: "Tomorrow", g: false },
  ]
  const bookedToday = Math.round(clamp(frame, 20, 60, 0, 7))
  const hoverIdx = frame > 110 ? 6 : -1

  return (
    <Shell bg={C.bg}>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${cam})`, padding: (V ? 70 : 100) * u, display: "flex", flexDirection: "column", justifyContent: V ? "center" : "flex-start", gap: 34 * u }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", opacity: clamp(frame, 0, 14) }}>
          <div>
            <p style={{ fontSize: (V ? 64 : 58) * u, fontWeight: 650, letterSpacing: "-0.04em", color: C.ink }}>Every call, handled.</p>
            <p style={{ fontSize: 26 * u, color: C.muted, marginTop: 6 * u }}>Your dashboard, live</p>
          </div>
          <Pill u={u} pulse={(frame % 40) / 40}>Live</Pill>
        </div>

        <div style={{ display: "flex", gap: 30 * u, flexDirection: V ? "column" : "row", flex: 1, minHeight: 0 }}>
          <Card u={u} style={{ flex: V ? "none" : 1.5, padding: 40 * u, opacity: Math.min(1, heroIn * 1.5), transform: `translateY(${(1 - heroIn) * 50 * u}px)`, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 26 * u, color: C.muted }}>Appointments booked today</p>
                <p style={{ fontFamily: MONO, fontSize: 120 * u, fontWeight: 600, letterSpacing: "-0.06em", color: C.ink, lineHeight: 1.1, marginTop: 6 * u }}>{bookedToday}</p>
              </div>
              <span style={{ fontSize: 28 * u, fontWeight: 650, color: C.greenDark, opacity: clamp(frame, 60, 74) }}>↑ 3 vs yesterday</span>
            </div>
            <svg width="100%" viewBox={`0 0 ${chartW} ${chartH}`} style={{ marginTop: 10 * u, overflow: "visible" }}>
              <defs>
                <linearGradient id="st" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stopColor={C.greenLight} /><stop offset="100%" stopColor={C.greenDark} /></linearGradient>
                <linearGradient id="fl" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={C.green} stopOpacity="0.28" /><stop offset="100%" stopColor={C.green} stopOpacity="0" /></linearGradient>
                <clipPath id="reveal"><rect x="0" y="-40" width={chartW * draw} height={chartH + 80} /></clipPath>
              </defs>
              {hoverIdx >= 0 && (
                <rect x={pts[hoverIdx][0] - 34 * u} y={pts[hoverIdx][1]} width={68 * u} height={chartH - 56 * u - pts[hoverIdx][1]} rx={22 * u}
                  fill="url(#st)" opacity={0.85 * clamp(frame, 110, 124)} />
              )}
              <g clipPath="url(#reveal)">
                <path d={`${d} L ${pts[6][0]} ${chartH - 56 * u} L ${pts[0][0]} ${chartH - 56 * u} Z`} fill="url(#fl)" />
                <path d={d} fill="none" stroke="url(#st)" strokeWidth={9 * u} strokeLinecap="round" />
              </g>
              {pts.map(([x, y], i) => {
                const show = clamp(frame, 26 + (i / 6) * 70, 36 + (i / 6) * 70)
                const big = i === hoverIdx
                return <circle key={i} cx={x} cy={y} r={(big ? 15 : 11) * u * show} fill={big ? C.green : "#fff"} stroke={C.green} strokeWidth={5 * u} />
              })}
              {DAYS.map((t, i) => <text key={t} x={pts[i][0]} y={chartH - 8 * u} textAnchor="middle" fontSize={24 * u} fill={C.muted} fontFamily={FONT}>{t}</text>)}
            </svg>
          </Card>

          <div style={{ flex: V ? "none" : 1, display: "flex", flexDirection: "column", gap: 30 * u }}>
            <div style={{ display: "flex", gap: 24 * u }}>
              <Kpi u={u} label="Calls handled" value={128} delta="↑ 12%" delay={14} />
              <Kpi u={u} label="Booking rate" value={62} suffix="%" delta="↑ 8%" delay={24} />
            </div>
            <Card u={u} style={{ padding: `${30 * u}px ${34 * u}px`, flex: 1, display: "flex", flexDirection: "column", gap: 6 * u }}>
              <p style={{ fontSize: 28 * u, fontWeight: 650, letterSpacing: "-0.02em", color: C.ink, marginBottom: 8 * u }}>Coming up</p>
              {rows.map((r, i) => {
                const p = sp(frame, fps, 56 + i * 12)
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 22 * u, padding: `${16 * u}px 0`, borderTop: `${Math.max(1, u)}px solid ${C.border}`, opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * 60 * u}px)` }}>
                    <span style={{ fontFamily: MONO, fontSize: 24 * u, fontWeight: 500, color: C.ink, width: 150 * u }}>{r.t}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 28 * u, fontWeight: 600, color: C.ink, letterSpacing: "-0.015em" }}>{r.n}</p>
                      <p style={{ fontSize: 22 * u, color: C.muted }}>{r.s}</p>
                    </div>
                    <Pill u={u} color={r.g ? C.greenDark : C.muted} bg={r.g ? C.greenWash : "#F0F0F3"}>{r.tag}</Pill>
                  </div>
                )
              })}
            </Card>
          </div>
        </div>
      </div>
    </Shell>
  )
}

// ─── 5. Industries ───────────────────────────────────────

const NICHES = [
  { name: "Dental", note: "Cleaning booked · 3:30 PM", hue: "#6366F1" },
  { name: "Plumbing", note: "Leak repair · Tomorrow", hue: "#10B981" },
  { name: "HVAC", note: "AC tune-up · Fri 9:00", hue: "#0EA5E9" },
  { name: "Real estate", note: "Showing · Sat 11:00", hue: "#F59E0B" },
  { name: "Support", note: "Ticket resolved · 2 min", hue: "#EC4899" },
]

// highlights: the local frames at which the spotlight lands on each card.
export const Industries: React.FC<{ highlights?: number[] }> = ({ highlights = [44, 61, 78, 95, 112] }) => {
  const frame = useCurrentFrame()
  const { V, u, fps } = useLayout()
  const active = highlights.filter(h => frame >= h).length - 1

  return (
    <Shell bg={C.bg}>
      <div style={{ position: "absolute", inset: 0, padding: (V ? 80 : 120) * u, display: "flex", flexDirection: "column", justifyContent: "center", gap: (V ? 70 : 80) * u }}>
        <h2 style={{ fontSize: (V ? 118 : 108) * u, fontWeight: 650, letterSpacing: "-0.045em", color: C.ink, lineHeight: 1.04, maxWidth: 1500 * u,
          opacity: clamp(frame, 4, 22), transform: `translateY(${(1 - clamp(frame, 4, 22)) * 36 * u}px)` }}>
          One agent. <span style={{ color: C.muted }}>Every front desk.</span>
        </h2>
        <div style={{ display: "flex", flexDirection: V ? "column" : "row", gap: 26 * u }}>
          {NICHES.map((n, i) => {
            const p = sp(frame, fps, 20 + i * 6, { damping: 14, stiffness: 130 })
            const on = i === active
            return (
              <Card u={u} key={n.name} style={{
                flex: 1, padding: `${34 * u}px ${34 * u}px`, display: "flex", flexDirection: V ? "row" : "column", alignItems: V ? "center" : "flex-start", gap: (V ? 30 : 36) * u,
                opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 70 * u - (on ? 14 * u : 0)}px) scale(${on ? 1.04 : 1})`,
                transition: "none", border: `${on ? 3 * u : Math.max(1, u)}px solid ${on ? n.hue : C.border}`,
                boxShadow: on ? `0 ${30 * u}px ${70 * u}px ${n.hue}33` : undefined,
              }}>
                <div style={{ width: 70 * u, height: 70 * u, borderRadius: 22 * u, background: `${n.hue}1f`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ width: 26 * u, height: 26 * u, borderRadius: 99, background: n.hue }} />
                </div>
                <div>
                  <p style={{ fontSize: 40 * u, fontWeight: 650, letterSpacing: "-0.03em", color: C.ink }}>{n.name}</p>
                  <p style={{ fontSize: 24 * u, color: C.muted, marginTop: 8 * u, lineHeight: 1.3 }}>{n.note}</p>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </Shell>
  )
}

// ─── 6. Call to action ───────────────────────────────────

export const Cta: React.FC = () => {
  const frame = useCurrentFrame()
  const { V, u, fps } = useLayout()
  const btn = sp(frame, fps, 34, { damping: 14 })
  const press = frame >= 74 && frame < 84 ? 0.95 : 1
  const ripple = frame >= 78 ? (frame - 78) / 30 : 0

  return (
    <Shell bg={C.ink}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 90 * u, gap: 44 * u }}>
        <div style={{ opacity: clamp(frame, 2, 18), transform: `scale(${0.8 + clamp(frame, 2, 18) * 0.2})` }}><Logo size={110 * u} /></div>
        <h2 style={{ fontSize: (V ? 138 : 128) * u, fontWeight: 650, letterSpacing: "-0.05em", color: "#fff", lineHeight: 1.02, opacity: clamp(frame, 8, 28), transform: `translateY(${(1 - clamp(frame, 8, 28)) * 40 * u}px)` }}>
          Hear it for yourself.
        </h2>
        <p style={{ fontSize: 40 * u, color: "rgba(255,255,255,0.6)", letterSpacing: "-0.02em", opacity: clamp(frame, 20, 38), maxWidth: 1100 * u, lineHeight: 1.3 }}>
          Talk to a live agent in your browser.<br />No signup.
        </p>
        <div style={{ position: "relative", opacity: Math.min(1, btn * 1.5), transform: `translateY(${(1 - btn) * 40 * u}px) scale(${press})` }}>
          {ripple > 0 && ripple < 1 && (
            <span style={{ position: "absolute", inset: -ripple * 60 * u, borderRadius: 999, border: `${3 * u}px solid rgba(255,255,255,${0.6 * (1 - ripple)})` }} />
          )}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 20 * u, padding: `${34 * u}px ${68 * u}px`, borderRadius: 999, background: "#fff", color: C.ink, fontSize: 42 * u, fontWeight: 650, letterSpacing: "-0.02em" }}>
            Continue as guest
            <span style={{ fontSize: 44 * u, transform: `translateX(${Math.sin(frame * 0.2) * 5 * u}px)` }}>→</span>
          </div>
        </div>
        {CTA_URL && <p style={{ fontFamily: MONO, fontSize: 34 * u, color: "rgba(255,255,255,0.5)", opacity: clamp(frame, 50, 66) }}>{CTA_URL}</p>}
      </div>
    </Shell>
  )
}
