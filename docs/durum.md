# Avedon Projesi — Mevcut Durum Envanteri

_Bu rapor, depodaki mevcut kod tabanı okunarak (kod yazılmadan) çıkarılmıştır. Amaç: projeye yeni başlayan birinin "burada ne var, ne çalışıyor, ne eksik" sorusuna hızlıca cevap bulabilmesi._

**Depo:** `avedon` (GitHub, özel depo)
**İnceleme tarihi:** 2026-09-12
**Toplam commit sayısı:** 5 (hepsi tek gün içinde, 2026-09-08)

---

## 1. Genel Yapı

Depo kökünde tek bir proje yok; iki bağımsız alt proje var:

```
avedon/
├── backend/     → Node.js + TypeScript + Express + Prisma API sunucusu
├── mobile/      → Expo (React Native) mobil uygulama
└── .gitignore
```

Kökte `CLAUDE.md`, `package.json`, `src/` veya `docs/` **yok**. Bunlar sadece `backend/` ve `mobile/` alt klasörlerinin içinde var (aşağıda detaylı). Kodda `avedon-mvp-spec.md` adlı bir spesifikasyon dosyasına atıf var (`mobile/src/types/index.ts` içinde yorum satırı) ama bu dosya **depoda yok** — muhtemelen geliştirici bir yerde ayrı tutuyor veya kaybolmuş.

---

## 2. Backend (`backend/`)

### 2.1 Veritabanı — Prisma şeması (`prisma/schema.prisma`)

**Veritabanı motoru: SQLite** (dosya tabanlı, yerel `.db` dosyası). **Postgres değil, Supabase değil** — `datasource db { provider = "sqlite" }` olarak tanımlı, bağlantı `DATABASE_URL` ortam değişkeninden okunuyor ama sqlite için bu genelde `file:./dev.db` gibi yerel bir dosya yoludur. `.gitignore`'da `backend/prisma/dev.db` hariç tutulmuş, yani veritabanı dosyası git'e hiç eklenmemiş — depoyu klonlayan biri veritabanını sıfırdan migrate+seed ile oluşturmak zorunda.

Enum'lar Prisma/SQLite'ta native olmadığı için düz string olarak modellenmiş; geçerli değerler API katmanında `zod` ile denetleniyor.

**Tanımlı modeller (tablolar):**

| Model | Alanlar (özet) | Not |
|---|---|---|
| **Company** | id, name, taxId, about, contactEmail, contactPhone, productCategories, verification, companyCode (unique), createdAt | `verification`: dogrulanmamis / inceleniyor / dogrulanmis |
| **User** | id, accountType, position, firstName, lastName, phone (unique), phoneVerified, isAdmin, companyId?, createdAt | `accountType`: konfeksiyon / uretici / bireysel. Şifre alanı **yok** — kimlik doğrulama tamamen telefon numarası üzerinden. |
| **Product** | id, companyId, code, type, stock, weightGsm, widthCm, content, useArea, imageUrl?, createdAt | `type`: raschel / orme / dokuma / diger |
| **SampleRequest** | id, productId, requesterId, deliveryPreference, status, createdAt | `status`: talep_edildi → onaylandi → hazirlandi → teslim_edildi (sırayla ilerliyor, geri gidemez) |

İki migration mevcut: `20260908093019_init` ve `20260908105437_add_admin_flag` (isAdmin alanını sonradan eklemiş).

### 2.2 `src/` — Endpoint'ler ve Modüller

`src/index.ts` Express uygulamasını kurar, CORS açık, JSON body limiti 15MB (base64 fotoğraf yükleme için). Route dosyaları:

| Dosya | Endpoint kökü | İşlev |
|---|---|---|
| `routes/register.ts` | `POST /api/register` | Kullanıcı kaydı. Bireysel değilse: mevcut firma koduyla katılma **veya** yeni firma oluşturma (rastgele `AVD-XXXX` kodu üretir). |
| `routes/login.ts` | `POST /api/login` | Sadece telefon numarasıyla giriş — şifre yok. |
| `routes/products.ts` | `GET/POST /api/products`, `GET/PATCH/DELETE /api/products/:id` | Ürün (kumaş) CRUD + arama (kod/içerik/kullanım alanı/tip üzerinde `contains` araması). |
| `routes/companies.ts` | `GET /api/companies`, `GET /api/companies/:id` | Firma arama ve detay (ürünleriyle birlikte). |
| `routes/advisor.ts` | `POST /api/advisor/ask` | Anthropic Claude ile "AI Tekstil Danışmanı" sohbet uç noktası. `ANTHROPIC_API_KEY` yoksa 503 döner. |
| `routes/garmentAnalysis.ts` | `POST /api/garment-analysis/detect` | Fotoğraflardan (1-4 adet, base64) Claude ile kıyafet bileşeni tespiti (yaka, kol, fermuar vb.), JSON döner. |
| `routes/sampleRequests.ts` | `POST/GET /api/sample-requests`, `PATCH /api/sample-requests/:id/status` | Numune talebi oluşturma, listeleme (talep eden veya firma bazlı), durum güncelleme. Durum değiştiğinde WhatsApp şablon mesajı göndermeyi dener (best-effort, hata yutulur). |
| `routes/admin.ts` | `GET /api/admin/companies`, `PATCH /api/admin/companies/:id/verification` | Basit admin paneli — `isAdmin` bayrağı olan kullanıcı firma doğrulama durumunu değiştirebiliyor. Yetki kontrolü **query/body'de gönderilen `adminUserId`'nin DB'de isAdmin=true olup olmadığına bakarak** yapılıyor (token/oturum değil). |
| `routes/whatsappWebhook.ts` | `GET/POST /api/whatsapp/webhook` | Meta WhatsApp Cloud API webhook doğrulaması + gelen mesajları loglama (henüz platform içi mesajlaşmaya bağlanmamış). |
| `whatsapp.ts` | — | WhatsApp Business Cloud API entegrasyonu (serbest metin + şablon mesaj gönderimi). `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` tanımlı değilse sessizce loglayıp geçiyor. |
| `validation.ts` | — | Tüm `zod` şemaları (register, ürün oluşturma/güncelleme). |
| `db.ts` | — | Tek satır: paylaşılan `PrismaClient` instance'ı. |

### 2.3 `package.json` — Kullanılan Kütüphaneler

```
express, cors, dotenv, zod          → API iskeleti ve doğrulama
@prisma/client + prisma             → ORM / veritabanı erişimi
@anthropic-ai/sdk                   → Claude entegrasyonu (danışman + görsel analiz)
tsx, typescript                     → geliştirme/derleme
```

**Auth kütüphanesi yok** (jsonwebtoken, passport, bcrypt vb. hiçbiri yok — şifre veya token tabanlı oturum yönetimi uygulanmamış, yalnızca telefon numarası eşleşmesi var).
**Ödeme kütüphanesi yok** (stripe, iyzico, paytr vb. hiçbiri yok — platformda ödeme akışı henüz kodlanmamış).
**WhatsApp entegrasyonu** doğrudan `fetch` ile Meta Graph API'sine yapılıyor, ayrı bir SDK kullanılmamış.

### 2.4 Veritabanı Özeti (senin sorduğun soru)

> Kendi Postgres'i mi, Supabase mi, başka bir şey mi?

**Cevap: Hiçbiri.** Basit bir **SQLite dosyası** (Prisma üzerinden). Bu, geliştirme/MVP aşaması için tipik bir seçim ama production'da eşzamanlı yazma, ölçeklenme ve barındırma (dosya sistemi kalıcılığı) açısından sınırlamalar getirir. Postgres'e (kendi sunucunuz veya Supabase) geçiş istenirse `schema.prisma`'daki `provider` değiştirilip migration'lar yeniden oluşturulmalı.

---

## 3. Mobile (`mobile/`)

### 3.1 Ekranlar (`src/screens/`) — 20 ekran

**Onboarding / Kayıt akışı (6 adım):**
1. `RoleSelectionScreen` — Hesap türü seçimi (konfeksiyon / üretici / bireysel), "zaten hesabım var" linki
2. `PositionScreen` — Pozisyon seçimi
3. `PersonalInfoScreen` — Ad, soyad, telefon
4. `CompanyInfoScreen` — Firma adı, vergi no (sadece bireysel değilse)
5. `PhoneVerificationScreen` — SMS doğrulama **(gerçek SMS gönderimi yok — herhangi bir 6 haneli kod kabul ediliyor, ekranda bu açıkça yazıyor)**
6. `CompanyCodeScreen` — Mevcut firmaya katılma kodu (opsiyonel) veya yeni firma kaydı

**Giriş:** `LoginScreen` — telefon numarasıyla giriş (şifre yok)

**Ürün / Firma:**
- `ProductListScreen` — Ana ekran, ürün + firma arama, backend'e ulaşılamazsa mock veriye düşüyor (bilinçli fallback, ekranda "örnek veriler gösteriliyor" uyarısı var)
- `CompanyProfileScreen` — Firma profili, ürün listesi, doğrulama rozeti
- `AddProductScreen` — Ürün ekleme/düzenleme/silme, fotoğraf seçip sıkıştırma

**AI özellikleri:**
- `AdvisorScreen` — Claude ile tekstil danışmanlığı sohbeti
- `GarmentVisualCostScreen` — Fotoğraftan bileşen tespiti + manuel miktar/fiyat girişiyle maliyet tablosu

**Hesap araçları (6 adet, hepsi deterministik formül — tahmin üretmiyor):**
- `CalculatorsListScreen` (liste), `FabricCostCalculator`, `GarmentCostCalculator`, `YarnCountCalculator`, `YarnUsageCalculator`, `FabricWeightCalculator`, `ProductionCalculator`
- Girilen değerler `AsyncStorage` ile cihazda kalıcı tutuluyor (`usePersistedFields` hook'u)

**Numune talepleri:**
- `SampleRequestFormScreen` — Talep oluşturma
- `MySampleRequestsScreen` — Kendi taleplerim
- `IncomingSampleRequestsScreen` — Firmaya gelen talepler, durum ilerletme

**Admin:**
- `AdminScreen` — Sadece `isAdmin` kullanıcılar görebiliyor, firma doğrulama durumu değiştirme

### 3.2 Navigasyon

`@react-navigation/native` + `native-stack` ile tek bir `RootNavigator` (Stack Navigator), tüm ekranlar tek stack'te. Giriş noktası oturuma göre belirleniyor: `SessionContext`'te kullanıcı varsa `ProductList`, yoksa `RoleSelection`. Oturum `AsyncStorage`'da saklanıyor (basit — token değil, doğrudan `User` objesi).

İki React Context var:
- `SessionContext` — giriş yapmış kullanıcı, `AsyncStorage`'dan geri yükleme
- `RegistrationContext` — kayıt akışı boyunca adım adım toplanan form verisi (draft)

### 3.3 `package.json` — Expo SDK ve Ana Kütüphaneler

**Expo SDK: 57** (`expo: ~57.0.20`)
**React: 19.2.3**, **React Native: 0.86.3** (Expo 57 ile uyumlu güncel sürümler)

Ana kütüphaneler:
```
@react-navigation/native, @react-navigation/native-stack   → navigasyon
@react-native-async-storage/async-storage                  → cihaz içi kalıcı depolama
expo-image-picker, expo-image-manipulator                  → fotoğraf seçme/sıkıştırma
react-native-safe-area-context, react-native-screens        → RN native altyapı
react-native-web                                            → web desteği (expo start --web)
```

Backend, auth veya ödeme ile ilgili herhangi bir mobil kütüphane (Supabase client, Firebase, Stripe SDK vb.) **yok** — tüm veri erişimi `src/api/client.ts` üzerinden düz `fetch` ile backend'e gidiyor.

### 3.4 `mobile/CLAUDE.md` ve `mobile/AGENTS.md` — Özet

- **`CLAUDE.md`** tek satırdan oluşuyor: `@AGENTS.md` — yani içerik yok, sadece AGENTS.md dosyasına yönlendirme (Claude Code'un otomatik olarak o dosyayı okumasını sağlayan bir "include" kısayolu).
- **`AGENTS.md`** de çok kısa, iki satır: *"Expo HAS CHANGED — Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code."* Yani tek amacı, bu projede kod yazacak bir AI asistanına (veya geliştiriciye) "Expo 57 yeni ve API'leri değişmiş olabilir, kod yazmadan önce güncel dokümantasyona bak" uyarısını vermek. Projeye özgü mimari kural, kodlama standardı vb. içermiyor.

---

## 4. Git Geçmişi — Son 15 Commit

Depoda toplam **5 commit** var (15'ten az — hepsi burada listeleniyor), hepsi **2026-09-08** tarihinde, yaklaşık 4 saatlik tek bir çalışma oturumunda:

| Commit | Saat | Açıklama |
|---|---|---|
| `511a9cb` | 14:14 | **Initial commit:** Avedon MVP — kayıt akışı, backend API, AI danışman, hesap araçları |
| `9f7d227` | 17:11 | Ürün fotoğrafı ekleme ve listelerde görsel gösterimi ekle |
| `9e7e546` | 17:25 | Ürün fotoğrafı kaydetme hatasını düzelt: gönderim öncesi sıkıştırma ve istek zaman aşımı |
| `915a249` | 17:43 | Ürün düzenleme/silme ekle, virgüllü sayı girişi hatasını düzelt |
| `0b4e985` | 18:12 | Hesap araçlarında girilen değerleri cihazda kalıcı hale getir |

**Yorum:** Bu bir "MVP'yi tek seferde kur, sonra küçük düzeltmelerle cilala" deseni — ilk commit zaten oldukça kapsamlı (tüm backend + tüm mobile ekranları içeriyor), sonraki 4 commit fotoğraf özelliği ve küçük UX iyileştirmeleri ekliyor. Depo çok yeni; henüz uzun bir geliştirme geçmişi yok.

---

## 5. Kod Çalışır Durumda mı? Yarım Kalmış Yerler

### Genel değerlendirme: **Kod tabanı sürpriz derecede tam ve tutarlı bir MVP.** Yarım kalmış ekran, boş bileşen veya çağrılmayan fonksiyon rastlamadım — her ekran gerçek bir backend endpoint'ine bağlı ve state yönetimi (loading/error/empty) her yerde işlenmiş.

Ancak **çalıştırmak için** aşağıdakiler gerekli, henüz hiçbiri yapılmamış:

1. **Bağımlılıklar kurulu değil** — ne `backend/node_modules` ne `mobile/node_modules` var. İlk çalıştırmadan önce her iki klasörde de `npm install` gerekiyor.
2. **Backend `.env` dosyası yok** — `DATABASE_URL`, `ANTHROPIC_API_KEY`, (opsiyonel) `WHATSAPP_*` değişkenleri hiç tanımlanmamış. `.env` `.gitignore`'da olduğu için depoya hiç eklenmemiş, elle oluşturulması gerekiyor.
3. **Veritabanı dosyası yok** (`backend/prisma/dev.db` gitignore'da) — `npx prisma migrate dev` ile şema kurulup `npm run seed` ile örnek veri (3 firma, 4 ürün, 1 admin kullanıcı — telefon `05000000000`) yüklenmeli.
4. **Mobile `.env` de EXPO_PUBLIC_API_URL boş** — geliştirmede otomatik localhost kullanıyor (Android emülatöründe `10.0.2.2`), production için gerçek backend adresi girilmesi gerekecek.

### Bilinçli olarak eksik bırakılmış / MVP kısayolları (kod hatası değil, tasarım kararı):

- **Gerçek kimlik doğrulama yok.** Şifre yok, JWT/token yok, oturum tamamen telefon numarası eşleşmesine dayanıyor. Herkes başka birinin telefon numarasını bilirse o kullanıcı olarak "giriş" yapabilir. Admin yetkisi kontrolü de aynı şekilde — istemci `adminUserId`'yi kendisi gönderiyor, sunucu tarafında imzalı bir oturum jetonu doğrulaması yok. **Production'a çıkmadan önce en kritik güvenlik açığı bu.**
- **SMS doğrulama simüle ediliyor** — ekranda açıkça belirtilmiş, herhangi bir 6 haneli kod kabul ediliyor.
- **Ödeme akışı hiç yok** — ne backend'de ne mobile'da ödeme/fatura ile ilgili kod yok.
- **WhatsApp webhook'u gelen mesajları sadece logluyor**, platform içi mesajlaşmaya henüz bağlanmamış (kod içindeki yorum bunu açıkça belirtiyor).
- **`mobile/src/types/index.ts` ile `backend/prisma/schema.prisma` arasında küçük bir tutarsızlık var:** Mobile taraftaki `Company` tipi `productCategories: string[]` ve `employeeIds: string[]` alanlarını bekliyor, ama Prisma şemasında `productCategories` düz bir `String` (dizi değil) ve `employeeIds` diye bir alan hiç yok (çalışanlar `users` ters ilişkisiyle tutuluyor). Bu iki taraf henüz birbirine tam senkron değil — muhtemelen ileride firma profili detaylandırılınca fark edilecek.
- **`avedon-mvp-spec.md`** adlı bir spesifikasyon dosyasına kodda atıf var ama depoda yok — muhtemelen geliştiricinin yerel makinesinde kalmış ya da hiç eklenmemiş.

### Özetle çalıştırılabilirlik

Kod mantık olarak tamamlanmış görünüyor; "çalışmıyor" değil, "henüz hiç çalıştırılmaya hazırlanmamış" durumda. Sırasıyla: (1) `npm install` her iki klasörde, (2) backend `.env` oluştur, (3) `prisma migrate dev` + `seed`, (4) `npm run dev` (backend) ve `npm start` (mobile) — bu adımlar tamamlanırsa uygulamanın uçtan uca çalışması beklenir. AI danışman ve görsel maliyet analizi özellikleri ek olarak geçerli bir `ANTHROPIC_API_KEY` gerektiriyor; anahtar yoksa bu iki özellik zarifçe devre dışı kalıyor (503 hatası, ekranda "henüz etkinleştirilmedi" mesajı) — geri kalan uygulama etkilenmiyor.

---

## 6. Hızlı Referans — Dosya Sayıları

- Backend `src/`: 13 dosya (9 route + index + db + validation + whatsapp)
- Mobile `src/`: 41 dosya (20 ekran, 5 bileşen, 2 context, navigasyon, api client, tema, tipler, hesap araçları formülleri)
- Prisma migration: 2 (init + admin flag eklendi)
- Toplam commit: 5
