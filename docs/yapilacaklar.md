# Açık İşler / Yapılacaklar

Bu dosya, sohbet geçmişinde kaybolmaması gereken önemli notları ve bekleyen kararları tutar. Yeni bir çalışma oturumuna başlarken önce burası kontrol edilir.

## Açık İşler

- **İncelenmeyi bekliyor:** Kullanıcının 2020'de hazırladığı orijinal Avedon proje temelleri — `Avedon v4.2 - Tasarım.xd` (Adobe XD tasarım dosyası) ve `Takyon Ai - Avedon Product.pdf`. Bu ikisi güncel mimari/trendlere göre projeyi yeniden değerlendirmek için kullanılacak. **Not:** `.xd` dosyası Adobe XD'nin kendi ikili/proprietary formatı — doğrudan okunamıyor, içeriğini görmek için ya Adobe XD ile PNG/PDF olarak dışa aktarılması ya da ekran görüntüleri alınması gerekecek.
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

**1. aşama tamamlandı** (bkz. Tamamlananlar), şu an **2. aşama (Mesajlaşma)** planlanacak.

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
- 2026-09-13: **Faz 1 — Bağlantı sistemi + Profil sayfası** tamamlandı. Yeni `Connection` modeli (pending/accepted, reddetme = satır silme), `POST/PATCH /api/connections`, `GET /api/connections(?status=)`, `GET /api/connections/status/:userId`, `GET /api/users/:id` (bağlantı yoksa telefon alanı gizli). Mobilde: Profil ekranı (bağlantı kur/kabul/reddet butonları), Bağlantılarım ve Bağlantı İstekleri ekranları, firma sayfasında tıklanabilir çalışan listesi, gelen numune taleplerinde talep edenin adı artık profile bağlıyor. Uçtan uca curl ile doğrulandı (istek/kabul/red/kendine-istek-engeli/tekrar-istek-engeli/telefon gizliliği). Plan: `C:\Users\ebosc\.claude\plans\swift-rolling-kazoo.md`.
