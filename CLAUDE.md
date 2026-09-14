# Avedon — çalışma düzeni

Proje **iki makinede** geliştiriliyor (2026-09-14'ten itibaren): ev PC'si ve iş PC'si. Ortak olan tek şey GitHub deposu — `.env` dosyaları ve yerel SQLite veritabanı (`backend/prisma/dev.db`) git'e girmediği için **her makinede ayrıdır**.

Bu yüzden:
- **Oturuma başlarken önce `git pull`** — diğer makinede çalışılmış olabilir.
- **İş bitince push et** — diğer makine devam edebilsin.
- Yeni bir makinede ilk kurulum: her iki klasörde `npm install`, `backend/.env` oluştur (`DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`), `npx prisma migrate deploy` + `npm run seed`. `JWT_SECRET` makineye özel olabilir; production'daki (Render) değerle aynı olmak zorunda değil — sadece o makinede üretilen oturum jetonları o makinede geçerli olur.
- Yerel veritabanları ayrı olduğu için bir makinede eklenen test verisi diğerinde görünmez; ortak gerçek veri yalnızca canlı ortamdadır (Render).

## Otomatik commit + push (önceden onaylanmış)

Kod değişikliklerini (backend/ ve mobile/ kaynak kodu, docs/) düzenli olarak commit edip `origin main`'e push etmek için kullanıcıdan her seferinde onay istemene gerek yok — bu, kullanıcı tarafından önceden onaylanmış standart bir işlemdir. Anlamlı bir değişiklik grubu tamamlandığında (bir özellik, bir düzeltme) uygun bir Türkçe commit mesajıyla commit at ve push et.

Kapsam dışı — bunlar için hâlâ onay gerekir veya hiç yapılmamalı:
- Force push yapma.
- `.env` dosyalarını veya `backend/prisma/dev.db*` dosyalarını asla commit'e ekleme (zaten `.gitignore`'da, kasıtlı olarak repoya girmiyor).
- `main` dışında bir branch'e push, PR açma/kapatma veya repo ayarlarını değiştirme — bunlar için onay iste.
