// Akış, sekme geçişlerinde başa sarmasın diye 30 saniye içinde tekrar
// yüklenmiyor. Ama yeni gönderi paylaşılıp geri dönülünce bu bekleme yüzünden
// gönderi görünmezdi; paylaşım ekranı akışı "bayat" işaretliyor, akış da
// odaklandığında bu işareti tüketip beklemeyi atlıyor.
let stale = false;

export function markFeedStale() {
  stale = true;
}

export function consumeFeedStale() {
  const wasStale = stale;
  stale = false;
  return wasStale;
}
