// Ürün sayfası ve sohbet videoları (VideoLink) uçtan uca API testi:
//   node --env-file=.env --import tsx scripts/test-video-links-api.ts
// Video kayıtları doğrudan veritabanına yazılır (Cloudflare'e gidilmez).
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
    console.log(`  HATA ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 500));
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
  const co = await prisma.company.create({ data: { name: `Video Firma ${suffix}`, taxId: `12${suffix}`, companyCode: `VD-${suffix}` } });
  const mk = (n: number, companyId?: string) =>
    prisma.user.create({ data: { accountType: companyId ? 'uretici' : 'bireysel', position: 'Test', firstName: `Video${n}`, lastName: 'Test', phone: `0592${suffix}${n}`, phoneVerified: true, companyId } });
  const seller = await mk(1, co.id);
  const buyer = await mk(2);
  const stranger = await mk(3);
  const S = signSessionToken(seller.id);
  const B = signSessionToken(buyer.id);
  const X = signSessionToken(stranger.id);
  const product = await prisma.product.create({ data: { companyId: co.id, code: `VK-${suffix}`, type: 'orme', subtype: 'suprem', stock: 100, stockUnit: 'kg', weightGsm: 200, widthCm: 160, content: '%100 Pamuk' } });
  await prisma.connection.create({ data: { requesterId: seller.id, addresseeId: buyer.id, status: 'accepted', respondedAt: new Date() } });
  let n = 0;
  const video = (ownerId: string, status = 'ready') => prisma.video.create({ data: { ownerId, streamUid: `test-${suffix}-${n++}`, status, durationSeconds: 12 } });

  try {
    console.log('Ürün videoları');
    const v1 = await video(seller.id);
    check('oturumsuz ekleme 401', (await api('POST', `/products/${product.id}/videos`, undefined, { videoId: v1.id })).status === 401);
    check('başka firmanın ürünü 403', (await api('POST', `/products/${product.id}/videos`, B, { videoId: v1.id })).status === 403);
    const foreign = await video(buyer.id);
    check('başkasının videosu 404', (await api('POST', `/products/${product.id}/videos`, S, { videoId: foreign.id })).status === 404);
    const bad = await video(seller.id, 'error');
    check('hatalı video 409', (await api('POST', `/products/${product.id}/videos`, S, { videoId: bad.id })).json?.error === 'video_failed');
    const add = await api('POST', `/products/${product.id}/videos`, S, { videoId: v1.id });
    check('video ürüne eklendi', add.status === 201 && add.json?.videos?.length === 1 && add.json.videos[0].id === v1.id && !JSON.stringify(add.json).includes('test-'), add.json);
    check('aynı video ikinci kez 409', (await api('POST', `/products/${product.id}/videos`, S, { videoId: v1.id })).json?.error === 'video_in_use');
    check('liste oturumsuz okunur', (await api('GET', `/products/${product.id}/videos`)).json?.videos?.length === 1);
    check('ilgisiz kullanıcı ürün videosunu görebilir', (await api('GET', `/videos/${v1.id}`, X)).status === 200);
    check('bağlı video /videos üzerinden silinemez 409', (await api('DELETE', `/videos/${v1.id}`, S)).status === 409);
    const v2 = await video(seller.id);
    const v3 = await video(seller.id);
    const v4 = await video(seller.id);
    await api('POST', `/products/${product.id}/videos`, S, { videoId: v2.id });
    await api('POST', `/products/${product.id}/videos`, S, { videoId: v3.id });
    check('en çok 3 video', (await api('POST', `/products/${product.id}/videos`, S, { videoId: v4.id })).json?.error === 'too_many_videos');
    check('başkası kaldıramaz 403', (await api('DELETE', `/products/${product.id}/videos/${v2.id}`, B)).status === 403);
    check('sahibi kaldırır: bağ ve video gider', (await api('DELETE', `/products/${product.id}/videos/${v2.id}`, S)).status === 204 && (await prisma.video.findUnique({ where: { id: v2.id } })) === null && (await api('GET', `/products/${product.id}/videos`)).json?.videos?.length === 2);

    console.log('Sohbet videosu');
    const conv = await api('POST', '/conversations', S, { userId: buyer.id });
    const cid = conv.json?.conversation?.id;
    check('sohbet açıldı', !!cid, conv.json);
    check('boş mesaj 400', (await api('POST', `/conversations/${cid}/messages`, S, {})).status === 400);
    const sent = await api('POST', `/conversations/${cid}/messages`, S, { videoId: v4.id });
    check('yazısız video mesajı 201', sent.status === 201 && sent.json?.message?.video?.id === v4.id && sent.json.message.body === '', sent.json);
    check('aynı video ikinci mesaja bağlanamaz', (await api('POST', `/conversations/${cid}/messages`, S, { videoId: v4.id })).json?.error === 'video_in_use');
    check('ürüne bağlı video mesaja bağlanamaz', (await api('POST', `/conversations/${cid}/messages`, S, { videoId: v1.id })).json?.error === 'video_in_use');
    const msgs = await api('GET', `/conversations/${cid}/messages`, B);
    check('alıcı mesaj listesinde videoyu görür', msgs.json?.messages?.some((m: any) => m.video?.id === v4.id && m.video.status === 'ready'), msgs.json);
    check('alıcı videoya erişir', (await api('GET', `/videos/${v4.id}`, B)).status === 200);
    check('sohbet dışındaki kişi erişemez 404', (await api('GET', `/videos/${v4.id}`, X)).status === 404);
    const list = await api('GET', '/conversations', B);
    check('sohbet listesinde son mesaj "Video"', list.json?.conversations?.find((c: any) => c.id === cid)?.lastMessage?.body === 'Video', list.json?.conversations?.[0]);
    const text = await api('POST', `/conversations/${cid}/messages`, B, { body: 'Teşekkürler' });
    check('yazılı mesaj bozulmadı', text.status === 201 && text.json.message.video === null);
  } finally {
    const ids = [seller.id, buyer.id, stranger.id];
    const vids = (await prisma.video.findMany({ where: { ownerId: { in: ids } }, select: { id: true } })).map((v) => v.id);
    await prisma.videoLink.deleteMany({ where: { videoId: { in: vids } } });
    await prisma.video.deleteMany({ where: { id: { in: vids } } });
    await prisma.conversation.deleteMany({ where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] } });
    await prisma.connection.deleteMany({ where: { OR: [{ requesterId: { in: ids } }, { addresseeId: { in: ids } }] } });
    await prisma.productView.deleteMany({ where: { productId: product.id } });
    await prisma.product.deleteMany({ where: { id: product.id } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.company.deleteMany({ where: { id: co.id } });
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
