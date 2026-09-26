import { z } from 'zod';
import { PRODUCT_GROUPS } from './production';

// Konfeksiyona "Teklif iste" (docs/konfeksiyon-plani.md Bölüm B, madde 7). Doğrulama saf
// işlevde; rota (routes/apparel.ts) veritabanı kontrollerini (hedef firma, kumaş ürünü) yapar.

export const APPAREL_FABRIC_MODES = [
  { key: 'katalog', label: 'Katalogdan seç' },
  { key: 'musteri', label: 'Kumaşı ben sağlayacağım' },
  { key: 'firma_onersin', label: 'Firma önersin' },
] as const;

export const APPAREL_REQUEST_STATUSES = [
  { key: 'gonderildi', label: 'Gönderildi' },
  { key: 'yanitlandi', label: 'Yanıtlandı' },
  { key: 'kapandi', label: 'Kapandı' },
] as const;

// Ek sınırları açık taleple aynı: görsel 700 bin, PDF 2,1 milyon karakter (data URL).
export const MAX_APPAREL_IMAGES = 4;
export const MAX_APPAREL_PDFS = 1;
export const MAX_APPAREL_IMAGE_CHARS = 700_000;
export const MAX_APPAREL_PDF_CHARS = 2_100_000;
export const MAX_APPAREL_REQUESTS_PER_DAY = 20;
const MAX_QUANTITY = 100_000_000;

const keysOf = (list: readonly { key: string }[]) => list.map((o) => o.key) as [string, ...string[]];

const attachment = z.string().refine(
  (s) =>
    (s.startsWith('data:image/') && s.length <= MAX_APPAREL_IMAGE_CHARS) ||
    (s.startsWith('data:application/pdf;base64,') && s.length <= MAX_APPAREL_PDF_CHARS),
  'attachment_invalid_or_too_large'
);

export const attachmentKind = (dataUrl: string): 'image' | 'pdf' => (dataUrl.startsWith('data:application/pdf') ? 'pdf' : 'image');

export const apparelRequestSchema = z
  .object({
    targetCompanyId: z.string().min(1),
    productGroup: z.enum(keysOf(PRODUCT_GROUPS)),
    quantity: z.number().int().min(1).max(MAX_QUANTITY),
    // "YYYY-MM-DD" ya da ISO tarih; boş = belirtilmedi.
    targetDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
    fabricMode: z.enum(keysOf(APPAREL_FABRIC_MODES)),
    fabricProductId: z.string().min(1).nullable().optional(),
    attachments: z.array(attachment).max(MAX_APPAREL_IMAGES).default([]),
    note: z.string().trim().max(2000).default(''),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.fabricMode === 'katalog' && !v.fabricProductId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fabricProductId'], message: 'fabric_product_required' });
    }
    // Ya en çok 4 görsel ya da tek PDF (karışık değil).
    const pdfs = v.attachments.filter((a) => attachmentKind(a) === 'pdf').length;
    if (pdfs > MAX_APPAREL_PDFS || (pdfs > 0 && v.attachments.length > pdfs)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['attachments'], message: 'attachments_images_or_one_pdf' });
    }
  });

export type ApparelRequestInput = z.infer<typeof apparelRequestSchema>;

export type ApparelRequestCheck = { ok: true; data: Omit<ApparelRequestInput, 'targetDate' | 'fabricProductId'> & { fabricProductId: string | null; targetDate: Date | null } } | { ok: false; error: string; details?: unknown };

export function checkApparelRequest(body: unknown): ApparelRequestCheck {
  const parsed = apparelRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues.find((i) => i.code === 'custom');
    return { ok: false, error: issue?.message ?? 'invalid_body', details: parsed.error.flatten() };
  }
  const d = parsed.data;
  const targetDate = d.targetDate ? new Date(d.targetDate) : null;
  if (targetDate && Number.isNaN(targetDate.getTime())) return { ok: false, error: 'invalid_body' };
  // Katalog dışı seçimde kumaş bağlantısı tutulmaz.
  return { ok: true, data: { ...d, targetDate, fabricProductId: d.fabricMode === 'katalog' ? d.fabricProductId ?? null : null } };
}

const labelOf = (list: readonly { key: string; label: string }[], key: string) => list.find((o) => o.key === key)?.label ?? key;

// "Yanıtla" ile açılan sohbetin ilk mesajı: talebin kısa özeti (Türkçe, alıcıya gider).
export function apparelSummaryLine(r: { productGroup: string; quantity: number; targetDate: Date | null; fabricMode: string; fabricCode?: string | null }) {
  const parts = [
    `Teklif isteği: ${labelOf(PRODUCT_GROUPS, r.productGroup)}`,
    `${r.quantity.toLocaleString('tr-TR')} adet`,
    r.targetDate ? `hedef ${r.targetDate.toISOString().slice(0, 10)}` : '',
    r.fabricMode === 'katalog' && r.fabricCode ? `kumaş ${r.fabricCode}` : labelOf(APPAREL_FABRIC_MODES, r.fabricMode).toLocaleLowerCase('tr-TR'),
  ];
  return `${parts.filter(Boolean).join(' · ')}. İsteğiniz inceleniyor, buradan konuşalım.`;
}

export const productGroupLabel = (key: string) => labelOf(PRODUCT_GROUPS, key);
export const fabricModeLabel = (key: string) => labelOf(APPAREL_FABRIC_MODES, key);
export const statusLabel = (key: string) => labelOf(APPAREL_REQUEST_STATUSES, key);
