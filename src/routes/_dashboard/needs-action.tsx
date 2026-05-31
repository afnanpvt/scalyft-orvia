import { createFileRoute } from "@tanstack/react-router";
import NeedsActionPage from "@/components/pages/needs-action";

export const Route = createFileRoute("/_dashboard/needs-action")({
  component: NeedsActionPage,
});
