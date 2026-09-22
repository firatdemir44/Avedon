// Kişi profili (başlık/konum/hakkında, kapak, deneyimler) API testi:
//   node --env-file=.env --import tsx scripts/test-user-profile-api.ts
import { PrismaClient } from '@prisma/client';
import { signSessionToken } from '../src/auth';

const prisma = new PrismaClient();
const BASE = process.env.API_BASE ?? 'http://localhost:4000/api';
let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) { passed++; console.log(`  ok   ${name}`); } else { failed++; console.log(`  HATA ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 500)); }
}
async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(BASE + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

async function main() {
  const suffix = Date.now().toString().slice(-6);
  const mk = (n: number) => prisma.user.create({ data: { accountType: 'bireysel', position: 'Genel Müdür', firstName: `Prof${n}`, lastName: 'Test', phone: `0594${suffix}${n}`, phoneVerified: true } });
  const a = await mk(1);
  const b = await mk(2);
  const A = signSessionToken(a.id);
  const Bt = signSessionToken(b.id);
  const img = 'data:image/jpeg;base64,' + Buffer.from('kapak').toString('base64');
  try {
    console.log('Profil alanları');
    const empty = await api('GET', `/users/${a.id}`, A);
    check('boş profil: varsayılanlar', empty.json?.user?.headline === '' && empty.json.user.experiences?.length === 0 && empty.json.user.connectionCount === 0 && empty.json.user.coverUpdatedAt === null, empty.json);
    check('başlık çok uzun 400', (await api('PUT', '/users/me/profile', A, { headline: 'x'.repeat(121) })).status === 400);
    const p = await api('PUT', '/users/me/profile', A, { headline: 'Genel Müdür · Melide Tekstil', location: 'Bağcılar, İstanbul' });
    check('başlık ve konum kaydedildi', p.status === 200 && p.json?.profile?.headline.includes('Melide') && p.json.profile.location.startsWith('Bağcılar'), p.json);
    const p2 = await api('PUT', '/users/me/profile', A, { about: 'Örme kumaş.' });
    check('kısmi güncelleme diğer alanı silmez', p2.json?.profile?.headline.includes('Melide') && p2.json.profile.about === 'Örme kumaş.');
    check('başkası görür', (await api('GET', `/users/${a.id}`, Bt)).json?.user?.location.startsWith('Bağcılar'));

    console.log('Kapak fotoğrafı');
    check('kapak yok 404', (await api('GET', `/users/${a.id}/cover`, Bt)).status === 404);
    check('kapak yüklendi', !!(await api('PUT', '/users/me/cover', A, { image: img })).json?.coverUpdatedAt);
    check('kapak okunur, profil yanıtında ham veri yok', (await api('GET', `/users/${a.id}/cover`, Bt)).json?.imageUrl === img && !JSON.stringify((await api('GET', `/users/${a.id}`, Bt)).json).includes('base64'));
    check('kapak silinir', (await api('PUT', '/users/me/cover', A, { image: null })).json?.coverUpdatedAt === null && (await api('GET', `/users/${a.id}/cover`, A)).status === 404);

    console.log('Deneyimler');
    check('bitiş başlangıçtan önce 400', (await api('POST', '/users/me/experiences', A, { title: 'x', company: 'y', startMonth: 5, startYear: 2020, endMonth: 1, endYear: 2019 })).status === 400);
    check('bitiş ay-yıl birlikte 400', (await api('POST', '/users/me/experiences', A, { title: 'x', company: 'y', startMonth: 5, startYear: 2020, endYear: 2021 })).status === 400);
    const e1 = await api('POST', '/users/me/experiences', A, { title: 'Pazarlama', company: 'Yerteks', startMonth: 6, startYear: 1995, endMonth: 12, endYear: 2000, location: 'İstanbul' });
    const e2 = await api('POST', '/users/me/experiences', A, { title: 'General Manager', company: 'Melide Tekstil', startMonth: 2, startYear: 2001, description: 'Kendi işim' });
    const e3 = await api('POST', '/users/me/experiences', A, { title: 'Co-Founder', company: 'Takyon Ai', startMonth: 5, startYear: 2019 });
    check('üç deneyim 201', e1.status === 201 && e2.status === 201 && e3.status === 201 && e2.json.experience.endYear === null, e2.json);
    const list = (await api('GET', `/users/${a.id}`, Bt)).json?.user?.experiences ?? [];
    check('sıra: devam edenler (yeni başlangıç önce), sonra bitenler', list.map((x: any) => x.company).join(',') === 'Takyon Ai,Melide Tekstil,Yerteks', list.map((x: any) => x.company));
    const up = await api('PUT', `/users/me/experiences/${e3.json.experience.id}`, A, { title: 'Kurucu Ortak', company: 'Takyon Ai', startMonth: 5, startYear: 2019 });
    check('güncellendi', up.json?.experience?.title === 'Kurucu Ortak');
    check('başkasınınkini güncelleyemez 404', (await api('PUT', `/users/me/experiences/${e3.json.experience.id}`, Bt, { title: 'x', company: 'y', startMonth: 1, startYear: 2020 })).status === 404);
    check('başkasınınkini silemez 404', (await api('DELETE', `/users/me/experiences/${e1.json.experience.id}`, Bt)).status === 404);
    check('kendi siler', (await api('DELETE', `/users/me/experiences/${e1.json.experience.id}`, A)).status === 204 && (await api('GET', `/users/${a.id}`, A)).json.user.experiences.length === 2);
    await prisma.connection.create({ data: { requesterId: a.id, addresseeId: b.id, status: 'accepted', respondedAt: new Date() } });
    check('bağlantı sayısı', (await api('GET', `/users/${a.id}`, A)).json?.user?.connectionCount === 1);
  } finally {
    const ids = [a.id, b.id];
    await prisma.userExperience.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.connection.deleteMany({ where: { OR: [{ requesterId: { in: ids } }, { addresseeId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
  console.log(`\nSonuç: ${passed} geçti, ${failed} başarısız`);
  process.exit(failed ? 1 : 0);
}
main().catch(async (err) => { console.error(err); await prisma.$disconnect(); process.exit(1); });
