"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { navItems, isNavActive } from "./nav-items";

export function Header({ clinicName }: { clinicName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="relative flex h-14 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-3">
        <button
          className="md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-medium text-muted-foreground">
          {clinicName}
        </span>
      </div>
      <Button variant="ghost" size="sm" onClick={handleLogout}>
        <LogOut className="mr-2 h-4 w-4" />
        Sign out
      </Button>
      {mobileMenuOpen && (
        <nav className="fixed left-0 top-14 z-50 w-full border-b bg-background p-2 shadow-md md:hidden">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                isNavActive(href, pathname)
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
