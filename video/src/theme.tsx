import React from "react"
import { Easing, interpolate, spring, useVideoConfig } from "remotion"
import { loadFont } from "@remotion/google-fonts/Geist"
import { loadFont as loadMono } from "@remotion/google-fonts/GeistMono"

const sans = loadFont("normal", { weights: ["400", "500", "600", "700"] })
const mono = loadMono("normal", { weights: ["500", "600"] })

export const FONT = sans.fontFamily
export const MONO = mono.fontFamily

// Same palette as the dashboard.
export const C = {
  ink: "#0A0A0B",
  bg: "#F5F5F7",
  card: "#FFFFFF",
  muted: "#6B6B76",
  border: "rgba(10,10,11,0.08)",
  green: "#10B981",
  greenLight: "#34D399",
  greenDark: "#059669",
  greenWash: "#D1FAE5",
  red: "#F87171",
}

// Edit this to show a web address on the last frame. Empty hides it.
export const CTA_URL = ""

export const ease = Easing.bezier(0.16, 1, 0.3, 1)

// One layout unit: 1px at 1920 wide (landscape) or 1080 wide (vertical).
export function useLayout() {
  const { width, height, fps } = useVideoConfig()
  const V = height > width
  const u = V ? width / 1080 : width / 1920
  return { V, u, width, height, fps }
}

export const sp = (frame: number, fps: number, delay = 0, config: Record<string, number> = {}) =>
  spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 110, mass: 0.9, ...config } })

export const clamp = (frame: number, a: number, b: number, from = 0, to = 1) =>
  interpolate(frame, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease })

export const typed = (text: string, frame: number, start: number, cps = 1.7) =>
  text.slice(0, Math.max(0, Math.floor((frame - start) * cps)))

export const Logo: React.FC<{ size: number; dark?: boolean }> = ({ size, dark = false }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <g id="h">
        <path d="M15 0 H44 C47 30 48.6 42 48.6 50 C48.6 58 47 70 44 100 H15 C29 75 39.6 62 39.6 50 C39.6 38 29 25 15 0 Z" />
        <path fillRule="evenodd" d="M0 17 L33 42 C36 44.5 37.2 47 37.2 50 C37.2 53 36 55.5 33 58 L0 83 Z M0 45 L29 49 Q31 50 29 51 L0 55 Z" />
      </g>
      <clipPath id="c"><circle cx="50" cy="50" r="45" /></clipPath>
    </defs>
    <rect width="100" height="100" rx="24" fill={dark ? C.ink : "#fff"} />
    <g transform="translate(50 50) scale(0.95) translate(-50 -50)">
      <g clipPath="url(#c)" fill={dark ? "#fff" : C.ink}>
        <use href="#h" />
        <use href="#h" transform="matrix(-1 0 0 1 100 0)" />
      </g>
    </g>
  </svg>
)

export const PhoneIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
)

export const Check: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; u: number; dark?: boolean }> = ({ children, style, u, dark }) => (
  <div style={{
    background: dark ? "rgba(255,255,255,0.06)" : C.card,
    border: `${Math.max(1, u)}px solid ${dark ? "rgba(255,255,255,0.1)" : C.border}`,
    borderRadius: 32 * u,
    boxShadow: dark ? "none" : "0 30px 80px rgba(10,10,11,0.12), 0 2px 6px rgba(10,10,11,0.05)",
    ...style,
  }}>
    {children}
  </div>
)

export const Pill: React.FC<{ children: React.ReactNode; u: number; color?: string; bg?: string; pulse?: number }> = ({ children, u, color = C.greenDark, bg = C.greenWash, pulse }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 10 * u, padding: `${8 * u}px ${18 * u}px`, borderRadius: 999,
    background: bg, color, fontSize: 24 * u, fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap",
  }}>
    {pulse !== undefined && (
      <span style={{ position: "relative", width: 12 * u, height: 12 * u }}>
        <span style={{ position: "absolute", inset: -6 * u * pulse, borderRadius: 999, background: color, opacity: 0.35 * (1 - pulse) }} />
        <span style={{ position: "absolute", inset: 0, borderRadius: 999, background: color }} />
      </span>
    )}
    {children}
  </span>
)
