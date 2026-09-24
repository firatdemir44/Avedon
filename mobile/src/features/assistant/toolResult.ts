import type { AssistantToolCall } from '../../api/client';
import { categoryLabel, STOCK_UNIT_LABELS, type StockUnit } from '../products/catalog';
import { certificateLabel, formatComposition, widthTypeLabel } from '../products/glossaryLabels';
import { YARN_END_USES, optionLabel } from '../yarns/catalog';
import { locale, tr } from '../../i18n';

// Asistanın çağırdığı aracın çıktısını sonuç kartındaki satırlara çevirir.
//
// KURAL (Faz 1 planı Adım 5): karttaki her rakam ARAÇ ÇIKTISINDAN gelir, model
// metninden değil. Bu yüzden burada hiç hesap yapılmaz; yalnızca var olan
// sayılar biçimlendirilip adlandırılır. Tanınmayan bir beceri gelirse satır
// üretilmez, sunucunun yazdığı `summary` metni gösterilir.

export interface ResultRow {
  label: string;
  value: string;
  // Etiketin altındaki küçük gri açıklama (katalog satırında kompozisyon).
  note?: string;
  // Kartın son satırı gibi öne çıkan satır.
  strong?: boolean;
  // Katalog sonucu satırı: dokununca açılacak ürün (satıcı asistanı, Faz 2 Adım 3).
  productId?: string;
  // Kapasite araması satırı: dokununca açılacak firma (Faz 2, Adım 5).
  companyId?: string;
}

export interface ToolResultView {
  name: string;
  title: string;
  // Kart başlığının sağındaki birim ("TRY/kg", "kg" gibi).
  unit?: string;
  rows: ResultRow[];
  // Satır üretilemediyse gösterilecek düz metin.
  text?: string;
  formula?: string;
}

export function formatNumber(value: unknown, digits = 2): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// Hesap motorlarındaki MoneyTriple: { TRY, USD, EUR } — USD/EUR kur girilmemişse null.
function money(value: unknown): string | null {
  const o = asObject(value);
  const tryValue = asNumber(o.TRY);
  if (tryValue == null) return null;
  const parts = [`${formatNumber(tryValue)} ₺`];
  const usd = asNumber(o.USD);
  if (usd != null) parts.push(`${formatNumber(usd)} $`);
  return parts.join(' · ');
}

function pushMoney(rows: ResultRow[], label: string, value: unknown, strong?: boolean) {
  const text = money(value);
  if (text) rows.push({ label, value: text, strong });
}

function pushNumber(rows: ResultRow[], label: string, value: unknown, unit: string, digits = 2) {
  const n = asNumber(value);
  if (n == null) return;
  rows.push({ label, value: unit ? `${formatNumber(n, digits)} ${unit}` : formatNumber(n, digits) });
}

const YARN_UNIT_LABELS: { key: string; label: string; digits: number }[] = [
  { key: 'tex', label: 'tex', digits: 1 },
  { key: 'nm', label: 'Nm', digits: 2 },
  { key: 'ne', label: 'Ne', digits: 2 },
  { key: 'denye', label: 'denye', digits: 1 },
  { key: 'dtex', label: 'dtex', digits: 1 },
];

// Etiket okuma (pasaport_cikar) alan adları → Türkçe satır başlığı.
const PASSPORT_FIELD_LABELS: Record<string, string> = {
  type: 'Çeşit',
  subtype: 'Alt çeşit',
  code: 'Kod',
  composition: 'Kompozisyon',
  weightGsm: 'Gramaj',
  widthCm: 'En',
  widthType: 'En tipi',
  yarns: 'İplik',
  certificates: 'Sertifika',
  finishTags: 'Apre',
  usages: 'Kullanım',
};

function passportValue(field: string, value: unknown): string {
  if (value == null) return '';
  switch (field) {
    case 'composition': {
      const items = asArray(value).filter((i): i is { fiber: string; percent: number } => {
        const o = asObject(i);
        return typeof o.fiber === 'string' && typeof o.percent === 'number';
      });
      return items.length ? formatComposition(items) : '';
    }
    case 'weightGsm':
      return `${formatNumber(value, 0)} gr/m²`;
    case 'widthCm':
      return `${formatNumber(value, 0)} cm`;
    case 'widthType':
      return widthTypeLabel(asText(value));
    case 'yarns':
      return asArray(value)
        .map((y) => {
          const o = asObject(y);
          const ply = asNumber(o.ply);
          const count = asNumber(o.count);
          const head = ply && ply > 1 ? `${formatNumber(count, 0)}/${ply}` : formatNumber(count, 0);
          return `${head} ${asText(o.unit)}${asText(o.yarnType) ? ` ${asText(o.yarnType)}` : ''}`.trim();
        })
        .filter(Boolean)
        .join(', ');
    case 'certificates':
      return asArray(value)
        .map((c) => certificateLabel(asText(asObject(c).name)))
        .filter(Boolean)
        .join(', ');
    case 'finishTags':
    case 'usages':
      return asArray(value).map(asText).filter(Boolean).join(', ');
    default:
      return asText(value) || String(value);
  }
}

function catalogRows(output: unknown): ResultRow[] {
  return asArray(asObject(output).products).map((item) => {
    const p = asObject(item);
    const measures: string[] = [];
    const gsm = asNumber(p.weightGsm);
    if (gsm != null) measures.push(`${formatNumber(gsm, 0)} gr/m²`);
    const width = asNumber(p.widthCm);
    if (width != null) measures.push(`${formatNumber(width, 0)} cm`);

    const composition = asArray(p.composition).filter((i): i is { fiber: string; percent: number } => {
      const o = asObject(i);
      return typeof o.fiber === 'string' && typeof o.percent === 'number';
    });
    const note = composition.length ? formatComposition(composition) : asText(p.content);
    const category = categoryLabel(asText(p.type), asText(p.subtype));

    return {
      label: asText(p.code) || tr('Ürün'),
      value: measures.join(' · '),
      note: [category, note].filter(Boolean).join(' · ') || undefined,
      productId: asText(p.id) || undefined,
    };
  });
}

export function toolResultView(call: AssistantToolCall): ToolResultView {
  const base = { name: call.name, title: call.title, formula: call.formula };
  const out = asObject(call.output);
  const rows: ResultRow[] = [];

  switch (call.name) {
    case 'fabricPricing': {
      pushMoney(rows, tr('İplik'), out.yarnCostPerKg);
      pushMoney(rows, tr('Ham maliyet'), out.greigeCostPerKg);
      pushMoney(rows, tr('Ham satış'), out.greigeSalePerKg);
      pushMoney(rows, tr('Boyalı maliyet'), out.dyedCostPerKg);
      pushMoney(rows, tr('Boyalı satış'), out.dyedSalePerKg, true);
      pushNumber(rows, tr('Metre / kg'), out.metersPerKg, 'm');
      return { ...base, unit: tr('kg başına'), rows, text: rows.length ? undefined : call.summary };
    }
    case 'yarnCount':
    case 'yarnCountFromSample': {
      for (const unit of YARN_UNIT_LABELS) pushNumber(rows, unit.label, out[unit.key], '', unit.digits);
      return { ...base, rows, text: rows.length ? undefined : call.summary };
    }
    case 'fabricLengthWeight': {
      pushNumber(rows, tr('Hesap eni'), out.effectiveWidthCm, 'cm', 0);
      pushNumber(rows, tr('1 kilo'), out.metersPerKg, 'm');
      pushNumber(rows, tr('1 metre'), out.kgPerMeter, 'kg', 3);
      pushNumber(rows, tr('Hesaplanan kilo'), out.kg, 'kg', 1);
      pushNumber(rows, tr('Hesaplanan metre'), out.meters, 'm', 1);
      if (rows.length) rows[rows.length - 1].strong = true;
      return { ...base, rows, text: rows.length ? undefined : call.summary };
    }
    case 'yarnUsage': {
      pushNumber(rows, tr('Gereken iplik'), out.yarnKg, 'kg', 1);
      pushNumber(rows, tr('1 metre'), out.kgPerMeter, 'kg', 3);
      pushNumber(rows, tr('1 kilo'), out.metersPerKg, 'm');
      if (rows.length) rows[0].strong = true;
      return { ...base, rows, text: rows.length ? undefined : call.summary };
    }
    case 'knitProduction': {
      pushNumber(rows, tr('Saatlik üretim'), out.kgPerHour, 'kg', 1);
      pushNumber(rows, tr('Günlük üretim'), out.kgPerDay, 'kg', 1);
      const machines = asNumber(out.machineCount);
      if (machines != null && machines > 1) {
        pushNumber(rows, tr('Makine başına ({n} makine)', { n: formatNumber(machines, 0) }), out.perMachineKgPerDay, 'kg/gün', 1);
      }
      const feedRows = asArray(asObject(call.input).rows);
      asArray(out.percents).forEach((p, index) => {
        const n = asNumber(p);
        if (n == null) return;
        const label = asText(asObject(feedRows[index]).label) || tr('{n}. iplik', { n: index + 1 });
        rows.push({ label: tr('{label} payı', { label }), value: `%${formatNumber(n, 1)}` });
      });
      pushNumber(rows, tr('Günlük fason geliri'), out.dailyFeeIncome, '₺', 0);
      if (rows.length > 1) rows[1].strong = true;
      return { ...base, rows, text: rows.length ? undefined : call.summary };
    }
    case 'yarnUsageRatio': {
      const feedRows = asArray(asObject(call.input).rows);
      asArray(out.percents).forEach((p, index) => {
        const n = asNumber(p);
        if (n == null) return;
        const row = asObject(feedRows[index]);
        const label = asText(row.label) || `${formatNumber(row.count, 0)} ${asText(row.system)}`.trim() || tr('{n}. iplik', { n: index + 1 });
        rows.push({ label, value: `%${formatNumber(n, 1)}` });
      });
      return { ...base, rows, text: rows.length ? undefined : call.summary };
    }
    case 'fabricGsmSample':
    case 'fabricGsmKnit': {
      pushNumber(rows, tr('Gramaj'), out.gsm, 'gr/m²', 1);
      pushNumber(rows, tr('Tahmini mamul gramaj'), out.estimatedFinishedGsm, 'gr/m²', 1);
      pushNumber(rows, tr('Ölçülen mamul gramaj'), out.measuredFinishedGsm, 'gr/m²', 1);
      pushNumber(rows, tr('Sapma'), out.deviationPercent, '%', 1);
      pushNumber(rows, tr('İlmek boyu'), out.loopLengthMm, 'mm', 2);
      pushNumber(rows, tr('İplik'), out.yarnTex, 'tex', 1);
      if (rows.length) rows[0].strong = true;
      return { ...base, rows, text: rows.length ? undefined : call.summary };
    }
    case 'yarnRequirement': {
      pushNumber(rows, tr('Dikilmiş üründe kumaş'), out.garmentFabricKg, 'kg', 1);
      pushNumber(rows, tr('Mamul kumaş'), out.finishedKg, 'kg', 1);
      pushNumber(rows, tr('Ham kumaş'), out.greigeKg, 'kg', 1);
      pushNumber(rows, tr('Alınacak iplik'), out.yarnKg, 'kg', 1);
      if (rows.length) rows[rows.length - 1].strong = true;
      return { ...base, unit: 'kg', rows, text: rows.length ? undefined : call.summary };
    }
    case 'garmentCost': {
      const currency = asText(asObject(call.input).currency) || 'TRY';
      pushNumber(rows, tr('Kumaş'), out.fabricCost, '', 2);
      for (const item of asArray(out.items)) {
        const o = asObject(item);
        const amount = asNumber(o.amount);
        if (amount == null || amount === 0) continue;
        rows.push({ label: asText(o.label) || asText(o.key), value: formatNumber(amount) });
      }
      pushNumber(rows, tr('Adet maliyeti'), out.totalCost, '', 2);
      pushNumber(rows, tr('Sipariş toplamı'), out.orderTotal, '', 2);
      if (rows.length) rows[rows.length - 1].strong = true;
      return { ...base, unit: tr('{currency} / adet', { currency }), rows, text: rows.length ? undefined : call.summary };
    }
    case 'katalog_ara': {
      const productRows = catalogRows(call.output);
      return {
        ...base,
        unit: productRows.length ? tr('{n} ürün', { n: productRows.length }) : undefined,
        rows: productRows,
        text: productRows.length ? undefined : call.summary,
      };
    }
    // Faz 2, Adım 5: fason kapasite araması. Firma satırına dokununca firma
    // sayfası açılır (katalog satırındaki ürün deseninin aynısı).
    // Asistandan asistana: firma başına kısa cevap; satır firma sayfasını açar.
    case 'firma_asistanlarina_sor': {
      for (const item of asArray(out.answers)) {
        const a = asObject(item);
        const answer = asText(a.answer);
        rows.push({
          label: asText(a.companyName) || tr('Firma'),
          value: a.error ? tr('ulaşılamadı') : a.forwarded === true ? tr('firmaya iletildi') : tr('cevapladı'),
          note: answer ? (answer.length > 220 ? answer.slice(0, 220) + '…' : answer) : asText(a.error) || undefined,
          companyId: asText(a.companyId) || undefined,
        });
      }
      return { ...base, rows, text: rows.length ? undefined : call.summary };
    }
    case 'firma_bul': {
      for (const item of asArray(out.companies)) {
        const c = asObject(item);
        rows.push({ label: asText(c.name) || tr('Firma'), value: c.verification === 'dogrulanmis' ? tr('doğrulanmış') : '', note: asText(c.city) || undefined, companyId: asText(c.id) || undefined });
      }
      return { ...base, rows, text: rows.length ? undefined : call.summary };
    }
    case 'kapasite_ara': {
      const results = asArray(out.results);
      for (const item of results) {
        const result = asObject(item);
        const company = asObject(result.company);
        const capacity = asObject(result.capacity);
        const matchedCount = asNumber(result.matchedCount);
        const tons = asNumber(capacity.monthlyCapacityTons);
        const note = [
          asText(company.city),
          capacity.contractOpen === true ? tr('fason açık') : tr('fason kapalı'),
          matchedCount != null ? tr('{n} makine', { n: formatNumber(matchedCount, 0) }) : null,
          tons != null ? tr('aylık {n} ton', { n: formatNumber(tons, 0) }) : null,
        ]
          .filter(Boolean)
          .join(' · ');
        rows.push({
          label: asText(company.name) || tr('Firma'),
          value: tons != null ? `${formatNumber(tons, 0)} ton` : '',
          note: note || undefined,
          companyId: asText(company.id) || undefined,
        });
      }
      return {
        ...base,
        unit: rows.length ? tr('{n} firma', { n: rows.length }) : undefined,
        rows,
        text: rows.length ? undefined : call.summary,
      };
    }
    // Faz 2, Adım 6: iplik dizini araması. Satıra dokununca iplik sayfası
    // açılır (katalog satırındaki ürün deseninin aynısı).
    case 'iplik_ara': {
      for (const item of asArray(out.results)) {
        const result = asObject(item);
        const company = asObject(result.company);
        const stockKg = asNumber(result.stockKg);
        const endUses = asArray(result.endUses)
          .map((key) => optionLabel(YARN_END_USES, asText(key)))
          .filter(Boolean);
        const note = [asText(company.name), asText(result.code), endUses.join(', ')].filter(Boolean).join(' · ');
        rows.push({
          label: asText(result.summary) || asText(result.content) || 'İplik',
          value: stockKg != null ? `${formatNumber(stockKg, 0)} kg` : '',
          note: note || undefined,
          productId: asText(result.id) || undefined,
        });
      }
      return {
        ...base,
        unit: rows.length ? tr('{n} iplik', { n: rows.length }) : undefined,
        rows,
        text: rows.length ? undefined : call.summary,
      };
    }
    case 'pasaport_cikar': {
      for (const [field, trLabel] of Object.entries(PASSPORT_FIELD_LABELS)) {
        const label = tr(trLabel);
        const entry = asObject(out[field]);
        if (!('value' in entry) || entry.value == null) continue;
        const value = passportValue(field, entry.value);
        if (value) rows.push({ label, value });
      }
      const notes = asText(out.notes);
      return { ...base, rows, text: rows.length ? undefined : notes || call.summary };
    }
    default:
      return { ...base, rows: [], text: call.summary };
  }
}

// Faz 3, Adım 2: asistanın teklif araçları. Bu ikisi satır listesi değil, kendi
// kartlarını çiziyor (onay kutusu + düğme), bu yüzden ayrı okuyucular var.
// Kural aynı: karttaki her değer ARAÇ ÇIKTISINDAN gelir, model metninden değil.

export interface RfqCandidate {
  id: string;
  code: string;
  companyId: string;
  companyName: string;
  verified: boolean;
  type: string;
  stockUnit: StockUnit;
  // "Örme · Süprem · %95 PA %5 EA · 220 gr/m² · 180 cm · 1.200 m"
  summary: string;
}

export interface RfqCandidatesView {
  candidates: RfqCandidate[];
  request: {
    quantity: number | null;
    unit: StockUnit | null;
    targetDate: string | null;
    note: string;
  };
}

function stockUnitOf(value: unknown): StockUnit {
  return value === 'kg' ? 'kg' : 'm';
}

export function rfqCandidatesView(call: AssistantToolCall): RfqCandidatesView {
  const out = asObject(call.output);
  const request = asObject(out.request);
  const unit = request.unit === 'kg' || request.unit === 'm' ? request.unit : null;

  const candidates = asArray(out.candidates)
    .map((item) => {
      const c = asObject(item);
      const stockUnit = stockUnitOf(c.stockUnit);
      const gsm = asNumber(c.weightGsm);
      const width = asNumber(c.widthCm);
      const stock = asNumber(c.stock);
      const summary = [
        categoryLabel(asText(c.type), asText(c.subtype)),
        asText(c.content),
        // İplikte gramaj ve en 0 gelir; yazılmaz.
        gsm != null && gsm > 0 ? `${formatNumber(gsm, 0)} gr/m²` : null,
        width != null && width > 0 ? `${formatNumber(width, 0)} cm` : null,
        stock != null ? `${formatNumber(stock, 0)} ${STOCK_UNIT_LABELS[stockUnit].short}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      return {
        id: asText(c.id),
        code: asText(c.code) || tr('Ürün'),
        companyId: asText(c.companyId),
        companyName: asText(c.companyName) || tr('Firma'),
        verified: c.verification === 'dogrulanmis',
        type: asText(c.type),
        stockUnit,
        summary,
      };
    })
    // Kimliksiz aday seçilemez (forma taşınamaz), hiç gösterilmez.
    .filter((c) => !!c.id && !!c.companyId);

  return {
    candidates,
    request: {
      quantity: asNumber(request.quantity),
      unit,
      targetDate: asText(request.targetDate) || null,
      note: asText(request.note),
    },
  };
}

export interface RfqSummaryView {
  rfqId: string;
  title: string;
  requestCount: number;
  quotedCount: number;
}

export function rfqSummaryView(call: AssistantToolCall): RfqSummaryView | null {
  const out = asObject(call.output);
  const rfqId = asText(out.rfqId);
  if (!rfqId) return null;
  return {
    rfqId,
    title: asText(out.title) || tr('Teklif karşılaştırması'),
    requestCount: asNumber(out.requestCount) ?? 0,
    quotedCount: asNumber(out.quotedCount) ?? 0,
  };
}
