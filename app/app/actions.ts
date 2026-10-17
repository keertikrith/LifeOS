"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminClient, userClient } from "@/lib/db/clients";
import { archiveHabit, createHabit, saveJournal, setHabitDone } from "@/lib/db/life";
import { createLinkCode } from "@/lib/db/meals";
import { saveHealthManual } from "@/lib/health/manual";
import { createApiToken } from "@/lib/health/tokens";
import { localDateString } from "@/lib/time/day";
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

// ───────────── habits ─────────────
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

async function profileTz(db: Awaited<ReturnType<typeof userClient>>, userId: string) {
  const { data } = await db.from("profiles").select("timezone").eq("id", userId).single();
  return (data?.timezone as string) ?? "Asia/Kolkata";
}

export async function toggleHabit(habitId: string, date: string) {
  const { db, user } = await requireUser();
  if (!validDate(date)) return;
  // no future ticks: a habit can't be done tomorrow
  if (date > localDateString(new Date(), await profileTz(db, user.id))) return;
  await setHabitDone(db, user.id, habitId, date);
  revalidatePath("/app", "layout");
}

export async function addHabit(formData: FormData) {
  const { db, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const weekdays = formData.getAll("weekday").map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
  await createHabit(db, user.id, { name, emoji: String(formData.get("emoji") ?? "").trim() || "✅", weekdays });
  revalidatePath("/app", "layout");
}

export async function archiveHabitAction(habitId: string) {
  const { db, user } = await requireUser();
  await archiveHabit(db, user.id, habitId);
  revalidatePath("/app", "layout");
}

// ───────────── journal ─────────────
export async function saveJournalAction(formData: FormData) {
  const { db, user } = await requireUser();
  const date = String(formData.get("date") ?? "");
  if (!validDate(date) || date > localDateString(new Date(), await profileTz(db, user.id))) return;
  const patch: { mood?: number; notes?: string } = {};
  const moodRaw = formData.get("mood");
  if (moodRaw) {
    const mood = Number(moodRaw);
    if (Number.isInteger(mood) && mood >= 1 && mood <= 5) patch.mood = mood;
  }
  if (formData.has("notes")) patch.notes = String(formData.get("notes") ?? "");
  await saveJournal(db, user.id, date, patch);
  revalidatePath("/app", "layout");
}

// ───────────── Apple Health ingest tokens ─────────────
export async function createToken(name: string): Promise<{ token?: string; error?: string }> {
  const { user } = await requireUser();
  const res = await createApiToken(adminClient(), user.id, name);
  revalidatePath("/app/health");
  return res;
}

export async function revokeToken(tokenId: string) {
  const { db, user } = await requireUser();
  await db.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", tokenId).eq("user_id", user.id);
  revalidatePath("/app/health");
}

// ───────────── manual health entry (no Shortcut needed) ─────────────
export async function logHealthManual(_prev: { ok?: boolean; error?: string }, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const { db, user } = await requireUser();
  const today = localDateString(new Date(), await profileTz(db, user.id));
  const date = String(formData.get("date") || today);
  if (!validDate(date) || date > today) return { error: "Pick today or an earlier date." };
  const num = (k: string) => String(formData.get(k) ?? "").trim();
  const sleepH = num("sleep_hours");
  const metrics = {
    active_kcal: num("active_kcal"),
    resting_kcal: num("resting_kcal"),
    steps: num("steps"),
    weight_kg: num("weight_kg"),
    sleep_minutes: sleepH === "" ? "" : String(Math.round(Number(sleepH) * 60)),
  };
  if (Object.values(metrics).every((v) => v === "")) return { error: "Enter at least one number." };
  const res = await saveHealthManual(adminClient(), user.id, date, metrics, "manual");
  if (!res.ok) return { error: res.error };
  revalidatePath("/app", "layout");
  return { ok: true };
}
