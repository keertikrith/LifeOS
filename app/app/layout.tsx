import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { signOut } from "./actions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="kolam min-h-dvh">
      <div className="mx-auto max-w-4xl px-4 pb-28 pt-5 md:pb-16">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link href="/app" className="flex items-center gap-2 font-display text-xl font-bold text-maroon"><span aria-hidden>🪔</span> Life OS</Link>
          <div className="order-3 w-full md:order-none md:w-auto"><AppNav /></div>
          <form action={signOut}><button className="btn-ghost !px-4 !py-2 text-sm">Sign out</button></form>
        </header>
        {children}
      </div>
    </div>
  );
}
