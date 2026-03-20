// src/app/(dashboard)/settings/page.tsx
import { getClinicSettings } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function SettingsPage() {
  const clinic = await getClinicSettings();

  if (!clinic) {
    return <p className="text-sm text-muted-foreground">Unable to load settings.</p>;
  }

  const { settings } = clinic;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Clinic Information</CardTitle>
          <CardDescription>
            Contact Scalyft to update your clinic settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-muted-foreground">Clinic Name</dt>
              <dd className="mt-1">{clinic.name}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Status</dt>
              <dd className="mt-1 capitalize">{clinic.status}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Phone (Display)</dt>
              <dd className="mt-1">{clinic.phone_display ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Timezone</dt>
              <dd className="mt-1">{clinic.timezone}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Hours</dt>
              <dd className="mt-1">{settings.hours ?? "10am-7pm Mon-Sat"}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Services</dt>
              <dd className="mt-1">
                {settings.services?.join(", ") ?? "General dental services"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-medium text-muted-foreground">Greeting</dt>
              <dd className="mt-1">
                {settings.greeting ?? "Default greeting"}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Emergency Number</dt>
              <dd className="mt-1">{settings.emergency_number ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Transfer Number</dt>
              <dd className="mt-1">{settings.transfer_number ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Languages</dt>
              <dd className="mt-1">
                {settings.languages?.join(", ") ?? "Hindi, English"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            To change your password or update your email, contact{" "}
            <a href="mailto:support@scalyft.tech" className="text-primary underline">
              support@scalyft.tech
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
