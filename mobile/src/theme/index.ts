// Takyon tasarım dili — 2026-09-22 onaylı tasarım sistemi (DESIGN.md, design/tokens.json).
// Kaynak token'lar theme/tokens.ts'te; temaya duyarlı ekranlar `useTheme()` kullanır.
// Aşağıdaki ESKİ adlar geçiş köprüsüdür: değerleri yeni açık temanın token'larına eşlendi,
// böylece henüz taşınmamış ekranlar da yeni renklerle çizilir. Yeni kodda kullanılmaz.
// Önceki dil: C · Pazar Masası (kullanıcı onayı 2026-09-14).
// Taslaklar: docs/tasarim-yonleri/, karar ve gerekçe: docs/yapilacaklar.md.
// Yoğun, bilgi önde B2B düzen: lacivert üst bant, beyaz yüzeyler gri zemin
// üzerinde, ince çizgiler, 6px köşeler, kod ve ölçüler eşit aralıklı yazıyla.
//
// Token ADLARI bilinçli olarak eski tasarımdakiyle aynı; yalnızca değerler
// değişti, böylece ekranlar mekanik olarak yeni dile geçti.
export const colors = {
  background: '#f6f4f0', // surface-0
  surface: '#FFFFFF',
  // Giriş alanları ve seçili olmayan çiplerin zemini.
  surfaceTonal: '#eeebe5', // surface-2
  primary: '#1f3a5f', // brand / surface-brand
  accent: '#1f3a5f', // bağlantı ve vurgu artık marka lacivertinde (DESIGN.md: tek vurgu rengi bakır, yalnızca rozette)
  accentSoft: '#e4ebf5', // brand-soft
  primaryText: '#FFFFFF',
  text: '#1a1f26', // ink
  textMuted: '#4b5563', // ink-2
  border: '#ddd8d0', // line
  // Liste satırları arasındaki çizgi; kenarlıktan bir ton açık.
  divider: '#ddd8d0', // line
  danger: '#b3261e',
  dangerSoft: '#fbe5e3', // satır içi hata şeridi, hata ekranı ikon zemini
  // Yükleniyor iskeleti (docs/tasarim-yonleri/CYukleniyor.dc.html):
  // görsel/başlık kemikleri koyu, ikincil satırlar açık ton.
  skeleton: '#eeebe5', // surface-2
  skeletonSoft: '#f3f1ec',
  success: '#1e7a46',
  successSoft: '#e3f3e9',
  warning: '#8a5a00',
  warningSoft: '#fbf0d9',
  warningDot: '#8a5a00',
  notification: '#b5562e', // accent: okunmamış sayısı, bildirim noktası
  // 5. aşama taslaklarından (docs/tasarim-yonleri/C*.dc.html):
  borderStrong: '#b8b1a6', // line-strong
  chevron: '#5f6b7a', // ink-3
  chip: '#eeebe5', // surface-2
  onPrimaryMuted: '#c9d3e0', // lacivert baloncuk içindeki saat
  // 4. aşama: beyaz satır/blok basılıyken aldığı zemin. Arka plandan
  // (`background`) bir ton koyu ki beyaz satırın üstünde fark edilsin.
  pressed: '#eeebe5', // surface-2
  // Asistan kızılı (kök boya), taslak docs/tasarim-2027/Asistan.dc.html.
  // KURAL: yalnızca asistanın kendisinin olduğu yerde kullanılır — seçili
  // "Asistan" sekme ikonu, sohbetteki asistan avatarı, gönder düğmesi ve
  // asistan rozetleri. Başka hiçbir ekranda, düğmede ya da durumda geçmez;
  // ikincil renk lacivert/mavi olarak kalır.
  assistant: '#b5562e', // accent
  assistantSoft: '#f7e9e1', // accent-soft
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
  sm: 6,
  md: 10,
  lg: 14,
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
