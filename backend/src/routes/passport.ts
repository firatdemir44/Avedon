import { Router } from 'express';
import { z } from 'zod';
import { PRODUCT_TYPES } from '../catalog';
import { LlmNotConfiguredError, LlmOutputError, isLlmConfigured } from '../llm';
import { requireAuth } from '../middleware/auth';
import { runPassportExtract, type ImageMediaType } from '../skills/passportExtract';

// Faz 1, Adım 3: fotoğraf / PDF / metinden pasaport önerisi. Kaydetmez; istemci
// öneriyi onay ekranında gösterir, kullanıcı forma aktarır ve normal POST/PATCH
// /products ile fieldMeta (source: extracted) göndererek kaydeder.
export const passportRouter = Router();
passportRouter.use(requireAuth);

export const MAX_EXTRACT_IMAGES = 4;
// Anthropic görüntü sınırı 5 MB; base64 ~%33 şişer.
const MAX_IMAGE_BASE64_CHARS = Math.floor(5 * 1024 * 1024 * 1.37);
// PDF: gövde sınırı 15 MB (index.ts); tek belge 10 MB ham ile kalsın.
const MAX_PDF_BASE64_CHARS = Math.floor(10 * 1024 * 1024 * 1.37);
const MAX_TEXT_CHARS = 4000;

const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

const imageSchema = z.object({
  // data URL ("data:image/jpeg;base64,...") ya da çıplak base64
  imageBase64: z.string().min(1),
  mediaType: z.enum(IMAGE_MEDIA_TYPES),
});

const documentSchema = z.object({
  dataBase64: z.string().min(1),
  mediaType: z.literal('application/pdf'),
});

const bodySchema = z.object({
  images: z.array(imageSchema).max(MAX_EXTRACT_IMAGES).default([]),
  document: documentSchema.nullable().optional(),
  text: z.string().trim().max(MAX_TEXT_CHARS).optional(),
  hints: z.object({ type: z.enum(PRODUCT_TYPES).optional() }).optional(),
});

// "data:...;base64,XXXX" → { mediaType, data }; çıplak base64 ise mediaType null.
function splitDataUrl(value: string): { mediaType: string | null; data: string } {
  const m = value.match(/^data:([^;,]+)?(?:;[^,]*)?,(.*)$/s);
  if (!m) return { mediaType: null, data: value };
  return { mediaType: m[1] ?? null, data: m[2] };
}

passportRouter.post('/extract', async (req, res) => {
  if (!isLlmConfigured()) {
    return res.status(503).json({ error: 'extract_not_configured' });
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }
  const body = parsed.data;
  const text = body.text || null;
  if (body.images.length === 0 && !body.document && !text) {
    return res.status(400).json({ error: 'extract_input_required' });
  }

  const images: { data: string; mediaType: ImageMediaType }[] = [];
  for (const img of body.images) {
    const { mediaType, data } = splitDataUrl(img.imageBase64);
    if (data.length > MAX_IMAGE_BASE64_CHARS) {
      return res.status(400).json({ error: 'image_too_large', maxBytes: 5 * 1024 * 1024 });
    }
    // data URL'deki tür geçerliyse ona güven (istemci yanlış bildirebilir).
    const effective = (IMAGE_MEDIA_TYPES as readonly string[]).includes(mediaType ?? '') ? (mediaType as ImageMediaType) : img.mediaType;
    images.push({ data, mediaType: effective });
  }

  let document: { data: string } | null = null;
  if (body.document) {
    const { data } = splitDataUrl(body.document.dataBase64);
    if (data.length > MAX_PDF_BASE64_CHARS) {
      return res.status(400).json({ error: 'document_too_large', maxBytes: 10 * 1024 * 1024 });
    }
    document = { data };
  }

  try {
    const outcome = await runPassportExtract({ images, document, text, hints: body.hints ?? {} });
    res.json(outcome);
  } catch (err) {
    if (err instanceof LlmNotConfiguredError) return res.status(503).json({ error: 'extract_not_configured' });
    if (err instanceof LlmOutputError) {
      console.error('Passport extract output error:', err.message);
      return res.status(502).json({ error: 'extract_parse_failed' });
    }
    console.error('Passport extract error:', err);
    res.status(502).json({ error: 'extract_failed' });
  }
});
