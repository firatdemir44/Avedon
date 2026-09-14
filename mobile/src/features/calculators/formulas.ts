// Tekstil Hesap Araçları — deterministik formüller.
// Prensip: kullanıcı fiyat/fire/verimlilik gibi değişken verileri kendisi girer,
// bu dosya sadece doğru formülle hesap yapar; hiçbir değer tahmin etmez.
//
// Girdi yapısı (satır satır iplik, "50 iğne iplik uzunluğu", fason/boya/kâr
// kalemleri) kullanıcının referans gösterdiği Örme Parkuru anlatımlarındaki
// ekranlardan alındı (2026-09-14). Formüllerin kendisi standart örme
// hesaplarıdır; iki örnek ekrandaki sonuçla sağlandı (gramaj 275 gr/m²,
// iplik numarası 75 tex ≈ 8 Ne / 13 Nm).

// ---------------------------------------------------------------------------
// İplik numarası
// ---------------------------------------------------------------------------

// Dolaylı sistemler (Ne, Nm): sayı büyüdükçe iplik incelir.
// Doğrudan sistemler (Tex, dtex, Denye): sayı büyüdükçe iplik kalınlaşır.
export type YarnCountSystem = 'ne' | 'nm' | 'tex' | 'dtex' | 'denye';

const NE_TO_NM_FACTOR = 1.693; // pamuk ipliği standart sabiti (Ne * 1.693 = Nm)

export interface YarnCountResult {
  tex: number;
  dtex: number;
  nm: number;
  ne: number;
  denye: number;
}

export function toTex(value: number, system: YarnCountSystem): number {
  switch (system) {
    case 'tex':
      return value;
    case 'dtex':
      return value / 10;
    case 'nm':
      return 1000 / value;
    case 'ne':
      return 1000 / (value * NE_TO_NM_FACTOR);
    case 'denye':
      return value / 9;
  }
}

export function fromTex(tex: number): YarnCountResult {
  const nm = 1000 / tex;
  return { tex, dtex: tex * 10, nm, ne: nm / NE_TO_NM_FACTOR, denye: tex * 9 };
}

// Katlı iplikte (örn. 60/2 Ne) sonuç ipliğin kalınlığı: tek katın Tex'i × kat
// sayısı. 60/2 Ne = 30 Ne ile aynı kalınlıktadır.
export function convertYarnCount(value: number, system: YarnCountSystem, ply = 1): YarnCountResult {
  return fromTex(toTex(value, system) * Math.max(1, ply));
}

// Numuneden iplik numarası: Tex = 1.000 metrenin gram ağırlığı.
// gram / (cm / 100.000 km) = gram × 100.000 / cm
export function yarnCountFromSample(lengthCm: number, weightGrams: number): YarnCountResult {
  return fromTex((weightGrams * 100000) / lengthCm);
}

// ---------------------------------------------------------------------------
// Kumaş gramajı
// ---------------------------------------------------------------------------

// Numuneden: kesilen parçanın ağırlığı / alanı (m²).
export function gsmFromSample(widthMm: number, lengthMm: number, weightGrams: number): number {
  return weightGrams / ((widthMm * lengthMm) / 1_000_000);
}

// 50 iğnede ölçülen iplik uzunluğundan tek ilmek boyu: cm × 10 / 50 = cm / 5 (mm).
export function loopLengthMmFrom50Needles(lengthCm: number): number {
  return lengthCm / 5;
}

export interface KnitGsmInput {
  coursesPerCm: number; // sıra/cm
  walesPerCm: number; // çubuk/cm
  loopLengthMm: number;
  yarnTex: number;
  doubleJersey: boolean; // çift plaka (ribana, interlok): yüz katsayısı 2
}

// Örgüden tahmini gramaj. 1 cm²'deki ilmek sayısı × ilmek boyu → m²'deki
// iplik uzunluğu; × Tex / 1000 → gram. Sadeleşince: S × ℓ(mm) × Tex / 100.
export function gsmFromKnitStructure(input: KnitGsmInput): number {
  const loopsPerCm2 = input.coursesPerCm * input.walesPerCm * (input.doubleJersey ? 2 : 1);
  return (loopsPerCm2 * input.loopLengthMm * input.yarnTex) / 100;
}

// ---------------------------------------------------------------------------
// Satır satır iplik beslemesi (iplik oranı ve üretim)
// ---------------------------------------------------------------------------

export interface YarnFeedRow {
  lengthPer50NeedlesCm: number;
  count: number;
  system: YarnCountSystem;
  feeders: number; // bu ipliğin beslendiği sistem sayısı
}

function isUsableRow(row: YarnFeedRow) {
  return row.lengthPer50NeedlesCm > 0 && row.count > 0 && row.feeders > 0;
}

// Bir makine devrinde bu satırın ördüğü iplik (gram).
function rowGramsPerRevolution(row: YarnFeedRow, needles: number): number {
  if (!isUsableRow(row)) return 0;
  const metersPerRevolution = (row.feeders * needles * loopLengthMmFrom50Needles(row.lengthPer50NeedlesCm)) / 1000;
  return (metersPerRevolution * toTex(row.count, row.system)) / 1000;
}

// Her ipliğin kumaştaki ağırlık payı (%). İğne sayısı tüm satırlarda aynı
// olduğu için sadeleşir; oran için gerekmez.
export function yarnUsageRatios(rows: YarnFeedRow[]): number[] {
  const weights = rows.map((row) => rowGramsPerRevolution(row, 1));
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) => (total > 0 ? (w / total) * 100 : 0));
}

export interface KnitProductionInput {
  rows: YarnFeedRow[];
  needles: number;
  rpm: number; // makine devri (devir/dk)
  efficiencyPercent: number; // randıman
  hoursPerDay: number;
  knittingFeePerKg?: number; // isteğe bağlı fason ücreti (₺/kg)
}

export interface KnitProductionResult {
  kgPerHour: number;
  kgPerDay: number;
  percents: number[];
  dailyFeeIncome: number | null;
}

export function calculateKnitProduction(input: KnitProductionInput): KnitProductionResult {
  const gramsPerRevolution = input.rows.reduce((sum, row) => sum + rowGramsPerRevolution(row, input.needles), 0);
  const kgPerHour = (gramsPerRevolution * input.rpm * 60 * (input.efficiencyPercent / 100)) / 1000;
  const kgPerDay = kgPerHour * input.hoursPerDay;
  return {
    kgPerHour,
    kgPerDay,
    percents: yarnUsageRatios(input.rows),
    dailyFeeIncome: input.knittingFeePerKg && input.knittingFeePerKg > 0 ? kgPerDay * input.knittingFeePerKg : null,
  };
}

// ---------------------------------------------------------------------------
// Kumaş maliyeti ve satış fiyatı
// ---------------------------------------------------------------------------

export type Currency = 'TRY' | 'USD' | 'EUR';

export interface CostYarnRow {
  price: number; // kg fiyatı
  currency: Currency;
  ratioPercent: number;
  wastagePercent: number; // iplik firesi
}

export interface FabricPricingInput {
  yarns: CostYarnRow[];
  usdTry: number;
  eurTry: number;
  knittingFeePerKg: number; // örme fason (₺/kg)
  overheadPercent: number; // genel gider oranı
  dyeingFeePerKg: number; // boya fason (₺/kg)
  dyeingLossPercent: number; // boya firesi
  profitPercent: number;
  weightGsm?: number; // isteğe bağlı: metre fiyatı için
  widthCm?: number;
}

export interface MoneyTriple {
  TRY: number;
  USD: number | null;
  EUR: number | null;
}

export interface FabricPricingResult {
  ratioTotal: number;
  yarnCostPerKg: MoneyTriple;
  greigeCostPerKg: MoneyTriple; // ham maliyet
  greigeSalePerKg: MoneyTriple; // ham satış
  dyedCostPerKg: MoneyTriple; // boyalı maliyet
  dyedSalePerKg: MoneyTriple; // boyalı satış
  metersPerKg: number | null;
}

function toTry(amount: number, currency: Currency, usdTry: number, eurTry: number) {
  if (currency === 'USD') return amount * usdTry;
  if (currency === 'EUR') return amount * eurTry;
  return amount;
}

function triple(tryAmount: number, usdTry: number, eurTry: number): MoneyTriple {
  return {
    TRY: tryAmount,
    USD: usdTry > 0 ? tryAmount / usdTry : null,
    EUR: eurTry > 0 ? tryAmount / eurTry : null,
  };
}

// Sıra: iplik (fire dahil) → + örme fason → + genel gider → ham maliyet.
// Boyalı: (ham maliyet + boya fason) boya firesiyle kilo kaybettiği için
// kalan kiloya bölünür: 100 kg ham kumaş %8 fireyle 92 kg boyalı kumaş olur.
// DOĞRULANMADI: referans ekrandaki sonuç rakamları okunamadı; boya firesinin
// bölme (kilo kaybı) mı çarpma mı olarak uygulandığı kullanıcıyla bir gerçek
// örnek üzerinden teyit edilmeli.
export function calculateFabricPricing(input: FabricPricingInput): FabricPricingResult {
  const { usdTry, eurTry } = input;
  const ratioTotal = input.yarns.reduce((sum, y) => sum + (y.price > 0 ? y.ratioPercent : 0), 0);

  const yarnCost = input.yarns.reduce(
    (sum, y) =>
      sum + toTry(y.price, y.currency, usdTry, eurTry) * (y.ratioPercent / 100) * (1 + y.wastagePercent / 100),
    0
  );
  const greigeCost = (yarnCost + input.knittingFeePerKg) * (1 + input.overheadPercent / 100);
  const lossFactor = 1 - Math.min(input.dyeingLossPercent, 99.9) / 100;
  const dyedCost = (greigeCost + input.dyeingFeePerKg) / lossFactor;
  const profit = 1 + input.profitPercent / 100;

  const metersPerKg =
    input.weightGsm && input.widthCm && input.weightGsm > 0 && input.widthCm > 0
      ? 100000 / (input.weightGsm * input.widthCm)
      : null;

  return {
    ratioTotal,
    yarnCostPerKg: triple(yarnCost, usdTry, eurTry),
    greigeCostPerKg: triple(greigeCost, usdTry, eurTry),
    greigeSalePerKg: triple(greigeCost * profit, usdTry, eurTry),
    dyedCostPerKg: triple(dyedCost, usdTry, eurTry),
    dyedSalePerKg: triple(dyedCost * profit, usdTry, eurTry),
    metersPerKg,
  };
}

// ---------------------------------------------------------------------------
// Değişmeyen hesaplar
// ---------------------------------------------------------------------------

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
