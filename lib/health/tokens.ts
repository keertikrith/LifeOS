import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const MAX_ACTIVE_TOKENS = 10;

/** Creates an ingest token. The plaintext is returned once; only its SHA-256 is stored. Service-role client required. */
export type TokenKind = "ingest" | "mcp";
const PREFIX: Record<TokenKind, string> = { ingest: "los_", mcp: "lmcp_" };

export async function createApiToken(db: SupabaseClient, userId: string, name: string, kind: TokenKind = "ingest"): Promise<{ token: string } | { error: string }> {
  const { count } = await db.from("api_tokens").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", kind).is("revoked_at", null);
  if ((count ?? 0) >= MAX_ACTIVE_TOKENS) return { error: `You can have up to ${MAX_ACTIVE_TOKENS} active tokens. Revoke one first.` };
  const token = `${PREFIX[kind]}${randomBytes(32).toString("base64url")}`;
  const { error } = await db.from("api_tokens").insert({ user_id: userId, name: name.trim().slice(0, 60) || (kind === "mcp" ? "Chat app" : "iPhone Shortcut"), kind, token_hash: hashToken(token), token_prefix: token.slice(0, 8) });
  if (error) return { error: "Couldn't create the token. Please try again." };
  return { token };
}

/** Resolves a presented token to its user, or null if unknown/revoked. Records last use (best effort). */
export async function verifyApiToken(db: SupabaseClient, token: string, kind: TokenKind = "ingest"): Promise<string | null> {
  if (!new RegExp(`^${PREFIX[kind]}[A-Za-z0-9_-]{20,100}$`).test(token)) return null;
  const { data } = await db.from("api_tokens").select("id, user_id").eq("token_hash", hashToken(token)).eq("kind", kind).is("revoked_at", null).maybeSingle();
  if (!data) return null;
  void db.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {});
  return data.user_id as string;
}

export function tokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-api-key")?.trim() || null;
}
