import { createFileRoute } from "@tanstack/react-router";
import CallsPage from "@/components/pages/calls";

export const Route = createFileRoute("/_dashboard/calls")({
  component: CallsPage,
});
