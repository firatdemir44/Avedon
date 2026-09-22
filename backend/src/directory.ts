import { prisma } from './db';
import { COMPANY_TYPES } from './catalog';

// Firma rehberi (Fırat 2026-09-23): dernek/kuruluş listelerinden (İTKİB, İTHİB, İTO, ÖRSAD…)
// içe aktarılan firmalar "sahipsiz" (claimed=false) olarak listelenir; firma sahibi "Bu firma
// benim" deyip belge yükler, yönetici onaylayınca sayfa sahipli ve işlevli olur.
// KVKK: yalnızca firma adı, sektör, şehir, web sitesi alınır; kişi verisi alınmaz.

export const DIRECTORY_CATEGORIES = COMPANY_TYPES.map((c) => c.key) as [string, ...string[]];
export const MAX_IMPORT_ROWS = 2000;

// Arama ve mükerrer birleştirme anahtarı: Türkçe harfler sadeleşir, noktalama atılır,
// şirket türü ekleri (san., tic., ltd., şti., a.ş., ve) düşer.
const TR_MAP: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i̇: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const SUFFIXES = new Set(['san', 'sanayi', 'tic', 'ticaret', 'ltd', 'sti', 'as', 'a', 's', 've', 'inc', 'co', 'ltd.', 'limited', 'sirketi', 'anonim', 'dis', 'ic', 'ihracat', 'ithalat', 'paz', 'pazarlama']);

export function normalizeName(name: string): string {
  const lower = name.trim().toLocaleLowerCase('tr-TR').replace(/[çğıöşüâîû]/g, (ch) => TR_MAP[ch] ?? ch);
  const tokens = lower.replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  const kept = tokens.filter((t) => !SUFFIXES.has(t));
  return (kept.length ? kept : tokens).join(' ');
}

// Sadece arama için (ekleri düşürmeden): "melide" yazınca "Melide Tekstil San." bulunsun.
export function searchKey(text: string): string {
  return text.trim().toLocaleLowerCase('tr-TR').replace(/[çğıöşüâîû]/g, (ch) => TR_MAP[ch] ?? ch).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function newCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'AVD-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export interface ImportRow {
  name: string;
  category: string;
  city?: string;
  website?: string;
  source?: string;
  tags?: string[];
}

// Toplu içe aktarma: aynı normalize ada sahip firma varsa atlanır (mükerrer). Kaynak bilgisi tutulur.
export async function importCompanies(rows: ImportRow[]) {
  let created = 0;
  const skipped: { name: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(0, MAX_IMPORT_ROWS)) {
    const name = row.name.trim().replace(/\s+/g, ' ');
    const norm = normalizeName(name);
    if (name.length < 2 || !norm) {
      skipped.push({ name, reason: 'empty' });
      continue;
    }
    if (seen.has(norm)) {
      skipped.push({ name, reason: 'duplicate_in_file' });
      continue;
    }
    seen.add(norm);
    if (!DIRECTORY_CATEGORIES.includes(row.category)) {
      skipped.push({ name, reason: 'bad_category' });
      continue;
    }
    const existing = await prisma.company.findFirst({ where: { normalizedName: norm }, select: { id: true } });
    if (existing) {
      skipped.push({ name, reason: 'exists' });
      continue;
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await prisma.company.create({
          data: {
            name,
            taxId: '',
            companyCode: newCode(),
            companyType: row.category,
            categoryTags: JSON.stringify((row.tags ?? []).filter((t) => DIRECTORY_CATEGORIES.includes(t) && t !== row.category)),
            city: (row.city ?? '').trim(),
            website: (row.website ?? '').trim(),
            source: (row.source ?? '').trim(),
            claimed: false,
            normalizedName: norm,
          },
        });
        created++;
        break;
      } catch (err) {
        if ((err as { code?: string })?.code !== 'P2002' || attempt === 4) throw err;
      }
    }
  }
  return { created, skipped };
}

// Açılışta: normalize adı boş olan (eski) firmalar doldurulur; her açılışta tekrar zararsız.
export async function backfillNormalizedNames() {
  const rows = await prisma.company.findMany({ where: { normalizedName: '' }, select: { id: true, name: true } });
  for (const r of rows) {
    await prisma.company.update({ where: { id: r.id }, data: { normalizedName: normalizeName(r.name) } });
  }
  return rows.length;
}

export const DIRECTORY_SELECT = {
  id: true,
  name: true,
  companyType: true,
  categoryTags: true,
  city: true,
  website: true,
  claimed: true,
  source: true,
  verification: true,
  logoUpdatedAt: true,
  _count: { select: { products: true, users: true } },
} as const;

export function toDirectoryRow(c: {
  id: string; name: string; companyType: string; categoryTags: string; city: string; website: string; claimed: boolean; source: string; verification: string; logoUpdatedAt: Date | null; _count: { products: number; users: number };
}) {
  let tags: string[] = [];
  try {
    tags = JSON.parse(c.categoryTags || '[]');
  } catch {
    tags = [];
  }
  return {
    id: c.id,
    name: c.name,
    category: c.companyType,
    categoryLabel: COMPANY_TYPES.find((t) => t.key === c.companyType)?.label ?? '',
    tags,
    city: c.city,
    website: c.website,
    claimed: c.claimed,
    source: c.source,
    verification: c.verification,
    logoUpdatedAt: c.logoUpdatedAt,
    productCount: c._count.products,
    memberCount: c._count.users,
  };
}
