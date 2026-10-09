import { useEffect, useRef } from "react"

// Cloudflare Turnstile for the public voice demo: a captcha that is usually
// invisible. The widget keeps one fresh token ready; the call takes it just
// before asking the server for a Gemini token, and the widget resets to make
// the next one. Without VITE_TURNSTILE_SITE_KEY (local development) nothing
// loads and no token is sent; the server only skips the check when it has no
// secret either.

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

export const turnstileEnabled = Boolean(SITE_KEY)

let token: string | null = null
let widgetId: string | null = null
let waiting: Array<(t: string | null) => void> = []

function publish(t: string | null) {
  token = t
  if (t) { waiting.forEach(w => w(t)); waiting = [] }
}

let scriptPromise: Promise<void> | null = null
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script")
    s.src = SCRIPT_SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { scriptPromise = null; reject(new Error("Turnstile failed to load")) }
    document.head.appendChild(s)
  })
  return scriptPromise
}

// Resolves with a token, or null if none arrives in time. Each token works
// once, so taking it starts a fresh challenge.
export async function takeTurnstileToken(timeoutMs = 8000): Promise<string | null> {
  if (!turnstileEnabled) return null
  const ready = token ?? await new Promise<string | null>(resolve => {
    const timer = window.setTimeout(() => resolve(null), timeoutMs)
    waiting.push(t => { clearTimeout(timer); resolve(t) })
  })
  token = null
  if (widgetId && window.turnstile) window.turnstile.reset(widgetId)
  return ready
}

// Mount once on the public demo page.
export function useTurnstileWidget(enabled: boolean) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!SITE_KEY || !enabled) return
    let cancelled = false
    void loadScript().then(() => {
      if (cancelled || !box.current || !window.turnstile) return
      widgetId = window.turnstile.render(box.current, {
        sitekey: SITE_KEY,
        appearance: "interaction-only",
        "refresh-expired": "auto",
        callback: (t: string) => publish(t),
        "expired-callback": () => publish(null),
        "error-callback": () => publish(null),
      })
    }).catch(() => {})
    return () => {
      cancelled = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
      widgetId = null
      token = null
    }
  }, [enabled])
  return box
}
