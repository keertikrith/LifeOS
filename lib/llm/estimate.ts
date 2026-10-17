import { z } from "zod";
import { generateJson } from "./gemini";

export const estimateSchema = z.object({
  kcal: z.number().min(0).max(3000),
  protein_g: z.number().min(0).max(300),
  carbs_g: z.number().min(0).max(500),
  fat_g: z.number().min(0).max(300),
});
export type NutritionEstimate = z.infer<typeof estimateSchema>;

/** Rough sanity check: 4/4/9 kcal per gram of macros should land within ±35% of the stated kcal. */
export function isPlausibleEstimate(e: NutritionEstimate): boolean {
  if (e.kcal === 0) return e.protein_g + e.carbs_g + e.fat_g < 1;
  const fromMacros = e.protein_g * 4 + e.carbs_g * 4 + e.fat_g * 9;
  return Math.abs(fromMacros - e.kcal) / e.kcal <= 0.35;
}

const SYSTEM = `You estimate nutrition for Indian foods. Give typical values for the TOTAL amount described (not per 100 g).
Use common Indian home/restaurant portion sizes. Be realistic; do not round to zero. Return kcal, protein_g, carbs_g, fat_g.`;

/** LLM fallback used only when the foods table has no match. Callers must flag the result as 'estimated'. */
export async function estimateNutrition(args: {
  name: string;
  variant: string | null;
  quantity: number;
  unit: string;
}): Promise<NutritionEstimate | null> {
  const desc = `${args.quantity} ${args.unit} of ${args.variant ? args.variant + " " : ""}${args.name}`;
  const est = await generateJson({ system: SYSTEM, prompt: `Food: ${desc}`, schema: estimateSchema });
  return isPlausibleEstimate(est) ? est : null;
}
