---
name: takyon-global
description: Takyon Ai'nin global pazara açılması — çoklu dil (i18n), para birimi ve birim dönüşümü, GDPR uyumu, hedef pazar sıralaması. Kullanıcı "global", "yurt dışı", "İngilizce", "çeviri", "ihracat", "Mısır", "Avrupa", "GDPR", "euro", "dolar", "inç" dediğinde veya aşama 4'e geçildiğinde mutlaka kullan. Dil altyapısı kurulumu, çeviri süreci, pazar açılış kontrol listesi ve GDPR farkları üretir.
---

# Takyon Ai Global Açılış

Global açılış tek seferlik bir çeviri işi değildir; dil, birim, para, hukuk ve pazar
olmak üzere beş katmandır. Sıra önemlidir: altyapı önce, pazar sonra. Türkçe sürümün
hiçbir davranışı bozulmaz.

## Katman 1 — Dil altyapısı

- Dil altyapısı KURULU ve TR+EN TAMAM (2026-09): mobilde `mobile/src/i18n` (Türkçe metin anahtar,
  `tr()`), sunucuda `backend/src/i18n` + `X-Lang`. Yeni dil = yeni sözlük dosyaları; ayrı
  `locales/*.json` yapısı KURULMAZ.
- Tekstil terimleri için ayrı sözlük: `locales/glossary.md`. Fırat Türkçe terimi
  ve karşılığını onaylar (örn. örme = knitting, fason = contract manufacturing,
  numune = sample, gramaj = GSM, termin = lead time, fire = waste/loss).
  Çeviri aracı sözlüğe uymak zorunda.
- Dil seçimi: telefon dili varsayılan, profilden değiştirilebilir.
- Tarih, sayı, para formatları `Intl` ile; elle formatlama yok.
- Sağdan sola dil (Arapça) ikinci dalga; ilk dalgada layout RTL'ye hazır kalır
  (`start/end` kullan, `left/right` değil).

## Katman 2 — Birim ve para

- Her fiyat alanı para birimi taşır; TL varsayılan, USD/EUR/EGP seçilebilir.
  Fiyat, firmanın girdiği para biriminde gösterilir. TCMB günlük satış kuru yalnızca
  bilgi amaçlı ve kaynağıyla gösterilir (mevcut özellik); kur tahmini yapılmaz.
- Birimler: gramaj g/m² (GSM), en cm ve inç, ağırlık kg ve lb, MOQ metre/kg/adet.
  Dönüşüm formülleri `tekstil-hesaplar` skill'inde.
- İplik numaraları uluslararası: Ne, Nm, tex, denier — dönüşüm tablosu hazır.

## Katman 3 — GDPR (KVKK'nın üstüne)

KVKK kapısı `takyon-guvenlik-kapisi`'nde geçilmiş olmalı. GDPR için ek olarak:
- Hukuki dayanak her veri türü için yazılı (sözleşme / meşru menfaat / rıza).
- Veri işleme sözleşmesi (DPA) şablonu B2B müşterilere sunulabilir durumda.
- AB dışına veri aktarımı: sunucu konumu ve standart sözleşme maddeleri (SCC).
- Silme ve taşınabilirlik talebi 30 gün içinde otomatik karşılanıyor.
- Çerez/izleme: pazarlama izlemesi yalnızca rızayla.
- Avukat teyidi gerekli; bu skill hukuki görüş değildir, kontrol listesidir.

## Katman 4 — Pazar sırası

Öneri (Fırat onaylar, değiştirebilir):
1. **Mısır** — mevcut iş ilişkisi (Egypt Cady) hazır giriş noktası; EN arayüz yeterli,
   Arapça ikinci dalga.
2. **AB alıcıları** — Türk üreticinin ihracat müşterileri; alıcı tarafını büyütür.
3. **Pakistan / Bangladeş / Uzbekistan** — üretici tarafı; daha sonra.

Her pazar için `global/pazar-<ülke>.md` dosyası: yerel rakipler, fiyat beklentisi,
ödeme yöntemi, yasal gereklilik, ilk 10 hedef firma.

## Pazar açılış kontrol listesi

- [x] EN arayüz tamam (2026-09) · [ ] sözlük onaylı, 2 ana dil konuşan tekstilciyle test
- [ ] Fiyatlandırma o pazarın para biriminde
- [ ] Ödeme yöntemi çalışıyor (kart + havale)
- [ ] GDPR/yerel hukuk listesi avukat onaylı
- [ ] Mağaza sayfası EN
- [ ] Destek kanalı (WhatsApp Business) o pazar için ayarlı
- [ ] İlk 10 firma davet edildi (pilot mantığı: `takyon-pilot` şablonlarını EN'e çevir)
- [ ] `takyon-guvenlik-kapisi` yeni pazar için tekrar çalıştırıldı

Çıkış: ilk dış pazarda 20 kayıtlı firma ve haftalık aktif 5 firma.
