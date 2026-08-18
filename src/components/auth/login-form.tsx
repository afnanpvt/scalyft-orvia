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
  const { signIn } = useAuth()
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
