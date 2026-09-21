// Kişisel profil fotoğrafı uçtan uca API testi:
//   node --env-file=.env --import tsx scripts/test-avatar-api.ts
import { PrismaClient } from '@prisma/client';
import { signSessionToken } from '../src/auth';

const prisma = new PrismaClient();
const BASE = process.env.API_BASE ?? 'http://localhost:4000/api';
let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  HATA ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 400));
  }
}

async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

async function main() {
  const suffix = Date.now().toString().slice(-6);
  const mk = (phone: string) => prisma.user.create({ data: { accountType: 'bireysel', position: 'Test', firstName: 'Foto', lastName: phone, phone, phoneVerified: true } });
  const a = await mk(`0571${suffix}`);
  const b = await mk(`0572${suffix}`);
  const [A, B] = [a, b].map((u) => signSessionToken(u.id));
  const img = `data:image/jpeg;base64,${Buffer.from('deneme-foto').toString('base64')}`;

  try {
    check('oturumsuz 401', (await api('PUT', '/users/me/avatar', undefined, { image: img })).status === 401);
    check('görsel değilse 400', (await api('PUT', '/users/me/avatar', A, { image: 'merhaba' })).status === 400);
    check('çok büyük 400', (await api('PUT', '/users/me/avatar', A, { image: `data:image/jpeg;base64,${'A'.repeat(400_001)}` })).status === 400);
    check('fotoğraf yokken 404', (await api('GET', `/users/${a.id}/avatar`, B)).status === 404);
    const up = await api('PUT', '/users/me/avatar', A, { image: img });
    check('yüklendi; tarih döner', up.status === 200 && !!up.json?.avatarUpdatedAt, up.json);
    check('başka kullanıcı görebilir', (await api('GET', `/users/${a.id}/avatar`, B)).json?.imageUrl === img);
    check('oturumsuz göremez 401', (await api('GET', `/users/${a.id}/avatar`)).status === 401);
    const profile = await api('GET', `/users/${a.id}`, B);
    check('profil kartında tarih var, fotoğrafın kendisi yok', !!profile.json?.user?.avatarUpdatedAt && !JSON.stringify(profile.json).includes('base64'), profile.json);
    const post = await api('POST', '/posts', A, { body: `Foto deneme ${suffix}`, visibility: 'public' });
    const feed = await api('GET', '/posts?limit=5', B);
    const mine = feed.json?.posts?.find((p: any) => p.id === post.json?.post?.id);
    check('akışta yazar kartında tarih var, fotoğraf yok', !!mine?.author?.avatarUpdatedAt && !JSON.stringify(feed.json).includes('ZGVuZW1lLWZvdG8'), mine?.author);
    const again = await api('PUT', '/users/me/avatar', A, { image: img.replace('ZGVuZW1l', 'WWVuaWZv') });
    check('değiştirince tarih ilerler', new Date(again.json?.avatarUpdatedAt).getTime() >= new Date(up.json.avatarUpdatedAt).getTime());
    const del = await api('PUT', '/users/me/avatar', A, { image: null });
    check('kaldırınca tarih null ve fotoğraf 404', del.json?.avatarUpdatedAt === null && (await api('GET', `/users/${a.id}/avatar`, B)).status === 404, del.json);
  } finally {
    await prisma.post.deleteMany({ where: { authorId: { in: [a.id, b.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.$disconnect();
  }

  console.log(`\nSonuç: ${passed} geçti, ${failed} başarısız`);
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
