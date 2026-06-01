import { useEffect, useRef, useState, useCallback } from "react"
import type { ReactNode } from "react"

/**
 * Split-screen auth shell.
 *
 * Sequencing (Apple-grade staged motion, not all-at-once):
 *   t=0      both panels mount with `data-open="false"` so the CSS
 *            transition is primed.
 *   t=30ms   panels flip to data-open=true → 600ms slide+blur in
 *            (from -40px / +40px depending on side).
 *   t=580ms  panels nearly settled. Children inside the form panel
 *            receive `formReady=true` via useShellSequence(), and
 *            cascade in with 90ms stagger.
 *
 * The form is always rendered to the right of the visual on >=lg.
 * On mobile, the visual is hidden and the form fills the screen.
 *
 * The whole shell is force-light themed — the design is built for
 * light surfaces, and the dark variant degrades the call-card visual.
 */
export function AuthShell({
  visual,
  heading,
  subheading,
  children,
}: {
  visual: ReactNode
  heading: string
  subheading: string
  children: ReactNode
}) {
  const [panelsOpen, setPanelsOpen] = useState(false)

  useEffect(() => {
    // One frame after mount, kick the panel transition. requestAnimationFrame
    // ensures the initial closed state is painted first, so the transition runs.
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPanelsOpen(true))
    })
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div className="theme-light-force min-h-screen">
      <div className="grid min-h-screen lg:grid-cols-2">
        {/* ─── Visual: LEFT on desktop, hidden on mobile ─────
            Tinted slate-grey surface with a subtle diagonal gradient.
            Reads as the "stage" — distinct from the form's white. */}
        <div
          className="hidden lg:flex t-panel-slide-x relative overflow-hidden"
          data-from="left"
          data-open={panelsOpen}
          style={{
            background:
              "linear-gradient(145deg, #EEF0F4 0%, #E6E9EF 55%, #DFE3EA 100%)",
            // hairline separator that hugs the right edge — barely visible
            // but kills the "two whites blending" feeling at the seam.
            boxShadow: "inset -1px 0 0 rgba(15, 23, 42, 0.06)",
          }}
        >
          {visual}
        </div>

        {/* ─── Form: RIGHT on desktop, full-width on mobile ───
            Pure white "writing surface". Sits visually above the
            tinted left panel via the seam shadow. */}
        <div
          className="t-panel-slide-x flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-16"
          data-from="right"
          data-open={panelsOpen}
          style={{ background: "#FFFFFF" }}
        >
          <div className="mx-auto w-full max-w-sm">
            {/* Brand — quiet, top of form */}
            <div className="mb-10">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl font-semibold tracking-[-0.04em] text-foreground">
                  Orvia
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </div>
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/55">
                AI Front Desk
              </p>
            </div>

            <div className="mb-8">
              <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-foreground mb-1.5 leading-tight">
                {heading}
              </h1>
              <p className="text-[14px] text-muted-foreground">
                {subheading}
              </p>
            </div>

            {children}

            <p className="text-[9px] font-medium uppercase tracking-[0.15em] text-muted-foreground/55 mt-16 text-center">
              Powered by{" "}
              <a
                href="https://www.scalyft.tech/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                Scalyft
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Returns `formReady` — true once the panel reveal has settled enough
 * that the form fields should start their stagger.
 *
 * Tuned to 540ms — the panel duration is 600ms with ease-out, so by
 * 540ms the panel is at ~96% of its travel. Starting the form there
 * gives a graceful handoff with no overlap-confusion.
 */
export function useShellSequence(panelSettleMs: number = 540): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setReady(true)
      return
    }
    const t = setTimeout(() => setReady(true), panelSettleMs)
    return () => clearTimeout(t)
  }, [panelSettleMs])
  return ready
}

/**
 * Per the transitions-dev #12 spec: to replay the shake, remove the
 * `is-shaking` class, force a reflow, then re-add it. The hook returns
 * a `trigger()` function that does exactly that.
 */
export function useShake(ref: React.RefObject<HTMLElement | null>) {
  return useCallback(() => {
    const el = ref.current
    if (!el) return
    el.classList.remove("is-shaking")
    // Force a reflow so the animation re-fires from a clean baseline.
    void el.offsetWidth
    el.classList.add("is-shaking")
    // Cleanup after the shake completes (4 segments: 80+60+80+60 = 280ms; +20ms cushion).
    window.setTimeout(() => el.classList.remove("is-shaking"), 320)
  }, [ref])
}

/**
 * Form-field fade-up with stagger. Driven by `formReady` from
 * useShellSequence. Each index adds 90ms.
 */
export function fadeUpStyle(ready: boolean, index: number): React.CSSProperties {
  return {
    opacity: ready ? 1 : 0,
    transform: ready ? "translateY(0)" : "translateY(8px)",
    transition: `opacity 360ms cubic-bezier(0.22, 1, 0.36, 1) ${index * 90}ms, transform 360ms cubic-bezier(0.22, 1, 0.36, 1) ${index * 90}ms`,
    willChange: "opacity, transform",
  }
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="text-[12.5px] text-destructive bg-destructive/8 border border-destructive/15 rounded-lg px-3 py-2"
    >
      {message}
    </p>
  )
}
