import { createFileRoute } from "@tanstack/react-router";
import CallDetailPage from "@/components/pages/call-detail";

export const Route = createFileRoute("/_dashboard/calls_/$id")({
  component: CallDetailPage,
});
