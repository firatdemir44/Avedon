---
name: takyon-guvenlik-kapisi
description: Takyon Ai açık yayın öncesi güvenlik ve KVKK kapısı. Uygulama herkese açılmadan, ödeme alınmadan, mağazaya çıkmadan veya yeni bir pazara açılmadan önce MUTLAKA çalıştır. Kullanıcı "güvenlik", "yayına alıyoruz", "canlıya çıkıyoruz", "KVKK", "GDPR", "firma verileri güvende mi", "hackleniyor mu" dediğinde de tetiklenir. Kimlik doğrulama, firma verisi izolasyonu, fotoğraf yükleme, bağımlılıklar ve kişisel veri konularında PASS/WARN/FAIL raporu üretir.
---

# Takyon Ai Güvenlik Kapısı

B2B platformda güvenin bedeli yüksektir: bir firmanın müşteri listesi, fiyatı veya
makine parkuru rakibine görünürse ürün biter. Bu skill dış araç kurmadan, kodun
kendisini okuyarak ve mevcut testleri çalıştırarak denetim yapar. Sonuç her zaman
aşağıdaki rapor şablonuyla verilir; "genel olarak iyi" gibi ifadeler kullanılmaz.

## Denetim adımları (sırayla, hepsi)

### 1. Kimlik doğrulama ve oturum
- Telefon doğrulama kodu: 6 hane, 5 dakika geçerli, 5 denemede kilit, kod loglanmıyor.
- Oturum token'ı: httpOnly + Secure cookie veya güvenli depoda; süre dolumu ve çıkış
  gerçekten geçersiz kılıyor.
- Şifre yoksa (OTP only) hesap kurtarma yolu tanımlı.

### 2. Firma verisi izolasyonu (en kritik)
- Her sorgu firma kimliğiyle filtreleniyor mu? Kendi firması dışındaki numune
  isteğini, mesajı, fiyatı, iş birliği bağını ID değiştirerek çekmeyi dene.
- "Doğrulanmış iş birliği" bağı iki tarafın onayı olmadan görünmüyor.
- Silinen firma verisi gerçekten siliniyor (soft delete varsa sorgulardan çıkarılıyor).

### 3. Yükleme (kumaş fotoğrafları, kataloglar)
- Dosya tipi ve boyut sunucuda kontrol ediliyor (uzantıya güvenilmiyor).
- Fotoğraflar EXIF/GPS temizlenerek saklanıyor.
- Yüklenen dosyalar tahmin edilemez adla, uygulama kökünün dışında, imzalı URL ile
  servis ediliyor.

### 4. Yapay zekâ danışman ve firma asistanı
- Prompt'a giden kullanıcı metni başka firmanın verisini sızdıramıyor.
- Asistan yalnızca kendi firmasının verisine erişiyor; araç çağrıları firma ID'siyle
  kısıtlı.
- Yapay zekâ fiyat/fire tahmini yapmıyor (ürün kuralı) — çıktıda buna uygunluk kontrolü.

### 5. Bağımlılıklar ve gizli anahtarlar
- `npm audit` çalıştır; yüksek/kritik açıkları listele.
- Repoda .env, anahtar, telefon listesi, pilot firma verisi commit edilmemiş
  (`git log -p` ile geçmişi de tara).
- WhatsApp, yapay zekâ ve ödeme anahtarları yalnızca sunucu tarafında.

### 6. Erişilebilirlik ve kötüye kullanım
- Arama ve numune isteği uç noktalarında hız sınırı (rate limit).
- Aynı firmaya günde X'ten fazla numune isteği engelleniyor (spam).
- HTTPS zorunlu, güvenlik başlıkları (CSP, HSTS) ayarlı.

### 7. KVKK (Türkiye) — açık yayın için zorunlu
- Aydınlatma metni ve açık rıza ekranı ilk girişte.
- Veri sorumlusu, işleme amacı, saklama süresi yazılı.
- Kullanıcı kendi verisini indirebiliyor ve hesabını silebiliyor.
- VERBİS kaydı gerekip gerekmediği avukatla teyit edildi (not olarak yaz).

GDPR gerekliliği aşama 4'te `takyon-global` skill'inde ele alınır; burada yalnızca
KVKK.

## Rapor şablonu

```
# Takyon Ai Güvenlik Raporu — <tarih>
Kapsam: <hangi sürüm / hangi aşama için>

| # | Alan | Sonuç | Bulgu | Düzeltme |
|---|---|---|---|---|
| 1 | Kimlik doğrulama | PASS/WARN/FAIL | ... | ... |
| 2 | Firma verisi izolasyonu | | | |
| 3 | Yükleme | | | |
| 4 | Yapay zekâ | | | |
| 5 | Bağımlılıklar | | | |
| 6 | Kötüye kullanım | | | |
| 7 | KVKK | | | |

Genel sonuç: PASS / FAIL
FAIL varsa yayın YAPILMAZ. WARN'lar yayın sonrası 2 hafta içinde kapatılır.
Fırat için 3 cümlelik özet:
```

Raporu `security/rapor-<tarih>.md` olarak kaydet. Düzeltmeleri yaptıktan sonra
kapıyı yeniden çalıştır; PASS alana kadar aşama 2 kapanmaz.
