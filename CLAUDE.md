# Avedon — çalışma düzeni

Proje **iki makinede** geliştiriliyor (2026-09-14'ten itibaren): ev PC'si ve iş PC'si. Ortak olan tek şey GitHub deposu — `.env` dosyaları ve yerel SQLite veritabanı (`backend/prisma/dev.db`) git'e girmediği için **her makinede ayrıdır**.

Bu yüzden:
- **Oturuma başlarken önce `git pull`** — diğer makinede çalışılmış olabilir.
- **İş bitince push et** — diğer makine devam edebilsin.
- **`git pull` sonrası:** yeni paket geldiyse ilgili klasörde `npm.cmd install`; yeni migration geldiyse `backend`'de `npx.cmd prisma migrate deploy` + `npx.cmd prisma generate`.
- Yeni bir makinede ilk kurulum: her iki klasörde `npm install`, `backend/.env` oluştur (şablon: `backend/.env.example` — `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`), `mobile/.env` oluştur (şablon: `mobile/.env.example` — `EXPO_PUBLIC_API_URL` o makinenin IPv4 adresi), `npx prisma migrate deploy` + `npm run seed`. `JWT_SECRET` makineye özel olabilir; production'daki (Render) değerle aynı olmak zorunda değil — sadece o makinede üretilen oturum jetonları o makinede geçerli olur. Gizli değerler kullanıcı tarafından makineler arasında taşınır; sohbete yazılmaz.
- Yerel veritabanları ayrı olduğu için bir makinede eklenen test verisi diğerinde görünmez; ortak gerçek veri yalnızca canlı ortamdadır (Render).
- Sunucuları başlatma: `backend`'de `npm.cmd run dev`, `mobile`'da `npx.cmd expo start --lan` (`CI=1` ile değil: o kipte Metro değişiklikleri izlemez, eski paketi sunar).

## Canlı ortam (Render + Vercel)

- Backend Render'da (Starter + kalıcı disk `/var/data`, `DATABASE_URL=file:/var/data/avedon.db`); web Vercel'de. Canlı veri kalıcıdır — gerçek pilot verisi, test kaydı eklerken dikkat.
- Render servisinin Root Directory'si `backend`: **yalnızca `backend/` altındaki değişiklikler yayın tetikler**; `docs/` veya `mobile/`-yalnız push backend'i yeniden yayınlamaz.
- Canlı sürümü `https://avedon-backend.onrender.com/api/health` ile doğrula: `commit` son push'la aynı olmalı, `storage.separateDisk` `true` olmalı. Render başarısız yayında eski sürümü açık tutar; `status: ok` tek başına yeni kodu kanıtlamaz.
- Migration'lar canlıda açılışta (`npx prisma migrate deploy` Start Command'da) gerçek veri üzerinde çalışır: push'tan önce yerel veritabanı **kopyası** üzerinde prova et. `prisma migrate dev` bu ortamda etkileşimsiz olduğu için çalışmaz; SQL'i `prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ... --script --output` ile üret.

## Kullanıcı ve çalışma tercihleri

Asistanın hafızası makineye özel olduğu için kalıcı tercihler burada:
- **ÖNCE PLAN, SONRA KULLANICIYA İŞ (kullanıcı talebi, 2026-09-15):** "Bu proje sürekli büyüyen bir proje; bir daha geriye dönüp tekrar ileri yapmayalım. En başta planlamayı doğru yürütelim." O gün Render/Cloudflare kurulumunda kullanıcı defalarca panele gönderildi: önerilen yol araştırılmadan verildi (Postgres → vazgeçildi), menü yeri doğrulanmadan tarif edildi, kanıt olmadan "çözüldü" denildi, doc-only push'un yayın tetiklemeyeceği önceden kontrol edilmedi, anahtarlar girildikten sonra teşhis eklendi. **Kural:** kullanıcıya bir panel/hesap işi yaptırmadan ÖNCE (1) seçeneği ve koşullarını (fiyat, sınır, silinme vb.) resmi dokümandan doğrula, (2) sonucu kullanıcıya sormadan ölçebilecek teşhisi (ör. `/api/health`) HAZIRLA ve canlıya çıkar, (3) tüm adımları doğrulanmış tıklama yollarıyla TEK SEFERDE ver, (4) "tamam" demeden önce gerçek testle kanıtla. Emin olunmayan bir tarif verilmez; bilinmiyorsa önce araştırılır.
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
