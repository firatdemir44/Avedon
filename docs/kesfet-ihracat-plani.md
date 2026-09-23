# Keşfet: Yapay zekâlı ihracat alıcı eşleştirme — araştırma ve plan

Fırat'ın vizyonu (2026-09-23): Platinum üyelerin ürettiği kumaş/iplik/konfeksiyon ürünleri için, GTİP kodu üzerinden dünya pazarlarında (firmanın seçtiği bölgelerde) gerçek ithalatçıları bulan ve firmaya "hazır ihracat müşterisi" listesi sunan yapay zekâ sistemi. Ticaret Bakanlığı ve derneklerin desteğini almak, ücretli pakete dönüştürmek.

Araştırma iki alt görevle yapıldı (rakipler/veri, devlet/pazar); kaynaklar sonda.

## 1. Temel gerçekler (plan bunlara göre kurulur)

1. **AB'de (Almanya dahil) firma adıyla "kim ne ithal etti" verisi yasal olarak yok.** Gümrük verisi gizli (Birlik Gümrük Kodu md. 12), Eurostat yalnızca toplam veri yayımlar. TradeAtlas, Volza gibi sağlayıcıların AB için gösterdiği "alıcı" bilgisi, karşı ülkelerin (Hindistan, Pakistan, Bangladeş, Vietnam…) ihracat kayıtlarından ya da dizinlerden gelir. **Bu yüzden AB'de "alım geçmişi" vaat edilmez; "alım olasılığı + kanıt" sunulur.**
2. **Firma adıyla veri açık olan ülkeler:** ABD (deniz konşimentoları), Latin Amerika (Meksika, Kolombiya, Peru, Şili…), Hindistan, Pakistan, Bangladeş, Vietnam, Endonezya, Kazakistan, Özbekistan vb.
3. **Ücretsiz ve güçlü toplam veri var:** UN Comtrade (dünya, ülke×HS6), Eurostat Comext (AB, ülke×KN8, Türkiye payı), TÜİK (Türkiye ihracatı ülke×GTİP), WITS. Pazar büyüklüğü, büyüme, Türkiye payı ve rakip ülke birim fiyatı bunlardan çıkar.
4. **Marka–tedarikçi ilişkisi için ücretsiz API:** Open Supply Hub (Adidas, Zalando, ALDI gibi 1000+ katkıcının açıkladığı tedarikçi fabrikaları).
5. **Rakip boşluğu:** Alibaba, TurkishExporter, EC21 pasif ilan siteleri; Foursource (Berlin) güçlü ama gümrük verisiyle doğrulamıyor; Volza/Tendata ham veri aracı, KOBİ için karmaşık ve Türkçe değil. **Kumaş kalitesinden → HS koduna → pazar puanına → kanıtlı aday alıcıya giden, Türkçe ve tekstile özel bir akış bulunamadı.**
6. **Hukuk:** Almanya UWG §7 B2B'de bile izinsiz reklam e-postasını yasaklıyor; GDPR kişisel e-postayı kişisel veri sayıyor. **Platform toplu e-posta atmaz; yalnızca firma düzeyi bilgi (web, genel e-posta, telefon) gösterir; temas firmanın kendisinden, kişiye özel ve tek tek yapılır.** Satın alınan verinin platformda gösterilmesi ayrı "yeniden dağıtım" lisansı ister.
7. **Devlet desteği kapısı:** En kolay yol, platinum paketin **"ihracat pazar araştırması / alıcı veritabanı üyeliği"** olarak tanımlanması (pazara giriş desteklerinde firma başına 20 veritabanı üyeliği; hedef ülkelerde oran +20 puan). İkinci yol: e-ihracat "onaylı site" listesine başvuru (İhracat Genel Müdürlüğü). Üçüncü yol: İTHİB/İHKİB **URGE** projelerinde "yapay zekâ ile hedef pazar ve alıcı analizi" hizmet sağlayıcısı olmak (%75 destek).
8. **AB düzenlemeleri bizim lehimize:** ESPR/Dijital Ürün Pasaportu (tekstilde 2028-29), Almanya LkSG, CSRD. AB alıcıları tedarikçiden izlenebilirlik verisi istiyor; **kumaş pasaportu dolu firma eşleştirmede öne çıkar** — rakiplerin hiçbirinde yok.

## 2. Ürün tasarımı: Keşfet → "İhracat Radarı"

Firma için akış (platinum):

1. **Ürün → HS kodu (otomatik):** Kumaş pasaportundan (lif oranı, örme/dokuma, elastan, gramaj, boyalı/baskılı) kural tabanlı karar ağacıyla 6'lı HS ve AB 8'li KN kodu önerilir. Örnek: Melide'nin %82 poliamid %18 elastan örme kumaşı → **6004.10** (elastan ≥ %5); %100 polyester boyalı örme → **6006.32**. Konfeksiyon: tişört örme pamuk → 6109.10, mont → 6201/6202. Kod "tahmini" etiketiyle gösterilir; firma onaylar. (Yapay zekâ yalnızca serbest metni ayrıştırır; kodu kurallar belirler.)
2. **Pazar puanı (hedef ülke seçimi):** Her HS kodu için ülkeler şu formülle sıralanır: ithalat hacmi × büyüme × (1 − Türkiye payı) × fiyat uygunluğu (Türkiye birim fiyatı / rakip ülke birim fiyatı) × yakınlık (lojistik, gümrük birliği/STA). Kaynak: Comtrade + Comext + TÜİK. Firma "Almanya, İtalya, Mısır" gibi bölge seçer ya da sistem önerir. Kartta: "Almanya 6004.10 ithalatı 412 M€, Türkiye payı %9, Çin'in birim fiyatı sizinkinden %18 düşük, İtalya'nınki %22 yüksek" gibi somut bilgi.
3. **Aday alıcı listesi (kanıtlı):** Her ülke için aday firmalar, her birinin yanında **"neden önerildi"** sinyalleri:
   - Gümrük kaydı (veri açık ülkelerde veya karşı ülke kaydında): "2025'te Pakistan'dan 6004.10 kodlu 38 sevkiyat aldı."
   - Open Supply Hub: "Tedarikçi listesinde Türkiye'den 4 örme fabrikası var."
   - Dizin/sicil: sektör kodu (NACE 46.41, 14.x), büyüklük, web sitesi.
   - Fuar katılımı: "Munich Fabric Start 2026 katılımcısı."
   - Platform içi: "Takyon'da açık talep yayınladı" (en güçlü sinyal).
   Puan: sinyallerin ağırlıklı toplamı; kaynak ve tarih her zaman görünür.
4. **Temas asistanı:** Seçilen alıcıya firmanın kendi e-postasından/LinkedIn'inden gönderilecek, alıcının dilinde (Almanca, İtalyanca, Arapça…) ve ürüne özel ilk mesaj taslağı; ekinde otomatik **İngilizce/Almanca kumaş pasaportu PDF'i ve QR**. Toplu gönderim yok (UWG/GDPR).
5. **Takip ve öğrenme:** Firma "görüşüldü / numune gönderildi / sipariş" diye işaretler; bu geri bildirim puanlamayı iyileştirir ve Bakanlığa/derneklere "platform üzerinden X ülkeye Y numune" raporu üretir.
6. **Karşı yön (kapalı döngü):** Yabancı alıcılar için İngilizce "Türk tedarikçi bul" sayfası (takyon.ai/en): alıcı açık talep yayınlar → Türk üreticiler teklif verir. Zamanla en değerli veri kendi platform verimiz olur.

## 3. Veri yığını ve maliyet

| Aşama | Kaynak | Aylık maliyet (tahmin) |
| --- | --- | --- |
| MVP | UN Comtrade API, Eurostat Comext API, TÜİK, WITS, Open Supply Hub API, OpenCorporates (sınırlı), fuar katılımcı sayfaları | 0–100 $ |
| + ABD alıcıları | ImportYeti API | ~50 $ |
| Büyüme | ImportGenius / Panjiva (ABD + Latin Amerika) | 250–500 $ |
| Ölçek | Volza veya Tendata **yeniden dağıtım lisansı**, yalnızca seçili HS (50-63) ve ülkeler | 1.000–5.000 $ (pazarlıkla) |

Maliyet tahminleri kısmen teklif gerektirir; lisans görüşmesi büyüme aşamasında yapılır.

## 4. Gelir modeli

- **Platinum "İhracat Radarı":** 60.000–90.000 TL/yıl + KDV (başlangıç önerisi 72.000 TL). Kapsam: 3 HS kodu × 5 ülke, aylık yenilenen aday listesi, temas asistanı, pasaport PDF'i, rapor.
- **Birlik/dernek üyesi:** ~%25 indirim (~54.000 TL).
- **Kurumsal:** Sınırsız kod/ülke, özel araştırma — 150.000 TL+.
- Referans: Alibaba Gold ~2.300 $/yıl, Verified ~9.300 $/yıl. Devlet geri ödemesi onaylanırsa firmanın net maliyeti %40-60 düşer — satışta en güçlü argüman.

## 5. Devlet ve dernek yol haritası

1. **Ticaret Bakanlığı İhracat Genel Müdürlüğü (e-ihracat birimi)** ile yazılı ön görüşme: "B2B platform / veritabanı üyeliği olarak onay şartları nelerdir?" Karar maddesi ve ek listeyi yazılı iste. (Kararların numarası ve güncel oranları değişken; mutlaka Bakanlıktan teyit.)
2. Başvuru dosyası: şirket belgeleri, platformun İngilizce sürümü, veri kaynakları ve büyüklüğü, fiyat listesi, örnek fatura (ülke ve GTİP bazlı "pazar araştırması raporu / veritabanı üyeliği" olarak), KVKK/GDPR uyum metni.
3. **İTHİB (örme kumaş) ve İHKİB (konfeksiyon):** 20 firmalık ücretsiz pilot + ortak sonuç raporu; ardından URGE ihalelerine "yapay zekâ destekli hedef pazar ve alıcı analizi" teklifi; ticaret heyetleri öncesi eşleştirme listesi (birlik logosuyla).
4. ÖRSAD, İTO ve diğer derneklerle üye indirimi anlaşması; firma rehberi (sahipsiz firma listesi) bu kanalla doldurulur.

## 6. Öncelikli hedef ülkeler (örme kumaş)

Mısır (en hızlı büyüyen; Türk konfeksiyoncular orada) · Fas · İtalya (tekstilde 1. pazar) · Almanya (pasaport talebi yüksek) · İngiltere · Hollanda · İspanya · Portekiz/Tunus · Pakistan/Bangladeş (elastanlı sentetik talebi). Mısır, Fas ve Tunus'taki konfeksiyoncular AB'ye ürettiği için pasaport orada da değer taşır.

## 7. Aşamalı teknik plan

| Aşama | İçerik | Süre (tahmin) |
| --- | --- | --- |
| **A. Temel** | Kumaş pasaportundan HS/KN önerisi (kural motoru + testler); Comtrade/Comext/TÜİK verisini periyodik çekip saklama; pazar puanı; Keşfet'te "İhracat Radarı" ekranı (ülke kartları) | 1,5–2 hafta |
| **B. Aday alıcı** | Open Supply Hub + dizin/fuar verisi + ImportYeti; firma kayıtları, sinyal ve puan; "neden önerildi" kartları; platinum kısıtı | 2–3 hafta |
| **C. Temas ve takip** | Çok dilli mesaj taslağı (asistan becerisi), İngilizce/Almanca pasaport PDF'i, huni takibi, aylık rapor | 1–1,5 hafta |
| **D. Kapalı döngü** | İngilizce yabancı alıcı sayfası ve talep akışı; ücretli veri lisansı entegrasyonu | 2+ hafta |
| **E. Ödeme** | Platinum abonelik, fatura (GTİP/ülke bazlı rapor tanımıyla) | ödeme altyapısı seçimine bağlı |

## 8. Doğrulanması gerekenler (uygulamadan önce)

- Bakanlığın güncel karar maddeleri, oranlar ve "onaylı site/veritabanı" şartları (yazılı).
- 2024-2025 GTİP 6004/6006 ülke kırılımı (TÜİK/Trade Map sorgusu — A aşamasında otomatik çekilecek).
- Veri sağlayıcılarla yeniden dağıtım lisansı fiyatı.
- Türkiye'de tekstile özel yapay zekâlı eşleştirici olmadığı iddiası (ek tarama).
- HS eşikleri (XI. bölüm notları) kural motoru yazılırken resmi tarife metninden doğrulanacak.

## Kaynaklar

Rakipler ve veri: dupple.com/reviews/volza · volza.com/global-trade-data/country-list · tendata.com/blogs/provider/6792.html · softwareadvice.com/bi/importyeti-profile · suppliers.ai/blog/importgenius-vs-panjiva · uncomtrade.org/docs/un-comtrade-api · ec.europa.eu/eurostat (API) · info.opensupplyhub.org/api · foursource.com/for-buyers · ihk.de/stuttgart (UWG) · uwg-onlinekommentar.de/kommentierung-7-uwg

Devlet ve pazar: ticaret.gov.tr/destekler/ihracat-destekleri/pazara-giriste-dijital-faaliyetlerin-desteklenmesi · ticaret.gov.tr/destekler/e-ihracat-destekleri/genelge-ekleri · itkib.org.tr (e-ihracat destekleri, URGE ihaleleri) · yatirimadestek.gov.tr (URGE özeti) · matriksdata.com (2025 tekstil ihracatı) · textilegence.com (Mısır 2025) · knittingindustry.com · seller.alibaba.com/pages/price.html · gso.org.tr (TradeAtlas kampanyası) · passportcraft.com (ESPR takvimi) · carbonfact.com (AB düzenlemeleri)
