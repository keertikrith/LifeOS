import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { adminClient } from "@/lib/db/clients";
import { verifyApiToken } from "@/lib/health/tokens";
import { buildServer } from "./server";

const unauthorised = () =>
  Response.json({ jsonrpc: "2.0", error: { code: -32001, message: "Invalid or revoked Life OS connection. Create a new connect link in Settings." }, id: null }, { status: 401, headers: { "cache-control": "no-store" } });

/** One stateless MCP exchange. The token (from the connect link or a Bearer header) decides whose data every tool touches. */
export async function handleMcp(request: Request, token: string | null): Promise<Response> {
  const db = adminClient();
  const userId = token ? await verifyApiToken(db, token, "mcp") : null;
  if (!userId) return unauthorised();

  const server = buildServer({ db, userId });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    void transport.close();
  }
}
