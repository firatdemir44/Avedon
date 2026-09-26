// Doğrulanmış iş birliği (docs/konfeksiyon-plani.md Bölüm C, madde 9–15).
// Numune ya da sipariş "teslim edildi" olunca kayıt kendiliğinden doğar; iki firma da
// KENDİ ADININ karşı tarafın sayfasında nasıl görüneceğini seçer (adli / adsiz / gosterme).
// Yayın koşulu: iki seçim de adli ya da adsiz. "gosterme" her an seçilebilir → iki sayfadan
// da kalkar; sonra yeniden açılabilir. Gizlilik: herkese açık yanıtta miktar, fiyat, sipariş
// ayrıntısı ve gün yoktur; yalnızca firma (ya da adsız ifade), ürün ve yıl.
import { prisma } from './db';
import { notifyMany } from './notifications';
import { SUBTYPES, TYPE_LABELS, type ProductType } from './catalog';
import { hasProductionTab } from './production';

export const COLLAB_CHOICES = ['bekliyor', 'adli', 'adsiz', 'gosterme'] as const;
export type CollabChoice = (typeof COLLAB_CHOICES)[number];
export const CHOOSABLE = ['adli', 'adsiz', 'gosterme'] as const;
export type CollabSource = 'numune' | 'siparis';

export const SOURCE_LABELS: Record<CollabSource, string> = {
  siparis: 'Takyon üzerinden doğrulandı',
  numune: 'Numune çalışması',
};

const shows = (choice: string) => choice === 'adli' || choice === 'adsiz';

export function isPublished(c: { supplierChoice: string; apparelChoice: string }) {
  return shows(c.supplierChoice) && shows(c.apparelChoice);
}

type CollabRow = {
  id: string;
  supplierCompanyId: string;
  apparelCompanyId: string;
  productId: string | null;
  source: string;
  sourceId: string;
  year: number;
  supplierChoice: string;
  apparelChoice: string;
  supplierChoiceAt: Date | null;
  apparelChoiceAt: Date | null;
  createdAt: Date;
};

type CompanyLite = { id: string; name: string; logoUpdatedAt: Date | null; verification: string; companyType: string };
const COMPANY_SELECT = { id: true, name: true, logoUpdatedAt: true, verification: true, companyType: true } as const;

// --- Kayıt oluşturma (tetikleyiciler) ---------------------------------------

export interface EnsureInput {
  source: CollabSource;
  sourceId: string;
  supplierCompanyId: string;
  apparelCompanyId: string | null | undefined;
  productId: string | null;
  deliveredAt: Date;
  /** Bildirim gitsin mi (geriye dönük doldurmada gitmez). */
  notify?: boolean;
}

// Aynı kaynak için ikinci kez oluşmaz. Bir tarafın firması yoksa ya da iki taraf aynı
// firmaysa kayıt açılmaz (iş birliği iki ayrı firma arasındadır).
export async function ensureCollaboration(input: EnsureInput): Promise<{ created: boolean; collaboration: CollabRow | null }> {
  if (!input.apparelCompanyId || input.apparelCompanyId === input.supplierCompanyId) return { created: false, collaboration: null };
  const existing = await prisma.collaboration.findUnique({ where: { source_sourceId: { source: input.source, sourceId: input.sourceId } } });
  if (existing) return { created: false, collaboration: existing };
  let collaboration: CollabRow;
  try {
    collaboration = await prisma.collaboration.create({
      data: {
        source: input.source,
        sourceId: input.sourceId,
        supplierCompanyId: input.supplierCompanyId,
        apparelCompanyId: input.apparelCompanyId,
        productId: input.productId,
        year: input.deliveredAt.getFullYear(),
      },
    });
  } catch (err) {
    // Eş zamanlı iki teslim isteği: tekil indeks ikinciyi reddeder, ilk kayıt geçerlidir.
    const again = await prisma.collaboration.findUnique({ where: { source_sourceId: { source: input.source, sourceId: input.sourceId } } });
    if (again) return { created: false, collaboration: again };
    throw err;
  }
  if (input.notify !== false) await askBothSides(collaboration);
  return { created: true, collaboration };
}

// İki firmanın tüm kullanıcılarına: "Bu iş birliğini profilinizde gösterelim mi?"
async function askBothSides(c: CollabRow) {
  const [users, supplier, apparel] = await Promise.all([
    prisma.user.findMany({ where: { companyId: { in: [c.supplierCompanyId, c.apparelCompanyId] } }, select: { id: true, companyId: true } }),
    prisma.company.findUnique({ where: { id: c.supplierCompanyId }, select: { name: true } }),
    prisma.company.findUnique({ where: { id: c.apparelCompanyId }, select: { name: true } }),
  ]);
  const sourceText = c.source === 'siparis' ? 'sipariş' : 'numune çalışması';
  for (const side of [c.supplierCompanyId, c.apparelCompanyId]) {
    const other = side === c.supplierCompanyId ? apparel?.name : supplier?.name;
    await notifyMany(
      users.filter((u) => u.companyId === side).map((u) => u.id),
      {
        kind: 'collaboration_ask',
        title: 'Bu iş birliğini profilinizde gösterelim mi?',
        body: '{company} ile {source} tamamlandı. Firma adıyla, adsız ya da hiç göstermeyi seçebilirsiniz.',
        vars: { company: other ?? '', source: sourceText },
        translateVars: ['source'],
        data: { collaborationId: c.id, companyId: side },
      }
    );
  }
}

// Numune teslim edildi: ürünün sahibi tedarikçi, talep edenin firması karşı taraf.
export async function ensureFromSample(sampleRequestId: string, deliveredAt = new Date()) {
  const r = await prisma.sampleRequest.findUnique({
    where: { id: sampleRequestId },
    select: { id: true, status: true, productId: true, product: { select: { companyId: true } }, requester: { select: { companyId: true } } },
  });
  if (!r || r.status !== 'teslim_edildi') return { created: false, collaboration: null };
  return ensureCollaboration({
    source: 'numune',
    sourceId: r.id,
    supplierCompanyId: r.product.companyId,
    apparelCompanyId: r.requester.companyId,
    productId: r.productId,
    deliveredAt,
  });
}

// Sipariş teslim edildi (alıcı onayı ya da süre dolunca kendiliğinden onay).
export async function ensureFromDeal(deal: { id: string; status: string; sellerCompanyId: string; buyerCompanyId: string | null; productId: string; buyerConfirmedAt: Date | null }) {
  if (deal.status !== 'teslim_edildi') return { created: false, collaboration: null };
  return ensureCollaboration({
    source: 'siparis',
    sourceId: deal.id,
    supplierCompanyId: deal.sellerCompanyId,
    apparelCompanyId: deal.buyerCompanyId,
    productId: deal.productId,
    deliveredAt: deal.buyerConfirmedAt ?? new Date(),
  });
}

// Asıl işlemi (durum güncellemesi) asla bozmaz: hata yutulur ve kayda düşer.
export function ensureFromSampleSafely(sampleRequestId: string) {
  return ensureFromSample(sampleRequestId).catch((err) => console.error('[collaborations] numune tetikleyicisi', err));
}
export function ensureFromDealSafely(deal: Parameters<typeof ensureFromDeal>[0]) {
  return ensureFromDeal(deal).catch((err) => console.error('[collaborations] sipariş tetikleyicisi', err));
}

// Geriye dönük doldurma (açılışta, bildirimsiz): daha önce teslim edilmiş numune ve
// siparişler için eksik kayıtlar açılır. Tekrar çalıştırmak güvenlidir.
export async function backfillCollaborations(): Promise<{ samples: number; deals: number }> {
  let samples = 0;
  let deals = 0;
  const done = await prisma.sampleRequest.findMany({
    where: { status: 'teslim_edildi' },
    select: {
      id: true,
      productId: true,
      createdAt: true,
      product: { select: { companyId: true } },
      requester: { select: { companyId: true } },
      events: { where: { status: 'teslim_edildi' }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
    },
  });
  for (const r of done) {
    const res = await ensureCollaboration({
      source: 'numune',
      sourceId: r.id,
      supplierCompanyId: r.product.companyId,
      apparelCompanyId: r.requester.companyId,
      productId: r.productId,
      deliveredAt: r.events[0]?.createdAt ?? r.createdAt,
      notify: false,
    });
    if (res.created) samples++;
  }
  const delivered = await prisma.deal.findMany({ where: { status: 'teslim_edildi' }, select: { id: true, status: true, sellerCompanyId: true, buyerCompanyId: true, productId: true, buyerConfirmedAt: true, updatedAt: true } });
  for (const d of delivered) {
    const res = await ensureCollaboration({
      source: 'siparis',
      sourceId: d.id,
      supplierCompanyId: d.sellerCompanyId,
      apparelCompanyId: d.buyerCompanyId,
      productId: d.productId,
      deliveredAt: d.buyerConfirmedAt ?? d.updatedAt,
      notify: false,
    });
    if (res.created) deals++;
  }
  return { samples, deals };
}

// --- Seçim -------------------------------------------------------------------

export type ChoiceError = 'not_found' | 'not_party' | 'invalid_choice';

// Yalnızca o tarafın firmasındaki bir kullanıcı; sonuç ve her değişiklik denetim izine yazılır.
export async function setChoice(input: { collaborationId: string; userId: string; companyId: string | null; choice: string }): Promise<{ ok: true; collaboration: CollabRow } | { ok: false; error: ChoiceError }> {
  if (!(CHOOSABLE as readonly string[]).includes(input.choice)) return { ok: false, error: 'invalid_choice' };
  const c = await prisma.collaboration.findUnique({ where: { id: input.collaborationId } });
  if (!c) return { ok: false, error: 'not_found' };
  const side = sideOf(c, input.companyId);
  if (!side) return { ok: false, error: 'not_party' };
  const from = side === 'supplier' ? c.supplierChoice : c.apparelChoice;
  const to = input.choice;
  // Geri alma: gösterilen bir seçimden "gösterme"ye dönüş.
  const action = to === 'gosterme' && shows(from) ? 'geri_alma' : 'secim';
  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.collaboration.update({
      where: { id: c.id },
      data: side === 'supplier' ? { supplierChoice: to, supplierChoiceAt: now } : { apparelChoice: to, apparelChoiceAt: now },
    }),
    prisma.collaborationEvent.create({
      data: { collaborationId: c.id, companyId: input.companyId!, userId: input.userId, action, fromChoice: from, toChoice: to },
    }),
  ]);
  return { ok: true, collaboration: updated };
}

function sideOf(c: { supplierCompanyId: string; apparelCompanyId: string }, companyId: string | null | undefined): 'supplier' | 'apparel' | null {
  if (!companyId) return null;
  if (companyId === c.supplierCompanyId) return 'supplier';
  if (companyId === c.apparelCompanyId) return 'apparel';
  return null;
}

// --- Görünümler ---------------------------------------------------------------

function productLabel(p: { type: string; subtype: string }) {
  const type = TYPE_LABELS[p.type as ProductType] ?? p.type;
  const sub = SUBTYPES[p.type as ProductType]?.find((o) => o.key === p.subtype)?.label;
  return sub ? `${type} · ${sub}` : type;
}

async function loadCompanies(ids: string[]) {
  const rows = await prisma.company.findMany({ where: { id: { in: [...new Set(ids)] } }, select: COMPANY_SELECT });
  return new Map(rows.map((r) => [r.id, r]));
}

// Ürün silinmişse null: herkese açık yanıtta yalnızca kimlik, kod ve tür etiketi.
async function loadProducts(ids: (string | null)[]) {
  const wanted = [...new Set(ids.filter((v): v is string => !!v))];
  if (!wanted.length) return new Map<string, { id: string; code: string; typeLabel: string }>();
  const rows = await prisma.product.findMany({ where: { id: { in: wanted } }, select: { id: true, code: true, type: true, subtype: true } });
  return new Map(rows.map((p) => [p.id, { id: p.id, code: p.code, typeLabel: productLabel(p) }]));
}

// Adsız ifade tarafın rolüne göre: tedarikçi tarafı "Bir kumaş tedarikçisi"; karşı taraf
// konfeksiyon/fason atölye ise "Bir konfeksiyon firması", değilse nötr "Bir firma".
export function anonymousLabelFor(side: 'supplier' | 'apparel', company: { companyType: string } | undefined) {
  if (side === 'supplier') return 'Bir kumaş tedarikçisi';
  return company && hasProductionTab(company.companyType) ? 'Bir konfeksiyon firması' : 'Bir firma';
}

export interface PublicCounterparty {
  company: { id: string; name: string; logoUpdatedAt: Date | null; verification: string } | null;
  anonymousLabel: string | null;
}

export interface PublicCollaboration {
  id: string;
  source: string;
  sourceLabel: string;
  year: number;
  product: { id: string; code: string; typeLabel: string } | null;
  counterparty: PublicCounterparty;
}

// Karşı tarafın görünümü, KARŞI TARAFIN kendi seçimine göre (madde 11).
function counterpartyView(c: CollabRow, side: 'supplier' | 'apparel', companies: Map<string, CompanyLite>): PublicCounterparty {
  const id = side === 'supplier' ? c.supplierCompanyId : c.apparelCompanyId;
  const choice = side === 'supplier' ? c.supplierChoice : c.apparelChoice;
  const company = companies.get(id);
  if (choice === 'adli' && company) {
    return { company: { id: company.id, name: company.name, logoUpdatedAt: company.logoUpdatedAt, verification: company.verification }, anonymousLabel: null };
  }
  return { company: null, anonymousLabel: anonymousLabelFor(side, company) };
}

async function toPublic(rows: CollabRow[], counterpartySide: (c: CollabRow) => 'supplier' | 'apparel'): Promise<PublicCollaboration[]> {
  const companies = await loadCompanies(rows.flatMap((c) => [c.supplierCompanyId, c.apparelCompanyId]));
  const products = await loadProducts(rows.map((c) => c.productId));
  return rows.map((c) => ({
    id: c.id,
    source: c.source,
    sourceLabel: SOURCE_LABELS[c.source as CollabSource] ?? c.source,
    year: c.year,
    product: (c.productId && products.get(c.productId)) || null,
    counterparty: counterpartyView(c, counterpartySide(c), companies),
  }));
}

const SHOWING = ['adli', 'adsiz'];
const publishedWhere = { supplierChoice: { in: SHOWING }, apparelChoice: { in: SHOWING } };

// Firma sayfası: yayınlanmış iş birlikleri, karşı taraf görünümüyle.
export async function publicForCompany(companyId: string): Promise<PublicCollaboration[]> {
  const rows = await prisma.collaboration.findMany({
    where: { ...publishedWhere, OR: [{ supplierCompanyId: companyId }, { apparelCompanyId: companyId }] },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });
  return toPublic(rows, (c) => (c.supplierCompanyId === companyId ? 'apparel' : 'supplier'));
}

// Kumaş ürün detayı: "Bu kumaşla çalışan konfeksiyon firmaları" (karşı taraf = alıcı firma).
export async function publicForProduct(productId: string): Promise<PublicCollaboration[]> {
  const rows = await prisma.collaboration.findMany({
    where: { ...publishedWhere, productId },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });
  return toPublic(rows, () => 'apparel');
}

export function publishedCount(companyId: string) {
  return prisma.collaboration.count({ where: { ...publishedWhere, OR: [{ supplierCompanyId: companyId }, { apparelCompanyId: companyId }] } });
}

// Firmanın kendi listesi (özel): taraflar birbirinin gerçek adını görür.
export interface MineCollaboration {
  id: string;
  source: string;
  sourceLabel: string;
  year: number;
  product: { id: string; code: string; typeLabel: string } | null;
  role: 'supplier' | 'apparel';
  counterparty: { id: string; name: string; logoUpdatedAt: Date | null; verification: string } | null;
  myChoice: CollabChoice;
  theirChoice: CollabChoice;
  myChoiceAt: Date | null;
  published: boolean;
  pending: boolean;
}

export async function listMine(companyId: string): Promise<MineCollaboration[]> {
  const rows = await prisma.collaboration.findMany({
    where: { OR: [{ supplierCompanyId: companyId }, { apparelCompanyId: companyId }] },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const companies = await loadCompanies(rows.flatMap((c) => [c.supplierCompanyId, c.apparelCompanyId]));
  const products = await loadProducts(rows.map((c) => c.productId));
  return rows.map((c) => {
    const role = c.supplierCompanyId === companyId ? 'supplier' : 'apparel';
    const other = companies.get(role === 'supplier' ? c.apparelCompanyId : c.supplierCompanyId);
    const myChoice = (role === 'supplier' ? c.supplierChoice : c.apparelChoice) as CollabChoice;
    const theirChoice = (role === 'supplier' ? c.apparelChoice : c.supplierChoice) as CollabChoice;
    return {
      id: c.id,
      source: c.source,
      sourceLabel: SOURCE_LABELS[c.source as CollabSource] ?? c.source,
      year: c.year,
      product: (c.productId && products.get(c.productId)) || null,
      role,
      counterparty: other ? { id: other.id, name: other.name, logoUpdatedAt: other.logoUpdatedAt, verification: other.verification } : null,
      myChoice,
      theirChoice,
      myChoiceAt: role === 'supplier' ? c.supplierChoiceAt : c.apparelChoiceAt,
      published: isPublished(c),
      pending: myChoice === 'bekliyor',
    };
  });
}
