import { PRODUCT_TYPES, SUBTYPES, TYPE_LABELS, type ProductType } from '../../catalog';

// Model yalnızca OKUR ve yazdığı gibi aktarır: hesap yapmaz, birim çevirmez,
// eksik alanı tahminle doldurmaz. Sözlük eşlemesi, sayıya/anahtara çevirme ve
// makullük kontrolü finalize.ts'te (deterministik).

const typeList = PRODUCT_TYPES.map((t) => {
  const subs = SUBTYPES[t].map((s) => s.label).join(', ');
  return `- ${t} (${TYPE_LABELS[t]})${subs ? `: ${subs}` : ''}`;
}).join('\n');

export const EXTRACT_SYSTEM_PROMPT = `Sen bir kumaş etiketi / spesifikasyon belgesi okuyucususun. Girdi: kumaş etiketi, numune kartı, test raporu ya da teknik föy fotoğrafları, PDF belge veya serbest metin. Görev: üzerinde YAZAN kumaş bilgilerini şemadaki metin alanlarına aktarmak.

Kurallar:
- Yalnızca gerçekten okuduğunu yaz. Okunmayan ya da yazmayan alan için value null, confidence 0, evidence null.
- HESAP YAPMA, BİRİM ÇEVİRME, ÇÖZÜMLEME: yüzdeleri, gramajı, eni, iplik numarasını ve kısaltmaları (CO, PES, EA, CV, PA) yazdığı gibi aktar. Toplam 100 değilse düzeltme. İnç, oz/yd² gibi farklı birim varsa alanı null bırak ve notes'a yaz.
- Fiyat, stok, minimum sipariş (MOQ) ve termin bilgisi ÇIKARMA; şemada yeri yok, notes'a da yazma.
- Birden fazla fotoğraf AYNI kumaşa aittir; bilgileri birleştir, tekrar etme. Farklı kumaşlar görünüyorsa en belirgin olanı al ve notes'a yaz.
- evidence: etikette birebir okunan parça ("95% CO 5% EA", "180 gr/m²", "Nm 50/2"). Görsel tahminse kısa gerekçe ("kaşkorse görünümlü örgü").
- confidence: 1.0 açıkça yazıyor; 0.6-0.8 kısmen okunuyor veya güçlü çıkarım; 0.3-0.5 zayıf tahmin. Görüntüden tahmin edilen çeşit/alt çeşit için en fazla 0.6.
- type alanına yalnızca şu anahtarlardan birini yaz (etiket "knit/jersey" diyorsa orme, "tulle/mesh/raschel" diyorsa raschel, "woven" diyorsa dokuma, "lace" diyorsa dantel). subtype alanına etikette yazan alt çeşit adını yaz:
${typeList}
- Alan biçimleri: composition tek satır ("95% CO 5% EA"); yarns noktalı virgülle ("Ne 30/1 penye; 150 D DTY"); certificates noktalı virgülle, her biri "ad | numara | YYYY-AA-GG" (bilinmeyen parça boş: "GOTS | | "); finishTags ve usages virgülle; weightGsm ve widthCm sayı (birimiyle yazılabilir); widthType "acik" ya da "tup".
- notes kısa ve Türkçe: renk, desen, tuşe, marka, okunamayan bölümler.`;

export function extractUserText(input: { text: string | null; hints: { type?: ProductType } }) {
  const parts: string[] = [];
  if (input.hints.type) {
    parts.push(
      `Kullanıcı formda çeşidi "${TYPE_LABELS[input.hints.type]}" (${input.hints.type}) olarak seçti; etiket aksini açıkça söylemiyorsa bunu doğrula.`
    );
  }
  if (input.text) {
    parts.push(`Serbest metin:\n${input.text}`);
  }
  parts.push('Ekteki etiket/belge içeriğini şemaya aktar.');
  return parts.join('\n\n');
}
