// Asistan raporu (Fırat 2026-09-23): "Asistanınız bu hafta N soruya cevap verdi".
// - GET /api/assistant/report: son 7 (ya da 30) günün özeti, uygulamadaki rapor ekranı için.
// - Haftalık bildirim: her pazartesi 09:00'dan sonra (İstanbul) firma çalışanlarına bir kez.
//   Sunucu içinde saatlik kontrol; AssistantDigest (companyId, weekKey) iki kez gönderimi önler.
//   Hiç soru gelmemiş firmaya bildirim gitmez (boş rapor sıkar).
import { prisma } from './db';
import { notifyMany } from './notifications';

const DAY = 86_400_000;

export type AssistantReport = {
  days: number;
  since: string;
  questions: number; // asistanınıza sorulan soru (alıcı mesajı)
  conversations: number; // alıcı sohbeti sayısı
  askerCompanies: number; // soran farklı firma
  forwarded: number; // asistanın size ilettiği (cevaplayamadığı) soru
  forwardedOpen: number; // bunlardan hâlâ cevap bekleyen
  answeredByAssistant: number; // asistanın kendisinin cevapladığı (sorular - iletilenler)
  askers: { companyName: string; questions: number; lastAt: string }[];
  topProducts: { code: string; mentions: number }[];
};

export async function assistantReport(companyId: string, days = 7): Promise<AssistantReport> {
  const since = new Date(Date.now() - days * DAY);
  const threads = await prisma.assistantThread.findMany({
    where: { channel: 'buyer', targetCompanyId: companyId },
    select: { id: true, companyId: true, company: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } },
  });
  const ids = threads.map((t) => t.id);
  const msgs = ids.length
    ? await prisma.assistantMessage.findMany({ where: { threadId: { in: ids }, role: 'user', createdAt: { gte: since } }, select: { threadId: true, createdAt: true, contentJson: true } })
    : [];
  const byThread = new Map(threads.map((t) => [t.id, t]));
  const askerMap = new Map<string, { companyName: string; questions: number; lastAt: Date }>();
  const activeThreads = new Set<string>();
  for (const m of msgs) {
    activeThreads.add(m.threadId);
    const t = byThread.get(m.threadId)!;
    const key = t.companyId ?? `u:${m.threadId}`;
    const name = t.company?.name ?? [t.user.firstName, t.user.lastName].filter(Boolean).join(' ') ?? 'Bireysel kullanıcı';
    const cur = askerMap.get(key) ?? { companyName: name, questions: 0, lastAt: m.createdAt };
    cur.questions += 1;
    if (m.createdAt > cur.lastAt) cur.lastAt = m.createdAt;
    askerMap.set(key, cur);
  }
  const [forwarded, forwardedOpen] = await Promise.all([
    prisma.companyQuestion.count({ where: { companyId, createdAt: { gte: since } } }),
    prisma.companyQuestion.count({ where: { companyId, status: 'open' } }),
  ]);
  // En çok sorulan ürünler: soru metninde geçen ürün kodları.
  const products = await prisma.product.findMany({ where: { companyId }, select: { code: true } });
  const counts = new Map<string, number>();
  for (const m of msgs) {
    let text = '';
    try {
      text = String(JSON.parse(m.contentJson).text ?? '');
    } catch {
      text = m.contentJson;
    }
    const upper = text.toLocaleUpperCase('tr');
    for (const p of products) if (p.code && upper.includes(p.code.toLocaleUpperCase('tr'))) counts.set(p.code, (counts.get(p.code) ?? 0) + 1);
  }
  return {
    days,
    since: since.toISOString(),
    questions: msgs.length,
    conversations: activeThreads.size,
    askerCompanies: askerMap.size,
    forwarded,
    forwardedOpen,
    answeredByAssistant: Math.max(0, msgs.length - forwarded),
    askers: [...askerMap.values()]
      .sort((a, b) => b.questions - a.questions)
      .slice(0, 10)
      .map((a) => ({ companyName: a.companyName, questions: a.questions, lastAt: a.lastAt.toISOString() })),
    topProducts: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([code, mentions]) => ({ code, mentions })),
  };
}

// İstanbul saatine göre bu haftanın pazartesi tarihi ve şu an pazartesi 09:00'ı geçti mi.
export function istanbulWeek(now = new Date()) {
  const tr = new Date(now.getTime() + 3 * 3_600_000); // UTC+3, yaz saati yok
  const dow = (tr.getUTCDay() + 6) % 7; // pazartesi = 0
  const monday = new Date(Date.UTC(tr.getUTCFullYear(), tr.getUTCMonth(), tr.getUTCDate() - dow));
  const weekKey = monday.toISOString().slice(0, 10);
  const due = dow > 0 || tr.getUTCHours() >= 9;
  return { weekKey, due };
}

export function digestText(r: AssistantReport) {
  const parts = [`${r.askerCompanies} firmadan ${r.questions} soru geldi`];
  if (r.answeredByAssistant) parts.push(`${r.answeredByAssistant} tanesini asistanınız kendisi cevapladı`);
  if (r.forwardedOpen) parts.push(`${r.forwardedOpen} soru sizin cevabınızı bekliyor`);
  return parts.join(', ') + '.';
}

export async function sendWeeklyDigests(now = new Date()) {
  const { weekKey, due } = istanbulWeek(now);
  if (!due) return { sent: 0, weekKey };
  // Yalnızca geçen hafta alıcı sohbeti olan firmalar.
  const active = await prisma.assistantThread.findMany({
    where: { channel: 'buyer', targetCompanyId: { not: null }, messages: { some: { role: 'user', createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } } },
    select: { targetCompanyId: true },
    distinct: ['targetCompanyId'],
  });
  let sent = 0;
  for (const { targetCompanyId } of active) {
    const companyId = targetCompanyId!;
    const exists = await prisma.assistantDigest.findUnique({ where: { companyId_weekKey: { companyId, weekKey } } });
    if (exists) continue;
    const report = await assistantReport(companyId, 7);
    if (!report.questions) continue;
    // Önce kayıt (iki sunucu aynı anda çalışsa da tek bildirim): benzersizlik ihlali = başkası gönderdi.
    try {
      await prisma.assistantDigest.create({ data: { companyId, weekKey, statsJson: JSON.stringify(report) } });
    } catch {
      continue;
    }
    const staff = await prisma.user.findMany({ where: { companyId }, select: { id: true } });
    await notifyMany(
      staff.map((u) => u.id),
      { kind: 'assistant_digest', title: `Asistanınız bu hafta ${report.questions} soruyu karşıladı`, body: digestText(report), data: { companyId } }
    );
    sent++;
  }
  return { sent, weekKey };
}

export function startDigestScheduler() {
  const tick = () => sendWeeklyDigests().catch((err) => console.error('[digest]', err));
  setTimeout(tick, 60_000);
  setInterval(tick, 3_600_000);
}
