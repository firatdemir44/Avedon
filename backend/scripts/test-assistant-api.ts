// Firma asistanı (Faz 1, Adım 5) uçtan uca API testi. ANTHROPIC_MOCK=1 ile
// çalışan sunucuya karşı (gerçek model yok):
//   ANTHROPIC_MOCK=1 PORT=4001 npx tsx src/index.ts
//   API_BASE=http://localhost:4001/api node --env-file=.env --import tsx scripts/test-assistant-api.ts
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
  const co = await prisma.company.create({ data: { name: `Asistan Test ${suffix}`, taxId: `8${suffix}`, companyCode: `AST-${suffix}` } });
  const mk = (phone: string, companyId: string | null) =>
    prisma.user.create({ data: { accountType: 'uretici', position: 'Test', firstName: 'Test', lastName: phone, phone, phoneVerified: true, companyId } });
  const owner = await mk(`0586${suffix}`, co.id);
  const other = await mk(`0587${suffix}`, null);
  const [T, O] = [owner, other].map((u) => signSessionToken(u.id));
  const product = await prisma.product.create({
    data: { companyId: co.id, code: `AST-${suffix}-1`, type: 'orme', subtype: 'suprem', stock: 500, stockUnit: 'kg', weightGsm: 180, widthCm: 180, content: '%100 Pamuk', priceValue: 5, priceCurrency: 'USD', priceUnit: 'kg' },
  });

  try {
    console.log('Erişim');
    check('oturumsuz 401', (await api('GET', '/assistant/threads')).status === 401);
    check('sağlıkta assistant.configured', (await api('GET', '/health')).json?.assistant?.configured === true);

    console.log('Sohbet açma ve listeleme');
    const created = await api('POST', '/assistant/threads', T);
    check('201 ile sohbet', created.status === 201 && typeof created.json?.thread?.id === 'string', created.json);
    const threadId = created.json.thread.id;
    check('başlık boş başlar', created.json.thread.title === '');
    const list = await api('GET', '/assistant/threads', T);
    check('listede görünür', list.json?.threads?.some((t: any) => t.id === threadId), list.json);
    check('başkası göremez (404)', (await api('GET', `/assistant/threads/${threadId}`, O)).status === 404);
    check('boş sohbet mesajsız', (await api('GET', `/assistant/threads/${threadId}`, T)).json?.messages?.length === 0);

    console.log('Mesaj ve araç kartı (sahte model)');
    check('boş metin 400', (await api('POST', `/assistant/threads/${threadId}/messages`, T, { text: '  ' })).status === 400);
    const m1 = await api('POST', `/assistant/threads/${threadId}/messages`, T, {
      text: '/fabricLengthWeight {"weightGsm":180,"widthCm":180,"kg":100}',
    });
    check('200 döner', m1.status === 200, m1.json);
    check('kullanıcı mesajı geri döner', m1.json?.userMessage?.role === 'user' && m1.json.userMessage.text.startsWith('/fabricLengthWeight'));
    check('asistan yanıtı', m1.json?.message?.role === 'assistant' && typeof m1.json.message.text === 'string' && m1.json.message.text.length > 0, m1.json?.message);
    const call = m1.json?.message?.toolCalls?.[0];
    check('araç kartı var', call?.name === 'fabricLengthWeight' && call?.title === 'Metre kilo çevirisi', call);
    check('araç çıktısı: 100 kg ≈ 308,6 m', Math.abs((call?.output?.meters ?? 0) - 308.64) < 0.1, call?.output);
    check('özet metni', typeof call?.summary === 'string' && call.summary.includes('m'));
    check('formül var', typeof call?.formula === 'string');
    check('usage.mock true', m1.json?.usage?.mock === true, m1.json?.usage);
    check('başlık ilk sorudan', m1.json?.thread?.title?.startsWith('/fabricLengthWeight'), m1.json?.thread);

    console.log('Katalog aracı kendi firmasıyla sınırlı');
    const m2 = await api('POST', `/assistant/threads/${threadId}/messages`, T, { text: '/katalog_ara {"search":"suprem"}' });
    const c2 = m2.json?.message?.toolCalls?.[0];
    check('katalog kartı', c2?.name === 'katalog_ara', c2);
    check('kendi ürünü bulundu, fiyatıyla', c2?.output?.products?.some((p: any) => p.id === product.id && p.price?.value === 5), c2?.output);

    console.log('Etiket okuma aracı');
    const m3 = await api('POST', `/assistant/threads/${threadId}/messages`, T, { text: '/pasaport_cikar {"text":"Süprem %95 pamuk %5 elastan 180 gsm en 185 cm"}' });
    const c3 = m3.json?.message?.toolCalls?.[0];
    check('pasaport kartı', c3?.name === 'pasaport_cikar' && c3?.output?.composition?.value?.length === 2, c3);

    console.log('Hafıza önerisi ve kaydı');
    const m4 = await api('POST', `/assistant/threads/${threadId}/messages`, T, { text: 'hafıza: dyeingLossPercent=6' });
    const s4 = m4.json?.message?.memorySuggestions?.[0];
    check('öneri döner, yazılmaz', s4?.key === 'dyeingLossPercent' && s4?.value === 6 && s4?.label === 'Boya firesi', m4.json?.message);
    check('hafıza henüz boş', (await api('GET', '/assistant/memory', T)).json?.memory?.length === 0);
    check('firması olmayan 403', (await api('GET', '/assistant/memory', O)).status === 403);
    check('bilinmeyen anahtar 404', (await api('PUT', '/assistant/memory/yok', T, { value: 1 })).status === 404);
    check('sayı anahtarına metin 400', (await api('PUT', '/assistant/memory/dyeingLossPercent', T, { value: 'altı' })).status === 400);
    const put = await api('PUT', '/assistant/memory/dyeingLossPercent', T, { value: 6 });
    check('kayıt 200', put.status === 200 && put.json?.entry?.value === 6, put.json);
    const mem = await api('GET', '/assistant/memory', T);
    check('hafızada 1 kayıt, etiketli', mem.json?.memory?.length === 1 && mem.json.memory[0].label === 'Boya firesi', mem.json);
    check('bilinen anahtar listesi döner', Array.isArray(mem.json?.keys) && mem.json.keys.length >= 10);
    check('silme 204', (await api('DELETE', '/assistant/memory/dyeingLossPercent', T)).status === 204);
    check('silindi', (await api('GET', '/assistant/memory', T)).json?.memory?.length === 0);

    console.log('Kişilik ve karşılama (Adım 9)');
    const p0 = await api('GET', '/assistant/persona', T);
    check('seçilmemişken persona null, etkin ipek, 2 seçenek', p0.json?.persona === null && p0.json?.effective === 'ipek' && p0.json?.options?.length === 2, p0.json);
    check('bilinmeyen kişilik 400', (await api('PUT', '/assistant/persona', T, { persona: 'ayse' })).status === 400);
    const p1 = await api('PUT', '/assistant/persona', T, { persona: 'mert' });
    check('Mert seçildi', p1.status === 200 && p1.json?.name === 'Mert', p1.json);
    check('seçim kalıcı', (await api('GET', '/assistant/persona', T)).json?.persona === 'mert');
    const g = await api('GET', '/assistant/greeting?hour=9', T);
    check('karşılama Günaydın + ad + Mert', g.json?.text?.startsWith('Günaydın Test, ben Mert.'), g.json);
    check('hafıza boş ipucu ve bekleyen sayılar', g.json?.memoryEmpty === true && g.json?.pendingIncoming === 0 && g.json?.unreadMessages === 0, g.json);
    check('saat geçersizse sunucu saati (200)', (await api('GET', '/assistant/greeting?hour=99', T)).status === 200);

    console.log('Geçmiş ve silme');
    const full = await api('GET', `/assistant/threads/${threadId}`, T);
    check('8 mesaj kayıtlı (4 tur)', full.json?.messages?.length === 8, full.json?.messages?.length);
    check('araç kartı geçmişte korunur', full.json?.messages?.[1]?.toolCalls?.[0]?.name === 'fabricLengthWeight');
    const apiRows = await prisma.assistantMessage.findMany({ where: { threadId }, select: { apiJson: true, role: true } });
    check('ham API mesajları saklanır', apiRows.every((r) => JSON.parse(r.apiJson).length >= 1));
    check('başkası silemez', (await api('DELETE', `/assistant/threads/${threadId}`, O)).status === 404);
    check('sahibi siler 204', (await api('DELETE', `/assistant/threads/${threadId}`, T)).status === 204);
    check('mesajlar cascade ile gitti', (await prisma.assistantMessage.count({ where: { threadId } })) === 0);
  } finally {
    await prisma.assistantThread.deleteMany({ where: { userId: { in: [owner.id, other.id] } } });
    await prisma.companyMemory.deleteMany({ where: { companyId: co.id } });
    await prisma.product.deleteMany({ where: { companyId: co.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
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
