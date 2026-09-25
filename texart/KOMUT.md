# Claude Code'a başlangıç

## Hazırlık
1. TEXART.md dosyasını Texart projesinin köküne koy (Texflow ile aynı depoda `texart/` klasörü ya da ayrı depo — Claude Code'a hangisini istediğini söyle).
2. Texflow'daki CLAUDE.md'nin sonuna şu satırları ekle:
   - "Projenin adı Takyon Texflow'dur (eski çalışma adı Texflow). Arayüzde ve kodda Texflow geçen yerler Takyon Texflow olarak güncellenir."
   - "Kumaş görselleri Takyon Texart servisi tarafından işlenir; kurallar texart/TEXART.md dosyasındadır."

## Claude Code'a yazılacak komut
---
TEXART.md dosyasını oku ve Takyon Texart'ı Faz 1 kapsamında kur. Kırmızı çizgi (§1) her adımda geçerli: kumaş piksellerine üretken yapay zekâ uygulanmaz, renk/ışık düzeltmeleri global yapılır.

Sıra:
1. Proje iskeleti: Python servisi (FastAPI), asenkron iş kuyruğu, orijinal + çıktı + işlem kaydı saklama. §2'deki API sözleşmesini uygula.
2. Test altyapısı ÖNCE: `testset/` klasöründeki fotoğrafları işleyen komut; her çalıştırmada önce/sonra karşılaştırma HTML sayfası ve ölçüm tablosu üretsin. (Fotoğrafları ben ekleyeceğim; başlangıçta birkaç örnekle çalış.)
3. İşleme hattını §3'teki sırayla, her adımı ayrı ve ayarlanabilir modül olarak yaz: kalite kapısı → ayırma → perspektif → ışık dengeleme → beyaz dengesi → en düz bölge → doku belirginleştirme → ölçek normalizasyonu (deneysel) → çözünürlük (≤2×, Lanczos) → kompozisyon.
4. §4'teki sadakat denetimini ve geri düşme mantığını yaz; ölçümler işlem kaydına ve API yanıtına girsin.
5. §5'teki üç çıktıyı üret (katalog, yakın plan, renk çipi).
6. Texflow entegrasyonu (§6): Ürün ekle akışına yükleme, kalite kapısı mesajları, önce/sonra onay ekranı, katalogda işlenmiş görsel ve ürün detayında "Orijinal fotoğraf" bağlantısı + renk notu. Arayüz DESIGN.md'ye uyar.
7. Uygulamada ve kodda "Texflow" geçen yerleri "Takyon Texflow" olarak güncelle.

Her adımdan sonra kısa özet ver, test karşılaştırma sayfasının yolunu yaz ve devam etmeden önce onay bekle.
---
