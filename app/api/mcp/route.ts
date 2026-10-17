import { tokenFromRequest } from "@/lib/health/tokens";
import { handleMcp } from "@/lib/mcp/http";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Same server for clients that can send `Authorization: Bearer <token>` instead of using the connect link. */
const run = (request: Request) => handleMcp(request, tokenFromRequest(request));
export const GET = run;
export const POST = run;
export const DELETE = run;
