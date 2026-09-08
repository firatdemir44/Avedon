import { Router } from 'express';
import { prisma } from '../db';
import { registerSchema } from '../validation';

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

  const existingPhone = await prisma.user.findUnique({ where: { phone: data.phone } });
  if (existingPhone) {
    return res.status(409).json({ error: 'phone_already_registered' });
  }

  let companyId: string | null = null;

  if (data.accountType !== 'bireysel') {
    if (data.companyCode) {
      const company = await prisma.company.findUnique({ where: { companyCode: data.companyCode } });
      if (!company) {
        return res.status(404).json({ error: 'company_code_not_found' });
      }
      companyId = company.id;
    } else if (data.companyName && data.taxId) {
      const company = await prisma.company.create({
        data: {
          name: data.companyName,
          taxId: data.taxId,
          companyCode: generateCompanyCode(),
        },
      });
      companyId = company.id;
    } else {
      return res.status(400).json({ error: 'company_info_required' });
    }
  }

  const user = await prisma.user.create({
    data: {
      accountType: data.accountType,
      position: data.position,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      phoneVerified: true,
      companyId,
    },
    include: { company: true },
  });

  res.status(201).json({ user });
});
