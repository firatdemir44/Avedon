# Açık İşler / Yapılacaklar

Bu dosya, sohbet geçmişinde kaybolmaması gereken önemli notları ve bekleyen kararları tutar. Yeni bir çalışma oturumuna başlarken önce burası kontrol edilir.

## Açık İşler

- **İncelenmeyi bekliyor:** Kullanıcının 2020'de hazırladığı orijinal Avedon proje temelleri — `Avedon v4.2 - Tasarım.xd` (Adobe XD tasarım dosyası) ve `Takyon Ai - Avedon Product.pdf`. Bu ikisi güncel mimari/trendlere göre projeyi yeniden değerlendirmek için kullanılacak. **Not:** `.xd` dosyası Adobe XD'nin kendi ikili/proprietary formatı — doğrudan okunamıyor, içeriğini görmek için ya Adobe XD ile PNG/PDF olarak dışa aktarılması ya da ekran görüntüleri alınması gerekecek.
- **Gerçek SMS sağlayıcısı henüz yok:** OTP kodları şu an sadece backend konsoluna yazdırılıyor (geliştirme modu). Yayına çıkmadan önce Twilio gibi bir sağlayıcı eklenmeli (`backend/src/sms.ts` içinde yorum olarak nasıl ekleneceği yazılı).

## Sonraki Özellik Kararı

Gerçek kimlik doğrulama tamamlandı (bkz. Tamamlananlar). Kullanıcının 2020 proje dosyalarını inceledikten sonra yol haritası bu bulgulara göre güncellenecek. Diğer adaylar (bkz. `docs/durum.md`):

- Ödeme/fatura akışı (hiç yok)
- WhatsApp webhook'unu platform içi mesajlaşmaya bağlama
- Mobile `Company` tipi ile Prisma şeması arasındaki `productCategories`/`employeeIds` tutarsızlığını gidermek

## Tamamlananlar (kısa özet)

- 2026-09-12: Backend + mobile ilk kurulum (npm install, `.env`, Prisma migrate+seed, Expo çalıştırma)
- 2026-09-12: Telefon–bilgisayar bağlantı sorunu çözüldü (AVG Antivirus firewall'u engelliyordu)
- 2026-09-12: Anthropic API anahtarı eklendi, AI Danışman + Kıyafet Analizi aktif edildi
- 2026-09-12: Git kimliği ayarlandı, otomatik commit/push izni kuruldu (`CLAUDE.md`, `.claude/settings.json`)
- 2026-09-13: **Gerçek kimlik doğrulama** eklendi — SMS OTP tabanlı kayıt/giriş, 30 günlük oturum JWT'si, admin/ürün/numune talebi sahiplik kontrolleri artık sunucuda (client'a güvenmiyor). Eski `/api/login` ve "her kod kabul edilir" davranışı kaldırıldı. Detaylar: `C:\Users\ebosc\.claude\plans\swift-rolling-kazoo.md`.
