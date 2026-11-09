import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), lock: vi.fn(), release: vi.fn(), detect: vi.fn(),
  filters: [] as [string, unknown][], columns: "", source: "",
}));
const users = [
  { id: "00000000-0000-4000-8000-000000000001", notify_training_push: false },
  { id: "00000000-0000-4000-8000-000000000002", notify_training_push: false },
];
vi.mock("@/lib/cron-auth.server", () => ({ verifyCronRequest: mocks.auth }));
vi.mock("@/lib/activity-detect.server", () => ({
  acquireJobLock: mocks.lock, releaseJobLock: mocks.release, detectAndAssign: mocks.detect,
  remindPendingWorkout: vi.fn(),
}));
vi.mock("@/lib/next-week-gen.server", () => ({ maybeGenerateNextWeekEarly: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => {
      const query = {
        select: (columns: string) => { mocks.columns = columns; return query; },
        or: (source: string) => { mocks.source = source; return query; },
        is: () => query,
        limit: () => query,
        eq: (key: string, value: unknown) => { mocks.filters.push([key, value]); return query; },
        then: (resolve: (result: unknown) => unknown) => Promise.resolve({
          data: users.filter(u => mocks.filters.every(([key, value]) => key === "id" && u.id === value)),
          error: null,
        }).then(resolve),
      };
      return query;
    },
  },
}));
import { Route } from "../../routes/api/public/hooks/activity-detect";

function run(search = "") {
  const handlers = Route.options.server?.handlers;
  const handler = typeof handlers === "function" ? undefined : handlers?.POST;
  if (typeof handler !== "function") throw new Error("POST handler missing");
  return handler({ request: new Request(`http://localhost/api/public/hooks/activity-detect${search}`, { method: "POST" }) } as Parameters<typeof handler>[0]) as Promise<Response>;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.filters = [];
  mocks.auth.mockResolvedValue(true);
  mocks.lock.mockResolvedValue(true);
  mocks.detect.mockResolvedValue({ auto: 2, asked: 1 });
});
it("filters processing to the requested user", async () => {
  const body = await (await run(`?userId=${users[1].id}`)).json();
  expect(mocks.detect).toHaveBeenCalledTimes(1);
  expect(mocks.detect.mock.calls[0][1]).toBe(users[1].id);
  expect(body.results).toEqual([{ user: users[1].id, auto: 2, asked: 1 }]);
});
it("returns per-user results and totals without exposing tokens", async () => {
  const body = await (await run()).json();
  expect(body.results).toEqual(users.map(u => ({ user: u.id, auto: 2, asked: 1 })));
  expect(body.auto).toBe(4);
  expect(body.asked).toBe(2);
  expect(mocks.columns.split(", ")).toContain("strava_access_token");
  expect(mocks.source.split(",")).toContain("strava_access_token.not.is.null");
});
it("keeps user-filtered requests authenticated", async () => {
  mocks.auth.mockResolvedValue(false);
  expect((await run(`?userId=${users[0].id}`)).status).toBe(401);
  expect(mocks.lock).not.toHaveBeenCalled();
});
it("rejects an invalid user identifier before acquiring the lock", async () => {
  expect((await run("?userId=invalid")).status).toBe(400);
  expect(mocks.lock).not.toHaveBeenCalled();
});