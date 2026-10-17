import type { SupabaseClient } from "@supabase/supabase-js";
import { healthRange } from "@/lib/db/life";
import { computeCoachPlan, progressCheck, type Activity, type CoachResult, type Sex } from "./calc";
import { buildWorkoutPlan, type Equipment, type Experience, type WorkoutPlan } from "./workouts";

export interface CoachProfile {
  sex: Sex; birth_year: number; height_cm: number; activity: Activity; start_weight_kg: number; goal_weight_kg: number;
  goal_date: string | null; days_per_week: number; equipment: Equipment; experience: Experience; started_on: string;
}

export async function getCoachProfile(db: SupabaseClient, userId: string): Promise<CoachProfile | null> {
  const { data, error } = await db.from("coach_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? ({ ...data, height_cm: Number(data.height_cm), start_weight_kg: Number(data.start_weight_kg), goal_weight_kg: Number(data.goal_weight_kg) } as CoachProfile) : null;
}

export interface CoachView {
  profile: CoachProfile;
  currentWeightKg: number;
  result: CoachResult;
  plan: WorkoutPlan | null;
  progress: ReturnType<typeof progressCheck>;
}

/** Everything the Coach page / bot needs. The latest logged weight (if any) replaces the starting weight. */
export async function loadCoach(db: SupabaseClient, userId: string, today: string): Promise<CoachView | null> {
  const profile = await getCoachProfile(db, userId);
  if (!profile) return null;
  const since = new Date(Date.parse(`${profile.started_on}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const weights = (await healthRange(db, userId, since, today)).filter((r) => r.weight_kg != null).map((r) => ({ date: r.date, kg: Number(r.weight_kg) }));
  const currentWeightKg = weights.length ? weights[weights.length - 1].kg : profile.start_weight_kg;

  const age = Number(today.slice(0, 4)) - profile.birth_year;
  const result = computeCoachPlan({ sex: profile.sex, age, heightCm: profile.height_cm, weightKg: currentWeightKg, goalWeightKg: profile.goal_weight_kg, activity: profile.activity, goalDate: profile.goal_date, today });
  const plan = result.ok ? buildWorkoutPlan({ daysPerWeek: profile.days_per_week, equipment: profile.equipment, experience: profile.experience, direction: result.direction, stepsGoal: result.stepsGoal }) : null;
  const progress = result.ok ? progressCheck([{ date: profile.started_on, kg: profile.start_weight_kg }, ...weights.filter((w) => w.date > profile.started_on)], result.weeklyKg) : null;
  return { profile, currentWeightKg, result, plan, progress };
}
