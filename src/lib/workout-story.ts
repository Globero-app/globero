export type StoryRecord = { label: string; watts: number; seconds: number; gain?: number | null };
export type StoryBadge = { emoji: string; label: string; detail: string };
export type StoryWorkout = {
  id: string; status: string; duration_minutes?: number; actual_tss?: number | null;
  completed_at?: string | null;
  plan?: { title?: string; name?: string; gamification?: { records?: StoryRecord[]; badges?: StoryBadge[]; compliance?: { percent?: number | null } } };
};
export type StoryChoice = { id: string; kind: 'workout' | 'record' | 'badge'; record?: StoryRecord; badge?: StoryBadge };

export function storyChoices(workout: StoryWorkout): StoryChoice[] {
  if (workout.status !== 'completed') return [];
  return [
    { id: 'workout', kind: 'workout' },
    ...(workout.plan?.gamification?.records ?? []).filter(r => Number.isFinite(r.watts) && r.watts > 0).map((record, i) => ({ id: `record-${i}`, kind: 'record' as const, record })),
    ...(workout.plan?.gamification?.badges ?? []).map((badge, i) => ({ id: `badge-${i}`, kind: 'badge' as const, badge })),
  ];
}