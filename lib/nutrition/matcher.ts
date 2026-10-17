import type { ParsedItem } from "@/lib/llm/parser";

export interface Food {
  id: string;
  user_id: string | null;
  food_key: string;
  name: string;
  variant: string | null;
  aliases: string[];
  serving_desc: string;
  serving_unit: string;
  serving_grams: number | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: "ifct2017" | "curated_estimate" | "user";
}

export interface UserDefault {
  food_key: string;
  food_id: string;
  quantity: number;
}

export type Resolution =
  | { kind: "matched"; food: Food; quantity: number; servings: number }
  | { kind: "clarify_variant"; foodKey: string; options: Food[]; quantity: number | null }
  | { kind: "clarify_quantity"; food: Food }
  | { kind: "unmatched" };

export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/[^\p{L}\p{M}\p{N} ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

const GRAM_UNITS = new Set(["g", "gm", "gms", "gram", "grams", "ml", "millilitre", "millilitres"]);

/** How many of the food's servings the user's quantity/unit represents. */
export function servingsFor(food: Food, quantity: number, unit: string): number {
  if (GRAM_UNITS.has(normalize(unit)) && food.serving_grams && food.serving_grams > 0) {
    return quantity / food.serving_grams;
  }
  return quantity;
}

export function scaleFood(food: Food, servings: number) {
  const r = (n: number) => Math.round(n * servings * 10) / 10;
  return { kcal: r(food.kcal), protein_g: r(food.protein_g), carbs_g: r(food.carbs_g), fat_g: r(food.fat_g) };
}

/** All catalog rows sharing one dish (its variants). User-created rows shadow global rows with the same variant. */
export function candidatesFor(catalog: Food[], item: Pick<ParsedItem, "food_key" | "display_name">): Food[] {
  const key = normalize(item.food_key);
  const name = normalize(item.display_name);

  const byKey = catalog.filter((f) => normalize(f.food_key) === key);
  if (byKey.length) return dedupeVariants(byKey);

  // IFCT raw-ingredient groups are keyed "ifct_<base>"; curated dishes above always win
  const byIfct = catalog.filter((f) => [normalize(`ifct_${item.food_key}`), normalize(`ifct_${item.display_name}`)].includes(normalize(f.food_key)));
  if (byIfct.length) return dedupeVariants(byIfct);

  const byAlias = catalog.filter((f) => f.aliases.some((a) => [key, name].includes(normalize(a))));
  if (byAlias.length) return dedupeVariants(catalog.filter((f) => f.food_key === byAlias[0].food_key));

  const byName = catalog.filter((f) => [key, name].includes(normalize(f.name)));
  if (byName.length) return dedupeVariants(catalog.filter((f) => f.food_key === byName[0].food_key));

  // typo tolerance: only for reasonably long words, to avoid false matches like "ragi" vs "rasam"
  if (key.length >= 5) {
    const near = catalog.find((f) => {
      const k = normalize(f.food_key);
      return levenshtein(k, key) <= 1 || f.aliases.some((a) => normalize(a).length >= 5 && levenshtein(normalize(a), key) <= 1);
    });
    if (near) return dedupeVariants(catalog.filter((f) => f.food_key === near.food_key));
  }
  return [];
}

function dedupeVariants(rows: Food[]): Food[] {
  const m = new Map<string, Food>();
  for (const f of rows) {
    const k = f.variant ?? "";
    const cur = m.get(k);
    if (!cur || (f.user_id && !cur.user_id)) m.set(k, f);
  }
  return [...m.values()];
}

function findVariant(options: Food[], variant: string): Food | undefined {
  const v = normalize(variant);
  return (
    options.find((f) => f.variant && normalize(f.variant) === v) ??
    options.find((f) => f.aliases.some((a) => normalize(a) === v)) ??
    options.find((f) => f.variant && (normalize(f.variant).includes(v) || v.includes(normalize(f.variant))))
  );
}

/**
 * Resolves one parsed item. Order: explicit variant -> single-variant dish -> user's saved default -> ask.
 * Never guesses a variant or quantity. 'unmatched' means the caller may fall back to a flagged LLM estimate.
 */
export function resolveItem(item: ParsedItem, catalog: Food[], defaults: UserDefault[]): Resolution {
  const options = candidatesFor(catalog, item);
  if (!options.length) return { kind: "unmatched" };

  // IFCT rows are per 100 g. "1 piece"/"1 bowl" would silently assume 100 g, so only grams/ml match them;
  // anything else falls through to a clearly-flagged estimate instead of a wrong "database" number.
  if (options.every((o) => o.serving_unit === "g") && !GRAM_UNITS.has(normalize(item.unit))) return { kind: "unmatched" };

  const foodKey = options[0].food_key;
  const saved = defaults.find((d) => d.food_key === foodKey);

  let food: Food | undefined;
  if (item.variant) {
    food = findVariant(options, item.variant);
    if (!food) return { kind: "clarify_variant", foodKey, options, quantity: item.quantity };
  } else if (options.length === 1) {
    food = options[0];
  } else if (saved) {
    food = options.find((f) => f.id === saved.food_id);
  }
  if (!food) return { kind: "clarify_variant", foodKey, options, quantity: item.quantity };

  const quantity = item.quantity ?? (saved && saved.food_id === food.id ? saved.quantity : null);
  if (quantity == null) return { kind: "clarify_quantity", food };

  return { kind: "matched", food, quantity, servings: servingsFor(food, quantity, item.unit) };
}
