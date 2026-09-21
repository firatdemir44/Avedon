// Fotoğraftan görünüm kartı (Faz 3, Adım 3). passportExtract/run.ts ile aynı desen:
// sahte kipte model çağrılmaz; gerçek kipte yapılandırılmış çıktı istenir.
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { LLM_MODELS, LlmNotConfiguredError, LlmOutputError, getAnthropic, isLlmMock } from '../../llm';
import { lookSchema, type FabricLook } from './schema';

export type LookImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

const SYSTEM = `Sen bir tekstil uzmanısın. Sana bir kumaş fotoğrafı verilecek; YALNIZCA fotoğrafta GÖRÜNEN görünüm özelliklerini sınıflandır.
Kurallar:
- Gramaj, lif içeriği, örgü/dokuma yapısı gibi fotoğraftan kesin okunamayan şeyleri tahmin etme; bunlar istenmiyor.
- Kumaşın kendisine bak: arka plan, el, askı, etiket, manken teni renk ve desen sayılmaz.
- colors: baskın renk ilk sırada, en çok 3 renk; zemin rengi genelde baskındır. Tek renkli kumaşta tek renk ver.
- pattern "duz" ise scale "yok" olmalı. Melanj/kırçıllı iplik görünümü desen değil "melanj"dır.
- texture: yüzeyin yapısı (file, tül, dantel, rib, havlu...). Belirgin bir yapı yoksa "duz".
- transparency: arkası görünüyorsa saydam/yarı saydam; emin değilsen "opak".
- Fotoğrafta kumaş yoksa isFabric=false ve confidence düşük.`;

export function splitDataUrl(dataUrl: string): { mediaType: LookImageMediaType; data: string } | null {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/s.exec(dataUrl);
  return m ? { mediaType: m[1] as LookImageMediaType, data: m[2] } : null;
}

const MOCK_DEFAULT: FabricLook = { isFabric: true, pattern: 'duz', scale: 'yok', colors: ['gri'], surface: 'mat', texture: 'duz', transparency: 'opak', confidence: 0.5 };

// Sahte kip: görselin base64 içeriği "LOOK:{json}" metniyse o kart döner (testler böyle besler).
function mockLook(data: string): FabricLook {
  try {
    const text = Buffer.from(data, 'base64').toString('utf8');
    if (text.startsWith('LOOK:')) {
      const parsed = lookSchema.safeParse({ ...MOCK_DEFAULT, ...JSON.parse(text.slice(5)) });
      if (parsed.success) return parsed.data;
    }
  } catch {
    // varsayılan karta düş
  }
  return MOCK_DEFAULT;
}

export interface LookOutcome {
  look: FabricLook;
  model: string;
}

export async function extractFabricLook(image: { mediaType: LookImageMediaType; data: string }): Promise<LookOutcome> {
  if (isLlmMock()) return { look: mockLook(image.data), model: 'mock' };
  const client = getAnthropic();
  if (!client) throw new LlmNotConfiguredError();

  const message = await client.messages.parse({
    model: LLM_MODELS.extract,
    max_tokens: 600,
    system: SYSTEM,
    output_config: { effort: 'low', format: zodOutputFormat(lookSchema) },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
          { type: 'text', text: 'Bu kumaşın görünüm kartını çıkar.' },
        ],
      },
    ],
  });
  const look = message.parsed_output ?? null;
  if (!look) throw new LlmOutputError(`model görünüm kartı vermedi (stop_reason: ${message.stop_reason})`);
  const fixed: FabricLook = {
    ...look,
    colors: [...new Set(look.colors)].slice(0, 3),
    scale: look.pattern === 'duz' ? 'yok' : look.scale,
    confidence: Math.max(0, Math.min(1, look.confidence)),
  };
  return { look: fixed, model: LLM_MODELS.extract };
}
