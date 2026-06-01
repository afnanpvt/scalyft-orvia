import { useEffect, useRef, useState, type FormEvent } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { AuthVisual } from "@/components/auth/auth-visual"
import { AuthShell, ErrorBanner, fadeUpStyle, useShake, useShellSequence } from "@/components/auth/auth-shell"
import { supabase } from "@/lib/supabase"

export function ResetPasswordForm() {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(null)
  const { updatePassword, clearMustChangePassword, mustChangePassword } = useAuth()
  const navigate = useNavigate()

  const formReady = useShellSequence()
  const newPwRef = useRef<HTMLDivElement>(null)
  const shake = useShake(newPwRef)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setHasRecoverySession(!!data.session)
    })
    return () => { cancelled = true }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      shake()
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.")
      shake()
      return
    }
    setIsLoading(true)
    const { error: err } = await updatePassword(password)
    if (err) {
      setIsLoading(false)
      setError(err)
      shake()
      return
    }
    // Clear must_change_password flag if set (invite / temp-password flow).
    // No-op if it was already false.
    await clearMustChangePassword()
    setIsLoading(false)
    setSuccess(true)
    setTimeout(() => navigate({ to: "/" }), 1500)
  }

  if (hasRecoverySession === false) {
    return (
      <AuthShell
        visual={<AuthVisual />}
        heading="Link expired"
        subheading="This reset link is invalid or has expired"
      >
        <button
          type="button"
          onClick={() => navigate({ to: "/forgot-password" })}
          style={fadeUpStyle(formReady, 0)}
          className="w-full h-11 rounded-2xl bg-foreground text-background text-[13px] font-medium cursor-pointer hover:opacity-85 transition-opacity shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.08)]"
        >
          Request a new link
        </button>
      </AuthShell>
    )
  }

  if (success) {
    return (
      <AuthShell
        visual={<AuthVisual />}
        heading="Password updated"
        subheading="Taking you to your dashboard…"
      >
        <div
          style={fadeUpStyle(formReady, 0)}
          className="inline-flex items-center justify-center rounded-2xl"
        >
          <div
            className="inline-flex items-center justify-center rounded-2xl"
            style={{
              width: 44, height: 44,
              background: "rgba(16,185,129,0.1)",
              border: "1px solid rgba(16,185,129,0.2)",
            }}
          >
            <CheckCircle2 size={20} color="#10B981" strokeWidth={1.75} />
          </div>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      visual={<AuthVisual />}
      heading={mustChangePassword ? "Set your password" : "Set a new password"}
      subheading={mustChangePassword
        ? "Welcome to Orvia. Choose a password to finish setting up your account."
        : "Choose something memorable. At least 8 characters."
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div style={fadeUpStyle(formReady, 0)}>
          <label className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65 mb-2 block">
            New password
          </label>
          <div ref={newPwRef} className="t-input relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="At least 8 characters"
              autoComplete="new-password"
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

        <div style={fadeUpStyle(formReady, 1)}>
          <label className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65 mb-2 block">
            Confirm password
          </label>
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Type it again"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
            className="w-full h-11 rounded-none border-0 border-b border-border bg-transparent px-0 text-[15px] text-foreground placeholder:text-muted-foreground/50 focus:border-foreground focus:outline-none transition-colors"
          />
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
              Updating…
            </>
          ) : (
            "Update password"
          )}
        </button>
      </form>
    </AuthShell>
  )
}
