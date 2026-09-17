// Satıcı asistanı (Faz 2, Adım 3) uçtan uca API testi. ANTHROPIC_MOCK=1 ile çalışan sunucuya karşı:
//   ANTHROPIC_MOCK=1 PORT=4001 npx tsx src/index.ts
//   API_BASE=http://localhost:4001/api node --env-file=.env --import tsx scripts/test-seller-assistant-api.ts
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
  const sellerCo = await prisma.company.create({ data: { name: `SA Satıcı ${suffix}`, taxId: `97${suffix}`, companyCode: `SA-${suffix}`, about: 'Raschel tül üreticisi.' } });
  const otherCo = await prisma.company.create({ data: { name: `SA Diğer ${suffix}`, taxId: `98${suffix}`, companyCode: `SB-${suffix}` } });
  const mk = (phone: string, companyId: string | null) =>
    prisma.user.create({ data: { accountType: 'uretici', position: 'Test', firstName: 'Test', lastName: phone, phone, phoneVerified: true, companyId } });
  const seller = await mk(`0571${suffix}`, sellerCo.id);
  const buyer = await mk(`0572${suffix}`, otherCo.id);
  const [S, B] = [seller, buyer].map((u) => signSessionToken(u.id));
  await prisma.product.create({
    data: { companyId: sellerCo.id, code: `SA-${suffix}-1`, type: 'raschel', subtype: 'elastanli_tul', stock: 800, stockUnit: 'm', weightGsm: 120, widthCm: 150, content: '%82 Poliamid %18 Elastan', priceValue: 9.75, priceCurrency: 'USD', priceUnit: 'kg', moq: 300, moqUnit: 'm', leadTimeDays: 10 },
  });
  await prisma.product.create({ data: { companyId: otherCo.id, code: `SB-${suffix}-GIZLI`, type: 'raschel', stock: 1, stockUnit: 'm', weightGsm: 100, widthCm: 150, content: 'x' } });
  await prisma.companyMemory.create({ data: { companyId: sellerCo.id, key: 'profitPercent', valueJson: '37' } });

  try {
    console.log('İplik açma');
    check('oturumsuz 401', (await api('POST', `/assistant/seller/${sellerCo.id}/thread`)).status === 401);
    check('olmayan firma 404', (await api('POST', '/assistant/seller/yok/thread', B)).status === 404);
    check('kendi firmasının asistanıyla alıcı gibi konuşamaz 400', (await api('POST', `/assistant/seller/${sellerCo.id}/thread`, S)).json?.error === 'own_company');
    const t = await api('POST', `/assistant/seller/${sellerCo.id}/thread`, B);
    check('alıcı ipliği 201, kanal buyer', t.status === 201 && t.json?.thread?.channel === 'buyer' && t.json?.company?.name === sellerCo.name, t.json);
    const threadId = t.json.thread.id;
    check('ikinci çağrı aynı ipliği döner (200)', (await api('POST', `/assistant/seller/${sellerCo.id}/thread`, B)).json?.thread?.id === threadId);
    check('uygulama sohbet listesinde görünmez', !(await api('GET', '/assistant/threads', B)).json?.threads?.some((x: any) => x.id === threadId));
    check('satıcı alıcının ipliğini okuyamaz 404', (await api('GET', `/assistant/threads/${threadId}`, S)).status === 404);

    console.log('Araç seti: yalnızca satıcının açık kataloğu, fiyatsız');
    const m1 = await api('POST', `/assistant/threads/${threadId}/messages`, B, { text: '/katalog_ara {"search":"tül"}' });
    const c1 = m1.json?.message?.toolCalls?.[0];
    check('katalog kartı satıcı adına', m1.status === 200 && c1?.name === 'katalog_ara' && c1?.title?.includes(sellerCo.name), m1.json);
    check('satıcının ürünü bulundu', c1?.output?.products?.some((p: any) => p.code === `SA-${suffix}-1`), c1?.output);
    check('başka firmanın ürünü yok', !JSON.stringify(c1?.output).includes('GIZLI'));
    const raw = JSON.stringify(m1.json);
    check('FİYAT SIZMADI (9.75 / price / USD yok)', !raw.includes('9.75') && !raw.includes('"price') && !raw.includes('USD'), raw.slice(0, 300));
    const stored = await prisma.assistantMessage.findMany({ where: { threadId } });
    check('saklanan mesajlarda da fiyat yok', !JSON.stringify(stored).includes('9.75'));

    console.log('Sahibin araçları bu kipte yok');
    for (const tool of ['firma_hafizasi_oku', 'hafiza_oner', 'fabricPricing', 'quoteDraft', 'pasaport_cikar', 'izleme_oner']) {
      const r = await api('POST', `/assistant/threads/${threadId}/messages`, B, { text: `/${tool} {}` });
      check(`${tool} çağrılamaz`, r.json?.message?.toolCalls?.length === 0 && r.json?.message?.text?.includes('Böyle bir araç yok'), r.json?.message);
    }
    check('hafıza değeri (37) hiçbir yanıtta yok', !JSON.stringify(await prisma.assistantMessage.findMany({ where: { threadId } })).includes('37'));
    const calc = await api('POST', `/assistant/threads/${threadId}/messages`, B, { text: '/fabricLengthWeight {"weightGsm":120,"widthCm":150,"kg":10}' });
    check('açık hesap becerisi çalışır', calc.json?.message?.toolCalls?.[0]?.name === 'fabricLengthWeight');

    console.log('Soruyu firmaya iletme ve cevap');
    const esc = await api('POST', `/assistant/threads/${threadId}/messages`, B, { text: `/soruyu_ilet {"question":"Bu tülü özel renge boyatabilir misiniz?","productCode":"SA-${suffix}-1"}` });
    check('iletildi kartı', esc.json?.message?.toolCalls?.[0]?.name === 'soruyu_ilet', esc.json?.message);
    check('satıcıya bildirim', (await api('GET', '/notifications', S)).json?.notifications?.some((n: any) => n.kind === 'company_question_new'));
    const qs = await api('GET', '/assistant/questions', S);
    const q = qs.json?.questions?.[0];
    check('satıcı soruyu görür (ürün ve soran ile)', qs.json?.openCount === 1 && q?.product?.code === `SA-${suffix}-1` && q?.asker?.company?.name === otherCo.name, qs.json);
    check('alıcı soru listesini göremez (kendi firmasınınki boş)', (await api('GET', '/assistant/questions', B)).json?.questions?.length === 0);
    check('başka firma cevaplayamaz 404', (await api('POST', `/assistant/questions/${q.id}/answer`, B, { answer: 'x' })).status === 404);
    const ans = await api('POST', `/assistant/questions/${q.id}/answer`, S, { answer: 'Evet, 500 m üzeri siparişte özel renk çalışıyoruz.', addToFaq: true });
    check('cevap 200', ans.status === 200, ans.json);
    check('alıcıya bildirim', (await api('GET', '/notifications', B)).json?.notifications?.some((n: any) => n.kind === 'company_question_answered' && n.data?.threadId === threadId));
    const after = await api('GET', `/assistant/threads/${threadId}`, B);
    check('cevap alıcının ipliğine düştü', after.json?.messages?.some((m: any) => m.role === 'assistant' && m.text.includes('özel renk çalışıyoruz')));
    check('SSS\'ye eklendi', (await api('GET', '/assistant/faq', S)).json?.faqs?.some((f: any) => f.answer.includes('özel renk')));

    console.log('SSS yönetimi');
    const f1 = await api('POST', '/assistant/faq', S, { question: 'Numune ücretli mi?', answer: 'İlk numune ücretsiz, kargo alıcıya ait.' });
    check('SSS 201', f1.status === 201);
    check('SSS güncelle', (await api('PUT', `/assistant/faq/${f1.json?.faq?.id}`, S, { question: 'Numune ücretli mi?', answer: 'İlk numune ücretsiz.' })).json?.faq?.answer === 'İlk numune ücretsiz.');
    check('başkası silemez 404', (await api('DELETE', `/assistant/faq/${f1.json?.faq?.id}`, B)).status === 404);
    check('sil 204', (await api('DELETE', `/assistant/faq/${f1.json?.faq?.id}`, S)).status === 204);
  } finally {
    const userIds = [seller.id, buyer.id];
    await prisma.assistantThread.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.product.deleteMany({ where: { companyId: { in: [sellerCo.id, otherCo.id] } } });
    await prisma.companyQuestion.deleteMany({ where: { companyId: sellerCo.id } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: { in: [sellerCo.id, otherCo.id] } } });
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
