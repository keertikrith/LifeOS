import type { SupabaseClient } from "@supabase/supabase-js";
import { parseIngestBody } from "./ingest";

/** Saves hand-entered health numbers using the same validation and idempotent merge as the ingest API. */
export async function saveHealthManual(db: SupabaseClient, userId: string, date: string, metrics: Record<string, unknown>, source: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = parseIngestBody({ date, ...metrics });
  if (!parsed.ok) return { ok: false, error: parsed.error.replace(/^day 1: /, "") };
  const { date: d, ...rest } = parsed.days[0];
  const { error } = await db.rpc("upsert_health_daily", { p_user: userId, p_date: d, p_data: rest, p_source: source });
  return error ? { ok: false, error: "Couldn't save that. Please try again." } : { ok: true };
}
