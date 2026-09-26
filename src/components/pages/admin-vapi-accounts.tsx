import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getVapiAccounts,
  createVapiAccount,
  updateVapiAccount,
  deleteVapiAccount,
  setActiveVapiAccount,
} from "@/lib/api"
import { useAuth } from "@/lib/auth"
import type { VapiAccount } from "@/lib/types"
import { ShieldAlert, Eye, EyeOff, Trash2, Zap, Plus } from "lucide-react"

const inputStyle: React.CSSProperties = {
  padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--card)", color: "var(--foreground)", fontSize: 13, fontFamily: "inherit",
}

function mask(key: string): string {
  if (key.length <= 8) return "••••••••"
  return `${key.slice(0, 4)}••••${key.slice(-4)}`
}

function StatusBadge({ status }: { status: VapiAccount["status"] }) {
  const map = {
    active: { bg: "rgba(16,185,129,0.12)", fg: "#059669", label: "Active" },
    exhausted: { bg: "rgba(229,72,77,0.1)", fg: "#DC2626", label: "Exhausted" },
    disabled: { bg: "var(--muted)", fg: "var(--muted-foreground)", label: "Disabled" },
  }[status]
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: map.bg, color: map.fg }}>
      {map.label}
    </span>
  )
}

function AccountRow({ account }: { account: VapiAccount }) {
  const queryClient = useQueryClient()
  const [showKeys, setShowKeys] = useState(false)
  const [balance, setBalance] = useState(account.balance_usd?.toString() ?? "")
  const [saving, setSaving] = useState(false)

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["vapi-accounts"] })
    await queryClient.invalidateQueries({ queryKey: ["active-vapi-key"] })
  }

  async function handleBalanceBlur() {
    const num = balance === "" ? null : Number(balance)
    if (num === account.balance_usd) return
    setSaving(true)
    await updateVapiAccount(account.id, { balance_usd: num })
    setSaving(false)
    await invalidate()
  }

  async function handleSetActive() {
    await setActiveVapiAccount(account.id)
    await invalidate()
  }

  async function handleMarkExhausted() {
    await updateVapiAccount(account.id, { status: "exhausted", is_active: false })
    await invalidate()
  }

  async function handleDelete() {
    if (!confirm(`Remove "${account.label}"? This can't be undone.`)) return
    await deleteVapiAccount(account.id)
    await invalidate()
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
      border: "1px solid var(--border)", borderRadius: 10,
      background: account.is_active ? "rgba(16,185,129,0.05)" : "var(--card)",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{account.label}</span>
          {account.is_active && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#059669", letterSpacing: "0.02em" }}>● IN USE</span>}
          <StatusBadge status={account.status} />
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", fontFamily: "ui-monospace, monospace", display: "flex", gap: 10 }}>
          <span>pub: {showKeys ? account.public_key : mask(account.public_key)}</span>
          {account.private_key && <span>priv: {showKeys ? account.private_key : mask(account.private_key)}</span>}
          <button type="button" onClick={() => setShowKeys(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex", alignItems: "center" }} aria-label={showKeys ? "Hide keys" : "Show keys"}>
            {showKeys ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>$</span>
        <input
          style={{ ...inputStyle, width: 70, padding: "5px 6px" }}
          type="number" step="0.01" placeholder="0.00"
          value={balance}
          onChange={e => setBalance(e.target.value)}
          onBlur={handleBalanceBlur}
        />
        {saving && <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>…</span>}
      </div>

      {!account.is_active && (
        <button type="button" onClick={handleSetActive} title="Use this account"
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "var(--foreground)", color: "var(--background)", border: "none", cursor: "pointer" }}>
          <Zap size={12} /> Use this
        </button>
      )}
      {account.status !== "exhausted" && (
        <button type="button" onClick={handleMarkExhausted} title="Mark exhausted"
          style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "transparent", color: "var(--muted-foreground)", border: "1px solid var(--border)", cursor: "pointer" }}>
          Mark exhausted
        </button>
      )}
      <button type="button" onClick={handleDelete} aria-label="Delete account"
        style={{ padding: 7, borderRadius: 8, background: "transparent", border: "1px solid var(--border)", color: "#DC2626", cursor: "pointer", display: "flex" }}>
        <Trash2 size={13} />
      </button>
    </div>
  )
}

function AddAccountForm({ onAdded }: { onAdded: () => void }) {
  const [label, setLabel] = useState("")
  const [publicKey, setPublicKey] = useState("")
  const [privateKey, setPrivateKey] = useState("")
  const [balance, setBalance] = useState("10")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    if (!label.trim() || !publicKey.trim()) { setError("Label and public key are required"); return }
    setSaving(true); setError(null)
    const { error: e } = await createVapiAccount({
      label: label.trim(),
      public_key: publicKey.trim(),
      private_key: privateKey.trim() || undefined,
      balance_usd: balance === "" ? undefined : Number(balance),
    })
    setSaving(false)
    if (e) { setError(e); return }
    setLabel(""); setPublicKey(""); setPrivateKey(""); setBalance("10")
    onAdded()
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <input style={inputStyle} placeholder="Label (e.g. trial-account-3)" value={label} onChange={e => setLabel(e.target.value)} />
        <input style={inputStyle} placeholder="Starting balance ($)" type="number" step="0.01" value={balance} onChange={e => setBalance(e.target.value)} />
        <input style={inputStyle} placeholder="Public key" value={publicKey} onChange={e => setPublicKey(e.target.value)} />
        <input style={inputStyle} placeholder="Private key (optional)" value={privateKey} onChange={e => setPrivateKey(e.target.value)} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" onClick={handleAdd} disabled={saving}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600, background: "var(--foreground)", color: "var(--background)", border: "none", cursor: saving ? "wait" : "pointer", opacity: saving ? 0.6 : 1 }}>
          <Plus size={14} /> Add account
        </button>
        {error && <span style={{ fontSize: 12, color: "#DC2626" }}>{error}</span>}
      </div>
    </div>
  )
}

export default function AdminVapiAccountsPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const { data: accounts, isLoading } = useQuery({ queryKey: ["vapi-accounts"], queryFn: getVapiAccounts })

  if (profile.role !== "admin") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "80px 20px", color: "var(--muted-foreground)" }}>
        <ShieldAlert size={28} strokeWidth={1.5} />
        <p style={{ fontSize: 14 }}>You don't have access to this page.</p>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 880 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.4px", marginBottom: 4 }}>Vapi Accounts</h1>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
          Admin only. Vapi has no API for balance, so update the $ field yourself from{" "}
          <a href="https://dashboard.vapi.ai/org/billing/credits" target="_blank" rel="noreferrer" style={{ color: "var(--foreground)" }}>
            dashboard.vapi.ai/org/billing/credits
          </a>. "Use this" switches which account the Talk-to-Assistant test call and this admin panel run against.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {isLoading && <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>Loading…</span>}
        {!isLoading && accounts?.length === 0 && (
          <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>No accounts yet. Add one below.</span>
        )}
        {accounts?.map(a => <AccountRow key={a.id} account={a} />)}
      </div>

      <AddAccountForm onAdded={() => queryClient.invalidateQueries({ queryKey: ["vapi-accounts"] })} />
    </div>
  )
}
