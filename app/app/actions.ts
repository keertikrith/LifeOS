"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminClient, userClient } from "@/lib/db/clients";
import { createLinkCode } from "@/lib/db/meals";
import { env } from "@/lib/env";
import { isValidTimeZone } from "@/lib/time/day";

async function requireUser() {
  const db = await userClient();
  const { data } = await db.auth.getUser();
  if (!data.user) redirect("/login");
  return { db, user: data.user };
}

export type LinkState = { code?: string; deepLink?: string; error?: string };

export async function generateLinkCode(): Promise<LinkState> {
  const { user } = await requireUser();
  try {
    const code = await createLinkCode(adminClient(), user.id);
    const bot = env.telegramBotUsername();
    return { code, deepLink: bot && !bot.startsWith("PASTE") ? `https://t.me/${bot}?start=${code}` : undefined };
  } catch {
    return { error: "Couldn't create a code. Please try again." };
  }
}

export async function unlinkTelegram() {
  const { db, user } = await requireUser();
  await db.from("telegram_links").delete().eq("user_id", user.id);
  revalidatePath("/app");
}

export async function saveSettings(formData: FormData) {
  const { db, user } = await requireUser();
  const timezone = String(formData.get("timezone") ?? "Asia/Kolkata");
  const targetRaw = String(formData.get("calorie_target") ?? "").trim();
  const target = targetRaw === "" ? null : Number(targetRaw);
  if (!isValidTimeZone(timezone)) return;
  if (target !== null && (!Number.isInteger(target) || target < 500 || target > 10000)) return;
  await db.from("profiles").update({ timezone, calorie_target: target }).eq("id", user.id);
  revalidatePath("/app");
}

export async function signOut() {
  const db = await userClient();
  await db.auth.signOut();
  redirect("/");
}
