import { useState, useRef, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  Phone,
  UserPlus,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronDown,
  ChevronUp,
  Bot,
  Zap,
} from "lucide-react";

const NAV_MAIN = [
  { label: "Overview", to: "/", icon: LayoutDashboard },
  { label: "Calls", to: "/calls", icon: Phone },
  { label: "Leads", to: "/leads", icon: UserPlus },
] as const;

const NAV_OTHER = [
  { label: "Settings", to: "/settings", icon: Settings },
] as const;

// ─── User Dropdown ────────────────────────────────────

function UserDropdown() {
  const { profile, signOut, updateProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(profile.fullName ?? "");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setEditing(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => { setNameInput(profile.fullName ?? ""); }, [profile.fullName]);

  const displayName = profile.fullName || profile.email?.split("@")[0] || "User";
  const initials = displayName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);

  async function handleSaveName() {
    if (!nameInput.trim()) return;
    setSaving(true);
    await updateProfile(nameInput.trim());
    setSaving(false); setEditing(false);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "8px 10px", borderRadius: 12, cursor: "pointer",
          background: "transparent", border: "none",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--accent)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        <div style={{
          width: 32, height: 32, borderRadius: "50%", background: "var(--foreground)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--background)", letterSpacing: "0.02em" }}>
            {initials}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3, letterSpacing: "-0.01em" }}>
            {displayName}
          </p>
          <p style={{ fontSize: 11, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
            {profile.email}
          </p>
        </div>
        {open
          ? <ChevronUp style={{ width: 12, height: 12, color: "var(--muted-foreground)", flexShrink: 0 }} strokeWidth={1.5} />
          : <ChevronDown style={{ width: 12, height: 12, color: "var(--muted-foreground)", flexShrink: 0 }} strokeWidth={1.5} />
        }
      </button>

      {open && (
        <div className="animate-scale-in" style={{
          position: "absolute", bottom: "100%", left: 0, right: 0, marginBottom: 6,
          background: "var(--popover)", borderRadius: 16, overflow: "hidden", zIndex: 50,
          boxShadow: "0 8px 40px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)",
          border: "1px solid var(--border)",
        }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
            {editing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSaveName()} autoFocus placeholder="Your name"
                  style={{
                    width: "100%", border: "none", borderBottom: "1px solid var(--border)",
                    background: "transparent", fontSize: 13, padding: "4px 0",
                    outline: "none", color: "var(--foreground)", fontFamily: "inherit",
                  }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={handleSaveName} disabled={saving || !nameInput.trim()}
                    style={{
                      fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 8,
                      background: "var(--foreground)", color: "var(--background)", border: "none",
                      cursor: saving ? "not-allowed" : "pointer", opacity: saving || !nameInput.trim() ? 0.4 : 1,
                    }}>
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button type="button" onClick={() => { setEditing(false); setNameInput(profile.fullName ?? ""); }}
                    style={{ fontSize: 11, color: "var(--muted-foreground)", border: "none", background: "transparent", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{profile.email}</span>
                <button type="button" onClick={() => setEditing(true)}
                  style={{ fontSize: 11, fontWeight: 500, color: "var(--foreground)", border: "none", background: "transparent", cursor: "pointer" }}>
                  Edit name
                </button>
              </div>
            )}
          </div>
          <div style={{ padding: 4 }}>
            <button type="button" onClick={() => { setOpen(false); signOut(); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "8px 10px", borderRadius: 10, fontSize: 13, color: "#E5484D",
                border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(229,72,77,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <LogOut style={{ width: 13, height: 13 }} strokeWidth={1.5} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Nav Item ─────────────────────────────────────────

function NavItem({ label, to, icon: Icon, pathname }: { label: string; to: string; icon: React.ElementType; pathname: string }) {
  const isActive = to === "/" ? pathname === "/" : pathname.startsWith(to);
  return (
    <Link to={to}
      style={{
        display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", borderRadius: 10,
        fontSize: 13.5, fontWeight: isActive ? 600 : 400,
        color: isActive ? "var(--foreground)" : "var(--muted-foreground)",
        background: isActive ? "var(--accent)" : "transparent",
        marginBottom: 1, textDecoration: "none",
        transition: "background 0.15s, color 0.15s",
        letterSpacing: "-0.01em", position: "relative",
      }}
      onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--foreground)"; } }}
      onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)"; } }}
    >
      {isActive && (
        <span style={{
          position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
          width: 3, height: 14, background: "var(--foreground)", borderRadius: "0 3px 3px 0",
        }} />
      )}
      <Icon style={{ width: 15, height: 15, color: isActive ? "var(--foreground)" : "var(--muted-foreground)", flexShrink: 0 }} strokeWidth={isActive ? 2 : 1.5} />
      {label}
    </Link>
  );
}

// ─── Shell ────────────────────────────────────────────

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);
  const { signOut } = useAuth();

  return (
    <div style={{ display: "flex", height: "100dvh", background: "var(--background)" }}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
          className="lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div className="animate-fade-up"
            style={{
              position: "absolute", left: 0, right: 0, bottom: 0,
              background: "var(--card)", borderTopLeftRadius: 24, borderTopRightRadius: 24,
              padding: "8px 12px 32px",
              boxShadow: "0 -8px 48px rgba(0,0,0,0.2)",
              border: "1px solid var(--border)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 36, height: 4, background: "var(--border)", borderRadius: 2, margin: "8px auto 20px" }} />
            {[...NAV_MAIN, ...NAV_OTHER].map(({ label, to, icon: Icon }) => {
              const isActive = to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <Link key={to} to={to} onClick={() => setMobileOpen(false)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14,
                    fontSize: 15, fontWeight: isActive ? 600 : 400,
                    color: isActive ? "var(--foreground)" : "var(--muted-foreground)",
                    background: isActive ? "var(--accent)" : "transparent",
                    marginBottom: 2, textDecoration: "none",
                  }}>
                  <Icon style={{ width: 18, height: 18, color: isActive ? "var(--foreground)" : "var(--muted-foreground)" }} strokeWidth={isActive ? 2 : 1.5} />
                  {label}
                </Link>
              );
            })}
            <div style={{ paddingTop: 12, marginTop: 8, borderTop: "1px solid var(--border)" }}>
              <button type="button" onClick={() => { signOut(); setMobileOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                  fontSize: 15, color: "#E5484D", background: "transparent", border: "none",
                  cursor: "pointer", width: "100%", fontFamily: "inherit",
                }}>
                <LogOut style={{ width: 18, height: 18 }} strokeWidth={1.5} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="hidden lg:flex" style={{
        width: 224, flexShrink: 0, flexDirection: "column",
        background: "var(--sidebar)", borderRight: "1px solid var(--sidebar-border)",
      }}>
        {/* Brand */}
        <div style={{ padding: "22px 20px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, background: "var(--foreground)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 6px rgba(0,0,0,0.2)",
            }}>
              <Zap style={{ width: 16, height: 16, color: "var(--background)" }} strokeWidth={2.5} />
            </div>
            <div>
              <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--foreground)", display: "block", lineHeight: 1.1 }}>
                Orvia
              </span>
              <span style={{ fontSize: 10, color: "var(--muted-foreground)", letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 500 }}>
                AI Receptionist
              </span>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "4px 10px", overflowY: "auto" }}>
          <div>
            {NAV_MAIN.map(item => <NavItem key={item.to} {...item} pathname={pathname} />)}
          </div>
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--sidebar-border)" }}>
            {NAV_OTHER.map(item => <NavItem key={item.to} {...item} pathname={pathname} />)}
          </div>
        </nav>

        {/* AI Agent status */}
        <div style={{ margin: "8px 10px" }}>
          <div style={{
            background: "var(--accent)", border: "1px solid var(--border)",
            borderRadius: 14, padding: 14,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Bot style={{ width: 13, height: 13, color: "var(--foreground)" }} strokeWidth={1.5} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em" }}>AI Agent</span>
              </div>
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "#D1FAE5", padding: "3px 9px", borderRadius: 999,
                border: "1px solid rgba(16,185,129,0.2)",
              }}>
                <span className="animate-live-pulse" style={{ width: 5, height: 5, borderRadius: "50%", background: "#10B981", flexShrink: 0, display: "block" }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#065F46", letterSpacing: "0.02em" }}>LIVE</span>
              </div>
            </div>
            <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", lineHeight: 1.5, marginBottom: 11 }}>
              Handling calls 24/7
            </p>
            <Link to="/settings"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "7px 0", borderRadius: 10, background: "var(--foreground)", color: "var(--background)",
                fontSize: 12, fontWeight: 600, textDecoration: "none", transition: "opacity 0.15s",
                letterSpacing: "-0.01em",
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = "0.8")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = "1")}
            >
              <Settings style={{ width: 11, height: 11 }} strokeWidth={2} />
              Configure
            </Link>
          </div>
        </div>

        {/* User */}
        <div style={{ padding: "8px 8px 14px", borderTop: "1px solid var(--sidebar-border)" }}>
          <UserDropdown />
        </div>
      </aside>

      {/* Main area */}
      <div style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden" }}>
        {/* Mobile top bar */}
        <div className="flex lg:hidden" style={{
          alignItems: "center", justifyContent: "space-between", height: 52, padding: "0 16px",
          background: "var(--card)", borderBottom: "1px solid var(--border)", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, background: "var(--foreground)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Zap style={{ width: 13, height: 13, color: "var(--background)" }} strokeWidth={2.5} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.4px", color: "var(--foreground)" }}>Orvia</span>
          </div>
          <button type="button" onClick={() => setMobileOpen(v => !v)}
            style={{
              padding: 7, borderRadius: 10, border: "1px solid var(--border)",
              background: "var(--card)", cursor: "pointer", color: "var(--muted-foreground)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            {mobileOpen ? <X style={{ width: 18, height: 18 }} strokeWidth={1.5} /> : <Menu style={{ width: 18, height: 18 }} strokeWidth={1.5} />}
          </button>
        </div>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: "auto", background: "var(--background)" }}>
          <div style={{ maxWidth: 1140, margin: "0 auto", padding: "32px 36px 48px" }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
