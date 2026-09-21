import crypto from 'crypto';
import { prisma } from './db';
import { PRODUCT_SELECT, toProductRow } from './products';
import { extractFabricLook, splitDataUrl } from './skills/fabricLook/run';
import { describeLook, parseLook, type FabricLook } from './skills/fabricLook/schema';
import { scoreLooks } from './skills/fabricLook/score';
import { YARN_PRODUCT_TYPE } from './yarns';

// Benzer kumaş arama (Faz 3, Adım 3). Görünüm kartı ürünün KAPAK fotoğrafından çıkar;
// benzerlik deterministik ve açıklanabilir (skills/fabricLook/score.ts).
// Dürüstlük sınırı: fotoğraftan gramaj ve lif okunmaz; yalnızca görünüm eşleşir.
// 45 iken canlıda kırmızı petek ile ekru düz "benzer" çıkıyordu (2026-09-21); renk ya da desenden biri tutmadan geçilmesin.
export const MIN_LOOK_SCORE = 60;
export const MAX_LOOK_SEARCHES_PER_DAY = 20;

export const usable = (look: FabricLook) => look.isFabric && look.confidence >= 0.3;

const hashOf = (s: string) => crypto.createHash('sha1').update(s).digest('hex');

// Kapak değiştiyse kartı yeniden çıkarır; fotoğraf yoksa kartı siler. Hata yutulmaz, çağıran karar verir.
export async function refreshProductLook(productId: string): Promise<'updated' | 'unchanged' | 'removed' | 'skipped'> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { type: true, look: { select: { imageHash: true } }, images: { orderBy: { position: 'asc' }, take: 1, select: { imageUrl: true } } },
  });
  if (!product || product.type === YARN_PRODUCT_TYPE) return 'skipped';
  const cover = product.images[0]?.imageUrl;
  if (!cover) {
    if (product.look) await prisma.productLook.delete({ where: { productId } }).catch(() => {});
    return 'removed';
  }
  const imageHash = hashOf(cover);
  if (product.look?.imageHash === imageHash) return 'unchanged';
  const image = splitDataUrl(cover);
  if (!image) return 'skipped';
  const { look, model } = await extractFabricLook(image);
  // Kumaş görünmeyen ya da çok belirsiz kart da SAKLANIR (aynı fotoğraf için model yeniden
  // çağrılmasın diye) ama aramada kullanılmaz (bkz. usable).
  const data = { lookJson: JSON.stringify(look), imageHash, model };
  await prisma.productLook.upsert({ where: { productId }, create: { productId, ...data }, update: data });
  return 'updated';
}

// Ürün kaydını bekletmez; model hatası ürün kaydını etkilemez.
export function refreshProductLookInBackground(productId: string) {
  void refreshProductLook(productId).catch((err) => console.error('[looks] görünüm kartı çıkarılamadı:', err instanceof Error ? err.message : err));
}

interface SimilarOptions {
  excludeProductId?: string;
  viewerCompanyId?: string | null;
  // Ürün sayfasındaki "Benzer kumaşlar": aynı çeşit ve yakın gramaj öne geçer.
  base?: { type: string; weightGsm: number };
  limit?: number;
}

export async function findSimilarProducts(query: FabricLook, options: SimilarOptions = {}) {
  const rows = await prisma.productLook.findMany({
    where: { product: { type: { not: YARN_PRODUCT_TYPE }, ...(options.excludeProductId ? { id: { not: options.excludeProductId } } : {}) } },
    select: { lookJson: true, product: { select: PRODUCT_SELECT } },
  });
  const scored = rows
    .map((row) => {
      const look = parseLook(row.lookJson);
      if (!look || !usable(look)) return null;
      const { score, reasons } = scoreLooks(query, look);
      let total = score;
      const all = [...reasons];
      if (options.base) {
        if (row.product.type === options.base.type) {
          total += 8;
          all.push('aynı çeşit');
        }
        const gsm = row.product.weightGsm;
        if (gsm > 0 && options.base.weightGsm > 0 && Math.abs(gsm - options.base.weightGsm) / options.base.weightGsm <= 0.15) {
          total += 7;
          all.push('yakın gramaj');
        }
      }
      return { row, look, score, total, reasons: all };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.score >= MIN_LOOK_SCORE)
    .sort((a, b) => b.total - a.total)
    .slice(0, options.limit ?? 20);

  return scored.map((s) => ({
    product: toProductRow(s.row.product, options.viewerCompanyId ?? null),
    similarity: Math.min(100, s.score),
    reasons: s.reasons,
    look: { ...s.look, summary: describeLook(s.look) },
  }));
}

export function lookView(look: FabricLook) {
  return { ...look, summary: describeLook(look) };
}

// Açılışta: fotoğrafı olup kartı olmayan ürünleri sırayla doldurur (mevcut katalog için).
// Her açılışta en çok `limit` ürün; model yapılandırılmamışsa ya da sahte kipteyse çalışmaz.
export function backfillLooksInBackground(limit = 25) {
  void (async () => {
    const missing = await prisma.product.findMany({
      where: { type: { not: YARN_PRODUCT_TYPE }, look: null, images: { some: {} } },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    let done = 0;
    for (const p of missing) {
      try {
        if ((await refreshProductLook(p.id)) === 'updated') done++;
      } catch (err) {
        console.error('[looks] doldurma durdu:', err instanceof Error ? err.message : err);
        break;
      }
    }
    if (missing.length) console.log(`[looks] görünüm kartı doldurma: ${done}/${missing.length}`);
  })().catch((err) => console.error('[looks] doldurma hatası:', err));
}
