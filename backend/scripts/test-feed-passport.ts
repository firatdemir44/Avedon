// Ürün akışı pasaport kartları (Faz 1, Adım 6) uçtan uca API testi. Çalışan
// yerel sunucuya karşı; kendi test firmalarını/kullanıcılarını açar ve siler.
//   node --env-file=.env --import tsx scripts/test-feed-passport.ts
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
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function main() {
  const suffix = Date.now().toString().slice(-6);
  const sellerCo = await prisma.company.create({ data: { name: `Akış Satıcı ${suffix}`, taxId: `91${suffix}`, companyCode: `FS-${suffix}` } });
  const strangerCo = await prisma.company.create({ data: { name: `Akış Yabancı ${suffix}`, taxId: `92${suffix}`, companyCode: `FY-${suffix}` } });
  const mk = (phone: string, companyId: string | null) =>
    prisma.user.create({ data: { accountType: 'uretici', position: 'Test', firstName: 'Test', lastName: phone, phone, phoneVerified: true, companyId } });
  const seller = await mk(`0588${suffix}`, sellerCo.id);
  const colleague = await mk(`0589${suffix}`, sellerCo.id); // satıcının aynı firmadaki iş arkadaşı
  const stranger = await mk(`0590${suffix}`, strangerCo.id);
  const buyer = await mk(`0591${suffix}`, null);
  const [S, C, X, B] = [seller, colleague, stranger, buyer].map((u) => signSessionToken(u.id));

  const product = await prisma.product.create({
    data: {
      companyId: sellerCo.id,
      code: `FEED-${suffix}`,
      type: 'raschel',
      subtype: 'elastanli_tul',
      stock: 1200,
      stockUnit: 'm',
      weightGsm: 220,
      widthCm: 150,
      widthType: 'acik',
      content: '%82 Poliamid %18 Elastan',
      moq: 300,
      moqUnit: 'm',
      leadTimeDays: 12,
      priceValue: 7.5,
      priceCurrency: 'USD',
      priceUnit: 'kg',
      compositions: { create: [{ position: 0, fiber: 'poliamid', percent: 82 }, { position: 1, fiber: 'elastan', percent: 18 }] },
      certificates: { create: [{ position: 0, name: 'oeko_tex_100', number: '20.HTR.1' }] },
    },
  });
  // Alıcı yalnızca satıcıyla bağlantılı; iş arkadaşıyla ve yabancıyla değil.
  await prisma.connection.create({ data: { requesterId: buyer.id, addresseeId: seller.id, status: 'accepted', respondedAt: new Date() } });

  const postIds: string[] = [];
  try {
    console.log('Ürünlü gönderi → pasaport kartı');
    const created = await api('POST', '/posts', S, { body: 'Yeni raschel kalitemiz.', productId: product.id, visibility: 'public' });
    check('gönderi 201', created.status === 201, created.json);
    postIds.push(created.json?.post?.id);
    const colleaguePost = await api('POST', '/posts', C, { body: 'Duyuru, ürünsüz.', visibility: 'public' });
    postIds.push(colleaguePost.json?.post?.id);
    const strangerPost = await api('POST', '/posts', X, { body: 'Yabancı firmanın duyurusu.', visibility: 'public' });
    postIds.push(strangerPost.json?.post?.id);

    const feed = await api('GET', '/posts?limit=30', B);
    const row = feed.json?.posts?.find((p: any) => p.id === created.json.post.id);
    check('alıcı akışta görür', !!row, feed.json?.posts?.length);
    const p = row?.product;
    check('kart alanları: kod, çeşit, alt çeşit', p?.code === product.code && p?.type === 'raschel' && p?.subtype === 'elastanli_tul', p);
    check('kompozisyon şeridi', JSON.stringify(p?.composition) === JSON.stringify([{ fiber: 'poliamid', percent: 82 }, { fiber: 'elastan', percent: 18 }]), p?.composition);
    check('ölçüler, en tipi, stok', p?.weightGsm === 220 && p?.widthCm === 150 && p?.widthType === 'acik' && p?.stock === 1200 && p?.stockUnit === 'm', p);
    check('MOQ / termin', p?.moq === 300 && p?.moqUnit === 'm' && p?.leadTimeDays === 12, p);
    check('sertifika rozetleri', JSON.stringify(p?.certificateNames) === '["oeko_tex_100"]', p?.certificateNames);
    check('fiyat akışta YOK', !JSON.stringify(row).includes('7.5') && !('price' in (p ?? {})) && !('priceValue' in (p ?? {})), Object.keys(p ?? {}));
    check('takip durumu false', p?.isFavorite === false, p);
    check('beğeni alanları hâlâ var (ürünsüz duyurular için)', typeof row?.likeCount === 'number' && typeof row?.likedByMe === 'boolean');

    console.log('Takibe Al = ProductFavorite');
    check('takibe al 200', (await api('POST', `/products/${product.id}/favorite`, B)).json?.isFavorite === true);
    const feed2 = await api('GET', '/posts?limit=30', B);
    check('akışta takip durumu true', feed2.json?.posts?.find((p: any) => p.id === created.json.post.id)?.product?.isFavorite === true);
    check('Takip Ettiklerim listesinde', (await api('GET', '/me/favorites', B)).json?.products?.some((x: any) => x.id === product.id));
    check('takipten çık', (await api('DELETE', `/products/${product.id}/favorite`, B)).json?.isFavorite === false);

    console.log('Bağlantılarım süzgeci');
    const conn = await api('GET', '/posts?scope=connections&limit=30', B);
    const ids = new Set((conn.json?.posts ?? []).map((p: any) => p.id));
    check('bağlantılı satıcının gönderisi var', ids.has(created.json.post.id), [...ids]);
    check('bağlantılının firmasındaki iş arkadaşı da var', ids.has(colleaguePost.json?.post?.id));
    check('yabancı firma yok', !ids.has(strangerPost.json?.post?.id));
    const connProd = await api('GET', '/posts?scope=connections&withProduct=1&limit=30', B);
    const pids = (connProd.json?.posts ?? []).map((p: any) => p.id);
    check('withProduct yalnızca ürünlü', pids.includes(created.json.post.id) && !pids.includes(colleaguePost.json?.post?.id), pids);
    const lonely = await api('GET', '/posts?scope=connections&limit=30', X);
    check('bağlantısı olmayan için boş', lonely.status === 200 && lonely.json?.posts?.length === 0, lonely.json);
    check('geçersiz scope 400', (await api('GET', '/posts?scope=firma', B)).status === 400);

    console.log('Eski teklif ucu kaldırıldı');
    check('eski /quote-request ucu 404', (await api('POST', `/products/${product.id}/quote-request`, B)).status === 404);
  } finally {
    const userIds = [seller.id, colleague.id, stranger.id, buyer.id];
    await prisma.post.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.message.deleteMany({ where: { senderId: { in: userIds } } });
    await prisma.conversation.deleteMany({ where: { OR: [{ userAId: { in: userIds } }, { userBId: { in: userIds } }] } });
    await prisma.connection.deleteMany({ where: { OR: [{ requesterId: { in: userIds } }, { addresseeId: { in: userIds } }] } });
    await prisma.productFavorite.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.product.deleteMany({ where: { companyId: { in: [sellerCo.id, strangerCo.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: { in: [sellerCo.id, strangerCo.id] } } });
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
