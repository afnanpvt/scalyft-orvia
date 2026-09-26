import { createFileRoute } from "@tanstack/react-router";
import AdminModelConfigPage from "@/components/pages/admin-model-config";

export const Route = createFileRoute("/_dashboard/admin/model-config")({
  component: AdminModelConfigPage,
});
