import type { MarketRow } from './trade';
import { t, normalizeLang, type Lang } from '../i18n';
import { countryName } from './countries';

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
const M49_NAMES_EN: Record<number, string> = {
  156: 'China', 380: 'Italy', 792: 'Türkiye', 699: 'India', 586: 'Pakistan', 704: 'Vietnam', 490: 'Taiwan', 410: 'South Korea', 276: 'Germany',
  50: 'Bangladesh', 764: 'Thailand', 360: 'Indonesia', 724: 'Spain', 251: 'France', 620: 'Portugal', 392: 'Japan', 842: 'USA', 826: 'United Kingdom',
  56: 'Belgium', 528: 'Netherlands', 616: 'Poland', 642: 'Romania', 203: 'Czechia', 40: 'Austria', 757: 'Switzerland', 144: 'Sri Lanka', 458: 'Malaysia',
  484: 'Mexico', 76: 'Brazil', 818: 'Egypt', 504: 'Morocco', 788: 'Tunisia', 784: 'UAE', 682: 'Saudi Arabia', 376: 'Israel', 348: 'Hungary', 703: 'Slovakia',
  688: 'Serbia', 499: 'Montenegro', 70: 'Bosnia and Herzegovina', 807: 'North Macedonia', 8: 'Albania', 100: 'Bulgaria', 300: 'Greece', 191: 'Croatia',
  705: 'Slovenia', 208: 'Denmark', 752: 'Sweden', 246: 'Finland', 578: 'Norway', 372: 'Ireland', 442: 'Luxembourg', 440: 'Lithuania', 428: 'Latvia',
  233: 'Estonia', 804: 'Ukraine', 112: 'Belarus', 498: 'Moldova', 643: 'Russia', 124: 'Canada', 32: 'Argentina', 170: 'Colombia', 604: 'Peru', 152: 'Chile',
  400: 'Jordan', 368: 'Iraq', 414: 'Kuwait', 634: 'Qatar', 48: 'Bahrain', 512: 'Oman', 422: 'Lebanon', 760: 'Syria', 710: 'South Africa', 404: 'Kenya',
  231: 'Ethiopia', 566: 'Nigeria', 12: 'Algeria', 860: 'Uzbekistan', 398: 'Kazakhstan', 268: 'Georgia', 31: 'Azerbaijan', 51: 'Armenia', 364: 'Iran',
  702: 'Singapore', 344: 'Hong Kong', 608: 'Philippines', 116: 'Cambodia', 104: 'Myanmar', 36: 'Australia', 554: 'New Zealand',
  795: 'Turkmenistan', 417: 'Kyrgyzstan', 762: 'Tajikistan', 4: 'Afghanistan',
};
export const m49Name = (m: number, lang: Lang | string = 'tr') =>
  normalizeLang(lang) === 'en' ? M49_NAMES_EN[m] ?? `Country ${m}` : M49_NAMES[m] ?? `Ülke ${m}`;

const fmtUsd = (v: number, lang: Lang = 'tr') => {
  if (lang === 'en') {
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)} billion`;
    if (v >= 1e6) return `$${Math.round(v / 1e6)} million`;
    return `$${Math.round(v / 1e3)}K`;
  }
  if (v >= 1e9) return `${(v / 1e9).toFixed(1).replace('.', ',')} milyar $`;
  if (v >= 1e6) return `${Math.round(v / 1e6)} milyon $`;
  return `${Math.round(v / 1e3)} bin $`;
};
const fmtPct = (v: number, lang: Lang = 'tr') => {
  const n = Math.abs(v) >= 10 ? String(Math.round(Math.abs(v))) : Math.abs(v).toFixed(1);
  return lang === 'en' ? `${n}%` : `%${n.replace('.', ',')}`;
};
const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
};

// Referans pay: puanlanan ülkelerde Türkiye payının medyanı (en az %3). "Türkiye burada da
// ortalamasını yakalarsa" hesabı için; tek başına gerçekçi hedef, vaat değil.
export function referenceShare(rows: MarketRow[]): number {
  const shares = rows.filter((r) => r.turkeySharePct != null && r.importUsd).map((r) => r.turkeySharePct!).sort((a, b) => a - b);
  if (!shares.length) return 5;
  const mid = shares[Math.floor(shares.length / 2)];
  return Math.max(3, mid);
}

export function insightFor(row: MarketRow, refSharePct: number, langIn: Lang | string = 'tr'): MarketInsight {
  const lang = normalizeLang(langIn);
  const L = (text: string, vars?: Record<string, string | number>) => t(lang, text, vars);
  const usd = (v: number) => fmtUsd(v, lang);
  const pc = (v: number) => fmtPct(v, lang);
  const c = row.country;
  const cName = countryName(c, lang);
  const empty = (type: MarketType, summary: string, action: string): MarketInsight => ({
    type, typeLabel: L(MARKET_TYPE_LABEL[type]), verdict: 'yok', verdictLabel: L(type === 'engelli' ? 'Engelli' : 'Değerlendirilemedi'),
    winnableUsd: null, pricePosition: null, pricePositionText: null, displaceable: null, summary, action,
  });
  if (row.blocked) {
    const reason = c.notes[0] ? L(c.notes[0]) : L('yaptırım/ambargo');
    return empty('engelli', `${L('{country} ile ticaret şu an yapılamıyor:', { country: cName })} ${reason}.`, L('Bu pazarı hedeflemeyin.'));
  }
  if (!row.importUsd || row.turkeySharePct == null) return empty('veri_yok', L('{country} bu ürün kodu için güncel ithalat verisi yayımlamamış.', { country: cName }), L('Başka bir kod ya da komşu ülke deneyin.'));

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
    pricePositionText = L('Bu ülkenin kg (ağırlık) verisi eksik görünüyor; fiyat karşılaştırması güvenilir değil.');
  }
  if (trKg && avgKg && priceReliable) {
    const diff = ((trKg - avgKg) / avgKg) * 100;
    pricePosition = diff <= -12 ? 'ucuz' : diff >= 12 ? 'pahali' : 'ortalama';
    pricePositionText =
      pricePosition === 'ucuz'
        ? L('Türk ürünü bu pazarda ortalamadan {pct} ucuz satılıyor.', { pct: pc(diff) })
        : pricePosition === 'pahali'
          ? L('Türk ürünü bu pazarda ortalamadan {pct} pahalı; kalite/hız ile satılıyor.', { pct: pc(diff) })
          : L('Türk ürünü pazar ortalaması fiyatında.');
  }

  // Yerinden edilebilecek rakip: Türkiye'den en az %20 pahalı ve payı ≥ %5 olan en büyük tedarikçi.
  let displaceable: MarketInsight['displaceable'] = null;
  if (trKg && priceReliable) {
    for (const s of row.topSuppliers) {
      if (s.m49 === 792 || !s.usdKg) continue;
      if (s.sharePct >= 5 && s.usdKg >= trKg * 1.2) {
        displaceable = { m49: s.m49, name: m49Name(s.m49, lang), sharePct: s.sharePct, priceGapPct: ((s.usdKg - trKg) / s.usdKg) * 100 };
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
  const verdictLabel = L(verdict === 'guclu' ? 'Güçlü fırsat' : verdict === 'degerlendirilebilir' ? 'Değerlendirilebilir' : 'Zayıf');

  const g = growth == null ? '' : L(growth >= 0 ? ', geçen yıla göre {pct} arttı' : ', geçen yıla göre {pct} azaldı', { pct: pc(growth) });
  const head = L('{country} bu üründen yılda {usd} ithal ediyor{growth}.', { country: cName, usd: usd(imp), growth: g });
  const rankTxt = row.turkeyRank ? (lang === 'en' ? ` (${ordinal(row.turkeyRank)} largest supplier)` : ` (${row.turkeyRank}. tedarikçi)`) : '';
  const v = { share: pc(share), rank: rankTxt, usd: usd(imp) };
  let body: string;
  let action: string;
  switch (type) {
    case 'yukselen':
      body = L("Pazar hızla büyüyor ve Türkiye'nin payı henüz {share}{rank}: erken girenin kazanacağı bir pazar.", v);
      action = L('Öncelik verin: numune kiti hazırlayıp bu ülkedeki konfeksiyoncu ve toptancılara ilk teması şimdi kurun.');
      break;
    case 'turk_guclu':
      body = L('Türkiye burada zaten güçlü: pay {share}{rank}. Alıcılar Türk tedarikçiye alışkın, güven kurmak kolay.', v);
      action = L('Kalite, termin ve kumaş pasaportuyla öne çıkın; mevcut Türk tedarikçilerden daha hızlı numune sunun.');
      break;
    case 'premium':
      body = L('Türk ürünü burada ortalamanın üstünde fiyatla satılıyor ve pay {share}: alıcı kaliteye ve hıza para ödüyor.', v);
      action = L('Fiyatla değil kalite, sertifika (OEKO-TEX, GRS) ve hızlı teslimle konumlanın.');
      break;
    case 'fiyat':
      body = L('Pazar fiyat odaklı; Türk ürünü ucuz ama pay yalnızca {share}. Rekabet düşük fiyatlı Asya tedarikçileriyle.', v);
      action = L('Hacimli, standart kalitelerle girin; kısa termin ve küçük parti avantajını vurgulayın.');
      break;
    case 'kucuk':
      body = L('Küçük bir pazar ({usd}); Türkiye payı {share}.', v);
      action = L('Tek başına hedef değil; bölgedeki büyük pazarla birlikte değerlendirin.');
      break;
    case 'riskli':
      body = L('Talep var ama ödeme veya kur riski yüksek; Türkiye payı {share}.', v);
      action = L('Akreditif ya da Türk Eximbank alacak sigortasıyla çalışın; peşin/avans şartı koyun.');
      break;
    default:
      body = L('Büyük ve rekabetçi bir pazar; Türkiye payı {share}{rank}.', v);
      action = displaceable
        ? L("{rival}'dan alan alıcıları hedefleyin: siz {pct} daha ucuzsunuz.", { rival: displaceable.name, pct: pc(displaceable.priceGapPct) })
        : L('Belirli bir niş (renk, desen, sürdürülebilir iplik) ile farklılaşarak girin.');
  }
  const winTxt = winnableUsd >= 1e6 ? ' ' + L('Türkiye burada diğer pazarlardaki ortalama payına ulaşırsa yıllık ek {usd} iş çıkar.', { usd: usd(winnableUsd) }) : '';
  const dispTxt = displaceable && type !== 'buyuk_rekabetci'
    ? ' ' + L('Rakip: {rival} (pazar payı {share}) Türk ürününden {pct} pahalı satıyor.', { rival: displaceable.name, share: pc(displaceable.sharePct), pct: pc(displaceable.priceGapPct) })
    : '';
  return {
    type,
    typeLabel: L(MARKET_TYPE_LABEL[type]),
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
export function overview(rows: (MarketRow & { insight: MarketInsight })[], langIn: Lang | string = 'tr') {
  const lang = normalizeLang(langIn);
  const scored = rows.filter((r) => r.score != null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const top = scored.slice(0, 3);
  const totalImport = scored.reduce((s, r) => s + (r.importUsd ?? 0), 0);
  const totalTr = scored.reduce((s, r) => s + (r.turkeyUsd ?? 0), 0);
  const winnable = scored.reduce((s, r) => s + (r.insight.winnableUsd ?? 0), 0);
  const trShare = totalImport ? (totalTr / totalImport) * 100 : 0;
  return {
    top: top.map((r) => ({ m49: r.country.m49, name: countryName(r.country, lang), score: r.score, typeLabel: r.insight.typeLabel, reason: r.insight.summary.split('. ')[1] ?? r.insight.summary })),
    totalImportUsd: totalImport,
    turkeySharePct: trShare,
    winnableUsd: winnable,
    headline: scored.length
      ? t(lang, "İncelenen {n} ülke bu üründen yılda toplam {usd} ithal ediyor; Türkiye'nin payı {share}.", { n: scored.length, usd: fmtUsd(totalImport, lang), share: fmtPct(trShare, lang) }) +
        (winnable >= 1e6 ? ' ' + t(lang, 'Payın ortalamaya çıktığı senaryoda ek {usd} pazar var.', { usd: fmtUsd(winnable, lang) }) : '')
      : t(lang, 'Veri geliyor…'),
  };
}
