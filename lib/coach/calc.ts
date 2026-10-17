/**
 * Calorie coaching maths. Deterministic and conservative — this is general guidance, not medical advice.
 * Mifflin–St Jeor BMR × activity factor = maintenance (TDEE); a safe, capped deficit/surplus is applied on top.
 */
export type Sex = "female" | "male" | "other";
export type Activity = "sedentary" | "light" | "moderate" | "active";

export const ACTIVITY: Record<Activity, { factor: number; label: string; hint: string }> = {
  sedentary: { factor: 1.2, label: "Mostly sitting", hint: "Desk job, little exercise" },
  light: { factor: 1.375, label: "Lightly active", hint: "Walks or light exercise 1–3 days/week" },
  moderate: { factor: 1.55, label: "Moderately active", hint: "Exercise 3–5 days/week" },
  active: { factor: 1.725, label: "Very active", hint: "Hard exercise 6–7 days/week or physical job" },
};

export interface CoachInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  goalWeightKg: number;
  activity: Activity;
  /** optional target date (ISO yyyy-mm-dd) and "today" for the weeks maths */
  goalDate?: string | null;
  today: string;
}

export type CoachResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      direction: "lose" | "gain" | "maintain";
      bmr: number;
      maintenance: number;
      targetKcal: number;
      /** signed kg per week the plan aims for (negative = loss) */
      weeklyKg: number;
      dailyDeltaKcal: number;
      weeksToGoal: number | null;
      etaDate: string | null;
      proteinG: number;
      fatG: number;
      carbsG: number;
      stepsGoal: number;
      bmi: number;
      goalBmi: number;
      notes: string[];
    };

const KCAL_PER_KG = 7700;
const FLOOR: Record<Sex, number> = { female: 1200, male: 1500, other: 1350 };
const round = (n: number, step = 1) => Math.round(n / step) * step;

export const bmiOf = (kg: number, cm: number) => kg / Math.pow(cm / 100, 2);

export function bmr({ sex, age, heightCm, weightKg }: Pick<CoachInput, "sex" | "age" | "heightCm" | "weightKg">): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return base + (sex === "male" ? 5 : sex === "female" ? -161 : -78);
}

const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export function computeCoachPlan(i: CoachInput): CoachResult {
  if (i.age < 18) return { ok: false, reason: "The coach is for adults (18+). Please speak to a doctor or dietitian for guidance." };
  if (i.age > 90 || i.heightCm < 120 || i.heightCm > 230 || i.weightKg < 30 || i.weightKg > 300 || i.goalWeightKg < 30 || i.goalWeightKg > 300)
    return { ok: false, reason: "Those numbers look off — please check age, height and weights." };

  const bmi = bmiOf(i.weightKg, i.heightCm);
  const goalBmi = bmiOf(i.goalWeightKg, i.heightCm);
  if (goalBmi < 18.5)
    return { ok: false, reason: `A goal of ${i.goalWeightKg} kg would be below the healthy BMI range (18.5+) for your height — the lowest healthy weight is about ${Math.ceil(18.5 * Math.pow(i.heightCm / 100, 2))} kg. Please choose a higher goal.` };

  const rate = bmr(i);
  const maintenance = round(rate * ACTIVITY[i.activity].factor);
  const diff = i.goalWeightKg - i.weightKg; // negative = lose
  const notes: string[] = [];
  const direction = Math.abs(diff) < 0.5 ? "maintain" : diff < 0 ? "lose" : "gain";

  // weekly pace: cap at 1% of body weight (and 1 kg) for loss; 0.5 kg for gain
  const maxLoss = Math.min(1, i.weightKg * 0.01);
  const maxGain = 0.5;
  const gentle = direction === "lose" ? Math.min(0.5, maxLoss) : 0.25;

  let weekly = 0;
  if (direction !== "maintain") {
    const cap = direction === "lose" ? maxLoss : maxGain;
    if (i.goalDate && i.goalDate > i.today) {
      const weeks = Math.max(1, daysBetween(i.today, i.goalDate) / 7);
      const needed = Math.abs(diff) / weeks;
      if (needed > cap) {
        weekly = cap;
        notes.push(`Reaching ${i.goalWeightKg} kg by your date would need ${needed.toFixed(2)} kg/week, which is faster than is safe. The plan uses ${cap.toFixed(2)} kg/week instead — see the realistic date below.`);
      } else weekly = Math.max(needed, 0.1);
    } else weekly = gentle;
    if (direction === "lose") weekly = -weekly;
  }

  let delta = Math.round((weekly * KCAL_PER_KG) / 7); // negative for loss
  let target = maintenance + delta;
  const floor = FLOOR[i.sex];
  if (target < floor) {
    target = floor;
    delta = target - maintenance;
    weekly = (delta * 7) / KCAL_PER_KG;
    notes.push(`Calories are held at ${floor} kcal/day — going lower isn't recommended without a doctor or dietitian, so progress will be slower.`);
  }
  target = round(target, 10);
  delta = target - maintenance;

  const weeksToGoal = direction === "maintain" || weekly === 0 ? null : Math.ceil(Math.abs(diff) / Math.abs(weekly));
  const etaDate = weeksToGoal === null ? null : addDays(i.today, weeksToGoal * 7);

  // protein 1.6 g/kg (of goal weight when losing, current when gaining); fat 25% kcal; carbs the rest
  const proteinBase = direction === "lose" ? Math.min(i.weightKg, i.goalWeightKg * 1.15) : i.weightKg;
  const proteinG = round(1.6 * proteinBase, 5);
  const fatG = round((target * 0.25) / 9, 5);
  const carbsG = Math.max(0, round((target - proteinG * 4 - fatG * 9) / 4, 5));

  const stepsGoal = direction === "lose" ? 8000 : i.activity === "sedentary" ? 6000 : 7000;
  if (direction === "maintain") notes.push("You're already close to your goal weight, so the plan is maintenance.");
  notes.push("Weigh yourself a few times a week and judge by the weekly average — day-to-day weight moves 1–2 kg with water and salt.");

  return {
    ok: true, direction, bmr: round(rate), maintenance, targetKcal: target, weeklyKg: Math.round(weekly * 100) / 100,
    dailyDeltaKcal: delta, weeksToGoal, etaDate, proteinG, fatG, carbsG, stepsGoal, bmi: Math.round(bmi * 10) / 10, goalBmi: Math.round(goalBmi * 10) / 10, notes,
  };
}

/**
 * Compares the real weight trend with what the plan predicted. Uses first/last weights in the window.
 * Returns null when there isn't enough data to say anything useful.
 */
export function progressCheck(weights: { date: string; kg: number }[], plannedWeeklyKg: number): { actualWeeklyKg: number; message: string } | null {
  if (weights.length < 2) return null;
  const first = weights[0], last = weights[weights.length - 1];
  const days = daysBetween(first.date, last.date);
  if (days < 10) return null;
  const actual = ((last.kg - first.kg) / days) * 7;
  const diff = actual - plannedWeeklyKg;
  let message: string;
  if (Math.abs(plannedWeeklyKg) < 0.05) message = Math.abs(actual) < 0.25 ? "Your weight is steady — right on plan." : "Your weight is drifting from maintenance; check your weekly average intake.";
  else if (Math.abs(diff) <= 0.2) message = "You're right on track.";
  else if ((plannedWeeklyKg < 0 && diff > 0) || (plannedWeeklyKg > 0 && diff < 0)) message = "Progress is slower than planned. Check that your logging is complete (drinks, oil, snacks) before cutting calories further.";
  else message = "Progress is faster than planned. That's fine briefly, but make sure you're eating enough protein and not skipping meals.";
  return { actualWeeklyKg: Math.round(actual * 100) / 100, message };
}
