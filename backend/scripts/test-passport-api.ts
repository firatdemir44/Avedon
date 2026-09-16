// Kumaş pasaportu (Faz 1, Adım 2) uçtan uca API testi. Çalışan yerel sunucuya
// karşı kendi test firmalarını/kullanıcılarını açıp sonunda siler.
// Çalıştırma (backend klasöründe, sunucu açıkken):
//   node --env-file=.env --import tsx scripts/test-passport-api.ts
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
    data: { name: `Pasaport Satıcı ${suffix}`, taxId: `6${suffix}`, companyCode: `PSP-S${suffix}` },
  });
  const otherCo = await prisma.company.create({
    data: { name: `Pasaport Diğer ${suffix}`, taxId: `5${suffix}`, companyCode: `PSP-O${suffix}` },
  });
  const mkUser = (phone: string, companyId: string | null, isAdmin = false) =>
    prisma.user.create({
      data: { accountType: 'uretici', position: 'Test', firstName: 'Test', lastName: phone, phone, phoneVerified: true, companyId, isAdmin },
    });
  const seller = await mkUser(`0581${suffix}`, sellerCo.id);
  const other = await mkUser(`0582${suffix}`, otherCo.id);
  const buyer = await mkUser(`0583${suffix}`, null);
  const admin = await mkUser(`0584${suffix}`, null, true);
  const [S, O, B, A] = [seller, other, buyer, admin].map((u) => signSessionToken(u.id));

  const base = {
    code: `P${suffix}-1`,
    type: 'orme',
    subtype: 'suprem',
    usages: ['tisortluk'],
    stock: 500,
    stockUnit: 'kg',
    weightGsm: 180,
    widthCm: 180,
  };

  try {
    console.log('Kompozisyon ile oluşturma');
    const created = await api('POST', '/products', S, {
      ...base,
      composition: [
        { fiber: 'pamuk', percent: 95 },
        { fiber: 'elastan', percent: 5 },
      ],
      widthType: 'tup',
      moq: 300,
      moqUnit: 'm',
      leadTimeDays: 15,
      priceValue: 4.5,
      priceCurrency: 'USD',
      priceUnit: 'kg',
      finishTags: ['sardonlu', 'yikamali'],
      yarns: [{ role: 'ana', count: 30, unit: 'ne', ply: 1, yarnType: 'penye' }],
      certificates: [{ name: 'oeko_tex_100', number: 'OT-123', validUntil: '2027-12-31', image: img('cert') }],
      testReports: [{ kind: 'Çekme', result: '%3', testedAt: '2026-01-15' }],
    });
    const p1 = created.json?.product;
    check('201 ile oluşur', created.status === 201, created.json);
    check('içerik metni kompozisyondan üretilir', p1?.content === '%95 Pamuk %5 Elastan', p1?.content);
    check('kompozisyon yanıtta', JSON.stringify(p1?.composition) === JSON.stringify([{ fiber: 'pamuk', percent: 95 }, { fiber: 'elastan', percent: 5 }]), p1?.composition);
    check('ticari alanlar yanıtta', p1?.widthType === 'tup' && p1?.moq === 300 && p1?.moqUnit === 'm' && p1?.leadTimeDays === 15, p1);
    check('fiyat sahibine döner', p1?.price?.value === 4.5 && p1?.price?.currency === 'USD' && p1?.price?.unit === 'kg', p1?.price);
    check('apre etiketleri', JSON.stringify(p1?.finishTags) === '["sardonlu","yikamali"]', p1?.finishTags);
    check('sertifika adları listede', JSON.stringify(p1?.certificateNames) === '["oeko_tex_100"]', p1?.certificateNames);
    check('belge fotoğrafı yanıtta yok', !JSON.stringify(created.json).includes('dGVzdC1jZXJ0'));
    check('uyarı yok (makul değerler)', created.json?.warnings?.codes?.length === 0, created.json?.warnings);
    check('pendingFieldCount 0 (elle girildi)', p1?.pendingFieldCount === 0, p1?.pendingFieldCount);

    console.log('Detay ve fiyat gizliliği');
    const detailOwner = (await api('GET', `/products/${p1.id}`, S)).json?.product;
    check('detayda iplik', detailOwner?.yarns?.[0]?.count === 30 && detailOwner?.yarns?.[0]?.yarnType === 'penye', detailOwner?.yarns);
    check('detayda sertifika ve fotoğraf işareti', detailOwner?.certificates?.[0]?.number === 'OT-123' && detailOwner?.certificates?.[0]?.hasImage === true, detailOwner?.certificates);
    check('detayda test raporu', detailOwner?.testReports?.[0]?.kind === 'Çekme' && detailOwner?.testReports?.[0]?.hasImage === false, detailOwner?.testReports);
    check('detayda fiyat (sahip)', detailOwner?.price?.value === 4.5);
    check('sahibe fieldMeta listesi', Array.isArray(detailOwner?.fieldMeta));
    const detailOther = (await api('GET', `/products/${p1.id}`, O)).json?.product;
    check('başka firma fiyatı görmez', detailOther && !('price' in detailOther), Object.keys(detailOther ?? {}));
    check('başka firma fieldMeta görmez', detailOther && !('fieldMeta' in detailOther));
    const detailAnon = (await api('GET', `/products/${p1.id}`)).json?.product;
    check('oturumsuz fiyat görmez', detailAnon && !('price' in detailAnon) && !JSON.stringify(detailAnon).includes('4.5'));
    const listAnon = (await api('GET', `/products?companyId=${sellerCo.id}`)).json?.products ?? [];
    check('liste yanıtında fiyat yok', !JSON.stringify(listAnon).includes('"price"'));
    check('liste yanıtında iplik/test raporu yok (hafif)', !JSON.stringify(listAnon).includes('"yarns"') && !JSON.stringify(listAnon).includes('"testReports"'));
    check('sertifika belgesi ayrı uçtan', (await api('GET', `/products/${p1.id}/certificates/0/image`)).json?.imageUrl === img('cert'));
    check('olmayan belge 404', (await api('GET', `/products/${p1.id}/certificates/1/image`)).status === 404);
    check('test raporu fotoğrafsız 404', (await api('GET', `/products/${p1.id}/test-reports/0/image`)).status === 404);

    console.log('Doğrulama');
    check('bilinmeyen lif 400', (await api('POST', '/products', S, { ...base, code: 'X1', composition: [{ fiber: 'uzaylif', percent: 100 }] })).status === 400);
    check('bilinmeyen sertifika 400', (await api('POST', '/products', S, { ...base, code: 'X2', content: 'x', certificates: [{ name: 'yok' }] })).status === 400);
    check('bilinmeyen apre 400', (await api('POST', '/products', S, { ...base, code: 'X3', content: 'x', finishTags: ['yok'] })).status === 400);
    check('geçersiz en tipi 400', (await api('POST', '/products', S, { ...base, code: 'X4', content: 'x', widthType: 'yuvarlak' })).status === 400);
    check('içerik ve kompozisyon yoksa 400', (await api('POST', '/products', S, { ...base, code: 'X5' })).status === 400);
    check('bilinmeyen iplik birimi 400', (await api('POST', '/products', S, { ...base, code: 'X6', content: 'x', yarns: [{ count: 30, unit: 'adet' }] })).status === 400);
    const total98 = await api('POST', '/products', S, { ...base, code: `P${suffix}-98`, composition: [{ fiber: 'pamuk', percent: 95 }, { fiber: 'elastan', percent: 3 }] });
    check('toplam 98 → kayıt olur, uyarı döner', total98.status === 201 && total98.json?.warnings?.codes?.includes('composition_total_98'), total98.json?.warnings);
    const implausible = await api('POST', '/products', S, { ...base, code: `P${suffix}-imp`, weightGsm: 900, content: '%100 Pamuk' });
    check('makul olmayan gramaj → kayıt olur, uyarı döner', implausible.status === 201 && implausible.json?.warnings?.codes?.includes('gsm_high'), implausible.json?.warnings);
    check('uyarı notu Türkçe', typeof implausible.json?.warnings?.notes?.[0] === 'string' && implausible.json.warnings.notes[0].includes('Gramaj'));

    console.log('Eski istemci uyumu (yalnızca content)');
    const legacy = await api('POST', '/products', S, { ...base, code: `P${suffix}-L`, content: '%80 Pamuk %20 Polyester', useArea: 'x' });
    const pl = legacy.json?.product;
    check('yalnızca content ile 201', legacy.status === 201, legacy.json);
    check('content ayrıştırılıp kompozisyona yazılır', JSON.stringify(pl?.composition) === JSON.stringify([{ fiber: 'pamuk', percent: 80 }, { fiber: 'polyester', percent: 20 }]), pl?.composition);
    check('ayrıştırılan alan onay bekler', pl?.pendingFieldCount === 1, pl?.pendingFieldCount);
    const legacyDetail = (await api('GET', `/products/${pl.id}`, S)).json?.product;
    check('fieldMeta: composition / parsed_content', legacyDetail?.fieldMeta?.[0]?.field === 'composition' && legacyDetail?.fieldMeta?.[0]?.source === 'parsed_content', legacyDetail?.fieldMeta);
    const confirm = await api('POST', `/products/${pl.id}/fields/confirm`, S, { fields: ['composition'] });
    check('alan onaylanır', confirm.json?.confirmed === 1 && confirm.json?.pendingFieldCount === 0, confirm.json);
    check('başkası onaylayamaz 403', (await api('POST', `/products/${pl.id}/fields/confirm`, O, { fields: ['composition'] })).status === 403);
    const unparsed = await api('POST', '/products', S, { ...base, code: `P${suffix}-U`, content: 'Özel karışım, bilgi yok' });
    check('ayrıştırılamayan metin düz kalır, kompozisyon boş', unparsed.status === 201 && unparsed.json?.product?.composition?.length === 0 && unparsed.json?.product?.content === 'Özel karışım, bilgi yok', unparsed.json?.product);
    check('ayrıştırılamayan metinde uyarı yok (lif yok)', !unparsed.json?.warnings?.codes?.includes('composition_unparsed'));

    console.log('Güncelleme');
    const upd = await api('PATCH', `/products/${p1.id}`, S, {
      composition: [{ fiber: 'polyester', percent: 92 }, { fiber: 'elastan', percent: 8 }],
      certificates: [{ name: 'grs' }, { name: 'oeko_tex_100', number: 'OT-123', image: { existing: 0 } }],
      priceValue: null,
    });
    check('kompozisyon değişir, content yenilenir', upd.status === 200 && upd.json?.product?.content === '%92 Polyester %8 Elastan', upd.json?.product?.content);
    check('fiyat null ile temizlenir', upd.json?.product?.price === null, upd.json?.product?.price);
    check('sertifika yeniden sıralandı, belge korundu', (await api('GET', `/products/${p1.id}/certificates/1/image`)).json?.imageUrl === img('cert'));
    check('yeni ilk sertifika belgesiz 404', (await api('GET', `/products/${p1.id}/certificates/0/image`)).status === 404);
    const badExisting = await api('PATCH', `/products/${p1.id}`, S, { certificates: [{ name: 'grs', image: { existing: 7 } }], code: 'DEGISMEMELI' });
    check('olmayan mevcut belge 400', badExisting.status === 400, badExisting.json);
    check('hatalı istekte hiçbir şey değişmez', (await api('GET', `/products/${p1.id}`, S)).json?.product?.code === base.code);
    const contentOnly = await api('PATCH', `/products/${p1.id}`, S, { content: '%100 Pamuk' });
    check('yalnızca content güncellenince yeniden ayrıştırılır', JSON.stringify(contentOnly.json?.product?.composition) === JSON.stringify([{ fiber: 'pamuk', percent: 100 }]), contentOnly.json?.product?.composition);
    const untouched = await api('PATCH', `/products/${p1.id}`, S, { stock: 999 });
    check('pasaportsuz güncelleme kompozisyona dokunmaz', untouched.json?.product?.composition?.length === 1 && untouched.json?.product?.stock === 999, untouched.json?.product);
    check('başka firma pasaportu değiştiremez', (await api('PATCH', `/products/${p1.id}`, O, { moq: 1 })).status === 403);

    console.log('Filtreler');
    const p2 = (await api('POST', '/products', O, { ...base, code: `P${suffix}-2`, composition: [{ fiber: 'viskon', percent: 70 }, { fiber: 'polyester', percent: 30 }], moq: 1000, leadTimeDays: 45, widthType: 'acik', certificates: [{ name: 'gots' }] })).json.product;
    const p3 = (await api('POST', '/products', O, { ...base, code: `P${suffix}-3`, composition: [{ fiber: 'pamuk', percent: 97 }, { fiber: 'elastan', percent: 3 }], moq: 200, leadTimeDays: 10, widthType: 'tup' })).json.product;
    const list = async (q: string) => ids((await api('GET', `/products?companyId=${otherCo.id}&${q}`)).json?.products);
    const inOut = (got: string[], inc: any[], exc: any[]) => inc.every((p) => got.includes(p.id)) && exc.every((p) => !got.includes(p.id));
    check('fiber=viskon', inOut(await list('fiber=viskon'), [p2], [p3]));
    check('fiber=elastan&fiberMinPercent=5 (p3 %3 dışarıda)', inOut(await list('fiber=elastan&fiberMinPercent=5'), [], [p2, p3]));
    check('fiber=pamuk,viskon', inOut(await list('fiber=pamuk,viskon'), [p2, p3], []));
    check('certificate=gots', inOut(await list('certificate=gots'), [p2], [p3]));
    check('moqMax=500', inOut(await list('moqMax=500'), [p3], [p2]));
    check('leadTimeMax=30', inOut(await list('leadTimeMax=30'), [p3], [p2]));
    check('widthType=acik', inOut(await list('widthType=acik'), [p2], [p3]));
    check('geçersiz widthType 400', (await api('GET', '/products?widthType=yuvarlak')).status === 400);
    check('arama eşanlamlısı: single jersey → süprem', ids((await api('GET', `/products?search=${encodeURIComponent('single jersey')}`)).json?.products).includes(p2.id));

    console.log('Geriye doldurma (admin)');
    // Kompozisyonsuz ürün: doğrudan veritabanına (eski kayıt gibi)
    const old = await prisma.product.create({
      data: { companyId: otherCo.id, code: `P${suffix}-OLD`, type: 'orme', stock: 1, weightGsm: 1, widthCm: 1, content: '%60 Pamuk %40 Polyester' },
    });
    const dry = await api('POST', '/admin/products/backfill-composition?dryRun=1', A);
    const dryRow = dry.json?.report?.find((r: any) => r.id === old.id);
    check('dry-run listeler, yazmaz', dry.json?.dryRun === true && dryRow?.action === 'write' && dry.json?.written === 0, dry.json);
    check('dry-run sonrası kompozisyon yok', (await prisma.productComposition.count({ where: { productId: old.id } })) === 0);
    const wet = await api('POST', '/admin/products/backfill-composition', A);
    check('gerçek çalıştırma yazar', wet.json?.written >= 1, wet.json?.written);
    check('eski ürüne kompozisyon yazıldı', (await prisma.productComposition.count({ where: { productId: old.id } })) === 2);
    check('eski ürün onay bekler', (await api('GET', `/products/${old.id}`, O)).json?.product?.pendingFieldCount === 1);
    check('admin olmayan 403', (await api('POST', '/admin/products/backfill-composition?dryRun=1', S)).status === 403);

    console.log('Silme');
    check('ürün silinir', (await api('DELETE', `/products/${p1.id}`, S)).status === 204);
    check('alt tablolar cascade ile gider', (await prisma.productComposition.count({ where: { productId: p1.id } })) === 0 && (await prisma.productCertificate.count({ where: { productId: p1.id } })) === 0 && (await prisma.productFieldMeta.count({ where: { productId: p1.id } })) === 0);
  } finally {
    const userIds = [seller.id, other.id, buyer.id, admin.id];
    const companyIds = [sellerCo.id, otherCo.id];
    const productIds = (await prisma.product.findMany({ where: { companyId: { in: companyIds } }, select: { id: true } })).map((p) => p.id);
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
