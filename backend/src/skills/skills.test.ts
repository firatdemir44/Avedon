import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toTex } from '../domain/calc/formulas';
import { SKILLS, getSkill, listSkills, runSkill } from './index';

// Her beceri için bir örnek girdi ve bir geçersiz girdi. Yeni beceri eklenince
// buraya da satır eklenmezse "her becerinin örneği var" testi uyarır.
const SAMPLES: Record<string, { input: unknown; invalid: unknown }> = {
  fabricPricing: {
    input: {
      yarns: [
        { price: 100, currency: 'TRY', ratioPercent: 95, wastagePercent: 3 },
        { price: 320, currency: 'TRY', ratioPercent: 5 },
      ],
      knittingFeePerKg: 20,
      overheadPercent: 10,
      dyeingFeePerKg: 30,
      dyeingLossPercent: 8,
      profitPercent: 20,
      weightGsm: 200,
      widthCm: 180,
      usdTry: 40,
    },
    // Negatif fiyat
    invalid: { yarns: [{ price: -5, currency: 'TRY', ratioPercent: 100 }] },
  },
  knitProduction: {
    input: {
      rows: [
        { lengthPer50NeedlesCm: 15, count: 30, system: 'ne', feeders: 90 },
        { lengthPer50NeedlesCm: 6, count: 40, system: 'denye', feeders: 6 },
      ],
      needles: 1920,
      rpm: 25,
      efficiencyPercent: 85,
      hoursPerDay: 24,
      knittingFeePerKg: 12,
    },
    // İğne sayısı eksik
    invalid: { rows: [{ lengthPer50NeedlesCm: 15, count: 30, system: 'ne', feeders: 90 }], rpm: 25 },
  },
  yarnCount: {
    input: { value: 30, system: 'ne', ply: 1 },
    // Bilinmeyen sistem
    invalid: { value: 30, system: 'numara' },
  },
  yarnCountFromSample: {
    input: { lengthCm: 100, weightGrams: 0.2 },
    // Ağırlık eksik
    invalid: { lengthCm: 100 },
  },
  yarnUsageRatio: {
    input: {
      rows: [
        { lengthPer50NeedlesCm: 15, count: 30, system: 'ne', feeders: 90 },
        { lengthPer50NeedlesCm: 6, count: 40, system: 'denye', feeders: 6 },
      ],
    },
    // Boş satır listesi
    invalid: { rows: [] },
  },
  fabricGsmSample: {
    input: { widthMm: 100, lengthMm: 100, weightGrams: 2.75 },
    // Negatif ağırlık
    invalid: { widthMm: 100, lengthMm: 100, weightGrams: -1 },
  },
  fabricGsmKnit: {
    input: { coursesPerCm: 16, walesPerCm: 14, lengthPer50NeedlesCm: 15, yarnCount: 30, yarnSystem: 'ne', doubleJersey: false },
    // İlmek boyu da 50 iğne uzunluğu da yok
    invalid: { coursesPerCm: 16, walesPerCm: 14, yarnTex: 20 },
  },
  garmentCost: {
    input: {
      fabricConsumptionMeters: 1.2,
      fabricPricePerMeter: 150,
      wastagePercent: 10,
      cuttingCost: 15,
      sewingCost: 60,
      finishingCost: 25,
      accessoryCost: 15,
      packagingCost: 8,
      shippingCost: 10,
      currency: 'TRY',
    },
    // Negatif işçilik
    invalid: { fabricConsumptionMeters: 1.2, fabricPricePerMeter: 150, sewingCost: -10 },
  },
  yarnUsage: {
    input: { fabricLengthMeters: 1000, weightGsm: 180, widthCm: 180, wastagePercent: 5 },
    // Gramaj eksik
    invalid: { fabricLengthMeters: 1000, widthCm: 180 },
  },
  yarnRequirement: {
    input: { finishedKg: 1000, dyeingLossPercent: 5, knittingLossPercent: 3 },
    // Mamul miktarı hiç verilmemiş
    invalid: { dyeingLossPercent: 5, knittingLossPercent: 3 },
  },
  quoteDraft: {
    input: { quantity: 500, unit: 'm', priceValue: 8, priceCurrency: 'USD', priceUnit: 'kg', weightGsm: 200, widthCm: 160, moq: 300, moqUnit: 'm', leadTimeDays: 12 },
    // Miktar yok
    invalid: { unit: 'm' },
  },
  fabricLengthWeight: {
    input: { weightGsm: 180, widthCm: 180, kg: 100 },
    // En sıfır olamaz
    invalid: { weightGsm: 180, widthCm: 0 },
  },
};

test('her becerinin örnek girdisi var', () => {
  for (const skill of SKILLS) {
    assert.ok(SAMPLES[skill.name], `örnek girdi tanımlanmamış beceri: ${skill.name}`);
  }
  for (const name of Object.keys(SAMPLES)) {
    assert.ok(getSkill(name), `kayıtta olmayan beceri örneği: ${name}`);
  }
});

for (const skill of SKILLS) {
  test(`${skill.name}: örnek girdiyle çalışır ve özet üretir`, () => {
    const sample = SAMPLES[skill.name];
    const result = runSkill(skill, sample.input);
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) return;

    // Çıktıdaki bütün sayılar sonlu olmalı (null izinli: "hesaplanmadı" demek).
    for (const [key, value] of numbersIn(result.output)) {
      assert.ok(Number.isFinite(value), `${skill.name}.${key} sonlu değil: ${value}`);
    }

    const summary = result.summary;
    assert.ok(summary.length > 10, `özet çok kısa: ${summary}`);
    assert.ok(/\d/.test(summary), `özette sayı yok: ${summary}`);
    assert.ok(!summary.includes('NaN'), `özette NaN: ${summary}`);
    assert.ok(!summary.includes('Infinity'), `özette Infinity: ${summary}`);
    assert.ok(!summary.includes('∞'), `özette ∞: ${summary}`);
    // fmt() hesaplanamayan sayıyı "-" yazar; özette tire olmamalı.
    assert.ok(!summary.includes('-'), `özette tire (hesaplanamayan sayı): ${summary}`);
    assert.ok(summary.trim().endsWith('.'), `özet nokta ile bitmeli: ${summary}`);
  });

  test(`${skill.name}: geçersiz girdi invalid_input döner`, () => {
    const result = runSkill(skill, SAMPLES[skill.name].invalid);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, 'invalid_input');
    assert.ok(result.details.length > 0, 'hata ayrıntısı boş');
  });

  test(`${skill.name}: boş girdi ya şemaya uyar ya invalid_input (hata fırlatmaz)`, () => {
    const result = runSkill(skill, {});
    if (!result.ok) assert.equal(result.error, 'invalid_input');
  });
}

test('listSkills: 12 beceri, adlar benzersiz, JSON şema nesnesi', () => {
  const list = listSkills();
  assert.equal(list.length, 12);
  assert.equal(new Set(list.map((s) => s.name)).size, 12, 'beceri adları benzersiz olmalı');
  for (const item of list) {
    assert.ok(item.title.length > 0, `${item.name}: başlık boş`);
    assert.ok(item.description.length > 40, `${item.name}: açıklama çok kısa`);
    assert.ok(item.formula.length > 10, `${item.name}: formül özeti çok kısa`);
    const schema = item.inputSchema as { type?: string; properties?: Record<string, unknown> };
    assert.equal(schema.type, 'object', `${item.name}: JSON şema nesnesi değil`);
    assert.ok(schema.properties && Object.keys(schema.properties).length > 0, `${item.name}: şemada alan yok`);
  }
});

test('listSkills sırası kayıt sırasıyla aynı', () => {
  assert.deepEqual(
    listSkills().map((s) => s.name),
    [
      'fabricPricing',
      'knitProduction',
      'yarnCount',
      'yarnCountFromSample',
      'yarnUsageRatio',
      'fabricGsmSample',
      'fabricGsmKnit',
      'garmentCost',
      'yarnUsage',
      'fabricLengthWeight',
      'yarnRequirement',
      'quoteDraft',
    ]
  );
});

test('getSkill: bilinmeyen ad null', () => {
  assert.equal(getSkill('yok'), null);
  assert.equal(getSkill(''), null);
  assert.equal(getSkill('fabricPricing')?.name, 'fabricPricing');
});

// ---------------------------------------------------------------------------
// Birkaç sonucun sayısal doğruluğu (formül testleri ayrıca formulas.test.ts'te)
// ---------------------------------------------------------------------------

test('yarnCount: 30/1 Ne çıktısı ve özeti', () => {
  const result = runSkill(getSkill('yarnCount')!, { value: 30, system: 'ne' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const out = result.output as { tex: number; nm: number; denye: number };
  assert.ok(Math.abs(out.tex - 19.6889) < 0.001, `tex = ${out.tex}`);
  assert.ok(result.summary.includes('19,7 tex'), result.summary);
  assert.ok(result.summary.includes('50,8 Nm'), result.summary);
  assert.ok(result.summary.includes('177 denye'), result.summary);
});

test('fabricLengthWeight: 180 gr/m², 180 cm, 100 kg ≈ 308,6 m', () => {
  const result = runSkill(getSkill('fabricLengthWeight')!, { weightGsm: 180, widthCm: 180, kg: 100 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const out = result.output as { meters: number | null; kg: number | null; kgPerMeter: number };
  assert.ok(Math.abs((out.meters as number) - 308.64) < 0.01, `${out.meters}`);
  assert.equal(out.kg, null, 'metre verilmediyse kg hesaplanmaz');
  assert.ok(Math.abs(out.kgPerMeter - 0.324) < 1e-9);
});

test('fabricLengthWeight: metre verilirse kg hesaplanır, ikisi de yoksa yalnızca oran', () => {
  const withMeters = runSkill(getSkill('fabricLengthWeight')!, { weightGsm: 180, widthCm: 180, meters: 1000 });
  assert.equal(withMeters.ok, true);
  if (withMeters.ok) {
    const out = withMeters.output as { kg: number | null; meters: number | null };
    assert.ok(Math.abs((out.kg as number) - 324) < 1e-9, `${out.kg}`);
    assert.equal(out.meters, null);
  }
  const bare = runSkill(getSkill('fabricLengthWeight')!, { weightGsm: 180, widthCm: 180 });
  assert.equal(bare.ok, true);
  if (bare.ok) {
    const out = bare.output as { kg: number | null; meters: number | null; metersPerKg: number };
    assert.equal(out.kg, null);
    assert.equal(out.meters, null);
    assert.ok(Math.abs(out.metersPerKg - 3.0864) < 0.001);
  }
});

test('fabricGsmKnit: iki yol da (ilmek boyu / 50 iğne, tex / numara) aynı sonucu verir', () => {
  const skill = getSkill('fabricGsmKnit')!;
  const a = runSkill(skill, { coursesPerCm: 16, walesPerCm: 14, lengthPer50NeedlesCm: 15, yarnCount: 30, yarnSystem: 'ne' });
  const b = runSkill(skill, { coursesPerCm: 16, walesPerCm: 14, loopLengthMm: 3, yarnTex: toTex(30, 'ne') });
  assert.equal(a.ok && b.ok, true);
  if (!a.ok || !b.ok) return;
  const ga = (a.output as { gsm: number }).gsm;
  const gb = (b.output as { gsm: number }).gsm;
  assert.ok(Math.abs(ga - gb) < 1e-6, `${ga} != ${gb}`);
  assert.ok(Math.abs(ga - 132.31) < 0.01, `gsm = ${ga}`);
});

test('fabricGsmSample: 10x10 cm 2,75 g → 275 gr/m²', () => {
  const result = runSkill(getSkill('fabricGsmSample')!, { widthMm: 100, lengthMm: 100, weightGrams: 2.75 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal((result.output as { gsm: number }).gsm, 275);
  assert.ok(result.summary.includes('275 gr/m²'), result.summary);
});

// Çıktıdaki sayı alanlarını (iç içe nesne ve dizilerle) tek tek gezer.
function numbersIn(value: unknown, prefix = ''): [string, number][] {
  if (typeof value === 'number') return [[prefix || 'value', value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => numbersIn(v, `${prefix}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => numbersIn(v, prefix ? `${prefix}.${k}` : k));
  }
  return [];
}

// --- Fırat'ın 2026-09-16 cevapları ------------------------------------------

test('yarnRequirement: 1.000 kg mamul, boya %5, örme %3 → 1.085,19 kg iplik', () => {
  const r = runSkill(getSkill('yarnRequirement')!, { finishedKg: 1000, dyeingLossPercent: 5, knittingLossPercent: 3 });
  assert.ok(r.ok);
  const out = r.output as { greigeKg: number; yarnKg: number };
  assert.ok(Math.abs(out.greigeKg - 1052.63) < 0.01);
  assert.ok(Math.abs(out.yarnKg - 1085.19) < 0.01);
  assert.ok(r.summary.includes('ham kumaş') && r.summary.includes('iplik'));
  // Metre + gramaj + en ile de çalışır
  const m = runSkill(getSkill('yarnRequirement')!, { finishedMeters: 1000, weightGsm: 200, widthCm: 160, dyeingLossPercent: 0, knittingLossPercent: 0 });
  assert.ok(m.ok && Math.abs((m.output as { yarnKg: number }).yarnKg - 320) < 0.01);
});

test('fabricLengthWeight: tek yüz tüp eni 80 cm → hesapta 160; 200 gsm 100 m = 32 kg', () => {
  const r = runSkill(getSkill('fabricLengthWeight')!, { weightGsm: 200, widthCm: 80, widthMeaning: 'tup_tek_yuz', meters: 100 });
  assert.ok(r.ok);
  const out = r.output as { effectiveWidthCm: number; kg: number };
  assert.equal(out.effectiveWidthCm, 160);
  assert.ok(Math.abs(out.kg - 32) < 0.01);
  assert.ok(r.summary.includes('tüp'));
});

test('garmentCost: kalemler ayrı, Fırat sweatshirt örneği 315 TRY', () => {
  const r = runSkill(getSkill('garmentCost')!, {
    fabricConsumptionMeters: 1,
    fabricPricePerMeter: 180,
    cuttingCost: 15,
    sewingCost: 65,
    finishingCost: 25,
    accessoryCost: 12,
    packagingCost: 8,
    shippingCost: 10,
    quantity: 100,
  });
  assert.ok(r.ok);
  const out = r.output as { totalCost: number; orderTotal: number; items: { key: string; amount: number }[] };
  assert.equal(out.totalCost, 315);
  assert.equal(out.orderTotal, 31500);
  assert.equal(out.items.find((i) => i.key === 'finishingCost')?.amount, 25);
  assert.ok(r.summary.includes('boş kalemler: genel gider'));
});

test('knitProduction: makine adedi çıktıyı çarpar, satır adı özette', () => {
  const base = { rows: [{ lengthPer50NeedlesCm: 15, count: 30, system: 'ne', feeders: 90, label: 'ana iplik' }], needles: 1920, rpm: 25, efficiencyPercent: 85, hoursPerDay: 20 };
  const one = runSkill(getSkill('knitProduction')!, base);
  const two = runSkill(getSkill('knitProduction')!, { ...base, machineCount: 2 });
  assert.ok(one.ok && two.ok);
  const a = one.output as { kgPerDay: number };
  const b = two.output as { kgPerDay: number; perMachineKgPerDay: number };
  assert.ok(Math.abs(b.kgPerDay - 2 * a.kgPerDay) < 1e-9);
  assert.ok(Math.abs(b.perMachineKgPerDay - a.kgPerDay) < 1e-9);
  assert.ok(two.summary.includes('ana iplik') && two.summary.includes('2 makine'));
  // Randıman ve saat artık varsayılan değil: eksikse geçersiz girdi
  const missing = runSkill(getSkill('knitProduction')!, { rows: base.rows, needles: 1920, rpm: 25 });
  assert.equal(missing.ok, false);
});

test('fabricGsmKnit: en değişiminden mamul gramaj tahmini ve sapma', () => {
  const r = runSkill(getSkill('fabricGsmKnit')!, {
    coursesPerCm: 16,
    walesPerCm: 14,
    loopLengthMm: 3,
    yarnTex: 26.46,
    greigeWidthCm: 180,
    finishedWidthCm: 160,
    measuredFinishedGsm: 200,
  });
  assert.ok(r.ok);
  const out = r.output as { gsm: number; estimatedFinishedGsm: number; estimateBasis: string; deviationPercent: number };
  assert.ok(Math.abs(out.estimatedFinishedGsm - (out.gsm * 180) / 160) < 1e-9);
  assert.equal(out.estimateBasis, 'width_change');
  assert.ok(Number.isFinite(out.deviationPercent));
  assert.ok(r.summary.includes('mamul gramaj') && r.summary.includes('sapma'));
  const pct = runSkill(getSkill('fabricGsmKnit')!, { coursesPerCm: 16, walesPerCm: 14, loopLengthMm: 3, yarnTex: 26.46, finishChangePercent: 12.5 });
  assert.equal((pct.output as { estimateBasis: string }).estimateBasis, 'change_percent');
});

test('quoteDraft: kg fiyatı metreye çevrilir, MOQ altı işaretlenir, fiyat yoksa uydurulmaz', () => {
  const r = runSkill(getSkill('quoteDraft')!, { quantity: 200, unit: 'm', priceValue: 8, priceCurrency: 'USD', priceUnit: 'kg', weightGsm: 200, widthCm: 160, moq: 300, moqUnit: 'm', leadTimeDays: 12 });
  assert.ok(r.ok);
  const out = r.output as { unitPrice: number; total: number; converted: boolean; belowMoq: boolean; missing: string[] };
  // 200 gsm × 160 cm → 3,125 m/kg; 8 USD/kg → 2,56 USD/m
  assert.ok(Math.abs(out.unitPrice - 2.56) < 1e-9);
  assert.ok(Math.abs(out.total - 512) < 1e-9);
  assert.equal(out.converted, true);
  assert.equal(out.belowMoq, true);
  assert.deepEqual(out.missing, []);

  const noPrice = runSkill(getSkill('quoteDraft')!, { quantity: 500, unit: 'kg' });
  assert.ok(noPrice.ok);
  const o2 = noPrice.output as { unitPrice: number | null; total: number | null; missing: string[] };
  assert.equal(o2.unitPrice, null);
  assert.equal(o2.total, null);
  assert.ok(o2.missing.includes('fiyat') && o2.missing.includes('termin'));
  assert.ok(noPrice.summary.includes('fiyat hesaplanamadı'));
});
