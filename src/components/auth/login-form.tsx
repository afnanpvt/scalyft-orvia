import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [resetSent, setResetSent] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await signIn(email, password);
      if (result.error) {
        setError(result.error);
      } else {
        navigate({ to: "/" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) setError(err.message);
      else setResetSent(true);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-xs">
      {/* Brand — confident, not loud */}
      <div className="mb-12">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl font-semibold tracking-[-0.04em]">
            Orvia
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </div>
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/55">
          AI Front Desk
        </p>
      </div>

      {mode === "signin" ? (
        <>
          {/* Form — minimal, no card wrapper */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="email"
                className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65 mb-2 block"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@clinic.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full h-11 rounded-none border-0 border-b border-border/40 bg-transparent px-0 text-[15px] text-foreground placeholder:text-muted-foreground/70 focus:border-foreground focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65 mb-2 block"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full h-11 rounded-none border-0 border-b border-border/40 bg-transparent px-0 text-[15px] text-foreground placeholder:text-muted-foreground/70 focus:border-foreground focus:outline-none transition-colors"
              />
            </div>

            {error && (
              <p className="text-[12px] text-destructive">{error}</p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-2xl bg-foreground text-background text-[13px] font-medium cursor-pointer hover:opacity-85 transition-opacity disabled:opacity-40 mt-2"
            >
              {isLoading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {/* Forgot password */}
          <p className="text-[11px] text-muted-foreground/55 mt-6 text-center">
            Forgot password?{" "}
            <button
              type="button"
              onClick={() => { setMode("reset"); setError(null); setResetSent(false); }}
              className="text-muted-foreground/70 hover:text-foreground transition-colors underline underline-offset-2 cursor-pointer"
            >
              Reset it
            </button>
          </p>
        </>
      ) : (
        <>
          {resetSent ? (
            <p className="text-[13px] text-foreground text-center py-4">
              Check <span className="font-medium">{email}</span> for a reset link.
            </p>
          ) : (
            <form onSubmit={handleReset} className="space-y-6">
              <div>
                <label
                  htmlFor="reset-email"
                  className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65 mb-2 block"
                >
                  Email
                </label>
                <input
                  id="reset-email"
                  type="email"
                  placeholder="you@clinic.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                {isLoading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          <p className="text-[11px] text-muted-foreground/55 mt-6 text-center">
            <button
              type="button"
              onClick={() => { setMode("signin"); setError(null); setResetSent(false); }}
              className="text-muted-foreground/70 hover:text-foreground transition-colors underline underline-offset-2 cursor-pointer"
            >
              Back to sign in
            </button>
          </p>
        </>
      )}

      {/* Footer */}
      <p className="text-[9px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70 mt-16 text-center">
        Powered by Scalyft
      </p>
    </div>
  );
}
