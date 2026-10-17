import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomInt } from "node:crypto";
import type { Food, UserDefault } from "@/lib/nutrition/matcher";
import { dayBounds } from "@/lib/time/day";

export type MealType = "breakfast" | "lunch" | "snack" | "dinner";

export type Clarify =
  | { kind: "variant"; options: { food_id: string; label: string }[]; qty_known?: boolean }
  | { kind: "quantity" };

export interface LogItem {
  id: string;
  log_id: string;
  user_id: string;
  food_id: string | null;
  food_key: string;
  name: string;
  variant: string | null;
  quantity: number;
  unit: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  match_type: "matched" | "estimated" | "unresolved";
  clarify: Clarify | null;
  position: number;
}

export interface MealLog {
  id: string;
  user_id: string;
  raw_text: string;
  logged_at: string;
  meal_type: MealType | null;
  status: "pending" | "confirmed" | "expired";
  total_kcal: number;
  telegram_message_id: number | null;
  created_at: string;
  items: LogItem[];
}

export interface BotUser {
  user_id: string;
  chat_id: number;
  pending_action: { type: "edit_qty"; log_id: string; position: number } | null;
  timezone: string;
  calorie_target: number | null;
  display_name: string | null;
}

// Supabase results are untyped here; callers cast to the row interfaces above.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ok(res: { data: any; error: { message: string } | null }, what: string): any {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

// ───────── catalog / defaults ─────────
export async function loadCatalog(db: SupabaseClient, userId: string): Promise<Food[]> {
  const res = await db.from("foods").select("*").or(`user_id.is.null,user_id.eq.${userId}`);
  return ok(res, "loadCatalog") as Food[];
}

export async function loadDefaults(db: SupabaseClient, userId: string): Promise<UserDefault[]> {
  const res = await db.from("user_food_defaults").select("food_key, food_id, quantity").eq("user_id", userId);
  return ok(res, "loadDefaults") as UserDefault[];
}

export async function saveDefault(db: SupabaseClient, userId: string, d: UserDefault) {
  ok(
    await db
      .from("user_food_defaults")
      .upsert({ user_id: userId, ...d, updated_at: new Date().toISOString() }, { onConflict: "user_id,food_key" }),
    "saveDefault",
  );
}

// ───────── telegram users / linking ─────────
export async function getBotUser(db: SupabaseClient, chatId: number): Promise<BotUser | null> {
  const link = ok(await db.from("telegram_links").select("user_id, chat_id, pending_action").eq("chat_id", chatId).maybeSingle(), "getBotUser");
  if (!link) return null;
  const profile = ok(await db.from("profiles").select("timezone, calorie_target, display_name").eq("id", link.user_id).single(), "getProfile");
  return { ...link, ...profile } as BotUser;
}

export async function setPendingAction(db: SupabaseClient, userId: string, action: BotUser["pending_action"]) {
  ok(await db.from("telegram_links").update({ pending_action: action }).eq("user_id", userId), "setPendingAction");
}

export const hashCode = (code: string) => createHash("sha256").update(code.trim().toUpperCase()).digest("hex");

/** Creates a one-time, 15-minute link code. The plaintext is returned once and never stored. */
export async function createLinkCode(db: SupabaseClient, userId: string): Promise<string> {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  const code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
  ok(await db.from("link_codes").delete().eq("user_id", userId).is("used_at", null), "clearOldCodes");
  ok(
    await db.from("link_codes").insert({ code_hash: hashCode(code), user_id: userId, expires_at: new Date(Date.now() + 15 * 60_000).toISOString() }),
    "createLinkCode",
  );
  return code;
}

/** Redeems a code for a chat. Returns the user id, or null if invalid/expired/used. */
export async function redeemLinkCode(db: SupabaseClient, code: string, chatId: number): Promise<string | null> {
  const row = ok(
    await db.from("link_codes").select("user_id, expires_at, used_at").eq("code_hash", hashCode(code)).maybeSingle(),
    "redeemLinkCode",
  );
  if (!row || row.used_at || new Date(row.expires_at) < new Date()) return null;
  // claim atomically so a code can't be used twice
  const claimed = ok(
    await db.from("link_codes").update({ used_at: new Date().toISOString() }).eq("code_hash", hashCode(code)).is("used_at", null).select("user_id"),
    "claimCode",
  );
  if (!claimed.length) return null;
  ok(await db.from("telegram_links").delete().or(`user_id.eq.${row.user_id},chat_id.eq.${chatId}`), "unlinkOld");
  ok(await db.from("telegram_links").insert({ user_id: row.user_id, chat_id: chatId }), "link");
  return row.user_id;
}

// ───────── meal logs ─────────
export type NewItem = Omit<LogItem, "id" | "log_id" | "user_id">;

export async function createLog(
  db: SupabaseClient,
  a: { userId: string; rawText: string; mealType: MealType | null; items: NewItem[] },
): Promise<MealLog> {
  const log = ok(
    await db.from("meal_logs").insert({ user_id: a.userId, raw_text: a.rawText, meal_type: a.mealType, status: "pending" }).select().single(),
    "createLog",
  ) as Omit<MealLog, "items">;
  const rows = a.items.map((i, idx) => ({ ...i, position: idx, log_id: log.id, user_id: a.userId }));
  const items = rows.length ? (ok(await db.from("meal_log_items").insert(rows).select(), "createItems") as LogItem[]) : [];
  const full = { ...log, items: items.sort((x, y) => x.position - y.position) };
  return recomputeTotal(db, full);
}

export async function getLog(db: SupabaseClient, userId: string, logId: string): Promise<MealLog | null> {
  const log = ok(await db.from("meal_logs").select("*").eq("id", logId).eq("user_id", userId).maybeSingle(), "getLog");
  if (!log) return null;
  const items = ok(await db.from("meal_log_items").select("*").eq("log_id", logId).order("position"), "getItems") as LogItem[];
  return { ...log, items } as MealLog;
}

export async function updateItem(db: SupabaseClient, userId: string, itemId: string, patch: Partial<NewItem>) {
  ok(await db.from("meal_log_items").update(patch).eq("id", itemId).eq("user_id", userId), "updateItem");
}

export async function recomputeTotal(db: SupabaseClient, log: MealLog): Promise<MealLog> {
  const items = ok(await db.from("meal_log_items").select("*").eq("log_id", log.id).order("position"), "reload") as LogItem[];
  const total = Math.round(items.reduce((s, i) => s + Number(i.kcal), 0));
  ok(await db.from("meal_logs").update({ total_kcal: total }).eq("id", log.id), "setTotal");
  return { ...log, items, total_kcal: total };
}

export async function setLogStatus(db: SupabaseClient, userId: string, logId: string, status: MealLog["status"]) {
  ok(await db.from("meal_logs").update({ status }).eq("id", logId).eq("user_id", userId), "setLogStatus");
}

export async function setLogMessageId(db: SupabaseClient, logId: string, messageId: number) {
  ok(await db.from("meal_logs").update({ telegram_message_id: messageId }).eq("id", logId), "setMessageId");
}

export async function deleteLog(db: SupabaseClient, userId: string, logId: string) {
  ok(await db.from("meal_logs").delete().eq("id", logId).eq("user_id", userId), "deleteLog");
}

/** Most recent log (any status but expired) — what /undo removes. */
export async function lastLog(db: SupabaseClient, userId: string): Promise<MealLog | null> {
  const row = ok(
    await db.from("meal_logs").select("id").eq("user_id", userId).neq("status", "expired").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    "lastLog",
  );
  return row ? getLog(db, userId, row.id) : null;
}

/**
 * Pending logs older than AUTO_CONFIRM_MINUTES are confirmed — unless an item is still waiting on a
 * clarification, in which case nothing can be saved without guessing, so the log expires.
 * Run lazily on every bot interaction (and from cron later).
 */
export async function autoConfirmStale(db: SupabaseClient, userId: string, minutes: number) {
  const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
  const stale = ok(await db.from("meal_logs").select("id").eq("user_id", userId).eq("status", "pending").lt("created_at", cutoff), "stale") as { id: string }[];
  for (const { id } of stale) {
    const unresolved = ok(await db.from("meal_log_items").select("id").eq("log_id", id).eq("match_type", "unresolved").limit(1), "unresolved");
    await setLogStatus(db, userId, id, unresolved.length ? "expired" : "confirmed");
  }
}

export async function confirmedLogsForDay(db: SupabaseClient, userId: string, tz: string, now = new Date()): Promise<MealLog[]> {
  const { start, end } = dayBounds(now, tz);
  const logs = ok(
    await db.from("meal_logs").select("*").eq("user_id", userId).eq("status", "confirmed").gte("logged_at", start.toISOString()).lt("logged_at", end.toISOString()).order("logged_at"),
    "dayLogs",
  ) as Omit<MealLog, "items">[];
  if (!logs.length) return [];
  const items = ok(await db.from("meal_log_items").select("*").in("log_id", logs.map((l) => l.id)).order("position"), "dayItems") as LogItem[];
  return logs.map((l) => ({ ...l, items: items.filter((i) => i.log_id === l.id) }));
}
