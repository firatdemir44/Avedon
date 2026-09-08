// Tekstil Hesap Araçları — deterministik formüller.
// Prensip: kullanıcı fiyat/fire/verimlilik gibi değişken verileri kendisi girer,
// bu dosya sadece doğru formülle hesap yapar; hiçbir değer tahmin etmez.

export interface FabricCostInput {
  yarnPricePerKg: number; // ₺/kg
  weightGsm: number; // gr/m²
  widthCm: number;
  wastagePercent: number; // fire oranı %
  finishingCostPerKg: number; // boyama/terbiye maliyeti ₺/kg
}

export interface FabricCostResult {
  weightPerMeterKg: number;
  costPerMeter: number;
  costPerKg: number;
}

export function calculateFabricCost(input: FabricCostInput): FabricCostResult {
  const weightPerMeterKg = (input.weightGsm * input.widthCm) / 100000; // gr/m² * cm / 100000 = kg/m
  const rawMaterialCostPerKg = input.yarnPricePerKg * (1 + input.wastagePercent / 100);
  const costPerKg = rawMaterialCostPerKg + input.finishingCostPerKg;
  const costPerMeter = costPerKg * weightPerMeterKg;
  return { weightPerMeterKg, costPerMeter, costPerKg };
}

export interface GarmentCostInput {
  fabricConsumptionMeters: number; // adet başı kumaş tüketimi
  fabricPricePerMeter: number;
  wastagePercent: number;
  laborCost: number;
  accessoryCost: number;
}

export interface GarmentCostResult {
  fabricCost: number;
  totalCost: number;
}

export function calculateGarmentCost(input: GarmentCostInput): GarmentCostResult {
  const fabricCost =
    input.fabricConsumptionMeters * input.fabricPricePerMeter * (1 + input.wastagePercent / 100);
  const totalCost = fabricCost + input.laborCost + input.accessoryCost;
  return { fabricCost, totalCost };
}

export type YarnCountSystem = 'tex' | 'nm' | 'ne' | 'denye';

export interface YarnCountResult {
  tex: number;
  nm: number;
  ne: number;
  denye: number;
}

const NE_TO_NM_FACTOR = 1.693; // pamuk ipliği standart sabiti (Ne * 1.693 = Nm)

export function convertYarnCount(value: number, system: YarnCountSystem): YarnCountResult {
  let tex: number;
  switch (system) {
    case 'tex':
      tex = value;
      break;
    case 'nm':
      tex = 1000 / value;
      break;
    case 'ne':
      tex = 1000 / (value * NE_TO_NM_FACTOR);
      break;
    case 'denye':
      tex = value / 9;
      break;
  }
  const nm = 1000 / tex;
  const ne = nm / NE_TO_NM_FACTOR;
  const denye = tex * 9;
  return { tex, nm, ne, denye };
}

export interface YarnUsageInput {
  fabricLengthMeters: number;
  weightGsm: number;
  widthCm: number;
  wastagePercent: number;
}

export function calculateYarnUsageKg(input: YarnUsageInput): number {
  const weightPerMeterKg = (input.weightGsm * input.widthCm) / 100000;
  return input.fabricLengthMeters * weightPerMeterKg * (1 + input.wastagePercent / 100);
}

export interface FabricWeightInput {
  yarnTex: number;
  loopLengthMm: number;
  kFactor: number; // örgü yapısına özgü sabit — kullanıcı kendi makine/kumaşına göre girer
}

export function calculateFabricWeightGsm(input: FabricWeightInput): number {
  // Genel örme kumaş gramaj ilişkisi: GSM = (K x Tex) / İlmek Boyu(mm)
  // K faktörü örgü tipine (single jersey, rib, interlok vb.) göre değişir;
  // sistem bu sabiti tahmin etmez, kullanıcıdan alır.
  return (input.kFactor * input.yarnTex) / input.loopLengthMm;
}

export interface ProductionInput {
  speedPerMinute: number; // makine hızı, birim kullanıcıya bağlı (m/dk, kg/dk vb.)
  shiftHours: number;
  shiftsPerDay: number;
  efficiencyPercent: number;
}

export function calculateDailyProduction(input: ProductionInput): number {
  const minutesPerDay = input.shiftHours * 60 * input.shiftsPerDay;
  return input.speedPerMinute * minutesPerDay * (input.efficiencyPercent / 100);
}
