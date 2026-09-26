# Konfeksiyon kabiliyeti ve doğrulanmış iş birliği — plan (onay bekliyor, 2026-09-26)

Kurallar: DESIGN.md'ye uyulur; yeni bileşen/rozet önce DESIGN.md'ye eklenir. Her bölümden sonra özet + Fırat onayı. A ve B Opus ile; C'nin veri modeli Fable 5.1 ile (limit açılınca). Test bilgisayardaki test veritabanında, canlı veriye dokunulmaz. Stoğu biten ürüne bağlı iş birliği için özel kural yapılmaz (Fırat 2026-09-26).

## Kararlar (Fırat 2026-09-26)
- Firma türü ikiye ayrılır: **Konfeksiyon (kendi koleksiyonu)** ve **Fason atölye**; ikisinde de Üretim sekmesi. İkisini de yapan: konfeksiyon + çalışma şekli "ikisi".
- İhtisas firma türüyle değil **ürün grubu** ile: genişletilmiş liste + firma 1-3 **ana uzmanlık** işaretler; arama ve kartta öne çıkar. Uzmanlığa özel makine alanları sonraya.
- Atölyeye özel: yaptığı işlemler (kesim, dikim, overlok/reçme, ütü-paket, kalite kontrol), iş şekli (sadece dikim / kumaş dahil tam paket), makine parkı Makineler sekmesinden.
- Aramada "Koleksiyon · Fason atölye · Hepsi" seçimi.

## Bölüm A — Üretim kabiliyeti (konfeksiyon firmaları)
1. Firma türü "Konfeksiyon" olan firmada ilk sekme **Üretim**; **Ürünler** yalnızca ürün eklenmişse görünür. Makineler, Hakkında, Kişiler, Belgeler aynen kalır.
2. Üretim sekmesi (firma sahibi düzenler, boş alan gizlenir): ürün grupları (çoklu + serbest metin), çalışma şekli (fason / kendi koleksiyonu / ikisi), aylık kapasite (istenirse ürün grubu bazında), minimum sipariş (model ve renk başına), termin (numune ve üretim günü), hizmetler, sertifikalar (kumaş pasaportundaki aynı liste; belge yüklenirse Belgeler'e bağlanır, rozet **BELGELİ**), ihracat pazarları (Dünyayı Keşfet ülke listesi), çalışan sayısı aralığı, referans işler galerisi (en çok 12 görsel; her görselde zorunlu "Bu görseli paylaşma iznim var"; müşteri adı isteğe bağlı, varsayılan gizli).
3. Tamamlanma çubuğu bu alanları da sayar.

## Bölüm B — Konfeksiyon araması
4. Aramaya "Konfeksiyon" kategorisi; süzgeç: ürün grubu, en az kapasite, en fazla MOQ, en fazla termin, sertifika, hizmet, il.
5. Serbest metinden süzgeç çıkarma: "tayt aylık 50 bin oeko-tex" → ürün grubu=tayt, kapasite≥50.000, sertifika=OEKO-TEX; çıkarılan süzgeçler çip olarak görünür, kullanıcı silebilir (makine aramasındaki çözümleyicinin yöntemiyle).
6. Sonuç kartı: firma + doğrulanmış rozeti, ürün grupları, mono-14 "Kapasite 50.000/ay · MOQ 500 · Termin 30 gün", sertifika rozetleri.
7. Konfeksiyona "Teklif iste" formu: ürün grubu, adet, hedef termin, kumaş (katalogdan seç / kumaşı ben sağlarım / firma önersin), teknik föy veya görsel, not. Yeni talep türü; mevcut açık talep yapısına yakın kurulur. Katalogdan kumaş seçilirse talep o kumaşa bağlanır.
8. Ek: asistana "konfeksiyon ara" becerisi.

## Bölüm C — Doğrulanmış iş birliği
9. Veri modeli: tedarikçi firma, konfeksiyon firması, ürün (boş olabilir), kaynak (numune | sipariş), kaynak kaydı, iki tarafın görünürlük seçimi, her onay ve geri alma zaman damgalı. Veritabanı değişikliği yalnız ekleme.
10. Tetikleyici: numune "Teslim edildi" **veya** sipariş "Teslim edildi" olduğunda iki firmaya sorulur: "Bu iş birliğini profilinizde gösterelim mi?" → Firma adıyla göster · Adsız göster · Gösterme (varsayılan: gösterme).
11. Her firma yalnızca **kendi adının** nasıl görüneceğini seçer; iki taraf da "Gösterme" dışında seçerse yayınlanır. Adsızda "Bir kumaş tedarikçisi" / "Bir konfeksiyon firması" yazar. Biri geri alırsa iki sayfadan da kalkar.
12. Etiketler: siparişten gelen **"Takyon üzerinden doğrulandı"**, numuneden gelen **"Numune çalışması"**.
13. Platform dışı iş birliği için yeni sistem **yok**: mevcut referans sistemi kullanılır.
14. Görünüm: kumaş ürün detayında "Bu kumaşla çalışan konfeksiyon firmaları"; Üretim sekmesinde "Çalıştığı kumaş tedarikçileri"; güven özetinde "Doğrulanmış iş birliği" sayısı; rozet **İŞ BİRLİĞİ** (brand-soft/brand, bağlantı ikonu), yeşil doğrulama rozetinden ayrı.
15. Gizlilik: miktar, fiyat, sipariş ayrıntısı ve gün ASLA gösterilmez; yalnızca firma (veya adsız ifade), ürün ve yıl.

## Test
16. Test veritabanında: kumaş firması + konfeksiyon firması → numune → teslim → iki taraf onayı → iki sayfada görünüm → bir tarafın geri alması → iki sayfadan kalkma. Aynısı siparişle.
