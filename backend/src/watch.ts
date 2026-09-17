// Akış izleme (Faz 2, Adım 1): "bu kalitede ürün çıkınca haber ver".
// Kural = ürün süzgecinin alt kümesi; eşleştirme buildProductWhere ile, yani
// arama ile birebir aynı mantık (eşanlamlılar, lif yüzdesi, sertifika).
import { z } from 'zod';
import { PRODUCT_TYPES, SUBTYPES, TYPE_LABELS } from './catalog';
import { prisma } from './db';
import { fiberLabel, certificateLabel } from './domain/glossary';
import { notify } from './notifications';
import { buildProductWhere, productQuerySchema } from './products';
import { YARN_END_USES, YARN_FAMILIES, YARN_FILAMENT_TYPES, YARN_PRODUCT_TYPE, YARN_SPINNINGS, buildYarnWhere, yarnQuerySchema } from './yarns';

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

// İplik izleme (Faz 2, Adım 6): kural JSON'unda kind = "iplik"; süzgeç iplik dizini aramasıyla aynı.
export const yarnWatchQuerySchema = yarnQuerySchema
  .pick({ search: true, family: true, count: true, countMin: true, countMax: true, countUnit: true, ply: true, filaments: true, filamentType: true, spinning: true, combing: true, luster: true, endUse: true, colorState: true, fiber: true, certificate: true, sellerRole: true })
  .extend({ kind: z.literal('iplik') })
  .strict()
  .refine((q) => Object.entries(q).some(([k, v]) => k !== 'kind' && v !== undefined && v !== ''), { message: 'empty_query' });

export type YarnWatchQuery = z.infer<typeof yarnWatchQuerySchema>;
export type AnyWatchQuery = WatchQuery | YarnWatchQuery;

export function isYarnWatchQuery(q: AnyWatchQuery): q is YarnWatchQuery {
  return (q as { kind?: string }).kind === 'iplik';
}

// İstemciden gelen ham süzgeç: kind = "iplik" ise iplik şeması, değilse kumaş şeması.
export function safeParseWatchInput(raw: unknown) {
  const isYarn = typeof raw === 'object' && raw !== null && (raw as { kind?: unknown }).kind === 'iplik';
  return isYarn ? yarnWatchQuerySchema.safeParse(raw) : watchQuerySchema.safeParse(raw);
}

const labelsOf = (raw: string | undefined, list: readonly { key: string; label: string }[]) =>
  (raw ?? '').split(',').map((k) => list.find((o) => o.key === k)?.label.split(' (')[0].split(' /')[0]).filter(Boolean).join('/');

export function describeYarnWatchQuery(q: YarnWatchQuery): string {
  const parts: string[] = ['İplik'];
  const unit = q.countUnit ? { ne: 'Ne', nm: 'Nm', denye: 'denye', dtex: 'dtex', tex: 'tex' }[q.countUnit] : '';
  if (q.count !== undefined) parts.push(`${q.count}${q.filaments ? `/${q.filaments}` : ''} ${unit}`.trim());
  else if (q.countMin !== undefined || q.countMax !== undefined) parts.push(`${q.countMin ?? ''}-${q.countMax ?? ''} ${unit}`.trim());
  else if (q.filaments) parts.push(`${q.filaments} filament`);
  if (q.ply) parts.push(`${q.ply} kat`);
  if (q.family) parts.push(labelsOf(q.family, YARN_FAMILIES));
  if (q.filamentType) parts.push(q.filamentType.toUpperCase().replace(/,/g, '/'));
  if (q.combing) parts.push(q.combing === 'penye' ? 'Penye' : 'Karde');
  if (q.spinning) parts.push(labelsOf(q.spinning, YARN_SPINNINGS));
  if (q.endUse) parts.push(labelsOf(q.endUse, YARN_END_USES));
  if (q.fiber) parts.push(q.fiber.split(',').map(fiberLabel).join('/'));
  if (q.certificate) parts.push(q.certificate.split(',').map(certificateLabel).join('/'));
  if (q.search) parts.push(`"${q.search}"`);
  void YARN_FILAMENT_TYPES;
  return parts.filter(Boolean).join(' · ').slice(0, 80);
}

export function describeAnyWatchQuery(q: AnyWatchQuery) {
  return isYarnWatchQuery(q) ? describeYarnWatchQuery(q) : describeWatchQuery(q);
}

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

export function parseRuleQuery(queryJson: string): AnyWatchQuery | null {
  try {
    const parsed = safeParseWatchInput(JSON.parse(queryJson));
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
    select: { id: true, code: true, type: true, companyId: true, company: { select: { name: true } } },
  });
  if (!product) return 0;
  const isYarn = product.type === YARN_PRODUCT_TYPE;

  const rules = await prisma.watchRule.findMany({
    where: { active: true, user: { OR: [{ companyId: null }, { companyId: { not: product.companyId } }] } },
    select: { id: true, userId: true, name: true, queryJson: true },
  });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let sent = 0;
  for (const rule of rules) {
    const query = parseRuleQuery(rule.queryJson);
    // Kumaş kuralı ipliğe, iplik kuralı kumaşa bakmaz.
    if (!query || isYarnWatchQuery(query) !== isYarn) continue;
    const where = isYarnWatchQuery(query) ? buildYarnWhere(query) : buildProductWhere(query);
    const hit = await prisma.product.count({ where: { AND: [where, { id: product.id }] } });
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
      title: isYarn ? `İzlediğiniz özellikte yeni iplik: ${product.code}` : `İzlediğiniz kalitede yeni ürün: ${product.code}`,
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
