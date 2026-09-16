// Beceri girişi: girdiyi modele verir (ya da sahte yanıt alır), ham çıktıyı
// finalize ile sözlükten geçirir. Kaydetmez; yalnızca öneri döner.
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { ProductType } from '../../catalog';
import { LLM_MODELS, LlmNotConfiguredError, LlmOutputError, getAnthropic, isLlmMock } from '../../llm';
import { finalizeExtraction } from './finalize';
import { mockRawExtraction } from './mock';
import { EXTRACT_SYSTEM_PROMPT, extractUserText } from './prompt';
import { rawExtractionSchema, type ExtractionResult, type RawExtraction } from './schema';

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export interface ExtractInput {
  images: { data: string; mediaType: ImageMediaType }[];
  document: { data: string } | null;
  text: string | null;
  hints: { type?: ProductType };
}

export interface ExtractMeta {
  model: string;
  mock: boolean;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

export type ExtractOutcome = ExtractionResult & { meta: ExtractMeta };

export async function runPassportExtract(input: ExtractInput): Promise<ExtractOutcome> {
  const started = Date.now();

  if (isLlmMock()) {
    const raw = mockRawExtraction(input);
    return {
      ...finalizeExtraction(raw, { hints: input.hints }),
      meta: { model: 'mock', mock: true, durationMs: Date.now() - started, inputTokens: null, outputTokens: null },
    };
  }

  const client = getAnthropic();
  if (!client) throw new LlmNotConfiguredError();

  const content: Anthropic.ContentBlockParam[] = [];
  for (const img of input.images) {
    content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
  }
  if (input.document) {
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.document.data } });
  }
  content.push({ type: 'text', text: extractUserText(input) });

  const message = await client.messages.parse({
    model: LLM_MODELS.extract,
    max_tokens: 3000,
    system: EXTRACT_SYSTEM_PROMPT,
    output_config: { effort: 'medium', format: zodOutputFormat(rawExtractionSchema) },
    messages: [{ role: 'user', content }],
  });

  const raw: RawExtraction | null = message.parsed_output ?? null;
  if (!raw) throw new LlmOutputError(`model yapılandırılmış çıktı vermedi (stop_reason: ${message.stop_reason})`);

  return {
    ...finalizeExtraction(raw, { hints: input.hints }),
    meta: {
      model: LLM_MODELS.extract,
      mock: false,
      durationMs: Date.now() - started,
      inputTokens: message.usage?.input_tokens ?? null,
      outputTokens: message.usage?.output_tokens ?? null,
    },
  };
}
