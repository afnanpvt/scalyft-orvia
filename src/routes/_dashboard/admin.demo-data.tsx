import { createFileRoute } from "@tanstack/react-router";
import AdminDemoDataPage from "@/components/pages/admin-demo-data";

export const Route = createFileRoute("/_dashboard/admin/demo-data")({
  component: AdminDemoDataPage,
});
