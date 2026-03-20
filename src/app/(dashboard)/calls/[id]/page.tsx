import { notFound } from "next/navigation";
import { getCallById, getLeadByCallId, getAppointmentByCallId } from "@/lib/queries";
import { CallDetailView } from "@/components/dashboard/call-detail-view";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

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
    <div className="space-y-4">
      <Link
        href="/calls"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to calls
      </Link>
      <CallDetailView call={call} lead={lead} appointment={appointment} />
    </div>
  );
}
