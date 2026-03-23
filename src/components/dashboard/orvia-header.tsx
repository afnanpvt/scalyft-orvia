"use client";

import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";

const pageTitles: Record<string, string> = {
  "/": "Overview",
  "/calls": "Calls",
  "/leads": "Leads",
  "/settings": "Settings",
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  if (pathname.startsWith("/calls/")) return "Call Details";
  if (pathname.startsWith("/leads/")) return "Lead Details";
  return "Dashboard";
}

export function OrviaHeader() {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="flex h-(--header-height) shrink-0 items-center border-b border-border/50 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-3 px-8 py-4">
        <SidebarTrigger className="-ml-1" />
        <h1 className="text-lg font-medium tracking-tight text-foreground">
          {title}
        </h1>
      </div>
    </header>
  );
}
