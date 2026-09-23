# DESIGN.md — Avedon arayüz kuralları (Claude Code bunu her oturumda okur)

Bu dosya, onaylanmış tasarım sisteminin koda uygulanma kurallarıdır. Görsel referanslar:
- Tasarım sistemi (token, bileşen, marka kitabı): https://claude.ai/artifact/9LnpXPcDBu3kwSuqD7rkcK
- Ekranlar (9 artboard, 375 px): https://claude.ai/artifact/29MKBhA1RivVmPm3YPGQrb

**Uygulama notu (2026-09-22):** kod tabanı Expo/React Native (web + native). CSS değişkenleri RN bileşenlerinde çalışmadığı için token'lar `mobile/src/theme/tokens.ts`'e aynı adlarla aktarıldı (`surface-0` → `colors.surface0`, `.body-16` → `type.body16`, `--space-4` → `space[4]`); ekranlar `useTheme()` ile alır. `design/tokens.css` web sayfaları (public/) ve `data-theme` anahtarı için yüklenir. Aşağıdaki kurallardaki CSS adları bu eşlemeyle okunur.

Token'lar `design/tokens.css` dosyasında hazır. **Kodda ham hex, ham px yazılmaz; her renk, boşluk, köşe ve yazı boyutu bir CSS değişkeninden gelir.** Yeni bir değer gerekiyorsa önce `design/tokens.css`'e token olarak eklenir.

## 1. Kurulum
- `design/tokens.css` global olarak en başta yüklenir. Google Fonts: IBM Plex Sans (400, 500, 600) ve IBM Plex Mono (500).
- `<html>` üzerinde `data-theme="light" | "dark"`; tema seçilmemişse `prefers-color-scheme` geçerli. Tema anahtarı ("Görünüm") ve hesap ayarları ana sayfada sağ üstteki profil avatarından açılan alt sayfada (Profilim · Görünüm · Çıkış); ayrı bir ayar sekmesi yok.
- Sayfa genişliği 375 px'e göre; içerik `max-width: 480px; margin: 0 auto` ile daha büyük ekranlarda ortalanır. Yatay kaydırma hiçbir ekranda olmaz.
- PWA: manifest `theme_color` = `#1f3a5f`, `background_color` = `#f6f4f0`; simge 192/512 px maskable (güvenli alan %80). Simge SVG'si `design/icon.svg`.
- Güvenli alanlar: üst bant `padding-top: env(safe-area-inset-top)`, alt sekme `padding-bottom: env(safe-area-inset-bottom)`.

## 2. Yerleşim iskeleti (her ekran)
```
<header class="appbar">  56px, --surface-brand, --on-brand; sol geri/logo (44px), başlık .title-18, sağda en fazla 2 ikon düğmesi (44px) ya da sessiz metin düğmesi (`.button-16` `--on-brand`, ör. Katalogda "Seç"; ikonun anlamı belirsizse metin kullanılır)
<main>                   padding: 0 var(--space-4); bölümler arası var(--space-6); son eleman altında sekme ekranında sekme çubuğu yüksekliği + alt güvenli alan, diğerlerinde var(--space-10) + alt güvenli alan (`useBottomPadding`)
<nav class="tabbar">     64px, --surface-1, üst kenarlık --line; 5 sekme: Ana sayfa · Katalog · Talepler · Mesajlar · Firmalar
```
Arama kutusu banta gömülmez; `main` içinde 48px ayrı alan (`--surface-1`, `--line-strong` kenarlık, `--radius-md`).
Ekranın tek ana eylemi varsa (Ürün detayı: "Numune talep et") yapışkan alt çubuk: `--surface-1`, üst kenarlık `--line`, `--shadow-raised`, içinde `control-lg` 52px dolu düğme.

## 3. Bileşenler (ölçüler token adıyla)
| Bileşen | Kural |
| --- | --- |
| Düğme | yükseklik `--control` 48px (ana eylem `--control-lg` 52px, tam genişlik); `--radius-md`; `.button-16`; ikon solda `--icon-sm` 20px + `--space-2`. Türler: **dolu** `--brand`/`--on-brand`, basılı `--brand-strong`; **kenarlıklı** `--surface-1` + 1px `--line-strong` + `--ink`; **sessiz** zeminsiz `--brand`; **tehlikeli** kenarlıklı, `--danger`. Pasif: `opacity:.4`. Ekranda en fazla 1 dolu düğme. |
| Giriş alanı | etiket üstte `.label-14` `--ink-2`; alan 48px, `--radius-md`, 1px `--line-strong`, odak `outline: 2px solid var(--focus); outline-offset: 2px`. Hata: kenarlık `--danger` + altında `.body-14` `--danger` metin + ikon. Birim eki (gr/m², cm, ₺/kg) sağda `.mono-14` `--ink-3`. Sayısal alanlarda `inputmode="decimal"`. |
| Kart | `--surface-1`, 1px `--line`, `--radius-lg`, iç boşluk `--space-4`. Gölge yok. Tamamı tıklanabilirse sağda 24px chevron `--ink-3`. |
| Ürün kartı | sol 72px görsel `--thumb` `--radius-sm` 1px `--line`; ad `.body-16-strong`; kod `.mono-14` `--ink-2`; özellik satırı `.body-14` `--ink-2` ("165 gr/m² · 160 cm · %94 PES %6 EA"); firma `.body-14` `--ink-3` + doğrulanmış rozeti. Görsel yoksa `--surface-2` kare + kumaş ikonu. |
| Liste satırı | min 64px `--row`; sol 40px avatar (kişi `--radius-full`, firma `--radius-sm`, zemin `--brand-soft`, harfler `--brand`); başlık `.body-16-strong`, alt `.body-14` `--ink-2`; sağ zaman `.caption-12` `--ink-3` / rozet / chevron. Satırlar tam genişlik 1px `--line` ile ayrılır. Okunmamış: alt metin `--ink` 500 + `--accent` sayaç (20px pill, `--on-brand` metin). |
| Rozet | 22px, `--radius-sm`, `.caption-12` BÜYÜK HARF, `--space-2` yatay iç boşluk, 14px ikon. DOĞRULANMIŞ `--success-soft`/`--success`; BEKLİYOR `--warning-soft`/`--warning`; TESLİM EDİLDİ `--success`; İPTAL `--danger-soft`/`--danger`; YENİ `--accent-soft`/`--accent`; STOKTA `--brand-soft`/`--brand`. Her rozette ikon + metin (yalnız renk değil). |
| Çip / filtre | 36px pill `--radius-full`, 1px `--line-strong`, `.label-14`; seçili: `--brand` zemin, `--on-brand` metin. Yatay kaydırılır, satır kırmaz. Katalogda tek çip satırı (Süzgeç · Kumaş/İplik · çeşitler); ek süzgeçler (kullanım alanı vb.) "Süzgeç" çipinden açılan alt sayfada. |
| Düğme satırı | Yan yana düğmelerde metin asla kısaltılmaz (`ui/ButtonRow`): sığmıyorsa düğmeler alt alta, tam genişlik dizilir. |
| Bilgi tablosu | Satır min 64px, 1px `--line` ayırıcı; etiket `.body-16` `--ink-2` normal, değer `--ink` (kod/numara `.mono-14`); boş değer "Eklenmemiş" `--ink-3`. Ürün detayı ve firma sayfasında aynı. |
| Talepler listesi | Tek segment: Gönderdiğim / Gelen. Numune, teklif ve açık talep tek listede, tarihe göre yeniden eskiye; satır sağında tür rozeti (NUMUNE / TEKLİF / AÇIK TALEP, `info`) + durum rozeti. Durumlar süzgeçte 4 gruba toplanır: Bekliyor (`pending`), Sürüyor (`info`/`new`), Tamamlandı (`delivered`), Kapandı (`cancelled`). Tür/durum süzgeci üst banttaki süzgeç ikonundan açılan alt sayfada çiplerle; seçim varken ikonda nokta ve listede "Temizle". |
| Firma sayfası sekmeleri | 5 sekme: Ürünler · Makineler · Hakkında · Kişiler · Belgeler. Şerit yatay kaydırılır; sekme adı asla kısaltılmaz, sığmayan kaydırılır. Aktif: `.label-14` `--brand` + 2px `--brand` alt çizgi, pasif `--ink-3`. Firma düzenleme yalnızca üst banttaki kalem ikonundan (eylem satırında ayrı düzenle düğmesi yok). |
| Makine kartı (Makineler sekmesi) | Kart; solda başlık `.body-16-strong` "Tür · Marka Model" (tür: Yuvarlak örme / Raschel / Düz örme / Dokuma, eşleşmezse girilen tür), altında değerler `.body-14` `--ink-2` etiket + `.mono-14` değer (çap inç, fine, sistem, iğne, adet, günlük kapasite kg; yalnız dolu olanlar), dar ekranda sarılır. Sağda sabit genişlikte (`--status-column`) müsaitlik: 8px nokta + `.label-14` metin (renk tek başına anlam taşımaz). Müsait `--success` + altında "Fason alınabilir"; ≤7 gün dolu `--warning` "5 gün dolu"; daha uzun `--danger` "2 hafta dolu" / 14 günden fazlaysa "12 Ekim'e kadar". Metin her çizimde bugüne göre hesaplanır. Güncelleme 14 günden eskiyse altında `--ink-3` "3 hafta önce güncellendi". Sahibi duruma dokununca alt sayfa: Müsait · 1 hafta dolu · 2 hafta dolu · 1 ay dolu · Tarih seç; karta dokununca düzenler. Sahibe kenarlıklı "Makine ekle". Boş: "Makine parkurunu ekle, fason iş alan firmalar arasında görün". Genel aramada "Fason makine" grubu aynı durum sütunuyla. |
| Segment kontrol | `--surface-2` zemin 4px iç boşluk `--radius-md`; öğe 36px; seçili `--surface-1` + 1px `--line`. |
| Sekme çubuğu | 64px; 5 sekme: Ana sayfa · Katalog · Talepler · Mesajlar · Firmalar. İkon 24px `--icon` + `.caption-12` etiket her zaman birlikte; aktif sekme: `--brand-soft` zemin + üstte 2px `--brand` çizgi + `--brand` ikon/metin; pasif `--ink-3`; bildirim noktası 8px `--accent`. Hesap araçları sekme değil: ana sayfadaki "Hesap araçları" kısayolundan açılan, geri oklu üst bantlı ayrı sayfa; "Dış pazar" da bu sayfanın içinde. |
| Paylaşım kartı (akış) | `--surface-1` kart, `--radius-lg`, 1px `--line`, iç boşluk yok (bölümler kendi boşluğunu taşır). Üst satır: 40px firma logosu karesi (`--brand-soft`/`--brand`, `--radius-sm`, firma sayfasına gider), firma adı `.body-16-strong` **asla kısaltılmaz** (sığmazsa alt satıra kırılır), doğrulanmışsa adın yanında yalnızca ikon (shield-checkmark, `--icon-xs` 14px, `--success`, erişilebilirlik adı "Doğrulanmış firma"; metinli rozet değil). İkinci satır `.body-14` `--ink-3`: solda "Kişi · Görev" (tek satır, gerekirse kısaltılır), sağda göreli zaman (§5 kuralı). Sağda 44px "daha fazla" ikon düğmesi. Metin `.body-16`, 16px yan boşluk; ölçülen metin 3 satırı aşıyorsa 3 satıra kesilir ve altında `--brand` "…devamı" bağlantısı çıkar (dokununca açılır); kesilmeyen metinde bağlantı yok. İsteğe bağlı görsel 343×180 `object-fit: cover`. Ürün bağlıysa 44px ürün çipi (32px görsel + ad + `.mono-14` kod). Alt satır 44px, üst kenarlık `--line`, 3 eşit eylem: beğen (sayı), yorum (sayı), ana eylem `--brand` (açık talepte "Teklif ver"/"Teklifleri gör"; ürün varsa "Numune talep et"; yoksa yazarla sohbet açan "Mesaj gönder"; kendi paylaşımında "Paylaş"). Akış ana sayfada "Sektörden" başlığıyla, hızlı eylemlerin ALTINDA; yalnızca bağlantılı firmaların paylaşımları, en yeni üstte. Akış (Bağlantılarım) boşsa boş durum: "Firmaları takip et, yenilikleri burada gör" + tek cümle açıklama + Firmalar sekmesine giden kenarlıklı "Firmaları keşfet" düğmesi. |
| Kısayol kutusu (Ana sayfa) | Dünyayı Keşfet · Teklif iste · Hesap araçları · Tekstil asistanı. 80px, `--surface-1` kart; sol 40px ikon karesi `--brand-soft`/`--brand` `--radius-md`; metin 16px 600, iki satıra kırılabilir. 2 sütun, aralık `--space-3`. |
| Araç kutusu (Hesap araçları) | 96px, ikon karesi 36px üstte, metin 15px 600 altta; 2 sütun. |
| İstatistik kutusu | sayı `.display-28` (vurgulu ise `--accent`), etiket `.body-14` `--ink-2`; 3 sütun. |
| Boş durum | dikey ortada; 48px kontur ikon `--ink-3` (1.5px), `.title-18` başlık (yapılacak işi söyler), `.body-14` `--ink-2` tek cümle (max 280px), altında kenarlıklı düğme. |
| Alt sayfa (sheet) | `--surface-1`, üst köşe `--radius-lg`, iç boşluk `--space-5`, arka `--overlay`, `--shadow-raised`; üstte 36×4 px tutamaç `--line-strong`. |
| Yükleme | iskelet bloklar `--surface-2`, metin satırı yüksekliğinde, `--radius-sm`. Dönen simge yalnızca düğme içinde. |
| Kumaş görseli | gerçek fotoğraf `object-fit: cover`; koyu temada da kendi renginde, 1px `--line` çerçeve. |

## 4. İkonlar
Lucide (kontur, 24px, `stroke-width: 1.75`, yuvarlak uç). Dolu ikon yalnızca aktif sekme. Emoji yok. Sektör ikonları (kumaş topu, iplik bobini, terazi, makine) aynı dille inline SVG. İkon rengi her zaman metnin token'ı (`currentColor`).

## 5. Tipografi kullanımı
`.title-22` ekran başlığı (bantta `.title-18`) · `.title-18` bölüm/kart başlığı · `.body-16` gövde · `.body-14` ikincil · `.label-14` sekme/çip · `.caption-12` yalnızca rozet ve zaman · `.mono-14` kod, gramaj, en, içerik, iplik numarası · `.display-28` tek büyük sonuç. Gövde 16px altına inmez. Başlıklar cümle düzeni; BÜYÜK HARF yalnız rozet.

**Göreli zaman** (`features/time.ts` `formatRelativeTime`, her listede aynı): 1 dk altı "şimdi" · "5 dk" · "2 sa" · 24–48 saat "Dün" · "3 gün" (7 güne kadar) · daha eskisi "14 Eyl" (Türkçe ay kısaltması: Oca Şub Mar Nis May Haz Tem Ağu Eyl Eki Kas Ara); bu yıldan değilse yıl eklenir: "14 Eyl 2025".

## 6. Erişilebilirlik (zorunlu)
- Dokunma hedefi ≥ 44×44 (`--touch-min`), aralarında ≥ 8px.
- Metin kontrastı ≥ 4.5:1 (token çiftleri bunu sağlar; `--ink-3` yalnız `--surface-0/1` üzerinde, 14px altında değil).
- Gerçek `<button>`, `<a href>`, `<input>` + `<label>`; ikon-yalnız düğmede `aria-label`; div'e tıklama bağlanmaz.
- Durum yalnız renkle verilmez (ikon + metin). Sistem yazı büyütmesi %130'da düzen kırılmaz: metin sığmazsa kart uzar.

## 7. Yapılmayacaklar
Gradyan, cam efekti, renkli gölge, kartın sol kenarında renkli şerit, emoji, ekranda ikiden fazla dolu düğme, gri üzerine gri metin, sahte durum çubuğu, ham hex/px.

## 8. Ekran listesi ve karşılık gelen artboard
1 Ana sayfa — bugün, hızlı eylemler, altında "Sektörden" akışı (`Main`) · 2 Katalog/arama (`Katalog`) · 3 Ürün detayı (`Urun`) · 4 Firma sayfası (`Firma`) · 5 Mesajlar (`Mesajlar`) · 6 Hesap araçları + asistan (`Hesap`; sekme değil, ana sayfa kısayolundan açılan geri oklu sayfa, "Dış pazar" içinde) · 7 Talepler boş durum (`BosDurum`) · 8 Koyu tema (`AnaSayfaKoyu`) · 9 Simge (`Simge`).
Henüz çizilmemiş ekranlar (numune talep formu, hesap aracı iç ekranı, asistan sohbeti, kayıt akışı) aynı bileşenlerle ve aynı iskeletle yapılır; yeni bir bileşen gerekiyorsa önce bu dosyaya eklenir.
