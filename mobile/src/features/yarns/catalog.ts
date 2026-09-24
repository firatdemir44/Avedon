// İplik dizini (Faz 2, Adım 6) — istemci tarafı etiketleri ve alan kuralları.
//
// Etiketlerin ASIL kaynağı sunucudur (`GET /api/yarns/options`); buradaki
// listeler yalnızca ilk açılış ve çevrimdışı için YEDEK. Anahtarlar
// backend/src/yarns.ts ile birebir aynı olmalı.

import { useEffect, useState } from 'react';
import { fetchYarnOptions, type YarnOption, type YarnOptions } from '../../api/client';
import { fromTex } from '../calculators/formulas';
import { locale, tr } from '../../i18n';
import { trLabels } from '../trLabels';

export const YARN_FAMILIES: readonly YarnOption[] = trLabels([
  { key: 'pamuk', label: 'Pamuk' },
  { key: 'viskon', label: 'Viskon / Rejenere (modal, liyosel)' },
  { key: 'polyester', label: 'Polyester' },
  { key: 'naylon', label: 'Naylon (poliamid)' },
  { key: 'akrilik', label: 'Akrilik' },
  { key: 'yun', label: 'Yün' },
  { key: 'keten', label: 'Keten' },
  { key: 'karisim', label: 'Özel karışım' },
  { key: 'fantezi', label: 'Fantezi (şönil, buklet, lüreks...)' },
  { key: 'elastan_gipe', label: 'Elastan / Gipe' },
  { key: 'diger', label: 'Diğer' },
]);

export const YARN_COUNT_UNITS: readonly YarnOption[] = [
  { key: 'ne', label: 'Ne' },
  { key: 'nm', label: 'Nm' },
  { key: 'denye', label: 'Denye' },
  { key: 'dtex', label: 'dtex' },
  { key: 'tex', label: 'tex' },
];

export const YARN_SPINNINGS: readonly YarnOption[] = trLabels([
  { key: 'ring', label: 'Ring' },
  { key: 'kompakt', label: 'Kompakt' },
  { key: 'open_end', label: 'Open End' },
  { key: 'vortex', label: 'Vortex' },
  { key: 'siro', label: 'Siro' },
]);

export const YARN_COMBINGS: readonly YarnOption[] = trLabels([
  { key: 'penye', label: 'Penye' },
  { key: 'karde', label: 'Karde' },
]);

export const YARN_FILAMENT_TYPES: readonly YarnOption[] = trLabels([
  { key: 'dty', label: 'DTY (tekstüre)' },
  { key: 'fdy', label: 'FDY' },
  { key: 'poy', label: 'POY' },
  { key: 'aty', label: 'ATY (hava tekstüre)' },
  { key: 'bcf', label: 'BCF' },
  { key: 'mono', label: 'Monofilament' },
]);

export const YARN_LUSTERS: readonly YarnOption[] = trLabels([
  { key: 'parlak', label: 'Parlak' },
  { key: 'yari_mat', label: 'Yarı mat' },
  { key: 'mat', label: 'Mat' },
]);

export const YARN_END_USES: readonly YarnOption[] = trLabels([
  { key: 'yuvarlak_orme', label: 'Yuvarlak örme' },
  { key: 'triko', label: 'Triko (düz örme)' },
  { key: 'dokuma_cozgu', label: 'Dokuma - çözgü' },
  { key: 'dokuma_atki', label: 'Dokuma - atkı' },
  { key: 'raschel', label: 'Raşel / çözgülü örme' },
  { key: 'corap', label: 'Çorap' },
  { key: 'dar_dokuma', label: 'Dar dokuma / etiket' },
  { key: 'dikis_nakis', label: 'Dikiş / nakış' },
  { key: 'hali', label: 'Halı' },
]);

export const YARN_COLOR_STATES: readonly YarnOption[] = trLabels([
  { key: 'ham', label: 'Ham' },
  { key: 'boyali', label: 'Boyalı (bobin boya)' },
  { key: 'melanj', label: 'Melanj' },
  { key: 'elyaf_boyali', label: 'Elyaf boyalı' },
  { key: 'dope_dyed', label: 'Dope dyed (çözelti boyalı)' },
]);

export const YARN_SELLER_ROLES: readonly YarnOption[] = trLabels([
  { key: 'uretici', label: 'Üreticiyiz' },
  { key: 'tuccar', label: 'Tüccarız (stoktan satış)' },
]);

export const FALLBACK_YARN_OPTIONS: YarnOptions = {
  families: YARN_FAMILIES,
  countUnits: YARN_COUNT_UNITS,
  spinnings: YARN_SPINNINGS,
  combings: YARN_COMBINGS,
  filamentTypes: YARN_FILAMENT_TYPES,
  lusters: YARN_LUSTERS,
  endUses: YARN_END_USES,
  colorStates: YARN_COLOR_STATES,
  sellerRoles: YARN_SELLER_ROLES,
};

// Uygulama ömrü boyunca tek çekim: seçenek listeleri değişmiyor.
let cachedOptions: YarnOptions | null = null;
let inFlight: Promise<YarnOptions> | null = null;

export function useYarnOptions(): YarnOptions {
  const [options, setOptions] = useState<YarnOptions>(cachedOptions ?? FALLBACK_YARN_OPTIONS);

  useEffect(() => {
    if (cachedOptions) return;
    let cancelled = false;
    inFlight =
      inFlight ??
      fetchYarnOptions().then((fetched) => {
        cachedOptions = fetched;
        return fetched;
      });
    inFlight
      .then((fetched) => {
        if (!cancelled) setOptions(fetched);
      })
      // Sunucuya ulaşılamazsa yedek liste kalır; ekran çalışmaya devam eder.
      .catch(() => {
        inFlight = null;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return options;
}

export function optionLabel(list: readonly YarnOption[], key: string) {
  if (!key) return '';
  return list.find((o) => o.key === key)?.label ?? key;
}

export function optionValues(list: readonly YarnOption[]) {
  return list.map((o) => ({ value: o.key, label: o.label }));
}

// --- Lif ailesine göre hangi alanlar anlamlı ---
// Fırat'ın kararı: ana alanlar lif ailesine göre ayrılır; fantezi ayrı,
// elastan/gipe fantezi DEĞİL ayrı alan.

const STAPLE_FAMILIES = new Set(['pamuk', 'viskon', 'yun', 'keten', 'akrilik', 'karisim']);
const FILAMENT_FAMILIES = new Set(['polyester', 'naylon']);
const FREEFORM_FAMILIES = new Set(['fantezi', 'elastan_gipe']);

export interface YarnFieldVisibility {
  /** Eğirme sistemi + penye/karde + büküm (kesikli elyaf iplikleri). */
  staple: boolean;
  /** Filament sayısı + filament tipi + parlaklık. */
  filament: boolean;
  /** "Çeşit / yapı" serbest metni öne çıkar (fantezi, elastan/gipe). */
  freeform: boolean;
}

export function yarnFields(family: string): YarnFieldVisibility {
  if (STAPLE_FAMILIES.has(family)) return { staple: true, filament: false, freeform: false };
  if (FILAMENT_FAMILIES.has(family)) return { staple: false, filament: true, freeform: false };
  if (FREEFORM_FAMILIES.has(family)) return { staple: true, filament: true, freeform: true };
  // 'diger' ve bilinmeyen aile: hiçbir alanı gizleme.
  return { staple: true, filament: true, freeform: false };
}

// Aileye göre "Çeşit / yapı" alanının yer tutucusu.
export function varietyPlaceholder(family: string) {
  if (family === 'fantezi') return tr('Örn. Şönil');
  if (family === 'elastan_gipe') return tr('Örn. Tek kat gipe 20 den elastan + 70/24 PA');
  return tr('Örn. Supima, mikro');
}

// Aileye göre karışım önerisi (kaydı zorunlu kılmaz, sadece hızlı doldurur).
const FAMILY_FIBER: Record<string, string> = {
  pamuk: 'pamuk',
  viskon: 'viskon',
  polyester: 'polyester',
  naylon: 'poliamid',
  akrilik: 'akrilik',
  yun: 'yun',
  keten: 'keten',
  elastan_gipe: 'elastan',
};

export function suggestedFiber(family: string): string | null {
  return FAMILY_FIBER[family] ?? null;
}

// --- Numara gösterimi ---

const trimNumber = (value: number, digits: number) =>
  value.toLocaleString(locale(), { maximumFractionDigits: digits });

// Kayıtlı dtex değerinden diğer sistemlerdeki karşılıkları: ürün sayfasındaki
// küçük "diğer birimlerde" satırı. Hesap tek yerde (formulas.ts fromTex).
export function otherCountLabels(countDtex: number, countUnit: string): string {
  if (!(countDtex > 0)) return '';
  const result = fromTex(countDtex / 10);
  const all: { key: string; text: string }[] = [
    { key: 'ne', text: `${trimNumber(result.ne, 1)} Ne` },
    { key: 'nm', text: `${trimNumber(result.nm, 1)} Nm` },
    { key: 'denye', text: `${trimNumber(result.denye, 0)} ${tr('denye')}` },
    { key: 'dtex', text: `${trimNumber(result.dtex, 0)} dtex` },
    { key: 'tex', text: `${trimNumber(result.tex, 1)} tex` },
  ];
  return all
    .filter((item) => item.key !== countUnit)
    .map((item) => item.text)
    .join(' · ');
}

// Liste satırlarında ipliğin tek satır özeti; sunucu `summary` üretiyor,
// gelmezse koddan sonra boş kalmasın diye kısa bir yedek.
export function yarnRowSummary(yarn: { summary?: string; countLabel?: string } | null | undefined, content: string) {
  return yarn?.summary || yarn?.countLabel || content;
}
