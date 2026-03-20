import Link from "next/link";
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
  return new Date(dateStr).toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function outcomeColor(outcome: Call["outcome"]): string {
  switch (outcome) {
    case "appointment_booked":
      return "default";
    case "lead_captured":
      return "secondary";
    case "transferred":
      return "outline";
    default:
      return "secondary";
  }
}

export function CallListTable({ calls }: { calls: Call[] }) {
  if (calls.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No calls yet.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Caller</TableHead>
          <TableHead className="hidden sm:table-cell">Duration</TableHead>
          <TableHead className="hidden md:table-cell">Summary</TableHead>
          <TableHead>Outcome</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {calls.map((call) => (
          <TableRow key={call.id} className="cursor-pointer">
            <TableCell>
              <Link href={`/calls/${call.id}`} className="block">
                {formatTime(call.created_at)}
              </Link>
            </TableCell>
            <TableCell>
              <Link href={`/calls/${call.id}`} className="block">
                {call.caller_phone ?? "Unknown"}
              </Link>
            </TableCell>
            <TableCell className="hidden sm:table-cell">
              {call.duration_secs
                ? `${Math.floor(call.duration_secs / 60)}:${String(call.duration_secs % 60).padStart(2, "0")}`
                : "—"}
            </TableCell>
            <TableCell className="hidden max-w-xs truncate md:table-cell">
              {call.summary ?? "—"}
            </TableCell>
            <TableCell>
              {call.outcome ? (
                <Badge variant={outcomeColor(call.outcome) as "default" | "secondary" | "outline"}>
                  {call.outcome.replace("_", " ")}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
