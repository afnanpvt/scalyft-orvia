import { createFileRoute } from "@tanstack/react-router";
import AppointmentsPage from "@/components/pages/appointments";

// ?open=<appointment id> opens that appointment's detail drawer on arrival
// (used by the Overview "Next appointment" card).
export const Route = createFileRoute("/_dashboard/appointments")({
  validateSearch: (search: Record<string, unknown>): { open?: string } => ({
    open: typeof search.open === "string" ? search.open : undefined,
  }),
  component: AppointmentsPage,
});
