# Avedon — Ürün Vizyonu ve Yol Haritası (2027)

> Bu dosya deponun tek yetkili ürün yol haritasıdır. Claude Code oturumları yeni bir işe başlamadan önce `docs/yapilacaklar.md` ile birlikte bu dosyayı okur; mevcut kodla çelişen bir ürün kararı gerekirse önce bu dosya güncellenir.
> Kaynak: 2021 Takyon Ai "Avedon" ürün belgesi + Eylül 2026 yeniden tasarım görüşmeleri.
> Faz 1 için sıralı uygulama planı: `docs/faz1-plani.md`.

## 1. Tek cümle

Avedon, tekstil sektörünün işletim sistemidir: her firmanın kendi adına 7/24 çalışan bir yapay zeka asistanı vardır; kumaşlar makine tarafından okunabilir bir "kumaş pasaportu" ile tanımlanır; firmalar birbirini bulur, numune ister, maliyet hesaplar ve ticareti bu asistanlar üzerinden yürütür.

## 2. 2021'den ne kaldı, ne değişti

Kalanlar: firma sayfası, ürün sayfası, kategori kataloğu, numune talebi ve süreç takibi, mesajlaşma, firma doğrulama, bağlantı kurma, **ürün akışı** (bağlantıdaki firmaların yeni kumaş ve tanıtımlarını gösteren ve numune talebini hızlandıran vitrin — sosyal medya akışı değildir), 24 saatlik duyurular (fuar, koleksiyon, yeni makine parkı).

Değişenler:
- Ürünün kimliği "B2B sosyal medya" değil, "asistan + pasaport + ağ". Beğeni/yorum yerine ticari eylemler: *numuneye ekle*, *takibe al*, *teklif iste*.
- Ürün verisi serbest metin değil, yapılandırılmış kumaş pasaportudur (bkz. §4).
- Her firmanın bir asistanı vardır; hesaplayıcılar ve tekstil bilgisi ayrı ekranlar değil, bu asistanın becerileridir (bkz. §5).
- Kanal olarak WhatsApp birinci sınıf vatandaştır; uygulama arka ofistir.
- Mobil öncelikli (React Native), web sürümü tamamlanmaya yakın eklenir.

## 3. Değişmez ilkeler

1. **Hesabı yapay zeka tahmin etmez, kod hesaplar.** Fiyat, fire, işçilik gibi girdileri kullanıcı verir; formüller deterministik kodda yaşar; LLM eksik veriyi sorar, makullük kontrolü yapar, sonucu anlatır.
2. **Belirsiz olan her alan kullanıcıya onaylatılır.** Belge/fotoğraftan çıkarılan her alanın güven skoru vardır; düşük güvenli alanlar arayüzde işaretlenir ve tek dokunuşla onaylanır/düzeltilir.
3. **Tek sözlük.** Eşanlamlılar (süprem = single jersey = tek plaka) ve birimler (denye / dtex / Ne / Nm, g/m² / metretül) tek bir normalizasyon katmanından geçer. Bu katman tüm hesaplayıcılar ve arama tarafından paylaşılır.
4. **Beceriler eklenebilir.** Yeni bir özellik = yeni bir beceri dosyası. Asistanın çekirdeği değişmez.
5. **Teknik kararları Claude verir, tekstil bilgisini Fırat verir.** Formüller, fire oranları, terminoloji ve makullük aralıkları Fırat'tan gelir; `skills/` altındaki dosyalara onun ifadesiyle işlenir.

## 4. Kumaş pasaportu (veri modeli)

Her ürün kaydının çekirdeği. Alanlar (hepsi opsiyonel, her biri `value + confidence + source` taşır):

| Alan | Örnek | Not |
|---|---|---|
| kompozisyon | [{polyester 92}, {elastan 8}] | oranlar toplamı 100 kontrolü |
| gramaj_gsm | 220 | örgü tipine göre makullük aralığı |
| en_cm | 180 | açık en / tüp en ayrımı |
| orgu_tipi | süprem / interlok / raschel / … | sözlükten normalize |
| iplik | {numara, birim, tip (DTY/FDY/…)} | birim dönüşümü otomatik |
| elastan_orani | 8 | kompozisyondan türetilebilir |
| boya_apre | serbest metin + etiketler | |
| sertifikalar | [{ad, no, gecerlilik}] | OEKO-TEX, GRS, GOTS, … |
| test_raporlari | [{tip, sonuc, dosya}] | |
| ticari | {moq, termin_gun, fiyat_birim} | fiyat isteğe bağlı/gizli olabilir |
| medya | fotoğraflar, kartela görseli | |

Girdi yolları: etiket/kartela fotoğrafı, test raporu PDF/foto, fiyat listesi Excel, WhatsApp'tan yapıştırılan metin, sohbette serbest metin. Hepsi aynı çıkarım servisinden geçer → yapılandırılmış JSON + güven skorları → onay ekranı → kayıt.

İleri faz: AB Dijital Ürün Pasaportu (ESPR) formatına dışa aktarma; top üzerine QR/NFC.

## 5. Firma asistanı ve beceri kataloğu

Asistan = LLM orkestratörü + firma hafızası + beceri seti.

**Firma hafızası:** firmanın kendi fire oranları, fasoncu fiyatları, sık kullanılan kaliteler, önceki hesaplar, katalog, stok/MOQ/termin politikası.

**Beceriler (`skills/<ad>/`):** her biri `girdi şeması + formül/kod + makullük kuralları + açıklama metni` içerir.

Mevcut durum: 1–7 ve 9 zaten **ayrı ekranlar** olarak kodda var (`mobile/src/screens/*Calculator*`, `AdvisorScreen`, `GarmentVisualCostScreen`; formüller `mobile/src` altında deterministik). Yapılacak iş bunları yeniden yazmak değil, **hesap motorlarını backend'e taşıyıp asistanın araçları olarak kaydetmek**; ekranlar aynı motoru çağırmaya devam eder.

| # | Beceri | Faz | Durum |
|---|---|---|---|
| 1 | Kumaş maliyeti hesapla | MVP | ekran var → asistan aracı yapılacak; formül Fırat ile doğrulanacak |
| 2 | Üretim hesaplama | MVP | ekran var → asistan aracı yapılacak; formül Fırat ile doğrulanacak |
| 3 | İplik numarası çevir (Ne/Nm/denye/dtex) | MVP | ekran var → asistan aracı |
| 4 | İplik numarası hesapla | MVP | ekran var → asistan aracı |
| 5 | İplik kullanım oranı | MVP | ekran var → asistan aracı |
| 6 | Kumaş gramajı hesapla | MVP | ekran var → asistan aracı |
| 7 | Konfeksiyon maliyeti (tablo) | MVP | ekran var → asistan aracı |
| 8 | Görselden konfeksiyon maliyet iskeleti | MVP | `garmentAnalysis` var → asistan aracı; fiyat tahmini yok |
| 9 | Tekstil bilgi asistanı (örme, boya, apre, terminoloji) | MVP | `advisor` var → firma asistanının çekirdeği olur |
| 10 | Pasaport çıkarımı (belge/foto → pasaport) | MVP | yeni; §4 |
| 11 | Katalog soru-cevap (satıcı asistanı müşteriye cevap verir) | Faz 2 | |
| 12 | Teklif taslağı hazırla | Faz 2 | |
| 13 | Fason makine / kapasite ara | Faz 2 | |
| 14 | İplik tedarikçisi bul | Faz 2 | |
| 15 | Akış izleme ("bu kalitede yeni ürün çıkınca haber ver") | Faz 2 | |
| 16 | Alıcı asistanı → satıcı asistanı RFQ (asistanlar arası) | Faz 3 | |
| 17 | Benzer kumaş görsel arama | Faz 3 | |

## 6. Fazlar

### Faz 0 — Mevcut kod (Eylül 2026, canlıda)
Telefonla kayıt/giriş, firma profili ve doğrulama, ürün CRUD (`Product`: code, type, stock, weightGsm, widthCm, content, useArea, imageUrl), firma/ürün arama, numune talebi ve durum akışı, altı hesaplayıcı ekranı, AI danışman, görselden konfeksiyon bileşen tespiti, WhatsApp şablon mesajı (best-effort) ve webhook (yalnızca loglar), admin doğrulama. Backend Render + SQLite, mobil Expo 57. Ayrıntı: `docs/durum.md`; açık işler: `docs/yapilacaklar.md`.

Bu kod **yeniden yazılmaz, genişletilir**.

### Faz 1 — MVP'yi vizyona hizalama (hedef: ilk gerçek kullanıcılar)
- `Product` modelini kumaş pasaportu şemasına genişletme (mevcut alanlar korunur; kompozisyon, örgü tipi, iplik, sertifikalar, ticari alanlar ve alan başına güven/kaynak eklenir; migration canlı veri üzerinde prova edilir — bkz. `CLAUDE.md`)
- Pasaport çıkarım servisi (etiket/kartela/test raporu/fiyat listesi → JSON + güven skoru) ve onay ekranı; `AddProductScreen`'e "fotoğraftan doldur" girişi
- Sözlük ve birim dönüşüm katmanı (backend'de tek yer; hesaplayıcılar ve arama bunu kullanır)
- Firma asistanı: `advisor` uç noktasını araç kullanan bir orkestratöre dönüştürme; hesap motorlarını backend'e taşıyıp araç olarak kaydetme (beceri 1–9); firma hafızası
- Ürün akışı ekranı: bağlantıdaki firmaların pasaport kartları, "numune talep et" ve "takibe al" düğmeleri (mevcut kullanıcı düzeyi bağlantı modeli kullanılır; firma düzeyi bağlantı Faz 2 sorusu)
- WhatsApp: webhook'u asistana bağlama (gelen soru → asistan cevabı), numune talebi bildirimleri (mevcut)
- SMS sağlayıcısının bağlanması (kimlik doğrulama kodda hazır: telefon doğrulamalı tek kullanımlık kod + 30 günlük imzalı oturum, sahiplik kontrolleri sunucuda; kodlar şu an yalnızca sunucu kayıtlarına düşüyor) — pilot öncesi şart
- Ücretsiz kanca: hesaplayıcılar ve bilgi asistanı ücretsiz kalır

### Faz 2 — Ağ
- Satıcı asistanı müşteri sorularına kataloğa dayanarak cevap verir (beceri 11–12)
- Fason kapasite ağı, iplik tedarikçi dizini (13–14)
- Akış izleme ve bildirimler (15)
- Davet mekaniği: "tedarikçini davet et, kataloğunu asistanın görsün"
- Doğrulanmış firma rozeti, karşılıklı referans

### Faz 3 — Güven ve veri
- Asistanlar arası RFQ ve teklif karşılaştırma (16)
- Görsel benzer kumaş arama (17)
- Güven/itibar skoru (teslimat ve ödeme geçmişi), ileride escrow
- Anonim fiyat/termin endeksi
- AB Dijital Ürün Pasaportu dışa aktarımı
- Web sürümü

### Faz 4 — Sektör genişlemesi
2021 belgesindeki plana uygun olarak tekstil dışı kategoriler (üst kategori seçimi).

## 7. Teknik notlar (Claude Code için)

- Mobil: React Native. Beceriler ve çıkarım servisi sunucu tarafında; istemci yalnızca arayüz.
- LLM çağrıları tek bir `assistant` servisinden geçer; beceriler araç (tool) olarak kaydedilir; her beceri kendi JSON şemasını tanımlar.
- Hesap motorları saf fonksiyon olarak yazılır ve birim testlidir; LLM'den bağımsız çalışır.
- Çıkarım servisi görsel + metin girdisi alır, `PassportExtraction` döner (alan → {value, confidence, source}).
- Sözlük/normalizasyon: `domain/glossary` altında; eşanlamlı tablosu ve birim dönüşümleri burada, tek yerde.
- Firma hafızası: firma başına yapılandırılmış kayıt (fire oranları, fiyat listeleri, tercihler); asistan her çağrıda okur.
- Yeni özellik fikri geldiğinde: önce bu dosyada §5 tablosuna satır eklenir, sonra `backend/src/skills/` altında dosya açılır; hesap motorları saf fonksiyon + birim test olarak `backend/src/domain/` altında yaşar.

## 8. Açık konular

- Uygulama adı: "Avedon" geçici; ürün oturunca yeniden değerlendirilecek.
- AB Dijital Ürün Pasaportu tekstil takvimi ve zorunlu alanlar araştırılacak; sonuç §4'e işlenecek.
- Fiyatlandırma: 2021 modeli (3 ay ücretsiz, sonra aylık ücret) ve rakip (kişi başı yıllık) karşılaştırılacak; hesaplayıcı ve bilgi asistanı katmanı ücretsiz kalacak.
- Beceri 1 ve 2 formülleri: Fırat'tan bekleniyor (girdi kalemleri, fire uygulama noktası, kg mi metre mi bazlı çıktı).
