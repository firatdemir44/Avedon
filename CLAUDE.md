# Avedon — çalışma düzeni

Bu bilgisayar projenin tek geliştirme ortamı. Kullanıcı başka bir makinede (iş yeri vb.) geliştirme yapmıyor — kod da, veritabanı da burada yaşıyor.

## Otomatik commit + push (önceden onaylanmış)

Kod değişikliklerini (backend/ ve mobile/ kaynak kodu, docs/) düzenli olarak commit edip `origin main`'e push etmek için kullanıcıdan her seferinde onay istemene gerek yok — bu, kullanıcı tarafından önceden onaylanmış standart bir işlemdir. Anlamlı bir değişiklik grubu tamamlandığında (bir özellik, bir düzeltme) uygun bir Türkçe commit mesajıyla commit at ve push et.

Kapsam dışı — bunlar için hâlâ onay gerekir veya hiç yapılmamalı:
- Force push yapma.
- `.env` dosyalarını veya `backend/prisma/dev.db*` dosyalarını asla commit'e ekleme (zaten `.gitignore`'da, kasıtlı olarak repoya girmiyor).
- `main` dışında bir branch'e push, PR açma/kapatma veya repo ayarlarını değiştirme — bunlar için onay iste.
