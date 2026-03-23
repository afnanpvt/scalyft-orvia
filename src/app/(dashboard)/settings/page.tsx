// src/app/(dashboard)/settings/page.tsx
import { getClinicSettings } from "@/lib/queries";
import { SettingsTabs } from "@/components/dashboard/settings-tabs";

export default async function SettingsPage() {
  const clinic = await getClinicSettings();

  if (!clinic) {
    return <p className="text-[14px] text-muted-foreground">Unable to load settings.</p>;
  }

  return (
    <div className="flex flex-col space-y-8 py-6 md:py-8">
      <div className="px-4 lg:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </div>
      <div className="px-4 lg:px-6">
        <SettingsTabs clinic={clinic} />
      </div>
    </div>
  );
}
