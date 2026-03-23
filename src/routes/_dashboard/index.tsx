import { createFileRoute } from "@tanstack/react-router";
import OverviewPage from "@/components/pages/overview";

export const Route = createFileRoute("/_dashboard/")({
  component: OverviewPage,
});
