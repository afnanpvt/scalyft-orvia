import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/30">
          AI Front Desk
        </p>
      </div>

      {/* Form — minimal, no card wrapper */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label
            htmlFor="email"
            className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/40 mb-2 block"
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
            className="w-full h-11 rounded-none border-0 border-b border-border/40 bg-transparent px-0 text-[15px] text-foreground placeholder:text-muted-foreground/25 focus:border-foreground focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/40 mb-2 block"
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
            className="w-full h-11 rounded-none border-0 border-b border-border/40 bg-transparent px-0 text-[15px] text-foreground placeholder:text-muted-foreground/25 focus:border-foreground focus:outline-none transition-colors"
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
      <p className="text-[11px] text-muted-foreground/30 mt-6 text-center">
        Forgot password?{" "}
        <a href="mailto:support@scalyft.tech" className="text-muted-foreground/50 hover:text-foreground transition-colors">
          Contact support@scalyft.tech
        </a>
      </p>

      {/* Footer */}
      <p className="text-[9px] font-medium uppercase tracking-[0.15em] text-muted-foreground/20 mt-16 text-center">
        Powered by Scalyft
      </p>
    </div>
  );
}
