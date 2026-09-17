import type { AssistantToolCall } from '../../api/client';
import { categoryLabel } from '../products/catalog';
import { certificateLabel, formatComposition, widthTypeLabel } from '../products/glossaryLabels';

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
  return n.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
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
      label: asText(p.code) || 'Ürün',
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
      pushMoney(rows, 'İplik', out.yarnCostPerKg);
      pushMoney(rows, 'Ham maliyet', out.greigeCostPerKg);
      pushMoney(rows, 'Ham satış', out.greigeSalePerKg);
      pushMoney(rows, 'Boyalı maliyet', out.dyedCostPerKg);
      pushMoney(rows, 'Boyalı satış', out.dyedSalePerKg, true);
      pushNumber(rows, 'Metre / kg', out.metersPerKg, 'm');
      return { ...base, unit: 'kg başına', rows, text: rows.length ? undefined : call.summary };
    }
    case 'yarnCount':
    case 'yarnCountFromSample': {
      for (const unit of YARN_UNIT_LABELS) pushNumber(rows, unit.label, out[unit.key], '', unit.digits);
      return { ...base, rows, text: rows.length ? undefined : call.summary };
    }
    case 'fabricLengthWeight': {
      pushNumber(rows, 'Hesap eni', out.effectiveWidthCm, 'cm', 0);
      pushNumber(rows, '1 kilo', out.metersPerKg, 'm');
      pushNumber(rows, '1 metre', out.kgPerMeter, 'kg', 3);
      pushNumber(rows, 'Hesaplanan kilo', out.kg, 'kg', 1);
      pushNumber(rows, 'Hesaplanan metre', out.meters, 'm', 1);
      if (rows.length) rows[rows.length - 1].strong = true;
      return { ...base, rows, text: rows.length ? undefined : call.summary };
    }
    case 'yarnUsage': {
      pushNumber(rows, 'Gereken iplik', out.yarnKg, 'kg', 1);
      pushNumber(rows, '1 metre', out.kgPerMeter, 'kg', 3);
      pushNumber(rows, '1 kilo', out.metersPerKg, 'm');
      if (rows.length) rows[0].strong = true;
      return { ...base, rows, text: rows.length ? undefined : call.summary };
    }
    case 'knitProduction': {
      pushNumber(rows, 'Saatlik üretim', out.kgPerHour, 'kg', 1);
      pushNumber(rows, 'Günlük üretim', out.kgPerDay, 'kg', 1);
      const machines = asNumber(out.machineCount);
      if (machines != null && machines > 1) {
        pushNumber(rows, `Makine başına (${formatNumber(machines, 0)} makine)`, out.perMachineKgPerDay, 'kg/gün', 1);
      }
      const feedRows = asArray(asObject(call.input).rows);
      asArray(out.percents).forEach((p, index) => {
        const n = asNumber(p);
        if (n == null) return;
        const label = asText(asObject(feedRows[index]).label) || `${index + 1}. iplik`;
        rows.push({ label: `${label} payı`, value: `%${formatNumber(n, 1)}` });
      });
      pushNumber(rows, 'Günlük fason geliri', out.dailyFeeIncome, '₺', 0);
      if (rows.length > 1) rows[1].strong = true;
      return { ...base, rows, text: rows.length ? undefined : call.summary };
    }
    case 'yarnUsageRatio': {
      const feedRows = asArray(asObject(call.input).rows);
      asArray(out.percents).forEach((p, index) => {
        const n = asNumber(p);
        if (n == null) return;
        const row = asObject(feedRows[index]);
        const label = asText(row.label) || `${formatNumber(row.count, 0)} ${asText(row.system)}`.trim() || `${index + 1}. iplik`;
        rows.push({ label, value: `%${formatNumber(n, 1)}` });
      });
      return { ...base, rows, text: rows.length ? undefined : call.summary };
    }
    case 'fabricGsmSample':
    case 'fabricGsmKnit': {
      pushNumber(rows, 'Gramaj', out.gsm, 'gr/m²', 1);
      pushNumber(rows, 'Tahmini mamul gramaj', out.estimatedFinishedGsm, 'gr/m²', 1);
      pushNumber(rows, 'Ölçülen mamul gramaj', out.measuredFinishedGsm, 'gr/m²', 1);
      pushNumber(rows, 'Sapma', out.deviationPercent, '%', 1);
      pushNumber(rows, 'İlmek boyu', out.loopLengthMm, 'mm', 2);
      pushNumber(rows, 'İplik', out.yarnTex, 'tex', 1);
      if (rows.length) rows[0].strong = true;
      return { ...base, rows, text: rows.length ? undefined : call.summary };
    }
    case 'yarnRequirement': {
      pushNumber(rows, 'Dikilmiş üründe kumaş', out.garmentFabricKg, 'kg', 1);
      pushNumber(rows, 'Mamul kumaş', out.finishedKg, 'kg', 1);
      pushNumber(rows, 'Ham kumaş', out.greigeKg, 'kg', 1);
      pushNumber(rows, 'Alınacak iplik', out.yarnKg, 'kg', 1);
      if (rows.length) rows[rows.length - 1].strong = true;
      return { ...base, unit: 'kg', rows, text: rows.length ? undefined : call.summary };
    }
    case 'garmentCost': {
      const currency = asText(asObject(call.input).currency) || 'TRY';
      pushNumber(rows, 'Kumaş', out.fabricCost, '', 2);
      for (const item of asArray(out.items)) {
        const o = asObject(item);
        const amount = asNumber(o.amount);
        if (amount == null || amount === 0) continue;
        rows.push({ label: asText(o.label) || asText(o.key), value: formatNumber(amount) });
      }
      pushNumber(rows, 'Adet maliyeti', out.totalCost, '', 2);
      pushNumber(rows, 'Sipariş toplamı', out.orderTotal, '', 2);
      if (rows.length) rows[rows.length - 1].strong = true;
      return { ...base, unit: `${currency} / adet`, rows, text: rows.length ? undefined : call.summary };
    }
    case 'katalog_ara': {
      const productRows = catalogRows(call.output);
      return {
        ...base,
        unit: productRows.length ? `${productRows.length} ürün` : undefined,
        rows: productRows,
        text: productRows.length ? undefined : call.summary,
      };
    }
    case 'pasaport_cikar': {
      for (const [field, label] of Object.entries(PASSPORT_FIELD_LABELS)) {
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
