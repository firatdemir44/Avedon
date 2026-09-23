// Makine parkı tablosunun fotoğrafından/PDF'inden toplu aktarım. Sahibi kendi
// tablosunu (Mak No · Pus · Fein · Marka · İğne · Sistem · Örgü Cinsi) çeker;
// model satırları okur, sahibi gözden geçirip onaylar (commit ayrı uçta).
// fabricLook/run.ts ile aynı desen: sahte kipte model çağrılmaz.
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import { LLM_MODELS, LlmNotConfiguredError, LlmOutputError, getAnthropic, isLlmMock } from '../llm';
import { parseRange } from './range';

export const KIND_GUESSES = ['yuvarlak', 'raschel', 'duz_orme', 'dokuma', 'diger'] as const;
export type KindGuess = (typeof KIND_GUESSES)[number];

const rowSchema = z.object({
  machineNo: z.number().int().nullable(),
  diameterInch: z.number().nullable(),
  gaugeText: z.string(),
  brand: z.string(),
  needlesText: z.string(),
  feeders: z.number().int().nullable(),
  fabricType: z.string(),
  kindGuess: z.enum(KIND_GUESSES),
});

const sheetSchema = z.object({
  isMachineSheet: z.boolean(),
  rows: z.array(rowSchema),
});

export type ImportRow = z.infer<typeof rowSchema>;

const SYSTEM = `Sen bir tekstil örme/dokuma fabrikasının makine parkı tablosunu okuyan bir asistansın.
Görselde (ya da PDF'te) bir makine listesi tablosu var. Sütun adları farklı yazılmış olabilir:
- Mak No / No / Sıra → machineNo (tam sayı; yoksa null)
- Pus / Çap / Inch → diameterInch (sayı; yoksa null)
- Fein / Fine / Fayn / Gauge → gaugeText (metin olarak aynen; "28-22" gibi aralıklar korunur)
- Marka → brand (tablodaki yazımla)
- İğne → needlesText (metin; "2808-2210" gibi aralıklar korunur)
- Sistem / Feeder → feeders (tam sayı; yoksa null)
- Örgü Cinsi / Kumaş → fabricType (tablodaki yazımla, ör. "SÜPREM. TÜP", "İNTER-RİBANA")
kindGuess: pus değeri varsa "yuvarlak"; raschel yazıyorsa "raschel"; düz örme/triko ise "duz_orme"; dokuma tezgâhı ise "dokuma"; emin değilsen "diger".
Kurallar:
- Her tablo satırı bir makine; başlık ve toplam satırlarını alma. Satır sırasını koru.
- Okuyamadığın hücreyi uydurma: sayıda null, metinde "" ver.
- Görselde makine tablosu yoksa isMachineSheet=false ve rows boş.`;

export type SheetInput =
  | { kind: 'image'; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string }
  | { kind: 'pdf'; data: string };

export function splitSheetDataUrl(dataUrl: string): SheetInput | null {
  const m = /^data:(image\/(?:jpeg|png|webp|gif)|application\/pdf);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  if (m[1] === 'application/pdf') return { kind: 'pdf', data: m[2] };
  return { kind: 'image', mediaType: m[1] as 'image/jpeg', data: m[2] };
}

// Sahte kip: kullanıcının gösterdiği tablodan 3 satır (deterministik).
export const MOCK_ROWS: ImportRow[] = [
  { machineNo: 1, diameterInch: 32, gaugeText: '28-22', brand: 'TERROT', needlesText: '2808-2210', feeders: 96, fabricType: 'SÜPREM. TÜP', kindGuess: 'yuvarlak' },
  { machineNo: 19, diameterInch: 34, gaugeText: '16-22', brand: 'JUIN LONG', needlesText: '1720-2348', feeders: 84, fabricType: 'İNTER-RİBANA', kindGuess: 'yuvarlak' },
  { machineNo: 37, diameterInch: 32, gaugeText: '28-26', brand: 'VİGNONİ', needlesText: '2760', feeders: 96, fabricType: 'AÇIK EN SÜPREM', kindGuess: 'yuvarlak' },
];

// Model çıktısını toparlar: aralıkları normalize eder, bozuk değerleri boşaltır.
export function cleanRow(row: ImportRow): ImportRow {
  const gauge = parseRange(row.gaugeText);
  const needles = parseRange(row.needlesText);
  const positive = (n: number | null, max: number) => (n != null && n > 0 && n <= max ? n : null);
  return {
    machineNo: positive(row.machineNo, 99999),
    diameterInch: positive(row.diameterInch, 100),
    gaugeText: gauge ? gauge.text : '',
    brand: row.brand.trim().slice(0, 60),
    needlesText: needles ? needles.text : '',
    feeders: positive(row.feeders, 500),
    fabricType: row.fabricType.trim().slice(0, 80),
    kindGuess: row.diameterInch && row.kindGuess === 'diger' ? 'yuvarlak' : row.kindGuess,
  };
}

export async function extractMachineSheet(input: SheetInput): Promise<{ rows: ImportRow[]; recognized: boolean; model: string }> {
  if (isLlmMock()) return { rows: MOCK_ROWS.map(cleanRow), recognized: true, model: 'mock' };
  const client = getAnthropic();
  if (!client) throw new LlmNotConfiguredError();

  const source =
    input.kind === 'pdf'
      ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.data } } as const)
      : ({ type: 'image', source: { type: 'base64', media_type: input.mediaType, data: input.data } } as const);

  const message = await client.messages.parse({
    model: LLM_MODELS.extract,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'low', format: zodOutputFormat(sheetSchema) },
    messages: [{ role: 'user', content: [source, { type: 'text', text: 'Bu makine parkı tablosundaki tüm satırları çıkar.' }] }],
  });
  const out = message.parsed_output ?? null;
  if (!out) throw new LlmOutputError(`model tablo vermedi (stop_reason: ${message.stop_reason})`);
  return { rows: out.rows.slice(0, 200).map(cleanRow), recognized: out.isMachineSheet && out.rows.length > 0, model: LLM_MODELS.extract };
}

// Tür tahmini → kayıt grubu ve türü (mevcut katalogdaki adlarla).
export function kindFromGuess(guess: KindGuess, fabricType: string): { group: string; kind: string } {
  const f = fabricType
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's');
  switch (guess) {
    case 'yuvarlak':
      if (f.includes('inter')) return { group: 'orme', kind: 'Yuvarlak örme (interlok)' };
      if (f.includes('ribana') || f.includes('rib')) return { group: 'orme', kind: 'Yuvarlak örme (ribana)' };
      if (f.includes('jakar')) return { group: 'orme', kind: 'Yuvarlak örme (jakar)' };
      if (f.includes('suprem')) return { group: 'orme', kind: 'Yuvarlak örme (süprem)' };
      return { group: 'orme', kind: 'Yuvarlak örme' };
    case 'raschel':
      return { group: 'orme', kind: 'Raschel' };
    case 'duz_orme':
      return { group: 'orme', kind: 'Düz örme' };
    case 'dokuma':
      return { group: 'dokuma', kind: 'Dokuma tezgâhı' };
    default:
      return { group: 'orme', kind: 'Örme makinesi' };
  }
}
