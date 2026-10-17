/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- loose typing for stubbed Telegram payloads */
// End-to-end bot flow against the LOCAL Supabase (npx supabase start). Gemini and Telegram are stubbed.
// Run: npm run test:int
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.GEMINI_API_KEY = "test";

type Script = (prompt: string) => unknown;
let script: Script = () => ({});
vi.mock("@/lib/llm/gemini", async (orig) => ({ ...(await orig<object>()), generateJson: vi.fn(async ({ prompt }: { prompt: string }) => script(prompt)) }));

const sent: { method: string; body: any }[] = [];
const realFetch = globalThis.fetch;
let nextMsgId = 100;
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
const { handleUpdate } = await import("@/lib/telegram/service");

const db = adminClient();
const CHAT = 777000 + Math.floor(Math.random() * 1000);
let userId = "";
const email = `bot-test-${Date.now()}@example.com`;

const say = (text: string) => handleUpdate(db, { message: { message_id: 1, chat: { id: CHAT }, text } });
const tap = (data: string, messageId = 100) => handleUpdate(db, { callback_query: { id: "cb", data, message: { message_id: messageId, chat: { id: CHAT } } } });
const lastSent = () => sent.filter((s) => s.method === "sendMessage").at(-1)!.body;
const lastEdit = () => sent.filter((s) => s.method === "editMessageText").at(-1)!.body;
const buttons = (b: any) => (b.reply_markup?.inline_keyboard ?? []).flat().map((x: any) => x.callback_data as string);

const parse = (items: any[], meal_type: string | null = null) => ({ is_food_log: true, meal_type, items });
const item = (food_key: string, over: any = {}) => ({ food_key, display_name: food_key, variant: null, quantity: 1, unit: "piece", ...over });

beforeAll(async () => {
  const { data, error } = await db.auth.admin.createUser({ email, password: "test-password-123", email_confirm: true });
  if (error) throw error;
  userId = data.user.id;
});
afterAll(async () => {
  await db.auth.admin.deleteUser(userId);
  await db.from("telegram_links").delete().eq("chat_id", CHAT);
});

describe("Telegram bot flow", () => {
  it("refuses unlinked chats, then links with a one-time code (and rejects reuse)", async () => {
    await say("2 idli");
    expect(lastSent().text).toContain("not linked");

    const code = await createLinkCode(db, userId);
    await say(`/start ${code}`);
    expect(lastSent().text).toContain("Linked");

    await say(`/start ${code}`);
    expect(lastSent().text).toContain("invalid or expired");
  });

  it("asks for the variant instead of guessing; no Confirm until answered", async () => {
    script = (p) => parse([item("dosa", { quantity: 2 }), item("filter_coffee", { unit: "cup" })]);
    await say("2 dosa and filter coffee");
    const msg = lastSent();
    const b = buttons(msg);
    expect(msg.text).toContain("needs your input");
    expect(b.filter((x: string) => x.startsWith("v|")).length).toBe(6); // six dosa variants
    expect(b.some((x: string) => x.startsWith("ok|"))).toBe(false);
  });

  it("variant pick prices from the DB, enables Confirm, and saves the default", async () => {
    const kb = lastSent().reply_markup.inline_keyboard.flat();
    const masala = kb.find((b: any) => b.text.startsWith("Masala"));
    await tap(masala.callback_data);
    const edit = lastEdit();
    expect(edit.text).toContain("Masala dosa");
    expect(edit.text).toContain("Total: 590 kcal");
    expect(buttons(edit).some((x: string) => x.startsWith("ok|"))).toBe(true);

    const { data } = await db.from("user_food_defaults").select("*").eq("user_id", userId);
    expect(data).toHaveLength(1);
    expect(Number(data![0].quantity)).toBe(2);
  });

  it("confirm saves the log; /today reports it", async () => {
    const ok = buttons(lastEdit()).find((x: string) => x.startsWith("ok|"))!;
    await tap(ok);
    expect(lastEdit().text).toContain("Saved");
    await say("/today");
    expect(lastSent().text).toContain("590");
  });

  it("uses the saved default for a bare 'dosa' (variant + quantity) without asking", async () => {
    script = () => parse([item("dosa", { quantity: null })]);
    await say("dosa");
    const msg = lastSent();
    expect(msg.text).toContain("Masala dosa");
    expect(msg.text).toContain("500");
    expect(buttons(msg).some((x: string) => x.startsWith("ok|"))).toBe(true);
  });

  it("flags unknown dishes as estimated, never as database values", async () => {
    script = (prompt) =>
      prompt.startsWith("Food:") ? { kcal: 320, protein_g: 12, carbs_g: 38, fat_g: 12 } : parse([item("quinoa_salad", { display_name: "quinoa salad", unit: "bowl" })]);
    await say("a bowl of quinoa salad");
    expect(lastSent().text).toContain("estimated");
    const { data } = await db.from("meal_log_items").select("match_type, food_id").eq("user_id", userId).eq("food_key", "quinoa_salad");
    expect(data![0]).toMatchObject({ match_type: "estimated", food_id: null });
  });

  it("asks for quantity when none is given and no default exists", async () => {
    script = () => parse([item("idli", { quantity: null })]);
    await say("had idli");
    const b = buttons(lastSent());
    expect(b.filter((x: string) => x.startsWith("q|")).length).toBe(4);
    await tap(b.find((x: string) => x.endsWith("|3"))!);
    expect(lastEdit().text).toContain("174"); // 3 × 58
  });

  it("✏️ change quantity takes a typed number and updates the default", async () => {
    const edit = buttons(lastEdit()).find((x: string) => x.startsWith("ok|"))!;
    const logId = edit.split("|")[1];
    await tap(`eq|${logId}|-1`);
    expect(lastSent().text).toContain("How many");
    await say("4");
    const { data } = await db.from("user_food_defaults").select("quantity").eq("user_id", userId).eq("food_key", "idli").single();
    expect(Number(data!.quantity)).toBe(4);
  });

  it("/undo removes the most recent log", async () => {
    const before = await db.from("meal_logs").select("id").eq("user_id", userId);
    await say("/undo");
    const after = await db.from("meal_logs").select("id").eq("user_id", userId);
    expect(after.data!.length).toBe(before.data!.length - 1);
  });

  it("auto-confirms stale pending logs (and expires ones still waiting on an answer)", async () => {
    script = () => parse([item("idli", { quantity: 2 })]);
    await say("2 idli");
    script = () => parse([item("dosa", { quantity: 1, variant: "rava" })]); // resolved
    await say("rava dosa");
    script = () => parse([item("chai", { quantity: 1, unit: "cup" })]); // ambiguous: sugar / sugarless… default none
    await say("chai");
    await db.from("meal_logs").update({ created_at: new Date(Date.now() - 20 * 60_000).toISOString() }).eq("user_id", userId).eq("status", "pending");
    await say("/today");
    const { data } = await db.from("meal_logs").select("status").eq("user_id", userId);
    expect(data!.some((l) => l.status === "pending")).toBe(false);
    expect(data!.some((l) => l.status === "expired")).toBe(true);
  });
});

describe("Row-level security", () => {
  it("a signed-in user cannot read another user's logs", async () => {
    const otherEmail = `other-${Date.now()}@example.com`;
    const { data: other } = await db.auth.admin.createUser({ email: otherEmail, password: "other-password-123", email_confirm: true });
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await anon.auth.signInWithPassword({ email: otherEmail, password: "other-password-123" });

    const logs = await anon.from("meal_logs").select("id");
    const links = await anon.from("telegram_links").select("user_id");
    const foods = await anon.from("foods").select("id").limit(1); // global foods ARE readable
    expect(logs.data).toHaveLength(0);
    expect(links.data).toHaveLength(0);
    expect(foods.data!.length).toBe(1);

    const spoof = await anon.from("meal_logs").insert({ user_id: userId, raw_text: "x" });
    expect(spoof.error).not.toBeNull();
    await db.auth.admin.deleteUser(other.user!.id);
  });
});
