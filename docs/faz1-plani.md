# Faz 1 - Sıralı uygulama planı

**Kaynak:** `docs/yol-haritasi.md` §6 Faz 1 (vizyon §4 kumaş pasaportu, §5 asistan ve beceriler, §7 teknik notlar) · **Tarih:** 2026-09-16 · **Durum:** plan, Fırat'ın onayını bekliyor. Hazırlayan: Claude (Fable 5.1), mevcut kod okunarak.
Mevcut durum `docs/durum.md`, açık işler `docs/yapilacaklar.md`. Aşama A (katalog derinliği, çoklu fotoğraf, filtreler, favoriler, son bakılanlar) ve Aşama B (firma sekmeleri, firma bilgileri, galeriler) canlıda; bu plan onların üzerine ekler, hiçbirini geri almaz.

Okunan kod: `schema.prisma`, `catalog.ts`, `products.ts`, `routes/products.ts`, `validation.ts`, `routes/advisor.ts`, `routes/garmentAnalysis.ts`, `whatsapp.ts`, `routes/whatsappWebhook.ts`, `sms.ts`, `otp.ts`, `mobile/src/features/calculators/formulas.ts`, `AddProductScreen.tsx`, `scripts/test-catalog-api.ts`, `scripts/check-catalog.ts`.

## Yol haritasında düzeltilen iki nokta (2026-09-16'da işlendi)

1. **"Gerçek kimlik doğrulama (SMS + imzalı oturum)" kodda zaten bitmiş.** Telefon doğrulamalı tek kullanımlık kod (`PhoneOtp`, HMAC ile saklanan kod, 5 dk geçerlilik, 5 deneme, 60 sn bekleme) ve 30 günlük imzalı oturum (JWT) canlıda; ürün, numune, admin uçlarında sahiplik kontrolü sunucuda. Eksik olan tek şey **gerçek SMS gönderimi**: `backend/src/sms.ts` içinde sağlayıcı yok, kodlar Render kayıtlarına düşüyor. Madde artık şöyle: *"SMS sağlayıcısı bağlanması (kimlik doğrulama kodda hazır; kodlar şu an yalnızca sunucu kayıtlarına düşüyor), pilot öncesi şart."*
2. **"Bağlantı (connection) modeli" zaten var** (`Connection`, kullanıcı düzeyinde, pending/accepted). Ürün akışı maddesi yeni model istemez; mevcut modeli kullanır (bkz. Adım 6).

## Sıra ve gerekçesi

Fırat'ın tercihi: ilk adım "ürün modelinin pasaport şemasına genişletilmesi + sözlük katmanı", asistan bunun üzerine gelir. Plan bu sıraya göre kuruldu ve teknik olarak da doğru sıra bu:

1. **Sözlük ve birim katmanı** (Adım 1) ile **pasaport şeması** (Adım 2) birlikte ilk dilimdir. Sözlük, şemanın bir gün önce çıkması gereken parçasıdır: kompozisyon satırlarındaki lif anahtarları ("pamuk", "polyester") ve "%95 Pamuk %5 Elastan" metninin ayrıştırılması sözlükten gelir; sözlük olmadan pasaport alanları doğrulanamaz. İkisi tek migration ile canlıya çıkar. Kullanıcı gözüyle ilk kazanım: ürün formunda yapılandırılmış içerik, MOQ, termin, sertifika; filtrede lif araması.
2. **Pasaport çıkarımı ve onay ekranı** (Adım 3): şemaya yazacak bir şeyi olmadan çıkarım servisi anlamsız; bu yüzden şemadan sonra.
3. **Hesap motorlarının backend'e taşınması** (Adım 4): asistanın araçları bunlar. Şemadan bağımsız, Adım 3 ile paralel yürütülebilir.
4. **Firma asistanı** (Adım 5): araç kullanması için Adım 4 motorları, katalog araması için Adım 2 pasaport alanları gerekir.
5. **Ürün akışı pasaport kartları** (Adım 6): pasaport alanları dolmaya başladıktan sonra anlamlı.
6. **WhatsApp'ı asistana bağlama** (Adım 7): asistan hazır olmadan bağlanacak bir şey yok.
7. **SMS sağlayıcısı** (Adım 8): diğerlerinden bağımsız, Fırat sağlayıcı hesabını açtığı an yapılır; pilot öncesi şart olduğu için sıra beklemez.

**Değerlendirilen ve reddedilen sıra:** "Önce asistan, sonra pasaport" (asistan daha görünür olduğu için). Reddedildi: asistanın kataloğu araması için pasaport alanları, hesap yapması için backend motorları gerekir; asistan önce çıkarsa iki ay sonra araçları eklenirken sohbet akışı ve ekran yeniden ele alınır. Bu, `CLAUDE.md`'deki "geriye dönüp tekrar ileri yapmayalım" kuralına aykırı.

**Her adım için geçerli kurallar:** tek başına canlıya çıkabilir; eski uygulama sürümleri çalışmaya devam eder (yeni alanlar isteğe bağlı); veritabanı değişiklikleri `prisma migrate diff` ile üretilir ve yerel veritabanı kopyasında prova edilir; her adım kendi testleriyle biter; adım sonunda `docs/yapilacaklar.md` güncellenir.

**Klasör adları yol haritası §7'ye göre:** sözlük `backend/src/domain/glossary/`, hesap motorları `backend/src/domain/calc/`, beceriler `backend/src/skills/`, asistan çekirdeği `backend/src/assistant/`.

**Test altyapısı (Adım 1'de kurulur, sonraki adımlar kullanır):** birim testleri Node'un kendi test çalıştırıcısıyla, `node --import tsx --test "src/**/*.test.ts"` (tsx zaten kurulu, yeni paket gerekmez; Node 24 var). `package.json`'a `"test"` komutu eklenir. Uçtan uca API testleri mevcut `scripts/test-catalog-api.ts` kalıbıyla (çalışan yerel sunucuya karşı kendi test firmalarını açıp silen script) yazılır.

---

## Adım 1 - Sözlük ve birim dönüşüm katmanı

**Büyüklük:** orta. **Görünür değişiklik:** yok (altyapı).

### Ne yapılacak
Yeni klasör `backend/src/domain/glossary/`:
- `fibers.ts`: lif anahtarları ve etiketleri (`pamuk`, `polyester`, `elastan`, `viskon`, `naylon`, `yun`, `akrilik`, `keten`, `modal`, `tencel`, `poliamid` ...) ve eşanlamlı tablosu (pamuk = cotton = CO = coton; polyester = PES = PET = poly; elastan = spandex = lycra = likra = EA = EL; viskon = viscose = CV; naylon = nylon = PA = poliamid ...). Katalog dosyasıyla aynı ilke: veritabanında yalnızca anahtar saklanır, etiket gösterim içindir, anahtar silinmez.
- `knits.ts`: örgü tipi eşanlamlıları, **hedef mevcut `subtype` anahtarları** (süprem = single jersey = tek plaka = suprem → `suprem`; interlok = interlock → `interlok`; ribana = rib = 1x1 rib → `ribana` ...). Örgü tipi için yeni bir alan açılmaz: yol haritası §4'teki "orgu_tipi" alanı kodda zaten `Product.subtype` (Aşama A). Sözlük yalnızca "hangi yazım hangi anahtara gider" katmanını ekler.
- `certificates.ts`: sertifika adları (OEKO-TEX Standard 100, GRS, GOTS, OCS, BCI, RCS, bluesign ...) ve yazım varyantları.
- `units.ts`: iplik numarası çevrimleri (Ne, Nm, tex, dtex, denye; mevcut `toTex`/`fromTex`/`convertYarnCount` mantığının birebir kopyası, aynı 1.693 sabiti), gramaj/en/metretül ilişkisi (`metersPerKg`), açık en / tüp en ayrımı, birimli metin ayrıştırma ("180 cm", "180cm açık en", "30/1 Ne", "150 denye DTY").
- `composition.ts`: serbest metin → kompozisyon dizisi. "%95 Pamuk %5 Elastan", "95/5 CO/EA", "92 pes 8 ea", "100% Cotton" gibi yazımları `[{fiber:'pamuk', percent:95}, {fiber:'elastan', percent:5}]`'e çevirir; toplam 100 kontrolü ve güven değeri döner. Ters yönde `formatComposition` (dizi → "%95 Pamuk %5 Elastan").
- `normalize.ts`: ortak yardımcılar: Türkçe küçük harf (`toLocaleLowerCase('tr-TR')`, mevcut `catalog.ts`'teki `trLower` ile aynı), noktalama temizliği, eşanlamlı arama; sonuç her zaman `{ key, confidence, matchedText }`.
- `plausibility.ts`: makullük aralıkları: alt çeşide göre gramaj ve en aralığı, lif başına en fazla oran (ör. elastan %35 üstü şüpheli), kompozisyon toplamı. **Değerleri Fırat verir**; kod aralıkları dosyada tutar, "şüpheli" işareti üretir, kaydı **engellemez**.
- `index.ts`: dışa açılan tek yüz.

`catalog.ts`'e dokunulmaz; `matchCatalogKeys` (arama) bu adımda sözlükten eşanlamlı desteği kazanır ("single jersey" araması `suprem` alt çeşidini bulur). Bu, kullanıcıya görünen tek küçük iyileşme.

### Veri modeli kararları
- Sözlük **veritabanında değil kodda** yaşar (katalogla aynı karar): sürümlenebilir, testlenebilir, canlıda migration gerektirmez. Alternatif "veritabanında yönetilen sözlük" reddedildi: yönetim ekranı gerekir, kopya sorunu çözülmez, pilot için erken.
- Küçük etiket listeleri (lif, sertifika adı, en tipi) mobilde de kopya olarak durur (çevrimdışı etiket için; katalogla aynı desen) ve `scripts/check-catalog.ts` bu listeleri de karşılaştırır. **Eşanlamlı tablosu yalnızca backend'de**: normalizasyon sunucuda yapılır, mobil hiç yapmaz.

### Test
`backend/src/domain/glossary/*.test.ts`: birim çevrimlerinin gidiş-dönüşü (mevcut formül testlerindeki iki referans: 75 tex ≈ 8 Ne / 13 Nm), 30+ gerçek kompozisyon yazımı (Fırat'tan gelen atölye örnekleri dahil), eşanlamlı eşleşmeleri, Türkçe İ/ı, makullük sınırları, `matchCatalogKeys` eşanlamlı araması.

### Riskler
Yok denecek kadar az; mevcut davranış değişmiyor. Tek dikkat: arama eşanlamlıları yanlış eşleştirirse ("file" hem raschel alt çeşidi hem İngilizce kelime) sonuç kalabalıklaşır; eşleşme yalnızca tam kelime üzerinden yapılır, testte kontrol edilir.

### Fırat'tan gerekenler
- Lif ve örgü eşanlamlıları, özellikle atölye ağzı ve kısaltmalar (bir liste yeterli; kod tarafı Claude'da).
- Makullük aralıkları: alt çeşit başına gramaj ve en aralığı, lif oranı üst sınırları.
- Sertifika adları listesi (hangileri sıkça isteniyor).

---

## Adım 2 - Kumaş pasaportu veri modeli, API ve form

**Büyüklük:** büyük. **Görünür değişiklik:** ürün formu, ürün sayfası, filtreler.

### Ne yapılacak (veri modeli)
`Product` genişler; mevcut alanlar (code, type, subtype, usages, stock, stockUnit, weightGsm, widthCm, content, useArea, images) **aynen kalır**. Migration **yalnızca ekler**: yeni tablolar ve varsayılan değerli yeni sütunlar. Ondalık migration'ındaki gibi tablo yeniden kurma yok; risk sınıfı en düşük. Eski `imageUrl` ve `deliveryPreference` temizliği bu migration'a **karıştırılmaz** (ayrı temizlik işi kalır).

`Product` üzerine eklenen sütunlar (hepsi isteğe bağlı):
- `widthType String @default("")`: `""` | `acik` | `tup`.
- `moq Float?`, `moqUnit String @default("")` (`m` | `kg`; boşsa stok birimi kabul edilir), `leadTimeDays Int?`. (2026-09-13 kullanıcı kararı: MOQ ve termin görünsün.)
- `priceValue Float?`, `priceCurrency String @default("")` (`TRY`|`USD`|`EUR`), `priceUnit String @default("")` (`m`|`kg`). **Faz 1'de yalnızca ürünün sahibi firma görür; başkalarına hiçbir yanıtta dönmez.** Görünürlük seçenekleri (bağlantılara açık vb.) Faz 2'de gerekirse eklenir; bugün bir `priceVisibility` sütunu açmak kullanılmayan karmaşıklık olur.
- `finishTags String @default("[]")`: boya/apre etiketleri, `usages` ile aynı JSON dizi deseni (şardonlu, yıkamalı, peach, silikonlu ...). Liste Fırat'tan; gelmezse sütun boş kalır, ekranda görünmez.
- `passportUpdatedAt DateTime?`: pasaport alanları en son ne zaman değişti (akış kartı ve önbellek için).

Yeni tablolar:
- `ProductComposition (id, productId, position, fiber, percent)`; `@@unique([productId, position])`. Kompozisyon **doğruluk kaynağı**; `content` metni kompozisyon varsa sunucuda `formatComposition` ile üretilir (iki alan çelişemez). Eski istemci yalnızca `content` gönderirse sunucu `parseComposition` dener; güvenli sonuçta (toplam 100, tüm lifler tanınıyor) satırları yazar, aksi halde `content` düz metin kalır.
- `ProductYarn (id, productId, position, role, count, unit, ply, yarnType)`: role `""`|`ana`|`ilave`|`ekstra`; unit Ne/Nm/tex/dtex/denye; yarnType `DTY`|`FDY`|`ring`|`open_end`|`kompakt` (liste Fırat'tan).
- `ProductCertificate (id, productId, name, number, validUntil, imageUrl?)`: `name` sözlük anahtarı; belge fotoğrafı isteğe bağlı, ürün fotoğrafıyla aynı sınır (700.000 karakter data URL); liste yanıtlarında dönmez, `GET /api/products/:id/certificates/:position/image` ile çekilir (galeri deseni).
- `ProductTestReport (id, productId, kind, result, testedAt, imageUrl?)`: Faz 1'de üstveri + isteğe bağlı fotoğraf. PDF saklama ayrı bir depolama sorusudur (bugün her şey base64 SQLite'ta); Faz 1'de PDF yalnızca Adım 3'te **girdi** olarak kabul edilir, saklanmaz.
- `ProductFieldMeta (id, productId, field, confidence, source, confirmedAt)`; `@@unique([productId, field])`. "Her alan değer + güven + kaynak taşır" kuralının karşılığı. `source`: `manual` | `parsed_content` | `extracted` | `whatsapp`. Elle girilen alanlar için satır açılmaz (varsayılan: güven 1, kaynak manual); yalnızca çıkarım/ayrıştırma ile gelen alanlar satır alır, kullanıcı onaylayınca `confirmedAt` dolar. Ürün yanıtında `pendingFieldCount` (onay bekleyen alan sayısı) döner.

**Değerlendirilen ve reddedilen alternatifler:**
- *Kompozisyonu JSON metin olarak `Product`'ta tutmak:* "elastan oranı %5 ve üstü" gibi filtreler mümkün olmazdı; ayrı tablo Prisma ilişki filtresiyle (`compositions: { some: { fiber, percent: { gte } } }`) bunu verir. Bu yüzden ayrı bir `elastanPercent` sütunu da **açılmaz**: kompozisyondan türetilir, iki yerde tutulup ayrışmaz.
- *Alan üstverisini JSON sütununda tutmak:* "onay bekleyen alanı olan ürünler" sorgulanamaz, okuma-değiştirme-yazma yarışı olur. Tablo, `ProductImage` desenine de uyuyor.
- *Fiyat alanını hiç eklememek:* Faz 2'deki "teklif taslağı" becerisi (yol haritası #12) fiyatı asistanın okuması için ister; sahibe özel alan olarak şimdi eklenmesi ucuz, sonra eklenmesi form ve akışa iki kez dokunmak demek. Karar Fırat'ta (aşağıda).

### API değişiklikleri
- `POST /api/products`, `PATCH /api/products/:id`: `composition[]`, `yarns[]`, `certificates[]`, `testReports[]`, `widthType`, `moq`, `moqUnit`, `leadTimeDays`, `price*`, `finishTags[]` kabul eder; hepsi isteğe bağlı. `validation.ts`'e zod şemaları; sözlük anahtarları doğrulanır (`isValidSubtype` deseni). Kompozisyon toplamı 100 değilse **kayıt reddedilmez**, yanıtta `warnings: ['composition_total_98']` döner (yol haritası §3.2: belirsizlik kullanıcıya gösterilir, engellenmez).
- `GET /api/products/:id`: pasaportun tamamı (sertifika/test fotoğrafları hariç); fiyat yalnızca `req.user.companyId === product.companyId` ise.
- `GET /api/products` liste yanıtı hafif kalır: `composition` (kısa, birkaç satır) ve `certificateNames[]` eklenir; yarns/testReports eklenmez. Yeni filtreler: `fiber` (virgülle), `fiberMinPercent`, `certificate`, `moqMax`, `leadTimeMax`, `widthType`.
- `POST /api/admin/products/backfill-composition?dryRun=1`: mevcut canlı ürünlerin `content` metnini sözlükle ayrıştırıp `ProductComposition` yazar; `dryRun` ile önce ne yapacağını listeler (Render'da kabuk erişimi varsayılmaz; `CLAUDE.md` kuralı: sonucu ölçebilecek teşhisi hazırla). Yalnızca `isAdmin`.

### Mobil değişiklikler
- `mobile/src/types/index.ts` `Product` tipi genişler; `api/client.ts` yeni alanları taşır.
- `AddProductScreen`: "İçerik" metin kutusu yerine **kompozisyon satırları** (lif seçici + yüzde; toplam göstergesi; eski `content` düzenlenirken sunucu ayrıştırmışsa satırlar dolu gelir, ayrıştıramamışsa metin kutusu düz metin olarak kalır ve "satırlara böl" düğmesi çıkar). Yeni bölümler: "Ticari" (MOQ, birim, termin, fiyat [yalnızca sahibe]), "İplik" (isteğe bağlı satırlar), "Sertifikalar" (ad, no, geçerlilik, fotoğraf), "En tipi" çipleri. Form uzadığı için bölümler daraltılabilir (`SectionHeader` deseni).
- `ProductDetailScreen`: özellikler kartına kompozisyon çubuğu, MOQ/termin satırı, sertifika rozetleri, onay bekleyen alanlarda sarı işaret (sahibine).
- `ProductFiltersScreen`: lif ve sertifika filtreleri, MOQ üst sınırı.
- `features/products/catalog.ts`: lif/sertifika/en tipi/apre etiketleri; `check-catalog.ts` genişler.

### Test
- `scripts/test-passport-api.ts` (katalog testi kalıbı): pasaport yaz/oku, kompozisyon toplamı 98 → 201 + uyarı, `content`'ten otomatik ayrıştırma, eski istemci uyumu (yeni alansız POST çalışır; `content` yine zorunlu), fiyat sızıntısı (başka firma ve oturumsuz kullanıcı fiyatı görmez; liste ve detay JSON'unda `priceValue` yok), lif filtresi, sertifika filtresi, MOQ filtresi, sertifika fotoğrafı liste yanıtında yok, ürün silinince alt tablolar cascade ile gidiyor, backfill dry-run hiçbir şey yazmıyor.
- Migration provası: canlı yapıya eş yerel kopya üzerinde `migrate deploy`, ardından mevcut ürünlerin değerleri birebir, yeni tablolar boş, backfill dry-run raporu makul.
- Tarayıcı kontrolü 375 px'te form ve detay; telefonda kontrol.

### Riskler ve karşı önlemler
- Form uzayıp ürün eklemeyi zorlaştırır → tüm yeni bölümler isteğe bağlı ve varsayılan daraltılmış; zorunlu alanlar Aşama A'dakiyle aynı.
- Ayrıştırıcı yanlış kompozisyon yazar → yalnızca yüksek güvende yazar, `ProductFieldMeta.source = parsed_content` ile işaretlenir, sahibi ürün sayfasında görüp onaylar/düzeltir.
- Liste yanıtı büyür → kompozisyon en fazla 5 satır, sertifika yalnızca ad; fotoğraflar ayrı uçtan.

### Fırat'tan gerekenler
- Fiyat kararı: (a) sahibe özel alan olarak şimdi eklensin, (b) Faz 1'de hiç olmasın.
- MOQ birimi varsayılanı (stok birimi ile aynı mı), termin birimi (gün mü, hafta mı).
- İplik tipi listesi (DTY, FDY, ring, open end, kompakt, ...) ve apre etiketleri.
- Ürün formunda hangi bölümler açık gelsin (öneri: Kumaş, Bilgiler, Ticari açık; İplik, Sertifika kapalı).

---

## Adım 3 - Pasaport çıkarımı ve onay ekranı

**Büyüklük:** orta-büyük. **Görünür değişiklik:** "Fotoğraftan doldur" (ilk büyük "vay" anı).

### Ne yapılacak
- `backend/src/llm.ts`: tek Anthropic istemcisi ve ortak yardımcılar (anahtar yoksa 503 deseni korunur). `advisor.ts` ve `garmentAnalysis.ts` bu istemciyi kullanmaya geçer, davranışları değişmez (yeniden yazma değil, ortak parçayı çıkarma).
- `backend/src/skills/passportExtract/`: `schema.ts` (çıktı şeması: alan → `{ value, confidence, evidence }`), `prompt.ts`, `run.ts`. Çıkarım **yapılandırılmış çıktı** ile alınır (`client.messages.parse` + `zodOutputFormat`; `garmentAnalysis`'teki "metinden köşeli parantez ara" yaklaşımı yerine şema garantili yanıt; ayrıştırma hatası sınıfı yok olur). Model mevcut uçlarla aynı: `claude-opus-5`, düşük/orta çaba.
- Girdi: 1-4 fotoğraf (etiket, kartela, test raporu) ve/veya PDF (belge bloğu, base64) ve/veya serbest metin (WhatsApp'tan yapıştırılan). Çıktı ham değerler **Adım 1 sözlüğünden** geçer (lif adı → anahtar, örgü → subtype, birim → normalize), **makullük** kontrolünden geçer; son güven değeri üç kaynağın birleşimi: model işareti, sözlük eşleşme gücü, makullük. Eşiğin altı **boş** bırakılır ("emin değilim" görünür bir alan olarak).
- **Fiyat, stok ve MOQ asla çıkarımdan gelmez** (belgede olsa bile): ticari alanlar kullanıcı girişidir.
- Uç: `POST /api/passport/extract` → `{ extraction: PassportExtraction, warnings[] }`. **Kayıt yapmaz.** Kayıt, kullanıcının onayladığı değerlerle normal `POST/PATCH /api/products` üzerinden olur; istemci hangi alanların çıkarımdan geldiğini `fieldMeta[]` ile gönderir, sunucu `ProductFieldMeta` yazar (source `extracted`, onaylananlar `confirmedAt` dolu).
- Mobil: `AddProductScreen` üstüne "Fotoğraftan doldur" düğmesi → fotoğraf/PDF seçimi → yükleniyor → **onay ekranı** (`PassportReviewScreen`): her alan bir satır, değer + güven rengi (yeşil/sarı/boş), tek dokunuşla onay, dokununca düzenleme. "Forma aktar" ile alanlar forma dolar; kullanıcı formu normal kaydeder. Etiket fotoğrafı istenirse ürün galerisine de eklenir.

### Test
- Şema/normalizasyon/makullük kısmı gerçek birim testleri (LLM'siz): "92% PES 8% EA, 220 gsm, 180 cm tubular" örnek çıktısı → doğru anahtarlar, `widthType=tup`.
- Uçtan uca script: LLM çağrısı `ANTHROPIC_MOCK=1` ile sahte yanıtla (Cloudflare video testindeki sahte servis deseni); şemaya uymayan yanıt → 200 + boş alanlar + uyarı (502 değil); fiyat alanı içeren yanıt → fiyat düşürülür; oturumsuz 401; anahtar yoksa 503.
- Gerçek etiket fotoğraflarıyla el testi (Fırat'ın kartelaları), 10 örnekte doğruluk notu `docs/yapilacaklar.md`'ye.

### Riskler ve karşı önlemler
- Uydurma değer → düşük güven boş bırakılır; hiçbir alan onaysız kaydedilmez; onay ekranı zorunlu.
- Fotoğraf boyutu → mevcut `pickCompressedImage` (1000 px, JPEG %60) kullanılır; PDF 5 MB üstü reddedilir (istek gövdesi sınırı 15 MB).
- Maliyet → çağrı başına fotoğraf sayısı 4, çaba düşük; kullanım sayısı sağlık ucunda değil, sunucu kaydında izlenir.

### Fırat'tan gerekenler
- 10-20 gerçek etiket/kartela/test raporu fotoğrafı (test seti).
- Etiketlerde sık görülen yazım biçimleri (hangi bilgiler nerede durur).

---

## Adım 4 - Hesap motorlarını backend'e taşımak, beceri iskeleti

**Büyüklük:** orta. **Görünür değişiklik:** yok (hesaplayıcılar aynı çalışır).

### Ne yapılacak
- `backend/src/domain/calc/formulas.ts`: bugünkü `mobile/src/features/calculators/formulas.ts`'nin **birebir kopyası** (274 satır, saf fonksiyonlar). İplik çevrimleri Adım 1 `units.ts`'ten içe alınır; davranış aynı.
- `backend/src/domain/calc/formulas.test.ts`: her motor için Fırat'ın gerçek örnekleri (girdi → beklenen sonuç) ve mevcut iki referans (gramaj 275 gr/m², 75 tex ≈ 8 Ne / 13 Nm). Kenar durumları: sıfır girdi, boya firesi %100'e yakın (`Math.min(…, 99.9)` koruması), katlı iplik.
- `backend/src/skills/`: beceri kaydı iskeleti. Her beceri bir klasör: `schema.ts` (zod girdi/çıktı), `run.ts` (saf fonksiyonu çağırır), `describe.ts` (asistan için Türkçe açıklama, "hangi durumda kullanılır", sonucu anlatma kalıbı). İlk beceriler: `fabricPricing`, `knitProduction`, `yarnCount`, `yarnCountFromSample`, `yarnUsageRatio`, `fabricGsm`, `garmentCost`, `unitConvert` (Adım 1). `skills/index.ts` hepsini listeler; Adım 5 buradan araç üretir.
- Uç: `POST /api/skills/:name/run` (oturumlu): girdi zod ile doğrulanır, sonuç + kısa formül özeti döner. Mobil bu adımda buna **bağlanmaz**; uç Adım 5 asistanının ve ileride web sürümünün kullanımı için.

### Mobil karar: hesaplayıcılar cihazda kalır
İlk taslak "tek kaynağa inelim, mobil kopya kalksın" demişti; kod okununca bu değişti: hesaplayıcı ekranları her tuş vuruşunda `useMemo` ile anında hesaplıyor ve çevrimdışı çalışıyor. Her tuşta sunucuya gitmek yavaş ve ağsız ortamda (atölye) kırılgan olur. Karar: **formüller mobilde kalır**, backend'deki kopya doğruluk kaynağıdır, `scripts/check-formulas.ts` iki dosyanın **aynı metin** olduğunu doğrular (katalog kontrolüyle aynı desen). Paylaşılan npm paketi (monorepo) değerlendirildi, reddedildi: iki proje bağımsız kurulu, Metro ve tsc ayarları değişir, kazanç küçük.

### Test
Birim testleri; `check-formulas.ts` geçer; hesaplayıcı ekranları tarayıcıda aynı sonucu verir (davranış değişmediği için hızlı kontrol).

### Riskler
Düşük. Tek risk kopyaların ayrışması; eşitlik kontrolü bunu yakalar (commit öncesi çalıştırma alışkanlığı).

### Fırat'tan gerekenler
- Her hesap için 2-3 gerçek örnek ve doğru sonuç (girdi listesiyle).
- Fire ve randıman varsayılanları (beceri açıklamasında "tipik değer" olarak gösterilecek; hesaba otomatik girmez).
- Beceri 1 ve 2 formül teyidi (yol haritası §5'te açık: girdi kalemleri, fire uygulama noktası, kg mi metre mi bazlı çıktı). Mevcut kod 2026-09-15'te "hesapları kontrol ettim, doğru" onayı aldı; değişiklik yoksa mevcut formül aynen taşınır.

---

## Adım 5 - Firma asistanı (araç kullanan orkestratör)

**Büyüklük:** büyük. **Görünür değişiklik:** Danışman ekranı asistana dönüşür, hesap sorulunca sonuç kartı çıkar.

### Ne yapılacak
- `backend/src/assistant/`: `run.ts` (araç döngüsü), `tools.ts` (Adım 4 becerilerinden araç üretimi), `system.ts` (sistem talimatı), `memory.ts` (firma hafızası okuma).
- Araç döngüsü SDK'nın araç çalıştırıcısıyla: `betaZodTool` (zod şemaları zaten var, JSON şema elle yazılmaz) + `client.beta.messages.toolRunner`. Araçlar: 8 beceri + `katalog_ara` (firmanın kendi ürünleri ve pasaport alanları; `buildProductWhere` yeniden kullanılır) + `pasaport_cikar` (Adım 3, metin girdisi) + `firma_hafizasi_oku`. Yedek plan: çalıştırıcı beklenmedik davranırsa elle yazılmış `while (stop_reason === 'tool_use')` döngüsü; iki yol da aynı `tools.ts`'i kullanır.
- Sistem talimatı: mevcut `advisor` metni temel alınır, eklenir: "Hesabı sen yapmazsın, aracı çağırırsın; araç çıktısında olmayan rakam söylemezsin; eksik girdi varsa sorarsın." Sabit parça (talimat + araç listesi) başta, firma hafızası ve sohbet sonda: istem önbelleği bu sırayla çalışır.
- **Sunucu tarafında sohbet kaydı:** `AssistantThread (id, userId, companyId, channel: app|whatsapp, createdAt)` ve `AssistantMessage (id, threadId, role, contentJson, createdAt)`. Bugün `advisor` geçmişi istemciden alıyor; araç çağrıları ve sonuçları geçmişin parçası olduğu için istemcinin bunları taşıması kırılgan, WhatsApp'ta ise istemci yok. Bu yüzden kayıt sunucuda; istemci yalnızca `threadId` tutar.
- **Firma hafızası:** `CompanyMemory (id, companyId, key, valueJson, updatedAt)`; `@@unique([companyId, key])`. Anahtarlar: `defaultCurrency`, `usdTry`, `eurTry`, `knittingFeePerKg`, `dyeingFeePerKg`, `dyeingLossPercent`, `overheadPercent`, `profitPercent`, `frequentQualities`. Asistan okur ve hesaba varsayılan olarak **önerir**; yazma yalnızca kullanıcı onayıyla: asistan "Bu fire oranını hafızaya kaydedelim mi?" kartı döner, kullanıcı onaylarsa istemci `PUT /api/me/company/memory/:key` çağırır. Kullanıcı ayrıca Profil'den düzenleyebilir.
- Uçlar: `POST /api/assistant/threads` (yeni sohbet), `POST /api/assistant/threads/:id/messages` (soru → cevap; yanıtta metin + `toolCalls[]` (hangi araç, girdi, çıktı) + `memorySuggestions[]`), `GET /api/assistant/threads/:id`. Eski `POST /api/advisor/ask` bir sürüm daha kalır (eski uygulamalar için) ve içeride asistanı araçsız çağırır.
- Mobil: `AdvisorScreen` → asistan; araç sonuçları `ResultCard` ile sohbet balonunun altında kart olarak (rakamlar yalnızca araç çıktısından çizilir); hafıza öneri kartı "Kaydet / Şimdi değil". Hesaplayıcı ekranlarına "Asistana sor" kısayolu.
- `/api/health`'e `assistant.configured` eklenir.

### Test
- Senaryo testleri (LLM sahte, araç çağrısı senaryosu dosyadan): "220 gr/m² 180 cm süprem 1.000 metre kaç kg" → `yarnUsage`/`metersPerKg` aracı, doğru sonuç kartı; "maliyet hesapla" eksik girdi → asistan sorar, araç çağrılmaz; araç şeması ihlali → is_error ile modele döner, kullanıcıya anlaşılır mesaj; başka firmanın ürünü `katalog_ara`'da görünmez; hafıza başka firmaya sızmaz; iplik kayıtları (thread) sahibinden başkası okuyamaz.
- Gerçek LLM ile 10 soruluk el kontrolü, sonuçlar `docs/yapilacaklar.md`'ye.

### Riskler ve karşı önlemler
- Model rakamı kendisi uydurur → sistem talimatı + ekran yalnızca araç çıktısını kart yapar; metindeki rakam kartla çelişirse kart geçerli, test bunu kontrol eder.
- Uzun sohbetler maliyeti şişirir → iplik başına son 30 mesaj gönderilir, eski kısım özetlenir; sabit önek önbelleklenir.
- Yanıt süresi → araçlı çağrılarda 20-40 sn olabilir; ekranda "hesaplıyor" durumu; ileride akış (stream) eklenebilir, ilk sürümde gerekmez.

### Fırat'tan gerekenler
- Asistanın ses tonu ve ilk 10 örnek soru (gerçek müşteri soruları).
- Firma hafızası anahtarlarından hangileri ilk sürümde olmalı.

---

## Adım 6 - Ürün akışı: pasaport kartları ve ticari eylemler

**Büyüklük:** orta. **Görünür değişiklik:** akış kartları.

### Ne yapılacak
- Akıştaki ürünlü gönderi (`Post.productId` zaten var) **pasaport kartı** olur: kod, alt çeşit, kompozisyon şeridi, gramaj/en (ölçü şeridi zaten var), stok göstergesi, MOQ/termin, sertifika rozetleri. `POST_PRODUCT_SELECT` genişler (fotoğraf yine ayrı uçtan).
- Eylemler: **Numune Talep Et** (var), **Takibe Al** = mevcut `ProductFavorite` (yeni tablo açılmaz; etiket değişir, `FavoriteProductsScreen` "Takip Ettiklerim" olur), **Teklif İste** (Faz 2 kancası: şimdilik ürün sahibiyle sohbet başlatır, mesaj metni ürün koduyla hazır gelir; bağlantı yoksa bağlantı isteği önerir).
- Yeni ürün akışa nasıl düşer: ürün kaydedildikten sonra "Akışta paylaş" sorusu (mevcut `CreatePostScreen` ürünle açılır). Otomatik gönderi **yapılmaz** (yüzlerce ürün girişi akışı doldurur).
- "Bağlantıdaki firmaların ürünleri" filtresi: akışta "Bağlantılarım" sekmesi, bağlantılı kullanıcıların firmalarına ait ürünlü gönderiler. Bağlantı kullanıcı düzeyinde kalır (firma düzeyi bağlantı Faz 2 sorusu).

### Karar gerekiyor
Beğeni ve yorum: yol haritası "beğeni/yorum yerine ticari eylemler" diyor; kodda ikisi de var, canlıda veri var. Öneri: beğeni düğmesi ürünlü gönderilerde "Takibe Al"a dönüşür (ürünsüz duyurularda beğeni kalır); yorum kalır (soru sormak için kullanışlı). Silme yok, veri korunur.

### Test
`test-feed-passport.ts`: kart alanları yanıtta, fiyat yanıtta yok, "Bağlantılarım" filtresi yalnızca bağlantılı firmaları verir, Teklif İste bağlantısızda 403 ve öneri, takip = favori aynı kayıt.

### Fırat'tan gerekenler
Beğeni/yorum kararı; "Takibe Al" mı "Favori" mi etiketi; Teklif İste'nin ilk sürümde görünsün mü.

---

## Adım 7 - WhatsApp'ı asistana bağlama

**Büyüklük:** orta. **Görünür değişiklik:** WhatsApp'tan soru → asistan cevabı.

### Ne yapılacak
- `routes/whatsappWebhook.ts` (bugün 24 satır, yalnızca loglar): (1) **imza doğrulaması** `X-Hub-Signature-256` (Meta uygulama gizli anahtarı `WHATSAPP_APP_SECRET`; bugün yok, açık bir güvenlik boşluğu), (2) hemen 200 döner, işlemeyi arka planda yapar (Meta 200 gelmezse yeniden gönderir), (3) mesaj kimliğiyle **tekrar koruması** (`WhatsAppInbound (messageId unique, from, body, receivedAt, status)`), (4) göndereni telefon numarasından bulur: Meta `90XXXXXXXXXX` verir, `User.phone` `0XXXXXXXXXX` biçiminde; `whatsapp.ts`'teki `toE164` mantığının tersi tek yerde (`phone.ts`) yazılır, (5) kullanıcı bulunursa `channel: whatsapp` ipliğinde asistanı çağırır, cevabı `sendWhatsAppText` ile gönderir (kullanıcı yazdığı için 24 saat penceresi açık, şablon gerekmez), (6) kullanıcı yoksa kısa bir "Avedon'a kayıt olun" cevabı ve bağlantı.
- Metin yapıştırılan kumaş bilgisi ("%92 PES %8 EA 220 gsm ...") asistanın `pasaport_cikar` aracına gider; "ürün olarak kaydedelim mi" sorusuna evet denirse **taslak** oluşturulur, uygulamada onay ekranına düşer (WhatsApp'tan onaysız kayıt yok).
- Numune talebi bildirimleri mevcut şablon yoluyla sürer.
- `/api/health`'e `whatsapp.configured` ve `whatsapp.webhookVerified` (son doğrulama zamanı).

### Test
İmza yanlış → 403; aynı mesaj iki kez → tek işlem; bilinmeyen numara → kayıt yönlendirmesi, asistan çağrılmaz; asistan hatasında kullanıcıya nazik mesaj, hata kayıtta; sahte Graph API ile uçtan uca.

### Fırat'tan gerekenler (kod öncesi)
Meta WhatsApp Business hesabı, telefon numarası, kalıcı erişim anahtarı, uygulama gizli anahtarı; şablon onayı. Bunlar hesap işi; `CLAUDE.md` kuralı gereği adımlar resmi dokümandan doğrulanıp tek seferde verilir, health ucu önceden hazır olur.

---

## Adım 8 - SMS sağlayıcısı (bağımsız, paralel)

**Büyüklük:** küçük (kod), orta (hesap işi). **Görünür değişiklik:** gerçek kullanıcılar kayıt olabilir.

### Ne yapılacak
- Araştırma (önce): Türkiye'de OTP için yerli sağlayıcı seçenekleri (Netgsm, İleti Merkezi vb.) ve Twilio; fiyat, gönderici başlığı onay süreci ve süresi, API biçimi **resmi dokümandan** doğrulanır, tek bir öneri ve adım listesi verilir. Araştırılmadan panel işi verilmez (2026-09-15 dersi).
- `sms.ts`: sağlayıcı sürücüsü; `SMS_PROVIDER`, anahtarlar `.env`'de; yapılandırılmamışsa bugünkü gibi kayda düşer. `/api/health`'e `sms.configured` ve son gönderim sonucu (gizli bilgi yok).
- Test: sahte sağlayıcı ile başarı/başarısızlık; başarısızlıkta OTP akışı kullanıcıya "kod gönderilemedi" der (sessizce geçmez). Canlıda ilk gerçek kod Fırat'ın telefonuna.

### Fırat'tan gerekenler
Sağlayıcı seçimi ve hesap açılışı, gönderici başlığı başvurusu.

---

## Önerilen ilk dilim

**Adım 1 + Adım 2 birlikte** (sözlük + pasaport şeması + form/detay/filtre), tek migration ile. Sıra içinde: önce sözlük dosyaları ve testleri, sonra şema ve API (test scriptiyle), sonra mobil form, sonra migration provası ve canlı. Ardından **Adım 3** (fotoğraftan doldur): ilk görünür "vizyon" kazanımı. Adım 4 küçük olduğu için Adım 3 ile paralel yürütülebilir; Adım 5 ikisinin ardından gelir.

Adım 8 (SMS) sıradan bağımsızdır: Fırat sağlayıcıyı seçtiği gün yapılır.

## Fırat'ın karar vermesi gereken noktalar

1. **Fiyat alanı** (Adım 2): sahibe özel alan olarak şimdi mi, Faz 1'de hiç mi? Öneri: şimdi, sahibe özel.
2. **MOQ/termin birimleri** (Adım 2): MOQ varsayılanı stok birimiyle aynı mı; termin gün mü.
3. **Formda açık gelen bölümler** (Adım 2): öneri Kumaş, Bilgiler, Ticari açık; İplik, Sertifika kapalı.
4. **Beğeni/yorum** (Adım 6): öneri ürünlü gönderide beğeni → Takibe Al, yorum kalsın.
5. **"Takibe Al" mı "Favori" mi** (Adım 6) etiketi.
6. **SMS sağlayıcısı** (Adım 8) ve **WhatsApp Business hesabı** (Adım 7): hesap işleri; hangisi önce?
7. **Asistan tonu** (Adım 5): resmi mi, atölye ağzı mı.

## Fırat'tan beklenen tekstil bilgisi (özet)

1. Lif/örgü eşanlamlıları ve kısaltmalar; sertifika adları (Adım 1)
2. Makullük aralıkları: alt çeşide göre gramaj/en, lif oranı üst sınırları (Adım 1)
3. İplik tipi ve apre etiketi listeleri (Adım 2)
4. 10-20 gerçek etiket/kartela fotoğrafı (Adım 3)
5. Her hesap için 2-3 gerçek örnek ve doğru sonuç; fire/randıman tipik değerleri (Adım 4)
6. İlk 10 gerçek müşteri sorusu (Adım 5)
