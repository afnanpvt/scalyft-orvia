import { Link } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowRight, Check } from "lucide-react"
import DemoPage from "@/components/pages/demo"
import { OrviaLogo } from "@/components/brand/orvia-logo"
import { NICHE_PRESETS } from "@/lib/niche-presets"
import { endGuest, startGuest, useGuestNiche } from "@/lib/guest/session"

// The public voice demo. Pick a kind of business, then talk to its front desk.
// No account, no dashboard: the rest of the product stays behind sign-in.

export default function TryDemoPage() {
  const niche = useGuestNiche()
  const queryClient = useQueryClient()

  function choose(id: (typeof NICHE_PRESETS)[number]["id"]) {
    if (id === niche) return
    startGuest(id)
    // Cached queries belong to the previous business.
    queryClient.clear()
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--background)", color: "var(--foreground)" }}>
      <header style={{
        display: "flex", alignItems: "center", gap: 12, padding: "14px 20px",
        borderBottom: "1px solid var(--border)",
      }}>
        <Link to="/login" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "inherit", flex: 1 }}>
          <OrviaLogo size={24} style={{ color: "var(--foreground)" }} />
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.4px" }}>Orvia</span>
        </Link>
        {niche && (
          <button type="button" onClick={() => { endGuest(); queryClient.clear() }}
            style={{ fontSize: 13, color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            Change business
          </button>
        )}
        <Link to="/login" style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", textDecoration: "none" }}>
          Sign in
        </Link>
      </header>

      <main style={{ padding: "32px 20px 56px" }}>
        {niche ? (
          <DemoPage key={niche} />
        ) : (
          <div style={{ maxWidth: 560, margin: "0 auto" }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 6 }}>
              Hear your AI front desk answer a call
            </h1>
            <p style={{ fontSize: 14, color: "var(--muted-foreground)", marginBottom: 24 }}>
              Pick a kind of business, then talk to it with your microphone.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {NICHE_PRESETS.map(p => (
                <button key={p.id} type="button" onClick={() => choose(p.id)}
                  className="group"
                  style={{
                    display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: "pointer",
                    padding: "14px 16px", borderRadius: 16, border: "1px solid var(--border)",
                    background: "var(--card)", color: "var(--foreground)", fontFamily: "inherit",
                  }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>{p.label}</span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--muted-foreground)", marginTop: 2, lineHeight: 1.4 }}>{p.pitch}</span>
                  </span>
                  {niche === p.id ? <Check size={15} /> : <ArrowRight size={15} style={{ color: "var(--muted-foreground)" }} />}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
