import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export const garmentAnalysisRouter = Router();

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

const SYSTEM_PROMPT = `Sen bir konfeksiyon ürününün fotoğraflarını inceleyip görünen bileşenleri tespit eden bir yardımcısın.

Kurallar:
- Kullanıcı aynı ürünün farklı açılardan (ön, arka, yandan vb.) çekilmiş birden fazla fotoğrafını yükleyebilir. Tüm fotoğrafları TEK bir ürüne ait olarak değerlendir.
- Sadece fotoğraflarda GERÇEKTEN görünen bileşenleri listele (örn. yaka tipi, kol tipi, fermuar, düğme sayısı, cep, astar, dikiş tipi, ön/arka baskı, kumaş türü izlenimi vb.).
- Aynı bileşeni birden fazla fotoğrafta gördüysen SADECE BİR KEZ listele — tekrar etme. Sadece belirli bir açıda (örn. arka fotoğrafta) görünen ek bileşenleri ayrıca ekle.
- Fiyat, miktar veya maliyet TAHMİN ETME — bu veriler kullanıcıdan alınacak, senin işin sadece bileşenleri tespit etmek.
- Emin olmadığın bir bileşeni ekleme.
- SADECE aşağıdaki JSON formatında yanıt ver, başka hiçbir metin ekleme:
[{"component": "Bileşen adı", "detail": "Kısa açıklama, örn. dikiş sayısı ya da tip"}]`;

const requestSchema = z.object({
  images: z
    .array(
      z.object({
        imageBase64: z.string().min(1),
        mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      })
    )
    .min(1)
    .max(4),
});

const componentSchema = z.array(
  z.object({
    component: z.string(),
    detail: z.string(),
  })
);

garmentAnalysisRouter.post('/detect', async (req, res) => {
  if (!client) {
    return res.status(503).json({ error: 'analysis_not_configured' });
  }

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  try {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1536,
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            ...parsed.data.images.map((img) => ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: img.mediaType,
                data: img.imageBase64,
              },
            })),
            {
              type: 'text' as const,
              text:
                parsed.data.images.length > 1
                  ? 'Bu kıyafetin (farklı açılardan çekilmiş) fotoğraflarını birlikte değerlendirip görünen tüm bileşenleri tespit et.'
                  : 'Bu kıyafetin görünen bileşenlerini tespit et.',
            },
          ],
        },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.status(502).json({ error: 'analysis_parse_failed' });
    }

    const componentsParsed = componentSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!componentsParsed.success) {
      return res.status(502).json({ error: 'analysis_parse_failed' });
    }

    res.json({ components: componentsParsed.data });
  } catch (err) {
    console.error('Garment analysis error:', err);
    res.status(502).json({ error: 'analysis_request_failed' });
  }
});
