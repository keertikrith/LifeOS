/* eslint-disable @typescript-eslint/no-explicit-any */
// Nudges, workouts and the social plan against LOCAL Supabase. Run: npm run test:int
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.GEMINI_API_KEY = "test";
process.env.CRON_SECRET = "cron-test-secret";
vi.mock("@/lib/llm/gemini", async (orig) => ({ ...(await orig<object>()), generateJson: vi.fn(async () => ({})) }));

const sent: { method: string; body: any }[] = [];
const realFetch = globalThis.fetch;
let nextMsgId = 900;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  if (url.startsWith("https://api.telegram.org/")) {
    sent.push({ method: url.split("/").pop()!, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: nextMsgId++ } }));
  }
  return realFetch(input, init);
}) as typeof fetch;

const { adminClient } = await import("@/lib/db/clients");
const { createLinkCode } = await import("@/lib/db/meals");
const { createHabit } = await import("@/lib/db/life");
const { handleUpdate } = await import("@/lib/telegram/service");
const { runNudges } = await import("@/lib/notify/run");
const { GET } = await import("@/app/api/cron/nudges/route");
const { localDateString } = await import("@/lib/time/day");

const db = adminClient();
const CHAT = 870000 + Math.floor(Math.random() * 1000);
let userId = "";
const email = `p4-${Date.now()}@example.com`;
const today = localDateString(new Date(), "Asia/Kolkata");
const say = (text: string) => handleUpdate(db, { message: { message_id: 1, chat: { id: CHAT }, text } });
const tap = (data: string) => handleUpdate(db, { callback_query: { id: "cb", data, message: { message_id: 1, chat: { id: CHAT } } } });
const mine = () => sent.filter((s) => s.method === "sendMessage" && s.body.chat_id === CHAT);
const lastSent = () => mine().at(-1)!.body;
const at = (h: number) => new Date(Date.parse(`${today}T00:00:00Z`) + (h - 5.5) * 3_600_000);

beforeAll(async () => {
  const { data, error } = await db.auth.admin.createUser({ email, password: "test-password-123", email_confirm: true });
  if (error) throw error;
  userId = data.user.id;
  await say(`/start ${await createLinkCode(db, userId)}`);
  await db.from("profiles").update({ timezone: "Asia/Kolkata", day_start_hour: 0, calorie_target: 2000 }).eq("id", userId);
});
afterAll(async () => {
  await db.auth.admin.deleteUser(userId);
  await db.from("telegram_links").delete().eq("chat_id", CHAT);
});

describe("workouts", () => {
  it("logs lifts and marks a workout done", async () => {
    await say("/lift bench press 3x8 40");
    expect(lastSent().text).toContain("bench press");
    await say("/lift nonsense");
    expect(lastSent().text).toContain("Send it like");
    const { data: sets } = await db.from("workout_sets").select("*").eq("user_id", userId);
    expect(sets).toHaveLength(1);
    expect(Number(sets![0].weight_kg)).toBe(40);
    await say("/workout");
    expect(lastSent().text).toContain("already logged");
    const { data: sessions } = await db.from("workout_sessions").select("id").eq("user_id", userId);
    expect(sessions).toHaveLength(1);
  });
  it("the Done button logs a session once", async () => {
    await db.from("workout_sessions").delete().eq("user_id", userId);
    await tap(`w|${today}`);
    await tap(`w|${today}`);
    const { data } = await db.from("workout_sessions").select("id").eq("user_id", userId);
    expect(data).toHaveLength(1);
  });
});

describe("social plan", () => {
  it("plans a night out and counts the month", async () => {
    await say("/out sat");
    expect(lastSent().text).toContain("Eating out".toLowerCase());
    await say("/drinks tomorrow");
    await say("/out notaday");
    expect(lastSent().text).toContain("Send it like");
    const { data } = await db.from("social_events").select("kind, date").eq("user_id", userId);
    expect(data).toHaveLength(2);
    await say("/budget");
    expect(lastSent().text).toMatch(/Eating out: \d\/4/);
  });
});

describe("nudges", () => {
  it("cron rejects callers without the secret", async () => {
    expect((await GET(new Request("http://x/api/cron/nudges"))).status).toBe(403);
    expect((await GET(new Request("http://x/api/cron/nudges", { headers: { authorization: "Bearer wrong" } }))).status).toBe(403);
  });
  it("controls: hours, pause, off", async () => {
    await say("/hours 8 21");
    expect((await db.from("profiles").select("wake_hour, sleep_hour").eq("id", userId).single()).data).toEqual({ wake_hour: 8, sleep_hour: 21 });
    await say("/hours 9 3");
    expect(lastSent().text).toContain("Send it like");
    await say("/hours 7 22");
  });
  it("nudges once when nothing is logged, then waits", async () => {
    const before = mine().length;
    const r = await runNudges(db, at(14));
    expect(r.errors).toBe(0);
    expect(mine().length).toBe(before + 1);
    expect(lastSent().text).toContain("Nothing logged yet");
    await runNudges(db, at(15)); // under 170 minutes later
    expect(mine().length).toBe(before + 1);
  });
  it("offers open habits as buttons later in the day", async () => {
    await createHabit(db, userId, { name: "Walk", emoji: "🚶" });
    await runNudges(db, at(18));
    expect(lastSent().text).toContain("Walk");
    expect(JSON.stringify(lastSent().reply_markup)).toContain(`h|`);
  });
  it("stays quiet outside waking hours, when paused or switched off", async () => {
    await db.from("profiles").update({ last_nudge_at: null }).eq("id", userId);
    const n = mine().length;
    await runNudges(db, at(3));
    await runNudges(db, at(23));
    expect(mine().length).toBe(n);
    await say("/pause 24");
    const n2 = mine().length;
    await runNudges(db, at(14));
    expect(mine().length).toBe(n2);
    await say("/resume");
    await say("/nudges off");
    const n3 = mine().length;
    await runNudges(db, at(14));
    expect(mine().length).toBe(n3);
    await say("/nudges on");
  });
});
