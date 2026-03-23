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
import type { Lead } from "@/lib/types";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function urgencyBadge(urgency: Lead["urgency"]) {
  const config: Record<
    Lead["urgency"],
    { label: string; className: string }
  > = {
    emergency: {
      label: "Emergency",
      className: "bg-destructive/10 text-destructive border-0",
    },
    urgent: {
      label: "Urgent",
      className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-0",
    },
    routine: {
      label: "Routine",
      className: "bg-muted text-muted-foreground border-0",
    },
    inquiry: {
      label: "Inquiry",
      className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-0",
    },
  };

  const c = config[urgency];
  return (
    <Badge className={`rounded-full text-[12px] font-medium px-2.5 py-0.5 ${c.className}`}>
      {c.label}
    </Badge>
  );
}

function statusBadge(status: Lead["status"]) {
  const config: Record<
    Lead["status"],
    { label: string; className: string }
  > = {
    new: {
      label: "New",
      className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0",
    },
    contacted: {
      label: "Contacted",
      className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-0",
    },
    booked: {
      label: "Booked",
      className: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-0",
    },
    closed: {
      label: "Closed",
      className: "bg-muted text-muted-foreground/60 border-0",
    },
    lost: {
      label: "Lost",
      className: "bg-muted text-muted-foreground/40 border-0",
    },
  };

  const c = config[status];
  return (
    <Badge className={`rounded-full text-[12px] font-medium px-2.5 py-0.5 ${c.className}`}>
      {c.label}
    </Badge>
  );
}

export function LeadListTable({ leads }: { leads: Lead[] }) {
  const router = useRouter();

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-border/30 hover:bg-transparent">
          <TableHead className="w-[160px] text-[13px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70 py-3 px-4">
            Name
          </TableHead>
          <TableHead className="hidden w-[140px] sm:table-cell text-[13px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70 py-3 px-4">
            Phone
          </TableHead>
          <TableHead className="hidden md:table-cell text-[13px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70 py-3 px-4">
            Service Needed
          </TableHead>
          <TableHead className="w-[100px] text-[13px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70 py-3 px-4">
            Urgency
          </TableHead>
          <TableHead className="w-[100px] text-[13px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70 py-3 px-4">
            Status
          </TableHead>
          <TableHead className="hidden w-[160px] sm:table-cell text-[13px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70 py-3 px-4">
            Date
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="divide-y divide-border/50">
        {leads.map((lead) => {
          const href = lead.call_id ? `/calls/${lead.call_id}` : undefined;

          return (
            <TableRow
              key={lead.id}
              className={
                href
                  ? "cursor-pointer border-0 transition-colors duration-150 hover:bg-muted/40"
                  : "border-0 transition-colors duration-150"
              }
              onClick={href ? () => router.push(href) : undefined}
            >
              <TableCell className="text-[14px] py-4 px-4 font-medium text-foreground">
                {lead.name ?? "Unknown"}
              </TableCell>
              <TableCell className="hidden sm:table-cell text-[14px] py-4 px-4 tabular-nums text-muted-foreground">
                {lead.phone}
              </TableCell>
              <TableCell className="hidden md:table-cell max-w-xs truncate text-[14px] py-4 px-4 text-muted-foreground">
                {lead.service_needed ?? "\u2014"}
              </TableCell>
              <TableCell className="py-4 px-4">{urgencyBadge(lead.urgency)}</TableCell>
              <TableCell className="py-4 px-4">{statusBadge(lead.status)}</TableCell>
              <TableCell className="hidden sm:table-cell text-[14px] py-4 px-4 tabular-nums text-muted-foreground">
                {formatDate(lead.created_at)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
