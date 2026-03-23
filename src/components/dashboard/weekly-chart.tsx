import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

interface WeeklyChartProps {
  data: { date: string; calls: number; leads: number; appointments: number }[]
}

// oklch(0.25 0.01 85) → near-black warm
// oklch(0.55 0.15 160) → rich emerald
// oklch(0.55 0.12 250) → slate blue
const SERIES = [
  { key: "calls", label: "Calls", color: "#2c2a27" },
  { key: "leads", label: "Leads", color: "#0d7d5f" },
  { key: "appointments", label: "Appointments", color: "#3b6db3" },
] as const

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { dataKey: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="bg-popover border border-border/40 rounded-lg shadow-sm px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground/50 mb-1.5">
        {label}
      </p>
      <div className="space-y-1">
        {payload.map((entry) => {
          const series = SERIES.find((s) => s.key === entry.dataKey)
          return (
            <div
              key={entry.dataKey}
              className="flex items-center gap-2 text-[11px] transition-all duration-200"
            >
              <span
                className="inline-block size-[6px] rounded-full shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="font-medium text-muted-foreground/60">
                {series?.label ?? entry.dataKey}
              </span>
              <span className="ml-auto font-semibold tabular-nums text-foreground">
                {entry.value}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function WeeklyChart({ data }: WeeklyChartProps) {
  return (
    <div>
      {/* Inline legend with small color dots */}
      <div className="flex items-center gap-5 mb-4">
        {SERIES.map((s) => (
          <div
            key={s.key}
            className="flex items-center gap-1.5 transition-all duration-200"
          >
            <span
              className="inline-block size-[6px] rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-[11px] font-medium text-muted-foreground/50">
              {s.label}
            </span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={data}
          margin={{ top: 0, right: 0, left: -24, bottom: 0 }}
          barGap={3}
          barSize={12}
        >
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)", opacity: 0.4 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)", opacity: 0.4 }}
            allowDecimals={false}
            width={32}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "var(--accent)", opacity: 0.1 }}
          />
          {SERIES.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
