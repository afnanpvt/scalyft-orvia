import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Also covers the case where the session is already established by the time this mounts
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setIsLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setIsLoading(false);
    if (err) setError(err.message);
    else setDone(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-xs">
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl font-semibold tracking-[-0.04em]">Orvia</span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </div>
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/55">
            Reset Password
          </p>
        </div>

        {done ? (
          <div className="space-y-6">
            <p className="text-[13px] text-foreground">Password updated.</p>
            <button
              type="button"
              onClick={() => navigate({ to: "/" })}
              className="w-full h-11 rounded-2xl bg-foreground text-background text-[13px] font-medium cursor-pointer hover:opacity-85 transition-opacity"
            >
              Continue to dashboard
            </button>
          </div>
        ) : !ready ? (
          <p className="text-[13px] text-muted-foreground">
            Open this page from the reset link in your email.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65 mb-2 block">
                New Password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full h-11 rounded-none border-0 border-b border-border/40 bg-transparent px-0 text-[15px] text-foreground placeholder:text-muted-foreground/70 focus:border-foreground focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65 mb-2 block">
                Confirm Password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="w-full h-11 rounded-none border-0 border-b border-border/40 bg-transparent px-0 text-[15px] text-foreground placeholder:text-muted-foreground/70 focus:border-foreground focus:outline-none transition-colors"
              />
            </div>
            {error && <p className="text-[12px] text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-2xl bg-foreground text-background text-[13px] font-medium cursor-pointer hover:opacity-85 transition-opacity disabled:opacity-40 mt-2"
            >
              {isLoading ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
