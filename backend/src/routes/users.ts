import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { getConnectionState, isConnectedAccepted } from '../connections';
import { profileExtras, userProfileRouter } from './userProfile';

export const usersRouter = Router();
usersRouter.use(requireAuth);
// Profil başlığı/kapak/deneyimler (LinkedIn benzeri kişi sayfası).
usersRouter.use(userProfileRouter);

// Telefon 512 px'e küçültüp JPEG ile gönderir (~40-80 KB); sınır sıkıştırılmamış fotoğrafı engeller.
const MAX_AVATAR_CHARS = 400_000;
const avatarSchema = z.object({ image: z.string().startsWith('data:image/').max(MAX_AVATAR_CHARS).nullable() }).strict();

// Kendi profil fotoğrafını yükle (data URL) ya da kaldır (null).
usersRouter.put('/me/avatar', async (req, res) => {
  const parsed = avatarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  const userId = req.user!.id;
  const image = parsed.data.image;
  const updated = await prisma.$transaction(async (tx) => {
    if (image === null) await tx.userAvatar.deleteMany({ where: { userId } });
    else await tx.userAvatar.upsert({ where: { userId }, create: { userId, imageUrl: image }, update: { imageUrl: image } });
    return tx.user.update({ where: { id: userId }, data: { avatarUpdatedAt: image === null ? null : new Date() }, select: { avatarUpdatedAt: true } });
  });
  res.json({ avatarUpdatedAt: updated.avatarUpdatedAt });
});

// Fotoğrafın kendisi: yalnızca oturum açmış kullanıcılara (kişi fotoğrafı; firma logosu gibi herkese açık değil).
usersRouter.get('/:id/avatar', async (req, res) => {
  const avatar = await prisma.userAvatar.findUnique({ where: { userId: req.params.id }, select: { imageUrl: true } });
  if (!avatar) return res.status(404).json({ error: 'avatar_not_found' });
  res.json({ imageUrl: avatar.imageUrl });
});

usersRouter.get('/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: { company: true },
  });
  if (!user) {
    return res.status(404).json({ error: 'user_not_found' });
  }

  const isSelf = req.user!.id === user.id;
  const state = isSelf ? null : await getConnectionState(req.user!.id, user.id);
  const extras = await profileExtras(user.id);

  res.json({
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      position: user.position,
      accountType: user.accountType,
      avatarUpdatedAt: user.avatarUpdatedAt,
      ...extras,
      company: user.company
        ? {
            id: user.company.id,
            name: user.company.name,
            verification: user.company.verification,
            // Profil avatarında firma logosu gösterilsin (önbellek anahtarı).
            logoUpdatedAt: user.company.logoUpdatedAt,
          }
        : null,
      ...(isSelf || (state && isConnectedAccepted(state)) ? { phone: user.phone } : {}),
    },
  });
});
