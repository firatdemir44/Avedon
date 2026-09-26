# Takyon Ai — Yerelden globale yol haritası (Ekim 2026 → 2028)

> Tek yetkili plan. `docs/yol-haritasi.md` ürün vizyonunu, bu dosya zaman ve sıra planını tutar. Aşama ölçütleri sayıdır; ölçüt tutmadan sonraki aşamaya geçilmez. Her cuma rapor, her ay sonu ölçüt kontrolü. Yeni fikir reddedilmez, aşamasına yerleştirilir (`.claude/skills/takyon-yol-haritasi/references/fikir-havuzu.md`).

## 0. Bugün (26 Eylül 2026)

- Ürün canlı (web, telefona eklenen uygulama): kumaş pasaportu ve katalog, firma asistanı (uygulama + WhatsApp test numarası + doğal ses), numune/teklif/açık talep, makine parkı, konfeksiyon üretim profili ve araması, doğrulanmış iş birliği, Dünyayı Keşfet (pazar puanı, aday alıcı, numune seti), fotoğrafla kumaş bulma, TR + EN.
- Geliştirmede: Texart (kumaş fotoğrafı düzeltme; örnek onayı aşamasında).
- Pilot: yalnızca Melide. Bekleyen: marka başvurusu, WhatsApp gerçek numarası (SIM kargoda), takyon.ai (Cloudflare devri), logo, mağaza hesapları.
- Ölçüm için henüz **yedekleme provası, hata takibi ve kullanım panosu yok** — kısa vadenin ilk işleri.

**Kuzey yıldızı ölçütü:** haftalık aktif firma (o hafta arama, numune, teklif ya da asistan kullanan). İkincil: numune → sipariş dönüşümü, ödeyen firma sayısı, dış pazarda aktif alıcı.

**Değişmez kurallar:** (1) Önce Türkiye; ödeyen 30–50 firma olmadan dışarı çıkılmaz. (2) Gelir 3. ayın sonunda açılır. (3) Tek marka: Takyon Ai. (4) Hesabı kod yapar, yapay zekâ fiyat/fire tahmin etmez. (5) Özellik değil kanıt: her aşama sayıyla kapanır.

---

## 1. KISA VADE — 0–3 ay (Ekim–Aralık 2026): "Kanıt"

### Hafta 0 — Hazırlık (29 Eylül – 5 Ekim)
Fırat: TÜRKPATENT başvurusu (9/35/42) · SIM gelince WhatsApp gerçek numara + Meta işletme doğrulaması · Cloudflare devri → takyon.ai (app./api.) · net logo dosyası · Melide ürünlerine stok · Fatih çift kaydı birleştirme · pilot firma listesi (her alt sektörden 1: iplik, örme, dokuma, boya-apre, konfeksiyon, fason atölye, alıcı/marka, aksesuar) · 60 sn tanıtım videosu (senaryo hazır).
Claude: Texart Adım 4–6 (sadakat kapısı, uygulama içi önce/sonra onay ekranı, ürün sayfasında orijinal bağlantısı) · **günlük veritabanı yedeği + geri yükleme provası** · hata/çökme takibi ve çalışırlık izleme · "Bir sorun mu var?" düğmesi (uygulama içi tek dokunuş, sesli mesaj kabul) · Yönetim'de haftalık kullanım panosu (aktif firma, numune, teklif, hata) · ilk giriş akışı 3 dk ölçümü · KVKK aydınlatma metni ve "Hesabımı sil".

### Aşama 1 — Kapalı pilot (6 Ekim – 2 Kasım, uzatılmaz)
- Hafta 1–2: 10–15 firma WhatsApp'la davet (3 cümle, tek bağlantı). Her firma: kayıt, 1 ürün, 1 arama, 1 numune isteği. Geri bildirim `pilot/geri-bildirim.md` (HATA-KRİTİK / HATA / ANLAŞILMADI / İSTEK / ÖVGÜ).
- Hafta 3: düzeltme haftası (önce ANLAŞILMADI biriken ekranlar). Hafta 4: ikinci tur.
- Her cuma pilot raporu (şablon `takyon-pilot`).
- **Çıkış:** haftada ≥3 aktif firma (2 hafta üst üste) · ≥20 sınıflandırılmış geri bildirim · kritik hata 0 · ilk giriş ort. <3 dk · her pilot firmasından 3 referans ismi alınmış.

### Aşama 2 — Türkiye açık yayın, web (Kasım–Aralık 2026)
- Güvenlik kapısı raporu PASS (kimlik, firma verisi izolasyonu, yükleme, yapay zekâ, bağımlılıklar, kötüye kullanım/hız sınırı, KVKK) — `takyon-guvenlik-kapisi`.
- Fiyat kararı: pilot firmalarına anket; ücretsiz katman (firma bulma, temel arama, sınırlı hesaplayıcı, günlük limitli asistan) / ücretli katman (sınırsız numune, makine parkı görünürlüğü, iş birliği, firma asistanı, sınırsız hesaplama; hipotez 5.000–7.500 ₺/firma/yıl). Aralık'ta ücretsiz deneme, Ocak'ta ödeme.
- Büyüme kanalı: referans zinciri + dernekler (UTİB 2.301 firma rehberde; İTHİB/İHKİB/EİB listeleri Fırat'tan) + sahipsiz firma sayfalarını "sahiplen" akışı. Reklam bütçesi sıfır.
- Altyapı: Vercel Pro (ticari kullanım), Render bellek yükseltme (Texart), günlük yedek, izleme; Ticaret Bakanlığı görüşmesi (sunum hazır) ve URGE/dernek pilotu teklifi.
- **Çıkış (31 Aralık):** 100 kayıtlı firma · 30 haftalık aktif firma · güvenlik raporu PASS · fiyat listesi yayında · WhatsApp gerçek numara canlı.

---

## 2. ORTA VADE — 3–9 ay (Ocak–Haziran 2027): "Gelir ve dayanıklılık"

### Ocak–Şubat: Gelir
- Ödeme altyapısı: Türk sağlayıcı (iyzico/PayTR) ile firma başı yıllık abonelik, e-fatura; ödeme sayfası, deneme süresi bitiş akışı, hatırlatmalar.
- İlk 10 ödeyen firma (Şubat sonu). Ödemeyen firmalar ücretsiz katmanda kalır, silinmez.
- Texart ürün akışında tam entegre: ürün ekle → düzeltilmiş görsel + orijinal; katalog standardı tek bakışta.

### Mart–Nisan: Alıcı tarafı ve derinlik
- Alıcı paketi (6. ay geliri): Dünyayı Keşfet + numune seti + alıcıya özel İngilizce pasaport sayfaları; ABD alıcı verisi (ImportYeti), AB sicilleri genişler.
- Asistan: firma hafızası derinleşir (fire oranları, fasoncu fiyatları, kalite geçmişi), haftalık rapor, sesli soru tam.
- Tekstil hesaplar: Fırat'ın formül dosyası (tipik fire aralıkları) dolar → varsayılan öneriler açılır.

### Nisan–Mayıs: Mağaza
- Apple Developer + Google Play (şirket adına, D-U-N-S), EAS derlemesi, web'e özel özelliklerin telefon karşılıkları (ses kaydı, rehber, bildirim), push yalnız 3 olay (numune geldi, mesaj geldi, iş birliği onayı), Apple/Google ile giriş.
- TestFlight/kapalı test 5 pilot firmayla; çökme <%1; mağaza metin ve görselleri Türkçe.
- Güvenlik kapısı mağaza sürümü için yeniden.

### Haziran: Dayanıklılık
- Operasyon: destek süreci (WhatsApp Business, hedef yanıt <2 saat iş günü), hazır cevaplar, self-servis yardım; ilk yarı zamanlı destek/satış kişisi **100 ödeyen firmadan sonra**.
- Teknik: Postgres'e geçiş kararı (500+ firma ya da 5 GB veri eşiği), yük testi, bütçe uyarıları (Anthropic/Google/Render).
- **Çıkış (30 Haziran):** 30–50 ödeyen firma · 300 kayıtlı · 100 haftalık aktif · App Store + Google Play'de yayında · aylık gelir sabit giderleri karşılıyor · global kapısı açık.

---

## 3. UZUN VADE — 9–24 ay (Temmuz 2027 → 2028): "Global"

### Dalga 1 — Mısır (Yaz–Sonbahar 2027)
- Giriş noktası mevcut iş ilişkisi (Egypt Cady). EN arayüz + USD/EGP fiyat gösterimi + kartla ödeme (Stripe) + yerel hukuk kontrol listesi (avukat).
- İlk 10 firma davet (pilot mantığı, EN şablon), WhatsApp Business o pazar için.
- **Çıkış:** 20 kayıtlı firma, 5 haftalık aktif, ilk dış pazar geliri.

### Dalga 2 — AB alıcıları (Sonbahar 2027 – Kış 2028)
- takyon.ai/en "Türk tedarikçi bul": alıcı açık talep yayınlar, Türk üreticiler teklif verir (kapalı döngü veri).
- GDPR: DPA şablonu, SCC, silme/taşınabilirlik, çerez rızası; UWG: toplu e-posta yok. AB Dijital Ürün Pasaportu (ESPR) formatına dışa aktarma.
- Hedef ülkeler: Almanya, İtalya, İngiltere, Hollanda, İspanya; Mısır/Fas/Tunus konfeksiyoncuları (AB'ye üretenler).
- Ticaret Bakanlığı: pazara giriş desteği (veritabanı üyeliği), e-ihracat onaylı platform, URGE hizmet sağlayıcılığı.
- **Çıkış:** 2 dış pazarda canlı, 50 yabancı aktif alıcı, dolar bazlı global paket geliri.

### Dalga 3 — Üretici ülkeler ve ölçek (2028)
- Pakistan / Bangladeş / Özbekistan üreticileri; Arapça (sağdan sola) ikinci dil dalgası; çok para birimi tam.
- Ticaret verisi lisansları (Volza/Tendata, yalnız HS 50–63) ölçekte; öne çıkan firma listesi; escrow/ödeme aracılığı ancak talep kanıtlanınca.
- Teknik: bölgesel altyapı (AB veri yerleşimi), CDN, 7/24 izleme, otomatik ölçekleme; ekip: 1 destek, 1 satış/pazar, gerekirse 1 geliştirici.
- **Çıkış (2028 sonu):** 1.500 kayıtlı firma, 500 haftalık aktif, 300 ödeyen, 3 dış pazar.

---

## 4. Sayılarla hedefler

| Ölçüt | Ara 2026 | Haz 2027 | Ara 2027 | 2028 sonu |
|---|---|---|---|---|
| Kayıtlı firma | 100 | 300 | 600 | 1.500 |
| Haftalık aktif firma | 30 | 100 | 200 | 500 |
| Ödeyen firma | 0 (deneme) | 30–50 | 120 | 300 |
| Dış pazar (canlı) | 0 | 0 | 2 | 3 |
| Numune → sipariş dönüşümü | ölçülüyor | %10 | %15 | %20 |

## 5. Çalışma ritmi
- **Pazartesi:** haftanın 3 işi (Claude hazırlar, Fırat onaylar). **Cuma:** rapor (aktif firma, numune, teklif, hata, "anlaşılmadı", övgü, sıradaki 3 düzeltme). **Ay sonu:** aşama ölçütleri; tutmadıysa aşama uzar, sonraki aşamaya girilmez.
- Her panel/hesap işi: önce doğrulanmış adımlar tek seferde, sonra kanıt.
- Toplu işlemlerde önce 1–2 örnek, onaydan sonra tamamı.

## 6. Riskler ve savunma
| Risk | Savunma |
|---|---|
| Tek kişilik operasyon (Fırat) | WhatsApp hazır cevaplar, asistanın kendi kendine çözdüğü sorular, 100 ödeyen firmada ilk destek kişisi |
| Veri kaybı | Günlük yedek + aylık geri yükleme provası (Hafta 0) |
| Hesap/alan adı sahipliği | Tüm hesaplar Takyon Ai A.Ş. adına, tek e-posta; Cloudflare devri |
| "Bedava araç" algısı | Gelir 3. ayın sonunda; ücretsiz katman sınırlı |
| Yapay zekâ/servis maliyeti | Kullanım kotaları, bütçe uyarıları, ücretsiz kotalar (ses, konuşma tanıma) |
| Hukuk (KVKK/GDPR/marka) | Marka başvurusu şimdi; KVKK açık yayından önce; GDPR Dalga 2'den önce avukatla |
| Veri sağlayıcı bağımlılığı | Önce ücretsiz resmî veri; lisans yalnız ölçekte ve yeniden dağıtım izniyle |
