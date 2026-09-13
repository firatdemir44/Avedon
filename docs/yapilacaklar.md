# Açık İşler / Yapılacaklar

Bu dosya, sohbet geçmişinde kaybolmaması gereken önemli notları ve bekleyen kararları tutar. Yeni bir çalışma oturumuna başlarken önce burası kontrol edilir.

## Açık İşler

_Şu an bekleyen bir madde yok._

## Sonraki Özellik Kararı

Kurulum tamamlandı (backend + mobile çalışıyor, AI özellikleri aktif). Sırada gerçek bir özellik geliştirmesi var — hangisi olacağı henüz kararlaştırılmadı. Adaylar (mevcut kod tabanına göre eksik/yarım olanlar, bkz. `docs/durum.md`):

- Gerçek kimlik doğrulama (şifre/token, telefon numarası eşleşmesi yerine)
- SMS doğrulamasını gerçek bir sağlayıcıya bağlama (şu an her kod kabul ediliyor)
- Ödeme/fatura akışı (hiç yok)
- WhatsApp webhook'unu platform içi mesajlaşmaya bağlama
- Mobile `Company` tipi ile Prisma şeması arasındaki `productCategories`/`employeeIds` tutarsızlığını gidermek
- Ya da tamamen yeni bir özellik — kullanıcı belirleyecek

## Tamamlananlar (kısa özet)

- 2026-09-12: Backend + mobile ilk kurulum (npm install, `.env`, Prisma migrate+seed, Expo çalıştırma)
- 2026-09-12: Telefon–bilgisayar bağlantı sorunu çözüldü (AVG Antivirus firewall'u engelliyordu)
- 2026-09-12: Anthropic API anahtarı eklendi, AI Danışman + Kıyafet Analizi aktif edildi
- 2026-09-12: Git kimliği ayarlandı, otomatik commit/push izni kuruldu (`CLAUDE.md`, `.claude/settings.json`)
