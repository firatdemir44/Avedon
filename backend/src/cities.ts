import { fold } from './domain/glossary/normalize';

// Türkiye'nin 81 ili (serbest metinden il ayıklamak için). Görünen ad Türkçe yazımla.
export const TR_CITIES = [
  'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara', 'Antalya', 'Ardahan', 'Artvin',
  'Aydın', 'Balıkesir', 'Bartın', 'Batman', 'Bayburt', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur',
  'Bursa', 'Çanakkale', 'Çankırı', 'Çorum', 'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan',
  'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Iğdır', 'Isparta', 'İstanbul',
  'İzmir', 'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kilis', 'Kırıkkale', 'Kırklareli',
  'Kırşehir', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Mardin', 'Mersin', 'Muğla', 'Muş',
  'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye', 'Rize', 'Sakarya', 'Samsun', 'Şanlıurfa', 'Siirt', 'Sinop',
  'Sivas', 'Şırnak', 'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat', 'Zonguldak',
] as const;

// Günlük dilde kullanılan kısa adlar → il.
const CITY_ALIASES: Record<string, string> = {
  antep: 'Gaziantep',
  maras: 'Kahramanmaraş',
  urfa: 'Şanlıurfa',
  afyon: 'Afyonkarahisar',
  izmit: 'Kocaeli',
  adapazari: 'Sakarya',
  icel: 'Mersin',
};

const BY_FOLD = new Map<string, string>([
  ...TR_CITIES.map((c) => [fold(c), c] as [string, string]),
  ...Object.entries(CITY_ALIASES),
]);

// Tek sözcükten il: "bursa", "Bursa'da" (fold sonrası "bursada"), "istanbuldan".
export function cityFromWord(word: string): string | null {
  const w = fold(word);
  if (BY_FOLD.has(w)) return BY_FOLD.get(w)!;
  const stem = w.replace(/(da|de|ta|te|dan|den|tan|ten|daki|deki)$/, '');
  if (stem.length >= 3 && stem !== w && BY_FOLD.has(stem)) return BY_FOLD.get(stem)!;
  return null;
}

// Firma şehri (serbest metin) ile istenen il aynı mı: "İSTANBUL", "istanbul / Esenyurt".
export function cityMatches(companyCity: string, city: string): boolean {
  const want = fold(city);
  if (!want) return true;
  return fold(companyCity).split(/[\s/,-]+/).includes(want) || fold(companyCity) === want;
}
