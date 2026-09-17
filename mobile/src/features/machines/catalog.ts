import type { Machine, MachineGroup } from '../../api/client';
import { formatMeasure } from '../calculators/parse';

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
  orme: 'Örme',
  dokuma: 'Dokuma',
  boya_terbiye: 'Boya - Terbiye',
  baski: 'Baskı',
  konfeksiyon: 'Konfeksiyon',
  iplik: 'İplik',
  diger: 'Diğer',
};

export function machineGroupLabel(group: string): string {
  return MACHINE_GROUP_LABELS[group as MachineGroup] ?? 'Diğer';
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
  if (diameter) parts.push(`${diameter} pus`);
  const gauge = num(machine.gauge);
  if (gauge) parts.push(`${gauge} fayn`);
  if (machine.feeders) parts.push(`${machine.feeders} sistem`);
  if (machine.needles) parts.push(`${formatMeasure(machine.needles)} iğne`);
  const width = num(machine.workingWidthCm);
  if (width) parts.push(`${width} cm en`);
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
  if (diameter) specs.push(`${diameter} pus`);
  const gauge = num(machine.gauge);
  if (gauge) specs.push(`${gauge} fayn`);
  const width = num(machine.workingWidthCm);
  if (width) specs.push(`${width} cm en`);
  return `${machine.count}× ${machine.kind}${specs.length ? ` ${specs.join(' ')}` : ''}`;
}

export function monthlyCapacityText(tons: number | null): string | null {
  return tons == null ? null : `${formatMeasure(tons)} ton`;
}

export function contractOpenLabel(open: boolean): string {
  return open ? 'Fason kapasitesi açık' : 'Fason almıyor';
}

// Gruplara göre sıralı öbekler (boş gruplar düşer).
export function groupMachines(machines: Machine[]): { group: MachineGroup; label: string; items: Machine[]; count: number }[] {
  return MACHINE_GROUP_ORDER.map((group) => {
    const items = machines.filter((m) => m.group === group);
    return { group, label: MACHINE_GROUP_LABELS[group], items, count: items.reduce((sum, m) => sum + m.count, 0) };
  }).filter((section) => section.items.length > 0);
}
