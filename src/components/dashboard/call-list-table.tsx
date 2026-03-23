"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Call } from "@/lib/types";

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDuration(secs: number | null): string {
  if (secs === null || secs === undefined) return "\u2014";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function outcomeBadge(outcome: Call["outcome"]) {
  if (!outcome) return null;

  const config: Record<
    NonNullable<Call["outcome"]>,
    { label: string; className: string }
  > = {
    appointment_booked: {
      label: "Booked",
      className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0",
    },
    lead_captured: {
      label: "Lead",
      className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-0",
    },
    info_given: {
      label: "Info",
      className: "bg-muted text-muted-foreground border-0",
    },
    transferred: {
      label: "Transferred",
      className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-0",
    },
    missed: {
      label: "Missed",
      className: "bg-destructive/10 text-destructive border-0",
    },
  };

  const c = config[outcome];
  return (
    <Badge className={`rounded-full text-[12px] font-medium px-2.5 py-0.5 ${c.className}`}>
      {c.label}
    </Badge>
  );
}

export function CallListTable({ calls }: { calls: Call[] }) {
  const router = useRouter();

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-border/30 hover:bg-transparent">
          <TableHead className="w-[160px] text-[13px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70 py-3 px-4">
            Time
          </TableHead>
          <TableHead className="w-[140px] text-[13px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70 py-3 px-4">
            Caller
          </TableHead>
          <TableHead className="hidden w-[80px] sm:table-cell text-[13px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70 py-3 px-4">
            Duration
          </TableHead>
          <TableHead className="hidden md:table-cell text-[13px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70 py-3 px-4">
            Summary
          </TableHead>
          <TableHead className="w-[100px] text-[13px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70 py-3 px-4">
            Outcome
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="divide-y divide-border/50">
        {calls.map((call) => (
          <TableRow
            key={call.id}
            className="cursor-pointer border-0 transition-colors duration-150 hover:bg-muted/40"
            onClick={() => router.push(`/calls/${call.id}`)}
          >
            <TableCell className="text-[14px] py-4 px-4 tabular-nums text-muted-foreground">
              {formatTime(call.created_at)}
            </TableCell>
            <TableCell className="text-[14px] py-4 px-4 font-medium text-foreground">
              {call.caller_phone ?? "Unknown"}
            </TableCell>
            <TableCell className="hidden sm:table-cell text-[14px] py-4 px-4 tabular-nums text-muted-foreground">
              {formatDuration(call.duration_secs)}
            </TableCell>
            <TableCell className="hidden md:table-cell max-w-xs truncate text-[14px] py-4 px-4 text-muted-foreground">
              {call.summary ?? "\u2014"}
            </TableCell>
            <TableCell className="py-4 px-4">
              {outcomeBadge(call.outcome) ?? (
                <span className="text-[14px] text-muted-foreground/40">{"\u2014"}</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
