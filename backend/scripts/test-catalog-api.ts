// Aşama A (katalog, galeri, filtre, favori, son bakılan) uçtan uca API testi.
// Çalışan yerel sunucuya karşı, kendi test firmalarını/kullanıcılarını açıp
// sonunda siler. Çalıştırma (backend klasöründe, sunucu açıkken):
//   node --env-file=.env --import tsx scripts/test-catalog-api.ts
import { PrismaClient } from '@prisma/client';
import { signSessionToken } from '../src/auth';
import { MAX_RECENT_VIEWS } from '../src/products';

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
    console.log(`  HATA ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 300));
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

const img = (tag: string) => `data:image/jpeg;base64,${Buffer.from(`test-${tag}`).toString('base64')}`;
const ids = (list: any[]): string[] => (list ?? []).map((p: any) => p.id);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      // sunucu yeniden başlıyor
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Sunucu yanıt vermiyor');
}

async function main() {
  await waitForServer();
  const suffix = Date.now().toString().slice(-6);
  const sellerCo = await prisma.company.create({
    data: { name: `Test Satıcı ${suffix}`, taxId: `8${suffix}`, companyCode: `TST-S${suffix}` },
  });
  const otherCo = await prisma.company.create({
    data: { name: `Test Diğer ${suffix}`, taxId: `7${suffix}`, companyCode: `TST-O${suffix}` },
  });
  const mkUser = (phone: string, companyId: string | null, accountType: string) =>
    prisma.user.create({
      data: { accountType, position: 'Test', firstName: 'Test', lastName: phone, phone, phoneVerified: true, companyId },
    });
  const seller = await mkUser(`0591${suffix}`, sellerCo.id, 'uretici');
  const other = await mkUser(`0592${suffix}`, otherCo.id, 'uretici');
  const buyer = await mkUser(`0593${suffix}`, null, 'konfeksiyon');
  const [S, O, B] = [seller, other, buyer].map((u) => signSessionToken(u.id));

  try {
    console.log('Ürün oluşturma ve doğrulama');
    const base = {
      code: `T${suffix}-1`,
      type: 'orme',
      subtype: 'suprem',
      usages: ['tisortluk', 'taytlik'],
      stock: 450,
      stockUnit: 'kg',
      weightGsm: 180,
      widthCm: 170,
      content: '%95 Pamuk %5 Elastan',
      useArea: 'Test notu',
    };
    const created = await api('POST', '/products', S, { ...base, images: [img('a'), img('b')] });
    const p1 = created.json?.product;
    check('201 ile oluşur', created.status === 201, created);
    check('imageCount 2, hasImage', p1?.imageCount === 2 && p1?.hasImage === true, p1);
    check(
      'alt çeşit, kullanım, birim döner',
      p1?.subtype === 'suprem' && p1?.stockUnit === 'kg' && JSON.stringify(p1?.usages) === '["tisortluk","taytlik"]',
      p1
    );
    check('fotoğraf yanıtta yok', !JSON.stringify(created.json).includes('base64'));
    check('çeşide uymayan alt çeşit 400', (await api('POST', '/products', S, { ...base, subtype: 'poplin' })).status === 400);
    check('bilinmeyen kullanım 400', (await api('POST', '/products', S, { ...base, usages: ['yok'] })).status === 400);
    check(
      '7 fotoğraf 400',
      (await api('POST', '/products', S, { ...base, images: Array.from({ length: 7 }, (_, i) => img(`x${i}`)) })).status === 400
    );
    check(
      'data URL olmayan fotoğraf 400',
      (await api('POST', '/products', S, { ...base, images: ['https://example.com/a.jpg'] })).status === 400
    );
    check('firmasız kullanıcı 403', (await api('POST', '/products', B, base)).status === 403);
    check('oturumsuz 401', (await api('POST', '/products', undefined, base)).status === 401);

    console.log('Galeri');
    check('kapak = ilk fotoğraf', (await api('GET', `/products/${p1.id}/image`)).json?.imageUrl === img('a'));
    check('sıra 1 = ikinci fotoğraf', (await api('GET', `/products/${p1.id}/images/1`)).json?.imageUrl === img('b'));
    check('olmayan sıra 404', (await api('GET', `/products/${p1.id}/images/2`)).status === 404);
    check('geçersiz sıra 404', (await api('GET', `/products/${p1.id}/images/abc`)).status === 404);
    const reorder = await api('PATCH', `/products/${p1.id}`, S, { images: [{ existing: 1 }, img('c')] });
    check('yeniden sıralama + yeni fotoğraf 200', reorder.status === 200 && reorder.json?.product?.imageCount === 2, reorder);
    check('eski ikinci artık kapak', (await api('GET', `/products/${p1.id}/image`)).json?.imageUrl === img('b'));
    check('yeni fotoğraf sıra 1', (await api('GET', `/products/${p1.id}/images/1`)).json?.imageUrl === img('c'));
    const badExisting = await api('PATCH', `/products/${p1.id}`, S, { images: [{ existing: 5 }], code: 'DEGISMEMELI' });
    check('olmayan mevcut fotoğraf 400', badExisting.status === 400, badExisting);
    const afterBad = (await api('GET', `/products/${p1.id}`)).json?.product;
    check('hatalı istekte hiçbir şey değişmez', afterBad?.imageCount === 2 && afterBad?.code === base.code, afterBad);
    check('başka firma düzenleyemez 403', (await api('PATCH', `/products/${p1.id}`, O, { code: 'X' })).status === 403);

    console.log('Gönderi ekranı ürün seçici');
    const mine = (await api('GET', '/products/mine', S)).json?.products ?? [];
    const mineP1 = mine.find((p: any) => p.id === p1.id);
    check('/products/mine alt çeşit ve fotoğraf bilgisi', mineP1?.subtype === 'suprem' && mineP1?.hasImage === true, mineP1);
    check('/products/mine başka firmanın ürününü içermez', mine.every((p: any) => !String(p.code).startsWith(`T${suffix}-2`)));
    check('/products/mine firmasız kullanıcıya boş', ((await api('GET', '/products/mine', B)).json?.products ?? []).length === 0);
    const mineAll = (await api('GET', '/products/mine', S)).json;
    check('/products/mine toplam sayı döner', typeof mineAll?.total === 'number' && mineAll.total >= 1, mineAll?.total);
    const mineLimited = (await api('GET', '/products/mine?limit=1', S)).json;
    check('/products/mine limit uygulanır, toplam değişmez', mineLimited?.products?.length === 1 && mineLimited?.total === mineAll.total, mineLimited);
    const mineSearch = (await api('GET', `/products/mine?search=${encodeURIComponent('Süprem')}`, S)).json;
    check('/products/mine alt çeşit etiketiyle arar', ids(mineSearch?.products).includes(p1.id), mineSearch?.products?.length);
    const mineNoHit = (await api('GET', '/products/mine?search=zzzyok', S)).json;
    check('/products/mine eşleşme yoksa boş', mineNoHit?.products?.length === 0 && mineNoHit?.total === 0, mineNoHit);
    check('/products/mine geçersiz limit 400', (await api('GET', '/products/mine?limit=999', S)).status === 400);

    console.log('Akışta ürün fotoğrafı');
    const postRes = await api('POST', '/posts', S, { body: `Test gönderi ${suffix}`, productId: p1.id });
    check('ürünlü gönderi oluşur', postRes.status === 201, postRes);
    const feed = (await api('GET', '/posts', S)).json?.posts ?? [];
    const feedPost = feed.find((p: any) => p.id === postRes.json?.post?.id);
    check('akışta ürünün fotoğrafı olduğu bilgisi var', feedPost?.product?.hasImage === true, feedPost?.product);
    check('akışta ürün fotoğrafının kendisi gönderilmez', !JSON.stringify(feedPost?.product ?? {}).includes('base64'));
    check('gönderinin kendi fotoğrafı yok', feedPost?.hasImage === false, feedPost?.hasImage);
    check('test gönderisi silinir', (await api('DELETE', `/posts/${postRes.json?.post?.id}`, S)).status === 204);

    console.log('Çeşit / alt çeşit güncelleme');
    const typeChanged = await api('PATCH', `/products/${p1.id}`, S, { type: 'dokuma' });
    check('çeşit değişince alt çeşit boşalır', typeChanged.json?.product?.subtype === '', typeChanged);
    check('uymayan alt çeşit 400', (await api('PATCH', `/products/${p1.id}`, S, { subtype: 'suprem' })).status === 400);
    const restored = await api('PATCH', `/products/${p1.id}`, S, { type: 'orme', subtype: 'suprem' });
    check('çeşit + alt çeşit birlikte 200', restored.status === 200 && restored.json?.product?.subtype === 'suprem', restored);

    console.log('Eski uygulama sürümü uyumu');
    const legacy = await api('POST', '/products', S, {
      code: `T${suffix}-L`,
      type: 'raschel',
      stock: 100,
      weightGsm: 100,
      widthCm: 150,
      content: 'x',
      useArea: 'y',
      imageUrl: img('legacy'),
    });
    check(
      'imageUrl ile tek fotoğraf',
      legacy.status === 201 && legacy.json?.product?.imageCount === 1 && legacy.json?.product?.stockUnit === 'm',
      legacy
    );
    const legacyRemove = await api('PATCH', `/products/${legacy.json.product.id}`, S, { imageUrl: null });
    check('imageUrl null fotoğrafı kaldırır', legacyRemove.json?.product?.imageCount === 0, legacyRemove);

    console.log('Filtreler');
    const mk = async (token: string, body: object) => (await api('POST', '/products', token, body)).json.product;
    const p2 = await mk(O, {
      code: `T${suffix}-2`, type: 'raschel', subtype: 'astarlik', usages: ['astar'],
      stock: 2000, stockUnit: 'm', weightGsm: 120, widthCm: 150, content: 'Polyester',
    });
    const p3 = await mk(O, {
      code: `T${suffix}-3`, type: 'raschel', subtype: 'astarlik', usages: [],
      stock: 50, weightGsm: 130, widthCm: 140, content: 'Naylon',
    });
    const list = async (q: string) => ids((await api('GET', `/products?${q}`)).json?.products);
    const inOut = (got: string[], inc: any[], exc: any[]) =>
      inc.every((p) => got.includes(p.id)) && exc.every((p) => !got.includes(p.id));
    check('type', inOut(await list('type=orme'), [p1], [p2, p3]));
    check('usage tırnaklı eşleşir (astar, astarlik değil)', inOut(await list('usage=astar'), [p2], [p1, p3]));
    check('usage birden fazla', inOut(await list('usage=astar,tisortluk'), [p1, p2], [p3]));
    check('arama alt çeşit etiketi', inOut(await list(`search=${encodeURIComponent('Astarlık')}`), [p2, p3], [p1]));
    check('arama kullanım etiketi', inOut(await list(`search=${encodeURIComponent('Taytlık')}`), [p1], [p2, p3]));
    check('arama firma adı', inOut(await list(`search=${encodeURIComponent(`Test Satıcı ${suffix}`)}`), [p1], [p2]));
    check('stockUnit', inOut(await list('stockUnit=kg'), [p1], [p2, p3]));
    check('stockMin', inOut(await list(`stockMin=1000&companyId=${otherCo.id}`), [p2], [p3]));
    check('gramaj aralığı', inOut(await list(`gsmMin=125&gsmMax=135&companyId=${otherCo.id}`), [p3], [p2]));
    check('en aralığı', inOut(await list(`widthMin=145&widthMax=155&companyId=${otherCo.id}`), [p2], [p3]));
    check('içerik', inOut(await list(`content=Polyester&companyId=${otherCo.id}`), [p2], [p3]));
    check('geçersiz sayı 400', (await api('GET', '/products?stockMin=abc')).status === 400);
    check('geçersiz çeşit 400', (await api('GET', '/products?type=yok')).status === 400);

    console.log('Favoriler');
    check('favoriye ekle', (await api('POST', `/products/${p2.id}/favorite`, B)).json?.isFavorite === true);
    check('ikinci kez eklemek hata değil', (await api('POST', `/products/${p2.id}/favorite`, B)).status === 200);
    const favList = (await api('GET', `/products?companyId=${otherCo.id}`, B)).json.products;
    check(
      'listede isFavorite',
      favList.find((p: any) => p.id === p2.id)?.isFavorite === true && favList.find((p: any) => p.id === p3.id)?.isFavorite === false,
      favList
    );
    const anonList = (await api('GET', `/products?companyId=${otherCo.id}`)).json.products;
    check('oturumsuz listede false', anonList.every((p: any) => p.isFavorite === false));
    check('detayda isFavorite', (await api('GET', `/products/${p2.id}`, B)).json?.product?.isFavorite === true);
    const myFavs = (await api('GET', '/me/favorites', B)).json?.products;
    check('/me/favorites tek kayıt', ids(myFavs).filter((id) => id === p2.id).length === 1, myFavs);
    check('başka kullanıcının favorisi görünmez', !ids((await api('GET', '/me/favorites', O)).json?.products).includes(p2.id));
    check('favoriden çıkar', (await api('DELETE', `/products/${p2.id}/favorite`, B)).json?.isFavorite === false);
    check('çıkınca listede yok', !ids((await api('GET', '/me/favorites', B)).json?.products).includes(p2.id));
    check('olmayan ürün 404', (await api('POST', '/products/yok/favorite', B)).status === 404);
    check('oturumsuz favori 401', (await api('POST', `/products/${p2.id}/favorite`)).status === 401);

    console.log('Son bakılanlar');
    await api('GET', `/products/${p2.id}`, B);
    await api('GET', `/products/${p3.id}`, B);
    let recent = ids((await api('GET', '/me/recently-viewed', B)).json?.products);
    check('en son bakılan üstte', recent[0] === p3.id && recent[1] === p2.id, recent);
    await api('GET', `/products/${p2.id}`, B);
    recent = ids((await api('GET', '/me/recently-viewed', B)).json?.products);
    check('tekrar bakınca üste çıkar, çoğalmaz', recent[0] === p2.id && recent.filter((id) => id === p2.id).length === 1, recent);
    await api('GET', `/products/${p1.id}`, S);
    check('kendi ürünü kaydedilmez', !ids((await api('GET', '/me/recently-viewed', S)).json?.products).includes(p1.id));
    await api('GET', `/products/${p1.id}`);
    check('oturumsuz bakış kayıt açmaz', (await prisma.productView.count({ where: { productId: p1.id } })) === 0);
    check('geçmişi temizle 204', (await api('DELETE', '/me/recently-viewed', B)).status === 204);
    check('temizleyince boş', ((await api('GET', '/me/recently-viewed', B)).json?.products ?? []).length === 0);

    console.log(`Son bakılan sınırı (${MAX_RECENT_VIEWS})`);
    const bulkCodes = Array.from({ length: MAX_RECENT_VIEWS + 1 }, (_, i) => `T${suffix}-B${i}`);
    await prisma.product.createMany({
      data: bulkCodes.map((code) => ({
        companyId: otherCo.id, code, type: 'diger', stock: 1, weightGsm: 1, widthCm: 1, content: 'x',
      })),
    });
    const bulk = await prisma.product.findMany({ where: { code: { in: bulkCodes } }, select: { id: true } });
    const oldTime = Date.now() - 86_400_000;
    await prisma.productView.createMany({
      data: bulk.map((p, i) => ({ userId: buyer.id, productId: p.id, viewedAt: new Date(oldTime + i * 1000) })),
    });
    await api('GET', `/products/${p2.id}`, B);
    const capped = (await api('GET', '/me/recently-viewed', B)).json?.products ?? [];
    check('en fazla sınır kadar tutulur', capped.length === MAX_RECENT_VIEWS && capped[0].id === p2.id, capped.length);

    console.log('Silme ve temizlik');
    await api('POST', `/products/${p1.id}/favorite`, B);
    await api('GET', `/products/${p1.id}`, B);
    check('ürün silinir 204', (await api('DELETE', `/products/${p1.id}`, S)).status === 204);
    check('fotoğrafları gider', (await prisma.productImage.count({ where: { productId: p1.id } })) === 0);
    check('favorilerden gider', !ids((await api('GET', '/me/favorites', B)).json?.products).includes(p1.id));
    check('son bakılanlardan gider', !ids((await api('GET', '/me/recently-viewed', B)).json?.products).includes(p1.id));

    console.log('Firma sayfası');
    const company = (await api('GET', `/companies/${otherCo.id}`)).json?.company;
    const cp2 = company?.products?.find((p: any) => p.id === p2.id);
    check(
      'firma ürünlerinde yeni alanlar',
      Array.isArray(cp2?.usages) && typeof cp2?.imageCount === 'number' && cp2?.stockUnit === 'm',
      cp2
    );
  } finally {
    const userIds = [seller.id, other.id, buyer.id];
    const companyIds = [sellerCo.id, otherCo.id];
    const productIds = (
      await prisma.product.findMany({ where: { companyId: { in: companyIds } }, select: { id: true } })
    ).map((p) => p.id);
    await prisma.productFavorite.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { productId: { in: productIds } }] } });
    await prisma.productView.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { productId: { in: productIds } }] } });
    await prisma.sampleRequest.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
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
