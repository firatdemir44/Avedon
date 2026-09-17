// Asistan araçları: Adım 4 becerileri + katalog arama + pasaport çıkarımı +
// firma hafızası. Her araç çağrısı kaydedilir (ekranda sonuç kartı olur) ve
// hafıza önerileri ayrı toplanır (yazma yalnızca kullanıcı onayıyla).
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { BetaRunnableTool } from '@anthropic-ai/sdk/lib/tools/BetaRunnableTool';
import * as z from 'zod/v4';
import { PRODUCT_TYPES } from '../catalog';
import { prisma } from '../db';
import { FIBERS } from '../domain/glossary';
import { PRODUCT_SELECT, buildProductWhere, toProductRow } from '../products';
import { SKILLS, runSkill } from '../skills';
import { runPassportExtract } from '../skills/passportExtract';
import { MEMORY_KEYS, MEMORY_KEY_SET, memoryKeyDef } from './memoryKeys';
import { readMemory } from './memory';
import { MACHINE_GROUPS, searchCapacity } from '../routes/machines';
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
      run: (args) => {
        const result = runSkill(skill, args);
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
      const rows = await prisma.product.findMany({ where, select: PRODUCT_SELECT, orderBy: { createdAt: 'desc' }, take: args.limit });
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
    description: 'Firmanın kayıtlı varsayılanlarını getirir: kur, fason ücretleri, fire, genel gider, kâr, sık kaliteler.',
    inputSchema: z.object({}),
    run: async () => {
      if (!ctx.companyId) return 'Kullanıcının kayıtlı firması yok.';
      const entries = await readMemory(ctx.companyId);
      return JSON.stringify({ entries, knownKeys: MEMORY_KEYS.map((k) => ({ key: k.key, label: k.label, hint: k.hint })) });
    },
  });

  const hafizaOner = betaZodTool({
    name: 'hafiza_oner',
    description:
      'Kullanıcının verdiği bir varsayılanın (kur, fason ücreti, fire, kâr oranı vb.) firma hafızasına kaydedilmesini ÖNERİR. Kaydetmez; kullanıcı ekranda onaylar. Yalnızca kullanıcının açıkça söylediği değerler için kullan.',
    inputSchema: z.object({
      key: z.enum(MEMORY_KEYS.map((k) => k.key) as [string, ...string[]]).describe('Hafıza anahtarı'),
      value: z.union([z.number(), z.string()]).describe('Kaydedilecek değer'),
      reason: z.string().max(200).describe('Kullanıcıya gösterilecek kısa gerekçe'),
    }),
    run: (args) => {
      if (!MEMORY_KEY_SET.has(args.key)) return 'Bilinmeyen anahtar.';
      const def = memoryKeyDef(args.key)!;
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

  const kapasiteAra = betaZodTool({
    name: 'kapasite_ara',
    description:
      'Fason kapasite ağında arama: belirli makine parkuruna (tür, fayn, pus, çalışma eni) sahip firmaları bulur; firmanın beyan ettiği aylık tonajı ve fason kapasitesinin açık olup olmadığını döner. ' +
      'Kullan: "28 fayn 30 pus süprem örecek fason arıyorum", "İzmir\'de boş raschel kapasitesi var mı", "ram makinesi olan boyahane" gibi sorularda. Fiyat ve doluluk takvimi dönmez; firmayla iletişime yönlendir.',
    inputSchema: z.object({
      group: z.enum(MACHINE_GROUPS.map((g) => g.key) as [string, ...string[]]).optional().describe('Makine grubu: orme, dokuma, boya_terbiye, baski, konfeksiyon, iplik, diger'),
      kind: z.string().max(80).optional().describe('Makine türü, serbest metin (ör. "raschel", "ribana", "ram")'),
      gauge: z.number().positive().optional().describe('Fayn (incelik)'),
      diameterInch: z.number().positive().optional().describe('Pus (çap, inç)'),
      widthMin: z.number().positive().optional().describe('En az çalışma eni (cm)'),
      contractOpen: z.boolean().optional().describe('Yalnızca fason kapasitesi açık olanlar'),
      city: z.string().max(60).optional(),
    }),
    run: async (args) => {
      const results = await searchCapacity({ ...args, contractOpen: args.contractOpen ? '1' : undefined, limit: 8 }, ctx.companyId);
      const summary = results.length
        ? `${results.length} firma bulundu: ${results.map((r) => `${r.company.name} (${r.matchedCount} makine${r.capacity.contractOpen ? ', fason açık' : ''})`).join('; ')}`
        : 'Bu parkura sahip firma bulunamadı.';
      calls.push({ name: 'kapasite_ara', title: 'Fason kapasite araması', input: args, output: { results }, summary });
      return JSON.stringify({ summary, results });
    },
  });

  return { tools: [...skillTools, katalogAra, pasaportCikar, hafizaOku, hafizaOner, izlemeOner, izlemeleriListele, kapasiteAra], calls, suggestions, watchSuggestions };
}
