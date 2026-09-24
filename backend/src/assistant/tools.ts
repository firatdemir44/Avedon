// Asistan araçları: Adım 4 becerileri + katalog arama + pasaport çıkarımı +
// firma hafızası. Her araç çağrısı kaydedilir (ekranda sonuç kartı olur) ve
// hafıza önerileri ayrı toplanır (yazma yalnızca kullanıcı onayıyla).
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { BetaRunnableTool } from '@anthropic-ai/sdk/lib/tools/BetaRunnableTool';
import * as z from 'zod/v4';
import { COMPANY_TYPES, PRODUCT_TYPES } from '../catalog';
import { YARN_END_USES, YARN_FAMILIES, buildYarnWhere, type YarnQuery } from '../yarns';
import { searchYarns } from '../routes/yarns';
import { MAX_RFQ_COMPANIES, compareView } from '../routes/rfqs';
import { findSimilarProducts, usable } from '../looks';
import { describeLook, parseLook } from '../skills/fabricLook/schema';
import { prisma } from '../db';
import { tenderSummary } from '../routes/tenders';
import { TARGET_COUNTRIES } from '../export/countries';
import { rankMarkets } from '../export/trade';
import { insightFor, overview, referenceShare } from '../export/insight';
import { MAX_TARGETS, askCompanyAssistants } from './delegate';
import { searchKey } from '../directory';
import { FIBERS } from '../domain/glossary';
import { PRODUCT_SELECT, STOCK_FIRST_ORDER, buildProductWhere, toProductRow } from '../products';
import { SKILLS, runSkill } from '../skills';
import { runPassportExtract } from '../skills/passportExtract';
import { MEMORY_KEYS, MEMORY_KEY_SET, WRITABLE_MEMORY_KEYS, memoryKeyDef } from './memoryKeys';
import { fillFxDefaults } from '../fx';
import { readMemory } from './memory';
import { MACHINE_GROUPS, searchCapacity } from '../routes/machines';
import { buildDigest, listNews } from '../news/query';
import { TOPIC_KEYS } from '../news/topics';
import { describeWatchQuery, parseRuleQuery, watchQuerySchema, type WatchQuery } from '../watch';

export interface ToolCallRecord {
  name: string;
  title: string;
  input: unknown;
  output: unknown;
  // Türkçe özet; ekrandaki kart ve modelin yorumu bunun üzerinden.
  summary: string;
  formula?: string;
}

export interface MemorySuggestion {
  key: string;
  label: string;
  value: unknown;
  reason: string;
}

// İzleme kuralı önerisi: asistan kurmaz, kullanıcı ekranda onaylar (POST /api/watch-rules).
export interface WatchSuggestion {
  name: string;
  query: WatchQuery;
  reason: string;
}

export interface ToolContext {
  userId: string;
  companyId: string | null;
  /** Arayüz dili; araç kartları gösterimde bu dile çevrilir. */
  lang?: import('../i18n').Lang;
}

export interface ToolSet {
  // Girdi türleri araç başına farklı; kayıt listesi için silinir (SDK'nın kendi imzası da any).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: BetaRunnableTool<any>[];
  calls: ToolCallRecord[];
  suggestions: MemorySuggestion[];
  watchSuggestions: WatchSuggestion[];
}

const fiberKeys = FIBERS.map((f) => f.key) as [string, ...string[]];

export function buildTools(ctx: ToolContext): ToolSet {
  const calls: ToolCallRecord[] = [];
  const suggestions: MemorySuggestion[] = [];
  const watchSuggestions: WatchSuggestion[] = [];

  const skillTools = SKILLS.map((skill) =>
    betaZodTool({
      name: skill.name,
      description: `${skill.title}. ${skill.description} Formül: ${skill.formula}`,
      inputSchema: skill.inputSchema,
      run: async (args) => {
        // Kur verilmediyse (0/boş) TCMB döviz satış kuru sunucuda doldurulur.
        await fillFxDefaults((skill.inputSchema as { shape?: Record<string, unknown> }).shape, args);
        const result = runSkill(skill, args, ctx.lang);
        if (!result.ok) return `Girdi hatası: ${JSON.stringify(result.details)}`;
        calls.push({ name: skill.name, title: skill.title, input: args, output: result.output, summary: result.summary, formula: skill.formula });
        return JSON.stringify({ summary: result.summary, output: result.output });
      },
    })
  );

  const katalogAra = betaZodTool({
    name: 'katalog_ara',
    description:
      'Firmanın kendi ürün kataloğunda arama yapar: kod, çeşit, alt çeşit, lif, gramaj aralığı. Sonuçta ürün kodu, çeşit, kompozisyon, gramaj, en, stok, MOQ, termin ve (sahibi olduğu için) fiyat döner. En fazla 10 ürün.',
    inputSchema: z.object({
      search: z.string().max(100).optional().describe('Serbest arama: kod, alt çeşit adı, içerik'),
      type: z.enum(PRODUCT_TYPES).optional().describe('Çeşit anahtarı'),
      fiber: z.enum(fiberKeys).optional().describe('Lif anahtarı; bu lifi içeren ürünler'),
      gsmMin: z.number().positive().optional(),
      gsmMax: z.number().positive().optional(),
      limit: z.number().int().min(1).max(10).default(5),
    }),
    run: async (args) => {
      if (!ctx.companyId) {
        return 'Kullanıcının kayıtlı firması yok; katalog aranamaz.';
      }
      const where = buildProductWhere({
        search: args.search,
        type: args.type,
        fiber: args.fiber,
        gsmMin: args.gsmMin,
        gsmMax: args.gsmMax,
        companyId: ctx.companyId,
      });
      const rows = await prisma.product.findMany({ where, select: PRODUCT_SELECT, orderBy: STOCK_FIRST_ORDER, take: args.limit });
      const products = rows.map((r) => {
        const p = toProductRow(r, ctx.companyId) as Record<string, unknown>;
        return {
          id: p.id,
          code: p.code,
          type: p.type,
          subtype: p.subtype,
          content: p.content,
          composition: p.composition,
          weightGsm: p.weightGsm,
          widthCm: p.widthCm,
          widthType: p.widthType,
          widthMeaning: p.widthMeaning,
          effectiveWidthCm: p.effectiveWidthCm,
          stock: p.stock,
          stockUnit: p.stockUnit,
          moq: p.moq,
          moqUnit: p.moqUnit,
          leadTimeDays: p.leadTimeDays,
          price: p.price ?? null,
          certificates: p.certificateNames,
        };
      });
      const summary = products.length
        ? `${products.length} ürün bulundu: ${products.map((p) => p.code).join(', ')}`
        : 'Katalogda eşleşen ürün yok.';
      calls.push({ name: 'katalog_ara', title: 'Katalog araması', input: args, output: { products }, summary });
      return JSON.stringify({ summary, products });
    },
  });

  const pasaportCikar = betaZodTool({
    name: 'pasaport_cikar',
    description:
      'Etiket, kartela ya da WhatsApp mesajı olarak yapıştırılan kumaş metninden pasaport alanlarını okur: çeşit, alt çeşit, kod, kompozisyon, gramaj, en, iplik, sertifika, apre, kullanım. Fiyat, stok, MOQ ve termin okumaz. Güveni düşük alanlar boş döner.',
    inputSchema: z.object({ text: z.string().min(3).max(4000).describe('Etiket/kartela metni, olduğu gibi') }),
    run: async (args) => {
      const outcome = await runPassportExtract({ images: [], document: null, text: args.text, hints: {} });
      const e = outcome.extraction;
      const found = Object.entries(e)
        .filter(([k, v]) => k !== 'notes' && (v as { value: unknown }).value != null)
        .map(([k]) => k);
      const summary = found.length ? `${found.length} alan okundu: ${found.join(', ')}` : 'Metinden pasaport alanı okunamadı.';
      calls.push({ name: 'pasaport_cikar', title: 'Etiket okuma', input: args, output: outcome.extraction, summary });
      return JSON.stringify({ summary, extraction: outcome.extraction, rejected: outcome.rejected, warnings: outcome.warnings });
    },
  });

  const hafizaOku = betaZodTool({
    name: 'firma_hafizasi_oku',
    description: 'Firmanın kayıtlı varsayılanlarını getirir: fason ücretleri, fire, genel gider, kâr, sık kaliteler.',
    inputSchema: z.object({}),
    run: async () => {
      if (!ctx.companyId) return 'Kullanıcının kayıtlı firması yok.';
      const entries = await readMemory(ctx.companyId);
      return JSON.stringify({ entries: entries.filter((e) => !memoryKeyDef(e.key)?.auto), knownKeys: WRITABLE_MEMORY_KEYS.map((k) => ({ key: k.key, label: k.label, hint: k.hint })) });
    },
  });

  const hafizaOner = betaZodTool({
    name: 'hafiza_oner',
    description:
      'Kullanıcının verdiği bir varsayılanın (fason ücreti, fire, kâr oranı vb.; kur DEĞİL, kur TCMB kaynağından otomatik gelir) firma hafızasına kaydedilmesini ÖNERİR. Kaydetmez; kullanıcı ekranda onaylar. Yalnızca kullanıcının açıkça söylediği değerler için kullan.',
    inputSchema: z.object({
      key: z.enum(WRITABLE_MEMORY_KEYS.map((k) => k.key) as [string, ...string[]]).describe('Hafıza anahtarı'),
      value: z.union([z.number(), z.string()]).describe('Kaydedilecek değer'),
      reason: z.string().max(200).describe('Kullanıcıya gösterilecek kısa gerekçe'),
    }),
    run: (args) => {
      if (!MEMORY_KEY_SET.has(args.key)) return 'Bilinmeyen anahtar.';
      const def = memoryKeyDef(args.key)!;
      if (def.auto) return 'Kur hafızaya kaydedilmez; TCMB döviz satış kuru otomatik kullanılır.';
      // Model sayıyı metin olarak verebiliyor ("6"); sayı anahtarında çevir.
      const num = typeof args.value === 'string' ? Number(args.value.replace(',', '.')) : args.value;
      const value = def.kind === 'number' && Number.isFinite(num) ? num : args.value;
      suggestions.push({ key: args.key, label: def.label, value, reason: args.reason });
      return `Öneri kullanıcıya gösterildi: ${def.label} = ${JSON.stringify(args.value)}. Kullanıcı onaylarsa kaydedilir.`;
    },
  });

  const izlemeOner = betaZodTool({
    name: 'izleme_oner',
    description:
      'Kullanıcı "bu kalitede ürün çıkınca haber ver", "şu özellikte kumaş girilince bildir" dediğinde bir izleme kuralı ÖNERİR. Kurmaz; kullanıcı ekranda onaylar. Süzgeç alanları: çeşit, alt çeşit, lif (+ en az yüzde), gramaj aralığı, en aralığı, sertifika, en çok MOQ, en çok termin, serbest arama. En az bir alan dolu olmalı; kullanıcının söylemediği alanı ekleme.',
    inputSchema: z.object({
      type: z.enum(PRODUCT_TYPES).optional().describe('Çeşit anahtarı'),
      subtype: z.string().max(40).optional().describe('Alt çeşit anahtarı (ör. suprem, elastanli_tul)'),
      fiber: z.enum(fiberKeys).optional().describe('Lif anahtarı'),
      fiberMinPercent: z.number().min(0).max(100).optional().describe('Bu lifin en az yüzdesi'),
      gsmMin: z.number().positive().optional(),
      gsmMax: z.number().positive().optional(),
      widthMin: z.number().positive().optional(),
      widthMax: z.number().positive().optional(),
      certificate: z.string().max(60).optional().describe('Sertifika anahtarı (ör. oeko_tex_100, gots, grs)'),
      moqMax: z.number().positive().optional(),
      leadTimeMax: z.number().positive().optional(),
      search: z.string().max(100).optional(),
      reason: z.string().max(200).describe('Kullanıcıya gösterilecek kısa açıklama'),
    }),
    run: (args) => {
      const { reason, ...rawQuery } = args;
      const parsed = watchQuerySchema.safeParse(rawQuery);
      if (!parsed.success) return 'Geçersiz izleme süzgeci: en az bir alan dolu ve geçerli olmalı.';
      const name = describeWatchQuery(parsed.data);
      watchSuggestions.push({ name, query: parsed.data, reason });
      return `İzleme önerisi kullanıcıya gösterildi: ${name}. Kullanıcı onaylarsa kurulur; eşleşen yeni ürünlerde bildirim alır.`;
    },
  });

  const izlemeleriListele = betaZodTool({
    name: 'izlemeleri_listele',
    description: 'Kullanıcının kurulu izleme kurallarını (ad, süzgeç, son eşleşme) getirir.',
    inputSchema: z.object({}),
    run: async () => {
      const rows = await prisma.watchRule.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: 'desc' } });
      return JSON.stringify({ rules: rows.map((r) => ({ name: r.name, active: r.active, query: parseRuleQuery(r.queryJson), lastMatchedAt: r.lastMatchedAt })) });
    },
  });

  // Açık talepler (ihale): satıcıya "bana uygun açık talep var mı", alıcıya "benim taleplerime kaç teklif geldi".
  // Talep yayınlamaz ve teklif vermez; uygulamadaki Talepler > Açık talepler ekranına yönlendirir.
  const acikTalepleriListele = betaZodTool({
    name: 'acik_talepleri_listele',
    description:
      'Platformdaki açık talepleri (ihaleleri) listeler: alıcıların yayınladığı "şu iplik/kumaş lazım, teklif verin" talepleri. ' +
      'Kullan: "polyester iplik arayan var mı", "açık taleplere bakayım", "benim taleplerime teklif geldi mi" gibi sorularda. Talep yayınlamaz, teklif vermez; Talepler > Açık talepler ekranına yönlendir.',
    inputSchema: z.object({
      category: z.enum(['iplik', 'kumas', 'diger']).optional().describe('Kategori'),
      scope: z.enum(['open', 'mine']).optional().describe('open: herkese açık talepler (varsayılan), mine: kullanıcının kendi talepleri'),
    }),
    run: async (args) => {
      const where = args.scope === 'mine'
        ? { buyerId: ctx.userId }
        : { status: 'open', OR: [{ deadline: null }, { deadline: { gte: new Date() } }] };
      const rows = await prisma.tender.findMany({ where: { ...where, ...(args.category ? { category: args.category } : {}) }, orderBy: { createdAt: 'desc' }, take: 10 });
      const counts = rows.length ? await prisma.tenderOffer.groupBy({ by: ['tenderId'], where: { tenderId: { in: rows.map((r) => r.id) }, status: { not: 'withdrawn' } }, _count: { _all: true } }) : [];
      const countMap = new Map<string, number>(counts.map((c) => [c.tenderId, c._count._all]));
      const tenders = rows.map((t) => ({ id: t.id, category: t.category, title: t.title, summary: tenderSummary(t), status: t.status, offerCount: countMap.get(t.id) ?? 0, deadline: t.deadline, createdAt: t.createdAt }));
      const summary = tenders.length
        ? `${tenders.length} talep: ${tenders.map((t) => `${t.title} (${t.summary}; ${t.offerCount} teklif)`).join('; ')}`
        : args.scope === 'mine' ? 'Yayınladığınız talep yok.' : 'Şu an açık talep yok.';
      calls.push({ name: 'acik_talepleri_listele', title: 'Açık talepler', input: args, output: { tenders }, summary });
      return JSON.stringify({ summary, tenders });
    },
  });

  // Dünyayı Keşfet: HS6 kodu için ülke pazar analizi (UN Comtrade). Yorumlar kurallarla üretilir;
  // asistan bunları kendi sözleriyle özetler, sayı uydurmaz.
  const pazarAnalizi = betaZodTool({
    name: 'ihracat_pazar_analizi',
    description:
      'Bir ürünün (6 haneli HS/GTİP kodu) hangi ülkelerde ihracat fırsatı olduğunu analiz eder: ithalat büyüklüğü, büyüme, Türkiye payı, kg fiyatları, pazar tipi, kazanılabilir pazar ve önerilen hamle. ' +
      'Kullan: "elastanlı örme kumaşımı nereye satabilirim", "Mısır pazarı nasıl", "Afrika\'da hangi ülke" gibi sorularda. Kodu bilmiyorsan örme elastanlı kumaş 600410, polyester örme boyalı 600632, pamuklu örme 600622, denim 520942, pamuklu tişört 610910. En çok 12 ülke iste; bölge verilebilir.',
    inputSchema: z.object({
      hs6: z.string().regex(/^\d{6}$/).describe('6 haneli HS kodu'),
      region: z.enum(['AB', 'Avrupa', 'Kuzey Amerika', 'Latin Amerika', 'Orta Doğu', 'Afrika', 'Asya']).optional(),
      countries: z.array(z.string().length(2)).max(12).optional().describe('ISO2 ülke kodları, ör. ["EG","DE","US"]'),
    }),
    run: async (args) => {
      let list = TARGET_COUNTRIES;
      if (args.countries?.length) list = list.filter((c) => args.countries!.includes(c.iso2));
      else if (args.region) list = list.filter((c) => c.region === args.region);
      else list = list.filter((c) => ['DE', 'IT', 'ES', 'GB', 'US', 'AE', 'EG', 'MA', 'IQ', 'PL', 'NL', 'FR'].includes(c.iso2));
      const raw = await rankMarkets(args.hs6, list.slice(0, 12).map((c) => c.m49));
      const ref = referenceShare(raw);
      const rows = raw.map((m) => ({ ...m, insight: insightFor(m, ref) }));
      const ov = overview(rows);
      const brief = rows.map((r) => ({ country: r.country.name, score: r.score, type: r.insight.typeLabel, summary: r.insight.summary, action: r.insight.action, price: r.insight.pricePositionText }));
      calls.push({ name: 'ihracat_pazar_analizi', title: 'İhracat pazar analizi', input: args, output: { overview: ov, markets: brief }, summary: ov.headline });
      return JSON.stringify({ overview: ov.headline, top: ov.top, markets: brief, source: 'UN Comtrade (ithalat, USD); yorumlar kurallarla üretildi' });
    },
  });

  // Firma adıyla bulma (asistandan asistana sorarken kimlik gerekir).
  const firmaBul = betaZodTool({
    name: 'firma_bul',
    description: 'Platformdaki firmaları adına (Türkçe harf duyarsız), şehrine ya da türüne göre bulur; firma kimliği (id), ad, şehir, tür, doğrulama ve asistanı olup olmadığını döner. Kullanıcı bir firmayı adıyla andığında firma_asistanlarina_sor için kimliği buradan al.',
    inputSchema: z.object({
      name: z.string().max(80).optional().describe('Firma adı ya da bir parçası'),
      city: z.string().max(60).optional(),
      companyType: z.enum(COMPANY_TYPES.map((t) => t.key) as [string, ...string[]]).optional(),
    }),
    run: async (args) => {
      const key = args.name ? searchKey(args.name) : '';
      const rows = await prisma.company.findMany({
        where: {
          AND: [
            key ? { OR: [{ normalizedName: { contains: key } }, { name: { contains: args.name } }] } : {},
            args.city ? { city: { contains: args.city } } : {},
            args.companyType ? { companyType: args.companyType } : {},
            ctx.companyId ? { id: { not: ctx.companyId } } : {},
          ],
        },
        select: { id: true, name: true, city: true, companyType: true, verification: true, claimed: true },
        take: 8,
      });
      // Sahipsiz (rehberden aktarılmış) firmaların asistanı yok: katalogları boş.
      const companies = rows.map((r) => ({ ...r, asistanVar: r.claimed }));
      const summary = companies.length ? `${companies.length} firma: ${companies.map((c) => c.name).join(', ')}` : 'Firma bulunamadı.';
      calls.push({ name: 'firma_bul', title: 'Firma arama', input: args, output: { companies }, summary });
      return JSON.stringify({ summary, companies });
    },
  });

  // Asistandan asistana: kullanıcının sorusunu seçilen firmaların asistanlarına sorar.
  const firmaAsistanlarinaSor = betaZodTool({
    name: 'firma_asistanlarina_sor',
    description:
      `Kullanıcı adına BAŞKA firmaların asistanlarına aynı soruyu sorar ve cevaplarını getirir (en çok ${MAX_TARGETS} firma). ` +
      'Kullan: kullanıcı "şu firmalara sor", "kim yapabilir, sorup öğren", "müsait mi, termin ne" dediğinde ya da önce kapasite_ara / teklif_topla / katalog_ara ile bulduğun firmalar hakkında katalogda olmayan bir bilgi (özel üretim, renk, numune koşulu, kapasite, termin, sevkiyat) gerektiğinde. ' +
      'companyIds önceki araç sonuçlarından (firma_bul, kapasite_ara, teklif_topla, katalog_ara) gelmeli; firma uydurma. Soruyu tek başına anlaşılır, kibar ve kısa yaz (miktar, termin, kalite bilgisiyle). ' +
      'Karşı asistanlar FİYAT VERMEZ; fiyat için teklif_topla öner. Cevapları firma firma karşılaştırarak özetle; "firmaya iletildi" diyenleri ayrıca belirt. Kullanıcı açıkça istemeden 3\'ten fazla firmaya sorma.',
    inputSchema: z.object({
      companyIds: z.array(z.string().min(1)).min(1).max(MAX_TARGETS),
      question: z.string().min(5).max(600),
    }),
    run: async (args) => {
      const out = await askCompanyAssistants({ userId: ctx.userId, companyId: ctx.companyId }, args.companyIds, args.question);
      const summary = out.answers.length
        ? `${out.answers.length} firmanın asistanına soruldu: ${out.answers.map((a) => a.companyName + (a.forwarded ? ' (firmaya iletildi)' : a.error ? ' (ulaşılamadı)' : '')).join(', ')}`
        : 'Hiçbir firmaya sorulamadı.';
      calls.push({ name: 'firma_asistanlarina_sor', title: 'Firma asistanlarına soruldu', input: args, output: out, summary });
      return JSON.stringify({ summary, ...out });
    },
  });

  const kapasiteAra = betaZodTool({
    name: 'kapasite_ara',
    description:
      'Fason kapasite ağında arama: belirli makine parkuruna (tür, fayn, pus, çalışma eni) sahip firmaları bulur; firmanın beyan ettiği aylık tonajı ve fason kapasitesinin açık olup olmadığını döner. ' +
      'Örme yazımı "34/28" = 34 pus (çap) / 28 fayn. Kullan: "34/28 Terrot 108 sistem müsait makine", "28 fayn 30 pus süprem örecek fason arıyorum", "İzmir\'de boş raschel kapasitesi var mı", "ram makinesi olan boyahane" gibi sorularda. Fiyat ve doluluk takvimi dönmez; firmayla iletişime yönlendir.',
    inputSchema: z.object({
      group: z.enum(MACHINE_GROUPS.map((g) => g.key) as [string, ...string[]]).optional().describe('Makine grubu: orme, dokuma, boya_terbiye, baski, konfeksiyon, iplik, diger'),
      kind: z.string().max(80).optional().describe('Makine türü, serbest metin (ör. "raschel", "ribana", "ram")'),
      gauge: z.number().positive().optional().describe('Fayn (incelik)'),
      diameterInch: z.number().positive().optional().describe('Pus (çap, inç)'),
      widthMin: z.number().positive().optional().describe('En az çalışma eni (cm)'),
      contractOpen: z.boolean().optional().describe('Yalnızca fason kapasitesi açık olanlar'),
      brand: z.string().max(40).optional().describe('Makine markası (ör. Terrot, Mayer, Monarch, Pailong)'),
      feeders: z.number().int().positive().optional().describe('Sistem (besleyici) sayısı'),
      availableOnly: z.boolean().optional().describe('Yalnızca şu an müsait (boş) makineler; kullanıcı "müsait/boş" derse true'),
      city: z.string().max(60).optional(),
    }),
    run: async (args) => {
      const results = await searchCapacity({ ...args, contractOpen: args.contractOpen ? '1' : undefined, availableOnly: args.availableOnly ? '1' : undefined, limit: 8 }, null);
      // Kullanıcının kendi parkı da çıkar (Melide kendi 30/28 interlokunu bulamıyordu); işaretlenir.
      const summary = results.length
        ? `${results.length} firma bulundu: ${results.map((r) => `${r.company.name}${r.company.id === ctx.companyId ? ' [kullanıcının kendi firması]' : ''} (${r.matchedCount} makine${r.capacity.contractOpen ? ', fason açık' : ''})`).join('; ')}`
        : 'Bu parkura sahip firma bulunamadı.';
      calls.push({ name: 'kapasite_ara', title: 'Fason kapasite araması', input: args, output: { results }, summary });
      return JSON.stringify({ summary, results });
    },
  });

  const iplikAra = betaZodTool({
    name: 'iplik_ara',
    description:
      'İplik dizininde arama: platformdaki iplik üreticisi ve tüccarlarının ipliklerini numara, filament, lif ailesi, eğirme/filament tipi ve kullanım yerine göre bulur. ' +
      'Kullan: "150/48 DTY polyester kim satıyor", "30/1 penye kompakt pamuk ipliği", "raşel için naylon iplik" gibi sorularda. Fiyat dönmez; teklif istemeye yönlendir.',
    inputSchema: z.object({
      search: z.string().max(100).optional().describe('Serbest metin (kod, marka, çeşit adı, firma)'),
      family: z.enum(YARN_FAMILIES.map((f) => f.key) as [string, ...string[]]).optional().describe('Ana alan: pamuk, viskon, polyester, naylon, akrilik, yun, keten, karisim, fantezi, elastan_gipe, diger'),
      count: z.number().positive().optional().describe('İplik numarası (countUnit ile birlikte; ±%4 tolerans)'),
      countUnit: z.enum(['ne', 'nm', 'denye', 'dtex', 'tex']).optional(),
      ply: z.number().int().min(1).max(12).optional().describe('Kat sayısı'),
      filaments: z.number().int().positive().optional().describe('Filament sayısı (150/48 içindeki 48)'),
      filamentType: z.enum(['dty', 'fdy', 'poy', 'aty', 'bcf', 'mono']).optional(),
      spinning: z.enum(['ring', 'kompakt', 'open_end', 'vortex', 'siro']).optional(),
      combing: z.enum(['penye', 'karde']).optional(),
      endUse: z.enum(YARN_END_USES.map((u) => u.key) as [string, ...string[]]).optional().describe('Kullanım yeri'),
      inStock: z.boolean().optional().describe('Yalnızca stoğu olanlar'),
    }),
    run: async (args) => {
      const page = await searchYarns({ ...args, inStock: args.inStock ? '1' : undefined, limit: 8 } as YarnQuery, ctx.companyId);
      const results = page.yarns.map((y) => ({ id: y.id, code: y.code, company: y.company, summary: y.yarn?.summary ?? y.content, content: y.content, stockKg: y.stock, endUses: y.yarn?.endUses ?? [], colorState: y.yarn?.colorState ?? '' }));
      const summary = results.length
        ? `${results.length}${page.hasMore ? '+' : ''} iplik bulundu: ${results.map((r) => `${r.summary} (${r.company.name})`).join('; ')}`
        : 'Bu özelliklerde iplik bulunamadı.';
      calls.push({ name: 'iplik_ara', title: 'İplik araması', input: args, output: { results }, summary });
      return JSON.stringify({ summary, results });
    },
  });

  const teklifTopla = betaZodTool({
    name: 'teklif_topla',
    description:
      'Kullanıcı bir kumaş YA DA İPLİK ihtiyacı için birden çok firmadan teklif toplamak istediğinde PLATFORMDAKİ TÜM firmaların kataloğunda arar ve firma başına bir aday ürün ÖNERİR. İstek GÖNDERMEZ: adaylar ekranda kart olarak çıkar, kullanıcı işaretleyip onaylarsa istek gider. ' +
      'Kullan: "180-200 gr pamuk elastan süprem, 2 ton, 3 hafta; teklif topla", "bu kaliteyi kimler yapıyor, fiyat alalım". Kullanıcının söylemediği süzgeci ekleme; miktar ve termin söylendiyse aktar. Fiyat dönmez. Sonuç boşsa süzgeci gevşetmeyi öner.',
    inputSchema: z.object({
      kind: z.enum(['kumas', 'iplik']).optional().describe('Aranan ürün: kumas (varsayılan) ya da iplik. İplikte yarn* alanlarını kullan.'),
      yarnFamily: z.enum(YARN_FAMILIES.map((f) => f.key) as [string, ...string[]]).optional().describe('İplik ana alanı (pamuk, polyester, viskon...)'),
      yarnCount: z.number().positive().optional().describe('İplik numarası (yarnCountUnit ile)'),
      yarnCountUnit: z.enum(['ne', 'nm', 'denye', 'dtex', 'tex']).optional(),
      yarnFilaments: z.number().int().positive().optional().describe('Filament sayısı'),
      yarnFilamentType: z.enum(['dty', 'fdy', 'poy', 'aty', 'bcf', 'mono']).optional(),
      yarnEndUse: z.enum(YARN_END_USES.map((u) => u.key) as [string, ...string[]]).optional().describe('İplik kullanım yeri'),
      search: z.string().max(100).optional().describe('Serbest arama: alt çeşit adı, içerik'),
      type: z.enum(PRODUCT_TYPES).optional().describe('Çeşit anahtarı'),
      subtype: z.string().max(40).optional().describe('Alt çeşit anahtarı (ör. suprem)'),
      fiber: z.enum(fiberKeys).optional().describe('Lif anahtarı'),
      fiberMinPercent: z.number().min(0).max(100).optional(),
      gsmMin: z.number().positive().optional(),
      gsmMax: z.number().positive().optional(),
      widthMin: z.number().positive().optional(),
      certificate: z.string().max(60).optional().describe('Sertifika anahtarı'),
      quantity: z.number().positive().optional().describe('İstenen miktar'),
      unit: z.enum(['m', 'kg']).optional().describe('Miktar birimi'),
      targetDate: z.string().max(10).optional().describe('İstenen termin tarihi, YYYY-AA-GG'),
      note: z.string().max(300).optional().describe('Satıcılara gidecek kısa not'),
    }),
    run: async (args) => {
      const { quantity, unit, targetDate, note, kind, yarnFamily, yarnCount, yarnCountUnit, yarnFilaments, yarnFilamentType, yarnEndUse, ...filters } = args;
      const isYarn = kind === 'iplik';
      const yarnFilters = { family: yarnFamily, count: yarnCount, countUnit: yarnCountUnit, filaments: yarnFilaments, filamentType: yarnFilamentType, endUse: yarnEndUse, search: filters.search, fiber: filters.fiber, certificate: filters.certificate };
      const given = isYarn ? yarnFilters : filters;
      if (!Object.values(given).some((v) => v !== undefined && v !== '')) return 'En az bir ürün özelliği gerekli (çeşit, lif, gramaj; iplikte numara, aile...). Kullanıcıya ne aradığını sor.';
      const where = isYarn ? buildYarnWhere(yarnFilters as YarnQuery) : buildProductWhere(filters);
      const rows = await prisma.product.findMany({
        where: { AND: [where, ...(ctx.companyId ? [{ companyId: { not: ctx.companyId } }] : [])] },
        select: PRODUCT_SELECT,
        orderBy: [{ stock: 'desc' }, { createdAt: 'desc' }],
        take: 80,
      });
      // Firma başına tek aday (stok fazlası öne); en çok MAX_RFQ_COMPANIES firma.
      const seen = new Set<string>();
      const candidates = rows
        .filter((r) => !seen.has(r.companyId) && seen.add(r.companyId))
        .slice(0, MAX_RFQ_COMPANIES)
        .map((r) => {
          const p = toProductRow(r, null) as Record<string, unknown>;
          return { id: r.id, code: r.code, companyId: r.companyId, companyName: r.company.name, verification: r.company.verification, type: r.type, subtype: r.subtype, content: r.content, weightGsm: r.weightGsm, widthCm: r.widthCm, stock: r.stock, stockUnit: r.stockUnit, moq: p.moq ?? null, moqUnit: p.moqUnit ?? '', leadTimeDays: p.leadTimeDays ?? null };
        });
      const summary = candidates.length
        ? `${candidates.length} firmadan aday bulundu: ${candidates.map((c) => `${c.code} (${c.companyName})`).join('; ')}`
        : 'Bu özelliklerde başka firmada ürün bulunamadı.';
      calls.push({ name: 'teklif_topla', title: 'Teklif toplama adayları', input: args, output: { candidates, request: { quantity: quantity ?? null, unit: unit ?? null, targetDate: targetDate ?? null, note: note ?? '' } }, summary });
      return JSON.stringify({ summary, candidates, uyari: 'İstek GÖNDERİLMEDİ. Kullanıcı karttan firmaları işaretleyip "Teklif iste" derse gider. Bunu kullanıcıya açıkça söyle.' });
    },
  });

  const teklifleriOzetle = betaZodTool({
    name: 'teklifleri_ozetle',
    description:
      'Kullanıcının çoklu teklif isteklerini ve gelen teklifleri getirir (kullanıcı ALICI olduğu için fiyatları görür): firma, isteğin birimine çevrilmiş birim fiyat, tahmini toplam, MOQ, termin, ödeme koşulu, en düşük fiyat / en kısa termin işaretleri. ' +
      'Kullan: "teklifler geldi mi", "hangisi daha uygun", "teklifleri karşılaştır". rfqId verilmezse en son istek. Yorumlarken: farklı para birimlerini kıyaslama; MOQ ihtiyacın üstündeyse belirt; karar kullanıcının.',
    inputSchema: z.object({ rfqId: z.string().max(40).optional() }),
    run: async (args) => {
      const rfqId = args.rfqId ?? (await prisma.rfq.findFirst({ where: { buyerId: ctx.userId }, orderBy: { createdAt: 'desc' }, select: { id: true } }))?.id;
      const view = rfqId ? await compareView(rfqId, ctx.userId) : null;
      if (!view) return 'Kullanıcının çoklu teklif isteği yok.';
      const summary = `${view.title}: ${view.requestCount} firmaya soruldu, ${view.quotedCount} teklif geldi.`;
      calls.push({ name: 'teklifleri_ozetle', title: 'Teklif karşılaştırması', input: args, output: { rfqId: view.id, title: view.title, requestCount: view.requestCount, quotedCount: view.quotedCount }, summary });
      return JSON.stringify({ summary, rfq: view });
    },
  });

  const benzerKumasAra = betaZodTool({
    name: 'benzer_kumas_ara',
    description:
      'Verilen ürün KODUNA görünüşçe benzeyen kumaşları platformda bulur (desen, renk, yüzey, doku, şeffaflık; ayrıca aynı çeşit ve yakın gramaj öne geçer). ' +
      'Kullan: "MLD-R0034 koduna benzer kumaş kimde var", "şu ürünümün muadili var mı". Yalnızca GÖRÜNÜM karşılaştırılır; gramaj ve lif fotoğraftan okunmaz, bunu kullanıcıya söyle. ' +
      'Kullanıcı elindeki bir fotoğrafla aramak istiyorsa Ürünler ekranındaki kamera düğmesine ("Fotoğrafla Kumaş Ara") yönlendir. Fiyat dönmez.',
    inputSchema: z.object({ code: z.string().min(1).max(40).describe('Ürün kodu (kendi kataloğundan ya da platformdaki herhangi bir üründen)') }),
    run: async (args) => {
      const code = args.code.trim();
      const base =
        (ctx.companyId ? await prisma.product.findFirst({ where: { companyId: ctx.companyId, code }, select: { id: true, code: true, type: true, weightGsm: true, look: { select: { lookJson: true } } } }) : null) ??
        (await prisma.product.findFirst({ where: { code }, select: { id: true, code: true, type: true, weightGsm: true, look: { select: { lookJson: true } } } }));
      if (!base) return `"${code}" kodlu ürün bulunamadı. Kodu kullanıcıdan doğrula.`;
      const look = base.look ? parseLook(base.look.lookJson) : null;
      if (!look || !usable(look)) return `${base.code} için görünüm kartı yok (ürünün fotoğrafı yok ya da fotoğrafta kumaş seçilemedi). Kullanıcıya ürüne net bir kumaş fotoğrafı eklemesini öner.`;
      const found = await findSimilarProducts(look, { excludeProductId: base.id, viewerCompanyId: null, base: { type: base.type, weightGsm: base.weightGsm }, limit: 8 });
      const results = found.map((r) => ({ id: r.product.id, code: r.product.code, company: r.product.company, similarity: r.similarity, reasons: r.reasons, summary: r.look.summary, weightGsm: r.product.weightGsm, widthCm: r.product.widthCm, content: r.product.content }));
      const summary = results.length
        ? `${base.code} ürününe görünüşçe benzeyen ${results.length} ürün: ${results.map((r) => `${r.code} (${r.company.name}, %${r.similarity})`).join('; ')}`
        : `${base.code} ürününe görünüşçe benzeyen ürün bulunamadı.`;
      calls.push({ name: 'benzer_kumas_ara', title: 'Benzer kumaş araması', input: args, output: { base: { id: base.id, code: base.code, look: describeLook(look) }, results }, summary });
      return JSON.stringify({ summary, results, not: 'Yalnızca görünüm karşılaştırıldı; gramaj ve içerik için ürün sayfasına bakılmalı.' });
    },
  });

  const sektorHaberleri = betaZodTool({
    name: 'sektor_haberleri',
    description:
      'Tekstil sektör gündemi: herkese açık haber kaynaklarından son başlıklar (başlık, kısa özet, kaynak, tarih, bağlantı). Konu verilmezse firma türüne göre kişisel seçim. ' +
      'Kullan: "sektörde neler oluyor", "pamuk/iplik haberleri", "fuar haberleri". Yalnızca başlık ve özet var; makale metnini uydurma, ayrıntı için bağlantıyı ver.',
    inputSchema: z.object({
      topic: z.enum(TOPIC_KEYS).optional().describe('Konu: hammadde, fiyat, ihracat, fuar, moda, makine, surdurulebilirlik, is_dunyasi'),
      limit: z.number().int().min(1).max(8).default(5),
    }),
    run: async (args) => {
      let items;
      if (args.topic) {
        items = (await listNews({ topic: args.topic, pageSize: args.limit })).items;
      } else {
        const company = ctx.companyId ? await prisma.company.findUnique({ where: { id: ctx.companyId }, select: { companyType: true } }) : null;
        items = await buildDigest(company?.companyType ?? '', new Date(), args.limit);
      }
      const headlines = items.map((i) => ({ title: i.title, summary: i.summary, source: i.source, date: i.publishedAt.slice(0, 10), url: i.url, topics: i.topics.map((t) => t.label) }));
      const summary = headlines.length ? `${headlines.length} haber başlığı bulundu.` : 'Kayıtlı sektör haberi yok.';
      calls.push({ name: 'sektor_haberleri', title: 'Sektör gündemi', input: args, output: { headlines }, summary });
      return JSON.stringify({ summary, headlines });
    },
  });

  return { tools: [...skillTools, katalogAra, pasaportCikar, hafizaOku, hafizaOner, izlemeOner, izlemeleriListele, kapasiteAra, iplikAra, teklifTopla, teklifleriOzetle, benzerKumasAra, acikTalepleriListele, pazarAnalizi, firmaBul, firmaAsistanlarinaSor, sektorHaberleri], calls, suggestions, watchSuggestions };
}
