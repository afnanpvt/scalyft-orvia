import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { OrviaSidebar } from "@/components/dashboard/orvia-sidebar";
import { OrviaHeader } from "@/components/dashboard/orvia-header";
import { getClinicSettings } from "@/lib/queries";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clinic = await getClinicSettings();
  const clinicName = clinic?.name ?? "Orvia Dashboard";

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 64)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <OrviaSidebar clinicName={clinicName} />
      <SidebarInset>
        <OrviaHeader />
        <div className="flex flex-1 flex-col bg-background">
          <div className="@container/main flex flex-1 flex-col">
            <div className="mx-auto w-full max-w-6xl px-8 py-8">
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
