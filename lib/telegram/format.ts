import type { LogItem, MealLog } from "@/lib/db/meals";
import type { Balance } from "@/lib/health/balance";
import { isGramLike } from "@/lib/llm/parser";
import { escapeHtml, type InlineKeyboard } from "./api";

const MEAL_EMOJI = { breakfast: "🌅 Breakfast", lunch: "🍛 Lunch", snack: "🫖 Snack", dinner: "🌙 Dinner" } as const;

const qty = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const kcal = (n: number) => Math.round(n).toLocaleString("en-IN");

export function itemLine(i: LogItem): string {
  const label = escapeHtml(i.variant && !i.name.toLowerCase().includes(i.variant) ? `${i.variant} ${i.name}` : i.name);
  if (i.match_type === "unresolved") return `• ${label} — ❓ <i>${i.clarify?.kind === "quantity" && isGramLike(i.unit) ? "how many grams?" : "needs your input"}</i>`;
  const flag = i.match_type === "estimated" ? " <i>≈ estimated, not from database</i>" : "";
  return `• ${qty(i.quantity)} ${escapeHtml(i.unit)} ${label} — <b>${kcal(i.kcal)}</b> kcal${flag}`;
}

export function logMessage(log: MealLog): string {
  const head = log.meal_type ? MEAL_EMOJI[log.meal_type] : "🍽 Meal";
  const lines = log.items.map(itemLine).join("\n");
  const unresolved = log.items.some((i) => i.match_type === "unresolved");
  const status = log.status === "confirmed" ? "\n\n✅ <b>Saved</b>" : unresolved ? "" : "\n\n<i>Confirm to save — it auto-saves in a few minutes.</i>";
  return `${head}\n${lines}\n\n<b>Total: ${kcal(log.total_kcal)} kcal</b>${status}`;
}

/** Buttons for a log. While an item is unresolved, its options come first and Confirm is withheld. */
export function logKeyboard(log: MealLog): InlineKeyboard {
  if (log.status !== "pending") return [];
  const pending = log.items.find((i) => i.match_type === "unresolved");
  if (pending?.clarify) {
    if (pending.clarify.kind === "variant") {
      const rows = pending.clarify.options.map((o, idx) => [{ text: o.label, callback_data: `v|${log.id}|${pending.position}|${idx}` }]);
      return [...rows, [{ text: "🗑 Delete", callback_data: `del|${log.id}` }]];
    }
    const grams = isGramLike(pending.unit);
    return [
      (grams ? [50, 100, 150, 200] : [1, 2, 3, 4]).map((n) => ({ text: grams ? `${n} g` : String(n), callback_data: `q|${log.id}|${pending.position}|${n}` })),
      [{ text: "✏️ Other amount", callback_data: `eq|${log.id}|${pending.position}` }, { text: "🗑 Delete", callback_data: `del|${log.id}` }],
    ];
  }
  return [
    [{ text: "✅ Confirm", callback_data: `ok|${log.id}` }],
    [
      { text: "✏️ Change quantity", callback_data: `eq|${log.id}|-1` },
      { text: "🔄 Change variant", callback_data: `ev|${log.id}|-1` },
    ],
    [{ text: "🗑 Delete", callback_data: `del|${log.id}` }],
  ];
}

/** Picker shown when a log has several items and the user taps ✏️ / 🔄. */
export function itemPicker(log: MealLog, action: "eq" | "ev"): InlineKeyboard {
  return [
    ...log.items.map((i) => [{ text: `${qty(i.quantity)} ${i.name}`, callback_data: `${action}|${log.id}|${i.position}` }]),
    [{ text: "↩️ Back", callback_data: `back|${log.id}` }],
  ];
}

export function todayMessage(args: { name: string | null; logs: MealLog[]; target: number | null; balance?: Balance }): string {
  const eaten = args.logs.reduce((s, l) => s + Number(l.total_kcal), 0);
  if (!args.logs.length) return "Nothing logged yet today. Tell me what you ate, like <i>“2 idli and filter coffee”</i>.";
  const rows = args.logs.map((l) => {
    const head = l.meal_type ? MEAL_EMOJI[l.meal_type] : "🍽 Meal";
    return `${head} — ${kcal(l.total_kcal)} kcal\n${l.items.map((i) => `   ${qty(i.quantity)} ${escapeHtml(i.name)}`).join("\n")}`;
  });
  let balance = "";
  if (args.target) {
    const diff = args.target - eaten;
    balance = diff >= 0 ? `\nTarget ${kcal(args.target)} · <b>${kcal(diff)} kcal remaining</b>` : `\nTarget ${kcal(args.target)} · <b>${kcal(-diff)} kcal above</b>`;
  }
  const b = args.balance;
  if (b?.kind === "balance") {
    const word = b.label === "even" ? "even" : `${kcal(Math.abs(b.balance))} kcal ${b.label}`;
    balance += `\nBurned: ${kcal(b.burned)} kcal (resting + active) · <b>Balance: ${word}</b>`;
  } else {
    balance += "\n<i>No burn data for today yet — it arrives when your Apple Health sync runs.</i>";
  }
  if (!args.target) balance += "\n<i>Set a daily target with /target 2000 to see what's remaining.</i>";
  return `📅 <b>Today</b>\n\n${rows.join("\n\n")}\n\n<b>Eaten: ${kcal(eaten)} kcal</b>${balance}`;
}

export const HELP = `<b>Life OS</b> 🪔
Just tell me what you ate — in English, हिन्दी, ಕನ್ನಡ or తెలుగు:
<i>“2 dosa and filter coffee”</i> · <i>“ಬೆಳಿಗ್ಗೆ 3 ಇಡ್ಲಿ”</i> · <i>“lunch mein 2 roti dal”</i>

/today — eaten so far
/undo — remove the last log
/habits — tick off today's habits
/journal — log your mood and a note
/coach — your calorie & protein plan
/plan — today's workout
/target 2000 — set your daily kcal target
/burn 450 1600 · /steps 8000 · /weight 68.4 · /sleep 7.5 — add today's health numbers`;
