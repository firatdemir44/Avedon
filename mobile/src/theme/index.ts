// Renkler Avedon v4.2 tasarım dosyasından alındı (bkz. docs/tasarim-envanteri.md).
// Değerler, dosyadan dışa aktarılan ekranların PNG'lerinden piksel düzeyinde okundu.
export const colors = {
  background: '#F5F8FA',
  surface: '#FFFFFF',
  // Tasarımdaki "açık mavi bölge"lerin karşılığı. Düz beyaz yüzeyin üstünde
  // hafifçe tonlu ikinci bir yüzey: form alanları, rozetler, seçili durumlar.
  surfaceTonal: '#EAF2F8',
  primary: '#133C5F', // tasarımdaki lacivert — birincil butonlar, başlıklar
  accent: '#2696C6', // tasarımdaki mavi — aktif sekme, vurgu, bağlantı
  accentSoft: '#D5E9F4', // vurgunun açık tonu — seçili kart dolgusu, rozet zemini
  primaryText: '#FFFFFF',
  text: '#1A1A1A',
  textMuted: '#6B6B6B',
  border: '#DCE4EA',
  danger: '#B3261E',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

// pill = tam yuvarlak. Tasarım butonları ve form alanlarını böyle çiziyordu;
// Material 3'ün 2025 güncellemesinde de butonların varsayılanı bu oldu, yani
// altı yıllık karar bugün de geçerli.
export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
};

// Tek bir yazı ölçeği. Öncesinde ekranlarda 10–22 arası rastgele boyutlar
// vardı; artık her metin buradaki adlardan birini kullanıyor.
// NOT: Tasarımdaki İTALİK başlıklar bilinçli olarak alınmadı — Türkçe'de
// ğ/ş/ı/ç italikte gözle takip etmeyi zorlaştırıyor, kimlik lacivert + kalın
// ile zaten kuruluyor.
export const typography = {
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  subtitle: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
} as const;

// Dokunulabilir her şeyin en küçük yüksekliği. Apple 44pt, Google 48dp diyor;
// büyük olanı alıyoruz.
export const MIN_TOUCH = 48;

// Kartlarda çerçeve yerine hafif yükseklik. Tasarımdaki kalın mavi fotoğraf
// çerçevesinin bugünkü karşılığı bu: çerçeve değil, yumuşak köşe + gölge.
export const shadow = {
  card: {
    shadowColor: '#0B2233',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
} as const;
