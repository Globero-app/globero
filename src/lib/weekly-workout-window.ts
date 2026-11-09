import { z } from "zod";

export const weeklyWorkoutParams = z.object({
  force: z.enum(["0", "1"]).default("0"),
  userId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(3),
});

/** Calendar arithmetic uses Madrid's date at UTC noon to avoid DST shifts. */
export function weeklyWorkoutWindow(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const date = `${value("year")}-${value("month")}-${value("day")}`;
  const base = new Date(`${date}T12:00:00Z`);
  const dow = base.getUTCDay();
  const minutes = Number(value("hour")) * 60 + Number(value("minute"));
  const allowed = (dow === 0 && minutes >= 21 * 60) || (dow === 1 && minutes <= 14 * 60);
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() + (dow === 0 ? 1 : 1 - dow));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const from = new Date(monday);
  from.setUTCDate(monday.getUTCDate() - 1);
  return {
    date, allowed, hour: Number(value("hour")),
    mondayISO: monday.toISOString().slice(0, 10),
    untilSunday: sunday.toISOString().slice(0, 10),
    from,
  };
}