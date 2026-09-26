---
name: takyon-magaza
description: Takyon Ai web uygulamasını iOS ve Android mağaza uygulamasına taşıma (Expo / React Native). Kullanıcı "mağaza", "App Store", "Google Play", "store", "React Native", "Expo", "push bildirim", "telefon uygulaması" dediğinde veya aşama 3'e geçildiğinde mutlaka kullan. Taşıma stratejisi, gereksinim listesi, yayın adımları ve mağaza metinlerini üretir.
---

# Takyon Ai Mağaza Uygulaması

Mevcut ürün 375px için tasarlanmış, tarayıcıda açılıp ana ekrana eklenen bir web
uygulamasıdır. Mağaza aşamasında amaç tasarımı ve akışları yeniden yazmak değil,
aynı deneyimi mağazadan indirilebilir hale getirmek ve push bildirim kazanmaktır.

## Strateji kararı (verildi, tekrar sorma)

- Expo (React Native) kullanılır. Expo Router ile mevcut ekran yapısı birebir taşınır.
- Tasarım sistemi (DESIGN.md, tokens.css) React Native token dosyasına çevrilir;
  renk ve boşluk değerleri değişmez.
- İlk mağaza sürümü web ile aynı özellik setine sahip olur; yeni özellik eklenmez.
- Backend değişmez; uygulama aynı API'yi kullanır.

## Kurulum

Expo ekibinin resmi plugin'ini kur; bu paket dışında güvenli kabul edilen tek dış
skill budur:

```
/plugin install expo@claude-plugins-official
```

Plugin Expo, EAS Build ve mağaza gönderimi bilgisini getirir. Bu skill ise
Takyon'a özgü sıralamayı ve kontrol listesini verir; ikisi birlikte çalışır.

## Taşıma sırası

1. Expo projesi oluştur, tokens'ı çevir, tipografiyi (IBM Plex) yükle.
2. Ekranları öncelik sırasıyla taşı: giriş/doğrulama → ana sayfa → arama →
   firma sayfası (makine parkuru sekmesi) → numune isteği → hesaplayıcılar →
   yapay zekâ danışman → profil.
3. Her ekranı taşıdıktan sonra web sürümüyle yan yana ekran görüntüsü al, farkı
   sıfırla.
4. Push bildirim: yalnızca 3 olay — numune isteği geldi, mesaj geldi, iş birliği
   onaylandı. Başka bildirim yok; 35–60 yaş kullanıcı bildirimi kapatır.
5. Koyu mod sistem ayarını takip eder.
6. `takyon-guvenlik-kapisi` skill'ini mağaza sürümü için yeniden çalıştır
   (özellikle güvenli depolama ve sertifika sabitleme).

## Mağazaya gönderim kontrol listesi

- Apple Developer ve Google Play Console hesapları Melide/Takyon adına açıldı.
- Uygulama adı "Takyon Ai"; marka tescil durumu avukatla teyit edildi.
- Gizlilik politikası URL'si yayında (KVKK metniyle uyumlu).
- Mağaza ekran görüntüleri: 5 adet, gerçek tekstil verisiyle, Türkçe.
- Kısa açıklama (80 karakter) ve uzun açıklama Türkçe; EN sürümü aşama 4'te.
- Hesap silme akışı uygulama içinde (Apple zorunlu).
- Test: TestFlight ve Google Play kapalı test, pilot firmalarından 5'i.
- Çökme oranı ilk hafta < %1; değilse güncelleme, yeni özellik değil.

## Mağaza açıklaması şablonu

```
Takyon Ai — Tekstil sektörünün buluşma noktası
Kumaş üreticisi, konfeksiyoncu ve alıcıları tek uygulamada buluşturur.
• Firma bul, makine parkurunu gör, numune iste
• Kumaş ve konfeksiyon maliyeti hesapla
• Örme, boyama ve iplik sorularını yapay zekâ danışmana sor
• Doğrulanmış iş birlikleriyle güvenle çalış
```
