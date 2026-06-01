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
  const { user, isLoading, mustChangePassword } = useAuth();
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

  return (
    <DashboardShell>
      <Outlet />
    </DashboardShell>
  );
}
