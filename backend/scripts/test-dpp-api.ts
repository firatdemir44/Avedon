// AB Dijital Ürün Pasaportu'na hazırlık (Faz 3, Adım 7) uçtan uca API testi:
//   node --env-file=.env --import tsx scripts/test-dpp-api.ts
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
    console.log(`  HATA ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 600));
  }
}

async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('json')) return { status: res.status, json: null as any, type, bytes: new Uint8Array(await res.arrayBuffer()) };
  return { status: res.status, json: (await res.json()) as any, type, bytes: null };
}

async function main() {
  const suffix = Date.now().toString().slice(-6);
  const co = await prisma.company.create({ data: { name: `DPP Firma ${suffix}`, taxId: `41${suffix}`, companyCode: `DP-${suffix}`, city: 'Denizli', verification: 'dogrulanmis', verificationLevel: 'belge', verifiedAt: new Date() } });
  const other = await prisma.company.create({ data: { name: `DPP Başka ${suffix}`, taxId: `42${suffix}`, companyCode: `DB-${suffix}` } });
  const mk = (phone: string, companyId: string) =>
    prisma.user.create({ data: { accountType: 'uretici', position: 'Test', firstName: 'Test', lastName: phone, phone, phoneVerified: true, companyId } });
  const owner = await mk(`0531${suffix}`, co.id);
  const stranger = await mk(`0532${suffix}`, other.id);
  const [O, X] = [owner, stranger].map((u) => signSessionToken(u.id));

  try {
    console.log('Hazırlık alanları ürün kaydında');
    const made = await api('POST', '/products', O, {
      code: `DPP-${suffix}`, type: 'dokuma', subtype: '', stock: 1200, stockUnit: 'm', weightGsm: 140, widthCm: 150,
      composition: [{ fiber: 'pamuk', percent: 70 }, { fiber: 'polyester', percent: 30 }],
      certificates: [{ name: 'oeko_tex_100', number: 'OT-123' }],
      priceValue: 3.2, priceCurrency: 'USD', priceUnit: 'm', moq: 500, moqUnit: 'm', leadTimeDays: 15,
      originCountry: 'Türkiye', careNotes: '30°C yıkama, ağartıcı kullanmayın', recycledPercent: 30,
    });
    check('ürün 201; yeni alanlar kaydedildi', made.status === 201 && made.json?.product?.originCountry === 'Türkiye' && made.json.product.recycledPercent === 30, made.json);
    const id = made.json.product.id as string;
    check('geri dönüştürülmüş oran 0-100 dışı 400', (await api('PATCH', `/products/${id}`, O, { recycledPercent: 140 })).status === 400);
    const bare = await api('POST', '/products', O, { code: `DPB-${suffix}`, type: 'dokuma', stock: 10, stockUnit: 'm', weightGsm: 100, widthCm: 140, content: 'pamuklu' });

    console.log('Herkese açık pasaport');
    const pub = await api('GET', `/dpp/${id}`);
    const p = pub.json?.passport;
    check('oturumsuz okunur; şema ve uyarı var', pub.status === 200 && p?.schema === 'avedon-dpp-hazirlik/1' && /HAZIRLIK/.test(p.disclaimer), pub.json);
    check('"uyumlu" iddiası yok', !/uyumludur|compliant/i.test(JSON.stringify(p)));
    check('içerik, menşe, bakım, geri dönüşüm, sertifika numarasıyla', p?.composition?.[0]?.fiberLabel && p.originCountry === 'Türkiye' && p.care.includes('30°C') && p.recycledContentPercent === 30 && p.certificates?.[0]?.number === 'OT-123', p);
    check('ekonomik işletmeci ve doğrulama düzeyi', p?.economicOperator?.name === co.name && p.economicOperator.verified === true && p.economicOperator.verificationLevel === 'belge');
    const dump = JSON.stringify(pub.json);
    check('TİCARİ alanlar dışa çıkmaz (fiyat, stok, MOQ, termin)', !/price|3\.2|stock|1200|moq|leadTime/i.test(dump), dump.slice(0, 300));
    check('pasaport adresi QR sayfasını gösterir', /\/pasaport\.html\?id=/.test(p?.identifier?.url ?? ''), p?.identifier);
    check('dışarıdan eksik listesi görünmez, yüzde görünür', pub.json?.missing === undefined && typeof pub.json?.completenessPercent === 'number');
    check('başka firma da eksik listesini göremez', (await api('GET', `/dpp/${id}`, X)).json?.missing === undefined);

    console.log('Satıcıya eksik listesi');
    const mine = await api('GET', `/dpp/${id}`, O);
    const keys = (mine.json?.missing ?? []).map((m: any) => m.key);
    check('dolu üründe yalnızca fotoğraf, test raporu, iplik eksik', keys.sort().join() === ['photo', 'testReports', 'yarns'].sort().join() && mine.json.completenessPercent === 85, mine.json);
    const bareView = await api('GET', `/dpp/${bare.json.product.id}`, O);
    check('boş üründe içerik, menşe, sertifika... eksik ve yüzde düşük', ['composition', 'origin', 'certificates', 'care', 'recycled'].every((k) => bareView.json?.missing?.some((m: any) => m.key === k)) && bareView.json.completenessPercent <= 10, bareView.json);

    console.log('QR');
    const qr = await api('GET', `/dpp/${id}/qr.png`);
    check('PNG döner', qr.status === 200 && qr.type.includes('image/png') && qr.bytes![0] === 0x89 && qr.bytes![1] === 0x50 && qr.bytes!.length > 500, [qr.status, qr.type]);
    check('olmayan ürün 404', (await api('GET', '/dpp/yok')).status === 404 && (await api('GET', '/dpp/yok/qr.png')).status === 404);
  } finally {
    await prisma.product.deleteMany({ where: { companyId: co.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, stranger.id] } } });
    await prisma.company.deleteMany({ where: { id: { in: [co.id, other.id] } } });
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
