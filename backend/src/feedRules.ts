// Akış düzeni (Fırat 2026-09-23): herkese açık akış kalır ama sınırlanır, böylece aynı ilanı
// her gün tekrar atan firmalar genel akışı bozamaz.
//
// 1. Herkese açık paylaşım yalnızca DOĞRULANMIŞ firmalar için (açık talep kartları hariç:
//    alım talebi sektöre açık olmalı ve kendi akışı var).
// 2. Firma başına 24 saatte en çok PUBLIC_PER_DAY herkese açık gönderi.
// 3. Aynı ürün 7 gün içinde bir kez herkese açık paylaşılır.
// 4. Şikâyet: bir gönderi REPORT_HIDE_POST farklı firmadan şikâyet alınca gizlenir; bir firmanın
//    gönderileri 30 günde REPORT_BLOCK_COMPANY farklı firmadan şikâyet alınca firma
//    BLOCK_DAYS gün herkese açık paylaşamaz ve yöneticiye bildirim gider.
// 5. Kullanıcı bir firmayı akışından gizleyebilir (FeedMute).
// 6. "Sektör" sekmesinde "Benim için" süzgeci: firma türüne göre ilgili tedarik zinciri.
import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { notifyMany } from './notifications';
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import { getAnthropic, isLlmMock } from './llm';

export const PUBLIC_PER_DAY = 2;
export const SAME_PRODUCT_DAYS = 7;
export const REPORT_HIDE_POST = 3;
export const REPORT_BLOCK_COMPANY = 5;
export const BLOCK_DAYS = 14;
const DAY = 86_400_000;

export const REPORT_REASONS = [
  { key: 'tekrar', label: 'Sürekli aynı paylaşım (tekrar)' },
  { key: 'alakasiz', label: 'Tekstille ilgisiz' },
  { key: 'yaniltici', label: 'Yanıltıcı / sahte bilgi' },
  { key: 'uygunsuz', label: 'Uygunsuz içerik' },
  { key: 'diger', label: 'Diğer' },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]['key'];

export type PublicPostRule = {
  allowed: boolean;
  // İstemci "Herkese açık" seçeneğini kilitli gösterir ve nedenini yazar.
  reason: null | 'no_company' | 'not_verified' | 'blocked' | 'daily_limit' | 'same_product';
  message: string | null;
  usedToday: number;
  limitPerDay: number;
  blockedUntil: string | null;
  nextAllowedAt: string | null;
};

const MESSAGES: Record<NonNullable<PublicPostRule['reason']>, string> = {
  no_company: 'Herkese açık paylaşım için bir firmaya bağlı olmanız gerekir.',
  not_verified: 'Herkese açık paylaşım yalnızca doğrulanmış firmalara açık. Firma doğrulama başvurusu yapabilirsiniz; bu arada bağlantılarınızla paylaşabilirsiniz.',
  blocked: 'Firmanızın paylaşımları çok sayıda şikâyet aldığı için herkese açık paylaşım geçici olarak kapalı. Bağlantılarınızla paylaşmaya devam edebilirsiniz.',
  daily_limit: `Firmanız bugün ${PUBLIC_PER_DAY} herkese açık paylaşım hakkını kullandı. Bağlantılarınızla paylaşabilir ya da yarın tekrar deneyebilirsiniz.`,
  same_product: `Bu ürün son ${SAME_PRODUCT_DAYS} gün içinde herkese açık paylaşıldı. Aynı ürünü bağlantılarınızla paylaşabilirsiniz.`,
};

// Herkese açık paylaşım hakkı. productId verilirse aynı ürün kuralı da bakılır;
// excludePostId düzenlemede gönderinin kendisini saymamak için.
export async function publicPostRule(user: { id: string; companyId: string | null; isAdmin?: boolean }, opts: { productId?: string | null; excludePostId?: string } = {}): Promise<PublicPostRule> {
  const base = { usedToday: 0, limitPerDay: PUBLIC_PER_DAY, blockedUntil: null, nextAllowedAt: null };
  const deny = (reason: NonNullable<PublicPostRule['reason']>, extra: Partial<PublicPostRule> = {}): PublicPostRule => ({ ...base, allowed: false, reason, message: MESSAGES[reason], ...extra });
  if (!user.companyId) return user.isAdmin ? { ...base, allowed: true, reason: null, message: null } : deny('no_company');
  const company = await prisma.company.findUnique({ where: { id: user.companyId }, select: { verification: true, publicPostBlockedUntil: true } });
  if (!company) return deny('no_company');
  const now = Date.now();
  const since = new Date(now - DAY);
  const recent = await prisma.post.findMany({
    where: { visibility: 'public', tenderId: null, createdAt: { gte: since }, author: { companyId: user.companyId }, ...(opts.excludePostId ? { id: { not: opts.excludePostId } } : {}) },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const counts = { ...base, usedToday: recent.length };
  if (user.isAdmin) return { ...counts, allowed: true, reason: null, message: null };
  if (company.verification !== 'dogrulanmis') return deny('not_verified', counts);
  if (company.publicPostBlockedUntil && company.publicPostBlockedUntil.getTime() > now) {
    return deny('blocked', { ...counts, blockedUntil: company.publicPostBlockedUntil.toISOString() });
  }
  if (recent.length >= PUBLIC_PER_DAY) {
    return deny('daily_limit', { ...counts, nextAllowedAt: new Date(recent[0].createdAt.getTime() + DAY).toISOString() });
  }
  if (opts.productId) {
    const same = await prisma.post.findFirst({
      where: { visibility: 'public', productId: opts.productId, createdAt: { gte: new Date(now - SAME_PRODUCT_DAYS * DAY) }, ...(opts.excludePostId ? { id: { not: opts.excludePostId } } : {}) },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    if (same) return deny('same_product', { ...counts, nextAllowedAt: new Date(same.createdAt.getTime() + SAME_PRODUCT_DAYS * DAY).toISOString() });
  }
  return { ...counts, allowed: true, reason: null, message: null };
}

// "Benim için": izleyicinin firma türüne göre akışta öne çıkacak yazar firma türleri
// (tedarik zincirinin bir üstü ve bir altı). Tanımsız tür → süzgeç yok.
export const RELEVANT_AUTHOR_TYPES: Record<string, string[]> = {
  konfeksiyon: ['kumas_uretici', 'aksesuar', 'baski', 'boyahane', 'toptanci'],
  kumas_uretici: ['iplik', 'boyahane', 'baski', 'konfeksiyon', 'toptanci'],
  iplik: ['kumas_uretici', 'toptanci'],
  boyahane: ['kumas_uretici', 'konfeksiyon', 'baski'],
  aksesuar: ['konfeksiyon', 'toptanci'],
  baski: ['konfeksiyon', 'kumas_uretici', 'boyahane'],
  toptanci: ['kumas_uretici', 'iplik', 'aksesuar', 'konfeksiyon'],
};

// Akış where parçaları: gizlenen gönderi/firma dışarıda, "Benim için" süzgeci.
export async function feedFilters(me: { id: string; companyId: string | null }, connectedIds: string[], opts: { forMe: boolean }): Promise<Prisma.PostWhereInput[]> {
  const out: Prisma.PostWhereInput[] = [];
  // Şikâyetle gizlenen gönderiyi yalnızca yazarı görür.
  out.push({ OR: [{ hiddenAt: null }, { authorId: me.id }] });
  const mutes = await prisma.feedMute.findMany({ where: { userId: me.id }, select: { companyId: true } });
  if (mutes.length) out.push({ NOT: { author: { companyId: { in: mutes.map((m) => m.companyId) } } } });
  if (opts.forMe && me.companyId) {
    const mine = await prisma.company.findUnique({ where: { id: me.companyId }, select: { companyType: true } });
    const types = mine ? RELEVANT_AUTHOR_TYPES[mine.companyType] : undefined;
    if (types) {
      out.push({
        OR: [
          { authorId: { in: [me.id, ...connectedIds] } },
          { tenderId: { not: null } }, // alım talepleri herkesi ilgilendirebilir
          { author: { company: { companyType: { in: [...types, ''] } } } },
          { author: { companyId: null } },
        ],
      });
    }
  }
  return out;
}

// Şikâyet kaydı + eşikler. Dönen değer istemciye ne olduğunu söyler.
export async function reportPost(reporter: { id: string; companyId: string | null }, postId: string, reason: ReportReason, note: string) {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true, hiddenAt: true, author: { select: { companyId: true } } } });
  if (!post) return { status: 'not_found' as const };
  if (post.authorId === reporter.id || (reporter.companyId && post.author.companyId === reporter.companyId)) return { status: 'own_post' as const };
  const authorCompanyId = post.author.companyId;
  try {
    await prisma.postReport.create({ data: { postId, reporterId: reporter.id, reporterCompanyId: reporter.companyId, authorCompanyId, reason, note: note.slice(0, 500) } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return { status: 'already' as const };
    throw err;
  }
  // Farklı firma sayısı (firmasız kullanıcı kendi başına bir "firma" sayılır).
  const distinct = (rows: { reporterCompanyId: string | null; reporterId: string }[]) => new Set(rows.map((r) => r.reporterCompanyId ?? `u:${r.reporterId}`)).size;
  const postReports = await prisma.postReport.findMany({ where: { postId, resolvedAt: null }, select: { reporterCompanyId: true, reporterId: true } });
  let hidden = !!post.hiddenAt;
  if (!hidden && distinct(postReports) >= REPORT_HIDE_POST) {
    await prisma.post.update({ where: { id: postId }, data: { hiddenAt: new Date() } });
    hidden = true;
  }
  let companyBlocked = false;
  if (authorCompanyId) {
    const companyReports = await prisma.postReport.findMany({
      where: { authorCompanyId, resolvedAt: null, createdAt: { gte: new Date(Date.now() - 30 * DAY) } },
      select: { reporterCompanyId: true, reporterId: true },
    });
    const company = await prisma.company.findUnique({ where: { id: authorCompanyId }, select: { name: true, publicPostBlockedUntil: true } });
    const alreadyBlocked = !!company?.publicPostBlockedUntil && company.publicPostBlockedUntil.getTime() > Date.now();
    if (company && !alreadyBlocked && distinct(companyReports) >= REPORT_BLOCK_COMPANY) {
      await prisma.company.update({ where: { id: authorCompanyId }, data: { publicPostBlockedUntil: new Date(Date.now() + BLOCK_DAYS * DAY) } });
      companyBlocked = true;
      const admins = (await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } })).map((u) => u.id);
      await notifyMany(admins, {
        kind: 'feed_moderation',
        title: `Akış: ${company.name} herkese açık paylaşımı ${BLOCK_DAYS} gün kapandı`,
        body: `${distinct(companyReports)} farklı firmadan şikâyet. Yönetim > Akış şikâyetleri'nden inceleyebilirsiniz.`,
        data: { companyId: authorCompanyId, postId },
      });
    }
  }
  if (hidden && !post.hiddenAt) {
    const admins = (await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } })).map((u) => u.id);
    await notifyMany(admins, { kind: 'feed_moderation', title: 'Akış: bir gönderi şikâyetle gizlendi', body: 'Yönetim > Akış şikâyetleri', data: { postId } });
  }
  return { status: 'ok' as const, hidden, companyBlocked };
}

// İçerik uygunluğu: herkese açık akış tekstil platformu; kedi/köpek, siyaset, genel reklam gibi
// sektörle ilgisiz paylaşımlar genele çıkamaz (bağlantılarla paylaşmak serbest). Hızlı ve ucuz
// model (Haiku) metni ve varsa fotoğrafı değerlendirir. Model yoksa/hata verirse paylaşım
// engellenmez (şikâyet yolu yine açık).
const relevanceSchema = z.object({
  textile: z.boolean().describe('Paylaşım tekstil/hazır giyim sektörüyle ilgili mi'),
  reason: z.string().describe('Kısa Türkçe gerekçe (tek cümle)'),
});
const RELEVANCE_SYSTEM = `Bir B2B tekstil platformunun herkese açık akışı için içerik denetçisisin.
İlgili sayılır: kumaş, iplik, elyaf, aksesuar (düğme, fermuar, çıtçıt, etiket), konfeksiyon/hazır giyim, ev tekstili, boya/terbiye, baskı/nakış, tekstil makineleri, numune, fuar, sertifika, fabrika/üretim, sektör haberi, ihracat, iş ilanı, firma duyurusu, bayram/kutlama mesajı veren firma paylaşımı.
İlgisiz: evcil hayvan, yemek, manzara, siyaset, spor, kişisel fotoğraf, tekstille ilgisiz ürün satışı, şaka/mizah.
Emin değilsen ilgili say (textile=true). Yalnızca açıkça ilgisizse false.`;

let lastRelevanceError: string | null = null;
export type RelevanceResult = { textile: boolean; reason: string; checked: boolean };

export async function checkTextileRelevance(input: { body: string; imageDataUrl?: string | null; productAttached?: boolean }): Promise<RelevanceResult> {
  if (input.productAttached) return { textile: true, reason: 'Ürün iliştirilmiş', checked: false };
  if (isLlmMock()) return { textile: !/\b(kedi|köpek|kedim|köpeğim)\b/i.test(input.body), reason: 'mock', checked: true };
  const client = getAnthropic();
  if (!client) return { textile: true, reason: 'model yok', checked: false };
  const content: Anthropic.Messages.ContentBlockParam[] = [];
  const m = input.imageDataUrl?.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
  if (m) content.push({ type: 'image', source: { type: 'base64', media_type: m[1] as 'image/jpeg', data: m[2] } });
  content.push({ type: 'text', text: `Paylaşım metni: """${input.body.slice(0, 2000) || '(metin yok)'}"""` });
  try {
    const msg = await client.messages.parse({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: RELEVANCE_SYSTEM,
      output_config: { format: zodOutputFormat(relevanceSchema) },
      messages: [{ role: 'user', content }],
    });
    const out = msg.parsed_output;
    if (!out) return { textile: true, reason: 'yanıt yok', checked: false };
    return { ...out, checked: true };
  } catch (err) {
    console.warn('[feedRules] içerik denetimi yapılamadı:', (err as Error).message);
    lastRelevanceError = (err as Error).message.slice(0, 200);
    return { textile: true, reason: 'hata', checked: false };
  }
}

export const NOT_TEXTILE_MESSAGE =
  'Bu paylaşım tekstil sektörüyle ilgili görünmüyor. Herkese açık akış yalnızca sektörel paylaşımlara açık; bu gönderiyi bağlantılarınızla paylaşabilirsiniz.';

// /api/health için: içerik denetimi gerçekten çalışıyor mu (6 saatte bir, sabit bir kedi cümlesiyle).
let selfTest: { at: number; ok: boolean; detail: string } | null = null;
export async function relevanceStatus() {
  if (!selfTest || Date.now() - selfTest.at > 6 * 3_600_000) {
    const r = await checkTextileRelevance({ body: 'Kedimiz bugün 3 yaşında oldu, doğum günü pastası yaptık.' });
    selfTest = { at: Date.now(), ok: r.checked && !r.textile, detail: r.checked ? r.reason : `denetim çalışmadı (${lastRelevanceError ?? r.reason})` };
  }
  return { working: selfTest.ok, detail: selfTest.detail, checkedAt: new Date(selfTest.at).toISOString() };
}
