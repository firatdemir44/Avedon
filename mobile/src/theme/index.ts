// Avedon tasarım dili: C · Pazar Masası (kullanıcı onayı 2026-09-14).
// Taslaklar: docs/tasarim-yonleri/, karar ve gerekçe: docs/yapilacaklar.md.
// Yoğun, bilgi önde B2B düzen: lacivert üst bant, beyaz yüzeyler gri zemin
// üzerinde, ince çizgiler, 6px köşeler, kod ve ölçüler eşit aralıklı yazıyla.
//
// Token ADLARI bilinçli olarak eski tasarımdakiyle aynı; yalnızca değerler
// değişti, böylece ekranlar mekanik olarak yeni dile geçti.
export const colors = {
  background: '#EEF1F4',
  surface: '#FFFFFF',
  // Giriş alanları ve seçili olmayan çiplerin zemini.
  surfaceTonal: '#F3F5F7',
  primary: '#133C5F', // lacivert: üst bant, birincil düğmeler, kodlar
  accent: '#2696C6', // mavi: bağlantılar, firma adları, vurgu
  accentSoft: '#E4F2F9',
  primaryText: '#FFFFFF',
  text: '#111A22',
  textMuted: '#5B6672',
  border: '#DCE2E8',
  // Liste satırları arasındaki çizgi; kenarlıktan bir ton açık.
  divider: '#E6EBF0',
  danger: '#B3261E',
  dangerSoft: '#FBEAE9', // satır içi hata şeridi, hata ekranı ikon zemini
  // Yükleniyor iskeleti (docs/tasarim-yonleri/CYukleniyor.dc.html):
  // görsel/başlık kemikleri koyu, ikincil satırlar açık ton.
  skeleton: '#E3E8ED',
  skeletonSoft: '#EDF1F4',
  success: '#2E7D4F', // stokta
  successSoft: '#E6F2EB',
  warning: '#8A5A00', // az stok, bekleyen adım
  warningSoft: '#FFF4D6',
  warningDot: '#B7791F', // az stok noktası (yazısı `warning`)
  notification: '#C8372D', // okunmamış sayısı
  // 5. aşama taslaklarından (docs/tasarim-yonleri/C*.dc.html):
  borderStrong: '#C3CCD5', // çerçeveli düğme, bekleyen takip adımı
  chevron: '#8C97A2', // satır sonundaki ok
  chip: '#E1E6EB', // sohbetteki "Bugün" gibi tarih çipi
  onPrimaryMuted: '#B7C7D6', // lacivert baloncuk içindeki saat
  // 4. aşama: beyaz satır/blok basılıyken aldığı zemin. Arka plandan
  // (`background`) bir ton koyu ki beyaz satırın üstünde fark edilsin.
  pressed: '#E4E9EE',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  // Yeni düzende satırların ve blokların yatay iç boşluğu (taslaklarda 14px).
  gutter: 14,
  // Beyaz bloklar arasındaki gri aralık.
  blockGap: 8,
};

// Yeni dilde butonlar, giriş alanları ve kartlar 6px köşeli; hap biçimi
// (pill) yalnızca gerçekten yuvarlak işaretler için (okunmamış sayısı, nokta).
export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  pill: 999,
};

// IBM Plex Sans (metin) + IBM Plex Mono (kod, ölçü, saat, tarih). Adlar
// App.tsx'teki useFonts anahtarlarıyla birebir aynı olmalı.
// Özel yazı tipinde kalınlık fontWeight ile DEĞİL ayrı dosyayla seçilir:
// Android fontWeight'i sahte kalınlaştırır, iOS aileyi bulamayıp sistem
// yazı tipine dönebilir. Bu yüzden stillerde fontWeight kullanılmıyor.
export const fonts = {
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold',
  bold: 'IBMPlexSans_700Bold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoSemibold: 'IBMPlexMono_600SemiBold',
} as const;

// 2026-09-15 kullanıcı telefonda "yazı küçük" dedi: taslaktaki ölçek (gövde 14)
// her basamakta ~2px büyütüldü (gövde 16, telefonların varsayılan metin boyu).
export const typography = {
  title: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 30 },
  heading: { fontFamily: fonts.semibold, fontSize: 19, lineHeight: 25 },
  subtitle: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 23 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 23 },
  label: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  // Ürün kodları, gramaj/en/stok, saat ve tarih.
  mono: { fontFamily: fonts.mono, fontSize: 15, lineHeight: 21 },
  monoStrong: { fontFamily: fonts.monoSemibold, fontSize: 17, lineHeight: 23 },
} as const;

// Dokunulabilir her şeyin en küçük yüksekliği (Apple 44pt). Yoğun düzende
// 48'den 44'e indi; alt sınırın altına inilmiyor.
export const MIN_TOUCH = 44;

// Yeni dilde yüzeyler gölgesiz: gri zemin üstünde beyaz bloklar ve ince
// çizgiler. Token, kullanan ekranlar bozulmasın diye etkisiz değerlerle duruyor.
export const shadow = {
  card: {
    shadowColor: '#0B2233',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
} as const;
