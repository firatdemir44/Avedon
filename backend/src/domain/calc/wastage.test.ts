import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveWidthCm, gsmAfterWidthChange, gsmWithChangePercent, requirementChain } from './wastage';

const close = (a: number, b: number, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('fire zinciri: Fırat örneği 1.000 kg mamul, boya %5, örme %3', () => {
  const r = requirementChain({ finishedKg: 1000, dyeingLossPercent: 5, knittingLossPercent: 3 });
  close(r.greigeKg, 1052.63);
  close(r.yarnKg, 1085.19);
  assert.equal(r.garmentFabricKg, null);
});

test('fire zinciri: kesim firesiyle dikilmiş üründen başlar', () => {
  const r = requirementChain({ garmentFabricKg: 900, cuttingLossPercent: 10, dyeingLossPercent: 5, knittingLossPercent: 3 });
  close(r.finishedKg, 1000);
  close(r.yarnKg, 1085.19);
});

test('fire zinciri: sıfır fire ve %100 koruması', () => {
  const zero = requirementChain({ finishedKg: 500, dyeingLossPercent: 0, knittingLossPercent: 0 });
  assert.equal(zero.yarnKg, 500);
  const crazy = requirementChain({ finishedKg: 500, dyeingLossPercent: 150, knittingLossPercent: 0 });
  assert.ok(Number.isFinite(crazy.greigeKg) && crazy.greigeKg > 500);
});

test('tüp en: tek yüz tüp eni iki katına çıkar, açık en aynen kalır', () => {
  assert.equal(effectiveWidthCm(80, 'tup_tek_yuz'), 160);
  assert.equal(effectiveWidthCm(160, 'acik'), 160);
});

test('en değişimiyle gramaj: Fırat örneği 320 g/m, 180 → 160 cm', () => {
  const greige = 320 / 1.8;
  close(greige, 177.78);
  close(gsmAfterWidthChange(greige, 180, 160), 200);
  close(gsmWithChangePercent(180, 12.5), 202.5);
});
