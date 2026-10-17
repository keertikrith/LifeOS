/* eslint-disable @typescript-eslint/no-explicit-any */
// Health ingest + habits + journal against LOCAL Supabase. Run: npm run test:int
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.GEMINI_API_KEY = "test";
vi.mock("@/lib/llm/gemini", async (orig) => ({ ...(await orig<object>()), generateJson: vi.fn(async () => ({})) }));

const sent: { method: string; body: any }[] = [];
const realFetch = globalThis.fetch;
let nextMsgId = 500;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  if (url.startsWith("https://api.telegram.org/")) {
    sent.push({ method: url.split("/").pop()!, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: nextMsgId++ } }));
  }
  return realFetch(input, init);
}) as typeof fetch;

const { adminClient } = await import("@/lib/db/clients");
const { createApiToken } = await import("@/lib/health/tokens");
const { createLinkCode } = await import("@/lib/db/meals");
const { createHabit, getJournal } = await import("@/lib/db/life");
const { handleUpdate } = await import("@/lib/telegram/service");
const { POST, GET } = await import("@/app/api/health/ingest/route");
const { localDateString } = await import("@/lib/time/day");

const db = adminClient();
const CHAT = 880000 + Math.floor(Math.random() * 1000);
let userId = "", token = "", tokenId = "";
const email = `p23-${Date.now()}@example.com`;
const today = localDateString(new Date(), "Asia/Kolkata");

const ingest = (body: unknown, tok: string | null = token) =>
  POST(new Request("http://x/api/health/ingest", { method: "POST", headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const say = (text: string, replyTo?: number) => handleUpdate(db, { message: { message_id: 1, chat: { id: CHAT }, text, reply_to_message: replyTo ? { message_id: replyTo } : undefined } });
const tap = (data: string, messageId = 1) => handleUpdate(db, { callback_query: { id: "cb", data, message: { message_id: messageId, chat: { id: CHAT } } } });
const lastSent = () => sent.filter((s) => s.method === "sendMessage").at(-1)!.body;
const lastEdit = () => sent.filter((s) => s.method === "editMessageText").at(-1)!.body;
const row = async () => (await db.from("health_daily").select("*").eq("user_id", userId).eq("date", today).maybeSingle()).data;

beforeAll(async () => {
  const { data, error } = await db.auth.admin.createUser({ email, password: "test-password-123", email_confirm: true });
  if (error) throw error;
  userId = data.user.id;
  const t = await createApiToken(db, userId, "test");
  if (!("token" in t)) throw new Error(t.error);
  token = t.token;
  tokenId = (await db.from("api_tokens").select("id").eq("user_id", userId).single()).data!.id;
  await say(`/start ${await createLinkCode(db, userId)}`);
});
afterAll(async () => {
  await db.auth.admin.deleteUser(userId);
  await db.from("telegram_links").delete().eq("chat_id", CHAT);
});

describe("health ingest", () => {
  it("stores tokens hashed, never in plaintext", async () => {
    const { data } = await db.from("api_tokens").select("token_hash, token_prefix").eq("user_id", userId).single();
    expect(data!.token_hash).not.toContain(token);
    expect(data!.token_hash).toHaveLength(64);
    expect(token.startsWith(data!.token_prefix)).toBe(true);
  });

  it("rejects missing, malformed and unknown tokens", async () => {
    expect((await ingest({ date: today, steps: 1 }, null)).status).toBe(401);
    expect((await ingest({ date: today, steps: 1 }, "nope")).status).toBe(401);
    expect((await ingest({ date: today, steps: 1 }, "los_" + "a".repeat(43))).status).toBe(401);
    expect((await GET(new Request("http://x", { headers: { authorization: `Bearer ${token}` } }))).status).toBe(200);
  });

  it("validates input with clear errors", async () => {
    expect((await ingest("not json")).status).toBe(400);
    expect((await ingest({ date: today })).status).toBe(422);
    expect((await ingest({ date: today, steps: -5 })).status).toBe(422);
  });

  it("is idempotent: the same day sent twice is stored once", async () => {
    const body = { date: today, active_kcal: "512.5", resting_kcal: "1,640", steps: "8421" };
    expect((await ingest(body)).status).toBe(200);
    expect((await ingest(body)).status).toBe(200);
    const { count } = await db.from("health_daily").select("*", { count: "exact", head: true }).eq("user_id", userId).eq("date", today);
    expect(count).toBe(1);
    expect(await row()).toMatchObject({ active_kcal: 512.5, resting_kcal: 1640, steps: 8421 });
  });

  it("a partial push merges instead of erasing other metrics; blanks never overwrite", async () => {
    await ingest({ date: today, weight_kg: 68.4, steps: "" });
    expect(await row()).toMatchObject({ active_kcal: 512.5, steps: 8421, weight_kg: 68.4 });
    await ingest({ date: today, steps: 9000 }); // a later value for the same metric replaces it
    expect((await row())!.steps).toBe(9000);
  });

  it("accepts a multi-day backfill", async () => {
    const d1 = localDateString(new Date(Date.now() - 86_400_000), "Asia/Kolkata");
    const d2 = localDateString(new Date(Date.now() - 2 * 86_400_000), "Asia/Kolkata");
    expect((await ingest({ days: [{ date: d1, steps: 100 }, { date: d2, steps: 200 }] })).status).toBe(200);
    const { count } = await db.from("health_daily").select("*", { count: "exact", head: true }).eq("user_id", userId);
    expect(count).toBe(3);
  });

  it("a revoked token stops working immediately", async () => {
    await db.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", tokenId);
    expect((await ingest({ date: today, steps: 1 })).status).toBe(401);
  });

  it("RLS: another user cannot read this user's health data or tokens, and can't write it", async () => {
    const e2 = `p23b-${Date.now()}@example.com`;
    const { data: u2 } = await db.auth.admin.createUser({ email: e2, password: "other-password-123", email_confirm: true });
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await anon.auth.signInWithPassword({ email: e2, password: "other-password-123" });
    expect((await anon.from("health_daily").select("*")).data).toHaveLength(0);
    expect((await anon.from("api_tokens").select("*")).data).toHaveLength(0);
    expect((await anon.from("health_daily").insert({ user_id: userId, date: today, steps: 1 })).error).not.toBeNull();
    expect((await anon.rpc("upsert_health_daily", { p_user: userId, p_date: today, p_data: { steps: 1 }, p_source: "x" })).error).not.toBeNull();
    await db.auth.admin.deleteUser(u2.user!.id);
  });
});

describe("habits via Telegram", () => {
  let habitId = "";
  it("lists today's habits and toggles with a button, updating the message", async () => {
    await createHabit(db, userId, { name: "Yoga", emoji: "🧘" });
    habitId = (await db.from("habits").select("id").eq("user_id", userId).single()).data!.id;
    await say("/habits");
    expect(lastSent().text).toContain("0/1 done");
    await tap(`h|${habitId}|${today}`);
    expect(lastEdit().text).toContain("1/1 done");
    expect((await db.from("habit_logs").select("*").eq("habit_id", habitId)).data).toHaveLength(1);
    await tap(`h|${habitId}|${today}`);
    expect((await db.from("habit_logs").select("*").eq("habit_id", habitId)).data).toHaveLength(0);
  });

  it("refuses to change history from an old message", async () => {
    await tap(`h|${habitId}|2020-01-01`);
    expect((await db.from("habit_logs").select("*").eq("habit_id", habitId)).data).toHaveLength(0);
  });

  it("weekday habits don't appear on unscheduled days", async () => {
    const js = new Date(Date.now() + 5.5 * 3600_000).getUTCDay(); // today's weekday in IST
    const isoToday = js === 0 ? 7 : js;
    const notToday = (isoToday % 7) + 1;
    await createHabit(db, userId, { name: "Gym", weekdays: [notToday] });
    await say("/habits");
    expect(lastSent().text).not.toContain("Gym");
  });
});

describe("journal via Telegram", () => {
  it("mood buttons save the mood and open a reply prompt; the reply becomes the note with tags", async () => {
    await say("/journal");
    const moodBtn = lastSent().reply_markup.inline_keyboard.flat().find((b: any) => b.callback_data.startsWith("j|4|"));
    await tap(moodBtn.callback_data);
    const prompt = sent.filter((s) => s.method === "sendMessage").at(-1)!;
    expect(prompt.body.reply_markup.force_reply).toBe(true);
    const promptId = nextMsgId - 1;
    await say("Good day with family #family #Diwali", promptId);
    const entry = await getJournal(db, userId, today);
    expect(entry).toMatchObject({ mood: 4, notes: "Good day with family #family #Diwali", tags: ["family", "diwali"] });
  });

  it("a normal message after the mood prompt is NOT swallowed as a journal note", async () => {
    await say("/journal");
    const moodBtn = lastSent().reply_markup.inline_keyboard.flat().find((b: any) => b.callback_data.startsWith("j|2|"));
    await tap(moodBtn.callback_data);
    await say("2 idli"); // not a reply to the prompt
    const entry = await getJournal(db, userId, today);
    expect(entry!.notes).toBe("Good day with family #family #Diwali"); // unchanged
  });

  it("/journal with text saves a quick note; mood is preserved", async () => {
    await say("/journal quick thought #work");
    const entry = await getJournal(db, userId, today);
    expect(entry).toMatchObject({ notes: "quick thought #work", tags: ["work"], mood: 2 });
  });
});

describe("/today shows balance", () => {
  it("reports burn and surplus/deficit when health data exists", async () => {
    const { data: log } = await db.from("meal_logs").insert({ user_id: userId, raw_text: "x", status: "confirmed", total_kcal: 2300, meal_type: "lunch" }).select().single();
    await db.from("meal_log_items").insert({ log_id: log!.id, user_id: userId, food_key: "x", name: "Thing", quantity: 1, unit: "plate", kcal: 2300, match_type: "estimated" });
    await db.from("api_tokens").update({ revoked_at: null }).eq("id", tokenId);
    await say("/today");
    expect(lastSent().text).toContain("Balance");
    expect(lastSent().text).toMatch(/surplus|deficit|even/);
  });
});

describe("health numbers by Telegram command", () => {
  it("/burn, /steps, /weight save today's values and merge without erasing each other", async () => {
    const day = (await db.from("health_daily").select("*").eq("user_id", userId).eq("date", today).maybeSingle()).data;
    void day;
    await say("/burn 450 1600");
    expect(lastSent().text).toContain("Saved for today");
    await say("/steps 8,000");
    await say("/weight 68.4");
    const r = (await db.from("health_daily").select("*").eq("user_id", userId).eq("date", today).single()).data!;
    expect(r).toMatchObject({ active_kcal: 450, resting_kcal: 1600, steps: 8000, weight_kg: 68.4, source: "telegram" });
  });
  it("rejects nonsense with a clear message and saves nothing", async () => {
    await say("/weight 5");
    expect(lastSent().text).toContain("Couldn't save");
    await say("/steps");
    expect(lastSent().text).toContain("Send it like");
  });
});

describe("ingest without a date (simple Shortcut)", () => {
  it("defaults to today in the user's timezone and accepts Shortcut-style strings", async () => {
    await db.from("api_tokens").update({ revoked_at: null }).eq("id", tokenId);
    await db.from("health_daily").delete().eq("user_id", userId).eq("date", today);
    const res = await ingest({ steps: "9,001", active_kcal: "333.4", resting_kcal: "" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updated: [today] });
    expect(await row()).toMatchObject({ steps: 9001, active_kcal: 333.4, resting_kcal: null });
  });
});
