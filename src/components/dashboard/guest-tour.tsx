import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"
import { endTour, isTourDone, startTour, useTourActive } from "@/lib/guest/tour"

// First-visit walkthrough for guests. A spotlight glides between the parts of
// the Overview (and the sidebar) while a card explains each one. Steps whose
// target isn't on screen (the sidebar on a phone, say) are skipped.

interface Step {
  target: string | null // [data-tour] value, or null for a centered card
  title: string
  body: string
}

function buildSteps(agent: string): Step[] {
  return [
    { target: null, title: "Welcome to Orvia", body: "This is the dashboard your business would use. A quick tour shows what each part does." },
    { target: "agent", title: `Meet ${agent}`, body: "Your AI receptionist answers every call, day and night. This shows whether she's free or on a call." },
    { target: "needs", title: "Nothing slips through", body: "Missed calls and unfinished bookings collect here, so your team knows who to call back." },
    { target: "next", title: "What's coming up", body: "Your next appointment with a countdown. Click it to see the details." },
    { target: "hero", title: "Bookings on autopilot", body: "Appointments the AI booked today, next to how the week is going." },
    { target: "kpis", title: "The numbers that matter", body: "Calls handled, new leads and your booking rate, each with a 7 day trend. Hover a bar for the exact value." },
    { target: "schedule", title: "Your schedule", body: "Upcoming appointments and the call minutes you've used this month." },
    { target: "recent", title: "Every call, summarized", body: "Each call gets a one line summary, an outcome and a full transcript. Open the Calls page for the whole history." },
    { target: "nav-demo", title: "Talk to her yourself", body: `Open Demo to speak with ${agent} in your browser. When she books something, it lands on the calendar live.` },
    { target: "user-menu", title: "Try another business", body: "Switch between dental, plumbing, HVAC and more at any time. Each one comes with its own data and its own agent." },
    { target: null, title: "That's the tour", body: `The best way to see it is to call ${agent}. Book something and watch it appear.` },
  ]
}

const PAD = 8
const CARD_W = 340

function findTarget(name: string | null): HTMLElement | null {
  if (!name) return null
  const el = document.querySelector<HTMLElement>(`[data-tour="${name}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 ? el : null
}

export function GuestTour({ agentName }: { agentName?: string }) {
  const active = useTourActive()
  const navigate = useNavigate()
  const steps = buildSteps(agentName || "your AI receptionist")
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const nextRef = useRef<HTMLButtonElement>(null)

  // First visit: start shortly after the page has painted its data.
  useEffect(() => {
    if (isTourDone()) return
    const t = window.setTimeout(startTour, 1200)
    return () => clearTimeout(t)
  }, [])

  // A fresh run always begins at the welcome card.
  useEffect(() => { if (active) setIndex(0) }, [active])

  const measure = useCallback(() => {
    setViewport({ w: window.innerWidth, h: window.innerHeight })
    const el = findTarget(steps[index]?.target ?? null)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [index, steps])

  // Bring the target into view, then follow it as the page scrolls or resizes.
  useLayoutEffect(() => {
    if (!active) return
    const el = findTarget(steps[index]?.target ?? null)
    el?.scrollIntoView({ block: "center", behavior: "smooth" })
    measure()
    const settle = window.setTimeout(measure, 420)
    const on = () => measure()
    window.addEventListener("resize", on)
    window.addEventListener("scroll", on, true)
    return () => {
      clearTimeout(settle)
      window.removeEventListener("resize", on)
      window.removeEventListener("scroll", on, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index])

  // Skip steps whose target isn't visible, in the direction of travel.
  const go = useCallback((from: number, dir: 1 | -1) => {
    let i = from + dir
    while (i >= 0 && i < steps.length && steps[i].target && !findTarget(steps[i].target)) i += dir
    if (i < 0) return
    if (i >= steps.length) { endTour(); return }
    setIndex(i)
  }, [steps])

  const finish = useCallback((toDemo: boolean) => {
    endTour()
    if (toDemo) navigate({ to: "/demo" })
  }, [navigate])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false)
      if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); index === steps.length - 1 ? finish(true) : go(index, 1) }
      if (e.key === "ArrowLeft") go(index, -1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [active, index, steps.length, go, finish])

  useEffect(() => { if (active) nextRef.current?.focus({ preventScroll: true }) }, [active, index])

  if (!active || typeof document === "undefined") return null

  const step = steps[index]
  const last = index === steps.length - 1
  const centered = !step.target || !rect

  // Spotlight: a padded box around the target. Centered steps collapse it to a
  // point so the dimmed backdrop covers everything and the card sits in the middle.
  const spot = centered
    ? { top: viewport.h / 2, left: viewport.w / 2, width: 0, height: 0 }
    : { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }

  // Card placement: beside sidebar targets, below the target if there's room, else above.
  const cardW = Math.min(CARD_W, viewport.w - 24)
  const cardH = 210
  let cardTop = viewport.h / 2 - cardH / 2
  let cardLeft = viewport.w / 2 - cardW / 2
  if (!centered && rect) {
    const roomBelow = viewport.h - (spot.top + spot.height)
    if (rect.right < 300 && viewport.w > 900) {
      cardLeft = spot.left + spot.width + 16
      cardTop = Math.min(Math.max(12, rect.top + rect.height / 2 - cardH / 2), viewport.h - cardH - 12)
    } else if (roomBelow > cardH + 24) {
      cardTop = spot.top + spot.height + 14
      cardLeft = Math.min(Math.max(12, rect.left + rect.width / 2 - cardW / 2), viewport.w - cardW - 12)
    } else {
      cardTop = Math.max(12, spot.top - cardH - 14)
      cardLeft = Math.min(Math.max(12, rect.left + rect.width / 2 - cardW / 2), viewport.w - cardW - 12)
    }
  }

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 80 }} role="presentation">
      {/* Blocks clicks on the page underneath while the tour runs. */}
      <div style={{ position: "absolute", inset: 0 }} onClick={() => { /* swallow */ }} />

      <div className="tour-move" style={{
        position: "absolute", top: spot.top, left: spot.left, width: spot.width, height: spot.height,
        borderRadius: centered ? 0 : 16,
        boxShadow: "0 0 0 9999px rgba(10,10,14,0.55)",
        outline: centered ? "none" : "2px solid rgba(255,255,255,0.85)",
        pointerEvents: "none",
      }} />

      <div className="tour-move" role="dialog" aria-label={step.title} style={{
        position: "absolute", top: cardTop, left: cardLeft, width: cardW,
        background: "var(--popover, #fff)", color: "var(--foreground)",
        border: "1px solid var(--border)", borderRadius: 18, padding: "18px 18px 14px",
        boxShadow: "0 18px 50px rgba(0,0,0,0.28)",
      }}>
        <div key={index} className="auth-swap-in">
          <p style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 8 }}>
            {index + 1} of {steps.length}
          </p>
          <h2 style={{ fontSize: 17, fontWeight: 650, letterSpacing: "-0.02em", marginBottom: 6 }}>{step.title}</h2>
          <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--muted-foreground)", letterSpacing: "-0.005em" }}>{step.body}</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
          <div style={{ display: "flex", gap: 4, flex: 1, minWidth: 0 }} aria-hidden>
            {steps.map((_, i) => (
              <span key={i} style={{
                height: 4, borderRadius: 4, flex: i === index ? 2.2 : 1, maxWidth: i === index ? 22 : 8,
                background: i <= index ? "var(--foreground)" : "var(--border)",
                transition: "all 0.35s cubic-bezier(0.16,1,0.3,1)",
              }} />
            ))}
          </div>
          {!last && (
            <button type="button" onClick={() => finish(false)}
              style={{ fontSize: 12.5, color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", padding: "6px 4px", fontFamily: "inherit" }}>
              Skip
            </button>
          )}
          {index > 0 && (
            <button type="button" onClick={() => go(index, -1)}
              style={{ fontSize: 12.5, fontWeight: 600, padding: "7px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", fontFamily: "inherit" }}>
              Back
            </button>
          )}
          <button ref={nextRef} type="button" onClick={() => (last ? finish(true) : go(index, 1))}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, padding: "7px 14px", borderRadius: 10,
              border: "none", background: "var(--foreground)", color: "var(--background)", cursor: "pointer", fontFamily: "inherit",
            }}>
            {last ? "Try the demo" : "Next"} <ArrowRight size={13} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
