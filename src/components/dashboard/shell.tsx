import { useState, useRef, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { getBusinessBilling } from "@/lib/api";
import { CommandPalette } from "@/components/dashboard/command-palette";
import {
  LayoutDashboard,
  Phone,
  UserPlus,
  Settings,
  LogOut,
  ChevronDown,
  ChevronUp,
  Bot,
  Zap,
  Calendar,
  Search,
} from "lucide-react";

// ─── Animated Hamburger (21st.dev) ────────────────────────
// SVG morph: 3 lines → X using cubic-bezier spring transitions

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="pointer-events-none"
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path
        d="M4 12L20 12"
        className={[
          "origin-center transition-all duration-300",
          "[transition-timing-function:cubic-bezier(.5,.85,.25,1.1)]",
          open
            ? "translate-y-0 rotate-[315deg]"
            : "-translate-y-[7px] rotate-0",
        ].join(" ")}
      />
      <path
        d="M4 12H20"
        className={[
          "origin-center transition-all duration-300",
          "[transition-timing-function:cubic-bezier(.5,.85,.25,1.8)]",
          open ? "rotate-45" : "rotate-0",
        ].join(" ")}
      />
      <path
        d="M4 12H20"
        className={[
          "origin-center transition-all duration-300",
          "[transition-timing-function:cubic-bezier(.5,.85,.25,1.1)]",
          open
            ? "translate-y-0 rotate-[135deg]"
            : "translate-y-[7px] rotate-0",
        ].join(" ")}
      />
    </svg>
  );
}

const NAV_MAIN = [
  { label: "Overview", to: "/", icon: LayoutDashboard },
  { label: "Calls", to: "/calls", icon: Phone },
  { label: "Appointments", to: "/appointments", icon: Calendar },
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

// ─── Sidebar user row ────────────────────────────────
// User dropdown + inline sign-out icon button beside it.

function SidebarUserRow() {
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try { await signOut(); } finally { setSigningOut(false); }
  }

  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <UserDropdown />
      </div>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        aria-label="Sign out"
        title="Sign out"
        style={{
          width: 34, alignSelf: "center",
          height: 34, borderRadius: 10,
          background: "transparent", border: "1px solid var(--sidebar-border)",
          color: "var(--muted-foreground)", cursor: signingOut ? "wait" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, transition: "all 0.15s",
        }}
        onMouseEnter={e => {
          if (!signingOut) {
            (e.currentTarget as HTMLElement).style.background = "var(--accent)";
            (e.currentTarget as HTMLElement).style.color = "#E5484D";
          }
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)";
        }}
      >
        <LogOut size={13} strokeWidth={1.75} />
      </button>
    </div>
  );
}

// ─── Agent Card (sidebar) ─────────────────────────────
// Quiet, always-on status pill. Billing details live on /overview.

function AgentCard() {
  const { data: billing } = useQuery({
    queryKey: ["billing"],
    queryFn: getBusinessBilling,
    refetchInterval: 60_000,
  });

  const secs = billing?.seconds_remaining ?? null;
  const isExhausted = secs !== null && secs <= 0 && !billing?.allow_overage;
  const isLow = secs !== null && secs > 0 && secs <= 1800;

  const statusDot = isExhausted ? "#E5484D" : isLow ? "#F59E0B" : "#10B981";
  const statusText = isExhausted ? "Paused" : isLow ? "Low credit" : "Live";
  const statusColor = isExhausted ? "#DC2626" : isLow ? "#B45309" : "#059669";

  return (
    <div style={{ padding: "0 10px 8px" }}>
      <div
        aria-label={`Assistant ${statusText.toLowerCase()}`}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px",
          background: "var(--accent)",
          border: "1px solid var(--sidebar-border)",
          borderRadius: 999,
        }}
      >
        <span
          className={isExhausted ? undefined : "animate-live-pulse"}
          style={{ width: 6, height: 6, borderRadius: "50%", background: statusDot, flexShrink: 0, display: "block" }}
        />
        <span style={{ fontSize: 11.5, fontWeight: 600, color: statusColor, letterSpacing: "-0.01em" }}>
          {statusText}
        </span>
      </div>
    </div>
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
      {/* Mobile drawer - slides in from left */}
      <div
        className="lg:hidden"
        style={{
          position: "fixed", inset: 0, zIndex: 40,
          pointerEvents: mobileOpen ? "auto" : "none",
        }}
      >
        {/* Backdrop */}
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: "absolute", inset: 0,
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            opacity: mobileOpen ? 1 : 0,
            transition: "opacity 0.3s cubic-bezier(0.32,0.72,0,1)",
          }}
        />

        {/* Drawer panel */}
        <div
          style={{
            position: "absolute", top: 0, left: 0, bottom: 0,
            width: 260,
            background: "var(--sidebar)",
            borderRight: "1px solid var(--sidebar-border)",
            display: "flex", flexDirection: "column",
            transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 0.3s cubic-bezier(0.32,0.72,0,1)",
            willChange: "transform",
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Drawer header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 16px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 9, background: "var(--foreground)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <Zap style={{ width: 13, height: 13, color: "var(--background)" }} strokeWidth={2.5} />
              </div>
              <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.4px", color: "var(--foreground)" }}>Orvia</span>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-expanded={mobileOpen}
              aria-label="Close menu"
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: "var(--muted-foreground)", display: "flex" }}
            >
              <HamburgerIcon open={true} />
            </button>
          </div>

          {/* Nav links */}
          <nav style={{ flex: 1, padding: "4px 10px", overflowY: "auto" }}>
            <div>
              {NAV_MAIN.map(({ label, to, icon: Icon }) => {
                const isActive = to === "/" ? pathname === "/" : pathname.startsWith(to);
                return (
                  <Link key={to} to={to} onClick={() => setMobileOpen(false)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10,
                      fontSize: 14, fontWeight: isActive ? 600 : 400,
                      color: isActive ? "var(--foreground)" : "var(--muted-foreground)",
                      background: isActive ? "var(--accent)" : "transparent",
                      marginBottom: 2, textDecoration: "none", position: "relative",
                    }}>
                    {isActive && (
                      <span style={{
                        position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                        width: 3, height: 14, background: "var(--foreground)", borderRadius: "0 3px 3px 0",
                      }} />
                    )}
                    <Icon style={{ width: 16, height: 16, color: isActive ? "var(--foreground)" : "var(--muted-foreground)", flexShrink: 0 }} strokeWidth={isActive ? 2 : 1.5} />
                    {label}
                  </Link>
                );
              })}
            </div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--sidebar-border)" }}>
              {NAV_OTHER.map(({ label, to, icon: Icon }) => {
                const isActive = pathname.startsWith(to);
                return (
                  <Link key={to} to={to} onClick={() => setMobileOpen(false)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10,
                      fontSize: 14, fontWeight: isActive ? 600 : 400,
                      color: isActive ? "var(--foreground)" : "var(--muted-foreground)",
                      background: isActive ? "var(--accent)" : "transparent",
                      marginBottom: 2, textDecoration: "none",
                    }}>
                    <Icon style={{ width: 16, height: 16, color: isActive ? "var(--foreground)" : "var(--muted-foreground)", flexShrink: 0 }} strokeWidth={isActive ? 2 : 1.5} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Sign out */}
          <div style={{ padding: "12px 10px 32px", borderTop: "1px solid var(--sidebar-border)" }}>
            <button type="button" onClick={() => { signOut(); setMobileOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10,
                fontSize: 14, color: "#E5484D", background: "transparent", border: "none",
                cursor: "pointer", width: "100%", fontFamily: "inherit",
              }}>
              <LogOut style={{ width: 16, height: 16 }} strokeWidth={1.5} />
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="hidden lg:flex" style={{
        width: 220, flexShrink: 0, flexDirection: "column",
        background: "var(--sidebar)", borderRight: "1px solid var(--sidebar-border)",
      }}>
        {/* Brand */}
        <div style={{ padding: "20px 16px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9, background: "var(--foreground)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 8px rgba(0,0,0,0.18)",
            }}>
              <Zap style={{ width: 14, height: 14, color: "var(--background)" }} strokeWidth={2.5} />
            </div>
            <div style={{ lineHeight: 1 }}>
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.4px", color: "var(--foreground)", display: "block" }}>
                Orvia
              </span>
              <span style={{ fontSize: 10, color: "var(--muted-foreground)", letterSpacing: "0.03em", fontWeight: 500, opacity: 0.7 }}>
                AI Receptionist
              </span>
            </div>
          </div>
        </div>

        {/* Search trigger */}
        <div style={{ padding: "0 12px 8px" }}>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
            style={{
              display: "flex", alignItems: "center", gap: 9, width: "100%",
              padding: "7px 10px", borderRadius: 9,
              background: "var(--card)", border: "1px solid var(--sidebar-border)",
              color: "var(--muted-foreground)", cursor: "pointer",
              fontFamily: "inherit",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--accent)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--card)")}
            aria-label="Open search"
          >
            <Search size={13} strokeWidth={1.75} />
            <span style={{ fontSize: 12, letterSpacing: "-0.01em", flex: 1, textAlign: "left" }}>Search</span>
            <kbd style={{
              fontSize: 10, fontWeight: 600, padding: "2px 5px",
              background: "var(--muted)", borderRadius: 4,
              color: "var(--muted-foreground)",
            }}>⌘K</kbd>
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "2px 8px", overflowY: "auto" }}>
          <div>
            {NAV_MAIN.map(item => <NavItem key={item.to} {...item} pathname={pathname} />)}
          </div>
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--sidebar-border)" }}>
            {NAV_OTHER.map(item => <NavItem key={item.to} {...item} pathname={pathname} />)}
          </div>
        </nav>

        {/* AI Agent status + minutes meter */}
        <AgentCard />

        {/* User */}
        <div style={{ padding: "6px 8px 12px", borderTop: "1px solid var(--sidebar-border)" }}>
          <SidebarUserRow />
        </div>
      </aside>

      {/* Main area */}
      <div style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden" }}>
        {/* Mobile top bar - hamburger LEFT, logo right of it */}
        <div className="flex lg:hidden" style={{
          alignItems: "center", gap: 10, height: 52, padding: "0 16px",
          background: "var(--card)", borderBottom: "1px solid var(--border)", flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={() => setMobileOpen(v => !v)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            style={{
              padding: 6, borderRadius: 9, border: "none",
              background: "transparent", cursor: "pointer", color: "var(--foreground)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >
            <HamburgerIcon open={mobileOpen} />
          </button>
          <Link to="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", flex: 1 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 7, background: "var(--foreground)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Zap style={{ width: 12, height: 12, color: "var(--background)" }} strokeWidth={2.5} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.4px", color: "var(--foreground)" }}>Orvia</span>
          </Link>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
            aria-label="Search"
            style={{
              padding: 6, borderRadius: 9, border: "none",
              background: "transparent", cursor: "pointer", color: "var(--muted-foreground)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >
            <Search size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: "auto", background: "var(--background)" }}>
          <div style={{ maxWidth: 1140, margin: "0 auto", padding: "32px 36px 48px" }}>
            {children}
          </div>
        </main>
      </div>

      {/* Global cmd-K search */}
      <CommandPalette />
    </div>
  );
}
