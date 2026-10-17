import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env } from "@/lib/env";

let client: GoogleGenAI | null = null;
function ai() {
  return (client ??= new GoogleGenAI({ apiKey: env.geminiApiKey() }));
}

/** Provider said "slow down" (HTTP 429, e.g. free-tier per-minute cap). Callers show a "busy, try again" message. */
export class LlmRateLimitError extends Error {}

const isRateLimit = (e: unknown) => (e as { status?: number })?.status === 429 || /RESOURCE_EXHAUSTED|"code":429/.test(String(e));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class LlmValidationError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
  }
}

/**
 * Calls Gemini for structured JSON and validates it with zod.
 * Retries once on invalid output. The model comes from GEMINI_MODEL — swap tier/model via env only.
 * All LLM access in the app goes through here, so changing provider later touches this file only.
 */
export async function generateJson<T extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: T;
  temperature?: number;
}): Promise<z.infer<T>> {
  const jsonSchema = z.toJSONSchema(opts.schema, { target: "draft-7" });
  let lastError: unknown;
  let lastRaw = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const call = () =>
      ai().models.generateContent({
        model: env.geminiModel(),
        contents: attempt === 0 ? opts.prompt : `${opts.prompt}\n\n(Your previous reply was invalid JSON for the schema. Reply again with valid JSON only.)`,
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema,
          temperature: opts.temperature ?? 0.1,
        },
      });
    let res;
    try {
      res = await call();
    } catch (e) {
      if (!isRateLimit(e)) throw e;
      await sleep(6000); // one patient retry: per-minute caps often clear within seconds
      try {
        res = await call();
      } catch (e2) {
        if (isRateLimit(e2)) throw new LlmRateLimitError("Gemini rate limit");
        throw e2;
      }
    }
    lastRaw = res.text ?? "";
    try {
      return opts.schema.parse(JSON.parse(lastRaw));
    } catch (e) {
      lastError = e;
    }
  }
  throw new LlmValidationError(`Gemini returned invalid output: ${String(lastError)}`, lastRaw);
}
