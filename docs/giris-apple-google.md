# Apple ve Google ile giriş — kurulum araştırması (2026-09-24)

Karar (Fırat onayı): İngilizce sürümden sonra yapılacak. Giriş ekranında Telefonla / Google ile / Apple ile; Google/Apple ile ilk girişte bir kez telefon doğrulaması.

Önemli bulgular:
- Apple Developer Program yıllık 99 USD; marka Takyon görünecekse kurumsal hesap (D-U-N-S, alan adlı e-posta, çalışan web sitesi).
- Apple web girişi için alan adı: takyon.ai bağlanana kadar beklemek güvenli (paylaşımlı vercel.app/onrender.com kabulü doğrulanamadı).
- Apple ad/e-postayı yalnızca ilk girişte verir; gizli relay e-posta olabilir.
- App Store 4.8: Google girişi sunan iOS uygulaması eşdeğer (Apple) girişi de sunmalı; PWA bağlı değil.
- Google: Cloud Console → Google Auth Platform (Branding, Audience=External, Publish app) → Clients → Web application; origins: vercel adresi, takyon.ai, localhost:8081. Değer: GOOGLE_CLIENT_ID (Render) + EXPO_PUBLIC_GOOGLE_CLIENT_ID (Vercel).
- Apple değerleri: APPLE_TEAM_ID, APPLE_SERVICES_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (.p8 içeriği; sohbete yazılmaz).

Doğrulanamayanlar: Apple paylaşımlı alan adı kabulü; Apple alan doğrulama dosyası çelişkisi; Google marka doğrulaması koşulları; bireysel→kurumsal Apple hesap geçişi.

Kaynaklar: developer.apple.com/programs/enroll, developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web, developer.apple.com/help/account/keys/create-a-private-key, developer.apple.com/app-store/review/guidelines/#login-services, support.google.com/cloud/answer/15549257
