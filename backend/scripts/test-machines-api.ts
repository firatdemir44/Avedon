// Makine parkı ve fason kapasite (Faz 2, Adım 5) uçtan uca API testi. Çalışan yerel sunucuya karşı:
//   node --env-file=.env --import tsx scripts/test-machines-api.ts
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
  const knitCo = await prisma.company.create({ data: { name: `Parkur Örme ${suffix}`, taxId: `81${suffix}`, companyCode: `PO-${suffix}`, city: 'Bursa' } });
  const dyeCo = await prisma.company.create({ data: { name: `Parkur Boya ${suffix}`, taxId: `82${suffix}`, companyCode: `PB-${suffix}`, city: 'Denizli' } });
  const mk = (phone: string, companyId: string | null) =>
    prisma.user.create({ data: { accountType: 'uretici', position: 'Test', firstName: 'Test', lastName: phone, phone, phoneVerified: true, companyId } });
  const knit = await mk(`0574${suffix}`, knitCo.id);
  const dye = await mk(`0575${suffix}`, dyeCo.id);
  const loner = await mk(`0576${suffix}`, null);
  const [K, D, L] = [knit, dye, loner].map((u) => signSessionToken(u.id));
  const uniq = `Özel jakar ${suffix}`;

  try {
    console.log('Öneriler ve doğrulama');
    const kinds = await api('GET', '/machines/kinds', K);
    check('gruplar ve başlangıç türleri', kinds.json?.groups?.length === 7 && kinds.json?.kinds?.orme?.some((k: string) => k.includes('Raschel')), kinds.json?.groups);
    check('firmasız kullanıcı ekleyemez 403', (await api('POST', '/machines', L, { group: 'orme', kind: 'Raschel' })).status === 403);
    check('geçersiz grup 400', (await api('POST', '/machines', K, { group: 'uzay', kind: 'Raschel' })).status === 400);
    check('tür boş 400', (await api('POST', '/machines', K, { group: 'orme', kind: ' ' })).status === 400);

    console.log('Parkur girişi (tür serbest metin)');
    const m1 = await api('POST', '/machines', K, { group: 'orme', kind: 'Yuvarlak örme (süprem)', brand: 'Mayer', model: 'Relanit', year: 2019, diameterInch: 30, gauge: 28, feeders: 96, needles: 2640, feature: 'tek plaka', count: 6 });
    check('makine 201', m1.status === 201 && m1.json?.machine?.gauge === 28 && m1.json.machine.count === 6, m1.json);
    const m2 = await api('POST', '/machines', K, { group: 'orme', kind: uniq, gauge: 24, diameterInch: 34, count: 2 });
    check('listede olmayan tür kabul edilir', m2.status === 201 && m2.json?.machine?.kind === uniq);
    await api('POST', '/machines', D, { group: 'boya_terbiye', kind: 'Ram', brand: 'Brückner', workingWidthCm: 240, count: 1 });
    check('yeni tür önerilere girer', (await api('GET', '/machines/kinds', D)).json?.kinds?.orme?.includes(uniq));

    console.log('Kapasite beyanı');
    check('negatif tonaj 400', (await api('PUT', '/machines/capacity/mine', K, { monthlyCapacityTons: -5 })).status === 400);
    const cap = await api('PUT', '/machines/capacity/mine', K, { monthlyCapacityTons: 120, note: 'Ağırlıklı süprem ve ribana', contractOpen: true });
    check('aylık tonaj ve fason açık', cap.json?.capacity?.monthlyCapacityTons === 120 && cap.json.capacity.contractOpen === true && !!cap.json.capacity.updatedAt, cap.json);
    const pub = await api('GET', `/machines/company/${knitCo.id}`);
    check('firma parkuru oturumsuz okunur (2 satır, 8 makine)', pub.status === 200 && pub.json?.machines?.length === 2 && pub.json?.totalCount === 8 && pub.json?.capacity?.monthlyCapacityTons === 120, pub.json);

    console.log('Düzenleme ve sahiplik');
    const upd = await api('PUT', `/machines/${m1.json.machine.id}`, K, { group: 'orme', kind: 'Yuvarlak örme (süprem)', gauge: 28, diameterInch: 30, count: 8 });
    check('güncelleme', upd.json?.machine?.count === 8, upd.json);
    check('başka firma düzenleyemez 404', (await api('PUT', `/machines/${m1.json.machine.id}`, D, { group: 'orme', kind: 'x y' })).status === 404);
    check('başka firma silemez 404', (await api('DELETE', `/machines/${m1.json.machine.id}`, D)).status === 404);

    console.log('Kapasite araması');
    const s1 = await api('GET', '/machines/search?group=orme&gauge=28&diameterInch=30', D);
    const hit = s1.json?.results?.find((r: any) => r.company.id === knitCo.id);
    check('28 fayn 30 pus → örme firması, eşleşen makine ve tonaj', hit?.matchedCount === 8 && hit?.capacity?.monthlyCapacityTons === 120 && hit?.matchedMachines?.length === 1, s1.json);
    check('kendi firması sonuçta yok', !(await api('GET', '/machines/search?group=orme', K)).json?.results?.some((r: any) => r.company.id === knitCo.id));
    check('tür metniyle (Türkçe katlama): "suprem"', (await api('GET', '/machines/search?kind=suprem', D)).json?.results?.some((r: any) => r.company.id === knitCo.id));
    check('çalışma eni ≥ 220 → boyahane', (await api('GET', '/machines/search?group=boya_terbiye&widthMin=220', K)).json?.results?.some((r: any) => r.company.id === dyeCo.id));
    check('fason açık süzgeci boyahaneyi eler', !(await api('GET', '/machines/search?group=boya_terbiye&contractOpen=1', K)).json?.results?.some((r: any) => r.company.id === dyeCo.id));
    check('şehir süzgeci', (await api('GET', '/machines/search?group=orme&city=Bursa', D)).json?.results?.some((r: any) => r.company.id === knitCo.id) && !(await api('GET', '/machines/search?group=orme&city=Adana', D)).json?.results?.length);
    check('oturumsuz arama 401', (await api('GET', '/machines/search?group=orme')).status === 401);

    console.log('Silme');
    check('sil 204', (await api('DELETE', `/machines/${m2.json.machine.id}`, K)).status === 204);
    check('parkur 1 satır', (await api('GET', `/machines/company/${knitCo.id}`)).json?.machines?.length === 1);

    console.log('Firma tablosu yeniden kurulduktan sonra ilişkiler sağlam');
    check('kullanıcı-firma ilişkisi duruyor', (await prisma.user.findUnique({ where: { id: knit.id }, include: { company: true } }))?.company?.name === knitCo.name);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [knit.id, dye.id, loner.id] } } });
    await prisma.company.deleteMany({ where: { id: { in: [knitCo.id, dyeCo.id] } } });
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
