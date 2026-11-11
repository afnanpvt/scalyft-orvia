import { useRef, useState, type FormEvent } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { AuthVisual } from "@/components/auth/auth-visual"
import { AuthShell, ErrorBanner, fadeUpStyle, useShake, useShellSequence } from "@/components/auth/auth-shell"

export function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const { signIn, signInWithOAuth } = useAuth()
  const navigate = useNavigate()

  const formReady = useShellSequence()
  const passwordRef = useRef<HTMLDivElement>(null)
  const shake = useShake(passwordRef)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      const result = await signIn(email, password)
      if (result.error) {
        setError(result.error)
        shake()
      } else {
        navigate({ to: "/" })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed")
      shake()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthShell
      visual={<AuthVisual />}
      heading="Sign in to Orvia"
      subheading="Your AI front desk is waiting"
    >
      <button
        type="button"
        onClick={async () => {
          setError(null)
          const r = await signInWithOAuth("google")
          if (r.error) setError(r.error)
        }}
        style={fadeUpStyle(formReady, 0)}
        className="w-full h-11 mb-6 rounded-2xl border border-border bg-transparent text-[13px] font-medium cursor-pointer hover:bg-muted/50 transition-colors inline-flex items-center justify-center gap-2"
      >
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/>
          <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.9-6.1z"/>
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
        </svg>
        Continue with Google
      </button>
      <p className="text-[11px] text-muted-foreground/55 -mt-3 mb-6 text-center">Use the Google email your team admin invited.</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div style={fadeUpStyle(formReady, 0)}>
          <label
            htmlFor="email"
            className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65 mb-2 block"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="you@business.com"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full h-11 rounded-none border-0 border-b border-border bg-transparent px-0 text-[15px] text-foreground placeholder:text-muted-foreground/50 focus:border-foreground focus:outline-none transition-colors"
          />
        </div>

        <div style={fadeUpStyle(formReady, 1)}>
          <div className="flex items-center justify-between mb-2">
            <label
              htmlFor="password"
              className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65"
            >
              Password
            </label>
            <Link
              to="/forgot-password"
              className="text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <div ref={passwordRef} className="t-input relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full h-11 rounded-none border-0 border-b border-border bg-transparent pl-0 pr-10 text-[15px] text-foreground placeholder:text-muted-foreground/50 focus:border-foreground focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(s => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
            >
              {showPassword ? <EyeOff size={15} strokeWidth={1.75} /> : <Eye size={15} strokeWidth={1.75} />}
            </button>
          </div>
        </div>

        {error && <ErrorBanner message={error} />}

        <button
          type="submit"
          disabled={isLoading}
          style={fadeUpStyle(formReady, 2)}
          className="w-full h-11 rounded-2xl bg-foreground text-background text-[13px] font-medium cursor-pointer hover:opacity-85 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.08)]"
        >
          {isLoading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      <p
        className="text-[11px] text-muted-foreground/55 mt-10 text-center"
        style={fadeUpStyle(formReady, 3)}
      >
        New here?{" "}
        <a
          href="mailto:support@scalyft.tech"
          className="text-muted-foreground/80 hover:text-foreground transition-colors"
        >
          Contact support@scalyft.tech
        </a>
      </p>
    </AuthShell>
  )
}
