import { createFileRoute, redirect } from "@tanstack/react-router";
import TryDemoPage from "@/components/pages/try-demo";

// Public voice demo: talk to an Orvia front desk with no account. It shows
// nothing but the call itself; the dashboard stays behind sign-in.
export const Route = createFileRoute("/try")({
  beforeLoad: ({ context }) => {
    // Signed-in users have the same demo inside the dashboard.
    if (context.auth.user) throw redirect({ to: "/demo" });
  },
  component: TryDemoPage,
});
