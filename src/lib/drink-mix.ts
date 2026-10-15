export type MixRatio = "2:1" | "1:0.8";

/** Pure carbohydrate powders; table salt contains approximately 39.3% sodium. */
export function calculateDrinkMix(carbs: number, volumeMl: number, bottles: number, ratio: MixRatio, sodiumMgPerL: number) {
  if (![carbs, volumeMl, bottles, sodiumMgPerL].every(Number.isFinite) || carbs < 0 || volumeMl <= 0 || bottles < 1 || !Number.isInteger(bottles) || sodiumMgPerL < 0) return null;
  const fructosePart = ratio === "2:1" ? 0.5 : 0.8;
  const maltodextrin = carbs / (1 + fructosePart);
  const fructose = carbs - maltodextrin;
  const sodiumMg = sodiumMgPerL * volumeMl / 1000;
  const salt = sodiumMg / 393;
  return { maltodextrin, fructose, sodiumMg, salt, concentration: carbs / volumeMl * 100, totalCarbs: carbs * bottles, totalMaltodextrin: maltodextrin * bottles, totalFructose: fructose * bottles, totalSalt: salt * bottles, totalWaterMl: volumeMl * bottles };
}