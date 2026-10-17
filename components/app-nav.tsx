"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/app", label: "Today", icon: "🏠" },
  { href: "/app/trends", label: "Trends", icon: "📈" },
  { href: "/app/habits", label: "Habits", icon: "🌿" },
  { href: "/app/journal", label: "Journal", icon: "📓" },
  { href: "/app/health", label: "Health", icon: "⌚" },
  { href: "/app/settings", label: "Settings", icon: "⚙️" },
];

export function AppNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/app" ? path === "/app" || path.startsWith("/app/day") : path.startsWith(href));
  return (
    <>
      {/* desktop: top pills */}
      <nav aria-label="Main" className="hidden gap-1 overflow-x-auto md:flex">
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${active(i.href) ? "bg-saffron/20 text-saffron-deep" : "text-ink-soft hover:bg-bg-soft"}`}>
            <span aria-hidden>{i.icon}</span> {i.label}
          </Link>
        ))}
      </nav>
      {/* mobile: bottom tab bar */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${active(i.href) ? "text-saffron-deep" : "text-ink-soft"}`}>
            <span className="text-lg leading-none" aria-hidden>{i.icon}</span>
            {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
