// Gerçek modelle pasaport çıkarımını elle denemek için (ücretli çağrı!).
// Çalışan yerel sunucuya (port 4000) karşı, veritabanındaki ilk firma
// kullanıcısının oturumuyla:
//   node --env-file=.env --import tsx scripts/try-passport-extract.ts etiket.jpg
//   node --env-file=.env --import tsx scripts/try-passport-extract.ts - "Süprem %95 pamuk %5 elastan 180 gsm"
//   COMPANY_ID=... ile belirli bir firmanın kullanıcısı seçilir.
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { signSessionToken } from '../src/auth';

const prisma = new PrismaClient();
const BASE = process.env.API_BASE ?? 'http://localhost:4000/api';
const MEDIA: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf' };

async function main() {
  const [file, text] = process.argv.slice(2);
  if (!file) throw new Error('kullanım: try-passport-extract.ts <dosya|-> [metin]');
  const user = await prisma.user.findFirst({ where: process.env.COMPANY_ID ? { companyId: process.env.COMPANY_ID } : { companyId: { not: null } } });
  if (!user) throw new Error('firma kullanıcısı yok');
  const token = signSessionToken(user.id);

  const body: Record<string, unknown> = {};
  if (file !== '-') {
    const mediaType = MEDIA[path.extname(file).toLowerCase()];
    if (!mediaType) throw new Error('desteklenmeyen dosya türü');
    const data = fs.readFileSync(file).toString('base64');
    if (mediaType === 'application/pdf') body.document = { dataBase64: data, mediaType };
    else body.images = [{ imageBase64: data, mediaType }];
  }
  if (text) body.text = text;

  const t0 = Date.now();
  const res = await fetch(`${BASE}/passport/extract`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  console.log('durum', res.status, `${Date.now() - t0} ms`);
  console.log(JSON.stringify(await res.json(), null, 1));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
