// Hesap becerileri (Faz 1, Adım 4) uçtan uca API testi. Çalışan yerel sunucuya
// karşı koşar; LLM çağrısı yok, ücret yok:
//   npm.cmd run dev
//   node --env-file=.env --import tsx scripts/test-skills-api.ts
// Başka porttaki sunucu için: API_BASE=http://localhost:4001/api
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

const near = (value: unknown, expected: number, tolerance: number) =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value - expected) < tolerance;

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

const EXPECTED_NAMES = [
  'fabricPricing',
  'knitProduction',
  'yarnCount',
  'yarnCountFromSample',
  'yarnUsageRatio',
  'fabricGsmSample',
  'fabricGsmKnit',
  'garmentCost',
  'yarnUsage',
  'fabricLengthWeight',
  'yarnRequirement',
  'quoteDraft',
];

async function main() {
  const suffix = Date.now().toString().slice(-6);
  const co = await prisma.company.create({ data: { name: `Beceri Test ${suffix}`, taxId: `8${suffix}`, companyCode: `SKL-${suffix}` } });
  const user = await prisma.user.create({
    data: { accountType: 'uretici', position: 'Test', firstName: 'Test', lastName: suffix, phone: `0586${suffix}`, phoneVerified: true, companyId: co.id },
  });
  const T = signSessionToken(user.id);

  try {
    console.log('Erişim');
    check('liste oturumsuz 401', (await api('GET', '/skills')).status === 401);
    check('çalıştırma oturumsuz 401', (await api('POST', '/skills/fabricPricing/run', undefined, {})).status === 401);

    console.log('Beceri listesi');
    const list = await api('GET', '/skills', T);
    check('200 döner', list.status === 200, list.json);
    const skills: any[] = list.json?.skills ?? [];
    check('12 beceri', skills.length === 12, skills.map((s) => s.name));
    check('adlar ve sıra beklendiği gibi', JSON.stringify(skills.map((s) => s.name)) === JSON.stringify(EXPECTED_NAMES), skills.map((s) => s.name));
    check('adlar benzersiz', new Set(skills.map((s) => s.name)).size === skills.length);
    check(
      'her beceride başlık, açıklama, formül ve JSON şema',
      skills.every((s) => s.title && s.description?.length > 40 && s.formula && s.inputSchema?.type === 'object' && s.inputSchema?.properties),
      skills.find((s) => s.inputSchema?.type !== 'object')
    );
    check(
      'şema alanlarında Türkçe açıklama',
      skills.every((s) => Object.values(s.inputSchema.properties as Record<string, any>).some((p) => typeof p.description === 'string' && p.description.length > 0)),
      skills.find((s) => !Object.values(s.inputSchema.properties as Record<string, any>).some((p) => p.description))?.name
    );

    console.log('Hata durumları');
    check('bilinmeyen beceri 404', (await api('POST', '/skills/yok/run', T, {})).status === 404);
    const unknown = await api('POST', '/skills/yok/run', T, {});
    check('404 gövdesi unknown_skill', unknown.json?.error === 'unknown_skill', unknown.json);
    const bad = await api('POST', '/skills/fabricPricing/run', T, { yarns: [{ price: -5, currency: 'TRY', ratioPercent: 100 }] });
    check('geçersiz girdi 400', bad.status === 400, bad.json);
    check('gövdede invalid_input', bad.json?.error === 'invalid_input', bad.json);
    check('gövdede details listesi', Array.isArray(bad.json?.details) && bad.json.details.length > 0, bad.json?.details);
    const empty = await api('POST', '/skills/yarnCount/run', T, {});
    check('eksik alan 400 invalid_input', empty.status === 400 && empty.json?.error === 'invalid_input', empty.json);

    console.log('fabricPricing');
    // 100 TRY iplik + 20 örme fason = 120; %10 genel gider → 132 ham.
    // (132 + 30 boya fason) / 0,92 = 176,087 boyalı maliyet.
    const pricing = await api('POST', '/skills/fabricPricing/run', T, {
      yarns: [{ price: 100, currency: 'TRY', ratioPercent: 100, wastagePercent: 0 }],
      knittingFeePerKg: 20,
      overheadPercent: 10,
      dyeingFeePerKg: 30,
      dyeingLossPercent: 8,
      profitPercent: 0,
    });
    check('200 döner', pricing.status === 200, pricing.json);
    check('ham maliyet 132', near(pricing.json?.output?.greigeCostPerKg?.TRY, 132, 0.0001), pricing.json?.output?.greigeCostPerKg);
    check('boyalı maliyet 176,087', near(pricing.json?.output?.dyedCostPerKg?.TRY, 176.0869565, 0.001), pricing.json?.output?.dyedCostPerKg);
    check('kur yoksa USD null', pricing.json?.output?.dyedCostPerKg?.USD === null, pricing.json?.output?.dyedCostPerKg);
    check('özet dolu ve sayı içeriyor', typeof pricing.json?.summary === 'string' && /\d/.test(pricing.json.summary), pricing.json?.summary);
    check('özette hesaplanamayan sayı yok', !String(pricing.json?.summary).includes('-') && !String(pricing.json?.summary).includes('NaN'), pricing.json?.summary);
    check('formül ve başlık yanıtta', typeof pricing.json?.formula === 'string' && pricing.json?.title === 'Kumaş maliyeti', pricing.json?.title);

    console.log('yarnCount');
    const yc = await api('POST', '/skills/yarnCount/run', T, { value: 30, system: 'ne' });
    check('200 döner', yc.status === 200, yc.json);
    check('30 Ne ≈ 19,69 tex', near(yc.json?.output?.tex, 19.68895, 0.001), yc.json?.output);
    check('50,79 Nm', near(yc.json?.output?.nm, 50.79, 0.01), yc.json?.output);
    check('özette 19,7 tex geçiyor', String(yc.json?.summary).includes('19,7 tex'), yc.json?.summary);

    console.log('fabricLengthWeight');
    const lw = await api('POST', '/skills/fabricLengthWeight/run', T, { weightGsm: 180, widthCm: 180, kg: 100 });
    check('200 döner', lw.status === 200, lw.json);
    check('100 kg ≈ 308,6 m', near(lw.json?.output?.meters, 308.642, 0.01), lw.json?.output);
    check('1 m = 0,324 kg', near(lw.json?.output?.kgPerMeter, 0.324, 1e-9), lw.json?.output);
    check('metre verilmediği için kg null', lw.json?.output?.kg === null, lw.json?.output);

    console.log('Kalan beceriler örnek girdiyle çalışıyor');
    const samples: Record<string, unknown> = {
      knitProduction: {
        rows: [{ lengthPer50NeedlesCm: 15, count: 30, system: 'ne', feeders: 90 }],
        needles: 1920,
        rpm: 25,
        efficiencyPercent: 85,
        hoursPerDay: 24,
        knittingFeePerKg: 12,
      },
      yarnCountFromSample: { lengthCm: 100, weightGrams: 0.2 },
      yarnUsageRatio: {
        rows: [
          { lengthPer50NeedlesCm: 15, count: 30, system: 'ne', feeders: 90 },
          { lengthPer50NeedlesCm: 6, count: 40, system: 'denye', feeders: 6 },
        ],
      },
      fabricGsmSample: { widthMm: 100, lengthMm: 100, weightGrams: 2.75 },
      fabricGsmKnit: { coursesPerCm: 16, walesPerCm: 14, lengthPer50NeedlesCm: 15, yarnCount: 30, yarnSystem: 'ne' },
      garmentCost: { fabricConsumptionMeters: 1.2, fabricPricePerMeter: 150, wastagePercent: 10, sewingCost: 60, accessoryCost: 15 },
      yarnRequirement: { finishedKg: 1000, dyeingLossPercent: 5, knittingLossPercent: 3 },
      yarnUsage: { fabricLengthMeters: 1000, weightGsm: 180, widthCm: 180, wastagePercent: 5 },
    };
    for (const [name, input] of Object.entries(samples)) {
      const r = await api('POST', `/skills/${name}/run`, T, input);
      check(
        `${name} 200 ve özet üretiyor`,
        r.status === 200 && typeof r.json?.summary === 'string' && /\d/.test(r.json.summary) && !r.json.summary.includes('-'),
        r.json
      );
    }
    const gsm = await api('POST', '/skills/fabricGsmSample/run', T, { widthMm: 100, lengthMm: 100, weightGrams: 2.75 });
    check('fabricGsmSample 275 gr/m²', near(gsm.json?.output?.gsm, 275, 1e-9), gsm.json?.output);
    const gk = await api('POST', '/skills/fabricGsmKnit/run', T, { coursesPerCm: 16, walesPerCm: 14, yarnTex: 20 });
    check('fabricGsmKnit ilmek boyu verilmezse 400', gk.status === 400 && gk.json?.error === 'invalid_input', gk.json);
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
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
