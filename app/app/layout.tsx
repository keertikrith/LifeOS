import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { signOut } from "./actions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <div className="mx-auto max-w-4xl px-4 pb-28 pt-5 md:pb-16">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link href="/app" className="font-display text-xl text-ink">Life OS</Link>
          <AppNav />
          <form action={signOut}><button className="text-sm text-ink-soft hover:text-ink">Sign out</button></form>
        </header>
        {children}
      </div>
    </div>
  );
}
