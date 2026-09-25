# Avedon — çalışma düzeni

**TEK MAKİNE, TEK OTURUM (kullanıcı kararı, 2026-09-15):** Geliştirme yalnızca **iş PC'sinde** yapılır. İş PC'si sürekli açık kalır; kullanıcı evden ve telefondan bu makinedeki oturuma **Remote Control** ile bağlanır (Claude mobil uygulamasının Code sekmesi veya claude.ai/code). Gerekçe: 2026-09-14/15'te iki makinede çalışmak ayrı `.env`, ayrı veritabanı ve senkron kaymasıyla sürekli sorun çıkardı.

- **Ev PC'sinde geliştirme yapılmaz.** Oradaki Claude oturumu ("Avedon projesini ilk çalıştırma") kullanılmaz. Ev PC'sinde bu projeyle ilgili bir istek gelirse: işi yapma, kullanıcıya iş PC'sindeki oturumu hatırlat.
- Canlı veri kalıcı olduğu için (Render diski) hiçbir makinenin yerel veritabanı "gerçek veri" değildir; iş PC'sindeki `backend/prisma/dev.db` yalnızca geliştirme/test içindir.
- İş PC'si: kablolu ağ, `mobile/.env` → `EXPO_PUBLIC_API_URL=http://192.168.1.30:4000/api`. Telefon **iş yerindeki ağdayken** Expo Go ile `exp://192.168.1.30:8081` üzerinden bağlanır (2026-09-15'te doğrulandı). **Evdeyken telefon bu adrese ulaşamaz** — evden telefon testi için çözüm henüz kurulmadı, bkz. `docs/yapilacaklar.md`.
- **Remote Control riskleri:** PC uyur/ağ koparsa oturum ağ gelince kendiliğinden bağlanır. Ama **Windows yeniden başlarsa oturum kapanır** ve biri PC başına gidip Claude masaüstü uygulamasını açana kadar uzaktan erişim olmaz. Windows etkin saatleri 2026-09-15'te 08:00–17:00 idi (yeniden başlatma bu saatlerin dışında olabilir); kullanıcıya en fazla 18 saatlik etkin saat önerildi. Asistan sistem/güncelleme ayarlarını değiştirmez.
- `git pull` alışkanlığı zararsızdır, sürer; yeni paket geldiyse `npm.cmd install`, yeni migration geldiyse `backend`'de `npx.cmd prisma migrate deploy` + `npx.cmd prisma generate`.
- Sunucuları başlatma: `backend`'de `npm.cmd run dev`, `mobile`'da `npx.cmd expo start --lan` (`CI=1` ile değil: o kipte Metro değişiklikleri izlemez, eski paketi sunar).
- Yeni makinede kurulum (yalnızca iş PC'si değişirse): her iki klasörde `npm.cmd install`, `backend/.env` (şablon `backend/.env.example`), `mobile/.env` (şablon `mobile/.env.example`), `npx.cmd prisma migrate deploy` + `npm.cmd run seed`. Gizli değerler sohbete yazılmaz.

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
- **Ürün vizyonu ve fazlar `docs/yol-haritasi.md`'de** (2026-09-16, 2021 Takyon belgesinin yeniden tasarımı: kumaş pasaportu, firma asistanı + beceri kataloğu, ürün akışı). Yeni özellik/mimari işe başlamadan önce okunur; ürün kararı değişecekse önce orası güncellenir.
- **Model seçimi (kullanıcı kararı, 2026-09-16: "gerekli yerde Fable 5.1, diğer alanlarda Opus 5; buna kendin karar ver"):** veri modeli/migration tasarımı, mimari ve plan yazımı, çok dosyaya dokunan yeniden yapılandırmalar ve kök neden araştırması **Fable 5.1**; rutin kodlama, ekran/form işleri, test yazımı, doküman güncellemeleri, yayın takibi **Opus 5**. Asistan geçişe kendisi karar verir ve ilgili işin başında hangi modelle çalıştığını kısaca söyler. **Mekanik:** ana oturumun modelini asistan kendisi değiştiremez (araç bunu reddediyor); ya kullanıcıdan /model ile geçiş ister ya da o parçayı uygun modelde çalışan bir alt göreve (Agent, model: opus/fable) verir ve sonucu kendisi doğrular (tsc, testler, tarayıcı).
- Özellikler yüzeysel değil derinlemesine yapılır: uçtan uca, kenar durumları ve testleriyle. Kurulum işi proje ilerlemesi gibi sunulmaz.
- Asistan kimlik bilgisi, ödeme bilgisi girmez ve güvenlik ayarlarını (güvenlik duvarı vb.) değiştirmez; bunları kullanıcı yapar.
- Tasarım dili: **C · Pazar Masası** (`docs/tasarim-yonleri/`, tokenlar `mobile/src/theme/index.ts`). Yeniden tasarım aşamalı ilerliyor, her aşama telefonda kontrol ediliyor; durum `docs/yapilacaklar.md`'de.

## Arayüz kuralları

Arayüz kuralları `DESIGN.md` dosyasındadır; her ekran ve bileşen ona uyar. Uygulama telefon öncelikli web uygulaması (PWA) olarak yayınlanır; kod tabanı Expo/React Native (web + native) olduğu için CSS token'ları `mobile/src/theme/tokens.ts`'e birebir aktarılır ve ekranlar `useTheme()` ile kullanır; `design/tokens.css` yalnızca web sayfaları (public/) ve `data-theme` içindir. Kodda ham hex/px yazılmaz; yeni değer önce token olur.

## Otomatik commit + push (önceden onaylanmış)

Kod değişikliklerini (backend/ ve mobile/ kaynak kodu, docs/) düzenli olarak commit edip `origin main`'e push etmek için kullanıcıdan her seferinde onay istemene gerek yok — bu, kullanıcı tarafından önceden onaylanmış standart bir işlemdir. Anlamlı bir değişiklik grubu tamamlandığında (bir özellik, bir düzeltme) uygun bir Türkçe commit mesajıyla commit at ve push et.

Kapsam dışı — bunlar için hâlâ onay gerekir veya hiç yapılmamalı:
- Force push yapma.
- `.env` dosyalarını veya `backend/prisma/dev.db*` dosyalarını asla commit'e ekleme (zaten `.gitignore`'da, kasıtlı olarak repoya girmiyor).
- `main` dışında bir branch'e push, PR açma/kapatma veya repo ayarlarını değiştirme — bunlar için onay iste.

## Takyon Texart (kumaş görseli işleme)

- Kurallar ve Faz 1 kapsamı `texart/TEXART.md` (kırmızı çizgi §1: kumaş piksellerine üretken yapay zekâ yok, renk/ışık düzeltmesi yalnız global). Çalışma sırası `texart/KOMUT.md`: her adımdan sonra kısa özet + kullanıcı onayı.
- Mimari kararı (2026-09-25): TEXART.md'deki "varsayılan Python/FastAPI" yerine backend içinde ayrı modül (`backend/src/texart/`, Node + sharp/libvips). Gerekçe: iş PC'sinde Python yok, ayrı Render servisi ek ücret ve panel işi demek; aynı kalıcı disk ve veritabanı kullanılır. Modül kendi uçlarıyla (`/api/texart`) yalıtık; gerekirse ayrı servise taşınabilir.
- Saklama: veritabanının yanındaki `texart/` klasörü (canlıda `/var/data/texart`), her iş kendi klasöründe orijinal + çıktılar + `islem_kaydi.json`. Orijinal hiç silinmez.
