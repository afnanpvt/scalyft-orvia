import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth")({
  beforeLoad: ({ context }) => {
    if (context.auth.user) {
      throw redirect({ to: "/" });
    }
  },
  component: () => (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Outlet />
    </div>
  ),
});
