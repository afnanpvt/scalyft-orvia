import { createFileRoute } from "@tanstack/react-router";
import AdminVapiAccountsPage from "@/components/pages/admin-vapi-accounts";

export const Route = createFileRoute("/_dashboard/admin/vapi-accounts")({
  component: AdminVapiAccountsPage,
});
