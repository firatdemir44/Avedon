// Onaylı tasarım sistemi token'ları (DESIGN.md, design/tokens.json; 2026-09-22).
// KAYNAK: design/tokens.json. Buradaki değerler oradan elle aktarılır; bir değer değişecekse
// önce tokens.json/tokens.css, sonra burası. Adlar CSS değişkenleriyle aynı (surface-0 → surface0).
// Uygulama React Native (Expo) olduğu için CSS değişkenleri doğrudan kullanılamaz; ekranlar
// `useTheme()` ile temaya göre bu nesneleri alır.

export type ThemeName = 'light' | 'dark';

export interface ColorTokens {
  surface0: string;
  surface1: string;
  surface2: string;
  surfaceBrand: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  lineStrong: string;
  brand: string;
  brandStrong: string;
  brandSoft: string;
  onBrand: string;
  accent: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  focus: string;
  overlay: string;
}

export const colorTokens: Record<ThemeName, ColorTokens> = {
  light: {
    surface0: '#f6f4f0',
    surface1: '#ffffff',
    surface2: '#eeebe5',
    surfaceBrand: '#1f3a5f',
    ink: '#1a1f26',
    ink2: '#4b5563',
    ink3: '#5f6b7a',
    line: '#ddd8d0',
    lineStrong: '#b8b1a6',
    brand: '#1f3a5f',
    brandStrong: '#162b47',
    brandSoft: '#e4ebf5',
    onBrand: '#ffffff',
    accent: '#b5562e',
    accentSoft: '#f7e9e1',
    success: '#1e7a46',
    successSoft: '#e3f3e9',
    warning: '#8a5a00',
    warningSoft: '#fbf0d9',
    danger: '#b3261e',
    dangerSoft: '#fbe5e3',
    focus: '#3d6fb5',
    overlay: '#1a1f2699',
  },
  dark: {
    surface0: '#12161c',
    surface1: '#1a2028',
    surface2: '#232a34',
    surfaceBrand: '#16273f',
    ink: '#edf0f4',
    ink2: '#a8b3c2',
    ink3: '#8a96a6',
    line: '#2c3540',
    lineStrong: '#3f4a58',
    brand: '#3d6fb5',
    brandStrong: '#2f5a96',
    brandSoft: '#1e2c40',
    onBrand: '#ffffff',
    accent: '#e0895f',
    accentSoft: '#3a2a22',
    success: '#4fbf7e',
    successSoft: '#17302a',
    warning: '#e0a83a',
    warningSoft: '#362c18',
    danger: '#f08a82',
    dangerSoft: '#3a1f1e',
    focus: '#7fabe6',
    overlay: '#000000b3',
  },
};

// Boşluk (4px ızgara)
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 } as const;

// Köşe
export const radiusTokens = { sm: 6, md: 10, lg: 14, full: 999 } as const;

// Ölçüler
export const size = {
  touchMin: 44,
  control: 48,
  controlLg: 52,
  icon: 24,
  iconSm: 20,
  avatar: 40,
  thumb: 72,
  appbar: 56,
  tabbar: 64,
  row: 64,
  pageWidth: 375,
  // Büyük ekranda içerik bu genişliğe kadar ortalanır (DESIGN.md §1).
  maxContentWidth: 480,

  // DESIGN.md §3'te ölçüsü yazılı, tokens.json'da ayrı adı olmayan bileşen
  // ölçüleri. src/ui bileşenleri ham px yazmasın diye burada ad kazandılar.
  iconXs: 14, // rozet içindeki ikon
  badge: 22, // rozet yüksekliği
  chip: 36, // çip / segment öğesi yüksekliği
  quickAction: 80, // ana sayfa kısayol kutusu
  toolBox: 96, // hesap araç kutusu
  emptyIcon: 48, // boş durum ikonu
  emptyTextWidth: 280, // boş durum açıklamasının en çok genişliği
  avatarSm: 32, // ürün çipi görseli
  dot: 8, // sekmedeki bildirim noktası
  counter: 20, // okunmamış sayacı (pill)
  sheetHandleWidth: 36,
  sheetHandleHeight: 4,
  statusColumn: 112, // makine kartının sağındaki müsaitlik sütunu (dar ekranda sabit)
  // Makine tablosu (Makineler sekmesi, toplu aktarım önizlemesi): satır ve sütun genişlikleri.
  tableRow: 44,
  tableColNo: 48,
  tableColShort: 64,
  tableColMid: 96,
  tableColWide: 144,
  tableColStatus: 96,
} as const;

// Yazı stilleri. Kalınlık ayrı yazı tipi dosyasıyla (theme/index.ts fonts).
const sans = {
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold',
} as const;
const mono = 'IBMPlexMono_500Medium';

export const type = {
  display28: { fontFamily: sans.semibold, fontSize: 28, lineHeight: 34, letterSpacing: -0.2 },
  title22: { fontFamily: sans.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  title18: { fontFamily: sans.semibold, fontSize: 18, lineHeight: 24 },
  body16: { fontFamily: sans.regular, fontSize: 16, lineHeight: 24 },
  body16Strong: { fontFamily: sans.semibold, fontSize: 16, lineHeight: 24 },
  body14: { fontFamily: sans.regular, fontSize: 14, lineHeight: 20 },
  label14: { fontFamily: sans.semibold, fontSize: 14, lineHeight: 20 },
  caption12: { fontFamily: sans.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.3 },
  button16: { fontFamily: sans.semibold, fontSize: 16, lineHeight: 24 },
  button14: { fontFamily: sans.semibold, fontSize: 14, lineHeight: 20 },
  mono14: { fontFamily: mono, fontSize: 14, lineHeight: 20 },
  mono20: { fontFamily: mono, fontSize: 20, lineHeight: 26 },
} as const;

// Gölge: yalnızca yüzen öğeler (alt sayfa, açılır menü, yapışkan eylem çubuğu).
export const shadowRaised = {
  light: { shadowColor: '#1a1f26', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  dark: { shadowColor: '#000000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
} as const;

export interface Theme {
  name: ThemeName;
  colors: ColorTokens;
  space: typeof space;
  radius: typeof radiusTokens;
  size: typeof size;
  type: typeof type;
  shadowRaised: (typeof shadowRaised)[ThemeName];
}

export function buildTheme(name: ThemeName): Theme {
  return { name, colors: colorTokens[name], space, radius: radiusTokens, size, type, shadowRaised: shadowRaised[name] };
}
