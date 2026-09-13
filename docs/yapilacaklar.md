# Açık İşler / Yapılacaklar

Bu dosya, sohbet geçmişinde kaybolmaması gereken önemli notları ve bekleyen kararları tutar. Yeni bir çalışma oturumuna başlarken önce burası kontrol edilir.

## Açık İşler

- ~~Telefonda test edilmeyi bekliyor~~ → **2026-09-13 tarihinde gerçek cihazda test edildi ve geçti** (aşağıda Tamamlananlar'a bakın).
- ~~Navigasyon yeniden yapılandırması~~ → **2026-09-13'te yapıldı ve cihazda test edildi** (Tamamlananlar'a bakın).
- **Google ile giriş — KARAR VERİLDİ, ön hazırlık kullanıcıda:** Kullanıcı Google ile girişin büyük kolaylık sağladığını belirtti ve tasarımda da var (`2.1 Login Screen`: Google / Facebook / LinkedIn). **Karar:** telefon + SMS akışı kalacak, Google ile giriş **üzerine eklenecek**; Google'la giren yeni kullanıcıdan bir kez telefon doğrulaması istenecek. Gerekçe: kimlik modeli telefon merkezli (WhatsApp bildirimleri, "bağlantı kurunca telefon görünür" kuralı, `User.phone` unique). **Başlamadan önce kullanıcının Google Cloud Console'da bir OAuth istemcisi oluşturup client ID'yi vermesi gerekiyor** — asistan hesap açamaz/kimlik bilgisi giremez.
- **Tasarımdan çıkan, henüz uygulanmamış farklar** (bkz. `docs/tasarim-envanteri.md`): (1) Tasarımda mesajlaşma bir sekme değil, **üst barda rozetli ikon**; 5. sekme **Takvim**. Bizde Mesajlar sekme (keşfet/takvim olmadığı için bilinçli). (2) Butonlar/input'lar tasarımda **tam yuvarlak (hap)**, bizde `radius.md = 12`. (3) Üst barda arama kutusu + logo yok. (4) Tasarım dosyasındaki 129 ekranın görseli henüz dışa aktarılmadı (`Dosya → Dışa Aktar → Tüm Artboard'lar`).
- **Güvenlik/olgunluk boşlukları (bilinçli olarak ertelendi):** (1) Uygulamada hiçbir yerde hız sınırlama (rate limiting) yok — akış, bir kullanıcının yazdığının herkese yayıldığı ilk özellik olduğu için bu eksiklik ilk kez burada anlam kazanıyor. (2) Şikayet/engelleme mekanizması yok; tek moderasyon imkânı gönderi sahibinin kendi gönderisindeki yorumu silebilmesi. (3) `GET /api/connections` tam `User` satırı dönüyor, telefon numarası dahil — bağlantılar arasında savunulabilir ama daraltılmalı. (4) Beğeni/yorum bildirimi yok; doğal olarak sekme rozetleriyle birlikte, navigasyon yeniden yapılandırmasında ele alınmalı. (5) `Company.logoUrl` alanı yok — akış kartlarında firma logosu yerine baş harf gösteriliyor.
- ~~Tasarım dosyaları incelenmeyi bekliyor~~ → **ikisi de incelendi.** PDF (9 ekran) ve XD dosyası (132 ekran) çözümlendi; bulgular `docs/tasarim-envanteri.md`, ham ekran metinleri `docs/xd-ekran-metinleri.md`. **`.xd` dosyası bir ZIP arşivi** — Adobe XD olmadan `unzip` + `docs/xd-extract.js` ile okunabiliyor.
- **Gerçek SMS sağlayıcısı henüz yok:** OTP kodları şu an sadece backend konsoluna yazdırılıyor (geliştirme modu). Yayına çıkmadan önce Twilio gibi bir sağlayıcı eklenmeli (`backend/src/sms.ts` içinde yorum olarak nasıl ekleneceği yazılı).

## Sonraki Özellik Kararı

Gerçek kimlik doğrulama tamamlandı (bkz. Tamamlananlar).

**2020 vizyonu (Takyon Ai PDF) — KARAR VERİLDİ (2026-09-13):** PDF, Avedon'u feed/hikayeler/keşfet/mesajlaşma/bağlantı-network sistemi olan tam bir sosyal medya platformu olarak tanımlıyor (bkz. `Takyon Ai - Avedon Product.pdf`, 9 ekran). Kullanıcı **"Evet"** diyerek bu tam vizyonu (sosyal ağ + B2B ticaret hibriti) hedef olarak onayladı — seçici/kısmi yaklaşım değil, tam kapsam.

**Aşamalı yol haritası (bağımlılık sırasına göre):**
1. **Bağlantı/Network sistemi + zenginleştirilmiş profil sayfası** — PDF'e göre mesajlaşma ve birçok UI durumu ("bağlantı kur" vs "mesaj gönder") buna bağlı, bu yüzden temel/ilk aşama.
2. **Mesajlaşma** — bağlantı sistemine bağımlı.
3. **İçerik akışı (feed)** — gönderi paylaşma, beğeni, yorum.
4. **Hikayeler** (24 saatlik içerik).
5. **Keşfet / haber akışı** (otomatik içerik toplama, kişiselleştirme).
6. **Kategori kataloğu** genişletmesi (üretici/konfeksiyoncu/boyahane vb. alt kategoriler).
7. **Numune sürecini zaman damgalı timeline'a dönüştürme.**
8. **Firma sayfasını zenginleştirme** (çalışan listesi, sertifikalar, ofis görselleri).

**1., 2. ve 3. aşama + navigasyon yeniden yapılandırması tamamlandı ve cihazda test edildi.**

**XD tasarımı incelendikten sonra güncellenen öncelik önerisi** (bkz. `docs/tasarim-envanteri.md` sonuç bölümü) — sıradaki adaylar, etki/maliyet sırasına göre:
1. **Numune takibini zaman damgalı timeline'a çevirmek** (yol haritasında 7. madde): tasarımın en olgun akışı, bizim en zayıf yerimiz, doğrudan ticari değer. İki teslimat senaryosu (müşteri kuryesi / satıcı gönderir), her adımda tarih-saat ve kimin yaptığı, kargo takibi.
2. **Kategori ağacı** (6. madde): taksonomi tasarımdan hazır çıktı (30+ örme tipi, sektör ayrımı, kullanım amacı). Ürün arama/filtrelemeyi gerçekten kullanılır yapar.
3. **Firma sayfası alanları** (8. madde): kuruluş yılı, firma tipi, çalışan sayısı, ana pazarlar, sertifikalar, ofis görselleri.
4. **Google ile giriş** (yukarıdaki açık iş; kullanıcının Google Cloud hazırlığı gerekiyor).
5. Hikayeler / Keşfet / Takvim — vizyonun sosyal katmanı.
6. **Abonelik/ödeme** — iş modeli kararı gerektiriyor (3 ay ücretsiz + aylık abonelik + ilk 10 ürün ücretsiz).

Diğer, vizyonla ilgisiz adaylar (bkz. `docs/durum.md`):
- Ödeme/fatura akışı (hiç yok)
- WhatsApp webhook'unu platform içi mesajlaşmaya bağlama
- Mobile `Company` tipi ile Prisma şeması arasındaki `productCategories`/`employeeIds` tutarsızlığını gidermek

## Tamamlananlar (kısa özet)

- 2026-09-12: Backend + mobile ilk kurulum (npm install, `.env`, Prisma migrate+seed, Expo çalıştırma)
- 2026-09-12: Telefon–bilgisayar bağlantı sorunu çözüldü (AVG Antivirus firewall'u engelliyordu)
- 2026-09-12: Anthropic API anahtarı eklendi, AI Danışman + Kıyafet Analizi aktif edildi
- 2026-09-12: Git kimliği ayarlandı, otomatik commit/push izni kuruldu (`CLAUDE.md`, `.claude/settings.json`)
- 2026-09-13: **Gerçek kimlik doğrulama** eklendi — SMS OTP tabanlı kayıt/giriş, 30 günlük oturum JWT'si, admin/ürün/numune talebi sahiplik kontrolleri artık sunucuda (client'a güvenmiyor). Eski `/api/login` ve "her kod kabul edilir" davranışı kaldırıldı.
- 2026-09-13: **2020 vizyonu incelendi** (`Takyon Ai - Avedon Product.pdf`) ve kullanıcı tam sosyal ağ + B2B hibriti vizyonunu onayladı; aşamalı yol haritası oluşturuldu (yukarıda).
- 2026-09-13: **Navigasyon yeniden yapılandırıldı ve cihazda test edildi.** Akış artık ana ekran; altta 4 sekme (Akış / Ürünler / Mesajlar / Profil). Keşfet ve takvim henüz olmadığı için 5 değil 4 sekme — çalışmayan sekme koymaktansa eksik bırakıldı. Ana ekrandaki 10 düğmelik sıra dağıtıldı: kumaş araçları (AI Danışman, Hesap Araçları, Görsel Maliyet, Firmam) Ürünler sekmesinde, ikincil hedefler yeni Profil sekmesindeki menüde. Giriş durumuna göre iki ayrı ekran grubu render ediliyor — giriş/kayıt/çıkış sonrası gezinme çağrısı yok; bu, kayıt biten kullanıcının geri tuşuyla kayıt adımlarına dönebilmesi hatasını da düzeltti. Sekmedeki profil rotası bilinçli olarak `MyProfile` adını taşıyor: `Profile` iki param listesinde birden olsaydı akışta birinin adına dokununca kendi profilin açılırdı. Cihazda doğrulandı (geri tuşu, çift başlık yok, başkasının profili doğru açılıyor, sekme geçişinde liste korunuyor, klavyede sekme çubuğu gizleniyor, mesaj rozeti, çıkış).
- 2026-09-13: **Tasarım paleti uygulandı** — tasarım dosyasından piksel düzeyinde okunan mavi aile (`#133C5F` lacivert, `#2696C6` mavi vurgu) koyu yeşilin yerine geçti.
- 2026-09-13: **Faz 1–3 gerçek cihazda test edildi ve geçti.** Akış (gönderi görme/beğenme/yorum/paylaşma/"Talep Et"), bağlantı kurma (istek → kabul → telefon numarasının görünür olması → gizli gönderinin akışta belirmesi) ve mesajlaşma (canlı gelen mesaj + okundu bilgisi 5 sn içinde) telefonda doğrulandı. Türkçe karakterler cihazda doğru görünüyor — test sırasında görülen `?` işaretleri yalnızca asistanın git-bash üzerinden curl ile gönderdiği mesajlarda oluşan kodlama bozulmasıydı, uygulamayla ilgisi yok (veritabanında byte düzeyinde doğrulandı). **Not:** Admin ile olan test sohbetinde bu bozuk iki mesaj duruyor; istenirse silinebilir.
- 2026-09-13: **Faz 3 — İçerik akışı (feed)** tamamlandı. `Post` / `PostLike` / `PostComment` modelleri, `/api/posts` (akış, oluştur, sil, beğen/geri al, yorum ekle/listele/sil, fotoğraf). Görünürlük: `public` herkese, `connections` sadece yazarın bağlantılarına — ve bu kural sadece listede değil yorum/beğeni/fotoğraf uçlarında da uygulanıyor. Gönderiye sadece KENDİ firmasının ürünü iliştirilebiliyor (başkasının ürünüyle talep toplanmasın diye), ürün silinirse gönderi ayakta kalıp bağlantı boşalıyor. Fotoğraflar liste yanıtında dönmüyor (bir sayfa megabaytlara çıkıyordu); `hasImage` ile işaretlenip kart görünürken tek tek çekiliyor ve önbelleğe alınıyor. Mobilde: akış ekranı (sonsuz kaydırma, aşağı çekip yenileme, iyimser beğeni), gönderi oluşturma (fotoğraf + görünürlük + ürün seçici), yorumlar ekranı, firma baş harfi + doğrulama rozeti. 46 otomatik uçtan uca kontrol geçti (görünürlük sızıntısı, yan yollardan erişim, ürün iliştirme kuralı, imleçli sayfalama, `http://` izleme pikseli reddi).
- 2026-09-13: **Faz 2 — Mesajlaşma** tamamlandı. `Conversation` + `Message` modelleri (userAId < userBId kanonik sıralama), `/api/conversations` (başlat/listele/mesajlar/gönder/okundu/okunmamış-sayısı). Sohbet başlatmak ve yazmak için kabul edilmiş bağlantı şart, okumak için değil. Gerçek zamanlılık polling ile (sohbet 4sn, liste 15sn; uygulama arka plandayken duruyor). Mobilde: Mesajlar listesi (okunmamış rozeti, istemci tarafı arama), sohbet ekranı (iyimser gönderim + hata durumunda tekrar dene), yeni sohbet için bağlantı seçici, profilde "Mesaj Gönder", ana ekranda okunmamış sayaçlı "Mesajlar" chip'i. Uçtan uca curl ile doğrulandı (yabancı sohbete erişim 403, bağlantısız kişiye mesaj 403, boş mesaj 400, bozuk `since` 400, Türkçe karakterler byte-birebir).
- 2026-09-13: **Faz 1 — Bağlantı sistemi + Profil sayfası** tamamlandı. Yeni `Connection` modeli (pending/accepted, reddetme = satır silme), `POST/PATCH /api/connections`, `GET /api/connections(?status=)`, `GET /api/connections/status/:userId`, `GET /api/users/:id` (bağlantı yoksa telefon alanı gizli). Mobilde: Profil ekranı (bağlantı kur/kabul/reddet butonları), Bağlantılarım ve Bağlantı İstekleri ekranları, firma sayfasında tıklanabilir çalışan listesi, gelen numune taleplerinde talep edenin adı artık profile bağlıyor. Uçtan uca curl ile doğrulandı (istek/kabul/red/kendine-istek-engeli/tekrar-istek-engeli/telefon gizliliği). Plan: `C:\Users\ebosc\.claude\plans\swift-rolling-kazoo.md`.
