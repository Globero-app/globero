import { describe, expect, it } from "vitest";
import { encodeWorkoutFit, type FitWorkout } from "../fit-writer";

// Read wire fields, not encoder internals: catches wrong FIT field numbers/types.
function records(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const definitions = new Map<number, { global: number; fields: { id: number; size: number }[] }>();
  const result: { global: number; fields: Record<number, number> }[] = [];
  const start = view.getUint8(0);
  const end = start + view.getUint32(4, true);
  let offset = start;
  while (offset < end) {
    const header = view.getUint8(offset++);
    const local = header & 15;
    if (header & 64) {
      offset += 2;
      const global = view.getUint16(offset, true);
      offset += 2;
      const count = view.getUint8(offset++);
      const fields = [];
      for (let i = 0; i < count; i++) {
        fields.push({ id: view.getUint8(offset), size: view.getUint8(offset + 1) });
        offset += 3;
      }
      definitions.set(local, { global, fields });
    } else {
      const definition = definitions.get(local);
      if (!definition) throw new Error("Missing FIT definition");
      const fields: Record<number, number> = {};
      for (const field of definition.fields) {
        if (field.size === 1) fields[field.id] = view.getUint8(offset);
        if (field.size === 2) fields[field.id] = view.getUint16(offset, true);
        if (field.size === 4) fields[field.id] = view.getUint32(offset, true);
        offset += field.size;
      }
      result.push({ global: definition.global, fields });
    }
  }
  return result;
}

const workout: FitWorkout = {
  name: "Rodaje",
  steps: [{ duration_type: "time", duration_value: 600, target: "power", target_low: 150, target_high: 180 }],
};

describe("FIT workout wire format", () => {
  it("declares cycling and the valid step count in official FIT fields", () => {
    const rec = records(encodeWorkoutFit(workout)).find((r) => r.global === 26);
    expect(rec?.fields[4]).toBe(2); // sport=cycling, NOT num_valid_steps
    expect(rec?.fields[6]).toBe(1);
    expect(rec?.fields[11]).toBe(0);
  });
  it("preserves outdoor absolute-watt ranges", () => {
    const rec = records(encodeWorkoutFit(workout)).find((r) => r.global === 27);
    expect(rec?.fields[3]).toBe(4); // target_type=power
    expect(rec?.fields[4]).toBe(0); // custom power zone
    expect(rec?.fields[5]).toBe(1150);
    expect(rec?.fields[6]).toBe(1180);
    expect(rec?.fields[2]).toBe(600000); // milliseconds
  });
  it("exports indoor ERG with equal absolute-watt bounds, not FTP percentages", () => {
    const data = records(encodeWorkoutFit({ ...workout, indoor: true }));
    expect(data.find((r) => r.global === 26)?.fields[11]).toBe(6);
    const rec = data.find((r) => r.global === 27);
    expect(rec?.fields[4]).toBe(0);
    expect(rec?.fields[5]).toBe(1165);
    expect(rec?.fields[6]).toBe(1165);
  });
  it("encodes even zero watts as absolute watts and lap as open duration", () => {
    const data = records(encodeWorkoutFit({ ...workout, indoor: true, steps: [{ duration_type: "open", target: "power", target_low: 0, target_high: 0 }] }));
    const rec = data.find((r) => r.global === 27);
    expect(rec?.fields[1]).toBe(5);
    expect(rec?.fields[5]).toBe(1000);
    expect(rec?.fields[6]).toBe(1000);
  });
});