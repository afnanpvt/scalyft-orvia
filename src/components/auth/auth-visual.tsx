// Auth page left-side visual.
//
// Anonymous, schematic activity cards (no fake customer names) — the design
// communicates "your AI handles calls 24/7" without faking data that could
// confuse first-time owners. Cards arrive staggered AFTER the panel reveal,
// then float subtly.

import { useEffect, useState } from "react"
import { Phone, CalendarCheck, MessageSquare } from "lucide-react"

type CallCard = {
  id: string
  kind: "live" | "booked" | "lead"
  title: string
  detail: string
  meta: string
  top: string
  left?: string
  right?: string
  rotate: number
  floatDelay: 0 | 1 | 2 | 3
}

// Card positions are tuned for a diagonal sweep top-right → bottom-left.
// Each card occupies its own quadrant so they breathe and never overlap on
// laptop or desktop widths. Rotations alternate sign for natural variation.
const CARDS: CallCard[] = [
  {
    id: "live",
    kind: "live",
    title: "Live call",
    detail: "Service request",
    meta: "00:34 · in progress",
    top: "4%",
    right: "8%",
    rotate: 2.5,
    floatDelay: 0,
  },
  {
    id: "booked",
    kind: "booked",
    title: "Booking confirmed",
    detail: "Tomorrow · 9:00 AM",
    meta: "Added to schedule",
    top: "38%",
    left: "10%",
    rotate: -2,
    floatDelay: 1,
  },
  {
    id: "lead",
    kind: "lead",
    title: "Quote requested",
    detail: "Callback needed",
    meta: "Logged · 1 min ago",
    top: "70%",
    right: "10%",
    rotate: 1.5,
    floatDelay: 2,
  },
]

const KIND: Record<CallCard["kind"], {
  icon: typeof Phone
  iconColor: string
  iconBg: string
  tagBg: string
  tagText: string
  tagLabel: string
}> = {
  live: {
    icon: Phone, iconColor: "#059669", iconBg: "#ECFDF5",
    tagBg: "#D1FAE5", tagText: "#047857", tagLabel: "Live",
  },
  booked: {
    icon: CalendarCheck, iconColor: "#4F46E5", iconBg: "#EEF2FF",
    tagBg: "#E0E7FF", tagText: "#3730A3", tagLabel: "Booked",
  },
  lead: {
    icon: MessageSquare, iconColor: "#B45309", iconBg: "#FFFBEB",
    tagBg: "#FEF3C7", tagText: "#92400E", tagLabel: "Lead",
  },
}

export function AuthVisual() {
  const [cardsIn, setCardsIn] = useState(false)
  const [headingIn, setHeadingIn] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setCardsIn(true); setHeadingIn(true); return
    }
    const t1 = setTimeout(() => setHeadingIn(true), 400)
    const t2 = setTimeout(() => setCardsIn(true), 620)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden">
      {/* Soft grid backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 45%, black 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 45%, black 30%, transparent 80%)",
        }}
      />

      <div
        aria-hidden
        className="absolute -top-32 -left-32 rounded-full opacity-50"
        style={{
          width: 420, height: 420,
          background: "radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="absolute -bottom-40 -right-32 rounded-full opacity-45"
        style={{
          width: 420, height: 420,
          background: "radial-gradient(circle, rgba(16,185,129,0.10) 0%, transparent 70%)",
        }}
      />

      {/* Headline */}
      <div
        className="relative z-10 px-12 pt-14 max-w-md"
        style={{
          opacity: headingIn ? 1 : 0,
          transform: headingIn ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 480ms cubic-bezier(0.22, 1, 0.36, 1), transform 480ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/55 mb-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-live-pulse" />
            Always on
          </span>
        </p>
        <h2 className="text-[34px] font-semibold tracking-[-0.025em] text-foreground leading-[1.1] mb-4 max-w-[14ch]">
          Calls answered, <span className="text-muted-foreground/65">round the clock.</span>
        </h2>
        <p className="text-[14.5px] text-muted-foreground leading-relaxed max-w-[32ch]">
          Every booking, lead, and callback waits for you on the other side.
        </p>
      </div>

      {/* Floating cards */}
      <div className="relative flex-1 min-h-0">
        {CARDS.map((c, i) => (
          <FloatingCard key={c.id} card={c} index={i} visible={cardsIn} />
        ))}
      </div>

      {/* Footer: small "preview" disclaimer + stats */}
      <div
        className="relative z-10 px-12 pb-10"
        style={{
          opacity: cardsIn ? 1 : 0,
          transform: cardsIn ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 480ms cubic-bezier(0.22, 1, 0.36, 1) 480ms, transform 480ms cubic-bezier(0.22, 1, 0.36, 1) 480ms",
        }}
      >
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/50 mb-3">
          A glimpse of what runs your day
        </p>
        <div className="flex items-center gap-5 text-[11.5px] text-muted-foreground/70">
          <span className="font-mono tabular-nums tracking-[-0.01em]">24 / 7</span>
          <span className="opacity-40">·</span>
          <span>Books while you sleep</span>
          <span className="opacity-40">·</span>
          <span>No missed calls</span>
        </div>
      </div>
    </div>
  )
}

function FloatingCard({ card, index, visible }: { card: CallCard; index: number; visible: boolean }) {
  const style = KIND[card.kind]
  const Icon = style.icon
  const floatClass =
    card.floatDelay === 0 ? "animate-gentle-float"
    : card.floatDelay === 1 ? "animate-gentle-float animate-gentle-float-delay-1"
    : card.floatDelay === 2 ? "animate-gentle-float animate-gentle-float-delay-2"
    : "animate-gentle-float animate-gentle-float-delay-3"

  const arrivalStyle: React.CSSProperties = {
    position: "absolute",
    top: card.top,
    left: card.left,
    right: card.right,
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0) scale(1)" : "translateY(14px) scale(0.96)",
    transition: `opacity 520ms cubic-bezier(0.22, 1, 0.36, 1) ${index * 140}ms, transform 560ms cubic-bezier(0.22, 1, 0.36, 1) ${index * 140}ms`,
    filter: visible ? "blur(0)" : "blur(3px)",
    willChange: "opacity, transform, filter",
  }

  return (
    <div style={arrivalStyle}>
      <div
        className={floatClass}
        style={{
          transform: `rotate(${card.rotate}deg)`,
          width: 248,
          padding: "13px 15px",
          borderRadius: 16,
          background: "#FFFFFF",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 28px -8px rgba(15, 23, 42, 0.10), 0 0 0 0.5px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div className="flex items-center justify-between mb-2.5">
          <div
            style={{
              width: 28, height: 28, borderRadius: 9,
              background: style.iconBg,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon size={13} color={style.iconColor} strokeWidth={1.75} />
          </div>
          <span
            style={{
              fontSize: 9.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
              background: style.tagBg, color: style.tagText,
              letterSpacing: "0.06em", textTransform: "uppercase",
            }}
          >
            {style.tagLabel}
          </span>
        </div>
        <p className="text-[13.5px] font-semibold text-foreground tracking-[-0.015em] mb-0.5">
          {card.title}
        </p>
        <p className="text-[11.5px] text-muted-foreground mb-1.5">
          {card.detail}
        </p>
        <p className="text-[10px] text-muted-foreground/60 font-mono tabular-nums">
          {card.meta}
        </p>
      </div>
    </div>
  )
}
