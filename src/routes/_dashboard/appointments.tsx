import { createFileRoute } from "@tanstack/react-router";
import AppointmentsPage from "@/components/pages/appointments";

export const Route = createFileRoute("/_dashboard/appointments")({
  component: AppointmentsPage,
});
