import { notFound } from "next/navigation";
import { getCallById, getLeadByCallId, getAppointmentByCallId } from "@/lib/queries";
import { CallDetailView } from "@/components/dashboard/call-detail-view";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const call = await getCallById(id);

  if (!call) {
    notFound();
  }

  const [lead, appointment] = await Promise.all([
    getLeadByCallId(call.id),
    getAppointmentByCallId(call.id),
  ]);

  return (
    <div className="flex flex-col space-y-8 py-6 md:py-8">
      <div className="px-4 lg:px-6">
        <Link
          href="/calls"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground/70 transition-colors duration-150 hover:text-foreground"
        >
          <ChevronLeftIcon className="size-3.5" />
          Back to calls
        </Link>
      </div>
      <div className="px-4 lg:px-6">
        <CallDetailView call={call} lead={lead} appointment={appointment} />
      </div>
    </div>
  );
}
