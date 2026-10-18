export type StoryRecord = { label: string; watts: number; seconds: number; gain?: number | null };
export type StoryBadge = { emoji: string; label: string; detail: string };
export type StoryWorkout = {
  id: string; status: string; duration_minutes?: number; actual_tss?: number | null;
  completed_at?: string | null;
  gpsTrack?: StoryCoordinate[];
  plan?: { title?: string; name?: string; strava_activity_id?: string | number; intervals_activity_id?: string | number; gamification?: { records?: StoryRecord[]; badges?: StoryBadge[]; compliance?: { percent?: number | null } } };
};
export type StoryChoice = { id: string; kind: 'workout' | 'record' | 'badge'; record?: StoryRecord; badge?: StoryBadge };

export type StoryCoordinate = [number, number];
export function storyTrack(value: unknown): StoryCoordinate[] {
  if (!Array.isArray(value)) return [];
  return value.filter((p): p is StoryCoordinate => Array.isArray(p) && p.length >= 2 &&
    typeof p[0] === 'number' && typeof p[1] === 'number' && Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
    Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180).map(p => [p[0], p[1]]);
}
export type StoryPrivacy = { hideMap?: boolean; hideLocation: boolean; hideMetrics: boolean };

export type StoryStyle = 'oscuro' | 'minimalista' | 'neon' | 'mapa';
export const STORY_STYLES: StoryStyle[] = ['oscuro', 'minimalista', 'neon', 'mapa'];
export const STORY_PALETTES: Record<StoryStyle, { background: string; foreground: string; accent: string; muted: string }> = {
  oscuro: { background: '#101313', foreground: '#f5f7f6', accent: '#57e6a8', muted: '#abb8b3' },
  minimalista: { background: '#f7f7f5', foreground: '#1a1d1c', accent: '#d6402c', muted: '#6b7280' },
  neon: { background: '#050505', foreground: '#f5f5f5', accent: '#00e5ff', muted: '#8a8f98' },
  mapa: { background: '#eef2ec', foreground: '#243328', accent: '#2e7d46', muted: '#6d7a70' },
};

/** Free-form titles and badge details may reveal places or measurements. */
export function privateStory(workout: StoryWorkout, choice: StoryChoice, privacy: StoryPrivacy) {
  return {
    workout: {
      ...workout,
      ...(workout.gpsTrack ? { gpsTrack: privacy.hideMap !== false || privacy.hideLocation ? undefined : storyTrack(workout.gpsTrack) } : {}),
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