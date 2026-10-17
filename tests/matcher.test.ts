import { describe, expect, it } from "vitest";
import { resolveItem, servingsFor, scaleFood, candidatesFor } from "@/lib/nutrition/matcher";
import type { ParsedItem } from "@/lib/llm/parser";
import { catalog, food } from "./fixtures";

const item = (p: Partial<ParsedItem>): ParsedItem => ({
  food_key: "dosa", display_name: "dosa", variant: null, quantity: 1, unit: "piece", ...p,
});

describe("matcher", () => {
  it("matches explicit variant", () => {
    const r = resolveItem(item({ variant: "masala", quantity: 2 }), catalog, []);
    expect(r.kind).toBe("matched");
    if (r.kind === "matched") expect(r.food.variant).toBe("masala");
  });

  it("asks which variant when dish has several and no saved default", () => {
    const r = resolveItem(item({}), catalog, []);
    expect(r.kind).toBe("clarify_variant");
    if (r.kind === "clarify_variant") expect(r.options.map((o) => o.variant).sort()).toEqual(["ghee roast", "masala", "plain"]);
  });

  it("uses the saved default variant, and its quantity when none given", () => {
    const masala = catalog.find((f) => f.variant === "masala")!;
    const r = resolveItem(item({ quantity: null }), catalog, [{ food_key: "dosa", food_id: masala.id, quantity: 2 }]);
    expect(r).toMatchObject({ kind: "matched", quantity: 2 });
    if (r.kind === "matched") expect(r.food.id).toBe(masala.id);
  });

  it("asks quantity when unspecified and no default", () => {
    expect(resolveItem(item({ food_key: "idli", display_name: "idli", quantity: null }), catalog, []).kind).toBe("clarify_quantity");
  });

  it("asks variant again when the stated variant doesn't exist", () => {
    expect(resolveItem(item({ variant: "rava" }), catalog, []).kind).toBe("clarify_variant");
  });

  it("returns unmatched for unknown dishes so the caller can flag an estimate", () => {
    expect(resolveItem(item({ food_key: "quinoa_salad", display_name: "quinoa salad" }), catalog, []).kind).toBe("unmatched");
  });

  it("matches via aliases and regional spellings, and small typos", () => {
    expect(candidatesFor(catalog, { food_key: "kaapi", display_name: "kaapi" })[0].food_key).toBe("filter_coffee");
    expect(candidatesFor(catalog, { food_key: "x", display_name: "ಇಡ್ಲಿ" })[0].food_key).toBe("idli");
    expect(candidatesFor(catalog, { food_key: "chawal", display_name: "chawal" })[0].food_key).toBe("rice");
    expect(candidatesFor(catalog, { food_key: "filter_cofee", display_name: "filter cofee" })[0].food_key).toBe("filter_coffee");
  });

  it("does not fuzzy-match short unrelated words", () => {
    expect(candidatesFor(catalog, { food_key: "ida", display_name: "ida" })).toHaveLength(0);
  });

  it("prefers a user-created food over the global row for the same variant", () => {
    const mine = { ...catalog[3], id: "mine", user_id: "u1", kcal: 70 };
    const r = resolveItem(item({ food_key: "idli", display_name: "idli" }), [...catalog, mine], []);
    if (r.kind === "matched") expect(r.food.id).toBe("mine");
    else throw new Error("expected match");
  });

  it("scales by servings and converts grams when serving_grams is known", () => {
    const rice = catalog.find((f) => f.food_key === "rice")!;
    expect(servingsFor(rice, 300, "g")).toBe(2);
    expect(servingsFor(rice, 2, "bowl")).toBe(2);
    expect(scaleFood(rice, 2).kcal).toBe(390);
  });
});

describe("normalize keeps Indic combining marks", () => {
  it("does not collapse different Kannada/Hindi words", async () => {
    const { normalize } = await import("@/lib/nutrition/matcher");
    expect(normalize("ಇಡ್ಲಿ")).toBe("ಇಡ್ಲಿ");
    expect(normalize("ಇಡ್ಲಿ")).not.toBe(normalize("ಇಡಲ"));
    expect(normalize("  Café-Latte!! ")).toBe("cafe latte");
  });
});

describe("IFCT per-100 g rows", () => {
  const ifct = [
    food({ food_key: "ifct_tomato", name: "Tomato, green", variant: "green", serving_unit: "g", serving_grams: 100, kcal: 21, source: "ifct2017" }),
    food({ food_key: "ifct_tomato", name: "Tomato, ripe, local", variant: "ripe, local", serving_unit: "g", serving_grams: 100, kcal: 20, source: "ifct2017" }),
    food({ food_key: "ifct_spinach", name: "Spinach", serving_unit: "g", serving_grams: 100, kcal: 24, source: "ifct2017" }),
  ];
  it("matches by base name in grams, asking which variant when several exist", () => {
    expect(resolveItem(item({ food_key: "tomato", display_name: "tomato", quantity: 200, unit: "g" }), ifct, []).kind).toBe("clarify_variant");
    const r = resolveItem(item({ food_key: "spinach", display_name: "spinach", quantity: 150, unit: "g" }), ifct, []);
    expect(r.kind).toBe("matched");
    if (r.kind === "matched") expect(scaleFood(r.food, r.servings).kcal).toBe(36);
  });
  it("never assumes 100 g for '1 piece' — falls back to a flagged estimate", () => {
    expect(resolveItem(item({ food_key: "spinach", display_name: "spinach", quantity: 1, unit: "bowl" }), ifct, []).kind).toBe("unmatched");
  });
  it("curated dishes beat IFCT rows with the same name", () => {
    const both = [...ifct, food({ food_key: "spinach", name: "Palak", kcal: 50 })];
    const r = resolveItem(item({ food_key: "spinach", display_name: "spinach", quantity: 1, unit: "bowl" }), both, []);
    expect(r.kind).toBe("matched");
  });
});
