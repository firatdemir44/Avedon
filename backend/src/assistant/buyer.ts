// Satıcı asistanı (Faz 2, Adım 3): BAŞKA firmadan bir alıcıyla konuşan kip.
// Güvenlik ilkesi "araca verilmeyen veri sızamaz": bu kipte asistanın elinde
// yalnızca satıcı firmanın YAYINLANMIŞ kataloğu (fiyatsız), firma tanıtımı ve
// SSS vardır. Firma hafızası, fiyat, teklifler ve alıcının kendi verileri yoktur.
// Fiyat kararı (Fırat 2026-09-17): satıcı asistanı fiyat VERMEZ; fiyat yalnızca
// satıcının onayladığı teklifle gider.
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import { COMPANY_TYPES, PRODUCT_TYPES } from '../catalog';
import { prisma } from '../db';
import { FIBERS } from '../domain/glossary';
import { notifyMany } from '../notifications';
import { PRODUCT_SELECT, buildProductWhere, toProductRow } from '../products';
import { getSkill, runSkill } from '../skills';
import type { ToolCallRecord, ToolSet } from './tools';

// Alıcıya açık hesap becerileri (fiyat/maliyet içermeyenler).
const PUBLIC_SKILLS = ['fabricLengthWeight', 'yarnCount'] as const;

// Bir alıcının satıcı asistanlarına günde sorabileceği soru sayısı.
export const MAX_BUYER_QUESTIONS_PER_DAY = 40;

export interface SellerProfile {
  id: string;
  name: string;
  about: string;
  companyType: string;
  city: string;
  mainMarkets: string;
  verification: string;
}

export function buyerSystemPrompt(company: SellerProfile, askerName: string | null) {
  const type = COMPANY_TYPES.find((t) => t.key === company.companyType)?.label ?? '';
  return `Sen Takyon platformunda "${company.name}" firmasının asistanısın ve şu an BAŞKA bir firmadan gelen bir alıcıyla konuşuyorsun${askerName ? ` (adı ${askerName})` : ''}. Görevin, alıcının bu firmanın kumaşları hakkındaki sorularını firmanın yayınlanmış kataloğuna dayanarak cevaplamak. Samimi ama düzgün Türkçe, kısa cevaplar; düz metin, markdown yok.

Kesin kurallar:
- FİYAT VERMEZSİN. Fiyat, iskonto, ödeme koşulu sorulursa: "Fiyat bilgisi yalnızca teklifle paylaşılıyor; ürün sayfasındaki Teklif iste düğmesiyle miktarınızı yazarsanız firma size teklif gönderir" de. Tahmini, aralık ya da "yaklaşık" fiyat da söyleme.
- Yalnızca katalog_ara, sss_oku ve makine_parki araçlarından gelen bilgiyi kullan. Fason/kapasite sorularında makine_parki'na bak; müsaitlik bilgisi firmanın kendi beyanıdır, kesin söz verme. Katalogda olmayan ürün, özellik, sertifika, stok ya da termin UYDURMA. Bulamadıysan "katalogda göremedim" de.
- Cevaplayamadığın, firmaya özel soru (özel üretim, renk kartelası, numune koşulu, kapasite, sevkiyat, ödeme) için soruyu_ilet aracını kullan ve alıcıya "sorunuzu firmaya ilettim, cevap gelince bildirim alacaksınız" de. Aynı soruyu iki kez iletme.
- Bu firmanın iç bilgilerini (maliyet, fire, fason ücreti, müşteri, başka alıcıların soruları) bilmiyorsun ve tahmin etmezsin. Başka firmalar hakkında konuşmazsın.
- Metre/kilo çevirisi ve iplik numarası çevirisi için hesap araçlarını kullan; kafadan hesap yapma.
- Numune için "ürün sayfasındaki Numune Talep Et", teklif için "Teklif iste" düğmesine yönlendir.
- Kendini "${company.name} asistanı" olarak tanıt; bir insan gibi davranma, firma adına söz verme (termin, stok ayırma, fiyat sabitleme).

Firma bilgisi: ${[type, company.city, company.mainMarkets ? `pazarlar: ${company.mainMarkets}` : '', company.verification === 'dogrulanmis' ? 'doğrulanmış üretici' : ''].filter(Boolean).join(' · ') || 'belirtilmemiş'}.
${company.about ? `Tanıtım: ${company.about.slice(0, 600)}` : ''}`;
}

const fiberKeys = FIBERS.map((f) => f.key) as [string, ...string[]];

export function buildBuyerTools(ctx: { askerId: string; threadId: string; sellerCompanyId: string; sellerName: string }): ToolSet {
  const calls: ToolCallRecord[] = [];

  const katalogAra = betaZodTool({
    name: 'katalog_ara',
    description:
      'Bu firmanın yayınlanmış ürün kataloğunda arama: kod, çeşit, alt çeşit, lif, gramaj aralığı. Dönen alanlar: kod, çeşit, kompozisyon, gramaj, en, stok, MOQ, termin, sertifikalar. FİYAT DÖNMEZ. En fazla 8 ürün.',
    inputSchema: z.object({
      search: z.string().max(100).optional().describe('Serbest arama: kod, alt çeşit adı, içerik'),
      type: z.enum(PRODUCT_TYPES).optional(),
      fiber: z.enum(fiberKeys).optional(),
      gsmMin: z.number().positive().optional(),
      gsmMax: z.number().positive().optional(),
      limit: z.number().int().min(1).max(8).default(5),
    }),
    run: async (args) => {
      const where = buildProductWhere({ search: args.search, type: args.type, fiber: args.fiber, gsmMin: args.gsmMin, gsmMax: args.gsmMax, companyId: ctx.sellerCompanyId });
      const rows = await prisma.product.findMany({ where, select: PRODUCT_SELECT, orderBy: { createdAt: 'desc' }, take: args.limit });
      const products = rows.map((r) => {
        // viewerCompanyId null: toProductRow fiyatı hiç yazmaz. Yine de yalnızca açık alanlar seçilir.
        const p = toProductRow(r, null) as Record<string, unknown>;
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
          stock: p.stock,
          stockUnit: p.stockUnit,
          moq: p.moq,
          moqUnit: p.moqUnit,
          leadTimeDays: p.leadTimeDays,
          certificates: p.certificateNames,
          usages: p.usages,
          finishTags: p.finishTags,
        };
      });
      const summary = products.length ? `${products.length} ürün bulundu: ${products.map((p) => p.code).join(', ')}` : 'Katalogda eşleşen ürün yok.';
      calls.push({ name: 'katalog_ara', title: `${ctx.sellerName} kataloğu`, input: args, output: { products }, summary });
      return JSON.stringify({ summary, products });
    },
  });

  const sssOku = betaZodTool({
    name: 'sss_oku',
    description: 'Firmanın sık sorulan soruları ve cevapları (numune, sevkiyat, özel üretim gibi konular). Fiyat içermez.',
    inputSchema: z.object({}),
    run: async () => {
      const rows = await prisma.companyFaq.findMany({ where: { companyId: ctx.sellerCompanyId }, orderBy: { updatedAt: 'desc' }, take: 40 });
      return JSON.stringify({ faqs: rows.map((r) => ({ question: r.question, answer: r.answer })) });
    },
  });

  // Fason soruları için: makine parkı ve firmanın beyan ettiği müsaitlik (fiyat yok).
  const makineParki = betaZodTool({
    name: 'makine_parki',
    description: 'Bu firmanın makine parkı: tür, marka/model, pus (çap), fayn, sistem, iğne, çalışma eni, adet, günlük kapasite ve müsaitlik (dolu olduğu tarih). Fason/kapasite sorularında kullan.',
    inputSchema: z.object({ kind: z.string().max(60).optional().describe('Tür süzgeci, ör. "raschel", "süprem"') }),
    run: async (args) => {
      const rows = await prisma.machine.findMany({ where: { companyId: ctx.sellerCompanyId }, orderBy: { createdAt: 'asc' }, take: 200 });
      const q = args.kind?.toLocaleLowerCase('tr');
      const now = Date.now();
      const machines = rows
        .filter((m) => !q || `${m.kind} ${m.feature} ${m.brand} ${m.model}`.toLocaleLowerCase('tr').includes(q))
        .map((m) => ({
          tur: m.kind,
          marka: [m.brand, m.model].filter(Boolean).join(' '),
          pus: m.diameterInch,
          fayn: m.gauge,
          sistem: m.feeders,
          igne: m.needles,
          enCm: m.workingWidthCm,
          ozellik: m.feature,
          adet: m.count,
          gunlukKapasiteKg: m.dailyCapacityKg,
          durum: m.busyUntil && m.busyUntil.getTime() > now ? `${m.busyUntil.toISOString().slice(0, 10)} tarihine kadar dolu` : 'müsait',
        }));
      const summary = machines.length ? `${machines.length} makine kaydı` : 'Makine parkı girilmemiş.';
      calls.push({ name: 'makine_parki', title: `${ctx.sellerName} makine parkı`, input: args, output: { count: machines.length }, summary });
      return JSON.stringify({ summary, machines });
    },
  });

  const soruyuIlet = betaZodTool({
    name: 'soruyu_ilet',
    description: 'Katalogdan ve SSS\'den cevaplanamayan, firmaya özel bir soruyu firmanın yetkililerine iletir. Alıcı cevap gelince bildirim alır.',
    inputSchema: z.object({
      question: z.string().min(5).max(500).describe('Alıcının sorusu, olduğu gibi ve tek başına anlaşılır biçimde'),
      productCode: z.string().max(40).optional().describe('Soru belirli bir ürünle ilgiliyse kodu'),
    }),
    run: async (args) => {
      const product = args.productCode
        ? await prisma.product.findFirst({ where: { companyId: ctx.sellerCompanyId, code: args.productCode }, select: { id: true } })
        : null;
      const created = await prisma.companyQuestion.create({
        data: { companyId: ctx.sellerCompanyId, askerId: ctx.askerId, threadId: ctx.threadId, productId: product?.id ?? null, question: args.question },
      });
      const staff = await prisma.user.findMany({ where: { companyId: ctx.sellerCompanyId }, select: { id: true } });
      await notifyMany(
        staff.map((u) => u.id),
        { kind: 'company_question_new', title: 'Asistanınıza bir soru geldi', body: args.question.slice(0, 140), data: { questionId: created.id, productId: product?.id } }
      );
      calls.push({ name: 'soruyu_ilet', title: 'Soru firmaya iletildi', input: args, output: { questionId: created.id }, summary: args.question });
      return 'Soru firmaya iletildi; cevap gelince alıcı bildirim alacak.';
    },
  });

  const skillTools = PUBLIC_SKILLS.map((name) => getSkill(name))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((skill) =>
      betaZodTool({
        name: skill.name,
        description: `${skill.title}. ${skill.description}`,
        inputSchema: skill.inputSchema,
        run: (args) => {
          const result = runSkill(skill, args);
          if (!result.ok) return `Girdi hatası: ${JSON.stringify(result.details)}`;
          calls.push({ name: skill.name, title: skill.title, input: args, output: result.output, summary: result.summary, formula: skill.formula });
          return JSON.stringify({ summary: result.summary, output: result.output });
        },
      })
    );

  return { tools: [katalogAra, sssOku, makineParki, soruyuIlet, ...skillTools], calls, suggestions: [], watchSuggestions: [] };
}
