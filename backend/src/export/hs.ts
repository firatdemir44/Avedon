// Ürün → HS (GTİP'in ilk 6 hanesi) önerisi. Dünyayı Keşfet / İhracat Radarı'nın ilk adımı.
// Kural tabanlı ve deterministik: yapay zekâ kod UYDURMAZ. Kaynak: Armonize Sistem XI. bölüm
// (fasıl 50-63) ve bölüm notları — karışımda ağırlıkça baskın lif grubu (not 2), örme kumaşta
// ≥%5 elastan → 6004, çözgülü örme → 6005, atkılı örme → 6006, pamuklu dokumada 200 g/m² eşiği.
// Sonuç her zaman "tahmini" etiketlidir; kesin sınıflandırma bağlayıcı tarife bilgisi (BTB) ister.
// 6 hane ülkeler arası ortaktır (Comtrade/TÜİK eşleşmesi bunun üzerinden yapılır).

import { t, normalizeLang, type Lang } from '../i18n';
import { exportTexts } from '../i18n/en/export';

export type Confidence = 'yuksek' | 'orta' | 'dusuk';
export interface HsSuggestion {
  hs6: string;
  hs4: string;
  label: string;
  confidence: Confidence;
  reasons: string[];
  // Firmanın tercih edebileceği yakın kodlar (ör. boya durumu belirsizse baskılı karşılığı).
  alternatives: { hs6: string; label: string }[];
}

export interface HsInput {
  type: string; // orme | raschel | dokuma | dantel | triko | iplik | diger
  subtype?: string;
  weightGsm?: number | null;
  composition?: { fiber: string; percent: number }[];
  finishTags?: string[];
  yarn?: { family?: string; filamentType?: string; spinning?: string; combing?: string; countUnit?: string; count?: number } | null;
}

type FiberGroup = 'pamuk' | 'sentetik' | 'suni' | 'yun' | 'keten' | 'ipek' | 'diger';
const FIBER_GROUP: Record<string, FiberGroup> = {
  pamuk: 'pamuk',
  polyester: 'sentetik', poliamid: 'sentetik', akrilik: 'sentetik', polipropilen: 'sentetik', elastan: 'sentetik',
  viskon: 'suni', modal: 'suni', lyocell: 'suni', bambu: 'suni',
  yun: 'yun', kasmir: 'yun',
  keten: 'keten',
  ipek: 'ipek',
  metalik: 'diger', diger: 'diger',
};
const GROUP_LABEL: Record<FiberGroup, string> = { pamuk: 'pamuk', sentetik: 'sentetik lif', suni: 'suni (rejenere) lif', yun: 'yün', keten: 'keten', ipek: 'ipek', diger: 'diğer lif' };

type Dye = 'ham' | 'boyali' | 'renkli_iplik' | 'baskili';
function dyeOf(tags: string[] = []): { dye: Dye; known: boolean } {
  if (tags.includes('baskili')) return { dye: 'baskili', known: true };
  if (tags.includes('melanj')) return { dye: 'renkli_iplik', known: true };
  if (tags.includes('duz_boya')) return { dye: 'boyali', known: true };
  return { dye: 'boyali', known: false };
}
const DYE_LABEL: Record<Dye, string> = { ham: 'ham/ağartılmış', boyali: 'boyalı', renkli_iplik: 'farklı renkte ipliklerden', baskili: 'baskılı' };

function groupShares(comp: { fiber: string; percent: number }[]) {
  const shares: Record<FiberGroup, number> = { pamuk: 0, sentetik: 0, suni: 0, yun: 0, keten: 0, ipek: 0, diger: 0 };
  for (const c of comp) shares[FIBER_GROUP[c.fiber] ?? 'diger'] += c.percent;
  const sorted = (Object.entries(shares) as [FiberGroup, number][]).sort((a, b) => b[1] - a[1]);
  return { shares, top: sorted[0][1] > 0 ? sorted[0][0] : ('diger' as FiberGroup), topPct: sorted[0][1] };
}

const pct = (comp: { fiber: string; percent: number }[], fiber: string) => comp.filter((c) => c.fiber === fiber).reduce((s, c) => s + c.percent, 0);

// 4. basamak alt kırılımı (ham=1, boyalı=2, farklı renk=3, baskılı=4) — 6005/6006 yapısı.
const DYE_DIGIT: Record<Dye, number> = { ham: 1, boyali: 2, renkli_iplik: 3, baskili: 4 };

function knit(input: HsInput, comp: { fiber: string; percent: number }[], warp: boolean): HsSuggestion {
  const reasons: string[] = [];
  const elastane = pct(comp, 'elastan');
  const { dye, known } = dyeOf(input.finishTags);
  if (elastane >= 5) {
    reasons.push(`Örme kumaş ve elastan oranı %${elastane} (≥ %5) → 6004 (elastomerik iplikli örme kumaş)`);
    reasons.push('En 30 cm\'den geniş kabul edildi; elastomerik iplik lastik değil → 6004.10');
    return { hs6: '600410', hs4: '6004', label: 'Örme kumaş, ≥%5 elastomerik iplikli (elastan/likra), en > 30 cm', confidence: comp.length ? 'yuksek' : 'orta', reasons, alternatives: [] };
  }
  const { top, topPct } = groupShares(comp);
  reasons.push(`Elastan %${elastane} (< %5) → 6004 değil`);
  reasons.push(`${warp ? 'Çözgülü (raşel) örme → 6005' : 'Atkılı örme → 6006'}; baskın lif grubu: ${GROUP_LABEL[top]} (%${topPct})`);
  reasons.push(known ? `Terbiye: ${DYE_LABEL[dye]}` : 'Boya durumu belirtilmemiş → "boyalı" varsayıldı (ürüne "Düz boya" ya da "Baskılı" ekleyin)');
  const d = DYE_DIGIT[dye];
  let hs6: string;
  let base: string;
  if (warp) {
    if (top === 'pamuk') { hs6 = `60052${d}`; base = '6005.2'; }
    else if (top === 'sentetik') { hs6 = `60053${d + 5}`; base = '6005.3'; } // 6005.36-39
    else if (top === 'suni') { hs6 = `60054${d}`; base = '6005.4'; }
    else { hs6 = '600590'; base = '6005.90'; }
  } else {
    if (top === 'pamuk') { hs6 = `60062${d}`; base = '6006.2'; }
    else if (top === 'sentetik') { hs6 = `60063${d}`; base = '6006.3'; }
    else if (top === 'suni') { hs6 = `60064${d}`; base = '6006.4'; }
    else if (top === 'yun') { hs6 = '600610'; base = '6006.10'; }
    else { hs6 = '600690'; base = '6006.90'; }
  }
  void base;
  const kind = warp ? 'Çözgülü (raşel) örme kumaş' : 'Atkılı örme kumaş';
  const alternatives = known || hs6.endsWith('90') || hs6.endsWith('10')
    ? []
    : [{ hs6: hs6.slice(0, 5) + String(warp && top === 'sentetik' ? 9 : 4), label: `${kind}, ${GROUP_LABEL[top]}, baskılı` }];
  return { hs6, hs4: hs6.slice(0, 4), label: `${kind}, ${GROUP_LABEL[top]}, ${DYE_LABEL[dye]}`, confidence: comp.length && known ? 'yuksek' : comp.length ? 'orta' : 'dusuk', reasons, alternatives };
}

function woven(input: HsInput, comp: { fiber: string; percent: number }[]): HsSuggestion {
  const reasons: string[] = [];
  const { top, topPct, shares } = groupShares(comp);
  const { dye, known } = dyeOf(input.finishTags);
  const gsm = input.weightGsm ?? 0;
  const printed = dye === 'baskili';
  reasons.push(`Dokuma; baskın lif grubu: ${GROUP_LABEL[top]} (%${topPct})`);
  if (!known) reasons.push('Boya durumu belirtilmemiş → "boyalı" varsayıldı');
  if (input.subtype === 'kadife') {
    reasons.push('Kadife (hav) dokuma → 5801');
    return { hs6: top === 'pamuk' ? '580122' : '580136', hs4: '5801', label: `Havlı dokuma (kadife), ${GROUP_LABEL[top]}`, confidence: 'orta', reasons, alternatives: [] };
  }
  if (top === 'pamuk' && shares.pamuk >= 85) {
    if (input.subtype === 'denim') {
      reasons.push('Denim, pamuk ≥ %85, 200 g/m² üstü kabul → 5209.42');
      return { hs6: '520942', hs4: '5209', label: 'Denim, pamuk ≥ %85', confidence: 'yuksek', reasons, alternatives: [] };
    }
    const heavy = gsm > 200;
    reasons.push(`Pamuk ≥ %85; gramaj ${gsm || 'belirtilmemiş'} g/m² → ${heavy ? '5209 (> 200)' : '5208 (≤ 200)'}`);
    const twill = input.subtype === 'gabardin';
    const hs6 = heavy ? (printed ? '520951' : twill ? '520932' : '520931') : printed ? '520852' : twill ? '520833' : '520832';
    return { hs6, hs4: hs6.slice(0, 4), label: `Pamuklu dokuma, ${heavy ? '> 200' : '≤ 200'} g/m², ${printed ? 'baskılı' : 'boyalı'}${twill ? ', dimi' : ''}`, confidence: gsm && known ? 'yuksek' : 'orta', reasons, alternatives: [] };
  }
  if (top === 'pamuk') {
    reasons.push('Pamuk baskın ama < %85 (sentetikle karışık) → 5210/5211');
    const hs6 = gsm > 200 ? (printed ? '521151' : '521132') : printed ? '521051' : '521032';
    return { hs6, hs4: hs6.slice(0, 4), label: 'Pamuklu karışım dokuma (< %85 pamuk)', confidence: 'orta', reasons, alternatives: [] };
  }
  if (top === 'sentetik') {
    const pure = shares.sentetik >= 85;
    reasons.push(pure ? 'Sentetik ≥ %85 → 5407 (sentetik filament dokuma) varsayıldı' : 'Sentetik baskın, < %85 → 5407.7-8 karışım');
    reasons.push('Filament mi kesikli lif mi belirtilmediği için filament (5407) varsayıldı; kesikli ise 5512-5515');
    const hs6 = pure ? (printed ? '540754' : '540752') : shares.pamuk > 0 ? (printed ? '540784' : '540782') : printed ? '540794' : '540792';
    return { hs6, hs4: '5407', label: `Sentetik filament dokuma${pure ? '' : ' (karışım)'}, ${printed ? 'baskılı' : 'boyalı'}`, confidence: 'orta', reasons, alternatives: [{ hs6: pure ? '551219' : '551321', label: 'Sentetik kesikli lif dokuma (5512/5513)' }] };
  }
  if (top === 'suni') {
    reasons.push('Suni (viskon vb.) baskın → 5408 (filament) ya da 5516 (kesikli) — 5516 varsayıldı');
    return { hs6: printed ? '551614' : '551612', hs4: '5516', label: `Suni lif dokuma, ${printed ? 'baskılı' : 'boyalı'}`, confidence: 'orta', reasons, alternatives: [{ hs6: '540822', label: 'Suni filament dokuma (5408)' }] };
  }
  if (top === 'yun') {
    reasons.push('Yün baskın → 5112 (taranmış yün dokuma) varsayıldı');
    return { hs6: '511219', hs4: '5112', label: 'Taranmış yün dokuma', confidence: 'dusuk', reasons, alternatives: [{ hs6: '511119', label: 'Kardelenmiş yün dokuma' }] };
  }
  if (top === 'keten') {
    reasons.push('Keten baskın → 5309');
    return { hs6: shares.keten >= 85 ? '530919' : '530929', hs4: '5309', label: 'Keten dokuma', confidence: 'orta', reasons, alternatives: [] };
  }
  return { hs6: '540792', hs4: '5407', label: 'Dokuma kumaş (lif bilgisi eksik)', confidence: 'dusuk', reasons: [...reasons, 'Bileşim eksik; kumaş pasaportuna lif oranlarını ekleyin'], alternatives: [] };
}

function yarn(input: HsInput): HsSuggestion {
  const y = input.yarn ?? {};
  const reasons: string[] = [];
  const filament = !!y.filamentType;
  const fam = y.family ?? '';
  reasons.push(`İplik; lif ailesi: ${fam || 'belirtilmemiş'}, ${filament ? `filament (${y.filamentType})` : 'kesikli lif (eğirme)'}`);
  if (fam === 'polyester') {
    if (filament) {
      const hs6 = y.filamentType === 'dty' || y.filamentType === 'aty' ? '540233' : y.filamentType === 'poy' ? '540246' : '540247';
      return { hs6, hs4: '5402', label: `Polyester filament iplik (${y.filamentType?.toUpperCase()})`, confidence: 'yuksek', reasons: [...reasons, 'Perakende satışa hazır değil kabul edildi'], alternatives: [] };
    }
    return { hs6: '550921', hs4: '5509', label: 'Polyester kesikli lif ipliği (tek kat, ≥ %85)', confidence: 'orta', reasons, alternatives: [{ hs6: '550953', label: 'Polyester/pamuk karışım iplik' }] };
  }
  if (fam === 'naylon') {
    return filament
      ? { hs6: y.filamentType === 'dty' || y.filamentType === 'aty' ? '540231' : '540245', hs4: '5402', label: 'Naylon (poliamid) filament iplik', confidence: 'yuksek', reasons, alternatives: [] }
      : { hs6: '550911', hs4: '5509', label: 'Poliamid kesikli lif ipliği', confidence: 'orta', reasons, alternatives: [] };
  }
  if (fam === 'pamuk') {
    const combed = y.combing === 'penye';
    reasons.push(combed ? 'Penye (taranmış) → 5205.2x' : 'Karde → 5205.1x');
    return { hs6: combed ? '520523' : '520512', hs4: '5205', label: `Pamuk ipliği (≥ %85, ${combed ? 'penye' : 'karde'}, tek kat)`, confidence: 'orta', reasons: [...reasons, 'Numara aralığı alt kırılımı yaklaşık seçildi'], alternatives: [] };
  }
  if (fam === 'viskon') return { hs6: filament ? '540331' : '551011', hs4: filament ? '5403' : '5510', label: 'Viskon / rejenere iplik', confidence: 'orta', reasons, alternatives: [] };
  if (fam === 'akrilik') return { hs6: '550931', hs4: '5509', label: 'Akrilik kesikli lif ipliği', confidence: 'orta', reasons, alternatives: [] };
  if (fam === 'yun') return { hs6: '510710', hs4: '5107', label: 'Taranmış yün ipliği', confidence: 'dusuk', reasons, alternatives: [] };
  if (fam === 'keten') return { hs6: '530610', hs4: '5306', label: 'Keten ipliği', confidence: 'orta', reasons, alternatives: [] };
  if (fam === 'elastan_gipe') return { hs6: '540244', hs4: '5402', label: 'Elastomerik (elastan) filament iplik', confidence: 'orta', reasons, alternatives: [] };
  return { hs6: '540269', hs4: '5402', label: 'Sentetik iplik (ayrıntı eksik)', confidence: 'dusuk', reasons: [...reasons, 'İplik ailesi ve tipi eklenirse kod netleşir'], alternatives: [] };
}

export function suggestHs(input: HsInput, lang: Lang | string = 'tr'): HsSuggestion {
  const s = suggestHsTr(input);
  if (normalizeLang(lang) !== 'en') return s;
  return { ...s, label: localizeHsText(s.label, lang), reasons: s.reasons.map((r) => localizeHsText(r, lang)), alternatives: s.alternatives.map((a) => ({ ...a, label: localizeHsText(a.label, lang) })) };
}

// Kalıplı Türkçe metni çevirir; yakalanan parçalar (lif grubu, terbiye) da sözlükten çevrilir.
let hsPatterns: { re: RegExp; names: string[]; en: string }[] | null = null;
export function localizeHsText(text: string, lang: Lang | string): string {
  if (normalizeLang(lang) !== 'en') return text;
  if (exportTexts[text]) return exportTexts[text];
  if (!hsPatterns) {
    hsPatterns = [];
    for (const [tr, en] of Object.entries(exportTexts)) {
      if (!/\{\w+\}/.test(tr)) continue;
      const names: string[] = [];
      const src = tr.split(/(\{\w+\})/).map((part) => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (m) { names.push(m[1]); return '(.+?)'; }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }).join('');
      hsPatterns.push({ re: new RegExp(`^${src}$`, 's'), names, en });
    }
  }
  for (const p of hsPatterns) {
    const m = p.re.exec(text);
    if (!m) continue;
    const vals: Record<string, string> = {};
    p.names.forEach((n, i) => (vals[n] = t(lang, m[i + 1])));
    return p.en.replace(/\{(\w+)\}/g, (all, k) => vals[k] ?? all);
  }
  return t(lang, text);
}

function suggestHsTr(input: HsInput): HsSuggestion {
  const comp = (input.composition ?? []).filter((c) => c.percent > 0);
  switch (input.type) {
    case 'orme':
    case 'triko':
      return knit(input, comp, false);
    case 'raschel':
      return knit(input, comp, true);
    case 'dokuma':
      return woven(input, comp);
    case 'dantel': {
      const { top } = groupShares(comp);
      const hs6 = top === 'sentetik' || top === 'suni' ? '580421' : top === 'pamuk' ? '580429' : '580429';
      return { hs6, hs4: '5804', label: `Makine dantel, ${GROUP_LABEL[top]}`, confidence: 'orta', reasons: ['Dantel → 5804 (makine danteli)', `Baskın lif grubu: ${GROUP_LABEL[top]}`], alternatives: [{ hs6: '600410', label: 'Elastanlı raşel dantel örme kumaş olarak sınıflanırsa 6004.10' }] };
    }
    case 'iplik':
      return yarn(input);
    default:
      return { hs6: '600632', hs4: '6006', label: 'Belirlenemedi — kodu elle seçin', confidence: 'dusuk', reasons: ['Ürün çeşidi "diğer"; kod elle seçilmeli'], alternatives: [] };
  }
}

// Konfeksiyon ve elle seçim için hazır liste (fasıl 61-63 sık kullanılanlar).
export const COMMON_HS: { hs6: string; label: string; group: string }[] = [
  { hs6: '600410', label: 'Örme kumaş, elastanlı (≥%5)', group: 'Kumaş' },
  { hs6: '600632', label: 'Atkılı örme, sentetik, boyalı', group: 'Kumaş' },
  { hs6: '600622', label: 'Atkılı örme, pamuk, boyalı', group: 'Kumaş' },
  { hs6: '600537', label: 'Çözgülü (raşel) örme, sentetik, boyalı', group: 'Kumaş' },
  { hs6: '520832', label: 'Pamuklu dokuma ≤200 g/m², boyalı', group: 'Kumaş' },
  { hs6: '520942', label: 'Denim', group: 'Kumaş' },
  { hs6: '540752', label: 'Polyester filament dokuma, boyalı', group: 'Kumaş' },
  { hs6: '580421', label: 'Makine danteli, sentetik', group: 'Kumaş' },
  { hs6: '540233', label: 'Polyester tekstüre (DTY) iplik', group: 'İplik' },
  { hs6: '520512', label: 'Pamuk ipliği, karde', group: 'İplik' },
  { hs6: '520523', label: 'Pamuk ipliği, penye', group: 'İplik' },
  { hs6: '610910', label: 'Tişört, örme, pamuk', group: 'Konfeksiyon' },
  { hs6: '610990', label: 'Tişört, örme, diğer lifler', group: 'Konfeksiyon' },
  { hs6: '611020', label: 'Kazak/sweatshirt, örme, pamuk', group: 'Konfeksiyon' },
  { hs6: '611030', label: 'Kazak/sweatshirt, örme, sentetik', group: 'Konfeksiyon' },
  { hs6: '610462', label: 'Kadın pantolon, örme, pamuk', group: 'Konfeksiyon' },
  { hs6: '620342', label: 'Erkek pantolon/jean, dokuma, pamuk', group: 'Konfeksiyon' },
  { hs6: '620462', label: 'Kadın pantolon/jean, dokuma, pamuk', group: 'Konfeksiyon' },
  { hs6: '620193', label: 'Erkek mont, dokuma, sentetik', group: 'Konfeksiyon' },
  { hs6: '620293', label: 'Kadın mont, dokuma, sentetik', group: 'Konfeksiyon' },
  { hs6: '620520', label: 'Erkek gömlek, dokuma, pamuk', group: 'Konfeksiyon' },
  { hs6: '610443', label: 'Kadın elbise, örme, sentetik', group: 'Konfeksiyon' },
  { hs6: '611241', label: 'Kadın mayo, sentetik', group: 'Konfeksiyon' },
  { hs6: '610821', label: 'Kadın külot, örme, pamuk', group: 'Konfeksiyon' },
  { hs6: '630231', label: 'Nevresim/çarşaf, pamuk', group: 'Ev tekstili' },
  { hs6: '630260', label: 'Havlu, pamuk', group: 'Ev tekstili' },
];
