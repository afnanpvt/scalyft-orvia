import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

// Top-level route (not under _auth) because Supabase's reset link puts the user
// into a recovery session before they land here. _auth would redirect them away.
export const Route = createFileRoute("/reset-password")({
  component: () => (
    <div className="min-h-screen bg-background">
      <ResetPasswordForm />
    </div>
  ),
});
