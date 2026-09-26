> **Ad notu (Fırat 2026-09-25):** "Texflow" ve "Texart" adlarından vazgeçildi; tek marka **Takyon Ai**. Aşağıdaki "Texart" bu bileşenin iç çalışma adıdır, arayüzde gösterilmez.
> **Karar (Fırat 2026-09-26):** Katalog görseli yükleyicinin fotoğrafıyla AYNI kadraj ve piksel boyutunda kalır; kırpma, döndürme/perspektif, yakınlaştırma ve ölçek normalizasyonu (§3 adım 2, 7, 9 kompozisyon kırpımı) yapılmaz — boyut dışına çıkılırsa sorumluluk platforma kalır. Yalnız global ışık, beyaz dengesi ve hafif keskinlik. Yakın plan yerel piksellerden kırpım olarak ayrıca üretilir.
>
> **Ek karar — kenar doldurma (Fırat 2026-09-26):** Fotoğrafta kumaş dışı alan varsa (kartela başlığı/etiket, ortadaki numunenin çevresindeki boş zemin, kenardaki başka nesne/poşet) bu alanlar **aynı kumaşla, aynı kalitede ve AYNI ÖLÇEKTE** doldurulur; görsel boyutu ve kadraj değişmez, çıktı yalnızca kumaştan oluşan tam kare olur. Kırmızı çizgiyle uyumu: doldurma **üretken değildir** — fotoğrafın kendi kumaş pikselleri blok blok 1:1 kopyalanır (görüntü kapitonesi: örtüşen bloklar, en küçük hatalı dikiş, dar geçiş; bloklar doku periyoduna ve komşu bloğun devamına hizalanır). Sinir ağı, difüzyon, inpainting, bulanık dolgu, ayna katlama YOK; maske içindeki gerçek kumaş pikselleri bit düzeyinde aynen kalır (yalnız global ışık/renk/keskinlik dönüşümleri tüm kareye eşit uygulanır). **Yapılmadığı durumlar** (orijinal kalır, `doldurma_yapilmadi:<neden>` uyarısı): maske güveni < 0,5 · yarı saydam kumaş (tül/dantel/file) · kumaş kadrajın %25'inden az · temiz kaynak karesi < 128 px ya da < 2 doku periyodu · desen raporu kaynaktan büyük / dikiş hatası yüksek (`desen_raporu_buyuk`) · **ek belirgin** (`ek_belirgin`, seçenek A, 2026-09-26): dolgu bittikten sonra çıktı 1/4 ölçekte ölçülür — dolgu–kumaş sınırında ince doku keskinlik oranı (`ek_sinir_keskinlik` > 1,12) ya da komşu blok çekirdekleri arasında doku kontrastı yaması (`ek_yama_doku_orani` > 1,05; gerçek kumaştaki aynı aralıklı pencere farkına oranla) eşiği aşarsa dolgu reddedilir, orijinal kare olduğu gibi kalır; dikiş gradyanı, ton basamağı, yama tonu ve faz tutarlılığı da ölçülüp kayda yazılır (eşikler haki pike + eğik krem interlok örneklerinde eski, ekleri görünen dolgunun reddedilip yeni dolgunun geçeceği biçimde kalibre edildi). Dikiş görünürlüğünü azaltan yöntemler: eksen başına ölçülen örgü kafesine faz kilidi (ötelemeler kafes periyodunun tam katı), komşu gerçek kumaşla keskinlik eşleme (en keskin değil, aynı netlikte kaynak), kanal başına düşük frekanslı ton kazancı (yalnız kopyalara), büyük bloklar (≈6 periyot, ≥192 px) ve şerit devamı tercihi. Doldurma yapıldığında `kenar_kumasla_tamamlandi` uyarısı ve `doldurulan_oran` ölçümü döner; uygulama ürün sayfasında şu notu gösterir: **"Görselin kenarları kumaşın kendi dokusu kopyalanarak tamamlanmıştır; orijinal fotoğraf ürün sayfasında görülebilir."** Orijinal fotoğraf her zaman saklanır ve alıcı tek dokunuşla görebilir. Sadakat ölçümleri (§4) yalnız gerçek (doldurulmamış) kumaş piksellerinde hesaplanır. İşlem kaydı adımı: `kenar_doldurma` (risk: dikkat; blok/örtüşme boyutu, dikiş hatası, kaynak bölge, doldurulan oran).

# TEXART.md — Takyon Texart proje tanımı (Claude Code bunu her oturumda okur)

Takyon Texart, Takyon Ai B2B tekstil platformunun kumaş görseli işleme bileşenidir. Firmalar kumaşlarını telefonla sıradan şekilde çeker ve yükler; Texart bu fotoğrafları otomatik olarak platformun tek ve profesyonel katalog standardına getirir.

**Hedef:** 1000 farklı firma kumaş yüklese bile tasarımcı 1000 farklı amatör fotoğraf değil, tek bir katalog standardı görür.

## 1. KIRMIZI ÇİZGİ (her kararda geçerli)

> **Texart kumaşı yeniden yaratmaz ve değiştirmez. Yalnızca gerçek kumaşı ayırır, düzeltir ve katalog standardında gösterir.**

- Amaç "güzel bir kumaş üretmek" değil, gerçek kumaşı profesyonel şekilde göstermektir.
- Üretken yapay zekâ (diffusion, generative inpainting, generative upscaling) kumaş piksellerine UYGULANMAZ.
- Renk ve ışık düzeltmeleri yalnızca **global** yapılır (tüm kumaşa aynı dönüşüm). Bölgesel boyama/yeniden renklendirme yapılmaz.
- Hafif renk kaymaları kabul edilir; referans kart kullanılmaz. Ürün sayfasında "Renk ekrana göre değişebilir; numune esastır" notu bulunur.
- Orijinal fotoğraf her zaman saklanır ve alıcı tarafından bir dokunuşla görülebilir.
- Firmadan fotoğrafçılık bilgisi, özel ekipman veya kart beklenmez.

## 2. Mimari

- **Texart servisi:** Ayrı bir arka uç servisi. Varsayılan: Python 3.11+, FastAPI, OpenCV, scikit-image, numpy; kumaş ayırma için açık kaynaklı bir segmentasyon modeli (ör. rembg/U²-Net ya da SAM ailesinden bir model). İşler asenkron kuyrukta çalışır.
- **Takyon Ai entegrasyonu:** Takyon Ai (telefon öncelikli web uygulaması) görseli Texart'a gönderir, sonucu ve ölçümleri alır, firmaya onay ekranı gösterir, onaylanan görseli katalogda kullanır.
- **Saklama:** Orijinal + işlenmiş görseller + işlem kaydı (uygulanan adımlar ve ölçümler) birlikte saklanır; işlem her zaman orijinalden yeniden üretilebilir olmalı.

### API sözleşmesi (taslak)
```
POST /jobs            görsel (JPEG/PNG/HEIC) + ürün_id + firma_id  → { job_id }
GET  /jobs/{id}       → { durum: kuyrukta|işleniyor|tamam|yeniden_çekim|hata,
                          çıktılar: { katalog, yakin_plan, renk_cipi },
                          ölçümler: { dE2000_ort, dE2000_yerel_std, doku_ssim, olcek_kaynagi },
                          uyarılar: [ ... ], islem_kaydi: [ ... ] }
```

## 3. İşleme hattı (sırasıyla)

| # | Adım | Yöntem | Risk sınıfı |
|---|------|--------|-------------|
| 0 | Giriş kalite kapısı | Bulanıklık (Laplace varyansı), parlama (patlamış piksel oranı), kumaşın kadrajdaki alanı, düz bölge var mı. Eşik altındaysa işleme yapılmaz, firmaya yeniden çekim mesajı döner. | — |
| 1 | Kumaşı ayırma | Segmentasyon maskesi; yalnızca piksel SEÇER, üretmez. | Güvenli |
| 2 | Açı / perspektif | Kumaş kenarlarından veya doku yönünden homografi; geometrik dönüşüm. | Güvenli |
| 3 | Işık dengeleme | Düşük frekanslı ışık eğimi ve köşe kararmasını çıkarma (illumination flattening). Yapıyı değil, gölgelemeyi düzeltir. | Dikkat |
| 4 | Beyaz dengesi / renk | Global beyaz dengesi (gray-world + white-patch birleşimi, sınırlı doz). Tek dönüşüm, tüm kumaşa. | Dikkat |
| 5 | En düz bölgeyi seçme | Kırışıklık haritası (yerel gradyan/gölge analizi); katalog kırpımı en düz, en net bölgeden alınır. Üretken kırışıklık silme YOK. | Güvenli |
| 6 | Doku belirginleştirme | Sınırlı unsharp mask / yerel kontrast (CLAHE, düşük clip). Detay eklemez, var olanı görünür kılar. | Dikkat |
| 7 | Ölçek normalizasyonu | Doku periyodunu FFT ile ölç; katalog görselinde ilmek/örgü tekrarı yaklaşık aynı büyüklükte görünsün. Periyot bulunamazsa (düz, dokusuz kumaş) kumaş alanını dolduran standart kırpıma düş. DENEYSEL — eşikler test setiyle ayarlanır. | Dikkat |
| 8 | Çözünürlük | En fazla 2×, yalnızca üretken olmayan yöntemle (Lanczos). Kaynak yetersizse büyütme yerine yeniden çekim iste. | Riskli → sınırlı |
| 9 | Kompozisyon | Nötr standart zemin, sabit kenar boşluğu, sabit çıktı boyutu. Kumaş piksellerine dokunmaz. Yarı saydam kumaşta (dantel, tül) zemin değiştirme görünümü değiştirebilir: maske güveni düşükse zemin orijinal bırakılır ve uyarı eklenir. | Güvenli |
| 10 | Kenar doldurma | Kumaş dışı alan (kart, etiket, zemin, başka nesne) fotoğrafın kendi kumaş pikselleri 1:1 kopyalanarak doldurulur (görüntü kapitonesi; üretken işlem yok). Koşullar ve atlanma nedenleri üstteki karar bloğunda. Maske içi piksellere dokunmaz. | Dikkat |

## 4. Sadakat denetimi (her iş için otomatik)
İşlenmiş kırpım, orijinaldeki aynı bölgeyle (geometrik olarak hizalanmış) karşılaştırılır:
- **Doku yapısı:** Parlaklık kanalında doku SSIM ≥ 0,90
- **Global renk kayması:** Ortalama ΔE2000 ≤ 8 (hafif beyaz dengesi düzeltmesine izin verir)
- **Yerellik (bölgesel değişiklik yok):** Kumaş 8×8 parçaya bölünür; parçalar arası ΔE2000 değişiminin standart sapması ≤ 2

E�ik aşılırsa sistem sırasıyla daha hafif ayarla yeniden dener (doz yarıya), yine aşılırsa yalnızca Güvenli adımlarla (1, 2, 5, 9) sonuç üretir ve uyarı ekler. Bu eşikler başlangıç değeridir; test setiyle kalibre edilir.

## 5. Çıktılar (tek fotoğraftan)
1. **Katalog görseli:** 1024×1024 (kaynak 2× sınırı içinde izin veriyorsa ayrıca 2048×2048), nötr zemin, standart kadraj.
2. **Yakın plan:** Aynı fotoğrafın en net bölgesinden, yerel piksellerle (büyütmesiz) 1024×1024 kırpım.
3. **Renk çipi:** Kumaşın baskın rengi (HEX + yaklaşık Türkçe renk adı); baskılı/çok renkli kumaşta ilk 3 renk.
4. **İşlem kaydı (JSON):** Uygulanan adımlar, dozlar, ölçümler, uyarılar.

## 6. Takyon Ai tarafındaki akış
1. Ürün ekle → "Fotoğraf çek / yükle" (kamera ekranında tek satır ipucu: "Gün ışığında, flaşsız, kumaşı düz serin").
2. Kalite kapısı başarısızsa sade Türkçe mesaj + "Tekrar çek" (örn. "Fotoğraf bulanık çıktı, telefonu sabit tutup tekrar çekin").
3. İşlem bitince **önce/sonra onay ekranı:** "Onayla" (dolu düğme) · "Orijinali kullan" (kenarlıklı).
4. Katalogda işlenmiş görsel; ürün detayında "Orijinal fotoğraf" bağlantısı ve renk notu.
5. Tüm arayüz DESIGN.md kurallarına uyar.

## 7. Test seti ve kabul ölçütleri
- En az 40 gerçek telefon fotoğrafı: Melide ve beta firmalarından. Zorunlu zor vakalar: siyah kumaş, beyaz kumaş, parlak likralı raschel, yarı saydam dantel/tül, baskılı desen, kırışık çekim, eğik açı, sarı iç mekân ışığı, flaşlı çekim.
- Her çalıştırmada önce/sonra karşılaştırma sayfası (HTML) + ölçüm tablosu üretilir.
- **Kabul:** Test setinin ≥ %90'ı sadakat denetimini geçer; katalog görselleri yan yana konduğunda kadraj, zemin ve yakınlık tutarlı görünür; hiçbir çıktıda uydurulmuş doku yoktur (insan kontrolü: Fırat).

## 8. Aşamalar
- **Faz 1 (bu proje):** Adımlar 0–9, sadakat denetimi, API, Takyon Ai onay akışı, test seti ve karşılaştırma sayfası.
- **Faz 2:** Dökümlülük ve ürün üzerinde görünüm (üretken; yalnızca "Görselleştirme" etiketiyle, katalog görselinden ayrı).
- **Faz 3:** 3D dijital kumaş dışa aktarımı (CLO vb.), esneme videosu.

## 9. Yapılmayacaklar
Üretken görsel modeliyle "iyileştirme", kırışık silme veya büyütme · bölgesel renk değişikliği · orijinali silme · firmadan kart/ekipman isteme · sahte doku ekleme · onaysız yayın.
