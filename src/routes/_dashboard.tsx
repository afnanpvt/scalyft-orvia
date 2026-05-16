import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { DashboardShell } from "@/components/dashboard/shell";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_dashboard")({
  beforeLoad: ({ context }) => {
    if (!context.auth.user) {
      throw redirect({ to: "/login" });
    }
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  // Handle logout while on dashboard (auth state changes after initial load)
  useEffect(() => {
    if (!isLoading && !user) {
      navigate({ to: "/login" });
    }
  }, [user, isLoading, navigate]);

  if (!user) return null;

  return (
    <DashboardShell>
      <Outlet />
    </DashboardShell>
  );
}
