// Hesap becerileri (backend/src/skills) İngilizce metinleri: başlıklar, özet cümle parçaları,
// doğrulama mesajları, kalem etiketleri. Anahtar = Türkçe metin (yer tutucular aynı).
export const skillTexts: Record<string, string> = {
  // Başlıklar
  'Örgüden tahmini gramaj': 'Estimated weight from knit structure',
  'Numuneden gramaj': 'Weight (g/m²) from sample',
  'Metre kilo çevirisi': 'Metres ↔ kg conversion',
  'Kumaş maliyeti': 'Fabric cost',
  'Konfeksiyon maliyeti': 'Garment cost',
  'Örme üretim hesabı': 'Knitting production',
  'Teklif taslağı': 'Quote draft',
  'İplik numarası çevirisi': 'Yarn count conversion',
  'Numuneden iplik numarası': 'Yarn count from sample',
  'İplik ve kumaş ihtiyacı (fire zinciri)': 'Yarn and fabric requirement (loss chain)',
  'Gereken iplik kilosu': 'Required yarn (kg)',
  'İplik oranları': 'Yarn ratios',

  // Doğrulama mesajları
  'İlmek boyu (loopLengthMm) ya da 50 iğne iplik uzunluğu (lengthPer50NeedlesCm) verilmeli':
    'Provide either the loop length (loopLengthMm) or the yarn length over 50 needles (lengthPer50NeedlesCm)',
  'İplik için ya yarnTex ya da yarnCount + yarnSystem verilmeli': 'For the yarn, provide either yarnTex or yarnCount + yarnSystem',
  'finishedKg ya da garmentFabricKg ya da finishedMeters + weightGsm + widthCm verilmeli':
    'Provide finishedKg, or garmentFabricKg, or finishedMeters + weightGsm + widthCm',

  // fabricGsmKnit
  '{courses} sıra/cm, {wales} çubuk/cm, ilmek boyu {loop} mm, iplik {tex} tex{plate}':
    '{courses} courses/cm, {wales} wales/cm, loop length {loop} mm, yarn {tex} tex{plate}',
  ' (çift plaka)': ' (double jersey)',
  ' (tek plaka)': ' (single jersey)',
  'teorik ham gramaj {gsm} gr/m²': 'theoretical greige weight {gsm} g/m²',
  'en {from} → {to} cm ile tahmini mamul gramaj {gsm} gr/m²': 'with width {from} → {to} cm, estimated finished weight {gsm} g/m²',
  '%{pct} değişimle tahmini mamul gramaj {gsm} gr/m²': 'with a {pct}% change, estimated finished weight {gsm} g/m²',
  'gerçek ölçüm {gsm} gr/m², sapma %{dev}': 'actual measurement {gsm} g/m², deviation {dev}%',

  // fabricGsmSample
  '{w} mm × {l} mm numune {g} g geldi; gramaj {gsm} gr/m².': 'The {w} mm × {l} mm sample weighed {g} g; weight {gsm} g/m².',

  // fabricLengthWeight
  '{w} cm tek yüz tüp eni (hesapta {eff} cm açık en)': '{w} cm single-face tubular width ({eff} cm open width in the calculation)',
  '{w} cm açık en': '{w} cm open width',
  '{gsm} gr/m², {width} ile 1 kg ≈ {mpk} m': 'At {gsm} g/m² and {width}, 1 kg ≈ {mpk} m',

  // fabricPricing
  'İplik maliyeti {v} TRY/kg': 'Yarn cost {v} TRY/kg',
  'ham maliyet {c} TRY/kg, ham satış {s} TRY/kg': 'greige cost {c} TRY/kg, greige sale {s} TRY/kg',
  'boyalı maliyet {c} TRY/kg, boyalı satış {s} TRY/kg': 'dyed cost {c} TRY/kg, dyed sale {s} TRY/kg',
  '(boyalı satış {v} USD/kg)': '(dyed sale {v} USD/kg)',
  '1 kg ≈ {mpk} m, boyalı satış {v} TRY/m': '1 kg ≈ {mpk} m, dyed sale {v} TRY/m',
  'Dikkat: iplik oranları toplamı %{v}, 100 olmalı': 'Note: yarn ratios add up to {v}%, they should total 100',

  // garmentCost
  Kesim: 'Cutting',
  Dikim: 'Sewing',
  'Yıkama / baskı / boya': 'Washing / printing / dyeing',
  Aksesuar: 'Accessories',
  Paketleme: 'Packaging',
  Nakliye: 'Shipping',
  'Genel gider / fire / diğer': 'Overhead / wastage / other',
  'Kumaş {cost} {cur} ({m} m, kesim firesi %{w} dahil)': 'Fabric {cost} {cur} ({m} m, including {w}% cutting wastage)',
  'adet maliyeti {v} {cur}': 'unit cost {v} {cur}',
  '{q} adet için {v} {cur}': '{v} {cur} for {q} pieces',
  'boş kalemler: {list}': 'empty items: {list}',

  // knitProduction
  '{n}. iplik': 'yarn {n}',
  'Saatte {v} kg': '{v} kg per hour',
  '{h} saatlik günde, randıman %{eff} ile {v} kg': '{v} kg in a {h}-hour day at {eff}% efficiency',
  '({n} makine, makine başına {v} kg/gün)': '({n} machines, {v} kg/day per machine)',
  'iplik payları: {list}': 'yarn shares: {list}',
  'günlük fason geliri {v} TRY': 'daily contract fee income {v} TRY',

  // quoteDraft
  '{q} {unit} için birim fiyat {price} {cur}/{unit}{conv}, toplam {total} {cur}':
    'Unit price for {q} {unit}: {price} {cur}/{unit}{conv}, total {total} {cur}',
  ' (birim çevrildi)': ' (unit converted)',
  '{q} {unit} için fiyat hesaplanamadı': 'Price could not be calculated for {q} {unit}',
  "istenen miktar MOQ'nun ({moq} {unit}) altında": 'requested quantity is below the MOQ ({moq} {unit})',
  'termin {n} gün': 'lead time {n} days',
  'geçerlilik {n} gün': 'validity {n} days',
  'eksik: {list}': 'missing: {list}',
  fiyat: 'price',
  'birim çevirisi için gramaj ve en': 'weight and width for unit conversion',
  termin: 'lead time',

  // yarnRequirement
  '{g} kg dikilmiş ürün kumaşı için kesim firesi %{c} ile {f} kg mamul kumaş':
    'For {g} kg of fabric in sewn garments, with {c}% cutting loss: {f} kg finished fabric',
  '{f} kg mamul kumaş': '{f} kg finished fabric',
  'boya/apre firesi %{p} ile {v} kg ham kumaş örülmeli': 'with {p}% dyeing/finishing loss, {v} kg greige fabric must be knitted',
  'örme firesi %{p} ile {v} kg iplik alınmalı': 'with {p}% knitting loss, {v} kg yarn must be purchased',

  // yarnUsage
  '{gsm} gr/m², {w} cm açık ende 1 metre {kpm} kg gelir (1 kg ≈ {mpk} m); {m} metre için fire %{loss} dahil {kg} kg iplik gerekir.':
    'At {gsm} g/m² and {w} cm open width, 1 metre weighs {kpm} kg (1 kg ≈ {mpk} m); {m} metres need {kg} kg of yarn including {loss}% wastage.',

  // yarnCount / yarnCountFromSample / yarnUsageRatio
  denye: 'denier',
  ' Katlı iplik: bu değerler bütün ipliğin kalınlığıdır, {ne} Ne kalınlığa denk gelir.':
    ' Plied yarn: these values are for the whole yarn, equivalent to {ne} Ne.',
  '{len} cm iplik {g} g geldi; iplik {tex} tex ({ne} Ne, {nm} Nm, {den} denye, {dtex} dtex).':
    '{len} cm of yarn weighed {g} g; the yarn is {tex} tex ({ne} Ne, {nm} Nm, {den} denier, {dtex} dtex).',
  '{count} {sys} iplik %{pct}': '{count} {sys} yarn {pct}%',
};
