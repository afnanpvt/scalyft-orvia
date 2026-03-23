"use client";

import type { Clinic } from "@/lib/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const DAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[13px] font-medium uppercase tracking-[0.06em] text-muted-foreground/60">
      {children}
    </h3>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground/60">
        {label}
      </dt>
      <dd className="text-[14px] text-foreground">{value}</dd>
    </div>
  );
}

function ClinicInfoTab({ clinic }: { clinic: Clinic }) {
  const { settings } = clinic;

  return (
    <div className="space-y-8">
      <div className="bg-card rounded-2xl border-0 shadow-none p-6 space-y-5">
        <SectionTitle>Clinic Details</SectionTitle>
        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <InfoItem
            label="Doctor"
            value={settings.doctor_name ?? "Not set"}
          />
          <InfoItem label="Clinic Name" value={clinic.name} />
          <InfoItem
            label="Address"
            value={settings.address ?? "Not set"}
          />
          <InfoItem
            label="Landmark"
            value={settings.landmark ?? "Not set"}
          />
          <InfoItem label="City" value={settings.city ?? "Not set"} />
          <InfoItem
            label="Phone (Display)"
            value={clinic.phone_display ?? "Not set"}
          />
          <InfoItem label="Timezone" value={clinic.timezone} />
          <InfoItem label="Status" value={clinic.status} />
        </dl>
      </div>

      {settings.operating_hours && (
        <div className="bg-card rounded-2xl border-0 shadow-none p-6 space-y-5">
          <SectionTitle>Operating Hours</SectionTitle>
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/30 hover:bg-transparent">
                <TableHead className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70 py-3 px-4">
                  Day
                </TableHead>
                <TableHead className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70 py-3 px-4">
                  Open
                </TableHead>
                <TableHead className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70 py-3 px-4">
                  Close
                </TableHead>
                <TableHead className="text-[13px] font-medium uppercase tracking-[0.04em] text-muted-foreground/70 py-3 px-4">
                  Lunch Break
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border/50">
              {DAY_ORDER.filter(
                (day) => day in settings.operating_hours!
              ).map((day) => {
                const info = settings.operating_hours![day];
                return (
                  <TableRow key={day} className="border-0 hover:bg-transparent">
                    <TableCell className="capitalize text-[14px] font-medium py-4 px-4 text-foreground">
                      {day}
                    </TableCell>
                    {info.closed ? (
                      <TableCell
                        colSpan={3}
                        className="text-[14px] py-4 px-4 text-muted-foreground/60"
                      >
                        Closed
                      </TableCell>
                    ) : (
                      <>
                        <TableCell className="text-[14px] py-4 px-4 text-foreground">
                          {info.open}
                        </TableCell>
                        <TableCell className="text-[14px] py-4 px-4 text-foreground">
                          {info.close}
                        </TableCell>
                        <TableCell className="text-[14px] py-4 px-4 text-muted-foreground">
                          {info.lunch_break ?? "None"}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!settings.operating_hours && settings.hours && (
        <div className="bg-card rounded-2xl border-0 shadow-none p-6 space-y-4">
          <SectionTitle>Operating Hours</SectionTitle>
          <p className="text-[14px] text-foreground">{settings.hours}</p>
        </div>
      )}
    </div>
  );
}

function ServicesTab({ clinic }: { clinic: Clinic }) {
  const { settings } = clinic;
  const services = settings.service_details;

  if (!services || services.length === 0) {
    return (
      <div className="bg-card rounded-2xl border-0 shadow-none p-6">
        <p className="py-8 text-center text-[14px] text-muted-foreground/60">
          No services configured yet.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      {services.map((svc) => (
        <div key={svc.name} className="bg-card rounded-2xl border-0 shadow-none p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[15px] font-semibold text-foreground">{svc.name}</h3>
            <div className="flex gap-1.5 shrink-0">
              {svc.priority === "high" && (
                <Badge className="rounded-full text-[12px] font-medium px-2.5 py-0.5 bg-destructive/10 text-destructive border-0">
                  Priority
                </Badge>
              )}
              {svc.can_book_directly ? (
                <Badge className="rounded-full text-[12px] font-medium px-2.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
                  Direct booking
                </Badge>
              ) : (
                <Badge className="rounded-full text-[12px] font-medium px-2.5 py-0.5 bg-muted text-muted-foreground border-0">
                  Consultation required
                </Badge>
              )}
            </div>
          </div>
          <p className="text-[14px] leading-relaxed text-muted-foreground">{svc.description}</p>
          <div className="flex gap-4 text-[13px] text-muted-foreground/60">
            <span>{svc.duration_minutes} min</span>
            <span>{svc.price_range}</span>
          </div>
          {svc.note && (
            <p className="text-[13px] text-muted-foreground/50 italic">
              {svc.note}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function AIAssistantTab({ clinic }: { clinic: Clinic }) {
  const { settings } = clinic;

  return (
    <div className="space-y-8">
      <div className="bg-card rounded-2xl border-0 shadow-none p-6 space-y-5">
        <SectionTitle>Personality</SectionTitle>
        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <InfoItem
            label="Receptionist Name"
            value={settings.receptionist_name ?? "Not set"}
          />
          <InfoItem label="Tone" value={settings.tone ?? "Not set"} />
          <InfoItem
            label="Language Preference"
            value={
              settings.language_preference
                ? settings.language_preference.charAt(0).toUpperCase() +
                  settings.language_preference.slice(1)
                : "Not set"
            }
          />
        </dl>
      </div>

      {settings.special_instructions &&
        settings.special_instructions.length > 0 && (
          <div className="bg-card rounded-2xl border-0 shadow-none p-6 space-y-5">
            <SectionTitle>Special Instructions</SectionTitle>
            <ol className="list-decimal list-inside space-y-2.5 text-[14px] leading-relaxed text-foreground">
              {settings.special_instructions.map((instruction, i) => (
                <li key={i}>{instruction}</li>
              ))}
            </ol>
          </div>
        )}

      {settings.emergency_protocol && (
        <div className="bg-card rounded-2xl border-0 shadow-none p-6 space-y-5">
          <SectionTitle>Emergency Protocol</SectionTitle>
          <dl className="space-y-5">
            <div>
              <dt className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground/60">
                During Hours
              </dt>
              <dd className="mt-1.5 text-[14px] leading-relaxed text-foreground">
                {settings.emergency_protocol.during_hours}
              </dd>
            </div>
            <div className="border-t border-border/30" />
            <div>
              <dt className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground/60">
                After Hours
              </dt>
              <dd className="mt-1.5 text-[14px] leading-relaxed text-foreground">
                {settings.emergency_protocol.after_hours}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {settings.faq && settings.faq.length > 0 && (
        <div className="bg-card rounded-2xl border-0 shadow-none p-6 space-y-5">
          <div className="space-y-1">
            <SectionTitle>FAQ</SectionTitle>
            <p className="text-[13px] text-muted-foreground/50">
              Questions the AI assistant can answer
            </p>
          </div>
          <div className="space-y-5">
            {settings.faq.map((item, i) => (
              <div key={i}>
                <p className="text-[14px] font-medium text-foreground">{item.question}</p>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
                  {item.answer}
                </p>
                {i < settings.faq!.length - 1 && (
                  <div className="mt-5 border-t border-border/30" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountTab({ clinic }: { clinic: Clinic }) {
  return (
    <div className="space-y-8">
      <div className="bg-card rounded-2xl border-0 shadow-none p-6 space-y-4">
        <SectionTitle>Account</SectionTitle>
        <p className="text-[14px] text-muted-foreground">
          To change your password or update your email, contact{" "}
          <a
            href="mailto:support@scalyft.tech"
            className="text-foreground font-medium underline underline-offset-2 decoration-border hover:decoration-foreground transition-colors duration-150"
          >
            support@scalyft.tech
          </a>
        </p>
      </div>

      <div className="bg-card rounded-2xl border-0 shadow-none p-6 space-y-5">
        <SectionTitle>Phone & Status</SectionTitle>
        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <InfoItem
            label="Vapi Phone ID"
            value={clinic.vapi_phone_id ?? "Not configured"}
          />
          <InfoItem
            label="Phone (Display)"
            value={clinic.phone_display ?? "Not set"}
          />
          <div className="space-y-1">
            <dt className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground/60">
              Status
            </dt>
            <dd className="mt-0.5">
              <Badge
                className={`rounded-full text-[12px] font-medium px-2.5 py-0.5 border-0 ${
                  clinic.status === "active"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {clinic.status}
              </Badge>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export function SettingsTabs({ clinic }: { clinic: Clinic }) {
  return (
    <Tabs defaultValue="clinic" className="space-y-8">
      <TabsList className="bg-transparent border-b border-border/40 rounded-none p-0 h-auto gap-0">
        <TabsTrigger
          value="clinic"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[14px] font-medium text-muted-foreground/60 data-[state=active]:text-foreground px-4 py-2.5"
        >
          Clinic Info
        </TabsTrigger>
        <TabsTrigger
          value="services"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[14px] font-medium text-muted-foreground/60 data-[state=active]:text-foreground px-4 py-2.5"
        >
          Services
        </TabsTrigger>
        <TabsTrigger
          value="ai"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[14px] font-medium text-muted-foreground/60 data-[state=active]:text-foreground px-4 py-2.5"
        >
          AI Assistant
        </TabsTrigger>
        <TabsTrigger
          value="account"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-[14px] font-medium text-muted-foreground/60 data-[state=active]:text-foreground px-4 py-2.5"
        >
          Account
        </TabsTrigger>
      </TabsList>

      <TabsContent value="clinic">
        <ClinicInfoTab clinic={clinic} />
      </TabsContent>

      <TabsContent value="services">
        <ServicesTab clinic={clinic} />
      </TabsContent>

      <TabsContent value="ai">
        <AIAssistantTab clinic={clinic} />
      </TabsContent>

      <TabsContent value="account">
        <AccountTab clinic={clinic} />
      </TabsContent>
    </Tabs>
  );
}
