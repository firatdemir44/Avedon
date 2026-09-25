# Takyon Ai v4.2 Tasarım Dosyası — Envanter ve Boşluk Analizi

**Kaynak:** `Takyon Ai v4.2 - Tasarım.xd` (Adobe XD, 17 Haziran 2021, 59 MB, **132 ekran**)
**İnceleme tarihi:** 2026-09-13

## Dosya nasıl okundu (ileride tekrar gerekirse)

`.xd` dosyası aslında bir ZIP arşivi. Adobe XD kurmadan içeriği okunabiliyor:

```bash
unzip -o "Takyon Ai v4.2 - Tasarım.xd" -d <klasör>
node docs/xd-extract.js      # ekran adlarını + metinleri çıkarır
```

- `manifest` → ekran (artboard) adları
- `artwork/artboard-*/graphics/graphicContent.agc` → her ekranın içeriği; metinler `rawText` alanında
- `resources/` → tasarımda kullanılan fotoğraflar (JPEG)
- Ekranların **render edilmiş görselleri yok** (sadece `preview.png` + `thumbnail.png`) — tasarımı göz ile görmek için Adobe XD'den PNG dışa aktarmak gerekir.

Çıkarılan ham metinler: `docs/xd-ekran-metinleri.md` (133 ekran, 2031 metin).

## Ekran envanteri (gruplanmış)

| Alan | Ekranlar | Adet |
|---|---|---|
| Karşılama / tanıtım | 1.1–1.4 Welcome | 4 |
| Abonelik | 5.6 "3 Ay Ücretsiz", 5.7 "Sonrasında Aylık XXX$" | 2 |
| Giriş / kayıt | Giriş 1–9, 2.1/2.2 Login | ~13 |
| Şirket sayfası oluşturma sihirbazı | "Şirket sayfası oluşturmak" 1–23 | 23 |
| Ana akış | Anasayfa, Scrolling, Profil Menüsü, altta bildirim, Hikayeler | ~10 |
| Gönderi | Gönderi Yayınla (büyük/küçük), Gönderi sayfası, Yorum ekle, Paylaş butonu | 7 |
| Profil | Kendi sayfası, bağlantı var/yok, Bağlantı Kur sonucu | 7 |
| Firma sayfası | Hakkında, Ofisi, Ürünler (çeşitli), Ürün Kategorileri, Kişiler | ~20 |
| Ürün | Ürün Sayfası, Ürün Kategorileri, Firma listesi | ~10 |
| Arama | Arama Sonuçları (+ "daha fazla gör") | 5 |
| Mesajlaşma | Mesajlaşma 1–4 | 8 |
| Numune / takip | Numune Talep, Ürün Talep, Numune Talepleri, **Takip - Müşteri Kurye**, **Takip - Üretici Sevkiyatı** | 10 |
| Keşfet | Keşfet Sayfası, ilk açılış (ilgi alanı seçimi) | 4 |
| Takvim | Takvim, Takvim–1 | 2 |

## PDF'te OLMAYAN, tasarımda olan önemli şeyler

### 1. İş modeli (hiç konuşulmadı)
- **3 ay ücretsiz tam sürüm**, sonrasında **aylık abonelik** ("ilk yıl aylığı sadece XXX$")
- **"İlk 10 ürün yükleme ücretsiz"** — şirket sayfası oluşturma sihirbazının ilk ekranında
- Ürün yükleme kotası / ödeme akışı hiç kodlanmadı

### 2. Konumlandırma (Welcome ekranları)
- "Kaliteli kumaş aramanın yenilikçi yolu"
- **"Sadece belirli bir kalite standardında olan firmalar Takyon Ai'a dahil edilmektedir"** → kurduğumuz firma doğrulama sistemi tam da bunun karşılığı
- **"Sadece Stok Ürünler"** — dijital ölçüm sayesinde yalnızca depoda fiilen bulunan kumaştan numune istenebilir

### 3. Numune takibi — kurduğumuzdan çok daha zengin
Mevcut durum: 4 statü (talep_edildi → onaylandi → hazirlandi → teslim_edildi), zaman damgası yok.

Tasarımda:
- Her adımda **tarih + saat** (03/09/20 10:00, 13:00) ve **kimin yaptığı** ("ZBC Tekstil – İrfan Bey teslim aldı")
- **İki ayrı teslimat senaryosu:** "Müşteri firma olarak kurye ile aldırılacak" vs "Satıcı göndersin" — ekranlar da buna göre ayrışıyor (Takip-Müşteri Kurye / Takip-Üretici Sevkiyatı)
- **Kargo Takibi** bölümü
- Talep listesi: firma + ürün kodu + tarih + durum rozeti (**Tamamlandı / YOLDA / Tekrar Et**)
- Numune talep formunda: talep eden firma ve talep edilen firma kartları, "numune talebiyle alakalı detaylı mesaj" alanı

### 4. Firma sayfası — bizde olmayan alanlar
Şirket Genel Bakışı: **Kuruluş Yılı**, **Firma Tipi** (Üretici/Ticaret Şirketi), **Toplam Çalışan** (11-50 Kişi), **Yıllık Gelir** (Gizli seçeneği), **Ürün Grupları**, **Ülke/Şehir**, **Ana Pazarlar** (%60 Avrupa %40 Türkiye), **Sertifikalar/başarılar**, **Websitesi**, **Açık adres**, **Ofis görselleri**, **Firma hakkında yazı**.
Sekmeler: Firma Hakkında / Ürünler / Firma Akışı / Kişiler.
Bizde sadece: ad, vergi no, doğrulama, şirket kodu, ürünler, çalışan listesi.

### 5. Profil sayfası — LinkedIn seviyesinde
**Deneyim** (firma + unvan + tarih aralığı + süre), **Eğitim**, **Yetenekler + onay sayısı** ("Tekstil | 4 Onay"), **göstergeler** (Profil görüntülenme / Blog görüntülenme / Aramada görüntülenme), bağlantı sayısı, takipçi sayısı, e-posta + telefon.
Bizde sadece: ad, unvan, firma, telefon (bağlantıya göre gizli).

### 6. Gönderi oluşturma — bizdekinden geniş
Tasarımda: Fotoğraf, **Video**, **Doküman**, **Anket**, **Bir durumu kutla**, **Hikaye paylaş**, **# Hashtag**, görünürlük (Herkese Açık).
Bizde: metin + fotoğraf + görünürlük + ürün iliştirme.

### 7. Ürün kategorileri taksonomisi (çok değerli alan bilgisi)
**Sektör/firma tipleri:** Kumaş Üretimi, Konfeksiyon, Boyahane, İplik, Aksesuar, Baskı, Triko, Tekstil Yan Sanayi

**Örme kumaş tipleri:** Süprem, Düz Süprem, LYC Süprem, Vanize Süprem, Petek Süprem, İki İplik, LYC İkiiplik, LYC Diagonel İki İplik, Üç İplik, İnterlok, Jakarlı İnterlok, İnterlok Jakar, Ribana, Jakarlı Ribana, Kaşkorse, Değişken K.Korse, 2x1/3x1/3x2/4x3 K.Korse, Selanik, Double Face, Ottoman, Kapitone, Krep Örgü, Krep, Mira, Pike Lakost, Lokost, Polar, Punto di Roma, Ringel, Vanize Örgü, Torba Jakar, Yağmur Desen, Air File

**Diğer:** Dokuma, Dantel, Raschel

**Kullanım amacına göre:** Pantolonluk, Taytlık, Tişörtlük, Donluk, Mayoluk

Bizdeki `product.type` sadece 4 değer tutuyor (raschel/orme/dokuma/diger) — tasarım çok daha ayrıntılı bir kategori ağacı öngörüyor.

### 8. Arama — çok sekmeli
Kişiler / Şirketler / Gönderiler / Ürünler / **Kategoriler** + "**3 ortak bağlantı**" bilgisi.
Bizde: ürün ve firma araması, tek liste.

### 9. Takvim (5. sekme)
Ay görünümü + yaklaşan etkinlikler ("Fırat Demir ile buluşma 15:00", "IonAd Takım Çalışması 18:00"). İçerik: kişilerle randevu/toplantı.

### 10. Giriş ekranı detayları
+90 ülke kodu ön eki, **"Veya sosyal medya hesabı kullanarak bağlan"**, SMS ücret uyarısı metni.
Bizdeki telefon+OTP akışı ana hatta uyuyor; sosyal medya girişi yok.

## Görsel dil (render edilmiş 3 ekrandan)

XD'den dışa aktarılan ekranlardan üçü tam ekran çıktı: karşılama (`renditions/image-375-812.png`), `2.1 Login Screen`, `Keşfet Sayfası ilk açılış`. Renkler PNG'den piksel düzeyinde okundu (`docs/xd-extract.js` yanında duran yöntemle).

### Renk paleti — uygulamadakinden farklı
| Rol | Tasarım | Mevcut tema |
|---|---|---|
| Ana renk (koyu) | **#133C5F** (lacivert — "Giriş" butonu) | `#1B4332` koyu yeşil |
| Vurgu / CTA | **#2696C6** (mavi — "Başlayalım" butonu) | — |
| Açık yüzey vurgusu | **#C6E9FF** (açık mavi — form alanları) | — |
| Koyu yüzey | **#1A1A1A** | `#1A1A1A` (sadece metin) |
| Arka plan | **#FFFFFF** | `#F7F7F5` |

**Uygulamanın rengi aslında mavi ailesi; biz yeşil kullanıyoruz.**

### Biçim dili
- Butonlar ve form alanları **tam yuvarlak (hap)** — bizimkiler `radius.md = 12`
- Kartlar çok yuvarlak köşeli, bol beyaz alan
- Ekranların altında büyük **düz vektör illüstrasyonlar**
- Başlıklar koyu lacivert, italik-bold ("Merhaba")

### Üst bar ve sekme çubuğu (Keşfet ekranından)
- **Üst bar:** Takyon Ai logosu (sol) · yuvarlak arama kutusu "Arama Yapın" (kamera + mikrofon ikonlu) · **mesaj ikonu (kırmızı rozetli)** (sağ)
- **Alt sekme çubuğu 5 sekme:** Profil (rozetli) · Keşfet · **Ana Sayfa (mavi, aktif)** · Kategoriler · Takvim
- **Önemli fark:** Tasarımda **mesajlaşma bir sekme değil**, üst barda rozetli ikon. Biz Mesajlar'ı sekme yaptık; tasarımda o slot **Takvim**'in.

### Giriş ekranı çelişkisi
`2.1 Login Screen` **kullanıcı adı + şifre** ve **Google / Facebook / LinkedIn ile giriş** gösteriyor. Ama aynı dosyadaki `Giriş` ekranı **+90 telefon + SMS doğrulama** akışını gösteriyor (PDF de telefon diyor). Dosyada iki farklı giriş tasarımı var — hangisinin güncel olduğu netleştirilmeli. Kurduğumuz sistem telefon + OTP.

## Sonuç — yol haritasına etkisi

Yapılanlar tasarımın **iskeletine** uyuyor (akış, bağlantı, mesajlaşma, numune talebi, firma doğrulama). Tasarımın asıl derinliği **alan zenginliğinde**: firma/profil alanları, kategori ağacı, numune takibinin zaman damgalı ve kurye senaryolu hali, abonelik modeli.

Öncelik önerisi (etki/maliyet oranına göre):
1. **Numune takibini zaman damgalı timeline'a çevirmek** — tasarımda en olgun akış, bizde en zayıf yeri; ticari değeri yüksek.
2. **Kategori ağacı** — taksonomi hazır, ürün arama/filtrelemeyi gerçekten kullanılır yapar.
3. **Firma sayfası alanları** — sihirbaz 23 ekran ama alanların çoğu basit form alanı.
4. **Profil zenginleştirme** (deneyim/eğitim/yetenek) — LinkedIn kopyası, maliyeti yüksek, ticari getirisi tartışmalı.
5. **Abonelik/ödeme** — iş modeli kararı gerektiriyor, teknik olarak en riskli.
6. Takvim, hikayeler, keşfet — vizyonun sosyal katmanı, sonraya.
