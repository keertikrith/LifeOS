import { describe, expect, it } from "vitest";
import { validateParsedMeal, parsedMealSchema } from "@/lib/llm/parser";
import { isPlausibleEstimate } from "@/lib/llm/estimate";

describe("parser output validation", () => {
  it("accepts a well-formed parse and normalises keys, variants and units", () => {
    const out = validateParsedMeal({
      is_food_log: true,
      meal_type: "breakfast",
      items: [{ food_key: " Filter Coffee ", display_name: "filter coffee", variant: " Strong ", quantity: 1, unit: "Cup" }],
    });
    expect(out.items[0]).toMatchObject({ food_key: "filter_coffee", variant: "strong", unit: "cup" });
  });

  it("allows null quantity and variant (user didn't say)", () => {
    expect(() =>
      validateParsedMeal({ is_food_log: true, meal_type: null, items: [{ food_key: "rice", display_name: "rice", variant: null, quantity: null, unit: "bowl" }] }),
    ).not.toThrow();
  });

  it("rejects non-positive or absurd quantities", () => {
    const bad = (q: number) => ({ is_food_log: true, meal_type: null, items: [{ food_key: "x", display_name: "x", variant: null, quantity: q, unit: "piece" }] });
    expect(parsedMealSchema.safeParse(bad(0)).success).toBe(false);
    expect(parsedMealSchema.safeParse(bad(-2)).success).toBe(false);
    expect(parsedMealSchema.safeParse(bad(5000)).success).toBe(false);
  });

  it("rejects unknown meal types and missing fields", () => {
    expect(parsedMealSchema.safeParse({ is_food_log: true, meal_type: "brunch", items: [] }).success).toBe(false);
    expect(parsedMealSchema.safeParse({ items: [] }).success).toBe(false);
  });

  it("flags implausible LLM estimates (macros don't add up to kcal)", () => {
    expect(isPlausibleEstimate({ kcal: 250, protein_g: 6, carbs_g: 40, fat_g: 7 })).toBe(true);
    expect(isPlausibleEstimate({ kcal: 900, protein_g: 2, carbs_g: 10, fat_g: 1 })).toBe(false);
  });
});
