# Takyon Ai — Yerelden Globale Yol Haritası

## Aşama 0 — Tasarım uyum kontrolü (1 hafta)
Amaç: pilot firmaların önüne tutarsız ekran çıkmasın.
- Her ekranı DESIGN.md ve tokens.css'e karşı kontrol et (renk, tipografi, boşluk,
  buton, kart, liste, boş durum, koyu mod).
- 375px genişlikte gerçek telefonda test et; tek elle kullanım.
- Çıkış: 5–6 ana ekran + firma sayfası (makine parkuru sekmesi dahil) uyumlu.

## Aşama 1 — Kapalı pilot (2–3 hafta)
Amaç: gerçek kullanıcıyla boşlukları görmek. Skill: takyon-pilot.
- MVP çekirdeği: firma bul → numune iste → WhatsApp ile bağlan.
- Yapay zekâ tekstil danışmanı (örme, boyama soruları) + maliyet hesaplayıcıları açık.
- Ana sayfa: arama → günün sayıları → 4 hızlı aksiyon → "Sektörden" akışı.
- Çıkış: haftalık aktif firma, geri bildirim sayısı, kritik hata = 0.

## Aşama 2 — Türkiye açık yayın, web (4–6 hafta)
Amaç: herkese açılmak; güvenlik ve ticari zemin. Skill: takyon-guvenlik-kapisi.
- Güvenlik raporu PASS (kimlik doğrulama, firma verisi izolasyonu, fotoğraf yükleme,
  bağımlılıklar, KVKK aydınlatma metni).
- İsim (Takyon Ai) ve fiyatlandırma kararı; referans rakip fiyatı 2.500 TL/kişi/yıl.
- ✓ Konfeksiyon üretim kabiliyeti profili, konfeksiyon araması ve kumaş ↔ konfeksiyon
  "doğrulanmış iş birliği" bağları canlı (2026-09-26, erken tamamlandı).
- ✓ Firma asistanı canlı (uygulama, WhatsApp, doğal ses).
- Çıkış: ödeme alınabiliyor, ilk ödeyen 10 firma.

## Aşama 3 — Mağaza uygulaması (6–8 hafta)
Amaç: telefon ana ekranından store'a. Skill: takyon-magaza.
- Kod zaten Expo: EAS ile mağaza derlemesi; web'e özel özelliklerin telefon karşılıkları.
- Push bildirim (numune isteği geldi, mesaj geldi).
- Çıkış: App Store ve Google Play'de yayında, çökme oranı < %1.

## Aşama 4 — Global (3–6 ay)
Amaç: ilk dış pazar. Skill: takyon-global.
- ✓ Dil altyapısı: TR + EN tam (2026-09); sonra hedef pazar dili.
- Para birimi ve birim (gramaj g/m², en cm/inç, MOQ, termin gün).
- GDPR: aydınlatma, veri işleme sözleşmesi, silme hakkı, AB dışı veri aktarımı.
- Hedef pazar sırası önerisi: Mısır (Egypt Cady ilişkisi hazır zemin), ardından
  ihracat pazarları (AB alıcıları). Fırat onaylar.
- Çıkış: ilk dış pazarda 20 kayıtlı firma, EN arayüz hatasız.

## Tüm aşamalarda geçerli
- Hesaplama modülleri: tekstil-hesaplar skill'i; formüller ve fire oranları Fırat'tan.
- Yeni fikirler `fikir-havuzu.md`'ye aşama etiketiyle girer, kaybolmaz.
- Ertelenenler: fotoğraf tabanlı yapay zekâ eşleştirme, escrow ödeme, video içerik,
  tam dijital showroom/katalog (aşama 4 sonrası).

---

## Strateji kararları (26 Eylül 2026, Fırat onayladı)

### Pazar sırası
- Önce Türkiye, kesin. Global aynı anda açılmaz. Gerekçe: iki dil, iki hukuk, iki
  destek kanalı = yarım kalan iki ürün.
- Global kapısı: 6.–9. ay, ilk pazar Mısır (Egypt Cady ilişkisi). O zamana kadar EN
  altyapı arka planda hazırlanır, satış yapılmaz.
- Türkiye'de ödeyen 30–50 firma olmadan dışarı çıkılmaz.

### Takvim
- Ekim 2026: kapalı pilot, kendi çevreden (iplikçi, boyahane, fasoncu, müşteriler).
  2 hafta kullanım + 1 hafta düzeltme + 1 hafta ikinci tur = 1 ay. Uzatılmaz.
- Kasım–Aralık 2026: Türkiye açık yayın (web), ücretsiz deneme.
- Ocak 2027: ödeme açılır.
- Nisan–Mayıs 2027: mağaza uygulaması.
- Yaz 2027: Mısır.

### Gelir modeli
- Firma başı yıllık abonelik (kişi başı değil; Örme Parkuru 2.500 TL/kişi/yıl alıyor,
  farkımız bu).
- Ücretsiz katman: firma bulma, temel arama, sınırlı hesaplayıcı, günlük limitli
  yapay zekâ danışman.
- Ücretli katman, hipotez 5.000–7.500 TL/firma/yıl: sınırsız numune isteği, makine
  parkuru görünürlüğü, doğrulanmış iş birlikleri, firma asistanı, sınırsız hesaplama.
  Kesin fiyat pilot sonunda firmalara sorularak belirlenir.
- Sonraki gelir kapıları: alıcı tarafı paketi (6. ay), öne çıkan firma listesi (9. ay),
  global paket dolar bazlı (12. ay).
- Gelire geçiş 3. ayın sonu; daha geç kalınırsa "bedava araç" algısı yerleşir.

### Tanıtım ve pazarlama
- Broşür yok. Ana araç: 60 saniyelik ekran kaydı, Fırat'ın sesiyle, WhatsApp'tan
  gönderilir. Senaryo: `../../takyon-pilot/assets/tanitim-video-senaryo.md`.
- Mesaj: "Tekstilcinin telefonundaki iş aracı; 3 dakikada numune iste, maliyetini
  hesapla."
- Kısa kullanım videoları (20–30 sn, tek iş) pilottan SONRA, "anlaşılmadı" etiketi
  biriken ekranlar için çekilir. Pilottan önce çekilmez.
- Basılı tek şey: fuar için A5 kart, QR + tek cümle.
- Pazarlama: referans zinciri (her pilot firmasından 3 isim), sektör fuarları ve
  dernekler. Reklam bütçesi 6. aydan önce sıfır.
- Ton: stüdyo, müzik, animasyon yok. Sektörden birinin sektöre anlatması.
