# Tasarım ↔ Uygulama Ekran Karşılaştırması

Adobe XD'den dışa aktarılan 127 ekran incelenerek hazırlandı (2026-09-13). Envanter ve metin dökümü için `docs/tasarim-envanteri.md`.

## Ana Sayfa (akış)

**Tasarımda:**
- Üst bar: Texflow logosu · yuvarlak arama kutusu (kamera + mikrofon ikonlu) · rozetli mesaj ikonu — açık mavi zemin
- Altında **hikayeler şeridi**: mavi halkalı yuvarlak avatarlar, altında firma adları
- Gönderi kartı sırası: **profil satırı → FOTOĞRAF → beğeni/yorum sayıları → metin → aksiyon satırı**
- Fotoğrafın etrafında **kalın mavi çerçeve**, köşeler yuvarlak
- Fotoğrafın altında: beğenenlerin küçük avatar dizisi · ♡ 29 · paylaş oku · sağda 💬 7
- Aksiyon satırı: **Beğen · Yorum Yap · Paylaş · Talep Et** — dördü eşit sütun, her birinde ikon + altında etiket, ince çizgilerle ayrılmış
- Yazar adı **mavi ve kalın**, altında unvan, yanında "15s ·" ve görünürlük ikonu; sağ üstte firma logosu

**Bizde:**
- Üst bar yok (sadece "Akış" başlığı + Danışman/Paylaş düğmeleri)
- Hikayeler yok
- Kart sırası: profil satırı → **metin → fotoğraf** → aksiyon satırı (ters)
- Aksiyon satırı: ikonsuz, sola yaslı, sadece metin
- Beğenen avatarları yok
- Yazar adı koyu renk

**Fark listesi:** metin/fotoğraf sırası · aksiyon satırının ikonlu 4 sütun hâli · beğenen avatarları · fotoğraf çerçevesi · üst bar · hikayeler

---

## Ürün Sayfası ⚠️ (bizde hiç yok)

**Tasarımda tam bir ürün detay sayfası var:**
- Üstte tam genişlik ürün fotoğrafı; sol üstte geri oku, **sağ üstte favori (yıldız) düğmesi**
- Ürün adı (lacivert, italik-bold)
- **Görünürlük satırı: "Herkese Açık / Sadece Size Açık"** — ürün bazında gizlilik
- Firma logosu + iki rozet: **"Doğrulanmış Üretici"** ve **"Toplam 5693 Ürün"**
- **Özellikler kartı**: Ürün Kodu · Stok · Ürün Tipi · Ağırlık · Genişlik · İçerik · Kullanım Alanları
- Alt aksiyon çubuğu: **mesaj ikonu · telefon ikonu** + **"Numune Talep Et"** butonu

**Bizde:** Ürün detay ekranı **yok**. Ürünler listede kart olarak duruyor, "Numune Talep Et" doğrudan talep formuna gidiyor.

**Eksikler:** ürün detay sayfasının kendisi · favori/yıldız · ürün bazında görünürlük · firmanın toplam ürün sayısı rozeti · üründen doğrudan mesaj/arama

---

## Numune Takip ⚠️ (bizde çok zayıf)

**Tasarımda:**
- Başlık: "Kargo Takibi", altında ürün adı açık mavi bir pill içinde
- **Dikey zaman çizelgesi**: tamamlanan adımlar dolu mavi daire, bekleyen adım **içi boş daire**, aralarda bağlantı çizgisi
- Adımlar: Numune Talep Edildi → Numune Onaylandı → Numune Hazırlandı → **Kurye Teslim Aldı**
- Her tamamlanan adımın altında **kim yaptığı**: fotoğraf + ad + firma + unvan
- Bazı adımlarda açıklama metni ("Üretici Firma numuneyi hazırladı. Müşteri temsilcisinin numuneyi alması bekleniyor.")
- Diğer varyantta (`Takip - üretici sevkiyatı`) **tarih + saat** de var (03/09/20 · 10:00 · 13:00)
- İki ayrı senaryo: **müşteri kuryesi alır** / **satıcı gönderir**

**Bizde:** Sadece bir statü alanı ve "bir sonraki statüye geçir" butonu. Zaman damgası yok, kim yaptı bilgisi yok, kurye senaryosu yok, görsel zaman çizelgesi yok.

**Bu, tasarımın en olgun, uygulamanın en zayıf olduğu yer.**

---

## Giriş

**Tasarımda (`2.1 Login Screen`):** Texflow logosu + "Merhaba" · **kullanıcı adı + şifre** (açık mavi hap şeklinde alanlar) · "Şifremi Unuttum" · lacivert "Giriş" butonu · "Hesabınız yok mu? Ücretsiz kayıt olun" · **Google / Facebook / LinkedIn ile giriş** · altta büyük illüstrasyon

**Aynı dosyadaki `Giriş` ekranında ise:** +90 telefon + SMS doğrulama (PDF de böyle diyor)

**Bizde:** telefon + SMS OTP. **Karar verildi:** telefon kalacak, Google ile giriş üzerine eklenecek (bkz. `docs/yapilacaklar.md`).

---

## Keşfet

**Tasarımda:** ilgi alanı seçimi (News, Technology, Design, Food, Photography, Gaming, Music, Sports, Style, Politics, Travel, Celebrity, Film, Business, Auto, Science, Home, Robotics, Tekstil...), seçilenler renkli + tik, seçilmeyenler gri

**Kullanıcı kararı (2026-09-13): Keşfet yol haritasından çıkarıldı**, yerine Hesaplamalar sekmesi geldi. Bu ekran artık uygulanmayacak.

---

## Görsel dil — genel farklar

| | Tasarım | Bizde |
|---|---|---|
| Butonlar | **Tam yuvarlak (hap)** | `radius.md = 12` köşeli |
| Form alanları | Tam yuvarlak, açık mavi dolgu | Köşeli, beyaz + kenarlık |
| Başlıklar | Lacivert, **italik + bold** | Koyu gri, düz bold |
| Fotoğraflar | Kalın mavi çerçeve, yuvarlak köşe | Çerçevesiz |
| Zemin | Açık mavi tonlu bölgeler | Düz açık gri |
| İllüstrasyon | Her boş ekranda büyük düz vektör | Yok |

## Sonuç

Uygulama tasarımın **iskeletine** uyuyor; farklar iki grupta:

**A. Eksik ekran/özellik (işlevsel):** ürün detay sayfası · numune takip zaman çizelgesi · favori/yıldız · ürün görünürlüğü · üründen mesaj/arama · hikayeler · üst bar (arama + mesaj rozeti)

**B. Görsel dil (kozmetik ama kimliği belirleyen):** hap butonlar · italik başlıklar · fotoğraf çerçeveleri · ikonlu aksiyon satırı · açık mavi bölgeler

**Öneri:** Önce A grubundan **numune takip zaman çizelgesi** ve **ürün detay sayfası** — ikisi de doğrudan ticari değer taşıyor ve tasarımda net tanımlı. B grubu tek bir "görsel dil geçişi" turunda toplu yapılabilir; tema dosyası zaten merkezi olduğu için maliyeti düşük.
