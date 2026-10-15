import { describe, expect, it } from "vitest";
import { calculateDrinkMix } from "../drink-mix";

describe("homemade drink mix", () => {
  it("splits 90 g at 2:1 into 60 g maltodextrin and 30 g fructose", () => {
    const mix = calculateDrinkMix(90, 750, 2, "2:1", 600);
    expect(mix?.maltodextrin).toBe(60);
    expect(mix?.fructose).toBe(30);
    expect(mix?.totalCarbs).toBe(180);
    expect(mix?.totalWaterMl).toBe(1500);
  });
  it("splits 90 g at 1:0.8 into 50 g and 40 g", () => {
    const mix = calculateDrinkMix(90, 750, 1, "1:0.8", 0);
    expect(mix?.maltodextrin).toBe(50);
    expect(mix?.fructose).toBe(40);
    expect(mix?.salt).toBe(0);
  });
  it("calculates sodium from bottle volume and converts to salt", () => {
    const mix = calculateDrinkMix(60, 500, 3, "2:1", 786);
    expect(mix?.sodiumMg).toBe(393);
    expect(mix?.salt).toBe(1);
    expect(mix?.totalSalt).toBe(3);
    expect(mix?.concentration).toBe(12);
  });
  it("rejects invalid quantities", () => {
    expect(calculateDrinkMix(60, 0, 1, "2:1", 600)).toBeNull();
    expect(calculateDrinkMix(-1, 500, 1, "2:1", 600)).toBeNull();
    expect(calculateDrinkMix(60, 500, 1.5, "2:1", 600)).toBeNull();
    expect(calculateDrinkMix(NaN, 500, 1, "2:1", 600)).toBeNull();
  });
});