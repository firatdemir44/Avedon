// Pasaport çıkarımı (Faz 1, Adım 3) uçtan uca API testi. ANTHROPIC_MOCK=1 ile
// çalışan bir sunucuya karşı koşar (gerçek model çağrılmaz, ücret yok):
//   ANTHROPIC_MOCK=1 PORT=4001 npx tsx src/index.ts
//   API_BASE=http://localhost:4001/api node --env-file=.env --import tsx scripts/test-passport-extract-api.ts
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

const FIELDS = ['type', 'subtype', 'code', 'composition', 'weightGsm', 'widthCm', 'widthType', 'yarns', 'certificates', 'finishTags', 'usages'];

async function main() {
  const suffix = Date.now().toString().slice(-6);
  const co = await prisma.company.create({ data: { name: `Çıkarım Test ${suffix}`, taxId: `7${suffix}`, companyCode: `EXT-${suffix}` } });
  const user = await prisma.user.create({
    data: { accountType: 'uretici', position: 'Test', firstName: 'Test', lastName: suffix, phone: `0585${suffix}`, phoneVerified: true, companyId: co.id },
  });
  const T = signSessionToken(user.id);

  try {
    console.log('Erişim ve doğrulama');
    check('oturum yoksa 401', (await api('POST', '/passport/extract', undefined, { text: 'x' })).status === 401);
    check('girdi yoksa 400 extract_input_required', (await api('POST', '/passport/extract', T, {})).json?.error === 'extract_input_required');
    check('5 fotoğraf 400', (await api('POST', '/passport/extract', T, { images: Array(5).fill({ imageBase64: img('a'), mediaType: 'image/jpeg' }) })).status === 400);
    check('bilinmeyen medya türü 400', (await api('POST', '/passport/extract', T, { images: [{ imageBase64: img('a'), mediaType: 'image/bmp' }] })).status === 400);
    check('çok uzun metin 400', (await api('POST', '/passport/extract', T, { text: 'a'.repeat(4001) })).status === 400);
    check('bilinmeyen çeşit ipucu 400', (await api('POST', '/passport/extract', T, { text: 'x', hints: { type: 'halı' } })).status === 400);
    const big = await api('POST', '/passport/extract', T, { images: [{ imageBase64: 'A'.repeat(Math.ceil(5 * 1024 * 1024 * 1.4)), mediaType: 'image/jpeg' }] });
    check('5 MB üstü görüntü 400 image_too_large', big.status === 400 && big.json?.error === 'image_too_large', big.json);

    console.log('Metinden çıkarım (sahte model)');
    const text = 'Kod: MLD-Y0023 Elastanlı tül %82 poliamid %18 elastan 120 gr/m2 en 150 cm OEKO-TEX Standard 100';
    const r1 = await api('POST', '/passport/extract', T, { text });
    check('200 döner', r1.status === 200, r1.json);
    const e1 = r1.json?.extraction;
    check('meta.mock true', r1.json?.meta?.mock === true, r1.json?.meta);
    check('çeşit raschel', e1?.type?.value === 'raschel', e1?.type);
    check('alt çeşit elastanli_tul', e1?.subtype?.value === 'elastanli_tul', e1?.subtype);
    check('kod', e1?.code?.value === 'MLD-Y0023', e1?.code);
    check(
      'kompozisyon anahtarlarla',
      JSON.stringify(e1?.composition?.value) === JSON.stringify([{ fiber: 'poliamid', percent: 82 }, { fiber: 'elastan', percent: 18 }]),
      e1?.composition
    );
    check('kompozisyon güveni yüksek', e1?.composition?.confidence >= 0.9, e1?.composition?.confidence);
    check('gramaj 120, güven doğrulanmış', e1?.weightGsm?.value === 120 && e1?.weightGsm?.confidence >= 0.95, e1?.weightGsm);
    check('en 150 (alışılmış bant içinde)', e1?.widthCm?.value === 150 && e1?.widthCm?.confidence >= 0.95, e1?.widthCm);
    check('sertifika oeko_tex_100', e1?.certificates?.value?.[0]?.name === 'oeko_tex_100', e1?.certificates);
    check('uyarı yok (makul)', r1.json?.warnings?.codes?.length === 0, r1.json?.warnings);
    check('fiyat/stok/MOQ yanıtta yok', !('price' in (e1 ?? {})) && !('moq' in (e1 ?? {})) && !('stock' in (e1 ?? {})), Object.keys(e1 ?? {}));
    check(
      'her alanda value/confidence/evidence',
      FIELDS.every((k) => e1?.[k] && 'value' in e1[k] && typeof e1[k].confidence === 'number' && 'evidence' in e1[k]),
      e1
    );

    console.log('Makul olmayan değer ve çeşit ipucu');
    const r2 = await api('POST', '/passport/extract', T, { text: 'Süprem %100 pamuk 900 gsm en 320 cm', hints: { type: 'raschel' } });
    check('200', r2.status === 200, r2.json);
    const e2 = r2.json?.extraction;
    check('gsm_high ve width_high uyarıları', r2.json?.warnings?.codes?.includes('gsm_high') && r2.json?.warnings?.codes?.includes('width_high'), r2.json?.warnings);
    check('uyarı notları Türkçe', r2.json?.warnings?.notes?.some((n: string) => n.includes('Gramaj')), r2.json?.warnings?.notes);
    check('gramaj güveni düştü ama değer duruyor', e2?.weightGsm?.value === 900 && e2?.weightGsm?.confidence < 0.7, e2?.weightGsm);
    check(
      'süprem raschel ipucuna ait değil → aktarılmadı',
      e2?.subtype?.value === null && r2.json?.rejected?.some((r: any) => r.field === 'subtype' && r.reason === 'subtype_not_in_type'),
      r2.json?.rejected
    );

    console.log('Yalnızca fotoğraf (sahte örnek etiket) ve data URL ayrıştırma');
    const r3 = await api('POST', '/passport/extract', T, {
      images: [
        { imageBase64: img('label'), mediaType: 'image/png' },
        { imageBase64: Buffer.from('raw').toString('base64'), mediaType: 'image/jpeg' },
      ],
    });
    check('200', r3.status === 200, r3.json);
    const e3 = r3.json?.extraction;
    check(
      'CO/EA kısaltmaları anahtara çevrildi',
      JSON.stringify(e3?.composition?.value) === JSON.stringify([{ fiber: 'pamuk', percent: 95 }, { fiber: 'elastan', percent: 5 }]),
      e3?.composition
    );
    check('Single Jersey → suprem/orme', e3?.subtype?.value === 'suprem' && e3?.type?.value === 'orme', [e3?.subtype, e3?.type]);
    check('iplik Ne 30/1 penye', e3?.yarns?.value?.[0]?.unit === 'ne' && e3?.yarns?.value?.[0]?.yarnType === 'penye', e3?.yarns);
    check('apre silikonlu, kullanım tişörtlük', e3?.finishTags?.value?.[0] === 'silikonlu' && e3?.usages?.value?.[0] === 'tisortluk', [e3?.finishTags, e3?.usages]);
    check('notlar dolu', typeof e3?.notes === 'string' && e3.notes.length > 0);

    console.log('PDF belge (sahte)');
    const r4 = await api('POST', '/passport/extract', T, {
      document: { dataBase64: `data:application/pdf;base64,${Buffer.from('%PDF-1.4 test').toString('base64')}`, mediaType: 'application/pdf' },
    });
    check('200', r4.status === 200, r4.json);

    console.log('Çıkarım sonucu forma aktarım → kayıt (fieldMeta extracted)');
    const created = await api('POST', '/products', T, {
      code: e1.code.value,
      type: e1.type.value,
      subtype: e1.subtype.value,
      usages: [],
      stock: 100,
      stockUnit: 'm',
      weightGsm: e1.weightGsm.value,
      widthCm: e1.widthCm.value,
      composition: e1.composition.value,
      certificates: e1.certificates.value,
      fieldMeta: [
        { field: 'composition', confidence: e1.composition.confidence, source: 'extracted', confirmed: true },
        { field: 'weightGsm', confidence: e1.weightGsm.confidence, source: 'extracted', confirmed: false },
      ],
    });
    check('ürün 201', created.status === 201, created.json);
    const pid = created.json?.product?.id;
    const detail = { json: (await api("GET", `/products/${pid}`, T)).json?.product };
    check('fieldMeta kaydedildi (2 satır)', detail.json?.fieldMeta?.length === 2, detail.json?.fieldMeta);
    check('bir alan onay bekliyor', detail.json?.pendingFieldCount === 1, detail.json?.pendingFieldCount);
    check('kompozisyon üründe', detail.json?.composition?.length === 2, detail.json?.composition);
  } finally {
    const productIds = (await prisma.product.findMany({ where: { companyId: co.id }, select: { id: true } })).map((p) => p.id);
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
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
