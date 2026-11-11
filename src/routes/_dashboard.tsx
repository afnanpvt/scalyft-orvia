import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { DashboardShell } from "@/components/dashboard/shell";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_dashboard")({
  beforeLoad: ({ context }) => {
    if (!context.auth.user) {
      throw redirect({ to: "/login" });
    }
    // Users on a temp/recovery password must finish setting a real one
    // before they can touch the dashboard.
    if (context.auth.mustChangePassword) {
      throw redirect({ to: "/reset-password" });
    }
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  const { user, isLoading, mustChangePassword, hasNoAccess, signOut, profile } = useAuth();
  const navigate = useNavigate();

  // Handle logout while on dashboard (auth state changes after initial load)
  useEffect(() => {
    if (!isLoading && !user) {
      navigate({ to: "/login" });
    }
  }, [user, isLoading, navigate]);

  // Handle must-change-password flag set mid-session (e.g. PASSWORD_RECOVERY event).
  useEffect(() => {
    if (!isLoading && user && mustChangePassword) {
      navigate({ to: "/reset-password" });
    }
  }, [user, isLoading, mustChangePassword, navigate]);

  if (!user) return null;

  if (hasNoAccess) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>No access yet</h1>
          <p style={{ fontSize: 14, color: "var(--muted-foreground)", marginBottom: 16 }}>
            {profile.email ?? "This account"} isn't linked to a business. Ask your team admin to invite this exact email
            (Team tab in Settings), then sign in again.
          </p>
          <button onClick={() => signOut()} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", cursor: "pointer" }}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell>
      <Outlet />
    </DashboardShell>
  );
}
