---
name: takyon-yol-haritasi
description: Takyon Ai projesinin yerelden globale yol haritası ve aşama yönetimi. Bu projede HER göreve başlarken önce bu skill'i kullan — kullanıcı "sıradaki adım ne", "hangi aşamadayız", "yol haritası", "plan", "ne yapmalıyız", "önceliklendir" dediğinde veya yeni bir özellik fikri getirdiğinde mutlaka tetiklenir. Yeni özellik isteklerini hangi aşamaya ait olduğuna göre konumlandırır ve aşama çıkış kriterlerini takip eder.
---

# Takyon Ai Yol Haritası

Takyon Ai; kumaş üreticileri, konfeksiyoncular ve alıcıları buluşturan B2B tekstil
platformudur. Önce Türkiye'de tutunur, sonra global pazara açılır. Bu skill'in görevi
her an "neredeyiz, sırada ne var, bu istek hangi aşamaya ait" sorularına net cevap
vermektir.

## Çalışma kuralları

- Teknik kararları sen ver, sorma. Fırat tekstil bilgisini sağlar; yazılım tarafı senindir.
- Her cevaba mevcut aşamayı ve o aşamanın çıkış kriterlerinden kaçının tamamlandığını
  yazarak başla.
- Yeni bir özellik fikri geldiğinde onu reddetme; `references/yol-haritasi.md` içindeki
  aşamalardan birine yerleştir ve "şimdi mi, sonra mı" kararını gerekçesiyle ver.
  Fikir mevcut aşamanın çıkış kriterlerine hizmet ediyorsa şimdi, etmiyorsa
  `references/fikir-havuzu.md` dosyasına ekle (aşama etiketiyle).
- Aşama atlama yok. Bir aşamanın çıkış kriterleri tamamlanmadan sonraki aşamanın işine
  girilmez; kullanıcı ısrar ederse hangi kriterin açık kaldığını söyle ve devam et.

## Aşamalar (özet)

| # | Aşama | Skill | Çıkış kriteri (kısa) |
|---|---|---|---|
| 0 | Tasarım uyum kontrolü | — | Ekranlar DESIGN.md ve tokens.css ile uyumlu |
| 1 | Kapalı pilot | takyon-pilot | 10–15 firma, 2 hafta, haftalık aktif kullanım |
| 2 | Türkiye açık yayın (web) | takyon-guvenlik-kapisi | Güvenlik raporu PASS, isim/fiyat netleşti |
| 3 | Mağaza uygulaması | takyon-magaza | App Store + Google Play'de yayında |
| 4 | Global | takyon-global | TR+EN tam, ilk dış pazar canlı |

Detaylar, her aşamanın tam çıkış kriterleri ve ölçüm yöntemi için
`references/yol-haritasi.md` dosyasını oku. Mevcut aşamayı `references/durum.md`
dosyasından oku; aşama değiştiğinde o dosyayı güncelle.

## Cevap şablonu

Yol haritasıyla ilgili her soruda şu yapıyı kullan:

```
Aşama: <numara ve ad>
Tamamlanan kriterler: <x / y>
Sıradaki 3 iş:
1. ...
2. ...
3. ...
Bu istek: <şimdi / aşama N'de> — <tek cümle gerekçe>
```
