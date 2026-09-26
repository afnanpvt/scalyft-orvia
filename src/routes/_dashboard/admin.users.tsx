import { createFileRoute } from "@tanstack/react-router";
import AdminUsersPage from "@/components/pages/admin-users";

export const Route = createFileRoute("/_dashboard/admin/users")({
  component: AdminUsersPage,
});
