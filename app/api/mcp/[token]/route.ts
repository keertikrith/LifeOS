import { handleMcp } from "@/lib/mcp/http";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };
const run = async (request: Request, { params }: Ctx) => handleMcp(request, (await params).token);

export const GET = run;
export const POST = run;
export const DELETE = run;
