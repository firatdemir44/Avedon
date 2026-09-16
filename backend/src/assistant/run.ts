// Asistan turu: geçmişi kur, araçlarla modeli çalıştır (SDK araç döngüsü),
// sonucu ve ham API mesajlarını sohbete yaz. ANTHROPIC_MOCK=1 iken model yerine
// mock.ts çalışır (uçtan uca test anahtarsız).
import type Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../db';
import { LLM_MODELS, LlmNotConfiguredError, getAnthropic, isLlmMock } from '../llm';
import { readMemory } from './memory';
import { mockAssistantTurn } from './mock';
import { personaBlock, personaFor } from './persona';
import { ASSISTANT_SYSTEM_PROMPT, memoryBlock } from './system';
import { buildTools, type MemorySuggestion, type ToolCallRecord } from './tools';

type ApiMessage = Anthropic.Beta.Messages.BetaMessageParam;

// Ekrana giden mesaj biçimi (contentJson).
export interface AssistantMessageView {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolCalls: ToolCallRecord[];
  memorySuggestions: MemorySuggestion[];
  createdAt: Date;
}

export interface TurnResult {
  userMessage: AssistantMessageView;
  message: AssistantMessageView;
  usage: { inputTokens: number; outputTokens: number; iterations: number; mock: boolean };
}

// Geçmişten en fazla bu kadar ham API mesajı modele gider (tool_use/tool_result dahil).
const MAX_HISTORY_API_MESSAGES = 40;
const MAX_ITERATIONS = 8;
const TITLE_MAX = 60;

export function toView(row: { id: string; role: string; contentJson: string; createdAt: Date }): AssistantMessageView {
  let parsed: Partial<AssistantMessageView> = {};
  try {
    parsed = JSON.parse(row.contentJson);
  } catch {
    parsed = { text: row.contentJson };
  }
  return {
    id: row.id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    text: parsed.text ?? '',
    toolCalls: parsed.toolCalls ?? [],
    memorySuggestions: parsed.memorySuggestions ?? [],
    createdAt: row.createdAt,
  };
}

// Kayıtlı turlardan modele gidecek geçmiş: her satırın apiJson dizisi sırayla,
// sondan MAX kadar; dizi bir kullanıcı mesajıyla başlamalı (tool_result ile
// başlayan kesik geçmiş API'de hata verir).
function historyFromRows(rows: { apiJson: string }[]): ApiMessage[] {
  const all: ApiMessage[] = [];
  for (const r of rows) {
    try {
      const arr = JSON.parse(r.apiJson);
      if (Array.isArray(arr)) all.push(...arr);
    } catch {
      // bozuk satır atlanır
    }
  }
  let slice = all.slice(-MAX_HISTORY_API_MESSAGES);
  while (slice.length && !(slice[0].role === 'user' && typeof slice[0].content === 'string')) slice = slice.slice(1);
  return slice;
}

function textOf(content: Anthropic.Beta.Messages.BetaContentBlock[]) {
  return content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

export async function runAssistantTurn(params: { threadId: string; userId: string; companyId: string | null; text: string }): Promise<TurnResult> {
  const { threadId, userId, companyId } = params;
  const text = params.text.trim();

  const [rows, memory, company, user] = await Promise.all([
    prisma.assistantMessage.findMany({ where: { threadId }, orderBy: { createdAt: 'asc' }, select: { apiJson: true } }),
    companyId ? readMemory(companyId) : Promise.resolve([]),
    companyId ? prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }) : Promise.resolve(null),
    prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, assistantPersona: true } }),
  ]);
  const persona = personaFor(user?.assistantPersona);
  const history = historyFromRows(rows);
  const userApi: ApiMessage = { role: 'user', content: text };
  const messages: ApiMessage[] = [...history, userApi];

  const toolSet = buildTools({ userId, companyId });

  let answer: string;
  let newApi: ApiMessage[];
  let usage = { inputTokens: 0, outputTokens: 0, iterations: 0, mock: false };

  if (isLlmMock()) {
    const mock = await mockAssistantTurn(text, toolSet);
    answer = mock.text;
    newApi = [{ role: 'assistant', content: answer }];
    usage = { inputTokens: 0, outputTokens: 0, iterations: 1, mock: true };
  } else {
    const client = getAnthropic();
    if (!client) throw new LlmNotConfiguredError();

    const runner = client.beta.messages.toolRunner({
      model: LLM_MODELS.chat,
      max_tokens: 2048,
      // Sabit talimat önbelleğe alınır; firma hafızası sık değiştiği için ayrı blok.
      system: [
        { type: 'text', text: ASSISTANT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        // Kişilik (İpek / Mert) kullanıcıya özel: önbellek dışı blokta.
        { type: 'text', text: `${personaBlock(persona, user?.firstName ?? null)}

${memoryBlock(memory, company?.name ?? null)}` },
      ],
      messages,
      tools: toolSet.tools,
      max_iterations: MAX_ITERATIONS,
    });

    let iterations = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let final: Anthropic.Beta.Messages.BetaMessage | null = null;
    for await (const message of runner) {
      iterations++;
      inputTokens += message.usage.input_tokens;
      outputTokens += message.usage.output_tokens;
      final = message;
    }
    if (!final) throw new Error('assistant_no_response');

    answer = textOf(final.content) || 'Bir sonuç üretemedim, soruyu biraz daha açar mısın?';
    // Döngü, araç sonuçlarını params.messages'a ekler; son asistan mesajı eklenmemişse biz ekleriz.
    const tail = runner.params.messages.slice(messages.length) as ApiMessage[];
    const last = tail[tail.length - 1];
    const finalParam: ApiMessage = { role: 'assistant', content: final.content as Anthropic.Beta.Messages.BetaContentBlockParam[] };
    newApi = last && last.role === 'assistant' && JSON.stringify(last.content) === JSON.stringify(finalParam.content) ? tail : [...tail, finalParam];
    usage = { inputTokens, outputTokens, iterations, mock: false };
  }

  const userView = { text, toolCalls: [], memorySuggestions: [] };
  const assistantView = { text: answer, toolCalls: toolSet.calls, memorySuggestions: toolSet.suggestions };

  const [userRow, assistantRow] = await prisma.$transaction(async (tx) => {
    const u = await tx.assistantMessage.create({
      data: { threadId, role: 'user', contentJson: JSON.stringify(userView), apiJson: JSON.stringify([userApi]) },
    });
    const a = await tx.assistantMessage.create({
      data: { threadId, role: 'assistant', contentJson: JSON.stringify(assistantView), apiJson: JSON.stringify(newApi) },
    });
    const thread = await tx.assistantThread.findUnique({ where: { id: threadId }, select: { title: true } });
    await tx.assistantThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date(), ...(thread && !thread.title ? { title: text.slice(0, TITLE_MAX) } : {}) },
    });
    return [u, a];
  });

  return { userMessage: toView(userRow), message: toView(assistantRow), usage };
}
