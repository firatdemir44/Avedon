import crypto from 'crypto';
import { prisma } from './db';
import { sendOtpSms } from './sms';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET tanımlı değil — backend/.env dosyasına ekleyin.');
}

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

// Düz sha256 değil HMAC kullanıyoruz: 6 haneli bir kodun olası tüm değerleri
// (1 milyon) önceden hesaplanıp bir sözlük saldırısıyla kırılabilir, HMAC'te
// anahtar (JWT_SECRET) olmadan bu mümkün değil.
function hashCode(phone: string, code: string): string {
  return crypto.createHmac('sha256', JWT_SECRET!).update(`${phone}:${code}`).digest('hex');
}

export type IssueOtpResult = { ok: true } | { ok: false; error: 'cooldown'; retryAfterSeconds: number };

export async function issueOtp(phone: string): Promise<IssueOtpResult> {
  const existing = await prisma.phoneOtp.findUnique({ where: { phone } });
  if (existing) {
    const elapsedMs = Date.now() - existing.createdAt.getTime();
    if (elapsedMs < OTP_COOLDOWN_MS) {
      return { ok: false, error: 'cooldown', retryAfterSeconds: Math.ceil((OTP_COOLDOWN_MS - elapsedMs) / 1000) };
    }
  }

  const code = generateCode();
  await prisma.phoneOtp.upsert({
    where: { phone },
    create: {
      phone,
      codeHash: hashCode(phone, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
    update: {
      codeHash: hashCode(phone, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      attempts: 0,
      createdAt: new Date(),
    },
  });

  await sendOtpSms(phone, code);
  return { ok: true };
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; error: 'not_found' | 'expired' | 'max_attempts' | 'mismatch' };

export async function verifyOtpCode(phone: string, code: string): Promise<VerifyOtpResult> {
  const existing = await prisma.phoneOtp.findUnique({ where: { phone } });
  if (!existing) {
    return { ok: false, error: 'not_found' };
  }

  if (existing.expiresAt.getTime() < Date.now()) {
    await prisma.phoneOtp.delete({ where: { phone } }).catch(() => {});
    return { ok: false, error: 'expired' };
  }

  if (existing.attempts >= OTP_MAX_ATTEMPTS) {
    await prisma.phoneOtp.delete({ where: { phone } }).catch(() => {});
    return { ok: false, error: 'max_attempts' };
  }

  if (existing.codeHash !== hashCode(phone, code)) {
    await prisma.phoneOtp.update({ where: { phone }, data: { attempts: { increment: 1 } } });
    return { ok: false, error: 'mismatch' };
  }

  await prisma.phoneOtp.delete({ where: { phone } });
  return { ok: true };
}
