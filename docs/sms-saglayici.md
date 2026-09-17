# SMS sağlayıcısı karşılaştırması (Faz 1, Adım 8)

Amaç: telefon doğrulama kodunun (OTP) gerçek SMS ile gitmesi. Kodda hazır olan: tek kullanımlık kod üretimi, 30 günlük imzalı oturum; kodlar bugün yalnızca sunucu kayıtlarına düşüyor. Kaynaklar 2026-09-17'de sağlayıcıların kendi sayfalarından okundu; okunamayanlar "doğrulanmadı" diye işaretli.

| | İleti Merkezi | Netgsm | Twilio Verify |
|---|---|---|---|
| Fiyat | Ön ödemeli paket, sabit ücret/taahhüt yok: 500 SMS 189 TL, 1.000 SMS 359 TL, 5.000 SMS 1.049 TL (KDV+ÖİV dahil; paket 1 yıl geçerli; ulaşmayan SMS ücretsiz) | Fiyat sayfası okunamadı (doğrulanmadı); abonelik (abone numarası) modeli | Doğrulama başına 0,05 USD + ülkeye göre SMS ücreti (Türkiye ücreti doğrulanmadı); kart ile, USD |
| OTP desteği | Ayrı "OTP SMS API" ürünü var | SMS API + yeni "WhatsApp OTP" ve "Template SMS" servisleri | Hazır doğrulama servisi (kod üretimi ve kontrolü onlarda) |
| Gönderici adı (başlık) | 3-11 karakter başlık; evrakla onay (evrak listesi sayfası okunamadı, doğrulanmadı) | Başlık + API için onaylı "alt kullanıcı" zorunlu (temsilci onayı) | Türkiye'de alfanümerik başlık kayıt ister; yoksa yabancı numaradan gider (güven düşük) |
| Kurulum | Türk şirketi evrakı, Türkçe destek 7/24, BTK yetkili | Türk şirketi evrakı, temsilci süreci | Evrak yok, dakikalar içinde; ama USD ve başlık sorunu |
| Bize uyum | Kod üretimi bizde kalır, yalnızca "SMS gönder" çağrısı | Aynı | Kod mantığını onlara taşımak gerekir ya da yalnızca SMS API kullanılır |

## Öneri

**İleti Merkezi.** Pilot için 500 SMS (189 TL) yeter; sabit ücret yok, fiyat TL ve vergiler dahil, OTP için ayrı API'si var, kod tarafında yalnızca tek bir "gönder" çağrısı eklenir. Netgsm teknik olarak eşdeğer ama kurulumu temsilci onaylı ve daha yavaş. Twilio en hızlı kurulur ama Türkiye'de başlık sorunu ve USD maliyeti var; yurt dışı kullanıcı gelirse ikinci sağlayıcı olarak eklenebilir.

**Alternatif (SMS'siz):** doğrulama kodunu WhatsApp'tan göndermek. Meta'da "authentication" şablonu onayı ve gerçek numara ister (test numarası yalnızca 5 telefona yazar); şablon mesajı ücretlidir. Gerçek WhatsApp numarası alındığında SMS'e ek ikinci kanal olarak düşünülebilir.

## Kod tarafı (sağlayıcıdan bağımsız hazırlanacak)

`backend/src/sms.ts`: `sendSms(phone, text)` arayüzü, `SMS_PROVIDER=iletimerkezi|netgsm|mock`, sahte kip testler için; OTP ucu bunu çağırır; `/api/health` `sms.configured` ve son gönderim durumu. Sağlayıcı seçilince API anahtarları Render'a girilir (sohbete yazılmaz); panel adımları o sağlayıcının dokümanından doğrulanıp tek seferde verilir.

## Kurulum hazırlığı (2026-09-18, resmi kaynaklardan doğrulandı)

**Kod hazır ve canlıda** (`backend/src/sms.ts`): `SMS_PROVIDER=iletimerkezi`, `ILETIMERKEZI_KEY`, `ILETIMERKEZI_SECRET`, `ILETIMERKEZI_SENDER`. Uçlar `POST https://api.iletimerkezi.com/v1/send-sms/json` ve `/v1/get-balance/json`; hash = HMAC-SHA256(veri: API anahtarı, anahtar: gizli anahtar); doğrulama kodunda `iys: "0"` (ticari ileti değil). Sahte anahtarla gerçek uca karşı denendi: 401 doğru yorumlanıyor. Sağlayıcı bağlıyken SMS gitmezse OTP ucu 502 `sms_failed` döner (ekran "Kod gönderilemedi" der).

**Teşhis:** `/api/health` → `sms`: `configured`, `keySet/secretSet/senderSet`, `senderTooLong`, `account.ok` + `account.smsCredits` (bakiye sorgusu: SMS harcamadan anahtarları doğrular), `account.hint` (401/402/450 açıklaması), `lastSuccessAt`, `lastError`, `sentCount/failedCount`.

**Sağlayıcı tarafı (Fırat yapar; kaynak: iletimerkezi.com/docs/api, /toplu-sms-gerekli-evraklar):**
1. Hesap açma ve paket (500 SMS).
2. **Başlık (gönderici adı) onayı ŞİRKET EVRAKI ister:** imza yetkilisinin kimlik fotokopisi (renkli), imza sirküleri, ticaret sicil gazetesi/kaydı (kaşeli-imzalı); evraklar **KEP** ile gönderilir; abonelik sözleşmesi **e-Devlet > BTK e-Kayıt** üzerinden onaylanır. Onay 1-2 iş günü. Başlık en çok 11 karakter. (Başlığın şirket unvanı/markayla ilişkisi şartı sayfada yazmıyor: doğrulanmadı, destekten sorulacak.)
3. Panel: **Ayarlar > Güvenlik > Erişim İzinleri > "API kullanımına izin ver"** açılır (kapalıysa her istek 401). **Ayarlar > Güvenlik > API Erişimi**'nden API anahtarı + gizli anahtar alınır.
4. Dört değer Render > avedon-backend > Environment'a girilir (sohbete yazılmaz); `/api/health` `sms.account.ok: true` olunca gerçek telefonla giriş denenir.

**Başlık onayı beklenirken:** `ILETIMERKEZI_SENDER=APITEST` ile deneme yapılabilir; ama bu kipte telefona SABİT deneme metni gider (kod gitmez) ve kredi düşer → yalnızca bağlantıyı kanıtlar, girişe yaramaz.
