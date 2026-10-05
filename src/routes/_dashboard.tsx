import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { DashboardShell } from "@/components/dashboard/shell";
import { useAuth } from "@/lib/auth";
import { isGuest, useGuestNiche } from "@/lib/guest/session";

// Guests only get the product pages, never the internal tools or account settings.
const GUEST_BLOCKED = ["/admin", "/settings"];

export const Route = createFileRoute("/_dashboard")({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.user) {
      if (!isGuest()) throw redirect({ to: "/login" });
      if (GUEST_BLOCKED.some(p => location.pathname.startsWith(p))) throw redirect({ to: "/" });
      return;
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
  const guestNiche = useGuestNiche();
  const navigate = useNavigate();

  // Handle logout while on dashboard (auth state changes after initial load)
  useEffect(() => {
    if (!isLoading && !user && !guestNiche) {
      navigate({ to: "/login" });
    }
  }, [user, guestNiche, isLoading, navigate]);

  // Handle must-change-password flag set mid-session (e.g. PASSWORD_RECOVERY event).
  useEffect(() => {
    if (!isLoading && user && mustChangePassword) {
      navigate({ to: "/reset-password" });
    }
  }, [user, isLoading, mustChangePassword, navigate]);

  if (!user && !guestNiche) return null;

  return (
    <DashboardShell>
      <Outlet />
    </DashboardShell>
  );
}
