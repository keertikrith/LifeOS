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

describe("sanitizeQuantities", async () => {
  const { sanitizeQuantities } = await import("@/lib/llm/parser");
  const meal = (q: number | null) => ({ is_food_log: true, meal_type: null, items: [{ food_key: "spinach", display_name: "spinach", variant: null, quantity: q, unit: "gram" }] });

  it("repairs a mangled gram amount from the typed text (150 g -> 15 is fixed to 150)", () => {
    expect(sanitizeQuantities("had 150 g spinach", meal(15)).items[0].quantity).toBe(150);
  });
  it("drops a count the user never typed, so the bot asks instead of guessing", () => {
    const dosa = { is_food_log: true, meal_type: null, items: [{ food_key: "dosa", display_name: "dosa", variant: null, quantity: 30, unit: "piece" }] };
    expect(sanitizeQuantities("had 3 dosa", dosa).items[0].quantity).toBeNull();
  });
  it("keeps quantities that match the typed digits, including decimals", () => {
    expect(sanitizeQuantities("had 150 g spinach", meal(150)).items[0].quantity).toBe(150);
    expect(sanitizeQuantities("2.5 cups chai", meal(2.5)).items[0].quantity).toBe(2.5);
  });
  it("leaves word-based amounts alone (no digits typed)", () => {
    expect(sanitizeQuantities("ek katori dahi", meal(1)).items[0].quantity).toBe(1);
    expect(sanitizeQuantities("do roti", meal(2)).items[0].quantity).toBe(2);
  });
  it("doesn't touch small word-derived amounts when other digits exist", () => {
    expect(sanitizeQuantities("a glass of milk at 8 am", meal(1)).items[0].quantity).toBe(1);
  });
});

describe("gram amounts typed by the user are authoritative", async () => {
  const { sanitizeQuantities, typedAmounts } = await import("@/lib/llm/parser");
  const one = (q: number | null, unit: string) => ({ is_food_log: true, meal_type: null, items: [{ food_key: "muesli", display_name: "museli", variant: null, quantity: q, unit }] });

  it("reads gm/g/kg/ml glued to the number", () => {
    expect(typedAmounts("150gm museli")).toEqual([{ value: 150, unit: "g" }]);
    expect(typedAmounts("0.5 kg rice and 200ml milk")).toEqual([{ value: 500, unit: "g" }, { value: 200, unit: "ml" }]);
  });
  it("repairs the 'null quantity' case from the bug report: '150gm museli'", () => {
    const r = sanitizeQuantities("I ate 150gm museli", one(null, "bowl")).items[0];
    expect(r).toMatchObject({ quantity: 150, unit: "g" });
  });
  it("repairs a mangled number and a wrong unit", () => {
    expect(sanitizeQuantities("150 g museli", one(15, "gram")).items[0]).toMatchObject({ quantity: 150, unit: "g" });
    expect(sanitizeQuantities("150 g museli", one(150, "piece")).items[0]).toMatchObject({ quantity: 150, unit: "g" });
  });
  it("assigns several gram amounts to several items in order", () => {
    const meal = { is_food_log: true, meal_type: null, items: [
      { food_key: "oats", display_name: "oats", variant: null, quantity: null, unit: "g" },
      { food_key: "milk", display_name: "milk", variant: null, quantity: null, unit: "ml" },
    ] };
    const r = sanitizeQuantities("50g oats with 200ml milk", meal).items;
    expect(r.map((i) => [i.quantity, i.unit])).toEqual([[50, "g"], [200, "ml"]]);
  });
  it("does not turn '2 dosa' into grams", () => {
    const meal = { is_food_log: true, meal_type: null, items: [{ food_key: "dosa", display_name: "dosa", variant: null, quantity: 2, unit: "piece" }] };
    expect(sanitizeQuantities("2 dosa", meal).items[0]).toMatchObject({ quantity: 2, unit: "piece" });
  });
});
