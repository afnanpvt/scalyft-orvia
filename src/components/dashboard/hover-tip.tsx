import { useState, useRef, useEffect } from "react"

// Lightweight hover/focus explainer. Opens on hover (with a short delay so it
// doesn't flicker when the pointer passes over) and on keyboard focus.
export function HoverTip({ title, body, children, placement = "bottom", block }: {
  title: string
  body: string
  children: React.ReactNode
  placement?: "bottom" | "top"
  block?: boolean
}) {
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  function show() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(true), 150)
  }
  function hide() {
    if (timer.current) clearTimeout(timer.current)
    setOpen(false)
  }

  return (
    <div
      style={{ position: "relative", display: block ? "block" : "inline-block", width: block ? "100%" : undefined, minWidth: 0 }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open && (
        <div role="tooltip" className="animate-scale-in" style={{
          position: "absolute", left: 0, zIndex: 60,
          ...(placement === "bottom" ? { top: "calc(100% + 8px)" } : { bottom: "calc(100% + 8px)" }),
          width: 240, maxWidth: "calc(100vw - 32px)",
          padding: "11px 13px", borderRadius: 12,
          background: "var(--popover)", border: "1px solid var(--border)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.06)",
          pointerEvents: "none",
        }}>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em", marginBottom: 3 }}>
            {title}
          </p>
          <p style={{ fontSize: 12, lineHeight: 1.45, color: "var(--muted-foreground)", letterSpacing: "-0.01em" }}>
            {body}
          </p>
        </div>
      )}
    </div>
  )
}

// One place for the wording, so the sidebar pill and the overview card agree.
export function agentStatusCopy(opts: {
  onCall?: boolean
  hasPhone: boolean
  isActive: boolean
  exhausted: boolean
  low?: boolean
}): { title: string; body: string } {
  if (opts.onCall) return { title: "On a call", body: "Talking to a caller right now." }
  if (opts.exhausted) return { title: "Paused", body: "Out of call minutes. Top up to resume." }
  if (!opts.isActive) return { title: "Account inactive", body: "Contact us to activate calls." }
  if (!opts.hasPhone) return { title: "No phone number yet", body: "Real calls start once a number is connected. Test anytime with Talk to Assistant." }
  if (opts.low) return { title: "Running low", body: "Under 30 minutes left this month." }
  return { title: "Live", body: "Answering every call, 24/7." }
}
