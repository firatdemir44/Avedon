# Faz 3 (Güven ve veri) - sıralı uygulama planı

**Kaynak:** `docs/yol-haritasi.md` §6 Faz 3, §5 beceri 16-17 · **Tarih:** 2026-09-18 · **Durum:** onaylandı (kararlar 2026-09-18, en altta); Adım 1-2 (2026-09-18) ve Adım 3 (2026-09-21) ve Adım 7 (DPP hazırlık, 2026-09-21) tamamlandı, telefonda kontrol bekliyor; kalan: Adım 4 → 5 → 6 (gerçek kullanım verisi ister) · Hazırlayan: Claude (Fable 5.1), Faz 1-2 kodu üzerinden.

Faz 2'nin bıraktığı zemin: bildirimler ve izleme, teklif akışı (istek → taslak → gönderim → kabul/ret), satıcı asistanı (fiyat vermez), makine parkı ve fason kapasite araması, iplik dizini, karşılıklı referans ve doğrulama düzeyi. Faz 3'ün amacı: platformda biriken **işlem verisini güvene ve karara** çevirmek. Alıcı "kime güveneyim, hangi teklif iyi, bu kumaşın benzeri kimde" sorularına platformun içinden cevap alır.

**Ön koşul uyarısı:** Bu fazın yarısı (güven puanı, fiyat endeksi) gerçek kullanıcı verisiyle anlam kazanır. Kod şimdi yazılabilir ama değer, SMS girişi açılıp gerçek firmalar teklif alıp vermeye başlayınca ortaya çıkar. Bu yüzden sıra, **veri beklemeyen** işlerden başlıyor.

## Sıra ve gerekçe

| # | Adım | Veri bekler mi | Neden bu sırada |
|---|---|---|---|
| 1 | Çoklu teklif isteme + teklif karşılaştırma | Hayır | Teklif akışının doğal devamı; tek alıcıyla bile işe yarar |
| 2 | Asistanlar arası teklif isteme (beceri 16) | Hayır | Adım 1'in üstüne asistan katmanı: "bu kumaştan 3 firmadan teklif topla" |
| 3 | Benzer kumaş arama (beceri 17) | Hayır (katalog yeter) | Alıcıyı uygulamaya çeken en görünür özellik |
| 4 | Sipariş kaydı + karşılıklı değerlendirme | Kısmen | Güven puanının ham verisi; önce kayıt başlamalı |
| 5 | Güven puanı | Evet | Adım 4 verisi + referans + doğrulama + yanıt hızı |
| 6 | Anonim fiyat / termin endeksi | Evet | Yeterli teklif birikince; eşik altında gösterilmez |
| 7 | AB Dijital Ürün Pasaportu dışa aktarımı | Hayır | Bağımsız; ihracatçıya somut fayda, mevzuat takvimi doğrulanacak |

"Web sürümü" yol haritasında Faz 3'te yazıyor ama zaten var (Vercel); ayrı adım değil, her adım web'de de denenir.

---

## Adım 1 - Çoklu teklif isteme ve karşılaştırma

**Büyüklük:** orta. **Görünür:** alıcı bir ihtiyacı bir kez yazar, birden çok firmaya gider; gelen teklifler yan yana tabloda.

- `Rfq (buyerId, title, specJson, quantity, unit, targetDate, note, status)`: ürüne bağlı olmayan **ihtiyaç tanımı** (çeşit, gramaj aralığı, en, lif, sertifika - bugünkü ürün süzgeciyle aynı şema). Bugünkü `QuoteRequest` bir ürüne bağlı; `rfqId` alanı eklenerek bir RFQ'nun altında toplanır (yalnızca sütun eklenir, tablo yeniden kurulmaz).
- Alıcı akışı: ürün listesinde süzgeç sonuçlarından ya da favorilerden 2-5 ürün seç → "Hepsinden teklif iste" → tek form (miktar, termin, not) → her satıcıya ayrı `QuoteRequest`.
- Karşılaştırma ekranı: satırlar = teklifler; sütunlar = birim fiyat (aynı birime ve para birimine çevrilmiş; kur **elle girilir**, otomatik kur çekilmez), MOQ, termin, ödeme koşulu, geçerlilik, firma doğrulama + referans sayısı. En düşük fiyat / en kısa termin işaretlenir. Birim çevrimi (m ↔ kg) mevcut `fabricLengthWeight` becerisiyle, gramaj ve en ürün kaydından.
- Satıcılar birbirinin teklifini ve kaç firmaya gidildiğini görmez.
- Test: fiyat sızıntısı (satıcılar arası), birim/para çevrimi, kısmi yanıt (3 istekten 1'i geldi), süre dolumu.

## Adım 2 - Asistanlar arası teklif isteme (beceri 16)

**Büyüklük:** orta. **Görünür:** alıcı asistanına "180-200 gr %95 pamuk %5 elastan süprem, 2 ton, 3 hafta; teklif topla" der.

- Alıcı asistanına `teklif_topla` aracı: katalogda arar → aday ürünleri listeler → **kullanıcı onaylar** (asistan kendi başına istek göndermez; hafıza/izleme kartlarındaki onay deseni) → Adım 1'deki RFQ oluşur.
- Satıcı tarafı: bugünkü kural değişmez, **satıcı asistanı fiyat vermez**. Satıcı asistanı yalnızca taslağı hazırlar (`quoteDraft` becerisi, ürün kaydındaki fiyattan), satıcı onaylayıp gönderir. "Asistanlar arası" = iki tarafta da asistan hazırlığı yapar, insan onaylar.
- Teklifler gelince alıcı asistanı özetler: "3 tekliften en ucuzu X, en hızlısı Y; Z'nin MOQ'su ihtiyacınızın üstünde."
- Test: onaysız gönderim yok, fiyat yalnızca taraflara, günlük istek sınırı (spam'e karşı).

## Adım 3 - Benzer kumaş arama (beceri 17)

**Büyüklük:** büyük. **Görünür:** "Fotoğraf çek, benzerini bul" ve ürün sayfasında "Benzer kumaşlar".

- **Yöntem kararı (teknik, Claude önerisi):** ilk sürüm **özellik tabanlı**. Ürün fotoğrafı yüklenince Claude görselden yapılı bir "görünüm kartı" çıkarır (desen türü: düz/çizgili/ekose/çiçekli/jakar/dantel motifi..., desen ölçeği, ana renkler, yüzey: mat/parlak/tüylü/şardonlu, doku: file/tül/rib/havlu, şeffaflık). Benzerlik = bu kart + pasaport alanları (çeşit, gramaj, lif) üzerinden puanlama. Gerekçe: yeni altyapı ve yeni sağlayıcı gerektirmez, sonuç **açıklanabilir** ("aynı desen türü, yakın gramaj"), tekstilcinin diliyle süzülebilir. Görsel gömme (embedding) servisi ikinci aşama: özellik tabanlı yöntem yetersiz kalırsa eklenir (ayrı sağlayıcı anahtarı, vektör saklama).
- `ProductLook (productId, lookJson, model, createdAt)`; fotoğraf eklenince/değişince arka planda çıkarılır; mevcut ürünler için tek seferlik doldurma betiği (canlıda ürün az, maliyet düşük).
- Arama: alıcı fotoğraf yükler → aynı kart çıkarılır → aday ürünler puanlanır → ilk 20. Asistan aracı `benzer_kumas_ara`.
- Dürüstlük sınırı: fotoğraftan **gramaj ve lif okunmaz**; yalnızca görünüm eşleşir. Ekran bunu söyler ("görünüşe göre benzer; gramaj ve içerik için ürün sayfasına bakın").
- Test: aynı ürünün farklı fotoğrafı ilk sıralarda mı, düz/desenli ayrımı, fotoğrafsız ürünler, maliyet sınırı (kullanıcı başına günlük arama).

## Adım 4 - Sipariş kaydı ve karşılıklı değerlendirme

**Büyüklük:** orta. **Görünür:** kabul edilen teklif "sipariş"e döner; teslimden sonra iki taraf birbirini değerlendirir.

- `Deal (quoteId, buyerCompanyId, sellerCompanyId, agreedDeliveryDate, status: acik|teslim_edildi|iptal, deliveredAt)`: kabul edilen tekliften doğar. Platform ödeme almaz, sevkiyat takip etmez; yalnızca **iki tarafın beyanı**.
- Teslim beyanı: satıcı "teslim ettim" der, alıcı onaylar (ya da itiraz eder). Geç teslim = beyan edilen tarih - anlaşılan tarih.
- Değerlendirme (iki yönlü, yalnızca tamamlanan işte): alıcı → satıcı: kalite numuneye uygun mu, termin tuttu mu, iletişim; satıcı → alıcı: iletişim, işin ciddiyeti (ödeme konusuna girilmez; Fırat kararı). Kısa yorum isteğe bağlı. Değerlendirmeler **iki taraf da yazınca ya da 14 gün sonra** açılır (misilleme puanını önlemek için).
- Test: yalnızca taraflar değerlendirebilir, tek iş = tek değerlendirme, açılma kuralı, itiraz durumu.

## Adım 5 - Güven puanı

**Büyüklük:** orta. **Görünür:** firma sayfasında "Güven özeti" kartı.

- Tek bir sihirli sayı yerine **bileşenleri görünen** özet: doğrulama düzeyi (belge/ziyaret), onaylı referans sayısı, tamamlanan iş sayısı, zamanında teslim oranı, ortalama değerlendirme, tekliflere ortalama yanıt süresi, platformdaki süre. İstenirse bunlardan 0-100 arası tek puan da üretilir (ağırlıklar dokümanda açık).
- **Eşik:** 3'ten az tamamlanan işi olan firmada oran/ortalama gösterilmez ("henüz yeterli veri yok"); yeni firmalar cezalandırılmaz.
- Puan kimseye satılmaz, ücretle yükseltilmez; hesap yöntemi uygulamada açıkça yazar.
- Aramalarda "güvene göre sırala" seçeneği.
- Test: eşik altı gizleme, tek kötü değerlendirmenin etkisi, kendi kendini değerlendirme imkânsız (aynı firma/bağlı kullanıcı).

## Adım 6 - Anonim fiyat / termin endeksi

**Büyüklük:** orta. **Görünür:** "%100 pamuk 30/1 süprem, 140-160 gr: son 90 günde teklifler 3,10-3,60 USD/kg, tipik termin 12-18 gün".

- Kaynak: **gönderilmiş teklifler** (liste fiyatı değil). Kümeleme: çeşit + alt çeşit + ana lif + gramaj bandı (+ iplikte numara bandı).
- **Anonimlik kuralı:** bir kümede en az 5 farklı satıcıdan en az 8 teklif yoksa hiçbir şey gösterilmez; yalnızca aralık (çeyrekler) ve ortanca gösterilir, tek tek teklif asla. Firma kendi teklifinin banda göre yerini görür.
- Katılım: teklif veren firma endekse veri sağlar; **varsayılan açık mı kapalı mı** Fırat kararı (aşağıda).
- Test: eşik altı sızıntı yok, tek satıcının baskın olduğu kümede gösterim yok, para birimi ayrımı.

## Adım 7 - AB Dijital Ürün Pasaportu (DPP) dışa aktarımı

**Büyüklük:** orta. **Görünür:** ürün sayfasında "Dijital pasaport" → QR kodlu herkese açık sayfa + PDF/JSON.

- Kumaş pasaportundaki alanlar (lif içeriği, menşe, sertifikalar, test raporları, üretici) DPP'nin beklediği başlıklara eşlenir; eksik alanlar "DPP için eksikler" listesi olarak satıcıya gösterilir.
- Herkese açık, oturumsuz ürün pasaportu sayfası (fiyatsız, stoksuz) + QR; etiket/kartelaya basılabilir.
- **Önce doğrulanacak (kod yazmadan):** AB ESPR kapsamında tekstil için yetkilendirilmiş düzenlemenin güncel durumu, zorunlu veri alanları ve takvim resmi AB kaynaklarından okunacak. Şema kesinleşmediyse çıktı "DPP'ye hazırlık" olarak adlandırılır, "uyumlu" denmez.
- Test: fiyat ve ticari alanların dışa sızmaması, QR sayfasının oturumsuz açılması, eksik alan listesi.

---

## Bu fazda yapılmayacaklar

- **Escrow / ödeme aracılığı:** yol haritasında "ileride". Ödeme kuruluşu lisansı ve hukuki yapı gerektirir; Faz 3'te yalnızca beyan usulü sipariş kaydı var.
- Otomatik kur çekme, otomatik fiyat önerisi, satıcı asistanının fiyat vermesi (Fırat kararı: vermez).

## Kararlar (Fırat, 2026-09-18)

1. **Sıra onaylandı:** 1 → 2 → 3 → 7 (DPP) → 4 → 5 → 6.
2. **Çoklu teklif sınırı:** kime gideceğini ALICI seçer (işaretlediği ürünler). Fırat sınırın 5'ten yüksek olmasını istedi; Claude önerisi: tek seferde **10 firma**, aynı ihtiyaçta firma başına tek istek, alıcı başına günlük toplam sınır (30). Sayı kodda tek sabit; kullanımda ayarlanır. Satıcı kaç firmaya sorulduğunu görmez.
3. **Ödeme konusuna HİÇ girilmez:** değerlendirmede "ödeme zamanında mı" sorusu yok; platform ödeme ilişkisine karışmaz. Alıcı → satıcı: kalite numuneye uygun mu, termin, iletişim. Satıcı → alıcı: iletişim, işin ciddiyeti.
4. **Güven gösterimi:** yalnızca bileşenler; tek puan yok.
5. **Fiyat endeksi:** teklifler kendiliğinden dahil (anonim + eşikli).
6. **Benzer kumaş:** desen, ölçek, renk, yüzey, doku, şeffaflık.
