/* eslint-disable @typescript-eslint/no-explicit-any */
// The MCP connector, driven by the real MCP client SDK against LOCAL Supabase. Run: npm run test:int
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { adminClient } = await import("@/lib/db/clients");
const { createApiToken } = await import("@/lib/health/tokens");
const route = await import("@/app/api/mcp/[token]/route");
const ingest = await import("@/app/api/health/ingest/route");

const db = adminClient();
let userId = "", token = "", foodId = "";
const email = `mcp-${Date.now()}@example.com`;

/** Routes the SDK's HTTP calls straight into the Next route handlers. */
const handlerFetch = (tok: string) => (async (input: any, init?: any) => {
  const req = new Request(input, init);
  return route.POST(req, { params: Promise.resolve({ token: tok }) });
}) as typeof fetch;

async function connect(tok = token) {
  const client = new Client({ name: "test", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://x/api/mcp/${tok}`), { fetch: handlerFetch(tok) }));
  return client;
}
const call = async (c: Client, name: string, args: Record<string, unknown> = {}) => {
  const r: any = await c.callTool({ name, arguments: args });
  const t = r.content[0].text as string;
  let json: any = null;
  try { json = JSON.parse(t); } catch { /* plain text */ }
  return { isError: !!r.isError, text: t, json };
};

beforeAll(async () => {
  const { data, error } = await db.auth.admin.createUser({ email, password: "test-password-123", email_confirm: true });
  if (error) throw error;
  userId = data.user.id;
  await db.from("profiles").update({ timezone: "Asia/Kolkata", day_start_hour: 0, calorie_target: 2000 }).eq("id", userId);
  const t = await createApiToken(db, userId, "chat", "mcp");
  if (!("token" in t)) throw new Error(t.error);
  token = t.token;
  foodId = (await db.from("foods").select("id").is("user_id", null).eq("food_key", "idli").limit(1).single()).data!.id;
});
afterAll(async () => { await db.auth.admin.deleteUser(userId); });

describe("mcp connector", () => {
  it("lists tools and carries the logging instructions", async () => {
    const c = await connect();
    const names = (await c.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["search_foods", "log_meal", "get_day", "get_week", "log_health", "log_workout", "get_coach", "set_habit", "plan_social_event"]));
    expect(c.getInstructions()).toContain("search_foods");
    await c.close();
  });

  it("searches the database, then logs a matched item with database numbers", async () => {
    const c = await connect();
    const found = await call(c, "search_foods", { query: "idli" });
    expect(found.json.results.length).toBeGreaterThan(0);
    const idli = found.json.results.find((r: any) => r.food_id === foodId) ?? found.json.results[0];
    const logged = await call(c, "log_meal", { items: [{ food_id: idli.food_id, name: "Idli", quantity: 2 }] });
    expect(logged.isError).toBe(false);
    expect(logged.json.logged.items[0].estimated).toBe(false);
    expect(logged.json.logged.total_kcal).toBeCloseTo(idli.kcal * 2, 0);
    expect(logged.json.remaining_kcal).toBe(2000 - logged.json.day_total_kcal);
    await c.close();
  });

  it("stores unknown foods as estimates and refuses them without kcal", async () => {
    const c = await connect();
    const est = await call(c, "log_meal", { items: [{ name: "Grandma's special sweet", quantity: 1, unit: "piece", kcal: 180, protein_g: 2 }] });
    expect(est.json.logged.items[0].estimated).toBe(true);
    expect((await call(c, "log_meal", { items: [{ name: "Mystery", quantity: 1 }] })).isError).toBe(true);
    expect((await call(c, "log_meal", { items: [{ food_id: "00000000-0000-4000-8000-000000000000", name: "x", quantity: 1 }] })).isError).toBe(true);
    await c.close();
  });

  it("summarises the day, fixes a mistake, and blocks future dates", async () => {
    const c = await connect();
    const day = await call(c, "get_day");
    expect(day.json.eaten_kcal).toBeGreaterThan(0);
    expect(day.json.balance).toBe("no burn data");
    const meals = await call(c, "list_meals");
    await call(c, "delete_meal", { meal_id: meals.json.meals[0].meal_id });
    expect((await call(c, "list_meals")).json.meals).toHaveLength(meals.json.meals.length - 1);
    expect((await call(c, "log_health", { date: "2999-01-01", steps: 1 })).isError).toBe(true);
    await c.close();
  });

  it("logs health, workouts, habits-free journal and a social plan", async () => {
    const c = await connect();
    expect((await call(c, "log_health", { steps: 8000, sleep_hours: 7.5, weight_kg: 70.2 })).isError).toBe(false);
    expect((await call(c, "log_workout", { title: "Push", minutes: 40, lifts: [{ exercise: "Bench press", sets: 3, reps: 8, weight_kg: 40 }] })).isError).toBe(false);
    expect((await call(c, "log_journal", { mood: 4, notes: "good day #gym" })).isError).toBe(false);
    const day = await call(c, "get_day");
    expect(day.json.health).toMatchObject({ steps: 8000, sleep_hours: 7.5, weight_kg: 70.2 });
    expect(day.json.workout_logged).toBe(true);
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const plan = await call(c, "plan_social_event", { kind: "out", date: future });
    expect(plan.json.saved).toBe(true);
    expect((await call(c, "get_social_budget")).json.eating_out.used).toBeGreaterThanOrEqual(1);
    await c.close();
  });

  it("rejects bad, revoked and wrong-kind tokens", async () => {
    const bad = await route.POST(new Request("http://x/api/mcp/lmcp_nope", { method: "POST", body: "{}" }), { params: Promise.resolve({ token: "lmcp_nope" }) });
    expect(bad.status).toBe(401);
    const ing = await createApiToken(db, userId, "shortcut", "ingest");
    if (!("token" in ing)) throw new Error(ing.error);
    const wrongKind = await route.POST(new Request("http://x", { method: "POST", body: "{}" }), { params: Promise.resolve({ token: ing.token }) });
    expect(wrongKind.status).toBe(401);
    // …and an MCP token must not work as a health-ingest token
    const asIngest = await ingest.POST(new Request("http://x/api/health/ingest", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ steps: 1 }) }));
    expect(asIngest.status).toBe(401);
    await db.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).eq("kind", "mcp");
    const revoked = await route.POST(new Request("http://x", { method: "POST", body: "{}" }), { params: Promise.resolve({ token }) });
    expect(revoked.status).toBe(401);
  });
});
