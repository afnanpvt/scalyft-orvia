# Orvia Phase 1: Auth + Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the login page, auth flow, dashboard layout, and 4 core pages (overview, calls list, call detail, settings) — all wired to live Supabase data with RLS.

**Architecture:** Next.js 16 App Router with Supabase Auth (email+password). Server Components for data fetching, Client Components only where interactivity is needed (forms, realtime subscriptions). Dashboard uses a shared layout with sidebar navigation. All reads go through Supabase client with RLS — no custom API routes for dashboard reads.

**Tech Stack:** Next.js 16.2, React 19, Supabase SSR (@supabase/ssr), shadcn/ui, Tailwind CSS 4, Vitest, lucide-react icons

**Next.js 16 Breaking Change:** `params` is a `Promise` — always use `const { id } = await params` in page/layout components. The existing middleware and Supabase SSR setup already follows this pattern.

---

## File Structure

### New files to create:
```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx              # Login page (Client Component — form state)
│   │   └── layout.tsx                # Auth layout (centered, no sidebar)
│   ├── (dashboard)/
│   │   ├── layout.tsx                # Dashboard layout (sidebar + header + main)
│   │   ├── page.tsx                  # Overview/home (Server Component)
│   │   ├── calls/
│   │   │   ├── page.tsx              # Call list (Server Component)
│   │   │   └── [id]/
│   │   │       └── page.tsx          # Call detail (Server Component + Client transcript)
│   │   └── settings/
│   │       └── page.tsx              # Settings read-only (Server Component)
│   └── layout.tsx                    # Root layout (existing — update metadata)
├── components/
│   ├── auth/
│   │   └── login-form.tsx            # Login form (Client Component)
│   ├── dashboard/
│   │   ├── nav-items.ts              # Shared nav items constant (used by sidebar + header)
│   │   ├── sidebar.tsx               # Sidebar nav (Client Component — active state)
│   │   ├── header.tsx                # Top header with clinic name + logout
│   │   ├── stat-card.tsx             # Reusable stat card for overview
│   │   ├── call-list-table.tsx       # Call list table (Server Component)
│   │   ├── call-detail-view.tsx      # Call detail with transcript
│   │   ├── transcript-view.tsx       # Chat-bubble transcript (Client Component — collapsible)
│   │   └── mark-handled-button.tsx   # Mark call as handled (Client Component)
│   └── ui/                           # Existing shadcn components
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # Existing browser client
│   │   ├── server.ts                 # Existing server client
│   │   └── middleware.ts             # Existing middleware helper
│   ├── types.ts                      # Existing types
│   └── queries.ts                    # Server-side Supabase query functions
└── middleware.ts                      # Existing — no changes needed
```

### Existing files to modify:
```
src/app/layout.tsx                     # Update metadata to "Orvia"
src/app/page.tsx                       # Replace boilerplate — redirect to dashboard
```

---

## Task 1: Login Page

**Files:**
- Create: `src/app/(auth)/layout.tsx`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/components/auth/login-form.tsx`
- Test: `src/components/auth/__tests__/login-form.test.tsx`

- [ ] **Step 1: Write the failing test for login form**

```typescript
// src/components/auth/__tests__/login-form.test.tsx
import { describe, it, expect, vi } from "vitest";

// We test the form renders correctly and calls the action
describe("LoginForm", () => {
  it("should export a LoginForm component", async () => {
    const mod = await import("../login-form");
    expect(mod.LoginForm).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/auth/__tests__/login-form.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create the auth layout**

```tsx
// src/app/(auth)/layout.tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Create the login form component**

```tsx
// src/components/auth/login-form.tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Orvia</CardTitle>
        <CardDescription>
          Sign in to your clinic dashboard
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="doctor@clinic.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Create the login page**

```tsx
// src/app/(auth)/login/page.tsx
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return <LoginForm />;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/components/auth/__tests__/login-form.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/\(auth\) src/components/auth
git commit -m "feat: add login page with Supabase email+password auth"
```

---

## Task 2: Update Root Layout + Redirect Home to Dashboard

**Files:**
- Modify: `src/app/layout.tsx` (line 15-18: metadata)
- Modify: `src/app/page.tsx` (replace entirely)

- [ ] **Step 1: Update root layout metadata**

In `src/app/layout.tsx`, change the metadata:
```tsx
export const metadata: Metadata = {
  title: "Orvia - AI Front Desk",
  description: "AI-powered receptionist for dental clinics",
};
```

- [ ] **Step 2: Delete the boilerplate home page**

Delete `src/app/page.tsx` — the `(dashboard)/page.tsx` created in Task 5 will own the `/` route.

```bash
git rm src/app/page.tsx
```

- [ ] **Step 3: Verify the app compiles**

Run: `npx next build 2>&1 | head -20`
Note: Build may warn about missing `/` page — expected until Task 5.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: update metadata to Orvia, remove boilerplate home page"
```

---

## Task 3: Server-Side Query Functions

**Files:**
- Create: `src/lib/queries.ts`
- Test: `src/lib/__tests__/queries.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/queries.test.ts
import { describe, it, expect } from "vitest";

describe("queries module", () => {
  it("should export query functions", async () => {
    const mod = await import("../queries");
    expect(mod.getOverviewStats).toBeDefined();
    expect(mod.getRecentCalls).toBeDefined();
    expect(mod.getCallById).toBeDefined();
    expect(mod.getClinicSettings).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/queries.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement query functions**

```typescript
// src/lib/queries.ts
import { createClient } from "@/lib/supabase/server";
import type { Call, Lead, Appointment, Clinic } from "@/lib/types";

export async function getUserClinicId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("id", user.id)
    .single();

  return data?.clinic_id ?? null;
}

export async function getOverviewStats() {
  const supabase = await createClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const [callsRes, leadsRes, appointmentsRes] = await Promise.all([
    supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayISO),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayISO),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayISO),
  ]);

  return {
    callsToday: callsRes.count ?? 0,
    leadsToday: leadsRes.count ?? 0,
    appointmentsToday: appointmentsRes.count ?? 0,
  };
}

export async function getRecentCalls(limit = 15): Promise<Call[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calls")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getRecentCalls error:", error);
    return [];
  }
  return (data as Call[]) ?? [];
}

export async function getCalls(
  page = 1,
  pageSize = 20
): Promise<{ calls: Call[]; total: number }> {
  const supabase = await createClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("calls")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("getCalls error:", error);
    return { calls: [], total: 0 };
  }
  return { calls: (data as Call[]) ?? [], total: count ?? 0 };
}

export async function getCallById(id: string): Promise<Call | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calls")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("getCallById error:", error);
    return null;
  }
  return data as Call;
}

export async function getLeadByCallId(
  callId: string
): Promise<Lead | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("*")
    .eq("call_id", callId)
    .maybeSingle();

  return (data as Lead) ?? null;
}

export async function getAppointmentByCallId(
  callId: string
): Promise<Appointment | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("appointments")
    .select("*")
    .eq("call_id", callId)
    .maybeSingle();

  return (data as Appointment) ?? null;
}

export async function getClinicSettings(): Promise<Clinic | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: userRow } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("id", user.id)
    .single();

  if (!userRow) return null;

  const { data: clinic } = await supabase
    .from("clinics")
    .select("*")
    .eq("id", userRow.clinic_id)
    .single();

  return (clinic as Clinic) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/queries.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries.ts src/lib/__tests__
git commit -m "feat: add server-side Supabase query functions for dashboard"
```

---

## Task 4: Dashboard Layout (Sidebar + Header)

**Files:**
- Create: `src/app/(dashboard)/layout.tsx`
- Create: `src/components/dashboard/sidebar.tsx`
- Create: `src/components/dashboard/header.tsx`

- [ ] **Step 1: Create shared nav items constant**

```tsx
// src/components/dashboard/nav-items.ts
import { Phone, LayoutDashboard, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isNavActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
```

- [ ] **Step 2: Create the sidebar component**

```tsx
// src/components/dashboard/sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navItems, isNavActive } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 border-r bg-sidebar md:block">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Orvia
        </Link>
      </div>
      <nav className="flex flex-col gap-1 p-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/"
              ? pathname === "/"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isNavActive(href, pathname)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 3: Create the header component**

```tsx
// src/components/dashboard/header.tsx
"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { navItems, isNavActive } from "./nav-items";

export function Header({ clinicName }: { clinicName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="relative flex h-14 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-3">
        <button
          className="md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-medium text-muted-foreground">
          {clinicName}
        </span>
      </div>
      <Button variant="ghost" size="sm" onClick={handleLogout}>
        <LogOut className="mr-2 h-4 w-4" />
        Sign out
      </Button>
      {mobileMenuOpen && (
        <nav className="fixed left-0 top-14 z-50 w-full border-b bg-background p-2 shadow-md md:hidden">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                isNavActive(href, pathname)
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
```

- [ ] **Step 3: Create the dashboard layout**

```tsx
// src/app/(dashboard)/layout.tsx
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { getClinicSettings } from "@/lib/queries";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clinic = await getClinicSettings();
  const clinicName = clinic?.name ?? "Orvia Dashboard";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header clinicName={clinicName} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify the app compiles**

Run: `npx next build 2>&1 | head -30`
Expected: No import errors

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/layout.tsx src/components/dashboard/nav-items.ts src/components/dashboard/sidebar.tsx src/components/dashboard/header.tsx
git commit -m "feat: add dashboard layout with sidebar and header"
```

---

## Task 5: Overview Page (Home)

**Files:**
- Create: `src/components/dashboard/stat-card.tsx`
- Create: `src/app/(dashboard)/page.tsx` (this overrides the redirect — move redirect logic)

Wait — the root `page.tsx` redirects to `/calls`. The overview page lives at `/` inside the `(dashboard)` group. Let me reconsider: the `(dashboard)` route group means `src/app/(dashboard)/page.tsx` renders at `/`. The root `src/app/page.tsx` would conflict. We need to remove the root page.tsx and let the `(dashboard)` group own `/`.

**Revised approach:** Delete `src/app/page.tsx` (replaced by `src/app/(dashboard)/page.tsx`).

- [ ] **Step 1: Create stat card component**

```tsx
// src/components/dashboard/stat-card.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create overview page**

```tsx
// src/app/(dashboard)/page.tsx
import { getOverviewStats, getRecentCalls } from "@/lib/queries";
import { StatCard } from "@/components/dashboard/stat-card";
import { Phone, UserPlus, CalendarCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function OverviewPage() {
  const [stats, recentCalls] = await Promise.all([
    getOverviewStats(),
    getRecentCalls(10),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Overview</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Calls Today" value={stats.callsToday} icon={Phone} />
        <StatCard title="Leads Captured" value={stats.leadsToday} icon={UserPlus} />
        <StatCard
          title="Appointments Booked"
          value={stats.appointmentsToday}
          icon={CalendarCheck}
        />
      </div>
      <div>
        <h2 className="mb-3 text-lg font-semibold">Recent Calls</h2>
        {recentCalls.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No calls yet. Once your AI receptionist handles calls, they will appear here.
          </p>
        ) : (
          <div className="space-y-2">
            {recentCalls.map((call) => (
              <Link
                key={call.id}
                href={`/calls/${call.id}`}
                className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">
                    {call.caller_phone ?? "Unknown"}
                  </span>
                  <span className="text-xs text-muted-foreground line-clamp-1">
                    {call.summary ?? "No summary available"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {call.outcome && (
                    <Badge variant="secondary" className="text-xs">
                      {call.outcome.replace("_", " ")}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {call.duration_secs ? `${Math.ceil(call.duration_secs / 60)}m` : "—"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the app compiles**

Run: `npx next build 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/page.tsx src/components/dashboard/stat-card.tsx
git commit -m "feat: add overview page with stat cards and recent calls"
```

---

## Task 6: Calls List Page

**Files:**
- Create: `src/app/(dashboard)/calls/page.tsx`
- Create: `src/components/dashboard/call-list-table.tsx`

- [ ] **Step 1: Create the call list table component**

```tsx
// src/components/dashboard/call-list-table.tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Call } from "@/lib/types";

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function outcomeColor(outcome: Call["outcome"]): string {
  switch (outcome) {
    case "appointment_booked":
      return "default";
    case "lead_captured":
      return "secondary";
    case "transferred":
      return "outline";
    default:
      return "secondary";
  }
}

export function CallListTable({ calls }: { calls: Call[] }) {
  if (calls.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No calls yet.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Caller</TableHead>
          <TableHead className="hidden sm:table-cell">Duration</TableHead>
          <TableHead className="hidden md:table-cell">Summary</TableHead>
          <TableHead>Outcome</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {calls.map((call) => (
          <TableRow key={call.id} className="cursor-pointer">
            <TableCell>
              <Link href={`/calls/${call.id}`} className="block">
                {formatTime(call.created_at)}
              </Link>
            </TableCell>
            <TableCell>
              <Link href={`/calls/${call.id}`} className="block">
                {call.caller_phone ?? "Unknown"}
              </Link>
            </TableCell>
            <TableCell className="hidden sm:table-cell">
              {call.duration_secs
                ? `${Math.floor(call.duration_secs / 60)}:${String(call.duration_secs % 60).padStart(2, "0")}`
                : "—"}
            </TableCell>
            <TableCell className="hidden max-w-xs truncate md:table-cell">
              {call.summary ?? "—"}
            </TableCell>
            <TableCell>
              {call.outcome ? (
                <Badge variant={outcomeColor(call.outcome) as "default" | "secondary" | "outline"}>
                  {call.outcome.replace("_", " ")}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Create the calls page**

```tsx
// src/app/(dashboard)/calls/page.tsx
import { getCalls } from "@/lib/queries";
import { CallListTable } from "@/components/dashboard/call-list-table";

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10));
  const pageSize = 20;

  const { calls, total } = await getCalls(page, pageSize);
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Calls</h1>
      <CallListTable calls={calls} />
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} calls)
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/calls?page=${page - 1}`}
                className="rounded border px-3 py-1 text-sm hover:bg-muted"
              >
                Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/calls?page=${page + 1}`}
                className="rounded border px-3 py-1 text-sm hover:bg-muted"
              >
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify the app compiles**

Run: `npx next build 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/calls/page.tsx src/components/dashboard/call-list-table.tsx
git commit -m "feat: add paginated calls list page"
```

---

## Task 7: Call Detail Page

**Files:**
- Create: `src/app/(dashboard)/calls/[id]/page.tsx`
- Create: `src/components/dashboard/call-detail-view.tsx`
- Create: `src/components/dashboard/transcript-view.tsx`
- Create: `src/components/dashboard/mark-handled-button.tsx`

- [ ] **Step 1: Create the mark-as-handled button component**

```tsx
// src/components/dashboard/mark-handled-button.tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export function MarkHandledButton({ callId }: { callId: string }) {
  const [handled, setHandled] = useState(false);
  const [loading, setLoading] = useState(false);

  async function markHandled() {
    setLoading(true);
    const supabase = createClient();

    // Update the call's extracted_data to include handled flag
    const { error } = await supabase
      .from("calls")
      .update({
        extracted_data: { handled: true, handled_at: new Date().toISOString() },
      })
      .eq("id", callId);

    if (!error) {
      setHandled(true);
    }
    setLoading(false);
  }

  if (handled) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <Check className="h-3.5 w-3.5" /> Handled
      </span>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={markHandled}
      disabled={loading}
    >
      <Check className="mr-1 h-3.5 w-3.5" />
      {loading ? "Saving..." : "Mark as Handled"}
    </Button>
  );
}
```

- [ ] **Step 2: Create the transcript view component**

```tsx
// src/components/dashboard/transcript-view.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { TranscriptTurn } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TranscriptView({
  transcript,
}: {
  transcript: TranscriptTurn[] | null;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!transcript || transcript.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No transcript available.
      </p>
    );
  }

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setExpanded(!expanded)}
        className="mb-2"
      >
        {expanded ? (
          <>
            <ChevronUp className="mr-1 h-4 w-4" /> Hide transcript
          </>
        ) : (
          <>
            <ChevronDown className="mr-1 h-4 w-4" /> Show transcript ({transcript.length} turns)
          </>
        )}
      </Button>
      {expanded && (
        <div className="space-y-2">
          {transcript.map((turn, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                turn.role === "assistant"
                  ? "bg-muted text-foreground"
                  : "ml-auto bg-primary text-primary-foreground"
              )}
            >
              <span className="mb-1 block text-xs font-medium opacity-70">
                {turn.role === "assistant" ? "Orvia" : "Caller"}
              </span>
              {turn.content}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the call detail view component**

```tsx
// src/components/dashboard/call-detail-view.tsx
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TranscriptView } from "./transcript-view";
import { MarkHandledButton } from "./mark-handled-button";
import type { Call, Lead, Appointment } from "@/lib/types";
import { Phone, Clock, Calendar } from "lucide-react";

export function CallDetailView({
  call,
  lead,
  appointment,
}: {
  call: Call;
  lead: Lead | null;
  appointment: Appointment | null;
}) {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Call Summary</span>
            {call.outcome && (
              <Badge>{call.outcome.replace("_", " ")}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            {call.summary ?? "No summary available."}
          </p>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" />
              {call.caller_phone ?? "Unknown"}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {call.duration_secs
                ? `${Math.floor(call.duration_secs / 60)}m ${call.duration_secs % 60}s`
                : "—"}
            </span>
            {call.language_detected && (
              <span>
                Language: {call.language_detected === "hi" ? "Hindi" : "English"}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {call.caller_phone && (
              <a
                href={`tel:${call.caller_phone}`}
                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                <Phone className="h-3.5 w-3.5" /> Call Back
              </a>
            )}
            <MarkHandledButton callId={call.id} />
          </div>
        </CardContent>
      </Card>

      {/* Lead info */}
      {lead && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Patient Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{lead.name ?? "—"}</dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{lead.phone}</dd>
              <dt className="text-muted-foreground">Service</dt>
              <dd>{lead.service_needed ?? "—"}</dd>
              <dt className="text-muted-foreground">Urgency</dt>
              <dd>
                <Badge
                  variant={
                    lead.urgency === "emergency" || lead.urgency === "urgent"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {lead.urgency}
                </Badge>
              </dd>
              {lead.notes && (
                <>
                  <dt className="text-muted-foreground">Notes</dt>
                  <dd>{lead.notes}</dd>
                </>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Appointment */}
      {appointment && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" /> Appointment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Date & Time</dt>
              <dd>
                {new Date(appointment.scheduled_start).toLocaleString(
                  "en-IN",
                  {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }
                )}
              </dd>
              <dt className="text-muted-foreground">Service</dt>
              <dd>{appointment.service_type ?? "—"}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <Badge variant="secondary">{appointment.status}</Badge>
              </dd>
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Recording */}
      {call.recording_url && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recording</CardTitle>
          </CardHeader>
          <CardContent>
            <a
              href={call.recording_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary underline"
            >
              Listen to recording
            </a>
          </CardContent>
        </Card>
      )}

      {/* Transcript */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transcript</CardTitle>
        </CardHeader>
        <CardContent>
          <TranscriptView transcript={call.transcript} />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Create the call detail page**

```tsx
// src/app/(dashboard)/calls/[id]/page.tsx
import { notFound } from "next/navigation";
import { getCallById, getLeadByCallId, getAppointmentByCallId } from "@/lib/queries";
import { CallDetailView } from "@/components/dashboard/call-detail-view";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const call = await getCallById(id);

  if (!call) {
    notFound();
  }

  const [lead, appointment] = await Promise.all([
    getLeadByCallId(call.id),
    getAppointmentByCallId(call.id),
  ]);

  return (
    <div className="space-y-4">
      <Link
        href="/calls"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to calls
      </Link>
      <CallDetailView call={call} lead={lead} appointment={appointment} />
    </div>
  );
}
```

- [ ] **Step 5: Verify the app compiles**

Run: `npx next build 2>&1 | head -30`

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/calls/\[id\] src/components/dashboard/call-detail-view.tsx src/components/dashboard/transcript-view.tsx src/components/dashboard/mark-handled-button.tsx
git commit -m "feat: add call detail page with transcript, lead, appointment, and mark-as-handled"
```

---

## Task 8: Settings Page (Read-Only)

**Files:**
- Create: `src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Create the settings page**

```tsx
// src/app/(dashboard)/settings/page.tsx
import { getClinicSettings } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function SettingsPage() {
  const clinic = await getClinicSettings();

  if (!clinic) {
    return <p className="text-sm text-muted-foreground">Unable to load settings.</p>;
  }

  const { settings } = clinic;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Clinic Information</CardTitle>
          <CardDescription>
            Contact Scalyft to update your clinic settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-muted-foreground">Clinic Name</dt>
              <dd className="mt-1">{clinic.name}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Status</dt>
              <dd className="mt-1 capitalize">{clinic.status}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Phone (Display)</dt>
              <dd className="mt-1">{clinic.phone_display ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Timezone</dt>
              <dd className="mt-1">{clinic.timezone}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Hours</dt>
              <dd className="mt-1">{settings.hours ?? "10am-7pm Mon-Sat"}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Services</dt>
              <dd className="mt-1">
                {settings.services?.join(", ") ?? "General dental services"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-medium text-muted-foreground">Greeting</dt>
              <dd className="mt-1">
                {settings.greeting ?? "Default greeting"}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Emergency Number</dt>
              <dd className="mt-1">{settings.emergency_number ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Transfer Number</dt>
              <dd className="mt-1">{settings.transfer_number ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Languages</dt>
              <dd className="mt-1">
                {settings.languages?.join(", ") ?? "Hindi, English"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            To change your password or update your email, contact{" "}
            <a href="mailto:support@scalyft.tech" className="text-primary underline">
              support@scalyft.tech
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify the app compiles**

Run: `npx next build 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/settings/page.tsx
git commit -m "feat: add read-only settings page"
```

---

## Task 9: Seed Script for Development Testing

**Files:**
- Create: `scripts/seed-dev-data.mjs`

This script creates a test clinic + user so we can verify the dashboard works.

- [ ] **Step 1: Create the seed script**

```javascript
// scripts/seed-dev-data.mjs
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seed() {
  console.log("Creating test clinic...");

  const { data: clinic, error: clinicErr } = await supabase
    .from("clinics")
    .upsert(
      {
        slug: "dr-demo-dental",
        name: "Dr. Demo's Dental Clinic",
        phone_display: "+919876543210",
        timezone: "Asia/Kolkata",
        status: "active",
        settings: {
          greeting:
            "Namaste! Dr. Demo's Dental Clinic mein aapka swagat hai.",
          hours: "10am-7pm Mon-Sat",
          services: [
            "Cleaning",
            "Filling",
            "Root Canal",
            "Extraction",
            "Braces",
            "Cosmetic",
          ],
          languages: ["hi", "en"],
          emergency_number: "+919876543210",
          transfer_number: "+919876543210",
        },
      },
      { onConflict: "slug" }
    )
    .select()
    .single();

  if (clinicErr) {
    console.error("Clinic creation failed:", clinicErr);
    process.exit(1);
  }

  console.log("Clinic created:", clinic.id);

  // Create auth user
  const testEmail = "demo@orvia.dev";
  const testPassword = "demo1234";

  const { data: authUser, error: authErr } =
    await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });

  if (authErr && !authErr.message.includes("already been registered")) {
    console.error("Auth user creation failed:", authErr);
    process.exit(1);
  }

  const userId =
    authUser?.user?.id ??
    (
      await supabase.auth.admin.listUsers().then((r) =>
        r.data.users.find((u) => u.email === testEmail)
      )
    )?.id;

  if (!userId) {
    console.error("Could not get user ID");
    process.exit(1);
  }

  // Link user to clinic
  const { error: userErr } = await supabase.from("users").upsert(
    {
      id: userId,
      clinic_id: clinic.id,
      email: testEmail,
      full_name: "Dr. Demo",
      role: "owner",
    },
    { onConflict: "id" }
  );

  if (userErr) {
    console.error("User link failed:", userErr);
    process.exit(1);
  }

  // Seed some calls
  const callOutcomes = [
    "appointment_booked",
    "lead_captured",
    "info_given",
    "transferred",
    null,
  ];

  for (let i = 0; i < 8; i++) {
    const startedAt = new Date(
      Date.now() - i * 3600000 - Math.random() * 1800000
    );
    const duration = Math.floor(60 + Math.random() * 240);
    const endedAt = new Date(startedAt.getTime() + duration * 1000);
    const outcome = callOutcomes[i % callOutcomes.length];

    await supabase.from("calls").insert({
      clinic_id: clinic.id,
      vapi_call_id: `demo_call_${Date.now()}_${i}`,
      caller_phone: `+9198765${String(43210 + i).slice(-5)}`,
      language_detected: i % 3 === 0 ? "hi" : "en",
      status: "completed",
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_secs: duration,
      summary: [
        "Patient called about tooth pain, needs emergency appointment.",
        "Patient inquired about teeth cleaning, appointment booked for Thursday.",
        "Patient asked about clinic hours and services available.",
        "Patient transferred to clinic for braces consultation.",
        "Patient called about root canal pricing.",
        "Patient needs extraction, urgent appointment requested.",
        "Follow-up call about ongoing treatment.",
        "New patient inquiry about cosmetic dentistry.",
      ][i],
      outcome,
      transcript: [
        {
          role: "assistant",
          content: "Namaste! Dr. Demo's Dental Clinic mein aapka swagat hai.",
        },
        { role: "user", content: "Mujhe appointment chahiye." },
        {
          role: "assistant",
          content: "Bilkul! Kya service chahiye aapko?",
        },
        { role: "user", content: "Tooth pain hai, urgent hai." },
      ],
      cost_cents: Math.floor(10 + Math.random() * 30),
    });
  }

  // Seed some leads
  for (let i = 0; i < 3; i++) {
    await supabase.from("leads").insert({
      clinic_id: clinic.id,
      name: ["Rahul Sharma", "Priya Patel", "Amit Kumar"][i],
      phone: `+9198765${String(43215 + i).slice(-5)}`,
      service_needed: ["Tooth pain", "Cleaning", "Braces consultation"][i],
      urgency: ["urgent", "routine", "inquiry"][i],
      status: "new",
    });
  }

  // Seed an appointment
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 30, 0, 0);

  await supabase.from("appointments").insert({
    clinic_id: clinic.id,
    patient_name: "Priya Patel",
    patient_phone: "+919876543216",
    service_type: "Cleaning",
    scheduled_start: tomorrow.toISOString(),
    status: "confirmed",
  });

  console.log("\nSeed complete!");
  console.log(`Login: ${testEmail} / ${testPassword}`);
  console.log(`Clinic: ${clinic.name} (${clinic.id})`);
  console.log("8 calls, 3 leads, 1 appointment seeded.");
}

seed().catch(console.error);
```

- [ ] **Step 2: Run the seed script**

Run: `node --env-file=.env.local scripts/seed-dev-data.mjs`
Expected: "Seed complete!" with login credentials printed

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-dev-data.mjs
git commit -m "feat: add dev seed script for test clinic data"
```

---

## Task 10: End-to-End Verification

- [ ] **Step 1: Build the project**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Start dev server and verify pages**

Run: `npm run dev`
Then manually verify:
- `/login` — shows login form
- Login with seed credentials — redirects to overview
- `/` — shows stat cards + recent calls
- `/calls` — shows paginated call list
- `/calls/[id]` — shows call detail with transcript
- `/settings` — shows clinic info (read-only)
- Sign out — redirects to login

- [ ] **Step 3: Commit any fixes**

If any adjustments were needed, commit them.

```bash
git add -A
git commit -m "fix: address issues found during e2e verification"
```
