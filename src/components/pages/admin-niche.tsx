import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ShieldAlert, Check, Loader2, Smile, Wrench, Wind, Home, Headphones } from "lucide-react"
import { getBusinessSettings, updateBusinessTopLevel, regenerateDemoWeek } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { NICHE_PRESETS, applyPresetSettings, type NichePreset } from "@/lib/niche-presets"
import type { Niche } from "@/lib/vapi/niche-profiles"

const ICONS: Record<Niche, React.ElementType> = {
  dental: Smile,
  plumbing: Wrench,
  hvac: Wind,
  real_estate: Home,
  customer_support: Headphones,
}

// Everything that renders business data — refreshed after a switch so the
// whole dashboard flips to the new niche without a reload.
const QUERY_KEYS = [
  ["business-settings"], ["briefing"], ["weekly-stats"], ["calls"], ["appointments"],
  ["leads"], ["demo-data-stats"], ["billing"], ["month-call-stats"],
]

export default function AdminNichePage() {
  const { profile, updateProfile } = useAuth()
  const queryClient = useQueryClient()
  const [refreshData, setRefreshData] = useState(true)
  const [applying, setApplying] = useState<Niche | null>(null)
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)

  const { data: business } = useQuery({
    queryKey: ["business-settings"],
    queryFn: getBusinessSettings,
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

  const current = business?.settings.niche ?? null

  async function apply(preset: NichePreset) {
    setApplying(preset.id)
    setMessage(null)
    // Re-read right before writing so we merge onto the latest settings.
    const fresh = await getBusinessSettings()
    if (!fresh) {
      setApplying(null)
      setMessage({ kind: "error", text: "Couldn't load the business. Try again." })
      return
    }
    const { error } = await updateBusinessTopLevel(fresh.id, {
      name: preset.businessName,
      settings: applyPresetSettings(fresh.settings, preset),
    })
    if (error) {
      setApplying(null)
      setMessage({ kind: "error", text: error })
      return
    }

    // The greeting/sidebar show whoever is logged in, not the business
    // settings — without this the header keeps saying "Dr. Rajesh Kumar"
    // no matter which niche is active. Only touches the account doing the
    // switch, so it's the presenter's own name that follows the persona.
    const ownerName = preset.settings.business_owner
    if (ownerName && ownerName !== profile.fullName) {
      await updateProfile(ownerName)
    }

    let note = ""
    if (refreshData) {
      const regen = await regenerateDemoWeek()
      note = regen.error ? ` Demo data wasn't refreshed: ${regen.error}` : ` ${regen.created} demo calls regenerated to match.`
    }
    await Promise.all(QUERY_KEYS.map(queryKey => queryClient.invalidateQueries({ queryKey })))
    setApplying(null)
    setMessage({ kind: "ok", text: `Switched to ${preset.label}: ${preset.businessName}.${note}` })
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 960 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.4px", marginBottom: 4 }}>Demo Niche</h1>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", maxWidth: 640 }}>
          Admin only. Turns this account into a different kind of business in one click: name, receptionist,
          services and prices, hours, FAQs, and how the AI talks and handles calls. The next Talk to Assistant or
          Demo call uses it immediately.
        </p>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--foreground)", cursor: "pointer", width: "fit-content" }}>
        <input type="checkbox" checked={refreshData} onChange={e => setRefreshData(e.target.checked)} className="accent-foreground" />
        Also regenerate this week's demo calls to match the niche
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {NICHE_PRESETS.map(preset => {
          const Icon = ICONS[preset.id]
          const isCurrent = current === preset.id
          const isApplying = applying === preset.id
          return (
            <div key={preset.id} className="ios-card" style={{
              padding: 18, display: "flex", flexDirection: "column", gap: 12,
              borderColor: isCurrent ? "var(--foreground)" : undefined,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  background: isCurrent ? "var(--foreground)" : "var(--muted)",
                  color: isCurrent ? "var(--background)" : "var(--foreground)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={16} strokeWidth={1.75} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em" }}>{preset.label}</p>
                  <p style={{ fontSize: 12, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {preset.businessName} · {preset.settings.receptionist_name}
                  </p>
                </div>
                {isCurrent && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(16,185,129,0.12)", color: "#059669", whiteSpace: "nowrap" }}>
                    Active
                  </span>
                )}
              </div>

              <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.5, flex: 1 }}>{preset.pitch}</p>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {preset.settings.service_details?.slice(0, 4).map(s => (
                  <span key={s.name} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "var(--muted)", color: "var(--muted-foreground)" }}>
                    {s.name}
                  </span>
                ))}
              </div>

              <button type="button" onClick={() => apply(preset)} disabled={applying !== null || isCurrent}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  height: 34, borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                  border: isCurrent ? "1px solid var(--border)" : "none",
                  background: isCurrent ? "transparent" : "var(--foreground)",
                  color: isCurrent ? "var(--muted-foreground)" : "var(--background)",
                  cursor: isCurrent ? "default" : applying ? "wait" : "pointer",
                  opacity: applying !== null && !isApplying ? 0.5 : 1,
                }}>
                {isApplying ? <><Loader2 size={14} className="animate-spin" /> Switching…</>
                  : isCurrent ? <><Check size={14} /> Current niche</>
                  : `Switch to ${preset.label}`}
              </button>
            </div>
          )
        })}
      </div>

      {message && (
        <p style={{ fontSize: 13, color: message.kind === "ok" ? "#059669" : "#DC2626" }}>{message.text}</p>
      )}

      <p style={{ fontSize: 12, color: "var(--muted-foreground)", maxWidth: 640 }}>
        Kept as-is when switching: model and voice config, scheduling mode, Google Calendar, demo autofill and
        notification numbers. Browser demo calls pick up the new niche right away; real phone calls use the
        separately deployed phone assistant.
      </p>
    </div>
  )
}
