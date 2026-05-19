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
} from "lucide-react";

const NAV_MAIN = [
  { label: "Overview", to: "/", icon: LayoutDashboard },
  { label: "Calls", to: "/calls", icon: Phone },
  { label: "Leads", to: "/leads", icon: UserPlus },
] as const;

const NAV_OTHER = [
  { label: "Settings", to: "/settings", icon: Settings },
] as const;

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
        setOpen(false);
        setEditing(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    setNameInput(profile.fullName ?? "");
  }, [profile.fullName]);

  const displayName = profile.fullName || profile.email?.split("@")[0] || "User";
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  async function handleSaveName() {
    if (!nameInput.trim()) return;
    setSaving(true);
    await updateProfile(nameInput.trim());
    setSaving(false);
    setEditing(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          width: "100%",
          padding: "10px 12px",
          borderRadius: "10px",
          transition: "background 0.15s",
          cursor: "pointer",
          background: "transparent",
          border: "none",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(60,60,67,0.06)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <div style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "#1C1C1E",
          color: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 600,
          flexShrink: 0,
          fontFamily: "var(--font-mono)",
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: "#1C1C1E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
            {displayName}
          </p>
          <p style={{ fontSize: 10, color: "#8E8E93", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3, fontFamily: "var(--font-mono)" }}>
            {profile.email}
          </p>
        </div>
        {open
          ? <ChevronUp style={{ width: 12, height: 12, color: "#8E8E93", flexShrink: 0 }} />
          : <ChevronDown style={{ width: 12, height: 12, color: "#8E8E93", flexShrink: 0 }} />
        }
      </button>

      {open && (
        <div style={{
          position: "absolute",
          bottom: "100%",
          left: 0,
          right: 0,
          marginBottom: 4,
          background: "#FFFFFF",
          borderRadius: 12,
          overflow: "hidden",
          zIndex: 50,
          boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
        }}>
          <div style={{ padding: "12px 14px", borderBottom: "0.5px solid rgba(60,60,67,0.12)" }}>
            {editing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                  autoFocus
                  placeholder="Your name"
                  style={{
                    width: "100%",
                    border: "none",
                    borderBottom: "1px solid rgba(60,60,67,0.2)",
                    background: "transparent",
                    fontSize: 13,
                    padding: "4px 0",
                    outline: "none",
                    color: "#1C1C1E",
                  }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleSaveName}
                    disabled={saving || !nameInput.trim()}
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      padding: "4px 12px",
                      borderRadius: 6,
                      background: "#1C1C1E",
                      color: "#FFFFFF",
                      border: "none",
                      cursor: saving ? "not-allowed" : "pointer",
                      opacity: saving || !nameInput.trim() ? 0.4 : 1,
                    }}
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditing(false); setNameInput(profile.fullName ?? ""); }}
                    style={{ fontSize: 11, color: "#8E8E93", border: "none", background: "transparent", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#636366" }}>{profile.email}</span>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  style={{ fontSize: 11, fontWeight: 500, color: "#007AFF", border: "none", background: "transparent", cursor: "pointer" }}
                >
                  Edit name
                </button>
              </div>
            )}
          </div>
          <div style={{ padding: 4 }}>
            <button
              type="button"
              onClick={() => { setOpen(false); signOut(); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                fontSize: 13,
                color: "#FF3B30",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,59,48,0.06)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <LogOut style={{ width: 14, height: 14 }} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);
  const { signOut } = useAuth();

  return (
    <div style={{ display: "flex", height: "100vh", background: "#F2F2F7" }}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.2)" }}
          className="lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              background: "#F2F2F7",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: "24px 16px",
              boxShadow: "0 -4px 32px rgba(0,0,0,0.12)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {[...NAV_MAIN, ...NAV_OTHER].map(({ label, to, icon: Icon }) => {
              const isActive = to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMobileOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? "#1C1C1E" : "#636366",
                    background: isActive ? "#FFFFFF" : "transparent",
                    marginBottom: 2,
                    textDecoration: "none",
                  }}
                >
                  <Icon style={{ width: 16, height: 16, color: isActive ? "#007AFF" : "#8E8E93" }} />
                  {label}
                </Link>
              );
            })}
            <div style={{ paddingTop: 12, marginTop: 8, borderTop: "0.5px solid rgba(60,60,67,0.12)" }}>
              <button
                type="button"
                onClick={() => { signOut(); setMobileOpen(false); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  fontSize: 14,
                  color: "#FF3B30",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                <LogOut style={{ width: 16, height: 16 }} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside
        className="hidden lg:flex"
        style={{
          width: 216,
          flexShrink: 0,
          flexDirection: "column",
          background: "#F2F2F7",
          borderRight: "0.5px solid rgba(60,60,67,0.08)",
        }}
      >
        {/* Brand */}
        <div style={{ padding: "28px 20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span
              className="animate-live-pulse"
              style={{ width: 6, height: 6, borderRadius: "50%", background: "#34C759", flexShrink: 0 }}
            />
            <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.4px", color: "#1C1C1E" }}>
              Orvia
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "0 10px", overflowY: "auto" }}>
          <div style={{ marginBottom: 2 }}>
            {NAV_MAIN.map(({ label, to, icon: Icon }) => {
              const isActive = to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "8px 10px",
                    borderRadius: 9,
                    fontSize: 13.5,
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? "#1C1C1E" : "#636366",
                    background: isActive ? "#FFFFFF" : "transparent",
                    marginBottom: 1,
                    textDecoration: "none",
                    boxShadow: isActive
                      ? "0 1px 2px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(60,60,67,0.06)"
                      : "none",
                    transition: "background 0.18s cubic-bezier(0.16,1,0.3,1), color 0.18s cubic-bezier(0.16,1,0.3,1)",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(60,60,67,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <Icon style={{ width: 15, height: 15, color: isActive ? "#007AFF" : "#AEAEB2", flexShrink: 0 }} />
                  {label}
                </Link>
              );
            })}
          </div>

          <div style={{ marginTop: 20, paddingTop: 20, borderTop: "0.5px solid rgba(60,60,67,0.08)" }}>
            {NAV_OTHER.map(({ label, to, icon: Icon }) => {
              const isActive = pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "8px 10px",
                    borderRadius: 9,
                    fontSize: 13.5,
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? "#1C1C1E" : "#636366",
                    background: isActive ? "#FFFFFF" : "transparent",
                    marginBottom: 1,
                    textDecoration: "none",
                    boxShadow: isActive
                      ? "0 1px 2px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(60,60,67,0.06)"
                      : "none",
                    transition: "background 0.18s cubic-bezier(0.16,1,0.3,1)",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(60,60,67,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <Icon style={{ width: 15, height: 15, color: isActive ? "#007AFF" : "#AEAEB2", flexShrink: 0 }} />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User pinned at bottom */}
        <div style={{ padding: "10px", borderTop: "0.5px solid rgba(60,60,67,0.08)" }}>
          <UserDropdown />
        </div>
      </aside>

      {/* Main content */}
      <div style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden" }}>
        {/* Mobile top bar */}
        <div
          className="flex lg:hidden"
          style={{
            alignItems: "center",
            justifyContent: "space-between",
            height: 48,
            padding: "0 16px",
            background: "#F2F2F7",
            boxShadow: "0 0.5px 0 rgba(60,60,67,0.12)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34C759" }} />
            <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.3px", color: "#1C1C1E" }}>Orvia</span>
          </div>
          <button
            type="button"
            style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: "#636366" }}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X style={{ width: 20, height: 20 }} /> : <Menu style={{ width: 20, height: 20 }} />}
          </button>
        </div>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 36px" }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
