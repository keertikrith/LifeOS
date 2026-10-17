"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/app", label: "Today" },
  { href: "/app/trends", label: "Insights" },
  { href: "/app/coach", label: "Coach" },
  { href: "/app/habits", label: "Habits" },
  { href: "/app/journal", label: "Journal" },
  { href: "/app/health", label: "Health" },
  { href: "/app/settings", label: "Settings" },
];
const MOBILE = ITEMS.filter((i) => !["/app/health", "/app/settings"].includes(i.href));

export function AppNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/app" ? path === "/app" || path.startsWith("/app/day") : path.startsWith(href));
  return (
    <>
      {/* desktop: top links */}
      <nav aria-label="Main" className="hidden gap-6 md:flex">
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined}
            className={`whitespace-nowrap border-b py-1 text-sm ${active(i.href) ? "border-ink font-semibold text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}>
            {i.label}
          </Link>
        ))}
      </nav>
      {/* mobile: secondary links in the header, primary tabs at the bottom */}
      <nav aria-label="Secondary" className="flex gap-4 text-xs md:hidden">
        {["/app/health", "/app/settings"].map((h) => (
          <Link key={h} href={h} aria-current={active(h) ? "page" : undefined} className={active(h) ? "font-semibold text-ink" : "text-ink-soft"}>
            {ITEMS.find((i) => i.href === h)!.label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] md:hidden">
        {MOBILE.map((i) => (
          <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined}
            className={`py-3.5 text-center text-xs ${active(i.href) ? "font-semibold text-ink" : "text-ink-soft"}`}>
            {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
