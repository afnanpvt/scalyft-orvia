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
        className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg hover:bg-sidebar-accent transition-colors cursor-pointer"
      >
        <div className="size-7 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-semibold shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[13px] font-medium text-foreground truncate leading-tight">{displayName}</p>
          <p className="text-[10px] text-muted-foreground/60 truncate leading-tight">{profile.email}</p>
        </div>
        {open ? (
          <ChevronUp className="size-3 text-muted-foreground/50 shrink-0" />
        ) : (
          <ChevronDown className="size-3 text-muted-foreground/50 shrink-0" />
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-xl overflow-hidden z-50 shadow-lg shadow-black/8">
          <div className="p-3 border-b border-border/60">
            {editing ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                  autoFocus
                  placeholder="Your name"
                  className="w-full border-0 border-b border-border/40 bg-transparent px-0 text-[13px] focus:border-foreground focus:outline-none transition-colors h-8"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveName}
                    disabled={saving || !nameInput.trim()}
                    className="text-[11px] font-medium px-3 py-1 rounded-md bg-foreground text-background cursor-pointer hover:opacity-85 disabled:opacity-40"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditing(false); setNameInput(profile.fullName ?? ""); }}
                    className="text-[11px] text-muted-foreground/60 hover:text-foreground cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground/70">{profile.email}</span>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-[11px] font-medium text-muted-foreground/60 hover:text-foreground cursor-pointer"
                >
                  Edit name
                </button>
              </div>
            )}
          </div>
          <div className="p-1">
            <button
              type="button"
              onClick={() => { setOpen(false); signOut(); }}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[13px] text-muted-foreground/70 hover:text-foreground hover:bg-accent/40 transition-colors cursor-pointer"
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

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);
  const { signOut } = useAuth();

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 bg-sidebar border-t border-sidebar-border rounded-t-2xl px-4 py-6 space-y-1"
            onClick={(e) => e.stopPropagation()}
          >
            {[...NAV_MAIN, ...NAV_OTHER].map(({ label, to, icon: Icon }) => {
              const isActive = to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors ${
                    isActive ? "font-medium text-foreground bg-sidebar-accent" : "text-muted-foreground/70 hover:text-foreground hover:bg-sidebar-accent/60"
                  }`}
                >
                  <Icon className="size-[15px]" />
                  {label}
                </Link>
              );
            })}
            <div className="pt-3 border-t border-sidebar-border mt-3">
              <button
                type="button"
                onClick={() => { signOut(); setMobileOpen(false); }}
                className="flex items-center gap-3 px-3 py-2.5 text-[13px] text-muted-foreground/70 hover:text-foreground w-full"
              >
                <LogOut className="size-[15px]" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="hidden lg:flex w-[220px] shrink-0 flex-col bg-sidebar border-r border-sidebar-border">
        {/* Brand */}
        <div className="px-5 pt-6 pb-5 border-b border-sidebar-border/60">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
            <h1 className="text-[15px] font-semibold tracking-[-0.03em] text-foreground">Orvia</h1>
          </div>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/50 ml-4">
            AI Front Desk
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/40 px-3 mb-1.5">
              Main menu
            </p>
            <div className="space-y-0.5">
              {NAV_MAIN.map(({ label, to, icon: Icon }) => {
                const isActive = to === "/" ? pathname === "/" : pathname.startsWith(to);
                return (
                  <Link
                    key={to}
                    to={to}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors duration-100 ${
                      isActive
                        ? "font-medium text-foreground bg-sidebar-accent"
                        : "text-muted-foreground/70 hover:text-foreground hover:bg-sidebar-accent/60"
                    }`}
                  >
                    <Icon className="size-[15px] shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/40 px-3 mb-1.5">
              Other
            </p>
            <div className="space-y-0.5">
              {NAV_OTHER.map(({ label, to, icon: Icon }) => {
                const isActive = pathname.startsWith(to);
                return (
                  <Link
                    key={to}
                    to={to}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors duration-100 ${
                      isActive
                        ? "font-medium text-foreground bg-sidebar-accent"
                        : "text-muted-foreground/70 hover:text-foreground hover:bg-sidebar-accent/60"
                    }`}
                  >
                    <Icon className="size-[15px] shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        {/* User — pinned at bottom */}
        <div className="px-3 pb-4 pt-3 border-t border-sidebar-border/60">
          <UserDropdown />
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="flex lg:hidden items-center justify-between h-12 px-4 border-b border-border/40 bg-background shrink-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-[15px] font-semibold tracking-[-0.03em]">Orvia</span>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-6 py-8 lg:px-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
