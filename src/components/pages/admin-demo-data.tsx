import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ShieldAlert, Sparkles, Trash2, RefreshCw } from "lucide-react"
import { getDemoDataStats, setDemoAutofill, generateDemoDataNow, clearDemoData } from "@/lib/api"
import { useAuth } from "@/lib/auth"

// Every dashboard query that generated rows feed into — refreshed after any
// change here so Overview/Calls/etc. reflect it without a reload.
const DASHBOARD_QUERY_KEYS = [
  ["demo-data-stats"], ["briefing"], ["weekly-stats"], ["calls"], ["appointments"], ["leads"], ["month-call-stats"],
]

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", color: "var(--foreground)" }}>
        {value}
      </p>
    </div>
  )
}

export default function AdminDemoDataPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<null | "toggle" | "generate" | "clear">(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)

  const { data: stats, isLoading } = useQuery({
    queryKey: ["demo-data-stats"],
    queryFn: getDemoDataStats,
    enabled: profile.role === "admin",
  })

  if (profile.role !== "admin") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "80px 20px", color: "var(--muted-foreground)" }}>
        <ShieldAlert size={28} strokeWidth={1.5} />
        <p style={{ fontSize: 14 }}>You don't have access to this page.</p>
      </div>
    )
  }

  async function refreshAll() {
    await Promise.all(DASHBOARD_QUERY_KEYS.map(queryKey => queryClient.invalidateQueries({ queryKey })))
  }

  async function handleToggle() {
    if (!stats) return
    setBusy("toggle")
    const { error } = await setDemoAutofill(!stats.autofill)
    setBusy(null)
    setMessage(error ? { kind: "error", text: error } : null)
    await refreshAll()
  }

  async function handleGenerate() {
    setBusy("generate")
    const { created, error } = await generateDemoDataNow(6)
    setBusy(null)
    setMessage(error ? { kind: "error", text: error } : { kind: "ok", text: `Added ${created} calls from the last few hours.` })
    await refreshAll()
  }

  async function handleClear() {
    if (!confirmClear) {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 4000)
      return
    }
    setConfirmClear(false)
    setBusy("clear")
    const { removed, error } = await clearDemoData()
    setBusy(null)
    setMessage(error ? { kind: "error", text: error } : { kind: "ok", text: `Removed ${removed} demo calls and everything linked to them.` })
    await refreshAll()
  }

  const on = !!stats?.autofill

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 880 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.4px", marginBottom: 4 }}>Demo Data</h1>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", maxWidth: 620 }}>
          Admin only. Keeps this account's dashboard looking lived-in for demos. Generated calls, appointments and
          leads are tagged, never touch real customers or billing, and are auto-deleted after 21 days.
        </p>
      </div>

      {/* Autofill switch */}
      <div className="ios-card" style={{ padding: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)", marginBottom: 3 }}>Daily autofill</p>
          <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.45 }}>
            Adds a random batch of 3–7 calls at 1:00 PM and 8:00 PM IST, spread across the hours since the last run.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Daily autofill"
          disabled={isLoading || busy !== null}
          onClick={handleToggle}
          style={{
            width: 44, height: 26, borderRadius: 999, flexShrink: 0, position: "relative",
            border: "none", cursor: busy ? "wait" : "pointer",
            background: on ? "#10B981" : "var(--muted)",
            transition: "background 0.2s",
          }}
        >
          <span style={{
            position: "absolute", top: 3, left: on ? 21 : 3,
            width: 20, height: 20, borderRadius: "50%", background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s",
          }} />
        </button>
      </div>

      {/* Current data */}
      <div className="ios-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", gap: 20, marginBottom: 18 }}>
          <Stat label="Demo calls" value={isLoading ? "—" : stats?.calls ?? 0} />
          <Stat label="Appointments" value={isLoading ? "—" : stats?.appointments ?? 0} />
          <Stat label="Leads" value={isLoading ? "—" : stats?.leads ?? 0} />
          <Stat label="Latest" value={isLoading ? "—" : stats?.latest ? timeAgo(stats.latest) : "never"} />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <button type="button" onClick={handleGenerate} disabled={busy !== null}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 10,
              border: "none", background: "var(--foreground)", color: "var(--background)",
              cursor: busy ? "wait" : "pointer", opacity: busy && busy !== "generate" ? 0.5 : 1,
            }}>
            {busy === "generate" ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Generate a batch now
          </button>
          <button type="button" onClick={handleClear} disabled={busy !== null || (stats?.calls ?? 0) === 0}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 10,
              border: `1px solid ${confirmClear ? "#E5484D" : "var(--border)"}`,
              background: confirmClear ? "rgba(229,72,77,0.08)" : "var(--card)",
              color: "#E5484D",
              cursor: busy ? "wait" : "pointer",
              opacity: (stats?.calls ?? 0) === 0 ? 0.4 : 1,
            }}>
            <Trash2 size={14} />
            {confirmClear ? "Click again to delete all demo data" : "Clear all demo data"}
          </button>
        </div>

        {message && (
          <p style={{ fontSize: 12.5, marginTop: 12, color: message.kind === "ok" ? "#059669" : "#DC2626" }}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  )
}
