import type { NewItem } from "@/lib/db/meals";
import { estimateNutrition } from "@/lib/llm/estimate";
import type { ParsedItem } from "@/lib/llm/parser";
import { scaleFood, servingsFor, type Food, type Resolution } from "./matcher";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Item priced from a database row. */
export function matchedItem(food: Food, quantity: number, unit: string, position: number): NewItem {
  const servings = servingsFor(food, quantity, unit);
  return {
    food_id: food.id,
    food_key: food.food_key,
    name: food.name,
    variant: food.variant,
    quantity,
    unit: unit || food.serving_unit,
    ...scaleFood(food, servings),
    match_type: "matched",
    clarify: null,
    position,
  };
}

/** Item priced by the LLM. Always flagged 'estimated' — never presented as a database value. Null if implausible. */
export async function estimatedItem(p: ParsedItem, quantity: number, position: number): Promise<NewItem | null> {
  let est;
  try {
    est = await estimateNutrition({ name: p.display_name, variant: p.variant, quantity, unit: p.unit });
  } catch {
    return null;
  }
  if (!est) return null;
  return {
    food_id: null,
    food_key: p.food_key,
    name: cap(p.display_name),
    variant: p.variant,
    quantity,
    unit: p.unit,
    kcal: Math.round(est.kcal),
    protein_g: est.protein_g,
    carbs_g: est.carbs_g,
    fat_g: est.fat_g,
    match_type: "estimated",
    clarify: null,
    position,
  };
}

const unresolved = (p: ParsedItem, position: number, extra: Partial<NewItem>): NewItem => ({
  food_id: null,
  food_key: p.food_key,
  name: cap(p.display_name),
  variant: p.variant,
  quantity: p.quantity ?? 1,
  unit: p.unit,
  kcal: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  match_type: "unresolved",
  clarify: null,
  position,
  ...extra,
});

export const variantLabel = (f: Food) => `${cap(f.variant ?? f.name)} · ${Math.round(f.kcal)} kcal`;

/** Turns a matcher resolution into a row to store. Returns null when nothing sensible can be priced. */
export async function itemFromResolution(p: ParsedItem, res: Resolution, position: number): Promise<NewItem | null> {
  switch (res.kind) {
    case "matched":
      return matchedItem(res.food, res.quantity, p.unit, position);
    case "clarify_variant":
      return unresolved(p, position, {
        name: cap(p.display_name),
        food_key: res.foodKey,
        clarify: { kind: "variant", qty_known: res.quantity != null, options: res.options.map((f) => ({ food_id: f.id, label: variantLabel(f) })) },
      });
    case "clarify_quantity":
      return unresolved(p, position, { food_id: res.food.id, food_key: res.food.food_key, name: res.food.name, variant: res.food.variant, clarify: { kind: "quantity" } });
    case "unmatched":
      if (p.quantity == null) return unresolved(p, position, { clarify: { kind: "quantity" } });
      return estimatedItem(p, p.quantity, position);
  }
}
