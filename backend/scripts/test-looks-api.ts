// Benzer kumaş arama (Faz 3, Adım 3) uçtan uca API testi. SAHTE kipte çalışan sunucuya karşı:
//   PORT=4001 ANTHROPIC_MOCK=1 ile ikinci sunucu, sonra:
//   API_BASE=http://localhost:4001/api node --env-file=.env --import tsx scripts/test-looks-api.ts
// Sahte kipte görselin base64 içeriği "LOOK:{json}" ise o görünüm kartı döner.
import { PrismaClient } from '@prisma/client';
import { signSessionToken } from '../src/auth';

const prisma = new PrismaClient();
const BASE = process.env.API_BASE ?? 'http://localhost:4001/api';
let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  HATA ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 600));
  }
}

async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
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

const img = (look: object) => `data:image/jpeg;base64,${Buffer.from(`LOOK:${JSON.stringify(look)}`).toString('base64')}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const suffix = Date.now().toString().slice(-6);
  const seller = await prisma.company.create({ data: { name: `Görünüm Satıcı ${suffix}`, taxId: `61${suffix}`, companyCode: `GS-${suffix}` } });
  const buyerCo = await prisma.company.create({ data: { name: `Görünüm Alıcı ${suffix}`, taxId: `62${suffix}`, companyCode: `GA-${suffix}` } });
  const mk = (phone: string, companyId: string) =>
    prisma.user.create({ data: { accountType: 'uretici', position: 'Test', firstName: 'Test', lastName: phone, phone, phoneVerified: true, companyId } });
  const us = await mk(`0551${suffix}`, seller.id);
  const ub = await mk(`0552${suffix}`, buyerCo.id);
  const [S, B] = [us, ub].map((u) => signSessionToken(u.id));

  const floral = { pattern: 'cicekli', scale: 'orta', colors: ['lacivert', 'pembe'], surface: 'mat', texture: 'duz', transparency: 'opak', confidence: 0.9 };
  const lace = { pattern: 'motifli', scale: 'kucuk', colors: ['siyah'], surface: 'mat', texture: 'dantel', transparency: 'yari_saydam', confidence: 0.9 };
  const plain = { pattern: 'duz', scale: 'yok', colors: ['lacivert'], surface: 'mat', texture: 'duz', transparency: 'opak', confidence: 0.9 };
  const base = { type: 'dokuma', subtype: '', stock: 100, stockUnit: 'm', widthCm: 150, content: '%100 Pamuk' };
  const waitLook = async (id: string) => {
    for (let i = 0; i < 30; i++) {
      if (await prisma.productLook.findUnique({ where: { productId: id } })) return true;
      await sleep(200);
    }
    return false;
  };

  try {
    console.log('Seçenekler ve kart çıkarma');
    const opt = await api('GET', '/looks/options');
    check('başlıklar: desen, ölçek, renk, yüzey, doku, şeffaflık', ['patterns', 'scales', 'colors', 'surfaces', 'textures', 'transparencies'].every((k) => Array.isArray(opt.json?.[k])), Object.keys(opt.json ?? {}));
    const p1 = await api('POST', '/products', S, { ...base, code: `CK-${suffix}`, weightGsm: 120, images: [img(floral)] });
    const p2 = await api('POST', '/products', S, { ...base, code: `DN-${suffix}`, type: 'dantel', weightGsm: 90, images: [img(lace)] });
    const p3 = await api('POST', '/products', S, { ...base, code: `DZ-${suffix}`, weightGsm: 125, images: [img(plain)] });
    const p4 = await api('POST', '/products', S, { ...base, code: `FS-${suffix}`, weightGsm: 125 });
    check('ürünler oluştu', [p1, p2, p3, p4].every((p) => p.status === 201), [p1.status, p2.status, p3.status, p4.status]);
    const [id1, id2, id3, id4] = [p1, p2, p3, p4].map((p) => p.json?.product?.id as string);
    check('kapak fotoğrafından kart arka planda çıkarıldı', (await waitLook(id1)) && (await waitLook(id2)) && (await waitLook(id3)));
    check('fotoğrafsız üründe kart yok', !(await prisma.productLook.findUnique({ where: { productId: id4 } })));

    console.log('Fotoğrafla arama');
    check('oturumsuz 401', (await api('POST', '/looks/search', undefined, { image: img(floral) })).status === 401);
    check('görsel değilse 400', (await api('POST', '/looks/search', B, { image: 'merhaba' })).status === 400);
    const s1 = await api('POST', '/looks/search', B, { image: img({ ...floral, colors: ['lacivert', 'beyaz'] }) });
    const mine = (r: any) => (r.json?.results ?? []).filter((x: any) => [id1, id2, id3, id4].includes(x.product.id));
    check('çiçekli lacivert arama → çiçekli ürün ilk sırada', mine(s1)[0]?.product?.id === id1 && mine(s1)[0].similarity >= 80, mine(s1).map((x: any) => [x.product.code, x.similarity]));
    check('nedenler açıklanıyor', mine(s1)[0]?.reasons?.includes('aynı desen türü') && mine(s1)[0].reasons.includes('aynı ana renk'), mine(s1)[0]?.reasons);
    check('dantel bu aramada çıkmaz (eşik altı)', !mine(s1).some((x: any) => x.product.id === id2));
    check('çıkarılan kart özetiyle döner', typeof s1.json?.look?.summary === 'string' && s1.json.look.summary.includes('Çiçekli'), s1.json?.look);
    check('fiyat sızmaz', !JSON.stringify(s1.json).includes('"price"'));
    const s2 = await api('POST', '/looks/search', B, { image: img({ ...lace, colors: ['antrasit'] }) });
    check('dantel arama → dantel ürün ilk sırada, yakın renk nedeniyle', mine(s2)[0]?.product?.id === id2 && mine(s2)[0].reasons.includes('yakın ana renk'), mine(s2).map((x: any) => [x.product.code, x.similarity, x.reasons]));
    const s3 = await api('POST', '/looks/search', B, { image: img({ isFabric: false, confidence: 0.1 }) });
    check('kumaş olmayan fotoğraf: recognized false, sonuç boş', s3.status === 200 && s3.json?.recognized === false && s3.json.results.length === 0, s3.json);
    check('kalan hak sayısı döner', typeof s3.json?.remaining === 'number' && s3.json.remaining === 20 - 3, s3.json?.remaining);

    console.log('Ürün sayfası: benzer kumaşlar');
    const sim = await api('GET', `/looks/product/${id3}/similar`);
    check('oturumsuz okunur; kendisi listede yok', sim.status === 200 && !sim.json?.results?.some((x: any) => x.product.id === id3), sim.json);
    const near = sim.json?.results?.find((x: any) => x.product.id === id1);
    check('yakın gramaj + aynı çeşit nedenleri eklenir', !near || (near.reasons.includes('aynı çeşit') && near.reasons.includes('yakın gramaj')), near);
    check('kartı olmayan üründe boş liste', (await api('GET', `/looks/product/${id4}/similar`)).json?.results?.length === 0);

    console.log('Kapak değişince kart yenilenir');
    const before = await prisma.productLook.findUnique({ where: { productId: id3 } });
    await api('PATCH', `/products/${id3}`, S, { images: [img(lace)] });
    let changed = false;
    for (let i = 0; i < 30 && !changed; i++) {
      await sleep(200);
      changed = (await prisma.productLook.findUnique({ where: { productId: id3 } }))?.imageHash !== before?.imageHash;
    }
    check('yeni kapak → yeni kart', changed && JSON.parse((await prisma.productLook.findUnique({ where: { productId: id3 } }))!.lookJson).texture === 'dantel');
    check('aynı fotoğrafta model yeniden çağrılmaz (unchanged)', (await api('POST', `/looks/product/${id3}/refresh`, S)).json?.result === 'unchanged');
    check('başkası yenileyemez 403', (await api('POST', `/looks/product/${id3}/refresh`, B)).status === 403);
    await api('PATCH', `/products/${id3}`, S, { images: [] });
    let removed = false;
    for (let i = 0; i < 30 && !removed; i++) {
      await sleep(200);
      removed = !(await prisma.productLook.findUnique({ where: { productId: id3 } }));
    }
    check('fotoğraf kalkınca kart silinir', removed);

    console.log('Günlük sınır');
    await prisma.lookSearch.createMany({ data: Array.from({ length: 17 }, () => ({ userId: ub.id })) });
    check('20 aramadan sonra 429', (await api('POST', '/looks/search', B, { image: img(floral) })).status === 429);
  } finally {
    await prisma.lookSearch.deleteMany({ where: { userId: { in: [us.id, ub.id] } } });
    await prisma.product.deleteMany({ where: { companyId: seller.id } });
    await prisma.user.deleteMany({ where: { id: { in: [us.id, ub.id] } } });
    await prisma.company.deleteMany({ where: { id: { in: [seller.id, buyerCo.id] } } });
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
