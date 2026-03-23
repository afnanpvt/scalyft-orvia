import { getCalls } from "@/lib/queries";
import { CallListTable } from "@/components/dashboard/call-list-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhoneOffIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10));
  const pageSize = 20;

  const { calls, total } = await getCalls(page, pageSize);
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="flex flex-col space-y-8 py-6 md:py-8">
      <div className="px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Calls</h1>
          <Badge
            variant="secondary"
            className="rounded-full text-[12px] font-medium px-2.5 py-0.5 tabular-nums"
          >
            {total}
          </Badge>
        </div>
      </div>

      <div className="px-4 lg:px-6">
        {calls.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 py-20">
            <PhoneOffIcon className="size-10 text-muted-foreground/30" />
            <p className="mt-4 text-[14px] font-medium text-muted-foreground">
              No calls yet
            </p>
            <p className="mt-1.5 text-[13px] text-muted-foreground/60">
              Calls will appear here once your AI receptionist starts taking them.
            </p>
          </div>
        ) : (
          <>
            <div className="bg-card rounded-2xl border-0 shadow-none overflow-hidden">
              <CallListTable calls={calls} />
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-6">
                <p className="text-[13px] text-muted-foreground/70 tabular-nums">
                  Page {page} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  {page > 1 ? (
                    <Button variant="outline" size="sm" className="rounded-lg text-[13px]" render={<Link href={`/calls?page=${page - 1}`} />}>
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
                    <Button variant="outline" size="sm" className="rounded-lg text-[13px]" render={<Link href={`/calls?page=${page + 1}`} />}>
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
