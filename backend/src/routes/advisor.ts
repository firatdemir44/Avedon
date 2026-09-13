import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';

export const advisorRouter = Router();
advisorRouter.use(requireAuth);

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

const SYSTEM_PROMPT = `Sen Avedon platformunun AI Tekstil Danışmanısın. Tekstil sektöründe (kumaş üretimi, örme, dokuma, boyama, terbiye, iplik numaralandırma sistemleri, kalite kontrol, üretim süreçleri) deneyimli bir uzman gibi davran.

Kurallar:
- Her zaman Türkçe yanıtla.
- Net, pratik ve teknik açıdan doğru bilgi ver.
- Emin olmadığın veya sektörde tartışmalı olan konularda bunu açıkça belirt, uydurma bilgi verme.
- Kısa ve öz cevaplar tercih et, ama teknik detay istenirse derinleş.
- Yanıtın düz metin olarak bir mobil sohbet balonunda gösterilecek — markdown biçimlendirmesi kullanma (başlık için #, kalın için **, tablo için | gibi işaretler kullanma). Listeler için sadece "-" ile başlayan satırlar kullan, gerekirse boş satırla bölümlere ayır.
- Sen bir hesap makinesi değilsin; kesin maliyet/oran hesapları için platformun "Tekstil Hesap Araçları" bölümünü kullanmasını öner, tahmini rakam uydurma.`;

const askSchema = z.object({
  question: z.string().min(1),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional(),
});

advisorRouter.post('/ask', async (req, res) => {
  if (!client) {
    return res.status(503).json({ error: 'advisor_not_configured' });
  }

  const parsed = askSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }
  const { question, history = [] } = parsed.data;

  try {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 2048,
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT,
      messages: [...history, { role: 'user' as const, content: question }],
    });

    const answer = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    res.json({ answer });
  } catch (err) {
    console.error('Advisor error:', err);
    res.status(502).json({ error: 'advisor_request_failed' });
  }
});
