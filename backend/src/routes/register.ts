import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { registerSchema } from '../validation';
import { normalizePhone } from '../phone';
import { verifyRegistrationTicket, signSessionToken } from '../auth';
import { applyInvitesOnRegistration, resolveTeamInvite } from '../invites';
import { isValidTaxId, normalizeTaxId } from '../taxId';

export const registerRouter = Router();

function generateCompanyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'AVD-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

registerRouter.post('/', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }
  const data = parsed.data;
  const phone = normalizePhone(data.phone);

  const ticket = verifyRegistrationTicket(data.verificationToken);
  if (!ticket || ticket.phone !== phone) {
    return res.status(400).json({ error: 'invalid_verification_token' });
  }

  const team = await resolveTeamInvite(data.inviteCode, phone);

  const existingPhone = await prisma.user.findUnique({ where: { phone } });
  if (existingPhone) {
    // Ekip davetiyle gelen kayıtlı numara firmasını kendiliğinden değiştiremez.
    if (team?.ok) return res.status(409).json({ error: 'already_registered_team_invite' });
    return res.status(409).json({ error: 'phone_already_registered' });
  }
  if (team && !team.ok) return res.status(400).json({ error: team.error });

  let companyId: string | null = null;
  let accountType = data.accountType;

  if (team?.ok) {
    // Ekip daveti: davet edenin firmasına doğrudan katılır; yeni firma açılmaz, firma bilgisi istenmez.
    companyId = team.companyId;
    accountType = team.accountType;
  } else if (data.accountType !== 'bireysel') {
    if (data.companyCode) {
      const company = await prisma.company.findUnique({ where: { companyCode: data.companyCode } });
      if (!company) {
        return res.status(404).json({ error: 'company_code_not_found' });
      }
      companyId = company.id;
    } else if (data.companyName && data.companyName.trim()) {
      // Vergi numarası kayıtta isteğe bağlı: çoğu kişinin elinde olmuyor;
      // sonradan Firma bilgileri'nden eklenir (doğrulama başvurusu için gerekir).
      const taxId = normalizeTaxId(data.taxId ?? '');
      if (taxId && !isValidTaxId(taxId)) return res.status(400).json({ error: 'invalid_tax_id' });
      const company = await prisma.company.create({
        data: {
          name: data.companyName.trim(),
          taxId,
          companyCode: generateCompanyCode(),
        },
      });
      companyId = company.id;
    } else {
      return res.status(400).json({ error: 'company_info_required' });
    }
  }

  try {
    const user = await prisma.user.create({
      data: {
        accountType,
        position: data.position,
        firstName: data.firstName,
        lastName: data.lastName,
        phone,
        phoneVerified: true,
        companyId,
      },
      include: { company: true },
    });

    // Davetle geldiyse (kodla ya da numarasına açık davetle) bağlantı kurulur; hata kaydı bozmaz.
    await applyInvitesOnRegistration(user, data.inviteCode).catch((err) => console.error('[register] davet uygulanamadı:', err));

    res.status(201).json({ token: signSessionToken(user.id), user });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ error: 'phone_already_registered' });
    }
    // Express 4 async handler'daki throw'u yakalamıyor — istek askıda kalmasın.
    console.error('[register]', err);
    res.status(500).json({ error: 'server_error' });
  }
});
