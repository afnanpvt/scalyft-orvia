export function StatCard({
  label,
  value,
  description,
  accent = false,
}: {
  label: string
  value: number | string
  description?: string
  accent?: boolean
}) {
  return (
    <div
      className={`
        rounded-2xl px-6 py-5
        ${
          accent
            ? "bg-foreground text-background"
            : "bg-card ring-1 ring-border/10"
        }
      `}
    >
      <p
        className={`
          text-[10px] font-medium uppercase tracking-[0.12em]
          ${accent ? "text-background/40" : "text-muted-foreground/40"}
        `}
      >
        {label}
      </p>
      <div
        className={`
          text-4xl font-light tracking-[-0.04em] tabular-nums mt-1.5
          ${accent ? "text-background" : "text-foreground"}
        `}
      >
        {value}
      </div>
      {description && (
        <p
          className={`
            text-[12px] mt-1
            ${accent ? "text-background/40" : "text-muted-foreground/40"}
          `}
        >
          {description}
        </p>
      )}
    </div>
  )
}
