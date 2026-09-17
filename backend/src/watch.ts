// Akış izleme (Faz 2, Adım 1): "bu kalitede ürün çıkınca haber ver".
// Kural = ürün süzgecinin alt kümesi; eşleştirme buildProductWhere ile, yani
// arama ile birebir aynı mantık (eşanlamlılar, lif yüzdesi, sertifika).
import { z } from 'zod';
import { PRODUCT_TYPES, SUBTYPES, TYPE_LABELS } from './catalog';
import { prisma } from './db';
import { fiberLabel, certificateLabel } from './domain/glossary';
import { notify } from './notifications';
import { buildProductWhere, productQuerySchema } from './products';

export const MAX_RULES_PER_USER = 20;
// Bir kullanıcıya günde en fazla bu kadar izleme bildirimi (toplu ürün girişinde sel olmasın).
export const MAX_WATCH_NOTIFICATIONS_PER_DAY = 20;

// Kuralda saklanan süzgeç: productQuerySchema'nın izlemeye uygun alanları.
export const watchQuerySchema = productQuerySchema
  .pick({
    search: true,
    type: true,
    subtype: true,
    usage: true,
    gsmMin: true,
    gsmMax: true,
    widthMin: true,
    widthMax: true,
    fiber: true,
    fiberMinPercent: true,
    certificate: true,
    moqMax: true,
    leadTimeMax: true,
  })
  .strict()
  .refine((q) => Object.values(q).some((v) => v !== undefined && v !== ''), { message: 'empty_query' });

export type WatchQuery = z.infer<typeof watchQuerySchema>;

// Kural adı verilmediyse süzgeçten okunur bir ad: "Raschel · Elastanlı Tül · Elastan ≥ %10 · 200+ gr/m²".
export function describeWatchQuery(q: WatchQuery): string {
  const parts: string[] = [];
  if (q.type && (PRODUCT_TYPES as readonly string[]).includes(q.type)) parts.push(TYPE_LABELS[q.type]);
  if (q.subtype) {
    const label = Object.values(SUBTYPES).flat().find((s) => s.key === q.subtype)?.label;
    parts.push(label ?? q.subtype);
  }
  if (q.fiber) {
    const fibers = q.fiber.split(',').map(fiberLabel).join('/');
    parts.push(q.fiberMinPercent !== undefined ? `${fibers} ≥ %${q.fiberMinPercent}` : fibers);
  }
  if (q.gsmMin !== undefined && q.gsmMax !== undefined) parts.push(`${q.gsmMin}-${q.gsmMax} gr/m²`);
  else if (q.gsmMin !== undefined) parts.push(`${q.gsmMin}+ gr/m²`);
  else if (q.gsmMax !== undefined) parts.push(`en çok ${q.gsmMax} gr/m²`);
  if (q.widthMin !== undefined || q.widthMax !== undefined) parts.push(`en ${q.widthMin ?? ''}-${q.widthMax ?? ''} cm`);
  if (q.certificate) parts.push(q.certificate.split(',').map(certificateLabel).join('/'));
  if (q.moqMax !== undefined) parts.push(`MOQ ≤ ${q.moqMax}`);
  if (q.leadTimeMax !== undefined) parts.push(`termin ≤ ${q.leadTimeMax} gün`);
  if (q.search) parts.push(`"${q.search}"`);
  return parts.join(' · ').slice(0, 80) || 'İzleme';
}

export function parseRuleQuery(queryJson: string): WatchQuery | null {
  try {
    const parsed = watchQuerySchema.safeParse(JSON.parse(queryJson));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Yeni ürün (ya da ürünlü gönderi) için kuralları tarar. Ürünün kendi firmasının
// kullanıcılarına bildirim gitmez; aynı kural + ürün bir kez bildirilir.
export async function matchWatchRulesForProduct(productId: string): Promise<number> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, code: true, companyId: true, company: { select: { name: true } } },
  });
  if (!product) return 0;

  const rules = await prisma.watchRule.findMany({
    where: { active: true, user: { OR: [{ companyId: null }, { companyId: { not: product.companyId } }] } },
    select: { id: true, userId: true, name: true, queryJson: true },
  });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let sent = 0;
  for (const rule of rules) {
    const query = parseRuleQuery(rule.queryJson);
    if (!query) continue;
    const hit = await prisma.product.count({ where: { AND: [buildProductWhere(query), { id: product.id }] } });
    if (!hit) continue;
    try {
      await prisma.watchMatch.create({ data: { ruleId: rule.id, productId: product.id } });
    } catch {
      continue; // bu kural için bu ürün zaten bildirildi
    }
    const today = await prisma.notification.count({ where: { userId: rule.userId, kind: 'watch_match', createdAt: { gte: since } } });
    if (today >= MAX_WATCH_NOTIFICATIONS_PER_DAY) continue;
    await notify(rule.userId, {
      kind: 'watch_match',
      title: `İzlediğiniz kalitede yeni ürün: ${product.code}`,
      body: `${product.company.name} · ${rule.name}`,
      data: { productId: product.id, ruleId: rule.id },
    });
    await prisma.watchRule.update({ where: { id: rule.id }, data: { lastMatchedAt: new Date() } });
    sent++;
  }
  return sent;
}

// Yanıtı bekletmeden çalıştırmak için.
export function matchWatchRulesInBackground(productId: string) {
  void matchWatchRulesForProduct(productId).catch((err) => console.error('[watch] eşleştirme hatası:', err));
}
