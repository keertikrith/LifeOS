import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/db/clients";
import { runNudges } from "@/lib/notify/run";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // never open by default
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

async function handle(request: Request) {
  if (!authorised(request)) return new Response("forbidden", { status: 403 });
  try {
    return Response.json({ ok: true, ...(await runNudges(adminClient())) });
  } catch (e) {
    console.error("cron nudges failed", e);
    return Response.json({ ok: false }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
