# Avedon mobil tasarım rehberi — C · Pazar Masası

Onaylanan tasarım yönü (2026-09-14): **C · Pazar Masası** — alım satım yapan için yoğun, bilgi önde bir B2B düzen. Taslaklar `docs/tasarim-yonleri/` (tuval: `canvas.json`), tokenlar `src/theme/index.ts`. Uygulama aşamaları: 1 yazı tipi · 2 renk ve üst bant · 3 yükleniyor/boş/hata durumları · 4 basma geri bildirimi · 5 ekran düzenleri. Denetim: `design-baseline.json`.

Yeni bir ekran yazarken önce buradaki kalıplardan birini kullan; kalıp yoksa en yakın taslağa bak. Tek seferlik stil yazmadan önce ortak bileşene ekle.

## Tokenlar (`src/theme/index.ts`)

| Grup | Değerler | Kural |
|---|---|---|
| Zemin / yüzey | `background` #EEF1F4 (gri zemin), `surface` #FFFFFF (bloklar), `surfaceTonal` (giriş alanları) | Ekran gri, içerik beyaz bloklarda. Gölge yok. |
| Marka | `primary` #133C5F (üst bant, birincil düğme, kodlar), `accent` #2696C6 (firma adları, bağlantılar, okunmamış) | |
| Çizgiler | `border` (kutu çerçevesi), `divider` (satır arası), `borderStrong` (çerçeveli düğme, bekleyen adım) | |
| Durum | `success`/`successSoft` (stokta, teslim), `warning`/`warningSoft`/`warningDot` (az stok, süreç sürüyor), `danger`/`dangerSoft`, `notification` (kırmızı sayı rozeti) | Renk tek başına anlam taşımaz; yanında metin olur. |
| Etkileşim | `pressed` #E4E9EE (basılı satır zemini), `chevron`, `chip`, `onPrimaryMuted` | |
| Boşluk | `gutter` 14 (satır/blok yatay iç boşluğu), `blockGap` 8 (bloklar arası gri aralık), `xs/sm/md/lg/xl` 4/8/16/24/32 | |
| Köşe | `md` 6 (düğme, alan, görsel, avatar), `sm` 4 (etiket/rozet), `lg` 8 (baloncuk), `pill` yalnızca sayı rozeti ve nokta | Hap biçimli düğme yok. |
| Yazı | IBM Plex Sans (metin) + **IBM Plex Mono** (ürün kodu, gramaj/en/stok, saat, tarih, telefon, VKN) | `fontWeight` kullanılmaz; kalınlık ayrı yazı tipi dosyasıyla (`fonts.semibold` vb.). **Ölçek (2026-09-15, kullanıcı "yazı küçük" dedi, taslaktan ~2px büyük):** title 24 · heading 19 · subtitle 17 · body 16 · label 15 · caption 13 · mono 15 · monoStrong 17. En küçük metin 11 (rozet/etiket). |
| Dokunma | `MIN_TOUCH` 44 | Her dokunulabilir öğe en az 44px (ya da `hitSlop`). |

## Düzen kalıpları

- **Blok:** kenardan kenara beyaz alan, köşesiz, gölgesiz. Bloklar arasında `blockGap` gri aralık. Kutu yığını (köşeli, aralıklı beyaz kartlar) kullanılmaz.
- **Bölüm başlığı:** `SectionHeader` — bloğun üstünde küçük gri başlık, isteğe bağlı eşit aralıklı sayı: "Ürünler (12)".
- **Çizgili satır:** `ListRow` (başlık, alt başlık, sol öğe, sağ ek bilgi, ok). Son satırda çizgi yok (`divider={index < n - 1}`).
- **Arama çubuğu:** beyaz şerit içinde `SearchField` (Ürünler, Mesajlar).
- **Görünüm seçimi (Ürünler):** arama şeridinin altında iki eşit düğme, seçili olan lacivert dolu. "Tümü" tek akış, "Çeşitler" kumaş çeşidi klasörleri (klasör satırı: açık mavi kare içinde klasör ikonu + "N ürün"); açık klasörün üstünde geri satırı. Seçim cihazda hatırlanır. Arama yazılınca klasörler yerine sonuçlar gelir.
- **Başlık eylemleri:** `HeaderButton` — lacivert bantta yalnızca ikon (Akış: danışman, paylaş) ya da ikon + kısa etiket (Mesajlar: + Yeni). Düz metin eylem yok.
- **Sabit eylem çubuğu:** ekranın altında beyaz, üst çizgili, `PrimaryButton size="lg"` (Ürün sayfası: Firma + Numune Talep Et; Numune takibi: adımı işaretle). Alt güvenli alan `useSafeAreaInsets` ile çubuğun kendisine eklenir.
- **Yazma alanı:** tonlu giriş kutusu + 44px kare lacivert gönder düğmesi (Sohbet, Yorumlar).

## Ortak bileşenler

| Bileşen | Ne için |
|---|---|
| `ListRow` | Menü, kişi, hesaplama, çalışan satırları |
| `ProductRow` | Ürün listesi satırı (Ürünler, Firma sayfası): 64px görsel, kod + tip etiketi, firma, içerik, ölçüler + stok, "Talep Et" |
| `StockIndicator` | `StockDot` / `StockValue` / `StockBadge`; **100 m altı "az stok"** (turuncu) |
| `SampleStatusBadge` | Numune durumu: talep edildi mavi · onaylandı/hazırlandı turuncu · teslim yeşil; metin sunucudan |
| `PrimaryButton` | `primary` / `secondary` / `outline`, `md` (44) / `lg` (48), isteğe bağlı `icon` |
| `CompanyAvatar` | Kare (6px) lacivert baş harf ya da firma logosu |
| `Skeleton` | `SkeletonList` / `SkeletonDetail`; yeni düzendeki listeler **blok** (tek beyaz blokta çizgili) ya da **yığın** (akış) iskeleti kullanır |
| `StateView` | `EmptyState`, `ErrorState`, `InlineError` |

## Basma geri bildirimi (4. aşama)

- Beyaz satır/blok basılıyken zemini `colors.pressed` olur; Android'de ayrıca `android_ripple`.
- Dolu lacivert düğme basılıyken `opacity 0.85`; çerçeveli/tonlu düğmenin zemini `pressed` olur.
- Satır içi metin bağlantısı ve ikon düğmesi basılıyken `opacity 0.6`.
- Lacivert bant üzerindeki düğmeler basılıyken hafif açık zemin (`rgba(255,255,255,0.14)`).

## Titreşim sözlüğü (`src/features/haptics.ts`)

| Çağrı | Ne zaman |
|---|---|
| `haptics.selection()` | Seçim değişti (çip, birim, sekme) |
| `haptics.light()` | Hafif anında onay (beğen) |
| `haptics.success()` | **Önemli** bir işlem sunucuda tamamlandı: kaydet, talep adımı, sil, bağlantı kur/kabul |
| `haptics.warning()` | Geri alınamaz işlemin onayı soruldu (`confirmAction` destructive'de kendisi çağırır) |
| `haptics.error()` | İşlem başarısız |

Basmanın kendisi titreşmez. Sohbet mesajı ve yorum gibi **sık** işlemlerde başarı titreşimi yok, yalnızca hata. Web'de titreşim kapalı.

## Web kuralları

- **İç içe düğme yok.** İçinde başka dokunulabilir öğe olan satırda web'de rol verilmez: `accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}` (react-native-web "button" rolünü gerçek `<button>` yapıyor).
- **`Alert.alert` kullanılmaz.** react-native-web'de boş bir fonksiyon (hiçbir şey göstermez). Onay için `src/features/confirm.ts` → `confirmAction()` (web'de tarayıcı onayı, telefonda sistem penceresi).
- `expo-secure-store` web'de yok; oturum jetonu `src/features/tokenStorage.ts` üzerinden.

## Erişilebilirlik

- İkon düğmelerinde `accessibilityLabel` zorunlu (gizli etiketli `HeaderButton`, sayaçlı eylemler: "Beğen, 24").
- Satırlarda okunabilir birleşik etiket ("ORM-0587, Bursa Örme San., Hazırlandı. Takibi aç").
- Metin karakteri ikon olarak kullanılmaz (✓ ✕ ♥ →); Ionicons.
- Görünür metinde uzun tire (—) kullanılmaz.
- İskelet "hareketi azalt" açıksa sabit durur.

## Yeni düzene henüz geçmeyen ekranlar (2026-09-15)

Taslaklarda karşılığı olmayanlar; aynı kalıplarla uyarlanmalı:

- Kayıt adımları: `RoleSelection`, `Position`, `PersonalInfo`, `CompanyInfo`, `PhoneVerification`, `CompanyCode`, `OnboardingLayout`, `OtpCodeField`
- Formlar: `AddProduct`, `CreatePost`, `EditCompany`, `SampleRequestForm`, `TextField`, `ChipSelect`
- 7 hesaplama formu, `GarmentVisualCost`, `Advisor`, `Admin`
- `ImageViewerModal` (✕ karakteri), kalan uzun tireler: `FabricWeightCalculator`, `CompanyCodeScreen`, `GarmentVisualCostScreen`
