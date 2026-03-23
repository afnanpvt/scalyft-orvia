import { getLeads } from "@/lib/queries";
import { LeadListTable } from "@/components/dashboard/lead-list-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UsersIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "booked", label: "Booked" },
  { value: "closed", label: "Closed" },
] as const;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const { page: pageStr, status } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10));
  const pageSize = 20;

  const { leads, total } = await getLeads(page, pageSize, status);
  const totalPages = Math.ceil(total / pageSize);

  const activeStatus = status ?? "all";

  return (
    <div className="flex flex-col space-y-8 py-6 md:py-8">
      <div className="px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <Badge
            variant="secondary"
            className="rounded-full text-[12px] font-medium px-2.5 py-0.5 tabular-nums"
          >
            {total}
          </Badge>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-4 lg:px-6">
        <div className="inline-flex items-center gap-0.5 border-b border-border/40">
          {STATUS_TABS.map((tab) => {
            const isActive = activeStatus === tab.value;
            const href =
              tab.value === "all" ? "/leads" : `/leads?status=${tab.value}`;

            return (
              <Link
                key={tab.value}
                href={href}
                className={`relative px-3 py-2 text-[14px] font-medium transition-colors duration-150 ${
                  isActive
                    ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-foreground after:rounded-full"
                    : "text-muted-foreground/60 hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="px-4 lg:px-6">
        {leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 py-20">
            <UsersIcon className="size-10 text-muted-foreground/30" />
            <p className="mt-4 text-[14px] font-medium text-muted-foreground">
              No leads found
            </p>
            <p className="mt-1.5 text-[13px] text-muted-foreground/60">
              {activeStatus === "all"
                ? "Leads will appear here as calls come in."
                : `No leads with status "${activeStatus}".`}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-card rounded-2xl border-0 shadow-none overflow-hidden">
              <LeadListTable leads={leads} />
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-6">
                <p className="text-[13px] text-muted-foreground/70 tabular-nums">
                  Page {page} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  {page > 1 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg text-[13px]"
                      render={<Link href={`/leads?page=${page - 1}${status ? `&status=${status}` : ""}`} />}
                    >
                      <ChevronLeftIcon className="size-3.5" />
                      Previous
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="rounded-lg text-[13px]" disabled>
                      <ChevronLeftIcon className="size-3.5" />
                      Previous
                    </Button>
                  )}
                  {page < totalPages ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg text-[13px]"
                      render={<Link href={`/leads?page=${page + 1}${status ? `&status=${status}` : ""}`} />}
                    >
                      Next
                      <ChevronRightIcon className="size-3.5" />
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="rounded-lg text-[13px]" disabled>
                      Next
                      <ChevronRightIcon className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
