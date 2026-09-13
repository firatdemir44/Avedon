import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { normalizePhone } from '../phone';
import { issueOtp, verifyOtpCode } from '../otp';
import { signSessionToken, signVerificationTicket } from '../auth';

export const otpRouter = Router();

const phoneSchema = z.object({ phone: z.string().min(10) });

otpRouter.post('/request', async (req, res) => {
  const parsed = phoneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const phone = normalizePhone(parsed.data.phone);
  const result = await issueOtp(phone);
  if (!result.ok) {
    return res.status(429).json({ error: result.error, retryAfterSeconds: result.retryAfterSeconds });
  }
  res.json({ ok: true });
});

const verifySchema = z.object({ phone: z.string().min(10), code: z.string().length(6) });

otpRouter.post('/verify', async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
  }

  const phone = normalizePhone(parsed.data.phone);
  const result = await verifyOtpCode(phone, parsed.data.code);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }

  const user = await prisma.user.findUnique({ where: { phone }, include: { company: true } });
  if (user) {
    return res.json({ purpose: 'login', token: signSessionToken(user.id), user });
  }

  res.json({ purpose: 'register', verificationToken: signVerificationTicket(phone) });
});
