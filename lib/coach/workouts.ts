/** Deterministic weekly workout plans. No AI: a known-good routine picked by days/week, equipment and experience. */
export type Equipment = "home" | "gym";
export type Experience = "beginner" | "intermediate";
export type Direction = "lose" | "gain" | "maintain";

export interface Exercise { name: string; sets: number; reps: string }
export interface WorkoutDay { weekday: number; title: string; focus: string; exercises: Exercise[] }
export interface WorkoutPlan { daysPerWeek: number; split: string; days: WorkoutDay[]; cardio: string[]; tips: string[] }

type Slot = "squat" | "push" | "pull" | "hinge" | "core" | "lunge" | "shoulder" | "legs" | "arms";
type Bank = Record<Slot, { home: string[]; gym: string[] }>;

const BANK: Bank = {
  squat: { home: ["Bodyweight squats", "Tempo squats (3 s down)", "Chair-assisted split squats"], gym: ["Goblet squat", "Leg press", "Barbell back squat"] },
  push: { home: ["Incline push-ups (hands on a table)", "Push-ups", "Slow-tempo push-ups"], gym: ["Dumbbell bench press", "Barbell bench press", "Incline dumbbell press"] },
  pull: { home: ["Backpack rows (hinged, backpack with books)", "Towel door rows", "Backpack rows (hinged, backpack with books)"], gym: ["Lat pulldown", "Seated cable row", "One-arm dumbbell row"] },
  hinge: { home: ["Glute bridges", "Single-leg glute bridges", "Good mornings (backpack)"], gym: ["Romanian deadlift (dumbbells)", "Hip thrust", "Romanian deadlift (barbell)"] },
  core: { home: ["Plank", "Dead bugs", "Side plank"], gym: ["Plank", "Cable crunch", "Hanging knee raise"] },
  lunge: { home: ["Reverse lunges", "Walking lunges", "Step-ups (sturdy chair)"], gym: ["Dumbbell reverse lunges", "Walking lunges", "Step-ups"] },
  shoulder: { home: ["Pike push-ups", "Backpack overhead press", "Lateral raises (water bottles)"], gym: ["Dumbbell shoulder press", "Lateral raises", "Face pulls"] },
  legs: { home: ["Wall sit", "Calf raises", "Frog squats"], gym: ["Leg curl", "Leg extension", "Standing calf raise"] },
  arms: { home: ["Backpack curls", "Chair dips", "Backpack curls"], gym: ["Dumbbell curls", "Triceps pushdown", "Hammer curls"] },
};

const DAY_SLOTS: Record<string, { title: string; focus: string; slots: Slot[] }> = {
  full: { title: "Full body", focus: "Whole body", slots: ["squat", "push", "pull", "hinge", "core"] },
  upper: { title: "Upper body", focus: "Chest, back, shoulders, arms", slots: ["push", "pull", "shoulder", "arms", "core"] },
  lower: { title: "Lower body", focus: "Legs and glutes", slots: ["squat", "hinge", "lunge", "legs", "core"] },
  push: { title: "Push", focus: "Chest, shoulders, triceps", slots: ["push", "shoulder", "push", "arms", "core"] },
  pull: { title: "Pull", focus: "Back and biceps", slots: ["pull", "pull", "hinge", "arms", "core"] },
  legs: { title: "Legs", focus: "Quads, hamstrings, glutes, calves", slots: ["squat", "hinge", "lunge", "legs", "core"] },
};

const SPLITS: Record<number, { name: string; days: string[]; weekdays: number[] }> = {
  2: { name: "Full body × 2", days: ["full", "full"], weekdays: [1, 4] },
  3: { name: "Full body × 3", days: ["full", "full", "full"], weekdays: [1, 3, 5] },
  4: { name: "Upper / Lower × 2", days: ["upper", "lower", "upper", "lower"], weekdays: [1, 2, 4, 5] },
  5: { name: "Push / Pull / Legs + Upper / Lower", days: ["push", "pull", "legs", "upper", "lower"], weekdays: [1, 2, 3, 5, 6] },
  6: { name: "Push / Pull / Legs × 2", days: ["push", "pull", "legs", "push", "pull", "legs"], weekdays: [1, 2, 3, 4, 5, 6] },
};

export function buildWorkoutPlan(opts: { daysPerWeek: number; equipment: Equipment; experience: Experience; direction: Direction; stepsGoal: number }): WorkoutPlan {
  const days = Math.min(6, Math.max(2, Math.round(opts.daysPerWeek)));
  const split = SPLITS[days];
  const seen: Record<string, number> = {};

  const out: WorkoutDay[] = split.days.map((type, idx) => {
    const t = DAY_SLOTS[type];
    seen[type] = (seen[type] ?? -1) + 1;
    const variant = seen[type] + (type === "full" ? idx : 0); // rotate variations so sessions differ
    const used = new Set<string>();
    const exercises = t.slots.map((slot, j) => {
      const list = BANK[slot][opts.equipment];
      let name = list[(variant + j) % list.length];
      for (let k = 1; used.has(name) && k <= list.length; k++) name = list[(variant + j + k) % list.length]; // no repeats in one session
      used.add(name);
      const isCore = slot === "core";
      const isHold = /plank/i.test(name);
      const hard = opts.experience === "intermediate";
      const bodyweight = opts.equipment === "home";
      const reps = isHold ? (hard ? "40–60 s" : "20–40 s") : isCore ? "12–15" : bodyweight ? (hard ? "10–15" : "8–12") : hard ? "6–10" : "10–12";
      return { name, sets: isCore ? 3 : hard ? 4 : 3, reps };
    });
    return { weekday: split.weekdays[idx], title: t.title, focus: t.focus, exercises };
  });

  const cardio =
    opts.direction === "lose"
      ? [`Aim for about ${opts.stepsGoal.toLocaleString("en-IN")} steps a day (a 30–40 minute brisk walk after dinner works well).`, "Add 1–2 easy cardio sessions a week (brisk walk, cycling or swimming) of 30–45 minutes, on non-lifting days."]
      : opts.direction === "gain"
        ? [`Keep walking around ${opts.stepsGoal.toLocaleString("en-IN")} steps a day for health, but don't add much extra cardio — eating enough matters more.`]
        : [`Aim for about ${opts.stepsGoal.toLocaleString("en-IN")} steps a day and one easy cardio session a week.`];

  return {
    daysPerWeek: days,
    split: split.name,
    days: out,
    cardio,
    tips: [
      "Warm up for 5 minutes (easy walk + a few light sets) before lifting.",
      "Leave 1–2 reps in reserve. Add a rep or a little weight each week when the last set feels easy — that's how you improve.",
      "Rest at least one full day between sessions that work the same muscles.",
      "Sleep 7–8 hours and eat enough protein; recovery is where the change happens.",
      "Stop if something hurts (not just burns). If you have a medical condition or injury, check with a doctor before starting.",
    ],
  };
}

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
