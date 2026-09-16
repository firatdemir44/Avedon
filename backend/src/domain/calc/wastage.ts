// Fire zinciri ve en / gramaj dönüşümleri (Fırat'ın 2026-09-16 cevapları;
// docs/faz1-plani.md Adım 4 "Fırat'ın cevapları"). Yalnızca backend'de;
// mobil formül kopyasına (formulas.ts) dokunmaz.
//
// Üç fire birbirinden ayrı kayıp oranıdır ve zincir halinde uygulanır:
//   dikilmiş ürün → (kesim firesi) → mamul kumaş → (boya/apre firesi) → ham kumaş → (örme firesi) → iplik
// Her adımda ihtiyaç = sonraki aşama ihtiyacı / (1 - fire). %100'e yakın fire
// bölmeyi patlatmasın diye 99,9 ile sınırlanır (formulas.ts'teki koruma gibi).

const lossFactor = (percent: number) => 1 - Math.min(Math.max(percent, 0), 99.9) / 100;

export interface RequirementChainInput {
  // Gereken mamul (boyalı/apreli) kumaş, kg. garmentFabricKg verilirse bundan türetilir.
  finishedKg?: number;
  // Dikilmiş ürüne giren kumaş (kg); kesim firesiyle mamul ihtiyacına çevrilir.
  garmentFabricKg?: number;
  cuttingLossPercent?: number;
  dyeingLossPercent: number;
  knittingLossPercent: number;
}

export interface RequirementChain {
  garmentFabricKg: number | null;
  finishedKg: number;
  greigeKg: number;
  yarnKg: number;
}

// Örnek (Fırat): 1.000 kg mamul, boya %5, örme %3 → ham 1.052,63 kg, iplik 1.085,19 kg.
export function requirementChain(input: RequirementChainInput): RequirementChain {
  const garmentFabricKg = input.garmentFabricKg ?? null;
  const finishedKg =
    garmentFabricKg != null ? garmentFabricKg / lossFactor(input.cuttingLossPercent ?? 0) : (input.finishedKg ?? 0);
  const greigeKg = finishedKg / lossFactor(input.dyeingLossPercent);
  const yarnKg = greigeKg / lossFactor(input.knittingLossPercent);
  return { garmentFabricKg, finishedKg, greigeKg, yarnKg };
}

// Tüp kumaşta "tek yüz tüp eni" verildiyse hesapta kullanılacak açık en iki katıdır.
// Bazı işletmeler tüp kumaşı açık enle ifade eder; bu yüzden çarpma otomatik
// DEĞİL, enin anlamı kullanıcıdan alınır (widthMeaning).
export type WidthMeaning = 'acik' | 'tup_tek_yuz';

export function effectiveWidthCm(widthCm: number, meaning: WidthMeaning): number {
  return meaning === 'tup_tek_yuz' ? widthCm * 2 : widthCm;
}

// Metre ağırlığı sabitken en değişirse gramaj değişir: gramaj × ham en / mamul en.
// Örnek (Fırat): 320 g/m, 180 cm ham → 177,8 g/m²; 160 cm mamul → 200 g/m².
export function gsmAfterWidthChange(greigeGsm: number, greigeWidthCm: number, finishedWidthCm: number): number {
  return (greigeGsm * greigeWidthCm) / finishedWidthCm;
}

// Kullanıcının kendi geçmişinden verdiği yüzde değişimle tahmini mamul gramaj.
export function gsmWithChangePercent(greigeGsm: number, changePercent: number): number {
  return greigeGsm * (1 + changePercent / 100);
}
