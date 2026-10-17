export const MOODS = [
  { value: 1, emoji: "😞", label: "Rough" },
  { value: 2, emoji: "😕", label: "Low" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
] as const;

export const moodEmoji = (m: number | null) => MOODS.find((x) => x.value === m)?.emoji ?? "—";

/** Pulls #tags out of free text (Latin and Indic scripts), lower-cased, unique, max 10. */
export function extractTags(text: string): string[] {
  const found = text.match(/(?:^|\s)#([\p{L}\p{M}\p{N}_]{1,30})/gu) ?? [];
  return [...new Set(found.map((t) => t.trim().slice(1).toLowerCase()))].slice(0, 10);
}

export const stripTagSyntax = (text: string) => text.trim();
