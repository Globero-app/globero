export type StoryRecord = { label: string; watts: number; seconds: number; gain?: number | null };
export type StoryBadge = { emoji: string; label: string; detail: string };
export type StoryWorkout = {
  id: string; status: string; duration_minutes?: number; actual_tss?: number | null;
  completed_at?: string | null;
  plan?: { title?: string; name?: string; gamification?: { records?: StoryRecord[]; badges?: StoryBadge[]; compliance?: { percent?: number | null } } };
};
export type StoryChoice = { id: string; kind: 'workout' | 'record' | 'badge'; record?: StoryRecord; badge?: StoryBadge };

export type StoryPrivacy = { hideLocation: boolean; hideMetrics: boolean };

/** Free-form titles and badge details may reveal places or measurements. */
export function privateStory(workout: StoryWorkout, choice: StoryChoice, privacy: StoryPrivacy) {
  return {
    workout: {
      ...workout,
      duration_minutes: privacy.hideMetrics ? undefined : workout.duration_minutes,
      actual_tss: privacy.hideMetrics ? undefined : workout.actual_tss,
      plan: {
        ...workout.plan,
        title: privacy.hideLocation || privacy.hideMetrics ? undefined : workout.plan?.title,
        name: privacy.hideLocation || privacy.hideMetrics ? undefined : workout.plan?.name,
        gamification: privacy.hideMetrics ? undefined : workout.plan?.gamification,
      },
    },
    choice: {
      ...choice,
      record: privacy.hideMetrics ? undefined : choice.record,
      badge: choice.badge ? {
        ...choice.badge,
        label: privacy.hideLocation || privacy.hideMetrics ? '' : choice.badge.label,
        detail: privacy.hideLocation || privacy.hideMetrics ? '' : choice.badge.detail,
      } : undefined,
    },
  };
}

export function storyChoices(workout: StoryWorkout): StoryChoice[] {
  if (workout.status !== 'completed') return [];
  return [
    { id: 'workout', kind: 'workout' },
    ...(workout.plan?.gamification?.records ?? []).filter(r => Number.isFinite(r.watts) && r.watts > 0).map((record, i) => ({ id: `record-${i}`, kind: 'record' as const, record })),
    ...(workout.plan?.gamification?.badges ?? []).map((badge, i) => ({ id: `badge-${i}`, kind: 'badge' as const, badge })),
  ];
}