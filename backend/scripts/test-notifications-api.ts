// Bildirimler ve akış izleme (Faz 2, Adım 1) uçtan uca API testi. ANTHROPIC_MOCK=1
// ile çalışan sunucuya karşı (asistan önerisi sahte modelle):
//   ANTHROPIC_MOCK=1 PORT=4001 npx tsx src/index.ts
//   API_BASE=http://localhost:4001/api node --env-file=.env --import tsx scripts/test-notifications-api.ts
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

const DELIVERY = 'seller_ships';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 6000): Promise<T> {
  const t0 = Date.now();
  let v = await fn();
  while (!ok(v) && Date.now() - t0 < timeoutMs) {
    await sleep(250);
    v = await fn();
  }
  return v;
}

async function main() {
  const suffix = Date.now().toString().slice(-6);
  const sellerCo = await prisma.company.create({ data: { name: `Bildirim Satıcı ${suffix}`, taxId: `94${suffix}`, companyCode: `NS-${suffix}` } });
  const mk = (phone: string, companyId: string | null) =>
    prisma.user.create({ data: { accountType: 'uretici', position: 'Test', firstName: 'Test', lastName: phone, phone, phoneVerified: true, companyId } });
  const seller = await mk(`0592${suffix}`, sellerCo.id);
  const colleague = await mk(`0593${suffix}`, sellerCo.id);
  const buyer = await mk(`0594${suffix}`, null);
  const [S, C, B] = [seller, colleague, buyer].map((u) => signSessionToken(u.id));

  const productBody = (code: string, extra: Record<string, unknown> = {}) => ({
    code,
    type: 'raschel',
    subtype: 'elastanli_tul',
    usages: [],
    stock: 500,
    stockUnit: 'm',
    weightGsm: 220,
    widthCm: 150,
    composition: [
      { fiber: 'poliamid', percent: 82 },
      { fiber: 'elastan', percent: 18 },
    ],
    ...extra,
  });

  try {
    console.log('Erişim ve kural doğrulama');
    check('oturumsuz 401', (await api('GET', '/notifications')).status === 401);
    check('boş süzgeç 400', (await api('POST', '/watch-rules', B, { query: {} })).status === 400);
    check('bilinmeyen alan 400', (await api('POST', '/watch-rules', B, { query: { price: 5 } })).status === 400);
    const rule = await api('POST', '/watch-rules', B, { query: { type: 'raschel', fiber: 'elastan', fiberMinPercent: 10, gsmMin: 200 } });
    check('kural 201, ad süzgeçten üretildi', rule.status === 201 && rule.json?.rule?.name?.includes('Raschel') && rule.json.rule.name.includes('Elastan'), rule.json);
    const narrow = await api('POST', '/watch-rules', B, { name: 'Ağır dokuma', query: { type: 'dokuma', gsmMin: 300 } });
    check('ikinci kural kendi adıyla', narrow.json?.rule?.name === 'Ağır dokuma');
    // Satıcının kendi kuralı: kendi ürününe bildirim gitmemeli
    await api('POST', '/watch-rules', S, { query: { type: 'raschel' } });
    check('listede 2 kural', (await api('GET', '/watch-rules', B)).json?.rules?.length === 2);

    console.log('Ürün girilince eşleşme bildirimi');
    const p1 = await api('POST', '/products', S, productBody(`WATCH-${suffix}-1`));
    check('ürün 201', p1.status === 201, p1.json);
    const n1 = await waitFor(() => api('GET', '/notifications', B), (r) => (r.json?.notifications?.length ?? 0) > 0);
    const first = n1.json?.notifications?.[0];
    check('alıcıya watch_match bildirimi', first?.kind === 'watch_match' && first?.data?.productId === p1.json?.product?.id && first?.title?.includes(`WATCH-${suffix}-1`), n1.json);
    check('okunmamış sayaç 1', n1.json?.unreadCount === 1, n1.json?.unreadCount);
    check('dar kural (dokuma) eşleşmedi: tek bildirim', n1.json?.notifications?.length === 1);
    await sleep(500);
    check('satıcıya kendi ürünü için bildirim yok', (await api('GET', '/notifications', S)).json?.notifications?.filter((n: any) => n.kind === 'watch_match').length === 0);
    check('iş arkadaşına da yok', (await api('GET', '/notifications', C)).json?.notifications?.length === 0);

    console.log('Eşleşmeyen ürün ve lif yüzdesi');
    await api('POST', '/products', S, productBody(`WATCH-${suffix}-2`, { composition: [{ fiber: 'poliamid', percent: 95 }, { fiber: 'elastan', percent: 5 }] }));
    await api('POST', '/products', S, productBody(`WATCH-${suffix}-3`, { weightGsm: 120 }));
    await sleep(1200);
    check('elastan %5 ve 120 gr eşleşmedi', (await api('GET', '/notifications', B)).json?.notifications?.length === 1);
    const ruleRow = (await api('GET', '/watch-rules', B)).json?.rules?.find((r: any) => r.id === rule.json.rule.id);
    check('kuralda eşleşme sayısı 1 ve son eşleşme zamanı', ruleRow?.matchCount === 1 && !!ruleRow?.lastMatchedAt, ruleRow);

    console.log('Okundu işaretleme');
    check('gövdesiz 400', (await api('POST', '/notifications/read', B, {})).status === 400);
    const read = await api('POST', '/notifications/read', B, { ids: [first.id] });
    check('okundu → sayaç 0', read.json?.unreadCount === 0, read.json);
    check('başkasının bildirimini okuyamaz (etkisiz)', (await api('POST', '/notifications/read', S, { ids: [first.id] })).status === 200 && (await api('GET', '/notifications', B)).json?.notifications?.[0]?.read === true);

    console.log('Pasif kural ve silme');
    check('kural pasif', (await api('PATCH', `/watch-rules/${rule.json.rule.id}`, B, { active: false })).json?.rule?.active === false);
    await api('POST', '/products', S, productBody(`WATCH-${suffix}-4`));
    await sleep(1200);
    check('pasif kural bildirim üretmez', (await api('GET', '/notifications', B)).json?.notifications?.length === 1);
    check('başkasının kuralı 404', (await api('DELETE', `/watch-rules/${rule.json.rule.id}`, S)).status === 404);
    check('silme 204', (await api('DELETE', `/watch-rules/${rule.json.rule.id}`, B)).status === 204);

    console.log('Diğer olay kaynakları');
    const sr = await api('POST', '/sample-requests', B, { productId: p1.json.product.id, note: 'test', deliveryMode: DELIVERY });
    if (sr.status === 201) {
      const ns = await api('GET', '/notifications', S);
      check('numune talebi → satıcı firmasına bildirim', ns.json?.notifications?.some((n: any) => n.kind === 'sample_request_new' && n.data?.sampleRequestId === sr.json?.sampleRequest?.id), ns.json);
      check('iş arkadaşı da alır', (await api('GET', '/notifications', C)).json?.notifications?.some((n: any) => n.kind === 'sample_request_new'));
    } else {
      check('numune talebi oluşturulabildi', false, sr.json);
    }
    const conn = await api('POST', '/connections', B, { addresseeId: seller.id });
    check('bağlantı isteği → bildirim', conn.status === 201 && (await api('GET', '/notifications', S)).json?.notifications?.some((n: any) => n.kind === 'connection_request' && n.data?.userId === buyer.id));

    console.log('Asistan izleme önerisi (sahte model)');
    const thread = await api('POST', '/assistant/threads', B);
    const turn = await api('POST', `/assistant/threads/${thread.json?.thread?.id}/messages`, B, { text: 'izle: {"type":"orme","subtype":"suprem","gsmMin":180}' });
    const ws = turn.json?.message?.watchSuggestions?.[0];
    check('öneri döner, kural kurulmaz', ws?.query?.subtype === 'suprem' && ws?.name?.includes('Süprem') && (await api('GET', '/watch-rules', B)).json?.rules?.length === 1, turn.json?.message);
    const accept = await api('POST', '/watch-rules', B, { name: ws?.name, query: ws?.query });
    check('öneri onaylanınca kural kurulur', accept.status === 201, accept.json);
  } finally {
    const userIds = [seller.id, colleague.id, buyer.id];
    const productIds = (await prisma.product.findMany({ where: { companyId: sellerCo.id }, select: { id: true } })).map((p) => p.id);
    await prisma.sampleRequestEvent.deleteMany({ where: { sampleRequest: { productId: { in: productIds } } } }).catch(() => {});
    await prisma.sampleRequest.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.connection.deleteMany({ where: { OR: [{ requesterId: { in: userIds } }, { addresseeId: { in: userIds } }] } });
    await prisma.assistantThread.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: sellerCo.id } });
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
