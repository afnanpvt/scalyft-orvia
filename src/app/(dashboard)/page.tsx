import { getOverviewStats, getRecentCalls } from "@/lib/queries";
import { StatCard } from "@/components/dashboard/stat-card";
import { Phone, UserPlus, CalendarCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function OverviewPage() {
  const [stats, recentCalls] = await Promise.all([
    getOverviewStats(),
    getRecentCalls(10),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Overview</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Calls Today" value={stats.callsToday} icon={Phone} />
        <StatCard title="Leads Captured" value={stats.leadsToday} icon={UserPlus} />
        <StatCard
          title="Appointments Booked"
          value={stats.appointmentsToday}
          icon={CalendarCheck}
        />
      </div>
      <div>
        <h2 className="mb-3 text-lg font-semibold">Recent Calls</h2>
        {recentCalls.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No calls yet. Once your AI receptionist handles calls, they will appear here.
          </p>
        ) : (
          <div className="space-y-2">
            {recentCalls.map((call) => (
              <Link
                key={call.id}
                href={`/calls/${call.id}`}
                className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">
                    {call.caller_phone ?? "Unknown"}
                  </span>
                  <span className="text-xs text-muted-foreground line-clamp-1">
                    {call.summary ?? "No summary available"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {call.outcome && (
                    <Badge variant="secondary" className="text-xs">
                      {call.outcome.replace("_", " ")}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {call.duration_secs ? `${Math.ceil(call.duration_secs / 60)}m` : "—"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
