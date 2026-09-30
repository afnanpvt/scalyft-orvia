import { useState, useRef, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { getBusinessBilling } from "@/lib/api";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { OrviaLogo } from "@/components/brand/orvia-logo";
import { ToastProvider, useAppointmentBookedToasts } from "@/components/dashboard/toast-provider";
import { HoverTip, agentStatusCopy } from "@/components/dashboard/hover-tip";
import {
  LayoutDashboard,
  Phone,
  UserPlus,
  Settings,
  LogOut,
  ChevronDown,
  ChevronUp,
  Bot,
  Calendar,
  Search,
  AlertTriangle,
  Sliders,
  KeyRound,
  Pencil,
  Database,
  Users,
  Shuffle,
  ShieldCheck,
  ChevronRight,
  Sparkles,
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

// Mac shows the familiar ⌘K; elsewhere a single "/" keycap (also bound)
// reads cleaner than "Ctrl K".
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const NAV_MAIN = [
  { label: "Overview", to: "/", icon: LayoutDashboard },
  { label: "Demo", to: "/demo", icon: Sparkles },
  { label: "Calls", to: "/calls", icon: Phone },
  { label: "Appointments", to: "/appointments", icon: Calendar },
  { label: "Leads", to: "/leads", icon: UserPlus },
] as const;

const NAV_OTHER = [
  { label: "Settings", to: "/settings", icon: Settings },
] as const;

// Internal tools — only rendered for role=admin, grouped under a collapsible
// "Admin" section so they read as ours, not part of the customer product.
const NAV_ADMIN = [
  { label: "Demo Niche", to: "/admin/niche", icon: Shuffle },
  { label: "Users", to: "/admin/users", icon: Users },
  { label: "Demo Data", to: "/admin/demo-data", icon: Database },
  { label: "Model Config", to: "/admin/model-config", icon: Sliders },
  { label: "Vapi Accounts", to: "/admin/vapi-accounts", icon: KeyRound },
  { label: "Gemini Spike", to: "/admin/gemini-spike", icon: Sparkles },
] as const;

type AdminNavEntry = (typeof NAV_ADMIN)[number];

function AdminNavGroup({ pathname, renderItem }: {
  pathname: string;
  renderItem: (item: AdminNavEntry) => React.ReactNode;
}) {
  const inAdmin = pathname.startsWith("/admin");
  const [open, setOpen] = useState<boolean>(() => {
    try { return inAdmin || localStorage.getItem("orvia-admin-nav-open") === "1"; } catch { return inAdmin; }
  });

  useEffect(() => { if (inAdmin) setOpen(true); }, [inAdmin]);

  function toggle() {
    setOpen(v => {
      try { localStorage.setItem("orvia-admin-nav-open", v ? "0" : "1"); } catch { /* storage unavailable */ }
      return !v;
    });
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--sidebar-border)" }}>
      <button type="button" onClick={toggle} aria-expanded={open} className="sidebar-link"
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          padding: "6px 12px", marginBottom: 2, borderRadius: 8,
          background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
          color: "var(--muted-foreground)",
        }}>
        <ShieldCheck style={{ width: 13, height: 13, flexShrink: 0 }} strokeWidth={1.75} />
        <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>Admin</span>
        <span style={{
          fontSize: 9.5, fontWeight: 600, padding: "1px 6px", borderRadius: 999,
          background: "var(--accent)", border: "1px solid var(--sidebar-border)", letterSpacing: "0.02em",
        }}>
          Internal
        </span>
        <ChevronRight style={{
          width: 12, height: 12, marginLeft: "auto", flexShrink: 0,
          transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s",
        }} strokeWidth={1.75} />
      </button>
      {open && <div>{NAV_ADMIN.map(renderItem)}</div>}
    </div>
  );
}

// Bridge component — useAppointmentBookedToasts needs ToastProvider's context,
// which isn't available in DashboardShell itself since it renders the provider.
function BookingToastsBridge() {
  useAppointmentBookedToasts();
  return null;
}

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
      <button type="button" onClick={() => setOpen(v => !v)} className="user-menu-trigger"
        aria-expanded={open} aria-haspopup="menu"
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "8px 10px", borderRadius: 12, cursor: "pointer",
          background: open ? "var(--accent)" : "transparent", border: "none", outline: "none",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--accent)")}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = "transparent" }}
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
          position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0,
          background: "var(--popover)", borderRadius: 14, overflow: "hidden", zIndex: 50,
          boxShadow: "0 8px 40px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)",
          border: "1px solid var(--border)",
        }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", minWidth: 0 }}>
            {editing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditing(false) }}
                  autoFocus placeholder="Your name"
                  style={{
                    width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                    background: "var(--card)", fontSize: 13, padding: "6px 9px",
                    outline: "none", color: "var(--foreground)", fontFamily: "inherit",
                  }} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={handleSaveName} disabled={saving || !nameInput.trim()}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 8,
                      background: "var(--foreground)", color: "var(--background)", border: "none",
                      cursor: saving ? "not-allowed" : "pointer", opacity: saving || !nameInput.trim() ? 0.4 : 1,
                    }}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => { setEditing(false); setNameInput(profile.fullName ?? ""); }}
                    style={{ fontSize: 12, padding: "5px 10px", borderRadius: 8, color: "var(--muted-foreground)", border: "none", background: "transparent", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {displayName}
                </p>
                <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {profile.email}
                </p>
              </>
            )}
          </div>
          {!editing && (
            <div style={{ padding: 4 }}>
              <MenuItem icon={Pencil} label="Edit name" onClick={() => setEditing(true)} />
              <MenuItem icon={LogOut} label="Sign out" danger onClick={() => { setOpen(false); signOut(); }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: {
  icon: React.ElementType
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button type="button" onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 9, width: "100%",
        padding: "8px 10px", borderRadius: 9, fontSize: 13, whiteSpace: "nowrap",
        color: danger ? "#E5484D" : "var(--foreground)",
        border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit",
        transition: "background 0.15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = danger ? "rgba(229,72,77,0.08)" : "var(--accent)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <Icon style={{ width: 14, height: 14, flexShrink: 0, color: danger ? "#E5484D" : "var(--muted-foreground)" }} strokeWidth={1.75} />
      {label}
    </button>
  );
}

// ─── Nav Item ─────────────────────────────────────────

function NavItem({ label, to, icon: Icon, pathname }: { label: string; to: string; icon: React.ElementType; pathname: string }) {
  const isActive = to === "/" ? pathname === "/" : pathname.startsWith(to);
  return (
    <Link to={to} className="sidebar-link"
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
  // Must match the "clinicActive" derivation on the Overview page — not just
  // credits, but also business status and whether a phone number is provisioned.
  const notConfigured = billing?.status !== "active" || !billing?.vapi_phone_id;

  const statusDot = isExhausted || notConfigured ? "#E5484D" : isLow ? "#F59E0B" : "#10B981";
  const statusText = isExhausted ? "Paused" : notConfigured ? "Offline" : isLow ? "Low credit" : "Live";
  const statusColor = isExhausted || notConfigured ? "#DC2626" : isLow ? "#B45309" : "#059669";

  const tip = agentStatusCopy({
    hasPhone: !!billing?.vapi_phone_id,
    isActive: billing?.status === "active",
    exhausted: isExhausted,
    low: isLow,
  });

  return (
    <div style={{ padding: "0 10px 8px" }}>
      <HoverTip block placement="top" {...tip}>
      <div
        tabIndex={0}
        aria-label={`Assistant ${statusText.toLowerCase()}`}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px",
          background: "var(--accent)",
          border: "1px solid var(--sidebar-border)",
          borderRadius: 999,
          cursor: "help", outline: "none",
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
      </HoverTip>
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);
  const { signOut, profile } = useAuth();
  const isAdmin = profile.role === "admin";

  return (
    <ToastProvider>
    <BookingToastsBridge />
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
              <OrviaLogo size={30} style={{ color: "var(--foreground)", flexShrink: 0 }} />
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
            {isAdmin && (
              <AdminNavGroup pathname={pathname} renderItem={({ label, to, icon: Icon }) => {
                const isActive = pathname.startsWith(to);
                return (
                  <Link key={to} to={to} onClick={() => setMobileOpen(false)} className="sidebar-link"
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
              }} />
            )}
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
            <OrviaLogo size={32} style={{ color: "var(--foreground)", flexShrink: 0 }} />
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
              fontSize: 10, fontWeight: 600, padding: "2px 5px", minWidth: 18, textAlign: "center",
              background: "var(--muted)", borderRadius: 4,
              color: "var(--muted-foreground)",
            }}>{IS_MAC ? "⌘K" : "/"}</kbd>
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
          {isAdmin && (
            <AdminNavGroup pathname={pathname} renderItem={item => <NavItem key={item.to} {...item} pathname={pathname} />} />
          )}
        </nav>

        {/* AI Agent status + minutes meter */}
        <AgentCard />

        {/* User */}
        <div style={{ padding: "6px 8px 12px", borderTop: "1px solid var(--sidebar-border)" }}>
          <UserDropdown />
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
            <OrviaLogo size={26} style={{ color: "var(--foreground)", flexShrink: 0 }} />
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
    </ToastProvider>
  );
}
