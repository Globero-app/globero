import { describe, expect, it } from 'vitest';
import { storyChoices } from '../workout-story';

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