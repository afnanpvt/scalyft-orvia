import { createFileRoute } from "@tanstack/react-router";
import DemoPage from "@/components/pages/demo";

export const Route = createFileRoute("/_dashboard/demo")({
  component: DemoPage,
});
