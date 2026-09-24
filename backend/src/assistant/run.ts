// Asistan turu: geçmişi kur, araçlarla modeli çalıştır (SDK araç döngüsü),
// sonucu ve ham API mesajlarını sohbete yaz. ANTHROPIC_MOCK=1 iken model yerine
// mock.ts çalışır (uçtan uca test anahtarsız).
import type Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../db';
import { LLM_MODELS, LlmNotConfiguredError, getAnthropic, isLlmMock } from '../llm';
import { buildBuyerTools, buyerSystemPrompt } from './buyer';
import { readMemory } from './memory';
import { fxContextLine, getRates } from '../fx';
import { mockAssistantTurn } from './mock';
import { identityBlock } from './persona';
import { ASSISTANT_SYSTEM_PROMPT, memoryBlock } from './system';
import { normalizeLang, t, tx, type Lang } from '../i18n';
import { buildTools, type MemorySuggestion, type ToolCallRecord, type WatchSuggestion } from './tools';

type ApiMessage = Anthropic.Beta.Messages.BetaMessageParam;

// Ekrana giden mesaj biçimi (contentJson).
export interface AssistantMessageView {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolCalls: ToolCallRecord[];
  memorySuggestions: MemorySuggestion[];
  watchSuggestions: WatchSuggestion[];
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

export function toView(row: { id: string; role: string; contentJson: string; createdAt: Date }, lang?: Lang): AssistantMessageView {
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
    // Kart başlığı/özeti Türkçe kaydedilir; gösterirken arayüz diline çevrilir.
    toolCalls: (parsed.toolCalls ?? []).map((c) => ({ ...c, title: tx(lang, c.title), summary: tx(lang, c.summary) })),
    memorySuggestions: (parsed.memorySuggestions ?? []).map((m) => ({ ...m, label: tx(lang, m.label), reason: tx(lang, m.reason) })),
    watchSuggestions: (parsed.watchSuggestions ?? []).map((w) => ({ ...w, reason: tx(lang, w.reason) })),
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

// İngilizce arayüzde model İngilizce yanıt verir (talimatlar Türkçe kalır; önbellek bozulmaz).
export function languageLine(lang: Lang) {
  return lang === 'en'
    ? '\n\nLANGUAGE: The user is using the English interface. Reply in English (clear, natural, professional textile-trade English: fabric, yarn, knitted, woven, weight in gsm, width, gauge, sample, quote, open request). Keep product codes, company names and numbers exactly as they are.'
    : '';
}

export async function runAssistantTurn(params: { threadId: string; userId: string; companyId: string | null; text: string; lang?: Lang }): Promise<TurnResult> {
  const { threadId, userId, companyId } = params;
  const text = params.text.trim();

  // Alıcı kipi (Faz 2 Adım 3): iplik başka bir firmanın asistanıyla. Bu kipte firma
  // hafızası, kişilik ve sahibin araçları YOK; yalnızca o firmanın açık kataloğu.
  const threadRow = await prisma.assistantThread.findUnique({ where: { id: threadId }, select: { channel: true, targetCompanyId: true } });
  const sellerCompany =
    threadRow?.channel === 'buyer' && threadRow.targetCompanyId
      ? await prisma.company.findUnique({
          where: { id: threadRow.targetCompanyId },
          select: { id: true, name: true, about: true, companyType: true, city: true, mainMarkets: true, verification: true },
        })
      : null;
  if (threadRow?.channel === 'buyer' && !sellerCompany) throw new Error('seller_company_not_found');

  const [rows, memory, company, user, fx] = await Promise.all([
    prisma.assistantMessage.findMany({ where: { threadId }, orderBy: { createdAt: 'asc' }, select: { apiJson: true } }),
    companyId && !sellerCompany ? readMemory(companyId) : Promise.resolve([]),
    companyId ? prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }) : Promise.resolve(null),
    prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, language: true } }),
    getRates().catch(() => null),
  ]);
  // Yanıt dili: istek dili, yoksa kullanıcının kayıtlı dili (WhatsApp, devredilen soru).
  const lang: Lang = params.lang ?? normalizeLang(user?.language);
  const history = historyFromRows(rows);
  const userApi: ApiMessage = { role: 'user', content: text };
  const messages: ApiMessage[] = [...history, userApi];

  const toolSet = sellerCompany
    ? buildBuyerTools({ askerId: userId, threadId, sellerCompanyId: sellerCompany.id, sellerName: sellerCompany.name, lang })
    : buildTools({ userId, companyId, lang });

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
      system: sellerCompany
        ? [{ type: 'text', text: `${buyerSystemPrompt(sellerCompany, user?.firstName ?? null)}${languageLine(lang)}` }]
        : [
        { type: 'text', text: ASSISTANT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        // Kimlik + kullanıcı adı kullanıcıya özel: önbellek dışı blokta.
        { type: 'text', text: `${identityBlock(user?.firstName ?? null)}

${memoryBlock(memory, company?.name ?? null)}

${fxContextLine(fx)}${languageLine(lang)}` },
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

    answer = textOf(final.content) || t(lang, 'Bir sonuç üretemedim, soruyu biraz daha açar mısın?');
    // Döngü, araç sonuçlarını params.messages'a ekler; son asistan mesajı eklenmemişse biz ekleriz.
    const tail = runner.params.messages.slice(messages.length) as ApiMessage[];
    const last = tail[tail.length - 1];
    const finalParam: ApiMessage = { role: 'assistant', content: final.content as Anthropic.Beta.Messages.BetaContentBlockParam[] };
    newApi = last && last.role === 'assistant' && JSON.stringify(last.content) === JSON.stringify(finalParam.content) ? tail : [...tail, finalParam];
    usage = { inputTokens, outputTokens, iterations, mock: false };
  }

  const userView = { text, toolCalls: [], memorySuggestions: [], watchSuggestions: [] };
  const assistantView = { text: answer, toolCalls: toolSet.calls, memorySuggestions: toolSet.suggestions, watchSuggestions: toolSet.watchSuggestions };

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

  return { userMessage: toView(userRow, lang), message: toView(assistantRow, lang), usage };
}
