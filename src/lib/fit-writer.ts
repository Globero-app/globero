// Minimal FIT file encoder for Workout files.
// Supports: file_id, workout, workout_step (power/HR/cadence/open targets).
// Reference: Garmin FIT SDK Profile.

const FIT_PROTOCOL = 0x20;
const FIT_PROFILE = 2140;

type TargetType = "power" | "hr" | "cadence" | "open";
type Intensity = "active" | "rest" | "warmup" | "cooldown" | "recovery" | "interval";
type DurationType = "time" | "open";

export interface FitWorkoutStep {
  name?: string;
  notes?: string;
  duration_type: DurationType; // 'time' (seconds) or 'open' (lap button)
  duration_value?: number;     // seconds when duration_type='time'
  target: TargetType;
  // For power: watts low/high; for hr: bpm; for cadence: rpm; for open: ignored
  target_low?: number;
  target_high?: number;
  intensity?: Intensity;
}

export interface FitWorkout {
  name: string;           // ≤15 chars in FIT, we truncate
  sport?: "cycling";      // default cycling
  steps: FitWorkoutStep[];
}

// ---------- low level writer ----------
class Buf {
  private parts: number[] = [];
  u8(v: number) { this.parts.push(v & 0xff); }
  u16(v: number) { this.parts.push(v & 0xff, (v >> 8) & 0xff); }
  u32(v: number) {
    this.parts.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff);
  }
  bytes(arr: number[]) { for (const b of arr) this.parts.push(b & 0xff); }
  str(s: string, len: number) {
    const enc = new TextEncoder().encode(s);
    for (let i = 0; i < len; i++) this.parts.push(i < enc.length ? enc[i] : 0);
  }
  toArray() { return this.parts.slice(); }
  get length() { return this.parts.length; }
}

// FIT CRC table
const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401,
  0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
];
function crc16(bytes: number[]): number {
  let crc = 0;
  for (const b of bytes) {
    let tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[b & 0xf];
    tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xf];
  }
  return crc & 0xffff;
}

// Base type codes
const T_ENUM = 0x00, T_UINT8 = 0x02, T_STRING = 0x07, T_UINT16 = 0x84, T_UINT32 = 0x86, T_SINT32 = 0x85;

function defMsg(localNum: number, globalMsgNum: number, fields: Array<[number, number, number]>) {
  // fields: [fieldDefNum, size, baseType]
  const b = new Buf();
  b.u8(0x40 | (localNum & 0x0f)); // definition record header
  b.u8(0); // reserved
  b.u8(0); // arch little endian
  b.u16(globalMsgNum);
  b.u8(fields.length);
  for (const [num, size, base] of fields) {
    b.u8(num); b.u8(size); b.u8(base);
  }
  return b.toArray();
}

function dataHeader(localNum: number) { return localNum & 0x0f; }

// ---------- workout file ----------
const SPORT_CYCLING = 2;
const FILE_WORKOUT = 5;
const MFG_DEVELOPMENT = 255;

const INTENSITY_MAP: Record<Intensity, number> = {
  active: 0, rest: 1, warmup: 2, cooldown: 3, recovery: 4, interval: 5,
};

// wkt_step_duration enum
const DUR_TIME = 0, DUR_OPEN = 1;
// wkt_step_target enum
const TGT_HR = 1, TGT_CAD = 3, TGT_POWER = 4, TGT_OPEN = 2;

export function encodeWorkoutFit(wk: FitWorkout): Uint8Array {
  const body = new Buf();
  const name15 = (wk.name || "Workout").slice(0, 15);

  // --- file_id (global 0) local=0
  body.bytes(defMsg(0, 0, [
    [3, 4, T_UINT32], // serial_number
    [4, 4, T_UINT32], // time_created
    [1, 2, T_UINT16], // manufacturer
    [2, 2, T_UINT16], // product
    [0, 1, T_ENUM],   // type
  ]));
  const d = new Buf();
  d.u8(dataHeader(0));
  d.u32(0x12345678);
  // FIT time = seconds since 1989-12-31 00:00:00 UTC
  const fitTime = Math.floor(Date.now() / 1000) - 631065600;
  d.u32(fitTime);
  d.u16(MFG_DEVELOPMENT);
  d.u16(0);
  d.u8(FILE_WORKOUT);
  body.bytes(d.toArray());

  // --- workout (global 26) local=1
  body.bytes(defMsg(1, 26, [
    [8, 16, T_STRING], // wkt_name (16 bytes)
    [4, 2, T_UINT16],  // num_valid_steps
    [254, 2, T_UINT16],// message_index (set 0)
    [5, 1, T_UINT8],   // sport
  ]));
  const w = new Buf();
  w.u8(dataHeader(1));
  w.str(name15, 16);
  w.u16(wk.steps.length);
  w.u16(0);
  w.u8(SPORT_CYCLING);
  body.bytes(w.toArray());

  // --- workout_step (global 27) local=2
  body.bytes(defMsg(2, 27, [
    [254, 2, T_UINT16], // message_index
    [0, 16, T_STRING],  // wkt_step_name
    [2, 4, T_UINT32],   // duration_value
    [4, 4, T_UINT32],   // target_value
    [5, 4, T_UINT32],   // custom_target_value_low
    [6, 4, T_UINT32],   // custom_target_value_high
    [1, 1, T_ENUM],     // duration_type
    [3, 1, T_ENUM],     // target_type
    [7, 1, T_ENUM],     // intensity
  ]));
  wk.steps.forEach((s, i) => {
    const sb = new Buf();
    sb.u8(dataHeader(2));
    sb.u16(i);
    sb.str((s.name || "").slice(0, 15), 16);
    sb.u32(s.duration_type === "time" ? Math.max(1, Math.round((s.duration_value ?? 60) * 1000)) : 0);
    // target_value=0 (custom); use custom_target_value_low/high for ranges
    sb.u32(0);
    // Power values use offset 1000 (watts + 1000) per FIT spec when using "power" target with custom_value_low/high
    let lo = s.target_low ?? 0, hi = s.target_high ?? 0;
    let tgt = TGT_OPEN;
    if (s.target === "power") {
      tgt = TGT_POWER;
      lo = (lo > 0 ? lo + 1000 : 0);
      hi = (hi > 0 ? hi + 1000 : 0);
    } else if (s.target === "hr") {
      tgt = TGT_HR;
      // <100 → %max, ≥100 → bpm (per FIT). We assume bpm here; values >100 are bpm directly.
    } else if (s.target === "cadence") {
      tgt = TGT_CAD;
    }
    sb.u32(lo);
    sb.u32(hi);
    sb.u8(s.duration_type === "time" ? DUR_TIME : DUR_OPEN);
    sb.u8(tgt);
    sb.u8(INTENSITY_MAP[s.intensity ?? "active"]);
    body.bytes(sb.toArray());
  });

  const dataBytes = body.toArray();

  // Header (14 bytes) + data + CRC
  const header = new Buf();
  header.u8(14);          // header size
  header.u8(FIT_PROTOCOL);
  header.u16(FIT_PROFILE);
  header.u32(dataBytes.length);
  header.bytes([0x2e, 0x46, 0x49, 0x54]); // ".FIT"
  const headerNoCrc = header.toArray();
  const headerCrc = crc16(headerNoCrc);
  headerNoCrc.push(headerCrc & 0xff, (headerCrc >> 8) & 0xff);

  const all = headerNoCrc.concat(dataBytes);
  const fileCrc = crc16(all);
  all.push(fileCrc & 0xff, (fileCrc >> 8) & 0xff);

  return new Uint8Array(all);
}

export function downloadFit(workout: FitWorkout, filename: string) {
  const bytes = encodeWorkoutFit(workout);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".fit") ? filename : `${filename}.fit`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
