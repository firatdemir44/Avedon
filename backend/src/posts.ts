import { Prisma } from '@prisma/client';
import { getConnectionState, isConnectedAccepted } from './connections';
import { VIDEO_SELECT, toVideoRow, type VideoRecord } from './videoFields';

export type PostVisibility = 'public' | 'connections';

// Telefon gibi alanlar sızmasın diye yanıtta dönecek alanlar açıkça seçiliyor.
export const POST_AUTHOR_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  position: true,
  company: { select: { id: true, name: true, verification: true } },
} satisfies Prisma.UserSelect;

export const POST_PRODUCT_SELECT = { id: true, code: true } satisfies Prisma.ProductSelect;

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
  post: { authorId: string; visibility: string }
): Promise<boolean> {
  if (post.authorId === viewerId) return true;
  if (post.visibility === 'public') return true;
  return isConnectedAccepted(await getConnectionState(viewerId, post.authorId));
}

type PostWithIncludes = {
  id: string;
  body: string;
  imageUrl: string | null;
  visibility: string;
  createdAt: Date;
  author: unknown;
  product: { id: string; code: string } | null;
  video: VideoRecord | null;
  _count: { likes: number; comments: number };
};

// includeImage yalnızca tek gönderi dönen uçlarda (örn. oluşturma yanıtı) true
// olur; liste yanıtlarında fotoğraf gönderilmez, istemci ayrı uçtan çeker.
export function toFeedRow(post: PostWithIncludes, likedByMe: boolean, includeImage = false) {
  return {
    id: post.id,
    body: post.body,
    hasImage: !!post.imageUrl,
    imageUrl: includeImage ? post.imageUrl : null,
    visibility: post.visibility,
    createdAt: post.createdAt,
    author: post.author,
    product: post.product,
    video: post.video ? toVideoRow(post.video) : null,
    likeCount: post._count.likes,
    commentCount: post._count.comments,
    likedByMe,
  };
}

export function toCommentRow(comment: { id: string; body: string; createdAt: Date; author: unknown }) {
  return { id: comment.id, body: comment.body, createdAt: comment.createdAt, author: comment.author };
}
