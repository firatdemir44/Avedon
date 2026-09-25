# Ödemeler ve abonelikler (Takyon Ai) — 2026-09-25

Liste koddaki ayarlar ve canlı sağlık kontrolünden çıkarıldı; gerçek tutarlar faturalardan doğrulanmalı. Tüm hesaplar **Takyon Ai Sanayi ve Ticaret A.Ş.** adına ve Fırat'ın erişiminde olmalı.

## Fırat'ın kayıtlı ödemeleri (2026-09-25)

| Kalem | Tutar | Tür |
|---|---|---|
| Anthropic Claude aboneliği (geliştirme; asistanla çalışma) | 20 $ + 100 $ | Aylık sabit (Pro + Max) |
| Claude Console (uygulamanın API kullanımı) | 1.205,43 ₺ | Yüklenen kredi; otomatik yükleme açık: bakiye 5 $ olunca 20 $ yüklenir |
| Google Cloud (doğal ses) | 1.500 ₺ | Ön ödeme; ayda 1M karaktere kadar ses ücretsiz olduğundan uzun süre yeter |
| Cloudflare | 244,20 ₺ | Aylık (video/Stream) |
| İleti Merkezi (SMS) | 189 ₺ | Kredi yüklemesi (484 SMS kredisi) |

Aylık sabit toplam: ~120 $ (Claude) + Cloudflare ~244 ₺ + Render ~7 $. Kredi/ön ödemeler (Claude Console, Google, İleti Merkezi) kullandıkça azalır; bitince yeniden yüklenir.

## Aylık devam edenler (hizmet listesi)

| Hizmet | Ne için | Ücret türü | Tahmini |
|---|---|---|---|
| Render (Starter + 1 GB disk) | Sunucu + veritabanı | Sabit aylık | ~7 $ + disk ~0,25 $ |
| Anthropic (Claude API) | Asistan, etiket okuma, içerik denetimi | Kullanım başına | Kullanıma göre (en büyük değişken kalem) |
| Cloudflare Stream | Akış videoları | Aylık (saklanan + izlenen dakika) | ~5 $'dan başlar |
| Google Cloud Text-to-Speech | Asistanın doğal sesi | Kullanım; ayda 1M karakter ücretsiz, sonrası 30 $/1M | Şimdilik 0 |
| Cloudflare Workers AI | Sesli soru (ses → yazı) | Günde 10.000 birim ücretsiz | Şimdilik 0 |
| İleti Merkezi | SMS doğrulama kodu | Önceden yüklenen kredi | 484 kredi var |
| Meta WhatsApp | WhatsApp asistanı | Kullanıcının başlattığı yazışma ücretsiz; firmanın başlattığı şablon mesajlar ücretli | Şimdilik 0 |
| Vercel (Hobby) | Web uygulaması | Ücretsiz | 0 — **not:** Hobby ticari kullanım için değil; lansmanda Pro (~20 $/ay) gerekir |

## Yıllık / tek seferlik

| Hizmet | Ücret | Durum |
|---|---|---|
| takyon.ai alan adı (Porkbun) | Yıllık yenileme | 2029-05'e kadar ödenmiş |
| Apple Developer | 99 $/yıl | Önceden kayıt var; üyelik aktif mi kontrol edilecek |
| Google Play Console | 25 $ bir kez | Önceden kayıt var |
| D-U-N-S | Ücretsiz | Muhtemelen var |
| TÜRKPATENT marka başvurusu | Başvuru + tescil harcı (+ vekil) | Yapılacak |

## Ücretsiz kullanılanlar

Companies House (İngiltere sicili), TCMB döviz kurları, Web Push bildirimleri, GitHub (özel depo).

## Güvenlik önerisi

- Google Cloud'da aylık bütçe uyarısı (ör. 500 ₺), Anthropic'te aylık harcama sınırı açık olsun.
- Tüm faturalar tek e-postaya (ör. muhasebe@takyon.ai) gelsin.
