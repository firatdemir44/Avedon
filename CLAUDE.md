# Avedon — çalışma düzeni

Proje **iki makinede** geliştiriliyor (2026-09-14'ten itibaren): ev PC'si ve iş PC'si. Ortak olan tek şey GitHub deposu — `.env` dosyaları ve yerel SQLite veritabanı (`backend/prisma/dev.db`) git'e girmediği için **her makinede ayrıdır**.

Bu yüzden:
- **Oturuma başlarken önce `git pull`** — diğer makinede çalışılmış olabilir.
- **İş bitince push et** — diğer makine devam edebilsin.
- **`git pull` sonrası:** yeni paket geldiyse ilgili klasörde `npm.cmd install`; yeni migration geldiyse `backend`'de `npx.cmd prisma migrate deploy` + `npx.cmd prisma generate`.
- Yeni bir makinede ilk kurulum: her iki klasörde `npm install`, `backend/.env` oluştur (şablon: `backend/.env.example` — `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`), `mobile/.env` oluştur (şablon: `mobile/.env.example` — `EXPO_PUBLIC_API_URL` o makinenin IPv4 adresi), `npx prisma migrate deploy` + `npm run seed`. `JWT_SECRET` makineye özel olabilir; production'daki (Render) değerle aynı olmak zorunda değil — sadece o makinede üretilen oturum jetonları o makinede geçerli olur. Gizli değerler kullanıcı tarafından makineler arasında taşınır; sohbete yazılmaz.
- Yerel veritabanları ayrı olduğu için bir makinede eklenen test verisi diğerinde görünmez; ortak gerçek veri yalnızca canlı ortamdadır (Render).
- Sunucuları başlatma: `backend`'de `npm.cmd run dev`, `mobile`'da `npx.cmd expo start --lan` (`CI=1` ile değil: o kipte Metro değişiklikleri izlemez, eski paketi sunar).

## Kullanıcı ve çalışma tercihleri

Asistanın hafızası makineye özel olduğu için kalıcı tercihler burada:
- Kullanıcı yazılımcı değil ve Türkçe konuşuyor. Açıklamalar sade Türkçe; teknik ayrıntı gerekmedikçe verilmez.
- **Windows PowerShell'de script çalıştırma kapalı:** `npm`/`npx` yerine `npm.cmd`/`npx.cmd` kullanılır.
- **Adım adım onay isteme:** karar gerektirmeyen işler doğrudan yapılır; yalnızca gerçekten kullanıcıya ait kararlar sorulur.
- Açık işler, kararlar ve cihaz testi bekleyenler **`docs/yapilacaklar.md`**'ye yazılır (oturuma başlarken önce orası okunur); sohbette kalması yetmez.
- Özellikler yüzeysel değil derinlemesine yapılır: uçtan uca, kenar durumları ve testleriyle. Kurulum işi proje ilerlemesi gibi sunulmaz.
- Asistan kimlik bilgisi, ödeme bilgisi girmez ve güvenlik ayarlarını (güvenlik duvarı vb.) değiştirmez; bunları kullanıcı yapar.
- Tasarım dili: **C · Pazar Masası** (`docs/tasarim-yonleri/`, tokenlar `mobile/src/theme/index.ts`). Yeniden tasarım aşamalı ilerliyor, her aşama telefonda kontrol ediliyor; durum `docs/yapilacaklar.md`'de.

## Otomatik commit + push (önceden onaylanmış)

Kod değişikliklerini (backend/ ve mobile/ kaynak kodu, docs/) düzenli olarak commit edip `origin main`'e push etmek için kullanıcıdan her seferinde onay istemene gerek yok — bu, kullanıcı tarafından önceden onaylanmış standart bir işlemdir. Anlamlı bir değişiklik grubu tamamlandığında (bir özellik, bir düzeltme) uygun bir Türkçe commit mesajıyla commit at ve push et.

Kapsam dışı — bunlar için hâlâ onay gerekir veya hiç yapılmamalı:
- Force push yapma.
- `.env` dosyalarını veya `backend/prisma/dev.db*` dosyalarını asla commit'e ekleme (zaten `.gitignore`'da, kasıtlı olarak repoya girmiyor).
- `main` dışında bir branch'e push, PR açma/kapatma veya repo ayarlarını değiştirme — bunlar için onay iste.
