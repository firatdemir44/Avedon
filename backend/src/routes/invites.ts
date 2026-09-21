import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { MAX_INVITES_PER_DAY, inviteShareText, inviteUrl, newInviteCode } from '../invites';
import { requireAuth } from '../middleware/auth';
import { makeHandle } from './handle';

// Rehberden kopyalanan numaralar her biçimde gelir (+90 5xx…, 90 5xx…, 5xx…, 05xx…); kayıtlardaki
// biçime (05XXXXXXXXX) çevrilir. Çevrilemeyen numara boş döner.
function toLocalPhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('0090')) d = d.slice(4);
  else if (d.startsWith('90') && d.length === 12) d = d.slice(2);
  if (d.length === 10 && d.startsWith('5')) d = `0${d}`;
  return /^05\d{9}$/.test(d) ? d : '';
}

// Faz 2, Adım 4: davetler. Platform davet SMS'i GÖNDERMEZ (istenmeyen ileti olmasın, kredi harcanmasın):
// davet eden, hazır metni kendi WhatsApp'ından paylaşır.
export const invitesRouter = Router();
const handle = makeHandle('invites');

const createSchema = z
  .object({
    name: z.string().trim().max(80).optional(),
    phone: z.string().trim().max(20).optional(),
    relation: z.enum(['', 'tedarikci', 'musteri']).optional(),
    note: z.string().trim().max(200).optional(),
  })
  .strict();

type InviteRow = Awaited<ReturnType<typeof prisma.invite.findFirstOrThrow>>;

function toView(row: InviteRow, inviter: { firstName: string; lastName: string; companyName: string | null }, joined?: { id: string; firstName: string; lastName: string } | null) {
  return {
    id: row.id,
    code: row.code,
    name: row.inviteeName,
    phone: row.inviteePhone,
    relation: row.relation,
    note: row.note,
    status: row.status,
    joinCount: row.joinCount,
    createdAt: row.createdAt,
    joinedAt: row.joinedAt,
    joinedUser: joined ?? null,
    url: inviteUrl(row.code),
    shareText: inviteShareText(`${inviter.firstName} ${inviter.lastName}`, inviter.companyName, row.code, row.relation),
  };
}

const inviterOf = async (userId: string) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { firstName: true, lastName: true, company: { select: { name: true } } } });
  return { firstName: u.firstName, lastName: u.lastName, companyName: u.company?.name ?? null };
};

// Davet bağlantısına dokunan kişiye karşılama: kim davet etti (oturumsuz; yalnızca ad ve firma).
invitesRouter.get(
  '/code/:code',
  handle(async (req, res) => {
    const row = await prisma.invite.findUnique({ where: { code: req.params.code.trim().toUpperCase() } });
    if (!row || row.status === 'cancelled') return res.status(404).json({ error: 'invite_not_found' });
    const inviter = await inviterOf(row.inviterId);
    res.json({ invite: { code: row.code, inviterName: `${inviter.firstName} ${inviter.lastName}`, inviterCompany: inviter.companyName, relation: row.relation } });
  })
);

invitesRouter.use(requireAuth);

invitesRouter.get(
  '/',
  handle(async (req, res) => {
    const rows = await prisma.invite.findMany({ where: { inviterId: req.user!.id, status: { not: 'cancelled' } }, orderBy: { createdAt: 'desc' }, take: 100 });
    const inviter = await inviterOf(req.user!.id);
    const joinedIds = rows.map((r) => r.joinedUserId).filter((id): id is string => !!id);
    const joined = joinedIds.length ? await prisma.user.findMany({ where: { id: { in: joinedIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
    res.json({
      invites: rows.map((r) => toView(r, inviter, joined.find((u) => u.id === r.joinedUserId) ?? null)),
      joinedCount: rows.filter((r) => r.status === 'joined').length,
      dailyLimit: MAX_INVITES_PER_DAY,
    });
  })
);

invitesRouter.post(
  '/',
  handle(async (req, res) => {
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    const me = req.user!;
    const d = parsed.data;

    let phone = '';
    if (d.phone) {
      phone = toLocalPhone(d.phone);
      if (!phone) return res.status(400).json({ error: 'invalid_phone' });
      if (phone === me.phone) return res.status(400).json({ error: 'own_phone' });
      const already = await prisma.user.findUnique({ where: { phone }, select: { id: true, firstName: true, lastName: true } });
      // Zaten üye: davet yerine bağlantı isteği gönderilmeli.
      if (already) return res.status(409).json({ error: 'already_member', user: already });
      const open = await prisma.invite.findFirst({ where: { inviterId: me.id, inviteePhone: phone, status: 'pending' } });
      if (open) return res.status(200).json({ invite: toView(open, await inviterOf(me.id)), reused: true });
    }

    const today = await prisma.invite.count({ where: { inviterId: me.id, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
    if (today >= MAX_INVITES_PER_DAY) return res.status(429).json({ error: 'daily_limit', max: MAX_INVITES_PER_DAY });

    let row: InviteRow | null = null;
    for (let attempt = 0; attempt < 5 && !row; attempt++) {
      try {
        row = await prisma.invite.create({
          data: { code: newInviteCode(), inviterId: me.id, inviterCompanyId: me.companyId ?? null, inviteeName: d.name ?? '', inviteePhone: phone, relation: d.relation ?? '', note: d.note ?? '' },
        });
      } catch (err) {
        if ((err as { code?: string })?.code !== 'P2002') throw err; // kod çakışması: yeniden dene
      }
    }
    if (!row) return res.status(500).json({ error: 'server_error' });
    res.status(201).json({ invite: toView(row, await inviterOf(me.id)), reused: false });
  })
);

invitesRouter.delete(
  '/:id',
  handle(async (req, res) => {
    const own = await prisma.invite.findFirst({ where: { id: req.params.id, inviterId: req.user!.id } });
    if (!own) return res.status(404).json({ error: 'invite_not_found' });
    if (own.status === 'joined') return res.status(409).json({ error: 'already_joined' });
    await prisma.invite.update({ where: { id: own.id }, data: { status: 'cancelled' } });
    res.status(204).end();
  })
);
