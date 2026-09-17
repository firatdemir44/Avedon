# Faz 2 (Ağ) - sıralı uygulama planı

**Kaynak:** `docs/yol-haritasi.md` §6 Faz 2, §5 beceri 11-15 · **Tarih:** 2026-09-17 · **Durum:** onaylandı (kararlar 2026-09-17, aşağıda); Adım 1 tamamlandı (2026-09-17, telefonda kontrol bekliyor); Adım 2 tamamlandı (2026-09-17, telefonda kontrol bekliyor); Adım 3 tamamlandı (2026-09-17, telefonda kontrol bekliyor); sıradaki Adım 5 (Adım 4 davet, SMS bağlanınca) · Hazırlayan: Claude (Fable 5.1), Faz 1 kodu üzerinden.

Faz 1'in bıraktığı zemin: kumaş pasaportu (yapılı ürün verisi), etiketten doldurma, 11 hesap becerisi, firma asistanı (İpek/Mert, firma hafızası, sunucuda sohbet), akışta pasaport kartları (Numune talep et / Takibe al / Teklif iste), WhatsApp'tan asistan. Faz 2'nin amacı **ağ etkisi**: bir firmanın kataloğu ve asistanı, başka firmalar için de iş görmeye başlar.

## Sıra ve gerekçe

| # | Adım | Neden bu sırada |
|---|---|---|
| 1 | Bildirim altyapısı + akış izleme ("bu kalitede ürün çıkınca haber ver") | Sonraki her adım bildirim üretir; izleme, Takibe Al'ın doğal devamı ve geri getiren ilk mekanizma |
| 2 | Teklif akışı (RFQ → taslak → onay → gönderim) | Bugünkü "Teklif iste" yalnızca sohbet açıyor; ticari değerin merkezi teklif |
| 3 | Satıcı asistanı: alıcının sorusuna katalogdan cevap | Teklif ve pasaport verisi hazır olunca asistanın dışarıya konuşması güvenli hale gelir |
| 4 | Davet mekaniği | Ağ ancak davetle büyür; 1-3 hazırken davet edilenin göreceği bir değer olur |
| 5 | Fason kapasite ağı | Yeni veri modeli (makine parkı); ağda yeterli firma olunca anlamlı |
| 6 | İplik tedarikçi dizini | 5 ile aynı desen, daha küçük |
| 7 | Doğrulama rozeti derinliği + karşılıklı referans | Güven katmanı; Faz 3'teki itibar skorunun ön adımı |

---

## Adım 1 - Bildirimler ve akış izleme

**Büyüklük:** orta. **Görünür:** zil simgesi + "İzlediklerim"; asistana "PA lycra süprem 200 gr üstü çıkınca haber ver" denebilir.

- `Notification (userId, kind, title, body, dataJson, readAt, createdAt)`; `GET /api/notifications`, okundu işaretleme, sayaç. Kaynaklar: yeni numune talebi, talep durum değişimi, teklif olayları (Adım 2), izleme eşleşmesi, bağlantı isteği.
- `WatchRule (userId, name, queryJson, channel: app|whatsapp, lastMatchedAt)`: `queryJson` bugünkü `productQuerySchema` ile aynı (çeşit, alt çeşit, lif + en az %, gramaj aralığı, sertifika, MOQ/termin). Ürün oluşturulunca/akışta paylaşılınca kurallar taranır (`buildProductWhere` tek ürün üzerinde), eşleşen kullanıcıya bildirim.
- Asistan aracı `izleme_kur` (kural önerir, kullanıcı onaylar; hafıza kartı deseni) ve `izlemeleri_listele`. Filtre ekranında "Bu aramayı izle".
- Kanal: uygulama içi her zaman; WhatsApp yalnızca onaylı şablon + gerçek numara olduğunda (24 saat penceresi dışı ücretli). Push bildirimi (Expo) bu adımda değerlendirilir; Expo Go kısıtları doğrulanacak.
- Test: eşleşme doğruluğu (lif yüzdesi, aralıklar), kendi ürününe bildirim gitmez, görünürlüğü "bağlantılarım" olan gönderi bağlantısız izleyiciye sızmaz, günlük üst sınır.

## Adım 2 - Teklif akışı

**Büyüklük:** büyük. **Görünür:** "Teklif iste" artık form; satıcıda "Gelen teklif istekleri"; asistan taslak hazırlar.

- `QuoteRequest (buyerId, productId, quantity, unit, targetDate, note, status)` ve `Quote (requestId, sellerUserId, priceValue, currency, unit, moq, leadTimeDays, validUntil, paymentTerms, note, status: draft|sent|accepted|declined|expired)`.
- Alıcı: miktar + birim + istenen termin + not. Satıcı: asistan **taslak** çıkarır (ürünün fiyat/MOQ/termin alanları + firma hafızası; miktar kademesi varsa uygular), satıcı düzenler ve gönderir. İlke: asistan fiyat **uydurmaz**; üründe fiyat yoksa boş bırakır ve sorar.
- Teklif alıcıya sohbet içinde kart olarak düşer (Kabul / Reddet / Soru sor). Kabul → numune ya da sipariş notu (sipariş yönetimi Faz 2 kapsamı değil).
- Beceri 12 `quoteDraft` (saf: girdiler → teklif satırları, kur çevirisi hafızadan) + asistan aracı.
- Test: fiyat yalnızca taraflara görünür, süresi dolan teklif, bağlantısız alıcı akışı (bugünkü 403 + bağlantı önerisi korunur mu: **karar gerekiyor**).

## Adım 3 - Satıcı asistanı (alıcı sorularına katalogdan cevap)

**Büyüklük:** büyük, en riskli. **Görünür:** ürün ve firma sayfasında "Asistana sor".

- Alıcı, satıcının asistanına sorar ("bu kalitenin 180 gr'ı var mı, OEKO-TEX'li mi, termin?"). Asistan yalnızca o firmanın **yayınlanmış** katalog ve pasaport verisinden cevap verir; fiyat, stok ayrıntısı ve firma hafızası dışarıya **kapalı** (satıcı açıkça izin verirse açılır: firma ayarı).
- Cevaplanamayan soru satıcıya bildirim olur ("cevabını yaz, asistan öğrensin" → firma SSS hafızası). İnsan devri her zaman bir dokunuş.
- Ayrı sistem talimatı ve araç seti (`katalog_ara` salt-okur + `sss_oku`); hesap becerileri alıcıya açık kalabilir (metre-kilo gibi).
- Kötüye kullanım: alıcı başına günlük soru sınırı, satıcıya maliyet görünürlüğü. WhatsApp'ta kayıtlı olmayan numaradan gelen soru bu adımda **değil**.
- Test: fiyat sızmaz, başka firmanın verisi sızmaz, katalogda olmayan ürün uydurulmaz.

## Adım 4 - Davet mekaniği

**Büyüklük:** küçük-orta. "Tedarikçini davet et": kişiye özel bağlantı/kod (WhatsApp paylaşımı), davet eden-edilen ilişkisi kaydı, kayıt sonrası otomatik bağlantı isteği, davet durum listesi. Test: kod tek kullanımlık değil ama kişiye bağlı; kötüye kullanım sınırı. SMS girişinin (Faz 1 Adım 8) bağlanmış olması **ön koşul**.

## Adım 5 - Fason kapasite ağı

**Büyüklük:** orta-büyük. `Machine (companyId, kind: yuvarlak_orme|raschel|dokuma|boya|..., gauge/pus, diameter, count, note)` ve `CapacitySlot (machineId?, from, to, kgPerDay?, note, visibility)`. Firma sayfasında "Makine parkı" sekmesi; arama: "28 fayn 30 pus boş kapasite, Ekim". Asistan aracı `kapasite_ara`. Üretim becerisi (kg/gün) makine kaydından beslenir. **Fırat'tan:** makine türleri ve alanları (pus, fayn, sistem sayısı, en), kapasitenin nasıl ifade edildiği (kg/gün, makine-gün).

## Adım 6 - İplik tedarikçi dizini

**Büyüklük:** orta. İplik için pasaport benzeri sade şema (numara + sistem, tip, lif, büküm, renk/ham, sertifika, MOQ, stok); ürün tipi `iplik`. Dizin = şirket tipi "İplik Üreticisi" + iplik ürünleri + filtre. Kumaş pasaportundaki iplik satırından "bu ipliği kim satıyor" araması.

## Adım 7 - Doğrulama ve karşılıklı referans

**Büyüklük:** küçük-orta. Doğrulama düzeyleri (vergi levhası, yerinde ziyaret), rozet açıklaması; `Reference (fromCompanyId, toCompanyId, relation: musteri|tedarikci, note, status)`: iki taraf da onaylarsa firma sayfasında görünür. Faz 3 itibar skorunun verisi.

---

## Kesişen konular

- **Maliyet:** asistan çağrıları artacak; firma başına aylık kullanım sayaçları ve `/api/health` dışında bir yönetici özeti. Ücretlendirme kararı Faz 2 sonuna.
- **Gizlilik:** fiyat ve firma hafızası varsayılan kapalı; her yeni dışa açık yüzey için "ne sızabilir" testi (Faz 1'deki fiyat testi deseni).
- **Migration:** her adım kendi migration'ı, yerel kopyada prova (CLAUDE.md kuralı).
- **Model seçimi:** veri modeli, asistan araçları ve plan Fable 5.1; ekranlar ve testler Opus 5.

## Fırat'ın kararları (2026-09-17)

1. **Sıra:** Claude karar verir → plan sırası korunuyor (önce bildirim + izleme).
2. **Teklif istemek için bağlantı ŞART DEĞİL:** firmalar bağlantısız da teklif isteyebilir (Adım 2'de bugünkü 403 + bağlantı önerisi kalkar; istek doğrudan satıcıya düşer).
3. **Satıcı asistanı fiyat VERMEZ:** fiyat yalnızca teklifle gider; firma ayarıyla açma seçeneği de olmayacak.
4. **Makine parkı:** pus, fayn, sistem sayısı, en dahil bütün makine bilgileri tutulur. Kapasite **parkur** (makine parkı) olarak bildirilir; ayrıca firmanın beyan ettiği **aylık tonaj** kaydedilir.
5. **İplik ürünü alanları:** Fırat ayrıca bildirecek (Adım 6 o zamana kadar bekler).
6. **WhatsApp gerçek numara / SIM ve SMS:** en sona.

## Eski soru listesi (cevaplandı)

1. Sıra uygun mu; önce **izleme/bildirim** mi, önce **teklif** mi?
2. Teklif istemek için bağlantı şart mı kalsın, yoksa doğrulanmış firmalara bağlantısız teklif isteği açılsın mı?
3. Satıcı asistanı alıcıya **fiyat** söyleyebilsin mi (firma ayarıyla), yoksa fiyat yalnızca teklifle mi gitsin?
4. Makine parkı için alan listesi (Adım 5) ve iplik şeması (Adım 6) bilgisi.
5. WhatsApp bildirimleri için gerçek numara + şablon ne zaman (ayrı SIM)?
