import type { CalendarEvent } from "./calendar.functions";

function pad(n: number) { return String(n).padStart(2, "0"); }

function toIcsDate(dateStr: string): string {
  // All-day format YYYYMMDD
  return dateStr.replace(/-/g, "");
}

function toIcsDateTime(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function escape(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildIcs(events: CalendarEvent[]): string {
  const stamp = toIcsDateTime(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Globero//Calendario//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Globero",
  ];
  for (const e of events) {
    const start = toIcsDate(e.date);
    const endDate = new Date(e.date + "T00:00:00Z");
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const end = `${endDate.getUTCFullYear()}${pad(endDate.getUTCMonth() + 1)}${pad(endDate.getUTCDate())}`;
    const prefix = e.kind === "competition" ? "🏆 " : e.kind === "workout" ? "🚴 " : "📊 ";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@globero`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${escape(prefix + e.title)}`,
      e.subtitle ? `DESCRIPTION:${escape(e.subtitle)}` : "",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).join("\r\n");
}

export function downloadIcs(filename: string, events: CalendarEvent[]) {
  const blob = new Blob([buildIcs(events)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
