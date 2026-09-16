import type { ProductType } from '../../catalog';
import { typeOfSubtype } from './knits';
import type { CompositionItem } from './composition';

// Makullük aralıkları. Kayıt ENGELLENMEZ; yalnızca "şüpheli" işareti üretilir
// (yol haritası §3.2: belirsizlik kullanıcıya gösterilir, onaylatılır).
//
// Aralıklar Fırat'ın verdiği sektör bilgisine göre (2026-09-16):
// - Kumaş üretimleri genelde 60-400 gr/m²; tül/raschel kaliteleri 25-200 gr/m².
// - En genelde 90-200 cm; çoğunluk 145-165 cm (TYPICAL_WIDTH).
// Alt çeşit daraltmaları hâlâ başlangıç değeri; gerçek etiketlerden öğrenildikçe
// bu tabloya işlenir. Değer değişikliği koda dokunmaz, yalnızca tablolara.

export interface Range {
  min: number;
  max: number;
}

// Çeşit düzeyi varsayılanlar
const TYPE_GSM: Record<ProductType, Range> = {
  orme: { min: 60, max: 400 },
  raschel: { min: 25, max: 200 },
  dokuma: { min: 60, max: 400 },
  dantel: { min: 25, max: 200 },
  triko: { min: 150, max: 800 },
  diger: { min: 20, max: 1200 },
};

const TYPE_WIDTH: Record<ProductType, Range> = {
  orme: { min: 90, max: 200 },
  raschel: { min: 90, max: 200 },
  dokuma: { min: 90, max: 200 },
  dantel: { min: 10, max: 200 }, // dantel şerit olarak dar da olur
  triko: { min: 60, max: 200 },
  diger: { min: 10, max: 400 },
};

// Enlerin çoğunluğu bu banttadır; çıkarımda (Adım 3) bandın dışı güveni düşürür,
// aralığın dışı ise şüpheli işareti üretir.
export const TYPICAL_WIDTH: Range = { min: 145, max: 165 };

// Alt çeşit düzeyi daraltmalar (yoksa çeşit varsayılanı geçerli)
const SUBTYPE_GSM: Record<string, Range> = {
  suprem: { min: 100, max: 220 },
  interlok: { min: 160, max: 320 },
  ribana: { min: 160, max: 320 },
  kaskorse: { min: 180, max: 340 },
  iki_iplik: { min: 200, max: 320 },
  uc_iplik: { min: 240, max: 400 },
  pike: { min: 160, max: 260 },
  scuba: { min: 200, max: 400 },
  polar: { min: 180, max: 380 },
  elastanli_tul: { min: 40, max: 200 },
  elastansiz_tul: { min: 25, max: 120 },
  astarlik: { min: 40, max: 120 },
  poplin: { min: 90, max: 160 },
  gabardin: { min: 180, max: 320 },
  denim: { min: 200, max: 400 },
  sifon: { min: 40, max: 110 },
};

// Lif başına en fazla oran; üstü şüpheli (elastanlı kumaşta elastan %35'i geçmez).
const FIBER_MAX_PERCENT: Record<string, number> = {
  elastan: 35,
  metalik: 30,
};

export type PlausibilityFlag =
  | 'gsm_low'
  | 'gsm_high'
  | 'width_low'
  | 'width_high'
  | 'composition_total_not_100'
  | 'fiber_percent_high'
  | 'unknown_subtype';

export interface PlausibilityReport {
  ok: boolean;
  flags: PlausibilityFlag[];
  // Ekranda gösterilecek kısa açıklamalar (Türkçe)
  notes: string[];
}

export function gsmRange(type: ProductType, subtype: string | null | undefined): Range {
  return (subtype && SUBTYPE_GSM[subtype]) || TYPE_GSM[type];
}

export function widthRange(type: ProductType): Range {
  return TYPE_WIDTH[type];
}

export function checkPassport(input: {
  type: ProductType;
  subtype?: string | null;
  weightGsm?: number | null;
  widthCm?: number | null;
  composition?: readonly CompositionItem[];
}): PlausibilityReport {
  const flags: PlausibilityFlag[] = [];
  const notes: string[] = [];

  if (input.subtype && typeOfSubtype(input.subtype) && typeOfSubtype(input.subtype) !== input.type) {
    flags.push('unknown_subtype');
    notes.push('Alt çeşit seçilen çeşide ait değil.');
  }

  if (input.weightGsm != null) {
    const r = gsmRange(input.type, input.subtype);
    if (input.weightGsm < r.min) {
      flags.push('gsm_low');
      notes.push(`Gramaj bu çeşit için düşük görünüyor (beklenen ${r.min}-${r.max} gr/m²).`);
    } else if (input.weightGsm > r.max) {
      flags.push('gsm_high');
      notes.push(`Gramaj bu çeşit için yüksek görünüyor (beklenen ${r.min}-${r.max} gr/m²).`);
    }
  }

  if (input.widthCm != null) {
    const r = widthRange(input.type);
    if (input.widthCm < r.min) {
      flags.push('width_low');
      notes.push(`En bu çeşit için dar görünüyor (beklenen ${r.min}-${r.max} cm).`);
    } else if (input.widthCm > r.max) {
      flags.push('width_high');
      notes.push(`En bu çeşit için geniş görünüyor (beklenen ${r.min}-${r.max} cm).`);
    }
  }

  if (input.composition && input.composition.length > 0) {
    const total = Math.round(input.composition.reduce((s, i) => s + i.percent, 0) * 100) / 100;
    if (total !== 100) {
      flags.push('composition_total_not_100');
      notes.push(`Lif oranlarının toplamı %${total}; %100 olmalı.`);
    }
    for (const item of input.composition) {
      const max = FIBER_MAX_PERCENT[item.fiber];
      if (max !== undefined && item.percent > max) {
        flags.push('fiber_percent_high');
        notes.push(`${item.fiber} oranı %${item.percent} alışılmadık yüksek (genelde en fazla %${max}).`);
      }
    }
  }

  return { ok: flags.length === 0, flags, notes };
}
