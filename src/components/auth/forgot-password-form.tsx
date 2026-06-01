import { useRef, useState, type FormEvent } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { AuthVisual } from "@/components/auth/auth-visual"
import { AuthShell, ErrorBanner, fadeUpStyle, useShake, useShellSequence } from "@/components/auth/auth-shell"

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { requestPasswordReset } = useAuth()

  const formReady = useShellSequence()
  const inputRef = useRef<HTMLDivElement>(null)
  const shake = useShake(inputRef)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    const { error: err } = await requestPasswordReset(email)
    setIsLoading(false)
    if (err) {
      setError(err)
      shake()
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <AuthShell
        visual={<AuthVisual />}
        heading="Check your email"
        subheading="We sent a reset link to your inbox"
      >
        <div style={fadeUpStyle(formReady, 0)} className="flex items-center gap-3 mb-6">
          <div
            className="inline-flex items-center justify-center rounded-2xl shrink-0"
            style={{
              width: 44, height: 44,
              background: "rgba(16,185,129,0.1)",
              border: "1px solid rgba(16,185,129,0.2)",
            }}
          >
            <CheckCircle2 size={20} color="#10B981" strokeWidth={1.75} />
          </div>
          <p className="text-sm text-muted-foreground">
            Sent to <span className="text-foreground font-medium">{email}</span>
          </p>
        </div>

        <p
          className="text-[12.5px] text-muted-foreground/80 leading-relaxed"
          style={fadeUpStyle(formReady, 1)}
        >
          The link expires in 1 hour. If you don't see it, check spam or{" "}
          <button
            type="button"
            onClick={() => { setSent(false); setEmail("") }}
            className="text-foreground underline underline-offset-2 hover:opacity-70 transition-opacity"
          >
            try a different email
          </button>
          .
        </p>

        <Link
          to="/login"
          className="mt-10 inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground/70 hover:text-foreground transition-colors"
          style={fadeUpStyle(formReady, 2)}
        >
          <ArrowLeft size={12} strokeWidth={1.75} />
          Back to sign in
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      visual={<AuthVisual />}
      heading="Reset your password"
      subheading="Enter your email and we'll send a reset link"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div ref={inputRef} className="t-input" style={fadeUpStyle(formReady, 0)}>
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

        {error && <ErrorBanner message={error} />}

        <button
          type="submit"
          disabled={isLoading}
          style={fadeUpStyle(formReady, 1)}
          className="w-full h-11 rounded-2xl bg-foreground text-background text-[13px] font-medium cursor-pointer hover:opacity-85 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.08)]"
        >
          {isLoading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Sending…
            </>
          ) : (
            "Send reset link"
          )}
        </button>
      </form>

      <Link
        to="/login"
        className="mt-10 inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground/70 hover:text-foreground transition-colors"
        style={fadeUpStyle(formReady, 2)}
      >
        <ArrowLeft size={12} strokeWidth={1.75} />
        Back to sign in
      </Link>
    </AuthShell>
  )
}
