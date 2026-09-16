// ANTHROPIC_MOCK=1 iken model yerine bu çalışır: serbest metin varsa sözlük
// ayrıştırıcılarıyla deterministik ham çıktı üretir (uçtan uca test anahtarsız
// çalışır); yalnızca fotoğraf/belge varsa sabit bir örnek etiket döner.
import { findCertificates, formatComposition, matchKnit, parseComposition, parseMeasures } from '../../domain/glossary';
import type { RawExtraction, RawField } from './schema';
import type { ExtractInput } from './run';

const MOCK_NOTE = 'SAHTE ÇIKARIM (ANTHROPIC_MOCK=1): gerçek model çağrılmadı.';

const field = (value: string | null, confidence: number, evidence: string | null = value): RawField => ({
  value,
  confidence: value ? confidence : 0,
  evidence: value ? evidence : null,
});

export function mockRawExtraction(input: ExtractInput): RawExtraction {
  if (!input.text) return sampleLabel();

  const text = input.text;
  const comp = parseComposition(text);
  const measures = parseMeasures(text);
  const knit = matchKnit(text);
  const certs = findCertificates(text);
  const codeMatch = text.match(/\b(?:kod|code|art(?:ikel)?|kalite)[:\s.#-]*([A-Za-z0-9-]{3,20})/i);

  return {
    type: field(knit.type, knit.confidence, knit.matchedText || null),
    subtype: field(knit.subtype ? knit.matchedText : null, knit.confidence),
    code: field(codeMatch?.[1] ?? null, 0.9, codeMatch?.[0] ?? null),
    composition: field(comp.items.length ? formatComposition(comp.items) : null, comp.confidence, comp.items.length ? text.slice(0, 200) : null),
    weightGsm: field(measures.gsm != null ? `${measures.gsm} gr/m²` : null, 1),
    widthCm: field(measures.widthCm != null ? `${measures.widthCm} cm` : null, 1),
    widthType: field(measures.widthType, 1, null),
    yarns: field(measures.yarns.length ? measures.yarns.map((y) => y.matchedText).join('; ') : null, 0.9),
    certificates: field(certs.length ? certs.map((c) => `${c.matchedText} | | `).join('; ') : null, 1, certs.map((c) => c.matchedText).join(', ') || null),
    finishTags: field(null, 0),
    usages: field(null, 0),
    notes: MOCK_NOTE,
  };
}

function sampleLabel(): RawExtraction {
  return {
    type: field('orme', 0.9, 'Single Jersey'),
    subtype: field('Single Jersey', 0.9),
    code: field('SJ-180', 0.95, 'Art. SJ-180'),
    composition: field('95% CO 5% EA', 0.95),
    weightGsm: field('180 gr/m²', 1),
    widthCm: field('185 cm', 1, 'En: 185 cm'),
    widthType: field('tup', 0.8, 'tüp'),
    yarns: field('Ne 30/1 penye', 0.9),
    certificates: field('OEKO-TEX Standard 100 | 12.HTR.34567 | ', 0.9, 'OEKO-TEX Standard 100 12.HTR.34567'),
    finishTags: field('silikon yumuşatma', 0.7),
    usages: field('T-shirt', 0.6),
    notes: `${MOCK_NOTE} Örnek etiket: lacivert, düz.`,
  };
}
