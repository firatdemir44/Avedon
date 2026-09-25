# Texart test seti

Gerçek telefon fotoğrafları buraya konur (jpg, png, webp, heic). Fotoğraflar repoya girmez (firma verisi).
Dosya adında zor vakayı yazın: `siyah-`, `beyaz-`, `likrali-raschel-`, `dantel-`, `tul-`, `baskili-`, `kirisik-`, `egik-`, `sari-isik-`, `flasli-`.

Çalıştırma (backend klasöründe):

    npm.cmd run texart:test            # hepsi
    npm.cmd run texart:test -- siyah   # adında "siyah" geçenler

Sonuç: `texart/reports/<zaman>/index.html` (önce/sonra + ölçüm tablosu), `olcumler.csv`, her fotoğraf için `islem_kaydi.json`. En son çalıştırma: `texart/reports/son.html`.
