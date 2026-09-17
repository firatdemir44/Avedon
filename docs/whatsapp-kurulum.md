# WhatsApp (Meta Cloud API) kurulumu

Kaynak: Meta resmi dokümanları, 2026-09-16'da okundu (Cloud API Get Started 16 Haz 2026, WhatsApp webhooks 26 Haz 2026, Business phone numbers 21 May 2026, Pricing 10 Eyl 2026). Kod tarafı hazır (`docs/faz1-plani.md` Adım 7); bu belge yalnızca hesap ve panel adımlarıdır.

## Önce bilinmesi gerekenler

- **Numara:** Meta her uygulamaya ücretsiz bir **test numarası** verir; bu numara yalnızca "To" listesine eklediğiniz **en fazla 5 telefona** mesaj atabilir. Pilot denemesi için yeterli. Gerçek numara için ayrı bir SIM gerekir: Cloud API'ye bağlanan numara **WhatsApp uygulamasında kullanılamaz** (kişisel numaranızı bağlarsanız telefondaki WhatsApp'ınız kapanır). Mobil hat önerilir.
- **Ücret:** kullanıcı size yazınca 24 saatlik pencere açılır; bu pencerede gönderilen serbest metin (asistan cevapları) **ücretsiz**. Ücret yalnızca **şablon** mesajlarında (ör. pencere dışında numune talebi bildirimi) ve mesaj başına. Test numarasında da aynı kural.
- **Asistan sizi tanısın diye** WhatsApp'tan yazdığınız numara, Avedon'a kayıtlı telefon numaranızla aynı olmalı.
- Gerekli 4 değer (Render'a girilecek): `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`. Bunları sohbete yazmayın; doğrudan Render'a girin.

## Adım 1 - Geliştirici kaydı ve uygulama (developers.facebook.com)

1. Facebook hesabınızla `developers.facebook.com` adresine girin; ilk kez giriyorsanız geliştirici kaydını tamamlayın.
2. **My Apps → Create App**. Uygulama adı: `Avedon`, e-posta: sizinki.
3. Kullanım amacı olarak **Connect with customers through WhatsApp** seçin → Next.
4. İş portföyü (business portfolio) seçin; yoksa **Create a new business portfolio** ile firmanız adına oluşturun → Next → Create app.
5. Sizi **Customize use case → Connect on WhatsApp → Quickstart** sayfasına yönlendirir.

## Adım 2 - API kurulumu, test numarası, Phone Number ID

1. Quickstart'ta **Start using the API** → **API Setup** sayfası.
2. WhatsApp Business account: varsa seçin, yoksa **Create a WhatsApp Business account** ile oluşturun.
3. **From**: Meta'nın verdiği test numarası seçili gelir. Hemen altındaki **Phone number ID** değerini not alın → `WHATSAPP_PHONE_NUMBER_ID`.
4. **To**: kendi telefon numaranızı ekleyin (SMS ile doğrular). Buraya en fazla 5 numara eklenebilir.
5. **Send message** ile `hello_world` şablonunu kendinize gönderin; telefonunuza gelince **o sohbete bir cevap yazın** (24 saatlik pencere açılır).

## Adım 3 - Kalıcı erişim anahtarı (business.facebook.com)

API Setup'taki "Generate access token" geçicidir (saatler içinde biter); kalıcı olanı sistem kullanıcısıyla alınır:

1. `business.facebook.com` → **Business Settings** (Ayarlar) → sol menüde **Users → System users**.
2. Sağ üst **Add** → ad `avedon-backend`, rol **Admin** → oluşturun.
3. Sistem kullanıcısını seçin → **Assign Assets**:
   - **Apps** → `Avedon` → **Manage app** (Full control) açın.
   - **WhatsApp accounts** → hesabınız → **Manage WhatsApp Business accounts** (Full control) açın.
   - **Assign assets**.
4. **Generate token** → uygulama `Avedon`, süre **Never** (asla dolmasın), izinler: `business_management`, `whatsapp_business_messaging`, `whatsapp_business_management` → Generate.
5. Anahtarı kopyalayıp güvenli yere alın → `WHATSAPP_ACCESS_TOKEN`. (Pencere kapanınca bir daha gösterilmez; kaybolursa yenisi üretilir.)

## Adım 4 - Uygulama gizli anahtarı

App Dashboard → sol alt **App settings → Basic** → **App secret → Show** (şifre sorar) → kopyalayın → `WHATSAPP_APP_SECRET`. Gelen her webhook bu anahtarla imzalanır; sunucu imzasız/yanlış imzalı isteği reddeder.

## Adım 5 - Doğrulama jetonu

`WHATSAPP_VERIFY_TOKEN` sizin uydurduğunuz uzun bir dizedir (ör. 30-40 karakter, harf+rakam). Aynı değer hem Render'a hem Meta'nın webhook ayarına girilir.

## Adım 6 - Render'a değerleri girin (webhook'tan ÖNCE)

1. `dashboard.render.com` → `avedon-backend` servisi → **Environment**.
2. Dört değişkeni ekleyin: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` → **Save Changes** (servis kendini yeniden yayınlar, 3-5 dk).
3. Kontrol: `https://avedon-backend.onrender.com/api/health` içinde `whatsapp` alanı `configured: true`, `appSecretSet: true`, `verifyTokenSet: true` olmalı. Bana "Render'a girdim" demeniz yeter, gerisini ben okurum.

## Adım 7 - Webhook'u bağlayın

1. App Dashboard → **Use cases → Customize** (Connect on WhatsApp) → **Configuration**.
2. **Webhook** bölümünde **Edit**:
   - Callback URL: `https://avedon-backend.onrender.com/api/whatsapp/webhook`
   - Verify token: Adım 5'teki dize (Render'dakiyle birebir aynı)
   - **Verify and save**. (Meta sunucumuza doğrulama isteği gönderir; başarılıysa `health` içinde `lastWebhookVerifiedAt` dolar.)
3. Aynı sayfada **Webhook fields → Manage** → **messages** satırında **Subscribe** işaretleyin → Done. Yalnızca `messages` yeter.

## Adım 8 - Test

Telefonunuzdan test numarasına yazın: `30/1 Ne iplik kaç tex?` Beklenen: birkaç saniyede İpek/Mert cevap verir; `health` içinde `lastInboundAt` dolar. Kayıtlı olmayan bir numaradan yazılırsa "Avedon'a kayıt olun" cevabı gider.

## Sonrası

- Numune talebi bildirimleri (pencere dışı) için onaylı bir **şablon** gerekir: WhatsApp Manager → Message templates → Utility kategorisinde şablon oluşturup onaylatın; adı Render'da `WHATSAPP_TEMPLATE_NAME`'e girilir. Bu adım asistan için şart değil.
- Gerçek numaraya geçiş: ayrı SIM alındığında API Setup → Add phone number ile eklenir; kod değişmez, yalnızca `WHATSAPP_PHONE_NUMBER_ID` güncellenir.
- Sorun olursa: `health.whatsapp` alanlarını bana söyleyin; imza hatası sunucu kayıtlarına düşer, gelen her mesaj `WhatsAppInbound` tablosunda durumuyla saklanır.

## Sorun giderme (2026-09-17 kurulumundan)

`/api/health` içindeki `whatsapp` alanı her şeyi gösterir:
- `postCount: 0` ve imza hatası yok → Meta hiç istek göndermiyor: mesaj **doğru numaraya** mı yazılıyor (test numarası panelde Step 1'de; sohbeti `https://wa.me/<numara>` ile açın), `messages` alanı abone mi, uygulama **Live** mı.
- `signatureFailureCount > 0` → Render'daki `WHATSAPP_APP_SECRET` yanlış (App settings → Basic → App secret → Show; 32 karakter).
- `wabaSubscription: hata 401 ... Session has expired` → `WHATSAPP_ACCESS_TOKEN` geçici token; sistem kullanıcısından **süresi "Asla"** olan token üretin. Beklenen: `ok (abone uygulamalar: Avedon, ...)`.
- Panel artık rehberli: Kullanım durumları → Customize → **Step 1. Try it out** (test numarası, Phone Number ID, WABA ID), webhook **Step 2. Production setup** içinde. Sistem kullanıcıları: `business.facebook.com/latest/settings/system_users?business_id=<portföy no>`.
- Uygulamayı yayınlamak için gizlilik politikası adresi gerekir: `https://avedon-blond.vercel.app/gizlilik.html`.
