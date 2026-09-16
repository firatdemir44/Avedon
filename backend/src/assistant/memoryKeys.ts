// Firma hafızası anahtarları (yol haritası §5, Faz 1 planı Adım 5). Asistan bu
// değerleri hesaplara VARSAYILAN olarak önerir; yazma yalnızca kullanıcı
// onayıyla. Etiketler sunucudan döner ki mobil ayrı liste tutmasın.
export interface MemoryKeyDef {
  key: string;
  label: string;
  // Asistan ve ekran için: değerin ne olduğu, birimi.
  hint: string;
  kind: 'number' | 'text' | 'list';
  // Ekranda boş alanın yanında gösterilen önerilen başlangıç (Fırat 2026-09-16).
  // Hesaba OTOMATİK girmez; kullanıcı kaydederse kullanılır.
  suggested?: number;
}

export const MEMORY_KEYS: readonly MemoryKeyDef[] = [
  { key: 'defaultCurrency', label: 'Varsayılan para birimi', hint: 'TRY, USD ya da EUR', kind: 'text' },
  { key: 'usdTry', label: 'USD/TRY kuru', hint: 'Hesaplarda kullanılan kur', kind: 'number' },
  { key: 'eurTry', label: 'EUR/TRY kuru', hint: 'Hesaplarda kullanılan kur', kind: 'number' },
  { key: 'knittingFeePerKg', label: 'Örme fason ücreti', hint: 'TRY/kg', kind: 'number' },
  { key: 'dyeingFeePerKg', label: 'Boya fason ücreti', hint: 'TRY/kg, ham kilo üzerinden', kind: 'number' },
  { key: 'dyeingLossPercent', label: 'Boya firesi', hint: '%', kind: 'number' },
  { key: 'yarnWastagePercent', label: 'İplik firesi', hint: '%, maliyet hesabında iplik fiyatına eklenir', kind: 'number' },
  { key: 'knittingLossPercent', label: 'Örme firesi', hint: '%, iplikten ham kumaşa kayıp', kind: 'number' },
  { key: 'cuttingLossPercent', label: 'Kesim firesi', hint: '%, mamul kumaştan dikilmiş ürüne kayıp', kind: 'number' },
  { key: 'efficiencyPercent', label: 'Randıman', hint: '%, örme makinesi', kind: 'number', suggested: 85 },
  { key: 'hoursPerDay', label: 'Günlük çalışma süresi', hint: 'saat, molalar düşülmüş', kind: 'number', suggested: 20 },
  { key: 'machineCount', label: 'Makine adedi', hint: 'aynı ayarda çalışan makine sayısı', kind: 'number', suggested: 1 },
  { key: 'overheadPercent', label: 'Genel gider oranı', hint: '%', kind: 'number' },
  { key: 'profitPercent', label: 'Kâr oranı', hint: '%', kind: 'number' },
  { key: 'frequentQualities', label: 'Sık çalışılan kaliteler', hint: 'Kısa liste, ör. "süprem 30/1 penye; ribana 20/1"', kind: 'list' },
];

export const MEMORY_KEY_SET = new Set(MEMORY_KEYS.map((k) => k.key));

export function memoryKeyDef(key: string) {
  return MEMORY_KEYS.find((k) => k.key === key) ?? null;
}
