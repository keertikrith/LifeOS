import { redirect } from "next/navigation";
import { userClient } from "@/lib/db/clients";
import { localDateString } from "@/lib/time/day";

/** Signed-in user + profile for server pages. Redirects to /login if there is no session. */
export async function requireSession() {
  const db = await userClient();
  const { data } = await db.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: profile } = await db.from("profiles").select("display_name, timezone, calorie_target").eq("id", data.user.id).single();
  const tz: string = profile?.timezone ?? "Asia/Kolkata";
  const now = new Date();
  return {
    db,
    userId: data.user.id,
    email: data.user.email ?? "",
    tz,
    now,
    today: localDateString(now, tz),
    displayName: (profile?.display_name as string | null) ?? null,
    target: (profile?.calorie_target as number | null) ?? null,
  };
}

export const isDateString = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
