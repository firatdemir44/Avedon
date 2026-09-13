import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET tanımlı değil — backend/.env dosyasına ekleyin.');
}
const JWT_SECRET: string = process.env.JWT_SECRET;

const SESSION_TTL = '30d';
const REGISTRATION_TICKET_TTL = '15m';

interface SessionPayload {
  userId: string;
  purpose: 'session';
}

interface RegistrationTicketPayload {
  phone: string;
  purpose: 'register';
}

export function signSessionToken(userId: string): string {
  const payload: SessionPayload = { userId, purpose: 'session' };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_TTL });
}

export function signVerificationTicket(phone: string): string {
  const payload: RegistrationTicketPayload = { phone, purpose: 'register' };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REGISTRATION_TICKET_TTL });
}

export function verifySessionToken(token: string): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Partial<SessionPayload>;
    if (decoded.purpose !== 'session' || typeof decoded.userId !== 'string') return null;
    return { userId: decoded.userId };
  } catch {
    return null;
  }
}

export function verifyRegistrationTicket(token: string): { phone: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Partial<RegistrationTicketPayload>;
    if (decoded.purpose !== 'register' || typeof decoded.phone !== 'string') return null;
    return { phone: decoded.phone };
  } catch {
    return null;
  }
}
