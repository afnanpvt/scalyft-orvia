import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

interface OutcomeChartProps {
  data: { outcome: string; count: number }[]
}

// oklch-derived hex values — rich, vibrant, distinct
const OUTCOME_COLORS: Record<string, string> = {
  appointment_booked: "#1a8d6a", // oklch(0.58 0.14 160) — rich emerald
  lead_captured: "#2e63b0",      // oklch(0.55 0.14 250) — deeper blue
  info_given: "#a09383",         // oklch(0.65 0.06 85)  — warm taupe
  transferred: "#b47a2a",        // oklch(0.62 0.14 70)  — warm amber
  missed: "#c04040",             // oklch(0.55 0.16 25)  — rich coral-red
}

const FALLBACK_COLORS = ["#2c2a27", "#0d7d5f", "#3b6db3", "#b47a2a", "#c04040"]

function getColor(outcome: string, index: number): string {
  return OUTCOME_COLORS[outcome] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

function formatOutcome(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { name: string; value: number; payload: { fill: string; outcome: string } }[]
}) {
  if (!active || !payload?.length) return null
  const entry = payload[0]

  return (
    <div className="bg-popover border border-border/40 rounded-lg shadow-sm px-3 py-2">
      <div className="flex items-center gap-2 text-[11px]">
        <span
          className="inline-block size-[6px] rounded-full shrink-0"
          style={{ backgroundColor: entry.payload.fill }}
        />
        <span className="font-medium text-muted-foreground/60">
          {formatOutcome(entry.name)}
        </span>
        <span className="ml-auto font-semibold tabular-nums text-foreground">
          {entry.value}
        </span>
      </div>
    </div>
  )
}

export function OutcomeChart({ data }: OutcomeChartProps) {
  if (data.length === 0) {
    return (
      <div>
        <div className="flex h-[180px] items-center justify-center text-[12px] font-medium text-muted-foreground/50">
          No call data yet
        </div>
      </div>
    )
  }

  const total = data.reduce((sum, d) => sum + d.count, 0)

  return (
    <div>
      <div className="flex items-start gap-6">
        {/* Compact donut chart */}
        <div className="shrink-0">
          <ResponsiveContainer width={180} height={180}>
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="outcome"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={85}
                paddingAngle={3}
                stroke="none"
                startAngle={90}
                endAngle={-270}
              >
                {data.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={getColor(entry.outcome, i)}
                    className="transition-all duration-200"
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              {/* Center total */}
              <text
                x="50%"
                y="46%"
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-foreground"
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  fontFamily: "DM Sans, sans-serif",
                }}
              >
                {total}
              </text>
              <text
                x="50%"
                y="58%"
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-muted-foreground/50"
                style={{
                  fontSize: 9,
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontFamily: "DM Sans, sans-serif",
                }}
              >
                Total
              </text>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Vertical legend */}
        <div className="flex-1 pt-3 space-y-2.5">
          {data.map((entry, i) => {
            const pct = total > 0 ? Math.round((entry.count / total) * 100) : 0
            const color = getColor(entry.outcome, i)

            return (
              <div
                key={entry.outcome}
                className="flex items-center gap-2.5 transition-all duration-200"
              >
                <span
                  className="inline-block size-[7px] rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[11px] font-medium text-muted-foreground/60 flex-1">
                  {formatOutcome(entry.outcome)}
                </span>
                <span className="text-[12px] font-semibold tabular-nums text-foreground">
                  {entry.count}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground/40 w-8 text-right">
                  {pct}%
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
