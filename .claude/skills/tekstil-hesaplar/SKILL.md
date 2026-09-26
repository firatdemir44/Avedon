---
name: tekstil-hesaplar
description: Takyon Ai hesaplama modülleri — kumaş maliyeti, konfeksiyon maliyeti, iplik numarası dönüşümü (Ne/Nm/tex/denier), iplik kullanım oranı, kumaş gramajı, üretim hesabı. Kullanıcı "hesapla", "maliyet", "gramaj", "iplik numarası", "fire", "üretim hesabı", "Ne", "Nm", "tex", "denye" dediğinde veya bir hesaplayıcı ekranı yazılırken/değiştirilirken mutlaka kullan. Yapay zekâ hiçbir fiyat, fire veya tahmini değer üretmez; bunlar her zaman kullanıcı girdisidir.
---

# Tekstil Hesaplayıcıları

Uygulamanın ticari omurgası bu modüllerdir; rakip (Örme Parkuru) yılda 2.500 TL/kişiye
sadece bunları satıyor. Ürün kuralı kesindir: **uygulama fiyat, fire oranı veya
verim tahmin etmez.** Kullanıcı girer, uygulama hesaplar, formülü gösterir.

## Kaynak ayrımı

- `references/standart-donusumler.md`: uluslararası standart formüller (iplik numarası
  dönüşümleri, birim çevirileri). Değişmez, doğrudan kullanılır.
- `references/melide-formuller.md`: Fırat'ın sağladığı işletme formülleri ve varsayılan
  fire aralıkları. **Boş alanlar Fırat doldurmadan hesaplayıcı yayına alınmaz.**
  Boş alan görürsen tahmin etme; Fırat'a hangi alanın eksik olduğunu tek cümleyle sor.

## Her hesaplayıcı ekranı için kurallar

1. Girdi alanları büyük, birimi yanında yazılı (kg, m, TL, %). Klavye sayısal.
2. Sonuç anında güncellenir, "Hesapla" düğmesine gerek yok.
3. Formül sonuç altında açık yazılır ("Kumaş maliyeti = iplik + örme + boya + fire").
4. Son 10 hesaplama cihazda saklanır, isim verilebilir ("Müşteri X süprem 180 g").
5. Sonuç WhatsApp'a paylaşılabilir (metin olarak, PDF değil).
6. Para birimi ve birimler `takyon-global` kurallarına uyar; TL varsayılan.

## Modüller ve girdi/çıktı

| Modül | Girdi (kullanıcıdan) | Çıktı |
|---|---|---|
| Kumaş maliyeti | iplik fiyatı, iplik oranı, örme/dokuma fason, boya-apre fason, fire % | kg ve m başına maliyet |
| Konfeksiyon maliyeti | kumaş m/adet, kumaş fiyatı, kesim/dikiş fason, aksesuar, ütü-paket, fire % | adet maliyeti, tablo |
| İplik numarası dönüşümü | değer + sistem | Ne, Nm, tex, denier |
| İplik kullanım oranı | karışım yüzdeleri, gramaj, en | her ipliğin kg/m ve % payı |
| Kumaş gramajı | ağırlık, en, uzunluk (veya numune ağırlığı + alan) | g/m² ve g/m |
| Üretim hesabı | makine sayısı, devir, verim %, saat | günlük kg/m üretim |

Konfeksiyon maliyeti için görselden tablo üretme özelliği: görsel yalnızca parça
listesini çıkarmak için kullanılır; fiyat ve miktar alanları boş gelir, kullanıcı doldurur.

## Test

Her modül için `references/melide-formuller.md` içindeki örnek hesabı birim testi
olarak yaz. Fırat'ın verdiği örnekle sonuç tutmuyorsa formül yanlıştır, örnek değil.
