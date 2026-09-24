import { z } from 'zod';
import { PRODUCT_TYPES, STOCK_UNITS, USAGES } from './catalog';
import { passportFieldsSchema } from './passport';

export const accountTypeSchema = z.enum(['konfeksiyon', 'uretici', 'bireysel']);
export const productTypeSchema = z.enum(PRODUCT_TYPES);

export const registerSchema = z.object({
  accountType: accountTypeSchema,
  position: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(10),
  companyName: z.string().optional(),
  taxId: z.string().optional(),
  companyCode: z.string().optional(),
  verificationToken: z.string().min(1),
  // Davet bağlantısıyla gelindiyse (Faz 2, Adım 4); geçersiz kod kaydı engellemez.
  inviteCode: z.string().trim().max(20).optional(),
});

// Bir üründe en fazla bu kadar fotoğraf (tasarımdaki kaydırmalı galeri).
export const MAX_PRODUCT_IMAGES = 6;
// Telefon fotoğrafı 1000 px'e küçültüp JPEG %60 ile gönderiyor (~150-250 KB,
// base64 ile ~%33 büyür). Sınır, sıkıştırılmamış bir fotoğrafın yanlışlıkla
// veritabanına girmesini engelliyor.
export const MAX_PRODUCT_IMAGE_CHARS = 700_000;

const imageDataUrl = z.string().startsWith('data:image/').max(MAX_PRODUCT_IMAGE_CHARS);
const usageKeys = USAGES.map((u) => u.key) as [string, ...string[]];

// Güncellemede fotoğraf listesi: yeni fotoğraf (data URL) ya da mevcut
// fotoğraflardan birinin ESKİ sırası. Böylece telefon yalnızca yeni fotoğrafları
// gönderir; sıralama değişikliği ve silme için mevcutları yeniden yüklemez.
const productImageItemSchema = z.union([
  imageDataUrl,
  z.object({ existing: z.number().int().min(0).max(MAX_PRODUCT_IMAGES - 1) }).strict(),
]);

const code = z.string().trim().min(1).max(60);
const subtype = z.string().trim().max(40);
const usages = z.array(z.enum(usageKeys)).max(USAGES.length);
const stock = z.number().nonnegative();
const stockUnit = z.enum(STOCK_UNITS);
const weightGsm = z.number().positive();
const widthCm = z.number().positive();
// İçerik metni: kompozisyon satırları (passport.composition) verildiyse sunucu
// metni ondan üretir; yalnızca metin verildiyse ayrıştırmayı dener. İkisi de
// yoksa rota 400 döner (content_or_composition_required).
const content = z.string().trim().max(200);
// Serbest kullanım notu; kullanım amaçları artık `usages` etiketlerinde.
const useArea = z.string().trim().max(200);

// Alt çeşidin çeşide uyup uymadığı rotada kontrol ediliyor (güncellemede
// çeşidin mevcut değeri veritabanından geliyor).
export const createProductSchema = z
  .object({
    code,
    type: productTypeSchema,
    subtype: subtype.default(''),
    usages: usages.default([]),
    stock,
    stockUnit: stockUnit.default('m'),
    weightGsm,
    widthCm,
    content: content.optional(),
    useArea: useArea.default(''),
    images: z.array(imageDataUrl).max(MAX_PRODUCT_IMAGES).optional(),
    // Eski uygulama sürümleri tek fotoğrafı bu alanla gönderiyor.
    imageUrl: imageDataUrl.optional(),
  })
  .merge(passportFieldsSchema);

export const updateProductSchema = z
  .object({
    code: code.optional(),
    type: productTypeSchema.optional(),
    subtype: subtype.optional(),
    usages: usages.optional(),
    stock: stock.optional(),
    stockUnit: stockUnit.optional(),
    weightGsm: weightGsm.optional(),
    widthCm: widthCm.optional(),
    content: content.optional(),
    useArea: useArea.optional(),
    // Verilirse fotoğrafların TAMAMI bu liste olur (sırası = gösterim sırası,
    // ilki kapak). Verilmezse fotoğraflara dokunulmaz.
    images: z.array(productImageItemSchema).max(MAX_PRODUCT_IMAGES).optional(),
    // Eski sürümler: data URL = tek fotoğrafla değiştir, null = fotoğrafı kaldır.
    imageUrl: imageDataUrl.nullable().optional(),
  })
  .merge(passportFieldsSchema);
