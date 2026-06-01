import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth")({
  beforeLoad: ({ context }) => {
    if (context.auth.user) {
      // If signed in but stuck on a temp password, send them to reset, not dashboard.
      if (context.auth.mustChangePassword) {
        throw redirect({ to: "/reset-password" });
      }
      throw redirect({ to: "/" });
    }
  },
  component: () => (
    <div className="min-h-screen bg-background">
      <Outlet />
    </div>
  ),
});
