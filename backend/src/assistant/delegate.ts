// Asistandan asistana (Fırat 2026-09-23): kullanıcı KENDİ asistanına sorar, asistanı uygun
// firmaların asistanlarına aynı soruyu sorar ve cevapları karşılaştırır. Alıcının firma
// sayfalarını tek tek gezmesine gerek kalmaz.
//
// Güvenlik ve düzen:
// - Karşı taraf SATICI KİPİNDE cevap verir (buyer.ts): elinde yalnızca yayınlanmış katalog
//   (fiyatsız), SSS ve makine parkı var; fiyat vermez, bilmediğini firmaya iletir.
// - Her konuşma gerçek bir "alıcı" sohbeti olarak kaydedilir: kullanıcı asistan geçmişinde
//   görür; satıcıya iletilen sorular firmanın "Gelen sorular" kutusuna düşer.
// - Alıcı sohbetlerindeki günlük soru sınırı (MAX_BUYER_QUESTIONS_PER_DAY) burada da sayılır;
//   tek seferde en çok MAX_TARGETS firma.
import { prisma } from '../db';
import { MAX_BUYER_QUESTIONS_PER_DAY } from './buyer';

export const MAX_TARGETS = 5;
// Aynı firmayla son bu kadar gün içindeki alıcı sohbeti sürdürülür (bağlam korunur).
const REUSE_THREAD_DAYS = 7;

export type DelegateAnswer = { companyId: string; companyName: string; threadId: string; answer: string; forwarded: boolean; error?: string };

export async function askCompanyAssistants(
  ctx: { userId: string; companyId: string | null },
  companyIds: string[],
  question: string
): Promise<{ answers: DelegateAnswer[]; skipped: { companyId: string; reason: string }[]; remainingToday: number }> {
  const skipped: { companyId: string; reason: string }[] = [];
  const unique = [...new Set(companyIds)].filter((id) => {
    if (id === ctx.companyId) {
      skipped.push({ companyId: id, reason: 'kendi firmanız' });
      return false;
    }
    return true;
  });
  const companies = await prisma.company.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  const found = new Set(companies.map((c) => c.id));
  unique.filter((id) => !found.has(id)).forEach((id) => skipped.push({ companyId: id, reason: 'firma bulunamadı' }));

  const since = new Date(Date.now() - 86_400_000);
  const askedToday = await prisma.assistantMessage.count({ where: { role: 'user', createdAt: { gte: since }, thread: { userId: ctx.userId, channel: 'buyer' } } });
  const budget = Math.max(0, MAX_BUYER_QUESTIONS_PER_DAY - askedToday);
  const targets = companies.slice(0, Math.min(MAX_TARGETS, budget));
  companies.slice(targets.length).forEach((c) => skipped.push({ companyId: c.id, reason: budget <= targets.length ? 'günlük soru sınırı' : `tek seferde en çok ${MAX_TARGETS} firma` }));

  // runAssistantTurn → buildTools → bu dosya: döngüsel içe aktarmayı önlemek için geç yükleme.
  const { runAssistantTurn } = await import('./run');

  const answers = await Promise.all(
    targets.map(async (c): Promise<DelegateAnswer> => {
      const recent = await prisma.assistantThread.findFirst({
        where: { userId: ctx.userId, channel: 'buyer', targetCompanyId: c.id, updatedAt: { gte: new Date(Date.now() - REUSE_THREAD_DAYS * 86_400_000) } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      });
      const thread =
        recent ??
        (await prisma.assistantThread.create({
          data: { userId: ctx.userId, companyId: ctx.companyId, channel: 'buyer', targetCompanyId: c.id, title: question.slice(0, 60) },
          select: { id: true },
        }));
      try {
        const turn = await runAssistantTurn({ threadId: thread.id, userId: ctx.userId, companyId: ctx.companyId, text: question });
        const forwarded = turn.message.toolCalls.some((t) => t.name === 'soruyu_ilet');
        return { companyId: c.id, companyName: c.name, threadId: thread.id, answer: turn.message.text, forwarded };
      } catch (err) {
        console.error('[delegate]', c.id, (err as Error).message);
        return { companyId: c.id, companyName: c.name, threadId: thread.id, answer: '', forwarded: false, error: 'Bu firmanın asistanına ulaşılamadı' };
      }
    })
  );
  return { answers, skipped, remainingToday: Math.max(0, budget - targets.length) };
}
