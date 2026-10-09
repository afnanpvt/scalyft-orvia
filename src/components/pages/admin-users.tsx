import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ShieldAlert, Search } from "lucide-react"
import { getAdminUsers, setDemoExpiry, type AdminUserRow } from "@/lib/api"
import { useAuth } from "@/lib/auth"

function relative(iso: string | null): string {
  if (!iso) return "Never"
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const ROLE_STYLE: Record<string, { bg: string; fg: string }> = {
  admin: { bg: "rgba(99,102,241,0.12)", fg: "#4F46E5" },
  owner: { bg: "rgba(16,185,129,0.12)", fg: "#059669" },
  staff: { bg: "var(--muted)", fg: "var(--muted-foreground)" },
}

function Badge({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: bg, color: fg, whiteSpace: "nowrap" }}>
      {text}
    </span>
  )
}

// Shown beside the status: how long a demo login has left.
function demoLabel(iso: string | null): { text: string; ended: boolean } | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return { text: "Demo ended", ended: true }
  const days = Math.ceil(ms / 86_400_000)
  return { text: days <= 1 ? "Demo ends today" : `Demo ends in ${days}d`, ended: false }
}

const ACCESS_CHOICES: Array<{ value: string; label: string }> = [
  { value: "7", label: "Demo, 7 days" },
  { value: "14", label: "Demo, 14 days" },
  { value: "30", label: "Demo, 30 days" },
  { value: "full", label: "Full access" },
]

function statusOf(u: AdminUserRow): { text: string; bg: string; fg: string } {
  if (!u.role) return { text: "No profile", bg: "rgba(229,72,77,0.1)", fg: "#DC2626" }
  if (!u.last_sign_in_at) return { text: "Never signed in", bg: "rgba(245,158,11,0.12)", fg: "#B45309" }
  if (u.must_change_password) return { text: "Temp password", bg: "rgba(245,158,11,0.12)", fg: "#B45309" }
  return { text: "Active", bg: "rgba(16,185,129,0.12)", fg: "#059669" }
}

export default function AdminUsersPage() {
  const { profile } = useAuth()
  const [query, setQuery] = useState("")
  const queryClient = useQueryClient()
  const [accessError, setAccessError] = useState<string | null>(null)

  async function changeAccess(userId: string, choice: string) {
    setAccessError(null)
    const { error } = await setDemoExpiry(userId, choice === "full" ? null : Number(choice))
    if (error) setAccessError(error)
    await queryClient.invalidateQueries({ queryKey: ["admin-users"] })
  }

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: getAdminUsers,
    enabled: profile.role === "admin",
  })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(u =>
      [u.email, u.full_name, u.business_name, u.role].some(v => v?.toLowerCase().includes(q)),
    )
  }, [users, query])

  if (profile.role !== "admin") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "80px 20px", color: "var(--muted-foreground)" }}>
        <ShieldAlert size={28} strokeWidth={1.5} />
        <p style={{ fontSize: 14 }}>You don't have access to this page.</p>
      </div>
    )
  }

  const businessCount = new Set(users.map(u => u.business_id).filter(Boolean)).size

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.4px", marginBottom: 4 }}>Users</h1>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
            Everyone who can sign in, across all businesses. Passwords are stored hashed and can't be viewed by anyone.
          </p>
        </div>
        <div style={{ position: "relative" }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)" }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, email, business"
            style={{
              width: 260, padding: "8px 10px 8px 30px", borderRadius: 10, fontSize: 13, fontFamily: "inherit",
              border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", outline: "none",
            }} />
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>
        {isLoading ? "Loading…" : `${users.length} login${users.length === 1 ? "" : "s"} across ${businessCount} business${businessCount === 1 ? "" : "es"}`}
      </p>

      {error && <p style={{ fontSize: 13, color: "#DC2626" }}>Couldn't load users: {(error as Error).message}</p>}
      {accessError && <p style={{ fontSize: 13, color: "#DC2626" }}>Couldn't change access: {accessError}</p>}

      <div className="ios-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted-foreground)", fontSize: 11.5 }}>
                {["User", "Business", "Role", "Status", "Access", "Last sign-in", "Created"].map(h => (
                  <th key={h} style={{ padding: "11px 16px", fontWeight: 500, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const role = u.role ? ROLE_STYLE[u.role] ?? ROLE_STYLE.staff : null
                const status = statusOf(u)
                const isMe = !!profile.email && u.email === profile.email
                return (
                  <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "12px 16px", minWidth: 0 }}>
                      <p style={{ fontWeight: 600, color: "var(--foreground)" }}>
                        {u.full_name || "—"}
                        {isMe && <span style={{ fontWeight: 500, color: "var(--muted-foreground)", marginLeft: 6 }}>(you)</span>}
                      </p>
                      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 1 }}>{u.email}</p>
                    </td>
                    <td style={{ padding: "12px 16px", color: u.business_name ? "var(--foreground)" : "var(--muted-foreground)" }}>
                      {u.business_name ?? "—"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {role && u.role ? <Badge text={u.role} bg={role.bg} fg={role.fg} /> : "—"}
                    </td>
                    <td style={{ padding: "12px 16px" }}><Badge {...status} /></td>
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      {u.role === "admin" || isMe ? (
                        <span style={{ color: "var(--muted-foreground)" }}>Full access</span>
                      ) : (
                        <>
                          {(() => {
                            const demo = demoLabel(u.demo_expires_at)
                            return demo
                              ? <Badge text={demo.text} bg={demo.ended ? "rgba(229,72,77,0.1)" : "rgba(245,158,11,0.12)"} fg={demo.ended ? "#DC2626" : "#B45309"} />
                              : <span style={{ color: "var(--muted-foreground)" }}>Full access</span>
                          })()}
                          <select aria-label={`Change access for ${u.email}`} value="" onChange={e => { if (e.target.value) void changeAccess(u.id, e.target.value) }}
                            style={{
                              marginLeft: 8, fontSize: 12, padding: "3px 6px", borderRadius: 8, fontFamily: "inherit",
                              border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)",
                            }}>
                            <option value="">Change…</option>
                            {ACCESS_CHOICES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        </>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}
                      title={u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : undefined}>
                      {relative(u.last_sign_in_at)}
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}
                      title={new Date(u.created_at).toLocaleString()}>
                      {relative(u.created_at)}
                    </td>
                  </tr>
                )
              })}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={7} style={{ padding: "28px 16px", textAlign: "center", color: "var(--muted-foreground)" }}>No users match "{query}"</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
