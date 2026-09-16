import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as units from '../glossary/units';
import {
  calculateFabricPricing,
  calculateGarmentCost,
  calculateKnitProduction,
  calculateYarnUsageKg,
  convertYarnCount,
  fromTex,
  gsmFromKnitStructure,
  gsmFromSample,
  loopLengthMmFrom50Needles,
  toTex,
  yarnCountFromSample,
  yarnUsageRatios,
  type YarnCountSystem,
  type YarnFeedRow,
} from './formulas';

const close = (a: number, b: number, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

// ---------------------------------------------------------------------------
// İplik numarası
// ---------------------------------------------------------------------------

test('referans: 75 tex ≈ 8 Ne / 13 Nm', () => {
  const r = convertYarnCount(75, 'tex');
  assert.ok(close(r.ne, 7.876, 0.001), `ne = ${r.ne}`);
  assert.ok(close(r.nm, 13.333, 0.001), `nm = ${r.nm}`);
  assert.equal(Math.round(r.ne), 8);
  assert.equal(Math.round(r.nm), 13);
  assert.equal(r.denye, 675);
  assert.equal(r.dtex, 750);
});

test('katlı iplik: 60/2 Ne, 30 Ne kalınlığındadır', () => {
  const doubled = convertYarnCount(60, 'ne', 2);
  const single = convertYarnCount(30, 'ne');
  assert.ok(close(doubled.tex, single.tex), `${doubled.tex} != ${single.tex}`);
  assert.ok(close(doubled.ne, 30, 1e-9));
  // Kat sayısı verilmezse ya da 0 verilirse tek kat kabul edilir.
  assert.ok(close(convertYarnCount(30, 'ne', 0).tex, single.tex));
});

test('iplik numarası gidiş dönüş: bütün sistemler', () => {
  const systems: YarnCountSystem[] = ['ne', 'nm', 'tex', 'dtex', 'denye'];
  for (const system of systems) {
    const r = convertYarnCount(40, system);
    assert.ok(close(toTex(r[system], system), r.tex, 1e-9), system);
  }
});

test('toTex/fromTex sonuçları sözlük katmanıyla (glossary/units) birebir aynı', () => {
  const systems: YarnCountSystem[] = ['ne', 'nm', 'tex', 'dtex', 'denye'];
  for (const system of systems) {
    for (const value of [1, 20, 30, 75, 150, 300]) {
      assert.equal(toTex(value, system), units.toTex(value, system), `${value} ${system}`);
      assert.deepEqual(convertYarnCount(value, system, 2), units.convertYarnCount(value, system, 2), `${value} ${system} katlı`);
    }
  }
  assert.deepEqual(fromTex(19.5), units.fromTex(19.5));
});

test('numuneden iplik numarası: 100 cm iplik 0,2 g → 200 tex', () => {
  const r = yarnCountFromSample(100, 0.2);
  assert.ok(close(r.tex, 200, 1e-9), `tex = ${r.tex}`);
  assert.ok(close(r.nm, 5, 1e-9));
  assert.equal(r.denye, 1800);
});

// ---------------------------------------------------------------------------
// Gramaj
// ---------------------------------------------------------------------------

test('referans: numuneden gramaj 275 gr/m²', () => {
  // 10 cm × 10 cm kesilen parça 2,75 gram geldiyse gramaj 275 gr/m².
  assert.ok(close(gsmFromSample(100, 100, 2.75), 275, 1e-9));
  // Aynı gramaj, farklı numune ölçüsü: 20 cm × 25 cm → 0,05 m² → 13,75 g.
  assert.ok(close(gsmFromSample(200, 250, 13.75), 275, 1e-9));
});

test('50 iğne iplik uzunluğundan ilmek boyu', () => {
  assert.ok(close(loopLengthMmFrom50Needles(15), 3, 1e-9));
});

test('örgüden gramaj: çift plaka tek plakanın iki katı', () => {
  const base = { coursesPerCm: 16, walesPerCm: 14, loopLengthMm: 3, yarnTex: 20 };
  const single = gsmFromKnitStructure({ ...base, doubleJersey: false });
  // 16 × 14 × 3 × 20 / 100 = 134,4
  assert.ok(close(single, 134.4, 1e-9), `single = ${single}`);
  assert.ok(close(gsmFromKnitStructure({ ...base, doubleJersey: true }), single * 2, 1e-9));
});

// ---------------------------------------------------------------------------
// İplik payları ve üretim
// ---------------------------------------------------------------------------

const row = (over: Partial<YarnFeedRow> = {}): YarnFeedRow => ({
  lengthPer50NeedlesCm: 15,
  count: 30,
  system: 'ne',
  feeders: 1,
  ...over,
});

test('yarnUsageRatios: boş liste boş dizi döner', () => {
  assert.deepEqual(yarnUsageRatios([]), []);
});

test('yarnUsageRatios: kullanılamayan satır 0 alır, çökmez', () => {
  assert.deepEqual(yarnUsageRatios([row({ lengthPer50NeedlesCm: 0 })]), [0]);
  assert.deepEqual(yarnUsageRatios([row({ count: 0 }), row({ feeders: 0 })]), [0, 0]);
  const mixed = yarnUsageRatios([row(), row({ lengthPer50NeedlesCm: 0 })]);
  assert.deepEqual(mixed, [100, 0]);
});

test('yarnUsageRatios: aynı iplikten iki satır, besleyici sayısına göre paylaşır', () => {
  const p = yarnUsageRatios([row({ feeders: 3 }), row({ feeders: 1 })]);
  assert.ok(close(p[0], 75, 1e-9), `${p[0]}`);
  assert.ok(close(p[1], 25, 1e-9));
  assert.ok(close(p[0] + p[1], 100, 1e-9));
});

test('calculateKnitProduction: kg/saat, kg/gün ve fason geliri', () => {
  const out = calculateKnitProduction({
    rows: [row({ lengthPer50NeedlesCm: 15, count: 30, system: 'ne', feeders: 96 })],
    needles: 1920,
    rpm: 25,
    efficiencyPercent: 85,
    hoursPerDay: 24,
    knittingFeePerKg: 10,
  });
  // Bir devir: 96 × 1920 × 3 mm = 552.960 mm = 552,96 m; 30 Ne = 19,689 tex
  // → 552,96 × 19,689 / 1000 = 10,887 g. Saatte × 25 × 60 × 0,85 / 1000 = 13,88 kg.
  assert.ok(close(out.kgPerHour, 13.882, 0.01), `kgPerHour = ${out.kgPerHour}`);
  assert.ok(close(out.kgPerDay, out.kgPerHour * 24, 1e-9));
  assert.deepEqual(out.percents, [100]);
  assert.ok(close(out.dailyFeeIncome as number, out.kgPerDay * 10, 1e-9));
});

test('calculateKnitProduction: fason ücreti yoksa gelir null', () => {
  const base = { rows: [row()], needles: 1000, rpm: 20, efficiencyPercent: 100, hoursPerDay: 8 };
  assert.equal(calculateKnitProduction(base).dailyFeeIncome, null);
  assert.equal(calculateKnitProduction({ ...base, knittingFeePerKg: 0 }).dailyFeeIncome, null);
});

test('calculateKnitProduction: randıman 0 ise üretim 0, çökmez', () => {
  const out = calculateKnitProduction({ rows: [row()], needles: 1000, rpm: 20, efficiencyPercent: 0, hoursPerDay: 8 });
  assert.equal(out.kgPerHour, 0);
  assert.equal(out.kgPerDay, 0);
});

// ---------------------------------------------------------------------------
// Kumaş maliyeti
// ---------------------------------------------------------------------------

const pricingBase = {
  usdTry: 0,
  eurTry: 0,
  knittingFeePerKg: 0,
  overheadPercent: 0,
  dyeingFeePerKg: 0,
  dyeingLossPercent: 0,
  profitPercent: 0,
};

test('kumaş maliyeti: tarifteki örnek (100 kg ham, %8 boya firesi)', () => {
  // Kullanıcının tarifi: 100 kg ham kumaş boyaya girer, %8 fire verir, 92 kg
  // çıkar; boya ücreti 100 kilo üzerinden alınır, maliyet 92 kg'a bölünür.
  const out = calculateFabricPricing({
    ...pricingBase,
    yarns: [{ price: 100, currency: 'TRY', ratioPercent: 100, wastagePercent: 0 }],
    knittingFeePerKg: 20,
    overheadPercent: 10,
    dyeingFeePerKg: 30,
    dyeingLossPercent: 8,
    profitPercent: 25,
  });
  assert.ok(close(out.yarnCostPerKg.TRY, 100, 1e-9));
  assert.ok(close(out.greigeCostPerKg.TRY, 132, 1e-9), `ham = ${out.greigeCostPerKg.TRY}`);
  const expectedDyed = (132 + 30) / 0.92;
  assert.ok(close(out.dyedCostPerKg.TRY, expectedDyed, 1e-9), `boyalı = ${out.dyedCostPerKg.TRY}`);
  assert.ok(close(out.dyedSalePerKg.TRY, expectedDyed * 1.25, 1e-9));
  assert.ok(close(out.greigeSalePerKg.TRY, 165, 1e-9));
  assert.equal(out.ratioTotal, 100);
  assert.equal(out.metersPerKg, null, 'gramaj/en yoksa metre hesabı yok');
});

test('kumaş maliyeti: iplik firesi, kur çevirisi ve oran toplamı', () => {
  const out = calculateFabricPricing({
    ...pricingBase,
    yarns: [
      { price: 2, currency: 'USD', ratioPercent: 95, wastagePercent: 5 },
      { price: 100, currency: 'TRY', ratioPercent: 5, wastagePercent: 0 },
    ],
    usdTry: 40,
    weightGsm: 200,
    widthCm: 180,
  });
  // 2 USD × 40 = 80 TRY; × 0,95 × 1,05 = 79,8. Elastan: 100 × 0,05 = 5.
  assert.ok(close(out.yarnCostPerKg.TRY, 84.8, 1e-9), `${out.yarnCostPerKg.TRY}`);
  assert.ok(close(out.yarnCostPerKg.USD as number, 84.8 / 40, 1e-9));
  assert.equal(out.yarnCostPerKg.EUR, null, 'EUR kuru verilmediyse null');
  assert.equal(out.ratioTotal, 100);
  assert.ok(close(out.metersPerKg as number, 100000 / (200 * 180), 1e-9));
});

test('kumaş maliyeti: fiyatı 0 olan iplik oran toplamına girmez', () => {
  const out = calculateFabricPricing({
    ...pricingBase,
    yarns: [
      { price: 100, currency: 'TRY', ratioPercent: 95, wastagePercent: 0 },
      { price: 0, currency: 'TRY', ratioPercent: 5, wastagePercent: 0 },
    ],
  });
  assert.equal(out.ratioTotal, 95, 'fiyatı girilmemiş satır uyarı için sayılmaz');
  assert.ok(close(out.yarnCostPerKg.TRY, 95, 1e-9));
});

test('boya firesi %100 yakınına çıksa da sonuç sonlu kalır (99,9 ile sınırlanır)', () => {
  const out = calculateFabricPricing({
    ...pricingBase,
    yarns: [{ price: 100, currency: 'TRY', ratioPercent: 100, wastagePercent: 0 }],
    dyeingLossPercent: 150,
  });
  assert.ok(Number.isFinite(out.dyedCostPerKg.TRY), 'sonsuz olmamalı');
  assert.ok(close(out.dyedCostPerKg.TRY, 100 / 0.001, 1e-6), `${out.dyedCostPerKg.TRY}`);
  const at100 = calculateFabricPricing({
    ...pricingBase,
    yarns: [{ price: 100, currency: 'TRY', ratioPercent: 100, wastagePercent: 0 }],
    dyeingLossPercent: 100,
  });
  assert.equal(at100.dyedCostPerKg.TRY, out.dyedCostPerKg.TRY);
});

test('kumaş maliyeti: hiç iplik yoksa sıfır, çökmez', () => {
  const out = calculateFabricPricing({ ...pricingBase, yarns: [] });
  assert.equal(out.yarnCostPerKg.TRY, 0);
  assert.equal(out.ratioTotal, 0);
  assert.equal(out.dyedCostPerKg.TRY, 0);
});

// ---------------------------------------------------------------------------
// Konfeksiyon ve iplik ihtiyacı
// ---------------------------------------------------------------------------

test('konfeksiyon maliyeti: basit örnek', () => {
  const out = calculateGarmentCost({
    fabricConsumptionMeters: 1.2,
    fabricPricePerMeter: 150,
    wastagePercent: 10,
    laborCost: 60,
    accessoryCost: 15,
  });
  // 1,2 × 150 = 180; %10 fire → 198; + 60 + 15 = 273.
  assert.ok(close(out.fabricCost, 198, 1e-9), `${out.fabricCost}`);
  assert.ok(close(out.totalCost, 273, 1e-9), `${out.totalCost}`);
});

test('konfeksiyon maliyeti: fire ve ek kalem yoksa yalnızca kumaş', () => {
  const out = calculateGarmentCost({
    fabricConsumptionMeters: 2,
    fabricPricePerMeter: 100,
    wastagePercent: 0,
    laborCost: 0,
    accessoryCost: 0,
  });
  assert.equal(out.fabricCost, 200);
  assert.equal(out.totalCost, 200);
});

test('gereken iplik kilosu: 1.000 m, 180 gr/m², 180 cm', () => {
  // 1 m = 180 × 1,8 = 324 g → 1.000 m = 324 kg; %5 fire ile 340,2 kg.
  assert.ok(close(calculateYarnUsageKg({ fabricLengthMeters: 1000, weightGsm: 180, widthCm: 180, wastagePercent: 0 }), 324, 1e-9));
  assert.ok(
    close(calculateYarnUsageKg({ fabricLengthMeters: 1000, weightGsm: 180, widthCm: 180, wastagePercent: 5 }), 340.2, 1e-9)
  );
});

test('gereken iplik kilosu, sözlük katmanındaki metersToKg ile aynı', () => {
  const kg = calculateYarnUsageKg({ fabricLengthMeters: 250, weightGsm: 220, widthCm: 165, wastagePercent: 0 });
  assert.ok(close(kg, units.metersToKg(250, 220, 165), 1e-9));
  assert.ok(close(units.kgToMeters(kg, 220, 165), 250, 1e-9), 'gidiş dönüş');
});
