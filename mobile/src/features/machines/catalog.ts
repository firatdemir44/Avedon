import type { Machine, MachineGroup } from '../../api/client';
import { formatMeasure } from '../calculators/parse';
import { rangeDisplay } from './range';
import { tr } from '../../i18n';

// Faz 2, Adım 5: makine parkı. Grup etiketleri ve makine satırı özetleri tek
// yerde; hem firma sayfası, hem yönetim ekranı, hem de kapasite arama sonuçları
// aynı metni üretir. Makine TÜRÜ serbest metindir (Fırat 2026-09-17), bu yüzden
// burada tür listesi yok: öneriler sunucudan (`fetchMachineKinds`) gelir.

export const MACHINE_GROUP_ORDER: MachineGroup[] = [
  'orme',
  'dokuma',
  'boya_terbiye',
  'baski',
  'konfeksiyon',
  'iplik',
  'diger',
];

export const MACHINE_GROUP_LABELS: Record<MachineGroup, string> = {
  get orme() {
    return tr('Örme');
  },
  get dokuma() {
    return tr('Dokuma');
  },
  get boya_terbiye() {
    return tr('Boya - Terbiye');
  },
  get baski() {
    return tr('Baskı');
  },
  get konfeksiyon() {
    return tr('Konfeksiyon');
  },
  get iplik() {
    return tr('İplik');
  },
  get diger() {
    return tr('Diğer');
  },
};

export function machineGroupLabel(group: string): string {
  return MACHINE_GROUP_LABELS[group as MachineGroup] ?? tr('Diğer');
}

// Örme makinelerinde pus/fayn/sistem/iğne anlamlı; dokuma, boya ve baskıda
// çalışma eni. Form da bu ayrımı kullanıyor (gereksiz alan sorulmuyor).
export function groupHasKnitFields(group: MachineGroup): boolean {
  return group === 'orme';
}

export function groupHasWidthField(group: MachineGroup): boolean {
  return group === 'dokuma' || group === 'boya_terbiye' || group === 'baski';
}

// Özellik alanının öneri çipleri (bağlayıcı değil, kullanıcı istediğini yazar).
export const FEATURE_SUGGESTIONS: Record<MachineGroup, string[]> = {
  orme: ['tek plaka', 'çift plaka', 'jakar', 'havlu', 'polar'],
  dokuma: ['armürlü', 'jakarlı', 'kadife'],
  boya_terbiye: ['HT', 'atmosferik', 'numune', 'kontinü'],
  baski: ['pigment', 'dispers', 'reaktif'],
  konfeksiyon: ['otomatik', 'programlı'],
  iplik: ['penye', 'karde', 'open end'],
  diger: [],
};

const num = (value: number | null) => (value == null ? null : formatMeasure(value));

// Makine satırının alt özeti: yalnızca dolu alanlar.
// "30 pus · 28 fayn · 96 sistem · Mayer Relanit · 2019 · tek plaka"
export function machineSummary(machine: Machine): string {
  const parts: string[] = [];
  const diameter = num(machine.diameterInch);
  if (diameter) parts.push(tr('{n} pus', { n: diameter }));
  const gauge = rangeDisplay(machine.gaugeText, machine.gauge);
  if (gauge) parts.push(tr('{n} fayn', { n: gauge }));
  if (machine.feeders) parts.push(tr('{n} sistem', { n: machine.feeders }));
  const needles = rangeDisplay(machine.needlesText, machine.needles);
  if (needles) parts.push(tr('{n} iğne', { n: needles }));
  const width = num(machine.workingWidthCm);
  if (width) parts.push(tr('{n} cm en', { n: width }));
  const brandModel = [machine.brand, machine.model].filter(Boolean).join(' ');
  if (brandModel) parts.push(brandModel);
  if (machine.year) parts.push(String(machine.year));
  if (machine.feature) parts.push(machine.feature);
  return parts.join(' · ');
}

// Arama sonucundaki tek satır özet: "6× Yuvarlak örme (süprem) 30 pus 28 fayn".
export function machineOneLine(machine: Machine): string {
  const specs: string[] = [];
  const diameter = num(machine.diameterInch);
  if (diameter) specs.push(tr('{n} pus', { n: diameter }));
  const gauge = num(machine.gauge);
  if (gauge) specs.push(tr('{n} fayn', { n: gauge }));
  const width = num(machine.workingWidthCm);
  if (width) specs.push(tr('{n} cm en', { n: width }));
  return `${machine.count}× ${machine.kind}${specs.length ? ` ${specs.join(' ')}` : ''}`;
}

export function monthlyCapacityText(tons: number | null): string | null {
  return tons == null ? null : tr('{n} ton', { n: formatMeasure(tons) });
}

export function contractOpenLabel(open: boolean): string {
  return open ? tr('Fason kapasitesi açık') : tr('Fason almıyor');
}

// Kart başlığındaki tür adı (sunucudaki machines/query.ts ile aynı kural):
// serbest türden Yuvarlak örme / Raschel / Düz örme / Dokuma; eşleşmezse türün kendisi.
function foldTr(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/â/g, 'a');
}

export function machineTypeLabel(machine: { kind: string; group: string }): string {
  const key = foldTr(machine.kind);
  if (key.includes('yuvarlak')) return tr('Yuvarlak örme');
  if (key.includes('raschel') || key.includes('rasel')) return 'Raschel';
  if (key.includes('duz orme')) return tr('Düz örme');
  if (machine.group === 'dokuma') return tr('Dokuma');
  return machine.kind;
}

// Kart başlığı: "Raschel · Karl Mayer RSE 4". Tür adı serbest türden farklıysa
// (ör. "Yuvarlak örme (süprem)") ayrıntı alt satırda gösterilir.
export function machineCardTitle(machine: { kind: string; group: string; brand: string; model: string }): {
  title: string;
  kindDetail: string | null;
} {
  const type = machineTypeLabel(machine);
  const brandModel = [machine.brand, machine.model].filter(Boolean).join(' ');
  return {
    title: brandModel ? `${type} · ${brandModel}` : type,
    kindDetail: type !== machine.kind ? machine.kind : null,
  };
}

// Kartın mono-14 değerleri: yalnızca dolu olanlar.
export function machineSpecRows(
  machine: Pick<Machine, 'diameterInch' | 'gauge' | 'feeders' | 'needles' | 'count' | 'dailyCapacityKg'> &
    Partial<Pick<Machine, 'workingWidthCm' | 'machineNo' | 'gaugeText' | 'needlesText'>>
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (machine.machineNo != null) rows.push({ label: tr('No'), value: String(machine.machineNo) });
  if (machine.diameterInch != null) rows.push({ label: tr('Çap'), value: tr('{n} inç', { n: formatMeasure(machine.diameterInch) }) });
  if (machine.gauge != null || machine.gaugeText) rows.push({ label: tr('Fine'), value: rangeDisplay(machine.gaugeText, machine.gauge) });
  if (machine.feeders != null) rows.push({ label: tr('Sistem'), value: String(machine.feeders) });
  if (machine.needles != null || machine.needlesText) rows.push({ label: tr('İğne'), value: rangeDisplay(machine.needlesText, machine.needles) });
  if (machine.workingWidthCm != null) rows.push({ label: tr('Çalışma eni'), value: `${formatMeasure(machine.workingWidthCm)} cm` });
  rows.push({ label: tr('Adet'), value: String(machine.count) });
  if (machine.dailyCapacityKg != null) rows.push({ label: tr('Günlük kapasite'), value: `${formatMeasure(machine.dailyCapacityKg)} kg` });
  return rows;
}

// Gruplara göre sıralı öbekler (boş gruplar düşer).
export function groupMachines(machines: Machine[]): { group: MachineGroup; label: string; items: Machine[]; count: number }[] {
  return MACHINE_GROUP_ORDER.map((group) => {
    const items = machines.filter((m) => m.group === group);
    return { group, label: MACHINE_GROUP_LABELS[group], items, count: items.reduce((sum, m) => sum + m.count, 0) };
  }).filter((section) => section.items.length > 0);
}
