import { z } from "zod";
import { generateJson } from "./gemini";

/** What the model must return for a free-text meal message. Validated before anything touches the DB. */
export const parsedItemSchema = z.object({
  /** Canonical English dish key from the known list (e.g. "dosa", "filter_coffee"), or best-guess snake_case if not on the list. */
  food_key: z.string().min(1).max(80),
  /** The dish as the user said it, for display. */
  display_name: z.string().min(1).max(120),
  /** "masala", "plain", "ghee roast"… null if the user did not say. */
  variant: z.string().max(60).nullable(),
  /** null only when the user gave no amount at all ("had some rice"). "a dosa" => 1. */
  quantity: z.number().positive().max(100).nullable(),
  /** piece, plate, bowl, cup, glass, katori, spoon, g, ml… */
  unit: z.string().min(1).max(30),
});

export const parsedMealSchema = z.object({
  is_food_log: z.boolean(),
  meal_type: z.enum(["breakfast", "lunch", "snack", "dinner"]).nullable(),
  items: z.array(parsedItemSchema).max(20),
});

export type ParsedItem = z.infer<typeof parsedItemSchema>;
export type ParsedMeal = z.infer<typeof parsedMealSchema>;

/** Normalises a validated parse: lower-cased keys/units, trimmed variants, dropped empties. */
export function validateParsedMeal(raw: unknown): ParsedMeal {
  const parsed = parsedMealSchema.parse(raw);
  return {
    ...parsed,
    items: parsed.items.map((i) => ({
      ...i,
      food_key: i.food_key.trim().toLowerCase().replace(/[\s-]+/g, "_"),
      variant: i.variant?.trim().toLowerCase() || null,
      unit: i.unit.trim().toLowerCase(),
    })),
  };
}

const SYSTEM = `You extract structured food logs from messages written by an Indian user.
The user may write in English, Hindi, Kannada, Telugu, Tamil, or a mix (Hinglish/Kanglish), in Latin or native script.
Rules:
- Return every distinct food or drink eaten. Ignore chatter. If the message is not about eating/drinking, set is_food_log=false and items=[].
- food_key: map to the closest key in KNOWN_KEYS when one fits (e.g. "dose" -> "dosa", "chai" -> "chai", "ಇಡ್ಲಿ" -> "idli", "रोटी"/"chapati" -> "roti", "annam"/"chawal" -> "rice"). If nothing fits, invent a short English snake_case key.
- variant: only if the user said it ("masala dosa" => key "dosa", variant "masala"). Never guess a variant.
- quantity: use the number stated ("2 dosa" => 2, "a glass" => 1, "half" => 0.5). If no amount is given at all, use null. Do not invent amounts.
- unit: the unit stated, else the natural count unit (dosa/idli/roti => "piece", rice/sambar => "bowl", coffee/chai => "cup").
- meal_type: only if stated or clearly implied ("for breakfast", "lunch ki", "dinner"); otherwise null.
- Do not estimate calories. Only extract.`;

export async function parseMealText(text: string, knownKeys: string[]): Promise<ParsedMeal> {
  const raw = await generateJson({
    system: SYSTEM,
    prompt: `KNOWN_KEYS: ${knownKeys.join(", ")}\n\nMESSAGE:\n${text}`,
    schema: parsedMealSchema,
  });
  return validateParsedMeal(raw);
}
