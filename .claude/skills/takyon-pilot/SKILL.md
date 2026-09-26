---
name: takyon-pilot
description: Takyon Ai kapalı pilot (beta) yönetimi — 10–15 tekstil firmasıyla 2 haftalık test. Kullanıcı "pilot", "beta", "test firmaları", "davet", "geri bildirim", "firmalar kullanmıyor", "hangi hatalar geldi" dediğinde veya pilota hazırlık, pilot takibi, pilot sonrası değerlendirme istediğinde mutlaka kullan. Davet metni, onboarding akışı, geri bildirim toplama ve haftalık pilot raporu üretir.
---

# Takyon Ai Kapalı Pilot

Pilotun amacı özellik eklemek değil, 35–60 yaş, telefondan giren, teknik olmayan
tekstilcinin uygulamayı kendi başına kullanıp kullanamadığını görmektir. Her karar
bu ölçüye göre verilir: hız ve netlik, süs değil.

## Pilot kurulumu

1. **Firma listesi**: her tekstil alt sektöründen bir firma (iplik, örme kumaş,
   dokuma, boya-apre, konfeksiyon, alıcı/marka, aksesuar). Fırat listeyi verir;
   sen `pilot/firmalar.md` dosyasına alt sektör, yetkili, telefon, davet tarihi
   sütunlarıyla yaz. Telefon numaralarını repoya commit etme; dosya `.gitignore`'da.
2. **Davet**: WhatsApp üzerinden, 3 cümle, tek link. Metin şablonu aşağıda.
3. **İlk giriş akışı**: telefon doğrulama → firma adı → alt sektör → 1 ürün ekle →
   ilk arama. 3 dakikayı geçmesin; her adımı say ve ölç.
4. **Geri bildirim kanalı**: uygulama içinde tek "Bir sorun mu var?" düğmesi +
   Fırat'ın WhatsApp'ı. Form doldurtma; sesli mesaj bile kabul.

## Davet metni şablonu

```
Merhaba <isim>, Melide'den Fırat. Tekstilciler için firma bulma ve numune isteme
uygulaması geliştirdik, ilk 15 firmadan biri olmanızı istiyoruz. 2 hafta kullanıp
görüşünüzü söylemeniz yeterli: <link>
```

## Geri bildirim sınıflandırma

Gelen her bildirimi `pilot/geri-bildirim.md` dosyasına şu etiketlerle yaz:

- **HATA-KRİTİK**: giriş yapamıyor, numune isteği gitmiyor, veri kayboluyor → aynı gün.
- **HATA**: yanlış görüntü, yavaşlık, çeviri hatası → bu hafta.
- **ANLAŞILMADI**: kullanıcı ne yapacağını bulamadı → tasarım/metin sorunu, hata değil.
- **İSTEK**: yeni özellik → `takyon-yol-haritasi` fikir havuzuna.
- **ÖVGÜ**: ne işe yaradı → pazarlama metninde kullanılacak.

"ANLAŞILMADI" etiketi en değerlisidir; üçten fazla birikince o ekranı yeniden ele al.

## Haftalık pilot raporu

Her cuma Fırat'a şu şablonla ver:

```
# Pilot Haftası <n>
Davet edilen / giriş yapan / bu hafta aktif: a / b / c
Numune isteği sayısı: x  |  WhatsApp'a geçiş: y
Kritik hata: n (kapanan: m)
En sık "anlaşılmadı" ekranı: <ekran> — <önerilen düzeltme>
Öne çıkan övgü: "<alıntı>"
Bu hafta yapılacak 3 düzeltme:
1. 2. 3.
Çıkış kriteri durumu: <x/4>
```

## Çıkış kriterleri

- 2 hafta boyunca haftada en az 3 firma aktif (bir numune isteği veya arama yapmış)
- En az 20 sınıflandırılmış geri bildirim
- Kritik hata sıfır
- İlk giriş akışı ortalama 3 dakikanın altında

Kriterler sağlanınca `takyon-yol-haritasi/references/durum.md` dosyasını güncelle
ve aşama 2'ye geç.
