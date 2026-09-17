// İplik dizini (Faz 2, Adım 6) uçtan uca API testi. Çalışan yerel sunucuya karşı:
//   node --env-file=.env --import tsx scripts/test-yarns-api.ts
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
  const mill = await prisma.company.create({ data: { name: `İplik Fabrika ${suffix}`, taxId: `91${suffix}`, companyCode: `IF-${suffix}`, city: 'Kahramanmaraş' } });
  const trader = await prisma.company.create({ data: { name: `İplik Tüccar ${suffix}`, taxId: `92${suffix}`, companyCode: `IT-${suffix}`, city: 'İstanbul' } });
  const mk = (phone: string, companyId: string | null) =>
    prisma.user.create({ data: { accountType: 'uretici', position: 'Test', firstName: 'Test', lastName: phone, phone, phoneVerified: true, companyId } });
  const um = await mk(`0581${suffix}`, mill.id);
  const ut = await mk(`0582${suffix}`, trader.id);
  const loner = await mk(`0583${suffix}`, null);
  const [M, T, L] = [um, ut, loner].map((u) => signSessionToken(u.id));
  const mine = (r: any, id: string) => r.json?.yarns?.some((y: any) => y.id === id);

  try {
    console.log('Seçenekler ve doğrulama');
    const opt = await api('GET', '/yarns/options');
    check('ana alanlar: fantezi ve elastan/gipe ayrı', opt.json?.families?.some((f: any) => f.key === 'fantezi') && opt.json.families.some((f: any) => f.key === 'elastan_gipe'));
    check('kullanım yerleri: triko, raşel, dokuma çözgü', ['triko', 'raschel', 'dokuma_cozgu', 'yuvarlak_orme'].every((k) => opt.json?.endUses?.some((u: any) => u.key === k)));
    check('firmasız 403', (await api('POST', '/yarns', L, { code: 'X', family: 'pamuk', count: 30, countUnit: 'ne' })).status === 403);
    check('bilinmeyen aile 400', (await api('POST', '/yarns', M, { code: 'X', family: 'ipek_bocegi', count: 30, countUnit: 'ne' })).status === 400);
    check('karışım toplamı 100 değil 400', (await api('POST', '/yarns', M, { code: 'X', family: 'karisim', count: 30, countUnit: 'ne', composition: [{ fiber: 'pamuk', percent: 60 }, { fiber: 'polyester', percent: 30 }] })).json?.details?.fieldErrors?.composition?.[0] === 'composition_total_not_100');
    check('bilinmeyen alan (uster) 400', (await api('POST', '/yarns', M, { code: 'X', family: 'pamuk', count: 30, countUnit: 'ne', uster: 9.5 })).status === 400);

    console.log('İplik girişi');
    const cotton = await api('POST', '/yarns', M, {
      code: `PM-30-${suffix}`, family: 'pamuk', count: 30, countUnit: 'ne', ply: 1, spinning: 'kompakt', combing: 'penye', twistDirection: 'Z', twistTpm: 820,
      endUses: ['yuvarlak_orme', 'triko'], colorState: 'ham', origin: 'Türkiye', coneWeightKg: 2.5, sellerRole: 'uretici', stock: 12000,
      composition: [{ fiber: 'pamuk', percent: 100 }], certificates: [{ name: 'gots', number: 'G-1' }], moq: 500, leadTimeDays: 7, priceValue: 3.4, priceCurrency: 'USD',
    });
    check('pamuk ipliği 201; tip iplik, stok kg', cotton.status === 201 && cotton.json?.yarn?.type === 'iplik' && cotton.json.yarn.stockUnit === 'kg', cotton.json);
    check('etiket "30/1 Ne", özet penye kompakt pamuk', cotton.json?.yarn?.yarn?.countLabel === '30/1 Ne' && /Penye Kompakt Pamuk/.test(cotton.json.yarn.yarn.summary), cotton.json?.yarn?.yarn);
    check('dtex karşılığı ≈ 196,9', Math.abs(cotton.json?.yarn?.yarn?.countDtex - 196.9) < 0.5, cotton.json?.yarn?.yarn?.countDtex);
    check('içerik özeti karışımı da taşır', /%100 Pamuk|100% Pamuk|Pamuk/.test(cotton.json?.yarn?.content ?? ''), cotton.json?.yarn?.content);
    const pes = await api('POST', '/yarns', T, {
      code: `PES-150-${suffix}`, family: 'polyester', count: 150, countUnit: 'denye', filaments: 48, filamentType: 'dty', luster: 'yari_mat',
      endUses: ['raschel', 'dokuma_atki'], colorState: 'dope_dyed', color: 'Siyah', sellerRole: 'tuccar', stock: 0, brand: 'Test Marka',
    });
    check('polyester 150/48 DTY (tüccar) 201', pes.status === 201 && pes.json?.yarn?.yarn?.countLabel === '150/48 denye' && /DTY Polyester/.test(pes.json.yarn.yarn.summary), pes.json);
    const gipe = await api('POST', '/yarns', T, { code: `GP-${suffix}`, family: 'elastan_gipe', count: 70, countUnit: 'denye', filaments: 24, variety: 'Tek kat gipe 20 den elastan + 70/24 PA', endUses: ['corap'] });
    const fancy = await api('POST', '/yarns', M, { code: `FN-${suffix}`, family: 'fantezi', count: 4, countUnit: 'nm', variety: 'Şönil', endUses: ['triko', 'dokuma_atki'] });
    check('gipe ve fantezi ayrı alanlarda', gipe.status === 201 && fancy.status === 201 && gipe.json.yarn.yarn.family === 'elastan_gipe' && fancy.json.yarn.yarn.family === 'fantezi');
    const [idC, idP, idG, idF] = [cotton, pes, gipe, fancy].map((r) => r.json.yarn.id as string);

    console.log('Arama (ana sorgular: numara, filament, çeşit)');
    check('aile: polyester', mine(await api('GET', '/yarns?family=polyester'), idP) && !mine(await api('GET', '/yarns?family=polyester'), idC));
    check('fantezi araması gipeyi getirmez', mine(await api('GET', '/yarns?family=fantezi'), idF) && !mine(await api('GET', '/yarns?family=fantezi'), idG));
    check('150 denye + 48 filament', mine(await api('GET', '/yarns?count=150&countUnit=denye&filaments=48'), idP));
    check('birim bağımsız: 167 dtex araması 150 denyeyi bulur', mine(await api('GET', '/yarns?count=167&countUnit=dtex'), idP));
    check('36 filament eşleşmez', !mine(await api('GET', '/yarns?count=150&countUnit=denye&filaments=36'), idP));
    check('Ne aralığı 28-32 → 30/1', mine(await api('GET', '/yarns?countMin=28&countMax=32&countUnit=ne'), idC) && !mine(await api('GET', '/yarns?countMin=36&countMax=40&countUnit=ne'), idC));
    check('eğirme + tarama', mine(await api('GET', '/yarns?spinning=kompakt&combing=penye'), idC) && !mine(await api('GET', '/yarns?spinning=open_end'), idC));
    check('filament tipi DTY', mine(await api('GET', '/yarns?filamentType=dty'), idP) && !mine(await api('GET', '/yarns?filamentType=fdy'), idP));
    check('kullanım yeri: raşel → polyester; triko → pamuk + fantezi', mine(await api('GET', '/yarns?endUse=raschel'), idP) && !mine(await api('GET', '/yarns?endUse=raschel'), idC) && mine(await api('GET', '/yarns?endUse=triko'), idC) && mine(await api('GET', '/yarns?endUse=triko'), idF));
    check('lif + sertifika', mine(await api('GET', '/yarns?fiber=pamuk&certificate=gots'), idC) && !mine(await api('GET', '/yarns?certificate=grs'), idC));
    check('stokta olanlar', mine(await api('GET', '/yarns?inStock=1'), idC) && !mine(await api('GET', '/yarns?inStock=1'), idP));
    check('tüccar süzgeci', mine(await api('GET', '/yarns?sellerRole=tuccar'), idP) && !mine(await api('GET', '/yarns?sellerRole=tuccar'), idC));
    check('metin: çeşit adı "şönil" ve marka', mine(await api('GET', `/yarns?search=${encodeURIComponent('Şönil')}`), idF) && mine(await api('GET', '/yarns?search=Test%20Marka'), idP));
    const paged = await api('GET', `/yarns?companyId=${trader.id}&limit=1`);
    check('sayfalama: hasMore + nextOffset', paged.json?.yarns?.length === 1 && paged.json?.hasMore === true && paged.json?.nextOffset === 1, paged.json);

    console.log('Kumaş kataloğundan ayrım ve ortak uçlar');
    check('kumaş listesinde iplik yok', !(await api('GET', `/products?companyId=${mill.id}`)).json?.products?.length);
    check('kumaş araması da getirmez', !(await api('GET', `/products?search=PM-30-${suffix}`)).json?.products?.length);
    const detail = await api('GET', `/products/${idC}`, T);
    check('ortak detay ucu iplik alanlarını döner, fiyatı başkasına vermez', detail.json?.product?.yarn?.spinning === 'kompakt' && detail.json.product.price == null && detail.json.product.priceValue == null, detail.json?.product);
    const own = await api('GET', `/products/${idC}`, M);
    check('sahibi fiyatı görür', JSON.stringify(own.json?.product ?? {}).includes('3.4'), own.json?.product);
    check('kumaş güncelleme ucu ipliği reddeder', (await api('PATCH', `/products/${idC}`, M, { stock: 5 })).json?.error === 'use_yarn_endpoint');
    check('favori ortak çalışır', [200, 201, 204].includes((await api('POST', `/products/${idC}/favorite`, T)).status) && (await api('GET', '/yarns?family=pamuk', T)).json?.yarns?.find((y: any) => y.id === idC)?.isFavorite === true);
    const co = await api('GET', `/companies/${mill.id}`);
    check('firma sayfası ürünlerinde iplik alanları', co.json?.company?.products?.some((p: any) => p.id === idC && p.yarn?.countLabel === '30/1 Ne'), co.json?.company?.products?.[0]);

    console.log('Düzenleme ve sahiplik');
    const upd = await api('PATCH', `/yarns/${idC}`, M, { count: 40, stock: 8000, endUses: ['dokuma_cozgu'], spinning: 'ring' });
    check('güncelleme: 40/1, dtex ve özet yeniden hesaplanır', upd.json?.yarn?.yarn?.countLabel === '40/1 Ne' && Math.abs(upd.json.yarn.yarn.countDtex - 147.7) < 0.5 && /Ring/.test(upd.json.yarn.content) && upd.json.yarn.stock === 8000, upd.json?.yarn);
    check('verilmeyen alanlar korunur (penye, GOTS, karışım)', upd.json?.yarn?.yarn?.combing === 'penye' && upd.json.yarn.certificateNames?.[0] === 'gots' && upd.json.yarn.composition?.[0]?.fiber === 'pamuk', upd.json?.yarn);
    check('başka firma düzenleyemez 403', (await api('PATCH', `/yarns/${idC}`, T, { stock: 1 })).status === 403);
    const fabricId = (await prisma.product.findFirst({ where: { type: { not: 'iplik' } }, select: { id: true } }))?.id;
    if (fabricId) check('kumaş iplik ucundan düzenlenemez 404', (await api('PATCH', `/yarns/${fabricId}`, M, { stock: 1 })).status === 404);
    check('silme ortak uçtan; YarnSpec de gider', (await api('DELETE', `/products/${idF}`, M)).status === 204 && (await prisma.yarnSpec.count({ where: { productId: idF } })) === 0);
  } finally {
    const companyIds = [mill.id, trader.id];
    await prisma.productFavorite.deleteMany({ where: { product: { companyId: { in: companyIds } } } });
    await prisma.productView.deleteMany({ where: { product: { companyId: { in: companyIds } } } });
    await prisma.product.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [um.id, ut.id, loner.id] } } });
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
