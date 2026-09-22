import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { makeHandle } from './handle';

// Kişi profili (LinkedIn benzeri; Fırat 2026-09-22): başlık/konum/hakkında, kapak fotoğrafı ve
// deneyim listesi. /api/users altına bağlanır; requireAuth users.ts'te zaten uygulanıyor.
export const userProfileRouter = Router();
const handle = makeHandle('userProfile');

const MAX_COVER_CHARS = 600_000;
const MAX_EXPERIENCES = 20;
const year = z.number().int().min(1950).max(2100);
const month = z.number().int().min(1).max(12);

export const EXPERIENCE_SELECT = {
  id: true, title: true, company: true, startMonth: true, startYear: true, endMonth: true, endYear: true, location: true, description: true,
} as const;

// Profil yanıtına eklenen parça (users.ts çağırır). Kapak fotoğrafının kendisi dönmez.
export async function profileExtras(userId: string) {
  const [profile, experiences, connectionCount] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId }, select: { headline: true, location: true, about: true, coverUpdatedAt: true } }),
    prisma.userExperience.findMany({ where: { userId }, orderBy: [{ endYear: 'desc' }, { startYear: 'desc' }, { startMonth: 'desc' }], select: EXPERIENCE_SELECT }),
    prisma.connection.count({ where: { status: 'accepted', OR: [{ requesterId: userId }, { addresseeId: userId }] } }),
  ]);
  // Devam edenler (endYear null) en üstte, sonra bitiş tarihine göre.
  experiences.sort((a, b) => {
    const ea = a.endYear == null ? 9999 * 12 : a.endYear * 12 + (a.endMonth ?? 0);
    const eb = b.endYear == null ? 9999 * 12 : b.endYear * 12 + (b.endMonth ?? 0);
    if (ea !== eb) return eb - ea;
    return b.startYear * 12 + b.startMonth - (a.startYear * 12 + a.startMonth);
  });
  return {
    headline: profile?.headline ?? '',
    location: profile?.location ?? '',
    about: profile?.about ?? '',
    coverUpdatedAt: profile?.coverUpdatedAt ?? null,
    connectionCount,
    experiences,
  };
}

const profileSchema = z
  .object({ headline: z.string().trim().max(120), location: z.string().trim().max(80), about: z.string().trim().max(1000) })
  .partial()
  .strict();

userProfileRouter.put(
  '/me/profile',
  handle(async (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const userId = req.user!.id;
    await prisma.userProfile.upsert({ where: { userId }, create: { userId, ...parsed.data }, update: parsed.data });
    res.json({ profile: await profileExtras(userId) });
  })
);

const coverSchema = z.object({ image: z.string().startsWith('data:image/').max(MAX_COVER_CHARS).nullable() }).strict();

userProfileRouter.put(
  '/me/cover',
  handle(async (req, res) => {
    const parsed = coverSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
    const userId = req.user!.id;
    const data = parsed.data.image === null ? { coverImageUrl: '', coverUpdatedAt: null } : { coverImageUrl: parsed.data.image, coverUpdatedAt: new Date() };
    const row = await prisma.userProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data, select: { coverUpdatedAt: true } });
    res.json({ coverUpdatedAt: row.coverUpdatedAt });
  })
);

userProfileRouter.get(
  '/:id/cover',
  handle(async (req, res) => {
    const row = await prisma.userProfile.findUnique({ where: { userId: req.params.id }, select: { coverImageUrl: true } });
    if (!row?.coverImageUrl) return res.status(404).json({ error: 'cover_not_found' });
    res.json({ imageUrl: row.coverImageUrl });
  })
);

const experienceSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    company: z.string().trim().min(1).max(120),
    startMonth: month,
    startYear: year,
    endMonth: month.nullable().optional(),
    endYear: year.nullable().optional(),
    location: z.string().trim().max(80).optional(),
    description: z.string().trim().max(600).optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    const hasEnd = d.endYear != null;
    if (hasEnd !== (d.endMonth != null)) ctx.addIssue({ code: 'custom', message: 'end_month_and_year_together', path: ['endMonth'] });
    if (hasEnd && d.endYear! * 12 + d.endMonth! < d.startYear * 12 + d.startMonth) ctx.addIssue({ code: 'custom', message: 'end_before_start', path: ['endYear'] });
  });

const toData = (d: z.infer<typeof experienceSchema>) => ({
  title: d.title, company: d.company, startMonth: d.startMonth, startYear: d.startYear,
  endMonth: d.endYear == null ? null : d.endMonth ?? null, endYear: d.endYear ?? null,
  location: d.location ?? '', description: d.description ?? '',
});

userProfileRouter.post(
  '/me/experiences',
  handle(async (req, res) => {
    const parsed = experienceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const userId = req.user!.id;
    if ((await prisma.userExperience.count({ where: { userId } })) >= MAX_EXPERIENCES) return res.status(409).json({ error: 'too_many_experiences', max: MAX_EXPERIENCES });
    const row = await prisma.userExperience.create({ data: { userId, ...toData(parsed.data) }, select: EXPERIENCE_SELECT });
    res.status(201).json({ experience: row });
  })
);

userProfileRouter.put(
  '/me/experiences/:id',
  handle(async (req, res) => {
    const parsed = experienceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const own = await prisma.userExperience.findFirst({ where: { id: req.params.id, userId: req.user!.id }, select: { id: true } });
    if (!own) return res.status(404).json({ error: 'experience_not_found' });
    const row = await prisma.userExperience.update({ where: { id: own.id }, data: toData(parsed.data), select: EXPERIENCE_SELECT });
    res.json({ experience: row });
  })
);

userProfileRouter.delete(
  '/me/experiences/:id',
  handle(async (req, res) => {
    const r = await prisma.userExperience.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    if (!r.count) return res.status(404).json({ error: 'experience_not_found' });
    res.status(204).end();
  })
);
