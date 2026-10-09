import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getDemoLimits, setDemoLimits } from "@/lib/api"

// Admin controls for the public voice demo (/try): how many demo calls one
// visitor can start, and an optional cap across everyone per day.

const inputStyle: React.CSSProperties = {
  width: 110, padding: "7px 10px", borderRadius: 10, fontSize: 13, fontFamily: "inherit",
  border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", outline: "none",
}

export function DemoLimitsCard() {
  const queryClient = useQueryClient()
  const { data: limits } = useQuery({ queryKey: ["demo-limits"], queryFn: getDemoLimits })
  const [dailyCap, setDailyCap] = useState("")
  const [perVisitor, setPerVisitor] = useState("6")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)

  useEffect(() => {
    if (!limits) return
    setDailyCap(limits.daily_cap === null ? "" : String(limits.daily_cap))
    setPerVisitor(String(limits.per_visitor))
  }, [limits])

  async function save() {
    const cap = dailyCap.trim() === "" ? null : Number(dailyCap)
    const per = Number(perVisitor)
    if (cap !== null && (!Number.isInteger(cap) || cap < 0)) { setMessage({ kind: "error", text: "Daily cap must be a whole number, or empty for no cap." }); return }
    if (!Number.isInteger(per) || per < 1 || per > 100) { setMessage({ kind: "error", text: "Per visitor must be a whole number from 1 to 100." }); return }
    setSaving(true)
    const { error } = await setDemoLimits(cap, per)
    setSaving(false)
    setMessage(error ? { kind: "error", text: error } : { kind: "ok", text: "Saved." })
    await queryClient.invalidateQueries({ queryKey: ["demo-limits"] })
  }

  return (
    <div className="ios-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)", marginBottom: 3 }}>Public demo limits</p>
        <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.45, maxWidth: 620 }}>
          Applies to the call-only demo anyone can open without an account. Leave the daily cap empty for no cap, or
          set 0 to pause the demo.
          {limits ? ` ${limits.used_24h} demo call${limits.used_24h === 1 ? "" : "s"} started in the last 24 hours.` : ""}
        </p>
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "var(--muted-foreground)" }}>
          Daily cap, all visitors
          <input inputMode="numeric" value={dailyCap} placeholder="No cap" onChange={e => setDailyCap(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "var(--muted-foreground)" }}>
          Per visitor, every 10 minutes
          <input inputMode="numeric" value={perVisitor} onChange={e => setPerVisitor(e.target.value)} style={inputStyle} />
        </label>
        <button type="button" onClick={save} disabled={saving || !limits}
          style={{
            fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 10, border: "none",
            background: "var(--foreground)", color: "var(--background)",
            cursor: saving ? "wait" : "pointer", opacity: saving || !limits ? 0.5 : 1,
          }}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {message && (
        <p style={{ fontSize: 12.5, color: message.kind === "error" ? "#DC2626" : "var(--muted-foreground)" }}>{message.text}</p>
      )}
    </div>
  )
}
