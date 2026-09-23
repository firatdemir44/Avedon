// Açık talep / ihale API testi:
//   node --env-file=.env --import tsx scripts/test-tenders-api.ts
import { PrismaClient } from '@prisma/client';
import { signSessionToken } from '../src/auth';

const prisma = new PrismaClient();
const BASE = process.env.API_BASE ?? 'http://localhost:4000/api';
let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) { passed++; console.log(`  ok   ${name}`); } else { failed++; console.log(`  HATA ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 600)); }
}
async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(BASE + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

async function main() {
  const suffix = Date.now().toString().slice(-6);
  const mkCo = (n: string, companyType = '') => prisma.company.create({ data: { name: `İhale ${n} ${suffix}`, taxId: `14${suffix}${n.length}`, companyCode: `IH-${n}-${suffix}`, companyType } });
  const buyerCo = await mkCo('Alici');
  const polyCo = await mkCo('Polyester');
  const cottonCo = await mkCo('Pamuk');
  const typeCo = await mkCo('Tip', 'iplik');
  const mk = (n: number, companyId: string | null) => prisma.user.create({ data: { accountType: companyId ? 'uretici' : 'bireysel', position: 'Test', firstName: `Ihale${n}`, lastName: 'Test', phone: `0596${suffix}${n}`, phoneVerified: true, companyId } });
  const buyer = await mk(1, buyerCo.id);
  const poly = await mk(2, polyCo.id);
  const cotton = await mk(3, cottonCo.id);
  const byType = await mk(4, typeCo.id);
  const nobody = await mk(5, null);
  const B = signSessionToken(buyer.id), P = signSessionToken(poly.id), C = signSessionToken(cotton.id), T = signSessionToken(byType.id), N = signSessionToken(nobody.id);
  // Polyester ve pamuk iplik ürünleri (kategori eşleşmesi için)
  const mkYarn = async (companyId: string, family: string) => {
    const p = await prisma.product.create({ data: { companyId, code: `Y-${family}-${suffix}`, type: 'iplik', subtype: '', stock: 100, stockUnit: 'kg', weightGsm: 0, widthCm: 0, content: '' } });
    await prisma.yarnSpec.create({ data: { productId: p.id, family, count: 150, countUnit: 'denye', countDtex: 167 } });
    return p;
  };
  await mkYarn(polyCo.id, 'polyester');
  await mkYarn(cottonCo.id, 'pamuk');
  const created: string[] = [];

  try {
    console.log('Talep oluşturma');
    check('oturumsuz 401', (await api('POST', '/tenders', undefined, {})).status === 401);
    check('geçersiz gövde 400', (await api('POST', '/tenders', B, { category: 'iplik', title: 'x', quantity: 1, unit: 'kg' })).status === 400);
    check('kategoriye uymayan özellik 400', (await api('POST', '/tenders', B, { category: 'iplik', title: 'Polyester iplik', quantity: 7, unit: 'ton', spec: { weightGsm: 200 } })).json?.error === 'invalid_spec');
    const t = await api('POST', '/tenders', B, { category: 'iplik', title: 'Polyester iplik 96 filament', quantity: 7, unit: 'ton', spec: { family: 'polyester', filaments: 96, count: 150, countUnit: 'denye' }, note: 'Ham, bobinli.', deadline: new Date(Date.now() + 7 * 86400000).toISOString() });
    check('talep 201, özet ve akış kartı', t.status === 201 && t.json?.tender?.summary === 'Polyester · 96 filament · 150 Denye · 7 ton' && !!t.json.tender.postId && t.json.tender.acceptingOffers === true, t.json);
    created.push(t.json.tender.id);
    check('yalnızca polyester ipliği olanlar + iplik üreticisi tipi bildirildi (2)', t.json.notified === 2, t.json.notified);
    const polyNotes = (await api('GET', '/notifications', P)).json?.notifications?.filter((n: any) => n.kind === 'tender_new') ?? [];
    const cottonNotes = (await api('GET', '/notifications', C)).json?.notifications?.filter((n: any) => n.kind === 'tender_new') ?? [];
    check('polyesterciye bildirim var, pamukçuya yok', polyNotes.length === 1 && polyNotes[0].data.tenderId === t.json.tender.id && cottonNotes.length === 0, { polyNotes, cottonNotes });
    const feed = await api('GET', '/posts?limit=5', C);
    const card = feed.json?.posts?.find((p: any) => p.tender?.id === t.json.tender.id);
    check('akışta talep kartı (herkese)', !!card && card.tender.summary.includes('96 filament') && card.tender.offerCount === 0, feed.json?.posts?.slice(0, 2));

    console.log('Liste');
    const open = await api('GET', '/tenders?scope=open&category=iplik', C);
    check('açık talepler listesinde', open.json?.tenders?.some((x: any) => x.id === t.json.tender.id && x.isMine === false && x.buyer?.company?.name === buyerCo.name), open.json);
    check('benimkiler', (await api('GET', '/tenders?scope=mine', B)).json?.tenders?.[0]?.isMine === true);

    console.log('Teklif');
    check('firmasız kullanıcı 400', (await api('POST', `/tenders/${t.json.tender.id}/offers`, N, { priceValue: 2, priceCurrency: 'USD', priceUnit: 'kg' })).json?.error === 'no_company');
    check('kendi talebine 400', (await api('POST', `/tenders/${t.json.tender.id}/offers`, B, { priceValue: 2, priceCurrency: 'USD', priceUnit: 'kg' })).json?.error === 'own_tender');
    const o1 = await api('POST', `/tenders/${t.json.tender.id}/offers`, P, { priceValue: 2.1, priceCurrency: 'USD', priceUnit: 'kg', leadTimeDays: 20, moq: 1000, moqUnit: 'kg' });
    check('polyesterci teklif 201', o1.status === 201 && o1.json?.offer?.price?.value === 2.1, o1.json);
    const o1b = await api('POST', `/tenders/${t.json.tender.id}/offers`, P, { priceValue: 2.0, priceCurrency: 'USD', priceUnit: 'kg', leadTimeDays: 15 });
    check('aynı firma ikinci gönderim: güncelleme (tek teklif)', o1b.status === 200 && o1b.json?.updated === true && (await prisma.tenderOffer.count({ where: { tenderId: t.json.tender.id } })) === 1);
    const o2 = await api('POST', `/tenders/${t.json.tender.id}/offers`, C, { priceValue: 1.9, priceCurrency: 'USD', priceUnit: 'kg', leadTimeDays: 30 });
    check('pamukçu da teklif verebilir (bildirim almasa da) 201', o2.status === 201);
    const buyerNotes = (await api('GET', '/notifications', B)).json?.notifications?.filter((n: any) => n.kind === 'tender_offer') ?? [];
    check('alıcıya her teklifte bildirim (3)', buyerNotes.length === 3 && buyerNotes.some((n: any) => n.title.includes(polyCo.name)), buyerNotes.map((n: any) => n.title));

    console.log('Görünürlük');
    const asBuyer = await api('GET', `/tenders/${t.json.tender.id}`, B);
    check('alıcı iki teklifi satıcı adıyla görür', asBuyer.json?.offers?.length === 2 && asBuyer.json.offers.every((o: any) => o.seller?.company?.name) && asBuyer.json.tender.offerCount === 2, asBuyer.json);
    const asPoly = await api('GET', `/tenders/${t.json.tender.id}`, P);
    check('satıcı yalnızca kendi teklifini görür, rakibi görmez', asPoly.json?.offers?.length === 1 && asPoly.json.myOffer?.price?.value === 2.0 && !JSON.stringify(asPoly.json.offers).includes(cottonCo.name), asPoly.json);
    const asType = await api('GET', `/tenders/${t.json.tender.id}`, T);
    check('teklif vermeyen satıcı teklifleri görmez, sayıyı görür', asType.json?.offers?.length === 0 && asType.json.tender.offerCount === 2);
    check('teklif verdiklerim listesi', (await api('GET', '/tenders?scope=offered', P)).json?.tenders?.[0]?.myCompanyOffered === true);

    console.log('Seçim ve kapanış');
    const polyOfferId = asBuyer.json.offers.find((o: any) => o.sellerCompanyId === polyCo.id).id;
    check('başkası seçemez 403', (await api('POST', `/tenders/${t.json.tender.id}/offers/${polyOfferId}/accept`, C)).status === 403);
    check('alıcı seçer', (await api('POST', `/tenders/${t.json.tender.id}/offers/${polyOfferId}/accept`, B)).status === 200);
    const after = await api('GET', `/tenders/${t.json.tender.id}`, B);
    check('talep awarded, seçilen accepted, diğeri declined', after.json?.tender?.status === 'awarded' && after.json.tender.awardedOfferId === polyOfferId && after.json.offers.find((o: any) => o.id === polyOfferId).status === 'accepted' && after.json.offers.find((o: any) => o.id !== polyOfferId).status === 'declined', after.json);
    check('seçilene ve kaybedene bildirim', ((await api('GET', '/notifications', P)).json?.notifications ?? []).some((n: any) => n.kind === 'tender_awarded') && ((await api('GET', '/notifications', C)).json?.notifications ?? []).some((n: any) => n.kind === 'tender_closed'));
    check('kapalı talebe teklif 409', (await api('POST', `/tenders/${t.json.tender.id}/offers`, T, { priceValue: 1, priceCurrency: 'USD', priceUnit: 'kg' })).json?.error === 'tender_closed');
    check('açık listede artık yok', !(await api('GET', '/tenders?scope=open', C)).json?.tenders?.some((x: any) => x.id === t.json.tender.id));

    console.log('Konfeksiyon talebi ve ekler');
    const img = 'data:image/jpeg;base64,' + Buffer.from('numune-yakin').toString('base64');
    const pdfDoc = 'data:application/pdf;base64,' + Buffer.from('%PDF teknik foy').toString('base64');
    const vid = await prisma.video.create({ data: { ownerId: buyer.id, streamUid: `tender-${suffix}`, status: 'ready', durationSeconds: 10 } });
    const k = await api('POST', '/tenders', B, {
      category: 'konfeksiyon', title: 'Basic tişört fason', quantity: 5000, unit: 'adet',
      spec: { garmentType: 'tisort', fabric: '30/1 süprem %100 pamuk', fabricSupplied: 'alici', sizes: 'S:1000 M:2000 L:1500 XL:500', delivery: ['kesim', 'dikim', 'utu', 'paket', 'poset'] },
      media: [{ dataUrl: img, caption: 'yakın' }, { dataUrl: img, caption: 'uzak' }, { dataUrl: pdfDoc, caption: 'teknik föy' }],
      videoIds: [vid.id],
    });
    check('konfeksiyon talebi 201 + özet', k.status === 201 && k.json.tender.summary === 'Tişört · 30/1 süprem %100 pamuk · Kesim, Dikim, Ütü, Paket, Poşet · 5000 adet', k.json);
    created.push(k.json?.tender?.id);
    const kd = await api('GET', `/tenders/${k.json.tender.id}`, C);
    check('detayda 3 ek (veri yok) + 1 video', kd.json?.media?.length === 3 && kd.json.media[0].caption === 'yakın' && kd.json.media[2].kind === 'pdf' && !JSON.stringify(kd.json.media).includes('base64') && kd.json.videos?.length === 1, kd.json);
    check('ek tek tek okunur', (await api('GET', `/tenders/${k.json.tender.id}/media/${kd.json.media[0].id}`, C)).json?.dataUrl === img);
    check('talep videosu herkese açık', (await api('GET', `/videos/${vid.id}`, C)).status === 200);
    const listK = await api('GET', '/tenders?scope=open', C);
    const rowK = listK.json?.tenders?.find((x: any) => x.id === k.json.tender.id);
    check('listede kapak fotoğrafı ve sayılar', rowK?.coverMediaId === kd.json.media[0].id && rowK.mediaCount === 3 && rowK.videoCount === 1, rowK);
    check('9 fotoğraf 400', (await api('POST', '/tenders', B, { category: 'diger', title: 'Çok foto', quantity: 1, unit: 'adet', media: Array.from({ length: 9 }, () => ({ dataUrl: img })) })).status === 400);
    check('adet başı paket fiyat teklifi', (await api('POST', `/tenders/${k.json.tender.id}/offers`, P, { priceValue: 3.4, priceCurrency: 'USD', priceUnit: 'adet', leadTimeDays: 30 })).status === 201);

    console.log('Kumaş talebi, süre ve sınır');
    const f = await api('POST', '/tenders', B, { category: 'kumas', title: 'Süprem 30/1', quantity: 5000, unit: 'kg', spec: { type: 'orme', subtype: 'suprem', weightGsm: 180, widthCm: 180, content: '%100 pamuk' }, shareToFeed: false, deadline: new Date(Date.now() - 1000).toISOString() });
    created.push(f.json?.tender?.id);
    check('kumaş özeti; akışa paylaşılmadı; süresi geçmiş → teklif kabul etmiyor', f.status === 201 && f.json.tender.summary === 'Örme · suprem · 180 gr/m² · 180 cm · %100 pamuk · 5000 kg' && f.json.tender.postId === null && f.json.tender.acceptingOffers === false, f.json);
    check('süresi geçmiş talebe teklif 409', (await api('POST', `/tenders/${f.json.tender.id}/offers`, P, { priceValue: 1, priceCurrency: 'USD', priceUnit: 'kg' })).json?.error === 'tender_closed');
    check('kapatma', (await api('POST', `/tenders/${f.json.tender.id}/close`, B)).status === 200 && (await api('POST', `/tenders/${f.json.tender.id}/close`, B)).status === 409);
    await prisma.tender.createMany({ data: Array.from({ length: 7 }, (_, i) => ({ buyerId: buyer.id, category: 'diger', title: `Sınır ${i}`, quantity: 1, unit: 'adet' })) });
    check('günlük 10 talep sınırı 429', (await api('POST', '/tenders', B, { category: 'diger', title: 'Onbirinci', quantity: 1, unit: 'adet' })).status === 429);
  } finally {
    const ids = [buyer.id, poly.id, cotton.id, byType.id, nobody.id];
    const cos = [buyerCo.id, polyCo.id, cottonCo.id, typeCo.id];
    const tenders = await prisma.tender.findMany({ where: { buyerId: buyer.id }, select: { id: true } });
    await prisma.tenderOffer.deleteMany({ where: { tenderId: { in: tenders.map((x) => x.id) } } });
    await prisma.tenderMedia.deleteMany({ where: { tenderId: { in: tenders.map((x) => x.id) } } });
    await prisma.videoLink.deleteMany({ where: { tenderId: { in: tenders.map((x) => x.id) } } });
    await prisma.video.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.post.deleteMany({ where: { authorId: { in: ids } } });
    await prisma.tender.deleteMany({ where: { buyerId: buyer.id } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.yarnSpec.deleteMany({ where: { product: { companyId: { in: cos } } } });
    await prisma.product.deleteMany({ where: { companyId: { in: cos } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.company.deleteMany({ where: { id: { in: cos } } });
    await prisma.$disconnect();
  }
  console.log(`\nSonuç: ${passed} geçti, ${failed} başarısız`);
  process.exit(failed ? 1 : 0);
}
main().catch(async (err) => { console.error(err); await prisma.$disconnect(); process.exit(1); });
