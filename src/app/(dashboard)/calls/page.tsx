import { getCalls } from "@/lib/queries";
import { CallListTable } from "@/components/dashboard/call-list-table";

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
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Calls</h1>
      <CallListTable calls={calls} />
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} calls)
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/calls?page=${page - 1}`}
                className="rounded border px-3 py-1 text-sm hover:bg-muted"
              >
                Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/calls?page=${page + 1}`}
                className="rounded border px-3 py-1 text-sm hover:bg-muted"
              >
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
