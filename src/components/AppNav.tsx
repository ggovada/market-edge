"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, LineChart, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/members", label: "People", icon: Users },
  { href: "/insights", label: "Charts AI", icon: LineChart },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-40 border-b-2 border-line bg-[rgba(244,246,248,0.96)] backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 md:px-6">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-ink md:text-3xl">
              Market Edge
            </span>
          </Link>
          <nav className="hidden items-center gap-2 md:flex" aria-label="Main">
            {links.map(({ href, label, icon: Icon }) => {
              const active =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "inline-flex min-h-12 items-center gap-2 rounded-full px-4 py-2.5 text-base font-semibold transition-colors",
                    active
                      ? "bg-accent text-white"
                      : "text-ink hover:bg-accent-soft"
                  )}
                >
                  <Icon size={20} aria-hidden />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-line bg-white md:hidden"
        aria-label="Main"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {links.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-sm font-semibold",
                  active ? "bg-accent-soft text-accent" : "text-muted"
                )}
              >
                <Icon size={24} aria-hidden />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
