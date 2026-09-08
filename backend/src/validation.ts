import { z } from 'zod';

export const accountTypeSchema = z.enum(['konfeksiyon', 'uretici', 'bireysel']);
export const productTypeSchema = z.enum(['raschel', 'orme', 'dokuma', 'diger']);

export const registerSchema = z.object({
  accountType: accountTypeSchema,
  position: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(10),
  companyName: z.string().optional(),
  taxId: z.string().optional(),
  companyCode: z.string().optional(),
});

export const createProductSchema = z.object({
  companyId: z.string().min(1),
  code: z.string().min(1),
  type: productTypeSchema,
  stock: z.number().nonnegative(),
  weightGsm: z.number().positive(),
  widthCm: z.number().positive(),
  content: z.string().min(1),
  useArea: z.string().min(1),
  imageUrl: z.string().url().optional(),
});
