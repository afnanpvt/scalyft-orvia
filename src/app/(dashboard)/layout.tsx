import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { getClinicSettings } from "@/lib/queries";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clinic = await getClinicSettings();
  const clinicName = clinic?.name ?? "Orvia Dashboard";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header clinicName={clinicName} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
