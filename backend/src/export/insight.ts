import type { MarketRow } from './trade';

// Pazar yorumu (Fırat 2026-09-24: "daha analitik ve vizyoner"). Sayıları karara çevirir:
// pazar tipi, kazanılabilir pazar ($), fiyat konumu, yerinden edilebilecek rakip, sade yorum ve
// önerilen hamle. Deterministik (yapay zekâ uydurmaz); aynı veri → aynı cümle. Asistan da bunu okur.

export type MarketType = 'yukselen' | 'buyuk_rekabetci' | 'premium' | 'fiyat' | 'turk_guclu' | 'kucuk' | 'riskli' | 'engelli' | 'veri_yok';
export const MARKET_TYPE_LABEL: Record<MarketType, string> = {
  yukselen: 'Yükselen fırsat',
  buyuk_rekabetci: 'Büyük ama rekabetçi',
  premium: 'Premium pazar',
  fiyat: 'Fiyat pazarı',
  turk_guclu: 'Türkiye güçlü',
  kucuk: 'Küçük / niş pazar',
  riskli: 'Riskli pazar',
  engelli: 'Ticaret engelli',
  veri_yok: 'Veri yok',
};

export interface MarketInsight {
  type: MarketType;
  typeLabel: string;
  verdict: 'guclu' | 'degerlendirilebilir' | 'zayif' | 'yok';
  verdictLabel: string;
  // Türkiye payı referans paya (hedef ülkelerdeki medyan) çıkarsa kazanılacak yıllık ithalat, USD.
  winnableUsd: number | null;
  pricePosition: 'ucuz' | 'ortalama' | 'pahali' | null;
  pricePositionText: string | null;
  // Yerini alabileceğimiz rakip: Türkiye'den pahalı ve payı büyük tedarikçi (kalite/fiyat avantajı).
  displaceable: { m49: number; name: string; sharePct: number; priceGapPct: number } | null;
  summary: string; // 1-2 cümle sade Türkçe
  action: string; // önerilen hamle
}

const M49_NAMES: Record<number, string> = {
  156: 'Çin', 380: 'İtalya', 792: 'Türkiye', 699: 'Hindistan', 586: 'Pakistan', 704: 'Vietnam', 490: 'Tayvan', 410: 'Kore', 276: 'Almanya',
  50: 'Bangladeş', 764: 'Tayland', 360: 'Endonezya', 724: 'İspanya', 251: 'Fransa', 620: 'Portekiz', 392: 'Japonya', 842: 'ABD', 826: 'Birleşik Krallık',
  56: 'Belçika', 528: 'Hollanda', 616: 'Polonya', 642: 'Romanya', 203: 'Çekya', 40: 'Avusturya', 757: 'İsviçre', 144: 'Sri Lanka', 458: 'Malezya',
  484: 'Meksika', 76: 'Brezilya', 818: 'Mısır', 504: 'Fas', 788: 'Tunus', 784: 'BAE', 682: 'Suudi Arabistan', 376: 'İsrail', 348: 'Macaristan', 703: 'Slovakya',
  688: 'Sırbistan', 499: 'Karadağ', 70: 'Bosna-Hersek', 807: 'Kuzey Makedonya', 8: 'Arnavutluk', 100: 'Bulgaristan', 300: 'Yunanistan', 191: 'Hırvatistan',
  705: 'Slovenya', 208: 'Danimarka', 752: 'İsveç', 246: 'Finlandiya', 578: 'Norveç', 372: 'İrlanda', 442: 'Lüksemburg', 440: 'Litvanya', 428: 'Letonya',
  233: 'Estonya', 804: 'Ukrayna', 112: 'Belarus', 498: 'Moldova', 643: 'Rusya', 124: 'Kanada', 32: 'Arjantin', 170: 'Kolombiya', 604: 'Peru', 152: 'Şili',
  400: 'Ürdün', 368: 'Irak', 414: 'Kuveyt', 634: 'Katar', 48: 'Bahreyn', 512: 'Umman', 422: 'Lübnan', 760: 'Suriye', 710: 'Güney Afrika', 404: 'Kenya',
  231: 'Etiyopya', 566: 'Nijerya', 12: 'Cezayir', 860: 'Özbekistan', 398: 'Kazakistan', 268: 'Gürcistan', 31: 'Azerbaycan', 51: 'Ermenistan', 364: 'İran',
  702: 'Singapur', 344: 'Hong Kong', 608: 'Filipinler', 116: 'Kamboçya', 104: 'Myanmar', 36: 'Avustralya', 554: 'Yeni Zelanda',
  795: 'Türkmenistan', 417: 'Kırgızistan', 762: 'Tacikistan', 4: 'Afganistan',
};
export const m49Name = (m: number) => M49_NAMES[m] ?? `Ülke ${m}`;

const fmtUsd = (v: number) => {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1).replace('.', ',')} milyar $`;
  if (v >= 1e6) return `${Math.round(v / 1e6)} milyon $`;
  return `${Math.round(v / 1e3)} bin $`;
};
const fmtPct = (v: number) => `%${Math.abs(v) >= 10 ? Math.round(Math.abs(v)) : Math.abs(v).toFixed(1).replace('.', ',')}`;

// Referans pay: puanlanan ülkelerde Türkiye payının medyanı (en az %3). "Türkiye burada da
// ortalamasını yakalarsa" hesabı için; tek başına gerçekçi hedef, vaat değil.
export function referenceShare(rows: MarketRow[]): number {
  const shares = rows.filter((r) => r.turkeySharePct != null && r.importUsd).map((r) => r.turkeySharePct!).sort((a, b) => a - b);
  if (!shares.length) return 5;
  const mid = shares[Math.floor(shares.length / 2)];
  return Math.max(3, mid);
}

export function insightFor(row: MarketRow, refSharePct: number): MarketInsight {
  const c = row.country;
  const empty = (type: MarketType, summary: string, action: string): MarketInsight => ({
    type, typeLabel: MARKET_TYPE_LABEL[type], verdict: 'yok', verdictLabel: type === 'engelli' ? 'Engelli' : 'Değerlendirilemedi',
    winnableUsd: null, pricePosition: null, pricePositionText: null, displaceable: null, summary, action,
  });
  if (row.blocked) return empty('engelli', `${c.name} ile ticaret şu an yapılamıyor: ${c.notes[0] ?? 'yaptırım/ambargo'}.`, 'Bu pazarı hedeflemeyin.');
  if (!row.importUsd || row.turkeySharePct == null) return empty('veri_yok', `${c.name} bu ürün kodu için güncel ithalat verisi yayımlamamış.`, 'Başka bir kod ya da komşu ülke deneyin.');

  const imp = row.importUsd;
  const share = row.turkeySharePct;
  const growth = row.growthPct;
  const trKg = row.unitUsdKg.turkey;
  const avgKg = row.unitUsdKg.world;

  // Fiyat konumu: Türkiye kg fiyatı pazar ortalamasına göre.
  let pricePosition: MarketInsight['pricePosition'] = null;
  let pricePositionText: string | null = null;
  // Aşırı oranlar (Türk kg fiyatı ortalamanın 2,5 katı üstü ya da 2,5'te biri altı) genellikle ağırlık
  // verisinin eksik bildirilmesinden kaynaklanır; yorumda kullanılmaz, ekranda uyarı olur.
  const ratio = trKg && avgKg ? trKg / avgKg : null;
  const priceReliable = ratio != null && ratio <= 2.5 && ratio >= 0.4;
  if (trKg && avgKg && !priceReliable) {
    pricePositionText = 'Bu ülkenin kg (ağırlık) verisi eksik görünüyor; fiyat karşılaştırması güvenilir değil.';
  }
  if (trKg && avgKg && priceReliable) {
    const diff = ((trKg - avgKg) / avgKg) * 100;
    pricePosition = diff <= -12 ? 'ucuz' : diff >= 12 ? 'pahali' : 'ortalama';
    pricePositionText =
      pricePosition === 'ucuz'
        ? `Türk ürünü bu pazarda ortalamadan ${fmtPct(diff)} ucuz satılıyor.`
        : pricePosition === 'pahali'
          ? `Türk ürünü bu pazarda ortalamadan ${fmtPct(diff)} pahalı; kalite/hız ile satılıyor.`
          : 'Türk ürünü pazar ortalaması fiyatında.';
  }

  // Yerinden edilebilecek rakip: Türkiye'den en az %20 pahalı ve payı ≥ %5 olan en büyük tedarikçi.
  let displaceable: MarketInsight['displaceable'] = null;
  if (trKg && priceReliable) {
    for (const s of row.topSuppliers) {
      if (s.m49 === 792 || !s.usdKg) continue;
      if (s.sharePct >= 5 && s.usdKg >= trKg * 1.2) {
        displaceable = { m49: s.m49, name: m49Name(s.m49), sharePct: s.sharePct, priceGapPct: ((s.usdKg - trKg) / s.usdKg) * 100 };
        break;
      }
    }
  }

  const winnableUsd = share < refSharePct ? (imp * (refSharePct - share)) / 100 : 0;
  const risky = c.risk === 'odeme' || c.risk === 'kur';

  // Pazar tipi (ilk eşleşen)
  let type: MarketType;
  if (risky && (row.score ?? 0) < 70) type = 'riskli';
  else if (imp < 8e6) type = 'kucuk';
  else if (growth != null && growth >= 15 && share < 10) type = 'yukselen';
  else if (share >= 20) type = 'turk_guclu';
  else if (pricePosition === 'pahali' && share >= 3) type = 'premium';
  else if (pricePosition === 'ucuz' && share < 5) type = 'fiyat';
  else type = 'buyuk_rekabetci';

  const score = row.score ?? 0;
  const verdict: MarketInsight['verdict'] = score >= 70 ? 'guclu' : score >= 50 ? 'degerlendirilebilir' : 'zayif';
  const verdictLabel = verdict === 'guclu' ? 'Güçlü fırsat' : verdict === 'degerlendirilebilir' ? 'Değerlendirilebilir' : 'Zayıf';

  const g = growth == null ? '' : growth >= 0 ? `, geçen yıla göre ${fmtPct(growth)} arttı` : `, geçen yıla göre ${fmtPct(growth)} azaldı`;
  const head = `${c.name} bu üründen yılda ${fmtUsd(imp)} ithal ediyor${g}.`;
  const rankTxt = row.turkeyRank ? ` (${row.turkeyRank}. tedarikçi)` : '';
  let body: string;
  let action: string;
  switch (type) {
    case 'yukselen':
      body = `Pazar hızla büyüyor ve Türkiye'nin payı henüz ${fmtPct(share)}${rankTxt}: erken girenin kazanacağı bir pazar.`;
      action = 'Öncelik verin: numune kiti hazırlayıp bu ülkedeki konfeksiyoncu ve toptancılara ilk teması şimdi kurun.';
      break;
    case 'turk_guclu':
      body = `Türkiye burada zaten güçlü: pay ${fmtPct(share)}${rankTxt}. Alıcılar Türk tedarikçiye alışkın, güven kurmak kolay.`;
      action = 'Kalite, termin ve kumaş pasaportuyla öne çıkın; mevcut Türk tedarikçilerden daha hızlı numune sunun.';
      break;
    case 'premium':
      body = `Türk ürünü burada ortalamanın üstünde fiyatla satılıyor ve pay ${fmtPct(share)}: alıcı kaliteye ve hıza para ödüyor.`;
      action = 'Fiyatla değil kalite, sertifika (OEKO-TEX, GRS) ve hızlı teslimle konumlanın.';
      break;
    case 'fiyat':
      body = `Pazar fiyat odaklı; Türk ürünü ucuz ama pay yalnızca ${fmtPct(share)}. Rekabet düşük fiyatlı Asya tedarikçileriyle.`;
      action = 'Hacimli, standart kalitelerle girin; kısa termin ve küçük parti avantajını vurgulayın.';
      break;
    case 'kucuk':
      body = `Küçük bir pazar (${fmtUsd(imp)}); Türkiye payı ${fmtPct(share)}.`;
      action = 'Tek başına hedef değil; bölgedeki büyük pazarla birlikte değerlendirin.';
      break;
    case 'riskli':
      body = `Talep var ama ödeme veya kur riski yüksek; Türkiye payı ${fmtPct(share)}.`;
      action = 'Akreditif ya da Türk Eximbank alacak sigortasıyla çalışın; peşin/avans şartı koyun.';
      break;
    default:
      body = `Büyük ve rekabetçi bir pazar; Türkiye payı ${fmtPct(share)}${rankTxt}.`;
      action = displaceable
        ? `${displaceable.name}'dan alan alıcıları hedefleyin: siz ${fmtPct(displaceable.priceGapPct)} daha ucuzsunuz.`
        : 'Belirli bir niş (renk, desen, sürdürülebilir iplik) ile farklılaşarak girin.';
  }
  const winTxt = winnableUsd >= 1e6 ? ` Türkiye burada diğer pazarlardaki ortalama payına ulaşırsa yıllık ek ${fmtUsd(winnableUsd)} iş çıkar.` : '';
  const dispTxt = displaceable && type !== 'buyuk_rekabetci' ? ` Rakip: ${displaceable.name} (pazar payı ${fmtPct(displaceable.sharePct)}) Türk ürününden ${fmtPct(displaceable.priceGapPct)} pahalı satıyor.` : '';
  return {
    type,
    typeLabel: MARKET_TYPE_LABEL[type],
    verdict,
    verdictLabel,
    winnableUsd,
    pricePosition,
    pricePositionText,
    displaceable,
    summary: `${head} ${body}${winTxt}${dispTxt}`.trim(),
    action,
  };
}

// Ekranın en üstü: en iyi 3 pazar ve tek cümlelik genel tablo.
export function overview(rows: (MarketRow & { insight: MarketInsight })[]) {
  const scored = rows.filter((r) => r.score != null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const top = scored.slice(0, 3);
  const totalImport = scored.reduce((s, r) => s + (r.importUsd ?? 0), 0);
  const totalTr = scored.reduce((s, r) => s + (r.turkeyUsd ?? 0), 0);
  const winnable = scored.reduce((s, r) => s + (r.insight.winnableUsd ?? 0), 0);
  const trShare = totalImport ? (totalTr / totalImport) * 100 : 0;
  return {
    top: top.map((r) => ({ m49: r.country.m49, name: r.country.name, score: r.score, typeLabel: r.insight.typeLabel, reason: r.insight.summary.split('. ')[1] ?? r.insight.summary })),
    totalImportUsd: totalImport,
    turkeySharePct: trShare,
    winnableUsd: winnable,
    headline: scored.length
      ? `İncelenen ${scored.length} ülke bu üründen yılda toplam ${fmtUsd(totalImport)} ithal ediyor; Türkiye'nin payı ${fmtPct(trShare)}.${winnable >= 1e6 ? ` Payın ortalamaya çıktığı senaryoda ek ${fmtUsd(winnable)} pazar var.` : ''}`
      : 'Veri geliyor…',
  };
}
