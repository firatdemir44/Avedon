import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { coverMedia, tenderSummary } from './routes/tenders';
import { getConnectionState, isConnectedAccepted } from './connections';
import { YARN_SPEC_SELECT, toYarnSpecRow } from './yarns';
import { VIDEO_SELECT, toVideoRow, type VideoRecord } from './videoFields';

export type PostVisibility = 'public' | 'connections';

// Telefon gibi alanlar sızmasın diye yanıtta dönecek alanlar açıkça seçiliyor.
export const POST_AUTHOR_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  position: true,
  avatarUpdatedAt: true,
  company: { select: { id: true, name: true, verification: true, logoUpdatedAt: true } },
} satisfies Prisma.UserSelect;

// Ölçüler akış kartındaki ürün şeridi için (tasarım 5. aşama, taslak
// docs/tasarim-yonleri/Main.dc.html: kod | gramaj | en | stok). Fotoğraf yok:
// liste yanıtlarını şişirmesin diye ürün fotoğrafı ayrı uçtan çekiliyor.
export const POST_PRODUCT_SELECT = {
  id: true,
  code: true,
  companyId: true,
  type: true,
  subtype: true,
  weightGsm: true,
  widthCm: true,
  widthType: true,
  widthMeaning: true,
  stock: true,
  stockUnit: true,
  // Pasaport kartı (Faz 1, Adım 6): kompozisyon şeridi, MOQ/termin, sertifika rozetleri.
  // Fiyat BURADA YOK: akış herkese açık, fiyat yalnızca sahibine (passport.ts).
  moq: true,
  moqUnit: true,
  leadTimeDays: true,
  compositions: { select: { fiber: true, percent: true }, orderBy: { position: 'asc' } },
  certificates: { select: { name: true }, orderBy: { position: 'asc' } },
  // İplik ürünlerinde akış kartı özet satırı ("30/1 Ne Penye Kompakt Pamuk").
  yarnSpec: { select: YARN_SPEC_SELECT },
  // Gönderide kendi fotoğrafı yoksa akış kartı ürünün kapak fotoğrafını
  // gösteriyor; fotoğrafın kendisi yine ayrı uçtan çekiliyor.
  _count: { select: { images: true } },
} satisfies Prisma.ProductSelect;

export const POST_INCLUDE = {
  author: { select: POST_AUTHOR_SELECT },
  product: { select: POST_PRODUCT_SELECT },
  video: { select: VIDEO_SELECT },
  _count: { select: { likes: true, comments: true } },
} satisfies Prisma.PostInclude;

export const COMMENT_INCLUDE = {
  author: { select: POST_AUTHOR_SELECT },
} satisfies Prisma.PostCommentInclude;

export function feedVisibilityWhere(meId: string, connectedIds: string[]) {
  return [{ visibility: 'public' }, { authorId: { in: [meId, ...connectedIds] } }];
}

// DİKKAT: Prisma'da tek bir where nesnesinde iki kardeş `OR` anahtarı olamaz —
// ikincisi birincisini sessizce ezer ve görünürlük filtresi kaybolur (yani tüm
// gizli gönderiler sızar). Bu yüzden imleç koşulu AND içine sarılıyor.
export function cursorWhere(before?: string, beforeId?: string) {
  if (!before || !beforeId) return [];
  const cursorDate = new Date(before);
  return [
    {
      OR: [{ createdAt: { lt: cursorDate } }, { createdAt: cursorDate, id: { lt: beforeId } }],
    },
  ];
}

export async function canViewPost(
  viewerId: string,
  post: { authorId: string; visibility: string; hiddenAt?: Date | null }
): Promise<boolean> {
  if (post.authorId === viewerId) return true;
  // Şikâyetle gizlenen gönderiyi yalnızca yazarı görür (feedRules.ts).
  if (post.hiddenAt) return false;
  if (post.visibility === 'public') return true;
  return isConnectedAccepted(await getConnectionState(viewerId, post.authorId));
}

// Açık talep kartı (Post.tenderId): akışta gönderi yerine talep özeti çizilir.
export type TenderCard = { id: string; category: string; title: string; summary: string; status: string; offerCount: number; deadline: Date | null; coverMediaId: string | null; mediaCount: number; videoCount: number };

export async function tenderCardsFor(posts: { tenderId: string | null }[]): Promise<Map<string, TenderCard>> {
  const ids = [...new Set(posts.map((p) => p.tenderId).filter((x): x is string => !!x))];
  const map = new Map<string, TenderCard>();
  if (!ids.length) return map;
  const rows = await prisma.tender.findMany({ where: { id: { in: ids } } });
  const counts = await prisma.tenderOffer.groupBy({ by: ['tenderId'], where: { tenderId: { in: ids }, status: { not: 'withdrawn' } }, _count: { _all: true } });
  const countMap = new Map<string, number>(counts.map((c) => [c.tenderId, c._count._all]));
  const covers = await coverMedia(ids);
  for (const t of rows) map.set(t.id, { id: t.id, category: t.category, title: t.title, summary: tenderSummary(t), status: t.status, offerCount: countMap.get(t.id) ?? 0, deadline: t.deadline, ...covers(t.id) });
  return map;
}

type PostWithIncludes = {
  tenderId?: string | null;
  id: string;
  body: string;
  imageUrl: string | null;
  linkUrl?: string | null;
  linkTitle?: string;
  linkDescription?: string;
  linkSiteName?: string;
  linkImage?: string | null;
  visibility: string;
  createdAt: Date;
  editedAt: Date | null;
  author: unknown;
  product:
    | {
        id: string;
        code: string;
        companyId: string;
        type: string;
        subtype: string;
        weightGsm: number;
        widthCm: number;
        widthType: string;
        widthMeaning: string;
        stock: number;
        stockUnit: string;
        moq: number | null;
        moqUnit: string;
        leadTimeDays: number | null;
        compositions: { fiber: string; percent: number }[];
        certificates: { name: string }[];
        yarnSpec?: Parameters<typeof toYarnSpecRow>[0];
        _count: { images: number };
      }
    | null;
  video: VideoRecord | null;
  _count: { likes: number; comments: number };
};

// includeImage yalnızca tek gönderi dönen uçlarda (örn. oluşturma yanıtı) true
// olur; liste yanıtlarında fotoğraf gönderilmez, istemci ayrı uçtan çeker.
// productFavorite: görüntüleyen kullanıcı bu ürünü takibe almış mı (ProductFavorite;
// akış kartındaki "Takibe Al" düğmesinin durumu).
export function toFeedRow(post: PostWithIncludes, likedByMe: boolean, includeImage = false, productFavorite = false, tender: TenderCard | null = null) {
  return {
    id: post.id,
    tender,
    body: post.body,
    hasImage: !!post.imageUrl,
    imageUrl: includeImage ? post.imageUrl : null,
    // Paylaşılan bağlantı kartı; görsel ayrı uçtan (/posts/:id/link-image) çekilir.
    link: post.linkUrl
      ? { url: post.linkUrl, title: post.linkTitle ?? '', description: post.linkDescription ?? '', siteName: post.linkSiteName ?? '', hasImage: !!post.linkImage }
      : null,
    visibility: post.visibility,
    createdAt: post.createdAt,
    editedAt: post.editedAt,
    author: post.author,
    product: post.product
      ? (({ _count, compositions, certificates, yarnSpec, ...product }) => ({
          ...product,
          yarnSummary: toYarnSpecRow(yarnSpec)?.summary ?? null,
          hasImage: _count.images > 0,
          composition: compositions,
          certificateNames: certificates.map((c) => c.name),
          isFavorite: productFavorite,
        }))(post.product)
      : null,
    video: post.video ? toVideoRow(post.video) : null,
    likeCount: post._count.likes,
    commentCount: post._count.comments,
    likedByMe,
  };
}

export function toCommentRow(comment: { id: string; body: string; createdAt: Date; author: unknown }) {
  return { id: comment.id, body: comment.body, createdAt: comment.createdAt, author: comment.author };
}
