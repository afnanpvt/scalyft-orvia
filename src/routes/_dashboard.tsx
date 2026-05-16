import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { DashboardShell } from "@/components/dashboard/shell";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_dashboard")({
  beforeLoad: ({ context }) => {
    // Only redirect if auth has fully resolved and there's no user
    if (!context.auth.isLoading && !context.auth.user) {
      throw redirect({ to: "/login" });
    }
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate({ to: "/login" });
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <DashboardShell>
      <Outlet />
    </DashboardShell>
  );
}
