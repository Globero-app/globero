import { describe, expect, it } from 'vitest';
import { privateStory, storyChoices, storyTrack } from '../workout-story';

describe('shareable workout achievements', () => {
  it('only shares completed workouts', () => {
    expect(storyChoices({ id: '1', status: 'pending' })).toEqual([]);
    expect(storyChoices({ id: '1', status: 'completed' })).toEqual([{ id: 'workout', kind: 'workout' }]);
  });
  it('offers each actual record and unlocked badge separately', () => {
    const record = { seconds: 1200, label: '20 min', watts: 310, gain: 12 };
    const badge = { emoji: '🏆', label: 'Récord', detail: '310 W' };
    expect(storyChoices({ id: '1', status: 'completed', plan: { gamification: { records: [record], badges: [badge] } } })).toEqual([
      { id: 'workout', kind: 'workout' }, { id: 'record-0', kind: 'record', record }, { id: 'badge-0', kind: 'badge', badge },
    ]);
  });
  it('does not invent power records from invalid values', () => {
    expect(storyChoices({ id: '1', status: 'completed', plan: { gamification: { records: [{ seconds: 1200, label: '20 min', watts: NaN }] } } })).toHaveLength(1);
  });
});

describe('story privacy', () => {
  const gpsWorkout = { id: 'gps', status: 'completed', gpsTrack: [[41, 2], [41.1, 2.1]] as [number, number][] };
  const gpsChoice = { id: 'workout', kind: 'workout' as const };
  it('shows linked GPS coordinates only when the map is explicitly enabled', () => {
    expect(privateStory(gpsWorkout, gpsChoice, { hideMap: false, hideLocation: false, hideMetrics: false }).workout.gpsTrack).toEqual([[41, 2], [41.1, 2.1]]);
    expect(privateStory(gpsWorkout, gpsChoice, { hideLocation: false, hideMetrics: false }).workout.gpsTrack).toBeUndefined();
  });
  it('removes the GPS track when the map is hidden', () => {
    expect(privateStory(gpsWorkout, gpsChoice, { hideMap: true, hideLocation: false, hideMetrics: false }).workout.gpsTrack).toBeUndefined();
  });
  it('hiding location overrides an enabled map', () => {
    expect(privateStory(gpsWorkout, gpsChoice, { hideMap: false, hideLocation: true, hideMetrics: false }).workout.gpsTrack).toBeUndefined();
  });
  it('rejects missing and invalid coordinates without inventing a route', () => {
    expect(storyTrack(undefined)).toEqual([]);
    expect(storyTrack([[41, 2], [NaN, 2], [91, 2], [41, 181], [null, 0]])).toEqual([[41, 2]]);
  });
  const workout = { id: '1', status: 'completed', duration_minutes: 60, actual_tss: 41, plan: { title: 'Salida desde Barcelona 60 min', name: 'Barcelona', gamification: { compliance: { percent: 132 } } } };
  const choice = { id: 'badge-0', kind: 'badge' as const, badge: { emoji: '★', label: 'Barcelona 100 km', detail: '100 km desde Barcelona' }, record: { watts: 310, seconds: 1200, label: '20 min', gain: 12 } };
  it('excludes location-bearing titles and achievement details when location is hidden', () => {
    const result = privateStory(workout, choice, { hideLocation: true, hideMetrics: false });
    expect(result.workout.plan.title).toBeUndefined();
    expect(result.workout.plan.name).toBeUndefined();
    expect(result.choice.badge?.label).toBe('');
    expect(result.choice.badge?.detail).toBe('');
    expect(result.workout.actual_tss).toBe(41);
  });
  it('excludes measurements, record values and free-form metric-bearing details when metrics are hidden', () => {
    const result = privateStory(workout, choice, { hideLocation: false, hideMetrics: true });
    expect(result.workout.duration_minutes).toBeUndefined();
    expect(result.workout.actual_tss).toBeUndefined();
    expect(result.workout.plan.gamification).toBeUndefined();
    expect(result.choice.record).toBeUndefined();
    expect(result.choice.badge?.detail).toBe('');
    expect(result.workout.plan.title).toBeUndefined();
  });
  it('keeps the original data unchanged and restores it when privacy options are cleared', () => {
    privateStory(workout, choice, { hideLocation: true, hideMetrics: true });
    const result = privateStory(workout, choice, { hideLocation: false, hideMetrics: false });
    expect(result.workout).toEqual(workout);
    expect(result.choice).toEqual(choice);
  });
});