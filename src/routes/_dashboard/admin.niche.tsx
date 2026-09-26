import { createFileRoute } from "@tanstack/react-router";
import AdminNichePage from "@/components/pages/admin-niche";

export const Route = createFileRoute("/_dashboard/admin/niche")({
  component: AdminNichePage,
});
