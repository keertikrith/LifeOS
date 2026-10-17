/** Warm, time-aware greetings in the languages Life OS supports. Tone: encouraging, never judgmental. */
const GREETINGS = {
  morning: [
    { native: "ಶುಭೋದಯ", say: "Good morning" },
    { native: "सुप्रभात", say: "Good morning" },
    { native: "శుభోదయం", say: "Good morning" },
    { native: "நல்ல காலை", say: "Good morning" },
  ],
  afternoon: [
    { native: "नमस्ते", say: "Good afternoon" },
    { native: "ನಮಸ್ಕಾರ", say: "Good afternoon" },
    { native: "నమస్కారం", say: "Good afternoon" },
  ],
  evening: [
    { native: "शुभ संध्या", say: "Good evening" },
    { native: "ಶುಭ ಸಂಜೆ", say: "Good evening" },
    { native: "శుభ సాయంత్రం", say: "Good evening" },
  ],
  night: [
    { native: "शुभ रात्रि", say: "Good night" },
    { native: "ಶುಭ ರಾತ್ರಿ", say: "Good night" },
    { native: "శుభరాత్రి", say: "Good night" },
  ],
} as const;

export function greetingFor(hour: number, seed: number) {
  const slot = hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 17 ? "afternoon" : hour >= 17 && hour < 21 ? "evening" : "night";
  const list = GREETINGS[slot];
  return list[seed % list.length];
}

const NUDGES = [
  "Small meals noted, big picture clear.",
  "Every plate you log is a step towards knowing your body.",
  "Consistency beats perfection — log what you ate, that's enough.",
  "Your weekly average tells the real story, not a single day.",
  "Noticing is the first step. You're already doing it.",
  "Ghar ka khana, honest numbers, calm mind.",
  "One honest log today makes tomorrow easier.",
];

export const nudgeFor = (seed: number) => NUDGES[seed % NUDGES.length];
