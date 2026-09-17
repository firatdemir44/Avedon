import { Router } from 'express';
import { prisma } from '../db';
import { createProductSchema, updateProductSchema, MAX_PRODUCT_IMAGES } from '../validation';
import { makeHandle } from './handle';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { isValidSubtype, matchCatalogKeys } from '../catalog';
import { knitSearchKeys } from '../domain/glossary';
import { getAcceptedConnectionIds } from '../connections';
import { findOrCreateConversation } from '../conversations';
import { matchWatchRulesInBackground } from '../watch';
import {
  MAX_RECENT_VIEWS,
  PRODUCT_SELECT,
  ProductImageError,
  buildProductWhere,
  productQuerySchema,
  replaceProductImages,
  serializeUsages,
  toProductRow,
} from '../products';
import {
  MAX_CERTIFICATES,
  MAX_TEST_REPORTS,
  PASSPORT_DETAIL_SELECT,
  PassportError,
  hasPassportInput,
  passportColumns,
  passportFieldsSchema,
  passportWarnings,
  replacePassportRelations,
  resolveContent,
  writeFieldMeta,
} from '../passport';
import { z } from 'zod';

export const productsRouter = Router();

const handle = makeHandle('products');

const invalidSubtype = { error: 'invalid_body', details: { fieldErrors: { subtype: ['invalid_subtype'] } } };

// Giriş yapmış kullanıcının bu ürünlerden hangilerini favorilediği.
async function favoriteIdsFor(userId: string | undefined, productIds: string[]) {
  if (!userId || productIds.length === 0) return new Set<string>();
  const rows = await prisma.productFavorite.findMany({
    where: { userId, productId: { in: productIds } },
    select: { productId: true },
  });
  return new Set(rows.map((row) => row.productId));
}

productsRouter.get(
  '/',
  optionalAuth,
  handle(async (req, res) => {
    const parsed = productQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_query', details: parsed.error.flatten() });
    }

    const products = await prisma.product.findMany({
      where: buildProductWhere(parsed.data),
      orderBy: { createdAt: 'desc' },
      select: PRODUCT_SELECT,
    });
    const favorites = await favoriteIdsFor(
      req.user?.id,
      products.map((p) => p.id)
    );

    const viewerCompanyId = req.user?.companyId ?? null;
    res.json({
      products: products.map((p) => ({ ...toProductRow(p, viewerCompanyId), isFavorite: favorites.has(p.id) })),
    });
  })
);

// Gönderi ekranındaki ürün seçici. Firmanın yüzlerce ürünü olabildiği için
// liste sunucuda aranır ve sayfa sayfa verilir; toplam sayı da dönüyor ki
// ekran "240 üründen ilki" diyebilsin. /:id'den ÖNCE tanımlı olmalı, yoksa
// "mine" bir ürün id'si sanılır.
const mineQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

productsRouter.get(
  '/mine',
  requireAuth,
  handle(async (req, res) => {
    const parsed = mineQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_query', details: parsed.error.flatten() });
    }
    if (!req.user!.companyId) {
      return res.json({ products: [], total: 0 });
    }

    const search = parsed.data.search;
    const matched = search
      ? (() => {
          const catalog = matchCatalogKeys(search);
          const glossary = knitSearchKeys(search);
          return {
            types: [...new Set([...catalog.types, ...glossary.types])],
            subtypes: [...new Set([...catalog.subtypes, ...glossary.subtypes])],
          };
        })()
      : null;
    const where = {
      companyId: req.user!.companyId,
      ...(search
        ? {
            OR: [
              { code: { contains: search } },
              { content: { contains: search } },
              ...(matched!.types.length ? [{ type: { in: matched!.types } }] : []),
              ...(matched!.subtypes.length ? [{ subtype: { in: matched!.subtypes } }] : []),
            ],
          }
        : {}),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        select: { id: true, code: true, type: true, subtype: true, _count: { select: { images: true } } },
        orderBy: { createdAt: 'desc' },
        take: parsed.data.limit ?? 30,
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      products: products.map(({ _count, ...p }) => ({ ...p, hasImage: _count.images > 0 })),
      total,
    });
  })
);

productsRouter.post(
  '/',
  requireAuth,
  handle(async (req, res) => {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    if (!req.user!.companyId) {
      return res.status(403).json({ error: 'no_company' });
    }

    const { images, imageUrl, usages, content, ...rest } = parsed.data;
    const passport = passportFieldsSchema.parse(rest);
    const { composition, yarns, certificates, testReports, fieldMeta, ...restWithoutPassport } = rest;
    const fields = stripPassportKeys(restWithoutPassport);
    if (!isValidSubtype(fields.type, fields.subtype)) {
      return res.status(400).json(invalidSubtype);
    }
    // İçerik ya metin ya kompozisyon satırları olarak gelir (ikisi de yoksa 400).
    const resolved = resolveContent({ content, composition });
    if (!resolved.content && !(composition && composition.length)) {
      return res.status(400).json({ error: 'invalid_body', details: { fieldErrors: { content: ['content_or_composition_required'] } } });
    }
    const imageList = images ?? (imageUrl ? [imageUrl] : []);

    try {
      const product = await prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            ...fields,
            content: resolved.content,
            usages: serializeUsages(usages),
            companyId: req.user!.companyId!,
            ...passportColumns(passport),
            ...(hasPassportInput(passport) || resolved.composition?.length ? { passportUpdatedAt: new Date() } : {}),
          },
          select: { id: true },
        });
        await replaceProductImages(tx, created.id, imageList);
        await replacePassportRelations(tx, created.id, {
          composition: resolved.composition,
          yarns,
          certificates,
          testReports,
        });
        const meta = [...(fieldMeta ?? []), ...(resolved.fieldMeta ? [resolved.fieldMeta] : [])];
        if (meta.length) await writeFieldMeta(tx, created.id, meta);
        return tx.product.findUniqueOrThrow({ where: { id: created.id }, select: PRODUCT_SELECT });
      });
      const warnings = collectWarnings(product, resolved.warnings);
      // Faz 2 Adım 1: izleme kuralları yanıtı bekletmeden taranır.
      matchWatchRulesInBackground(product.id);
      res.status(201).json({ product: { ...toProductRow(product, req.user!.companyId), isFavorite: false }, warnings });
    } catch (err) {
      if (err instanceof PassportError) {
        return res.status(400).json({ error: 'invalid_body', details: { fieldErrors: { [err.field]: [err.message] } } });
      }
      throw err;
    }
  })
);

// Pasaport alanlarını Product düz sütunlarından ayırır (passportColumns yazar).
function stripPassportKeys<T extends Record<string, unknown>>(obj: T) {
  const {
    widthType: _w,
    widthMeaning: _wm,
    moq: _m,
    moqUnit: _mu,
    leadTimeDays: _l,
    priceValue: _pv,
    priceCurrency: _pc,
    priceUnit: _pu,
    finishTags: _ft,
    ...rest
  } = obj as Record<string, unknown>;
  void _w; void _m; void _mu; void _l; void _pv; void _pc; void _pu; void _ft;
  return rest as Omit<T, keyof typeof passportFieldsSchema.shape>;
}

// Makullük uyarıları + kompozisyon toplamı; kaydı engellemez, ekranda gösterilir.
function collectWarnings(
  product: { type: string; subtype: string; weightGsm: number; widthCm: number; compositions: { fiber: string; percent: number }[] },
  extra: string[]
) {
  const w = passportWarnings({
    type: product.type as Parameters<typeof isValidSubtype>[0],
    subtype: product.subtype,
    weightGsm: product.weightGsm,
    widthCm: product.widthCm,
    composition: product.compositions,
  });
  return { codes: [...extra, ...w.flags], notes: w.notes };
}

// Sertifika belgesi ve test raporu fotoğrafı: liste/detay yanıtında dönmez,
// tek tek çekilir (ürün galerisiyle aynı kural).
productsRouter.get(
  '/:id/certificates/:position/image',
  handle(async (req, res) => {
    const position = Number(req.params.position);
    if (!Number.isInteger(position) || position < 0 || position >= MAX_CERTIFICATES) {
      return res.status(404).json({ error: 'image_not_found' });
    }
    const row = await prisma.productCertificate.findUnique({
      where: { productId_position: { productId: req.params.id, position } },
      select: { imageUrl: true },
    });
    if (!row?.imageUrl) return res.status(404).json({ error: 'image_not_found' });
    res.json({ imageUrl: row.imageUrl });
  })
);

productsRouter.get(
  '/:id/test-reports/:position/image',
  handle(async (req, res) => {
    const position = Number(req.params.position);
    if (!Number.isInteger(position) || position < 0 || position >= MAX_TEST_REPORTS) {
      return res.status(404).json({ error: 'image_not_found' });
    }
    const row = await prisma.productTestReport.findUnique({
      where: { productId_position: { productId: req.params.id, position } },
      select: { imageUrl: true },
    });
    if (!row?.imageUrl) return res.status(404).json({ error: 'image_not_found' });
    res.json({ imageUrl: row.imageUrl });
  })
);

// Çıkarım/ayrıştırmadan gelen alanları sahibi onaylar (yol haritası §3.2).
const confirmFieldsSchema = z.object({ fields: z.array(z.string().trim().min(1).max(40)).min(1).max(40) });
productsRouter.post(
  '/:id/fields/confirm',
  requireAuth,
  handle(async (req, res) => {
    const parsed = confirmFieldsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const existing = await prisma.product.findUnique({ where: { id: req.params.id }, select: { companyId: true } });
    if (!existing) return res.status(404).json({ error: 'product_not_found' });
    if (existing.companyId !== req.user!.companyId) return res.status(403).json({ error: 'not_your_company' });
    const result = await prisma.productFieldMeta.updateMany({
      where: { productId: req.params.id, field: { in: parsed.data.fields }, confirmedAt: null },
      data: { confirmedAt: new Date() },
    });
    const pending = await prisma.productFieldMeta.count({ where: { productId: req.params.id, confirmedAt: null } });
    res.json({ confirmed: result.count, pendingFieldCount: pending });
  })
);

// Kapak fotoğrafı (ilk sıradaki). Liste küçük resimleri, gönderi ve numune
// ekranları bunu kullanıyor.
productsRouter.get(
  '/:id/image',
  handle(async (req, res) => {
    const image = await prisma.productImage.findFirst({
      where: { productId: req.params.id },
      orderBy: { position: 'asc' },
      select: { imageUrl: true },
    });
    if (image) {
      return res.json({ imageUrl: image.imageUrl });
    }
    const exists = await prisma.product.count({ where: { id: req.params.id } });
    res.status(404).json({ error: exists ? 'image_not_found' : 'product_not_found' });
  })
);

// Galerideki tek fotoğraf.
productsRouter.get(
  '/:id/images/:position',
  handle(async (req, res) => {
    const position = Number(req.params.position);
    if (!Number.isInteger(position) || position < 0 || position >= MAX_PRODUCT_IMAGES) {
      return res.status(404).json({ error: 'image_not_found' });
    }
    const image = await prisma.productImage.findUnique({
      where: { productId_position: { productId: req.params.id, position } },
      select: { imageUrl: true },
    });
    if (!image) {
      return res.status(404).json({ error: 'image_not_found' });
    }
    res.json({ imageUrl: image.imageUrl });
  })
);

// Favoriye ekleme/çıkarma aynı sonucu tekrar tekrar verir (iki kez basmak hata değil).
productsRouter.post(
  '/:id/favorite',
  requireAuth,
  handle(async (req, res) => {
    const exists = await prisma.product.count({ where: { id: req.params.id } });
    if (!exists) {
      return res.status(404).json({ error: 'product_not_found' });
    }
    await prisma.productFavorite.upsert({
      where: { userId_productId: { userId: req.user!.id, productId: req.params.id } },
      create: { userId: req.user!.id, productId: req.params.id },
      update: {},
    });
    res.json({ isFavorite: true });
  })
);

productsRouter.delete(
  '/:id/favorite',
  requireAuth,
  handle(async (req, res) => {
    await prisma.productFavorite.deleteMany({ where: { userId: req.user!.id, productId: req.params.id } });
    res.json({ isFavorite: false });
  })
);

productsRouter.get(
  '/:id',
  optionalAuth,
  handle(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: { ...PRODUCT_SELECT, ...PASSPORT_DETAIL_SELECT },
    });
    if (!product) {
      return res.status(404).json({ error: 'product_not_found' });
    }
    // Belge fotoğrafı olan sertifika/test raporu sıraları (fotoğrafın kendisi ayrı uçtan).
    const [certImages, reportImages] = await Promise.all([
      prisma.productCertificate.findMany({ where: { productId: product.id, imageUrl: { not: null } }, select: { position: true } }),
      prisma.productTestReport.findMany({ where: { productId: product.id, imageUrl: { not: null } }, select: { position: true } }),
    ]);
    const certWithImage = new Set(certImages.map((c) => c.position));
    const reportWithImage = new Set(reportImages.map((c) => c.position));

    // Tasarımdaki "Toplam N Ürün" rozeti — firmanın kataloğunun büyüklüğü
    // üreticiye duyulan güvenin göstergesi olarak ürün sayfasında duruyor.
    const companyProductCount = await prisma.product.count({
      where: { companyId: product.companyId },
    });

    const user = req.user;
    let isFavorite = false;
    if (user) {
      isFavorite = (await favoriteIdsFor(user.id, [product.id])).has(product.id);
      // "Son bakılanlar": kendi firmasının ürünleri kaydedilmez. Kayıt başarısız
      // olsa bile ürün sayfası açılmalı.
      if (user.companyId !== product.companyId) {
        try {
          await prisma.productView.upsert({
            where: { userId_productId: { userId: user.id, productId: product.id } },
            create: { userId: user.id, productId: product.id },
            update: { viewedAt: new Date() },
          });
          const stale = await prisma.productView.findMany({
            where: { userId: user.id },
            orderBy: { viewedAt: 'desc' },
            skip: MAX_RECENT_VIEWS,
            select: { id: true },
          });
          if (stale.length) {
            await prisma.productView.deleteMany({ where: { id: { in: stale.map((v) => v.id) } } });
          }
        } catch (err) {
          console.error('[products] son bakılan kaydedilemedi', err);
        }
      }
    }

    const isOwner = !!user?.companyId && user.companyId === product.companyId;
    // Detay seçimindeki ek ilişkiler ayrıca eklenir; yayılmayla sızmasın
    // (fieldMeta yalnızca sahibine).
    const { yarns: _y, testReports: _t, fieldMeta: _f, ...listRow } = product;
    void _y; void _t; void _f;
    res.json({
      product: {
        ...toProductRow(listRow, user?.companyId ?? null),
        companyProductCount,
        isFavorite,
        // Pasaportun tamamı (fotoğraflar hariç)
        yarns: product.yarns,
        certificates: product.certificates.map((c) => ({ ...c, hasImage: certWithImage.has(c.position) })),
        testReports: product.testReports.map((t) => ({ ...t, hasImage: reportWithImage.has(t.position) })),
        // Alan üstverisi yalnızca sahibine (onay ekranı için)
        ...(isOwner ? { fieldMeta: product.fieldMeta } : {}),
      },
    });
  })
);

productsRouter.patch(
  '/:id',
  requireAuth,
  handle(async (req, res) => {
    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    }

    const existing = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: { companyId: true, type: true, subtype: true, content: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'product_not_found' });
    }
    if (existing.companyId !== req.user!.companyId) {
      return res.status(403).json({ error: 'not_your_company' });
    }
    // İplik ürünleri kendi ucundan düzenlenir (alanları farklı).
    if (existing.type === 'iplik') {
      return res.status(400).json({ error: 'use_yarn_endpoint' });
    }

    const { images, imageUrl, usages, subtype, content, ...rest } = parsed.data;
    const passport = passportFieldsSchema.parse(rest);
    const { composition, yarns, certificates, testReports, fieldMeta, ...restWithoutPassport } = rest;
    const fields = stripPassportKeys(restWithoutPassport);
    const nextType = fields.type ?? existing.type;
    // Çeşit değişip alt çeşit gönderilmediyse eski alt çeşit yeni çeşide ait
    // olmayacağı için boşaltılır.
    const nextSubtype = subtype ?? (fields.type && fields.type !== existing.type ? '' : existing.subtype);
    if (!isValidSubtype(nextType as Parameters<typeof isValidSubtype>[0], nextSubtype)) {
      return res.status(400).json(invalidSubtype);
    }
    const imageList = images ?? (imageUrl === null ? [] : imageUrl ? [imageUrl] : undefined);
    // İçerik ya da kompozisyon değişmediyse ikisine de dokunulmaz.
    const resolved =
      content !== undefined || composition !== undefined ? resolveContent({ content, composition }) : null;
    if (resolved && !resolved.content && !(composition && composition.length)) {
      return res.status(400).json({ error: 'invalid_body', details: { fieldErrors: { content: ['content_or_composition_required'] } } });
    }
    const touchesPassport =
      hasPassportInput(passport) || resolved !== null || yarns !== undefined || certificates !== undefined || testReports !== undefined;

    try {
      const product = await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: req.params.id },
          data: {
            ...fields,
            subtype: nextSubtype,
            ...(usages ? { usages: serializeUsages(usages) } : {}),
            ...(resolved ? { content: resolved.content } : {}),
            ...passportColumns(passport),
            ...(touchesPassport ? { passportUpdatedAt: new Date() } : {}),
          },
        });
        if (imageList) await replaceProductImages(tx, req.params.id, imageList);
        await replacePassportRelations(tx, req.params.id, {
          composition: resolved?.composition,
          yarns,
          certificates,
          testReports,
        });
        // Metin yeniden ayrıştırıldıysa eski "composition" üstverisi geçersizdir.
        if (resolved && resolved.composition !== undefined && !resolved.fieldMeta) {
          await tx.productFieldMeta.deleteMany({ where: { productId: req.params.id, field: 'composition' } });
        }
        const meta = [...(fieldMeta ?? []), ...(resolved?.fieldMeta ? [resolved.fieldMeta] : [])];
        if (meta.length) await writeFieldMeta(tx, req.params.id, meta);
        return tx.product.findUniqueOrThrow({ where: { id: req.params.id }, select: PRODUCT_SELECT });
      });
      const isFavorite = (await favoriteIdsFor(req.user!.id, [product.id])).has(product.id);
      const warnings = collectWarnings(product, resolved?.warnings ?? []);
      res.json({ product: { ...toProductRow(product, req.user!.companyId), isFavorite }, warnings });
    } catch (err) {
      if (err instanceof ProductImageError) {
        return res.status(400).json({ error: 'invalid_body', details: { fieldErrors: { images: [err.message] } } });
      }
      if (err instanceof PassportError) {
        return res.status(400).json({ error: 'invalid_body', details: { fieldErrors: { [err.field]: [err.message] } } });
      }
      throw err;
    }
  })
);

productsRouter.delete(
  '/:id',
  requireAuth,
  handle(async (req, res) => {
    const existing = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: { companyId: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'product_not_found' });
    }
    if (existing.companyId !== req.user!.companyId) {
      return res.status(403).json({ error: 'not_your_company' });
    }

    // Numune talepleri ürüne zorunlu bağlı; önce onlar (ve olay geçmişleri
    // cascade ile) siliniyor. Fotoğraflar, favoriler ve son bakılan kayıtları
    // şemada cascade ile ürünle birlikte gidiyor.
    await prisma.sampleRequest.deleteMany({ where: { productId: req.params.id } });
    await prisma.product.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// Faz 1, Adım 6: "Teklif İste" (Faz 2 teklif akışının kancası). Şimdilik ürün
// sahibi firmadan bağlantılı bir kişiyle sohbet açar ve ürün koduyla hazır bir
// mesaj gönderir. Bağlantı yoksa 403 + bağlantı isteği gönderilecek kişi önerisi.
productsRouter.post(
  '/:id/quote-request',
  requireAuth,
  handle(async (req, res) => {
    const me = req.user!;
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: { id: true, code: true, companyId: true, company: { select: { users: { select: { id: true }, orderBy: { createdAt: 'asc' } } } } },
    });
    if (!product) return res.status(404).json({ error: 'product_not_found' });
    if (me.companyId && product.companyId === me.companyId) return res.status(400).json({ error: 'own_product' });
    const candidates = product.company.users.map((u) => u.id).filter((id) => id !== me.id);
    if (candidates.length === 0) return res.status(409).json({ error: 'no_contact' });

    const connected = new Set(await getAcceptedConnectionIds(me.id));
    const target = candidates.find((id) => connected.has(id));
    if (!target) {
      return res.status(403).json({ error: 'not_connected', suggestedUserId: candidates[0] });
    }

    const conversation = await findOrCreateConversation(me.id, target);
    const now = new Date();
    const body = `Merhaba, ${product.code} kodlu kumaşınız için teklif almak istiyorum. Miktar ve termin bilgisini paylaşabilirim.`;
    const [message] = await prisma.$transaction([
      prisma.message.create({ data: { conversationId: conversation.id, senderId: me.id, body, createdAt: now } }),
      prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: now } }),
    ]);
    res.status(201).json({ conversationId: conversation.id, userId: target, messageId: message.id, body });
  })
);
