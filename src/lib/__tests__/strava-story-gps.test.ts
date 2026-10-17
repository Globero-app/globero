import { afterEach, expect, it, vi } from 'vitest';
import { stravaStreamsForActivity } from '../strava.server';

afterEach(() => vi.unstubAllGlobals());
it('retrieves GPS coordinates from the linked Strava activity alongside existing streams', async () => {
  const profiles = { strava_access_token: 'test-token', strava_token_expires_at: new Date(Date.now() + 3600_000).toISOString() };
  const db = { from: (table: string) => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => ({ data: profiles }),
    eq: () => ({ maybeSingle: async () => ({ data: { raw: { strava_id: 123 } } }) }),
  }) }) }) };
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ latlng: { data: [[41, 2], [41.1, 2.1]] }, watts: { data: [100, 120] } }) });
  vi.stubGlobal('fetch', fetch);
  const result = await stravaStreamsForActivity(db, 'user', 'strava_123');
  expect(fetch.mock.calls[0][0]).toContain('keys=watts,heartrate,time,latlng');
  expect(result.latlng).toEqual([[41, 2], [41.1, 2.1]]);
  expect(result.watts).toEqual([100, 120]);
});