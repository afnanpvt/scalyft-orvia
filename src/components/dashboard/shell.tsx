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
  User,
  ChevronDown,
  Check,
} from "lucide-react";

const navItems = [
  { label: "Overview", to: "/", icon: LayoutDashboard },
  { label: "Calls", to: "/calls", icon: Phone },
  { label: "Leads", to: "/leads", icon: UserPlus },
  { label: "Settings", to: "/settings", icon: Settings },
] as const;

// --- User Dropdown with inline profile edit ---

function UserDropdown() {
  const { profile, signOut, updateProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(profile.fullName ?? "");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
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

  // Sync name input when profile changes
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
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
      >
        <div className="size-7 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-semibold">
          {initials}
        </div>
        <span className="hidden sm:block text-[13px] font-medium text-foreground">
          {displayName}
        </span>
        <ChevronDown className={`size-3 text-muted-foreground/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-card border border-border/40 rounded-xl overflow-hidden z-50 shadow-lg shadow-black/5">
          {/* Profile section */}
          <div className="p-4 border-b border-border/20">
            {editing ? (
              <div className="space-y-3">
                <label className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/40 block">
                  Full Name
                </label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                  autoFocus
                  placeholder="Dr. Priya Sharma"
                  className="w-full border-0 border-b border-border/40 bg-transparent px-0 text-[14px] focus:border-foreground focus:outline-none transition-colors h-9"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveName}
                    disabled={saving || !nameInput.trim()}
                    className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-foreground text-background cursor-pointer hover:opacity-85 transition-opacity disabled:opacity-40"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setNameInput(profile.fullName ?? "");
                    }}
                    className="text-[11px] text-muted-foreground/50 hover:text-foreground cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[14px] font-medium">{displayName}</p>
                    <p className="text-[11px] text-muted-foreground/40 mt-0.5">
                      {profile.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="text-[10px] font-medium text-muted-foreground/40 hover:text-foreground cursor-pointer transition-colors uppercase tracking-[0.06em]"
                  >
                    Edit
                  </button>
                </div>
                {/* Role badge removed — unnecessary for single-user clinics */}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                signOut();
              }}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] text-muted-foreground/60 hover:text-foreground hover:bg-accent/30 transition-colors cursor-pointer"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main Shell ---

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);
  const { signOut } = useAuth();

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile bottom-sheet overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 bg-background rounded-t-2xl px-6 py-8 space-y-1"
            onClick={(e) => e.stopPropagation()}
          >
            {navItems.map(({ label, to, icon: Icon }) => {
              const isActive =
                to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMobileOpen(false)}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-xl
                    text-sm transition-colors
                    ${
                      isActive
                        ? "font-medium text-foreground bg-accent/30"
                        : "text-muted-foreground/50"
                    }
                  `}
                >
                  <Icon className="size-[15px]" />
                  {label}
                </Link>
              );
            })}

            <div className="pt-4 border-t border-border/20 mt-4">
              <button
                type="button"
                onClick={() => {
                  signOut();
                  setMobileOpen(false);
                }}
                className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground/50 hover:text-foreground transition-colors w-full"
              >
                <LogOut className="size-[15px]" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar — desktop only */}
      <aside className="hidden lg:flex w-56 flex-col bg-background">
        {/* Brand */}
        <div className="px-6 pt-8 pb-8">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-[-0.04em] text-foreground">
              Orvia
            </h1>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </div>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/30">
            AI Front Desk
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-0.5">
          {navItems.map(({ label, to, icon: Icon }) => {
            const isActive =
              to === "/" ? pathname === "/" : pathname.startsWith(to);

            return (
              <Link
                key={to}
                to={to}
                className={`
                  flex items-center gap-2.5 px-3 py-2
                  text-[13px] transition-colors duration-150
                  ${
                    isActive
                      ? "font-medium text-foreground border-l-2 border-foreground"
                      : "text-muted-foreground/50 hover:text-muted-foreground border-l-2 border-transparent"
                  }
                `}
              >
                <Icon className="size-[15px]" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-6 pb-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/20">
            Powered by Scalyft
          </p>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar — user dropdown on right */}
        <div className="flex items-center justify-between h-12 px-4 lg:px-10 shrink-0">
          {/* Mobile hamburger */}
          <button
            type="button"
            className="lg:hidden rounded-lg p-2 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMobileOpen((prev) => !prev)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {/* Spacer on desktop */}
          <div className="hidden lg:block" />

          {/* User dropdown — always visible */}
          <UserDropdown />
        </div>

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="mx-auto w-full max-w-5xl px-6 py-6 lg:px-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
