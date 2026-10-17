import { adminClient } from "@/lib/db/clients";
import { parseIngestBody } from "@/lib/health/ingest";
import { tokenFromRequest, verifyApiToken } from "@/lib/health/tokens";

export const maxDuration = 15;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * Source-agnostic health ingest: iOS Shortcuts today, a native HealthKit app later.
 * Auth: per-user token in `Authorization: Bearer <token>` (or `X-API-Key`), stored hashed.
 * Idempotent: one row per (user, date); resending a day merges and never double-counts.
 */
export async function POST(request: Request) {
  const db = adminClient();
  const token = tokenFromRequest(request);
  const userId = token ? await verifyApiToken(db, token) : null;
  if (!userId) return json({ ok: false, error: "invalid or revoked token" }, 401);

  const text = await request.text();
  if (text.length > 200_000) return json({ ok: false, error: "payload too large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ ok: false, error: "body must be valid JSON" }, 400);
  }

  const parsed = parseIngestBody(body);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 422);

  const source = request.headers.get("x-source")?.slice(0, 30) || "shortcut";
  for (const day of parsed.days) {
    const { date, ...metrics } = day;
    const { error } = await db.rpc("upsert_health_daily", { p_user: userId, p_date: date, p_data: metrics, p_source: source });
    if (error) {
      console.error("ingest upsert failed", error.message);
      return json({ ok: false, error: "could not save data" }, 500);
    }
  }
  return json({ ok: true, updated: parsed.days.map((d) => d.date) });
}

/** Lets a Shortcut (or you, with curl) check that a token works without sending data. */
export async function GET(request: Request) {
  const token = tokenFromRequest(request);
  const userId = token ? await verifyApiToken(adminClient(), token) : null;
  return userId ? json({ ok: true }) : json({ ok: false, error: "invalid or revoked token" }, 401);
}
