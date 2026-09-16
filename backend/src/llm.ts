import Anthropic from '@anthropic-ai/sdk';

// Tek Anthropic istemcisi (yol haritası §7). Anahtar yoksa null döner ve uçlar
// 503 verir. ANTHROPIC_MOCK=1 iken gerçek model hiç çağrılmaz: beceriler kendi
// deterministik sahte yanıtlarını üretir, böylece uçtan uca testler anahtarsız
// ve ücretsiz çalışır (bkz. skills/passportExtract/mock.ts).

export const LLM_MODELS = {
  // Etiket/belge fotoğrafından yapılandırılmış çıkarım
  extract: 'claude-opus-5',
  // Sohbet (danışman; ileride firma asistanı)
  chat: 'claude-opus-5',
} as const;

export function isLlmMock() {
  return process.env.ANTHROPIC_MOCK === '1';
}

let client: Anthropic | null | undefined;

// Tembel: .env index.ts'te yüklendikten sonra ilk istekte kurulur; testler
// ortam değişkenini önceden değiştirebilir.
export function getAnthropic(): Anthropic | null {
  if (client === undefined) {
    client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ timeout: 90_000, maxRetries: 1 }) : null;
  }
  return client;
}

export function isLlmConfigured() {
  return isLlmMock() || getAnthropic() !== null;
}

export class LlmNotConfiguredError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY tanımlı değil');
    this.name = 'LlmNotConfiguredError';
  }
}

// Model yanıtı beklenen biçime uymadı (ret, kesilme, şema dışı).
export class LlmOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmOutputError';
  }
}
