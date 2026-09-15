# Orijinal Avedon projesi → bugünkü uygulama: fark ve aşama planı

**Tarih:** 2026-09-15 · **Kaynak:** kullanıcının paylaştığı Google Drive klasörü "Avedon Tasarım" (Takyon Ai)
**Durum:** plan onaylandı (2026-09-15). Aşama A tamamlandı (ayrıntı: `docs/yapilacaklar.md`), sıradaki Aşama B.

## Kaynaklar (yerelde, repoya girmez)

`docs/orijinal-tasarim/` (`.gitignore`'da; yalnızca iş PC'sinde):

| Klasör | İçerik |
|---|---|
| `2020-ekranlar/` | 84 PNG, Kasım 2020 ilk tasarım (ad = ekran adı) |
| `2021-ekranlar/` | 95 PNG, 26 Mayıs 2021 çıktıları = Avedon v4.2 XD'nin ekranları. Dosya adları `s01..s95`, gerçek adlar `eslesme.tsv`'de (zip'teki Mac biçimli Türkçe adlar Windows'ta okunamıyordu) |
| `logo/` | Son logo (PNG), kare v3 logo (PNG/JPG/PSD), AI/EPS kaynak, Takyon renk kılavuzu PDF |

Drive'daki `v4/adobe xd files` içindeki `Avedon v4.2 - Tasarım.xd` 2026-09-13'te metin olarak incelenmişti (`docs/tasarim-envanteri.md`, `docs/xd-ekran-metinleri.md`); bu belge o incelemeyi **görsellerle** tamamlıyor. `v1` klasörü boş.

## Görsel dil kararı

Kullanıcı (2026-09-15): bugünkü **C · Pazar Masası** tasarımını beğendi ve tasarımın buna göre sürmesini istedi. Orijinal ekranlar **özellik ve akış kaynağı**, görsel dil değil. Uyarlanırken:
- **Alınacak:** Avedon logosu (mavi girdap + AVEDON yazısı, lacivert paletle uyumlu) · kumaş fotoğraflı kategori kareleri · üst sekmeler (Firma: Hakkında/Ürünler/Akış/Kişiler) · numune zaman çizelgesinde adımı yapan kişinin fotoğrafı.
- **Alınmayacak:** yeşil (#00C46A) düğmeler, gölgeli kartlar, el yazısı "Avedon" logosu (2020, sonra değişmiş), iOS klavye/durum çubuğu gibi maket öğeleri.

## Fark analizi

✅ var · 🟡 kısmen · ❌ yok

| Alan | Orijinal tasarımda | Bugün | |
|---|---|---|---|
| Karşılama | 4 tanıtım ekranı ("Kaliteli kumaş aramanın yenilikçi yolu", "Sadece stok ürünler") | Doğrudan giriş | ❌ |
| Kayıt rolleri | Konfeksiyon mu Üretici mi → Yönetici / Tasarımcı / Depocu → Bireysel kayıt; şirket koduyla katılma | Rol seçimi + şirket kodu | 🟡 |
| Marka | Logo her ekranın üst bandında | "Avedon" düz yazı | ❌ |
| Ana sayfa | Arama (kamera + mikrofon), mesaj rozeti, **hikayeler şeridi**, gönderiler, 5'li alt menü (Profil · Keşfet · Ana sayfa · Katalog · Takvim) | Akış, 5 sekme (Akış · Ürünler · Hesaplamalar · Mesajlar · Profil) | 🟡 |
| **Ürün kategorileri** | Sol dikey sektör menüsü (Kumaş Üretimi · Konfeksiyon · Boyahane · İplik · Aksesuar · Baskı); **kullanım amacına göre** (Pantolonluk, Taytlık, Tişörtlük, Mayoluk); çeşit → **alt çeşit** (Örme: İki İplik, Double Face, İnterlok, Mira, Ottoman, Pike Lakost; Raschel: Elastanlı/Elastansız tül, Grek, Sanal; Dantel, Dokuma, Triko); Kadife/Polar/Astarlık firma seçme | 4 düz tip (raschel/örme/dokuma/diğer); bugün eklenen "Çeşitler" klasörleri | 🟡 |
| **Filtreleme** | Ürün kodu, stok aralığı, tip, ağırlık, genişlik, içerik, kullanım alanı, şirket; Temizle / Uygula | Yalnızca metin arama | ❌ |
| Arama | Arama sayfası, sonuçlar + "daha fazla gör", firma listesi | Ürün + firma metin arama | 🟡 |
| **Fotoğrafla arama** | Kamerayla kumaşı tarayıp benzerini bulma ("TARANIYOR") | — | ❌ |
| Sesli arama | Arama çubuğunda mikrofon | — | ❌ |
| **Ürün sayfası** | Çoklu fotoğraf (kaydırmalı), **favori yıldızı**, **görünürlük (Herkese açık / Sadece size açık)**, doğrulanmış üretici + toplam ürün rozeti, özellikler, **mesaj + arama düğmesi**, Numune Talep Et, **yorum + yıldızlı değerlendirme** | Tek fotoğraf, özellikler, firma, numune talebi | 🟡 |
| Stok birimi | Metre **veya kg aralığı** ("100kg-500kg") | Metre | 🟡 |
| **Favoriler** | Favori ürünler sayfası | — | ❌ |
| **Son bakılan ürünler** | "Avedon Geçmişi" (tarih grupları, tekrar numune talebi) | — | ❌ |
| Yeni koleksiyonlar | Fotoğraf ızgarası, ürün + firma | — | ❌ |
| **Firma sayfası** | Logo, doğrulama mührü, Bağlantı Kur; sekmeler **Hakkında · Ürünler (çeşit sekmeleri + kullanım amacı) · Firma Akışı · Kişiler**; **Firma Ofisi** fotoğrafları | Logo, bilgiler, ürün listesi, çalışanlar | 🟡 |
| **Şirket sayfası sihirbazı** | 23 adım (tanıtım, bilgiler, ürün kategorileri, "ilk 10 ürün ücretsiz"…) | Tek form (Firmayı düzenle) | 🟡 |
| **Profil** | Kapak fotoğrafı, çevrim içi noktası, konum, bağlantı sayısı; **Göstergeler** (profil / blog / arama görüntülenmesi); **Deneyim, Eğitim, Yetenekler (onaylı), İletişim** (web, telefon, e-posta); bağlantı var/yok görünümleri | Ad, unvan, firma, telefon (bağlantıya göre) | 🟡 |
| Gönderi | Büyük/küçük yayınla, gönderi sayfası, paylaş menüsü | Oluştur, yorum, beğeni, paylaş, video | ✅ |
| **Hikayeler** | Üst şerit + hikaye sayfası | — | ❌ |
| **Keşfet** | "Sana Özel / Daha Fazla Keşfet", sektör haberleri (WGSN, Tekstil Life), ilk açılışta ilgi alanı seçimi | — | ❌ |
| Mesajlaşma | Sohbet listesi + sohbet | ✅ | ✅ |
| **Numune süreci** | Adımlarda tarih-saat + **yapan kişinin fotoğrafı**; müşteri kuryesi / üretici sevkiyatı; **ödemeli numune** (Ödeme Talep Edildi → Ödeme Tamamlandı); **kargo takibi**; listede YOLDA / Tamamlandı / **Tekrar Et** | 4 adım, tarih-saat + yapan kişi, iki teslimat şekli | 🟡 |
| **Bildirimler** | Bildirim sayfası (profil görüntülendi, yeni mesaj, yeni numune talebi) | Yalnızca sekme rozetleri | ❌ |
| **Takvim** | Aylık takvim, "Gelecek" randevular (buluşma, takım çalışması) | — | ❌ |
| **Görüntülü görüşme** | "Üreticiye mesaj veya görüntülü görüşme" | — | ❌ |
| **İş modeli** | 3 ay ücretsiz tam sürüm → aylık abonelik ($100), ödeme/çekim ekranı, ilk 10 ürün ücretsiz | — | ❌ |
| Hesaplamalar, AI Danışman, Kıyafet görsel maliyet | Tasarımda yok | ✅ (bizim eklediğimiz) | + |

## Aşama planı (öneri)

Sıra ölçütü: pilot firmalara en hızlı somut fayda, sonra sosyal katman, en son dış hizmet/ödeme gerektirenler. Her aşama uçtan uca (sunucu + uygulama + kenar durumları + test), canlıya çıkış ve telefonda kontrol ile biter.

**Pilot öncesi engel (aşamalardan bağımsız, hâlâ açık):** SMS sağlayıcısı — giriş kodu şu an yalnızca Render kayıtlarında.

### Aşama A — Katalog derinliği ✅ (2026-09-15)
Sektör seviyesi (Konfeksiyon, Boyahane, İplik, Aksesuar, Baskı) bilinçli olarak eklenmedi: bunlar kumaş değil firma türü; Aşama B'de firma sayfası/firma listesiyle birlikte ele alınacak.
1. **Kategori ağacı:** sektör → çeşit → alt çeşit (sunucuda yönetilebilir liste; mevcut 4 tip veri kaybı olmadan taşınır) + **kullanım amacı** etiketleri (çoklu).
2. Ürünler "Çeşitler" görünümü alt çeşit klasörlerine ve kumaş fotoğraflı kategori karelerine genişler.
3. **Filtreleme:** stok aralığı, gramaj/en aralığı, içerik, kullanım amacı, firma.
4. **Çoklu ürün fotoğrafı** (kaydırmalı) ve stokta **kg** birimi.
5. **Favoriler** ve **son bakılan ürünler** (Profil menüsünden).
6. **Logo:** giriş ekranı ve üst bant.

### Aşama B — Firma sayfası
1. Sekmeler: Hakkında · Ürünler (çeşit sekmeleri + kullanım amacı) · Firma Akışı · Kişiler.
2. Kapak ve **ofis/üretim fotoğrafları**, doğrulama mührü, toplam ürün rozeti.
3. Adım adım **şirket sayfası oluşturma** (bugünkü tek formun yerine), şirket koduyla ekip katılımı.

### Aşama C — Numune ve güven
1. **Ürün değerlendirmesi:** yıldız + yorum, yalnızca numunesi teslim edilmiş firmalar yazabilir.
2. Numune listesinde **Tekrar Et**, zaman çizelgesinde kişi fotoğrafı, kargo takip numarası.
3. **Bildirimler sayfası** (yeni talep, adım değişti, mesaj, bağlantı isteği, profil görüntülendi); telefon bildirimleri ayrı adım.
4. **Ürün görünürlüğü:** herkese açık / yalnız seçili firmalara.
5. Ödemeli numune: **karar (2026-09-15) — ilk demoda ödemeyi firmalar kendi yöntemiyle halleder**; uygulamada ödeme adımı/altyapısı yok. İstenirse yalnızca bilgi amaçlı "ücretli numune" notu eklenebilir.

### Aşama D — Sosyal katman
1. Profil: kapak, konum, **deneyim, eğitim, yetenekler (bağlantı onaylı), iletişim**.
2. **Göstergeler:** profil ve aramada görüntülenme sayıları.
3. **Keşfet:** ilk açılışta ilgi alanı seçimi, "Sana Özel" akış (kategori/ilgi alanına göre).
4. **Hikayeler** (24 saatlik fotoğraf/video; video altyapısı hazır).
5. Karşılama (tanıtım) ekranları.

### Aşama E — Akıllı arama ve iletişim
1. **Fotoğrafla arama:** kumaş fotoğrafını AI ile tanıyıp (tip, desen, renk) benzer ürünleri bulma — mevcut Anthropic anahtarıyla yapılabilir; önce küçük bir doğruluk denemesi.
2. Sesli arama (telefonun konuşmayı yazıya çevirmesi).
3. **Takvim / randevu:** firmalar arası görüşme talebi, kabul, hatırlatma.
4. ~~Görüntülü görüşme~~ — **karar (2026-09-15): gerek yok**, yapılmayacak.

### Aşama F — İş modeli (kullanıcı kararı gerektirir)
3 ay ücretsiz → aylık abonelik, ürün kotası ("ilk 10 ürün ücretsiz"), ödeme sağlayıcısı (iyzico/PayTR vb.). Fiyat, kapsam ve fatura kararları kullanıcıda; ödeme bilgisi asistan tarafından girilmez.

## Kullanıcı kararları (2026-09-15)
- Aşama sırası: A → B → C → D → E → F onaylandı, A ile başlandı. SMS sağlayıcısı pilot öncesi ayrıca çözülecek.
- Ödemeli numune: ilk demoda firmalar kendi yöntemiyle halleder (uygulama içi ödeme yok).
- Abonelik fiyatı ve ücret konuları: sonraki aşamalarda (Aşama F).
- Görüntülü görüşme: gerek yok.
