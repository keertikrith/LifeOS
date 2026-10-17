import Link from "next/link";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in · Life OS" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="card rise w-full max-w-sm p-7">
        <Link href="/" className="mb-8 block font-display text-xl">
          Life OS
        </Link>
        <h1 className="font-display text-3xl">Welcome.</h1>
        <p className="mb-6 mt-2 text-sm text-ink-soft">Sign in with your email and password to link Telegram and see your days add up.</p>
        {error && <p className="mb-4  bg-chili-soft p-3 text-sm text-chili" role="alert">Something went wrong signing you in. Please try again.</p>}
        <LoginForm />
      </div>
    </main>
  );
}
