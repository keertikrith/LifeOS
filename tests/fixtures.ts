import type { Food } from "@/lib/nutrition/matcher";

let n = 0;
export function food(p: Partial<Food> & Pick<Food, "food_key" | "name">): Food {
  return {
    id: `f${++n}`,
    user_id: null,
    variant: null,
    aliases: [],
    serving_desc: "1 piece",
    serving_unit: "piece",
    serving_grams: null,
    kcal: 100,
    protein_g: 3,
    carbs_g: 15,
    fat_g: 3,
    source: "curated_estimate",
    ...p,
  };
}

export const catalog: Food[] = [
  food({ food_key: "dosa", name: "Plain dosa", variant: "plain", aliases: ["dose", "dosai"], kcal: 133 }),
  food({ food_key: "dosa", name: "Masala dosa", variant: "masala", aliases: ["masale dose"], kcal: 250 }),
  food({ food_key: "dosa", name: "Ghee roast dosa", variant: "ghee roast", kcal: 300 }),
  food({ food_key: "idli", name: "Idli", aliases: ["idly", "ಇಡ್ಲಿ"], kcal: 58 }),
  food({ food_key: "filter_coffee", name: "Filter coffee", aliases: ["kaapi", "coffee"], serving_unit: "cup", kcal: 90 }),
  food({ food_key: "rice", name: "Steamed rice", aliases: ["chawal", "annam", "anna"], serving_unit: "bowl", serving_grams: 150, kcal: 195 }),
];
