// Dünyayı Keşfet hedef ülkeleri (docs/kesfet-ihracat-plani.md §6, §9). M49 kodları UN Comtrade'in
// raportör kodlarıdır. Ticaret rejimi notları araştırmaya dayanır; "dogrulanacak" işaretliler
// uygulamada "kontrol edin" diye gösterilir. Bu liste hukuki tavsiye değildir.

export type Region = 'AB' | 'Avrupa' | 'Kuzey Amerika' | 'Latin Amerika' | 'Orta Doğu' | 'Afrika' | 'Asya';
export type Access = 'gumruk_birligi' | 'sta' | 'mfn' | 'engelli';

export interface TargetCountry {
  m49: number;
  iso2: string;
  name: string;
  region: Region;
  access: Access;
  // Firma adıyla ithalat verisi yasal olarak açık mı (alıcı listesi kalitesi için).
  buyerData: 'acik' | 'dolayli' | 'zayif';
  notes: string[];
  risk?: 'yaptirim' | 'odeme' | 'kur';
  verify?: boolean;
}

const EU_NOTE = 'Gümrük Birliği: AB\'ye sanayi ürünlerinde gümrük vergisi yok (A.TR belgesi).';
const EU_DATA = 'AB\'de firma adıyla ithalat kaydı yayımlanmaz; aday alıcılar dolaylı kanıtla önerilir.';

export const TARGET_COUNTRIES: TargetCountry[] = [
  { m49: 276, iso2: 'DE', name: 'Almanya', region: 'AB', access: 'gumruk_birligi', buyerData: 'dolayli', notes: [EU_NOTE, EU_DATA, 'Tedarik zinciri yasası (LkSG) ve AB dijital ürün pasaportu: pasaportu dolu tedarikçi avantajlı.'] },
  { m49: 380, iso2: 'IT', name: 'İtalya', region: 'AB', access: 'gumruk_birligi', buyerData: 'dolayli', notes: [EU_NOTE, EU_DATA] },
  { m49: 724, iso2: 'ES', name: 'İspanya', region: 'AB', access: 'gumruk_birligi', buyerData: 'dolayli', notes: [EU_NOTE, EU_DATA] },
  { m49: 528, iso2: 'NL', name: 'Hollanda', region: 'AB', access: 'gumruk_birligi', buyerData: 'dolayli', notes: [EU_NOTE, EU_DATA] },
  { m49: 56, iso2: 'BE', name: 'Belçika', region: 'AB', access: 'gumruk_birligi', buyerData: 'dolayli', notes: [EU_NOTE, EU_DATA] },
  { m49: 251, iso2: 'FR', name: 'Fransa', region: 'AB', access: 'gumruk_birligi', buyerData: 'dolayli', notes: [EU_NOTE, EU_DATA] },
  { m49: 616, iso2: 'PL', name: 'Polonya', region: 'AB', access: 'gumruk_birligi', buyerData: 'dolayli', notes: [EU_NOTE, EU_DATA] },
  { m49: 620, iso2: 'PT', name: 'Portekiz', region: 'AB', access: 'gumruk_birligi', buyerData: 'dolayli', notes: [EU_NOTE, EU_DATA] },
  { m49: 642, iso2: 'RO', name: 'Romanya', region: 'AB', access: 'gumruk_birligi', buyerData: 'dolayli', notes: [EU_NOTE, EU_DATA] },
  { m49: 826, iso2: 'GB', name: 'Birleşik Krallık', region: 'Avrupa', access: 'sta', buyerData: 'dolayli', notes: ['Türkiye-Birleşik Krallık STA yürürlükte.'] },
  { m49: 842, iso2: 'US', name: 'ABD', region: 'Kuzey Amerika', access: 'mfn', buyerData: 'acik', notes: ['Deniz konşimentoları firma adıyla açık: gerçek ithalatçı listesi çıkarılabilir.', 'MFN vergisi + ek vergi (Türkiye için güncel oran kontrol edilmeli).'], verify: true },
  { m49: 124, iso2: 'CA', name: 'Kanada', region: 'Kuzey Amerika', access: 'mfn', buyerData: 'zayif', notes: ['STA yok; MFN vergisi.'] },
  { m49: 484, iso2: 'MX', name: 'Meksika', region: 'Latin Amerika', access: 'mfn', buyerData: 'acik', notes: ['2026\'da STA\'sız ülkelere tekstilde ~%35\'e varan vergi.', 'USMCA "iplikten itibaren" kuralı: Türk kumaşıyla dikilen giysi ABD\'ye gümrüksüz giremez.'], verify: true },
  { m49: 170, iso2: 'CO', name: 'Kolombiya', region: 'Latin Amerika', access: 'mfn', buyerData: 'acik', notes: ['Gümrük beyannameleri firma adıyla açık.', 'Colombiatex fuarı.'], verify: true },
  { m49: 604, iso2: 'PE', name: 'Peru', region: 'Latin Amerika', access: 'mfn', buyerData: 'acik', notes: ['Gümrük beyannameleri firma adıyla açık.'], verify: true },
  { m49: 152, iso2: 'CL', name: 'Şili', region: 'Latin Amerika', access: 'sta', buyerData: 'acik', notes: ['Türkiye-Şili STA (2011).'], verify: true },
  { m49: 76, iso2: 'BR', name: 'Brezilya', region: 'Latin Amerika', access: 'mfn', buyerData: 'dolayli', notes: ['Mercosur dış tarifesi yüksek; kur riski.'], risk: 'kur' },
  { m49: 784, iso2: 'AE', name: 'BAE', region: 'Orta Doğu', access: 'sta', buyerData: 'zayif', notes: ['Türkiye-BAE Kapsamlı Ekonomik Ortaklık Anlaşması yürürlükte.', 'Dubai: Körfez, Afrika ve İran\'a yeniden ihracat merkezi.'] },
  { m49: 682, iso2: 'SA', name: 'Suudi Arabistan', region: 'Orta Doğu', access: 'mfn', buyerData: 'zayif', notes: ['Körfez İşbirliği Konseyi ile STA müzakeresi sürüyor.'] },
  { m49: 634, iso2: 'QA', name: 'Katar', region: 'Orta Doğu', access: 'sta', buyerData: 'zayif', notes: ['Türkiye-Katar STA.'] },
  { m49: 414, iso2: 'KW', name: 'Kuveyt', region: 'Orta Doğu', access: 'mfn', buyerData: 'zayif', notes: [] },
  { m49: 368, iso2: 'IQ', name: 'Irak', region: 'Orta Doğu', access: 'mfn', buyerData: 'zayif', notes: ['Kara yolu avantajı; güçlü mevcut talep.'], risk: 'odeme' },
  { m49: 400, iso2: 'JO', name: 'Ürdün', region: 'Orta Doğu', access: 'mfn', buyerData: 'zayif', notes: ['STA 2018\'de Ürdün tarafından feshedildi; Türk mallarına yüksek vergi.'] },
  { m49: 818, iso2: 'EG', name: 'Mısır', region: 'Afrika', access: 'sta', buyerData: 'zayif', notes: ['Türkiye-Mısır STA.', 'Türk yatırımlı konfeksiyon fabrikaları: kumaş ve iplik talebi hızla büyüyor.'], risk: 'odeme' },
  { m49: 504, iso2: 'MA', name: 'Fas', region: 'Afrika', access: 'sta', buyerData: 'zayif', notes: ['Türkiye-Fas STA; tekstilde ek vergi uygulaması olabilir (güncel oran kontrol edilmeli).', 'AB\'ye yakın konfeksiyon üssü.'], verify: true },
  { m49: 788, iso2: 'TN', name: 'Tunus', region: 'Afrika', access: 'sta', buyerData: 'zayif', notes: ['Türkiye-Tunus STA; ek vergi olabilir (kontrol edilmeli).'], verify: true },
  { m49: 12, iso2: 'DZ', name: 'Cezayir', region: 'Afrika', access: 'mfn', buyerData: 'zayif', notes: ['İthalat kısıtlamaları var.'] },
  { m49: 710, iso2: 'ZA', name: 'Güney Afrika', region: 'Afrika', access: 'mfn', buyerData: 'zayif', notes: [] },
  { m49: 404, iso2: 'KE', name: 'Kenya', region: 'Afrika', access: 'mfn', buyerData: 'zayif', notes: ['AGOA: Türk kumaşıyla Kenya\'da dikilen giysi ABD\'ye gümrüksüz girebilir (üçüncü ülke kumaşı kuralı).'], verify: true },
  { m49: 231, iso2: 'ET', name: 'Etiyopya', region: 'Afrika', access: 'mfn', buyerData: 'zayif', notes: ['AGOA durumu kontrol edilmeli.'], verify: true },
  { m49: 566, iso2: 'NG', name: 'Nijerya', region: 'Afrika', access: 'mfn', buyerData: 'zayif', notes: ['Bazı tekstil ithalatı kısıtlı; kur ve ödeme riski.'], risk: 'odeme', verify: true },
  { m49: 586, iso2: 'PK', name: 'Pakistan', region: 'Asya', access: 'mfn', buyerData: 'acik', notes: [] },
  { m49: 50, iso2: 'BD', name: 'Bangladeş', region: 'Asya', access: 'mfn', buyerData: 'acik', notes: ['Hazır giyim üretim üssü: elastanlı sentetik kumaş talebi.'] },
  { m49: 860, iso2: 'UZ', name: 'Özbekistan', region: 'Asya', access: 'mfn', buyerData: 'acik', notes: [] },
  { m49: 398, iso2: 'KZ', name: 'Kazakistan', region: 'Asya', access: 'mfn', buyerData: 'acik', notes: [] },
  { m49: 268, iso2: 'GE', name: 'Gürcistan', region: 'Asya', access: 'sta', buyerData: 'zayif', notes: ['Türkiye-Gürcistan STA.'] },
  // Engelliler: listede gösterilir ama puanlanmaz; kullanıcıya neden engellendiği söylenir.
  { m49: 376, iso2: 'IL', name: 'İsrail', region: 'Orta Doğu', access: 'engelli', buyerData: 'zayif', notes: ['Türkiye ile ticaret Mayıs 2024\'ten beri tamamen askıda.'], risk: 'yaptirim' },
  { m49: 364, iso2: 'IR', name: 'İran', region: 'Orta Doğu', access: 'engelli', buyerData: 'zayif', notes: ['ABD ikincil yaptırım ve ödeme riski; platform eşleştirme yapmaz.'], risk: 'yaptirim' },
];

export const TURKEY_M49 = 792;
export const CHINA_M49 = 156;
export const countryByM49 = (m: number) => TARGET_COUNTRIES.find((c) => c.m49 === m);
export const countryByIso2 = (iso2: string) => TARGET_COUNTRIES.find((c) => c.iso2 === iso2);
