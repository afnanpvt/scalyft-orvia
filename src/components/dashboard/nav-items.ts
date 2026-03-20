import { Phone, LayoutDashboard, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isNavActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
