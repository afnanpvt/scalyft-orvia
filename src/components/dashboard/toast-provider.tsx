import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { CalendarCheck2, X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useTheme } from "@/lib/theme"

// ─── Types ───────────────────────────────────────────────

interface ToastInput {
  title: string
  description?: string
  icon?: React.ReactNode
  accent?: string
}

interface Toast extends ToastInput {
  id: string
}

interface ToastContextValue {
  showToast: (toast: ToastInput) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return ctx
}

// ─── Single toast ────────────────────────────────────────

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const showFor = setTimeout(() => setLeaving(true), 6000)
    return () => clearTimeout(showFor)
  }, [])

  useEffect(() => {
    if (!leaving) return
    const t = setTimeout(() => onDismiss(toast.id), 220)
    return () => clearTimeout(t)
  }, [leaving, toast.id, onDismiss])

  return (
    <div
      className={leaving ? undefined : "animate-toast-in"}
      style={{
        display: "flex", alignItems: "flex-start", gap: 11,
        width: 340, maxWidth: "calc(100vw - 32px)",
        padding: "13px 14px",
        borderRadius: 16,
        background: isDark ? "var(--popover)" : "#fff",
        border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
        boxShadow: "0 10px 40px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)",
        opacity: leaving ? 0 : 1,
        transform: leaving ? "translateX(24px) scale(0.97)" : "translateX(0) scale(1)",
        transition: "opacity 0.2s ease, transform 0.2s ease",
        pointerEvents: "auto",
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
        background: toast.accent ? `${toast.accent}22` : "#D1FAE5",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {toast.icon ?? <CalendarCheck2 style={{ width: 15, height: 15, color: toast.accent ?? "#059669" }} strokeWidth={2} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em", lineHeight: 1.3 }}>
          {toast.title}
        </p>
        {toast.description && (
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", letterSpacing: "-0.01em", marginTop: 2, lineHeight: 1.35 }}>
            {toast.description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setLeaving(true)}
        aria-label="Dismiss notification"
        style={{
          width: 20, height: 20, borderRadius: 6, flexShrink: 0,
          background: "transparent", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--muted-foreground)",
        }}
      >
        <X style={{ width: 12, height: 12 }} strokeWidth={2} />
      </button>
    </div>
  )
}

// ─── Provider ────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((toast: ToastInput) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setToasts(prev => [...prev, { ...toast, id }])
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{
        position: "fixed", top: 16, right: 16, zIndex: 1000,
        display: "flex", flexDirection: "column", gap: 8,
        pointerEvents: "none",
      }}>
        {toasts.map(t => <ToastCard key={t.id} toast={t} onDismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  )
}

// ─── Booking notifications ───────────────────────────────
// Fires an in-app toast the moment a new appointment lands, from anywhere
// in the dashboard — including mid-demo. Mount once, near the app root.

function formatApptTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export function useAppointmentBookedToasts() {
  const { showToast } = useToast()
  const showToastRef = useRef(showToast)
  showToastRef.current = showToast

  useEffect(() => {
    const channel = supabase
      .channel("appointments_booked_toasts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "appointments" },
        (payload) => {
          const row = payload.new as {
            customer_name?: string
            service_type?: string | null
            scheduled_start?: string
            created_at?: string
          }
          // Admin demo-data batches insert backdated rows — only toast for
          // bookings that are genuinely happening right now.
          if (row.created_at && Date.now() - new Date(row.created_at).getTime() > 2 * 60_000) return
          showToastRef.current({
            title: "New appointment booked",
            description: [row.customer_name, row.service_type, row.scheduled_start ? formatApptTime(row.scheduled_start) : null]
              .filter(Boolean)
              .join(" · "),
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])
}
