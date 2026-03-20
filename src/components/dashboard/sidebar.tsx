"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navItems, isNavActive } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 border-r bg-sidebar md:block">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Orvia
        </Link>
      </div>
      <nav className="flex flex-col gap-1 p-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isNavActive(href, pathname)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
