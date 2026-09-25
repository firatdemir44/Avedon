import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from './db';
import { canonicalPair } from './conversations';
import { maskPhone, normalizePhone } from './phone';

// Çift hesap (2026-09-24): eski normalizasyon yalnızca boşluk/tire siliyordu; "0538…" ile "+90538…"
// ayrı kişi sayıldı ve aynı kişi iki kez kayıt olabildi. Bu dosya:
//  1) açılışta kayıtlı numaraları kanonik biçime çevirir (tekrar çalıştırılabilir),
//  2) çevrilince başka hesapla çakışacak numaralara DOKUNMAZ, çift grubu olarak raporlar,
//  3) yöneticinin seçtiği iki hesabı tek hesapta birleştirir.

type Db = PrismaClient;

// Aynı firmada aynı ad-soyadla açılmış hesaplar (Fırat 2026-09-25: "Fatih Demir" telefonu farklı
// yazıldığı için telefon grubuna düşmedi). Ad karşılaştırması büyük/küçük harf ve Türkçe harf farkı gözetmez.
export function nameKey(first: string | null, last: string | null) {
  return `${first ?? ''} ${last ?? ''}`
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıi̇]/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/s+/g, ' ')
    .trim();
}

export type NormalizeResult = { usersUpdated: number; invitesUpdated: number; otpsDeleted: number; duplicateGroups: number };

export async function normalizeStoredPhones(db: Db = defaultPrisma): Promise<NormalizeResult> {
  const users = await db.user.findMany({ select: { id: true, phone: true } });
  const groups = new Map<string, { id: string; phone: string }[]>();
  for (const u of users) {
    const key = normalizePhone(u.phone) || u.phone;
    groups.set(key, [...(groups.get(key) ?? []), u]);
  }
  let usersUpdated = 0;
  let duplicateGroups = 0;
  for (const [canonical, members] of groups) {
    if (members.length > 1) {
      duplicateGroups++;
      continue; // çakışma: otomatik değişiklik yok, yönetici birleştirir
    }
    const u = members[0];
    if (u.phone !== canonical) {
      await db.user.update({ where: { id: u.id }, data: { phone: canonical } });
      usersUpdated++;
    }
  }

  let invitesUpdated = 0;
  const invites = await db.invite.findMany({ where: { inviteePhone: { not: '' } }, select: { id: true, inviteePhone: true } });
  for (const inv of invites) {
    const c = normalizePhone(inv.inviteePhone);
    if (c && c !== inv.inviteePhone) {
      await db.invite.update({ where: { id: inv.id }, data: { inviteePhone: c } });
      invitesUpdated++;
    }
  }

  // Doğrulama kodları kısa ömürlü: kanonik olmayanlar silinir (kişi yeni kod ister).
  let otpsDeleted = 0;
  const otps = await db.phoneOtp.findMany({ select: { phone: true } });
  for (const o of otps) {
    if (normalizePhone(o.phone) !== o.phone) {
      await db.phoneOtp.delete({ where: { phone: o.phone } }).catch(() => {});
      otpsDeleted++;
    }
  }
  return { usersUpdated, invitesUpdated, otpsDeleted, duplicateGroups };
}

/** Aynı firmada aynı adlı, telefonu farklı hesap grupları (telefon grubuna girenler hariç). */
async function sameNameGroups(db: Db, phoneGrouped: Set<string>) {
  const users = await db.user.findMany({ where: { companyId: { not: null } }, select: { id: true, companyId: true, firstName: true, lastName: true } });
  const by = new Map<string, string[]>();
  for (const u of users) {
    const n = nameKey(u.firstName, u.lastName);
    if (n.length < 3) continue;
    const k = `${u.companyId}|${n}`;
    by.set(k, [...(by.get(k) ?? []), u.id]);
  }
  return [...by.values()].filter((ids) => ids.length > 1 && ids.some((id) => !phoneGrouped.has(id)));
}

export async function countSameNameGroups(db: Db = defaultPrisma) {
  return (await sameNameGroups(db, new Set())).length;
}

export async function countDuplicatePhoneGroups(db: Db = defaultPrisma): Promise<number> {
  const users = await db.user.findMany({ select: { phone: true } });
  const counts = new Map<string, number>();
  for (const u of users) {
    const k = normalizePhone(u.phone) || u.phone;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.values()].filter((n) => n > 1).length;
}

export async function listDuplicateAccounts(db: Db = defaultPrisma) {
  const users = await db.user.findMany({ select: { id: true, phone: true } });
  const byKey = new Map<string, string[]>();
  for (const u of users) {
    const k = normalizePhone(u.phone) || u.phone;
    byKey.set(k, [...(byKey.get(k) ?? []), u.id]);
  }
  const groups = [];
  const phoneGrouped = new Set([...byKey.values()].filter((ids) => ids.length > 1).flat());
  const entries: { key: string; ids: string[]; reason: 'telefon' | 'ad' }[] = [
    ...[...byKey].filter(([, ids]) => ids.length > 1).map(([key, ids]) => ({ key, ids, reason: 'telefon' as const })),
    ...(await sameNameGroups(db, phoneGrouped)).map((ids) => ({ key: '', ids, reason: 'ad' as const })),
  ];
  for (const { key, ids, reason } of entries) {
    const accounts = [];
    for (const id of ids) {
      const u = await db.user.findUniqueOrThrow({
        where: { id },
        select: { id: true, firstName: true, lastName: true, phone: true, position: true, createdAt: true, isAdmin: true, company: { select: { id: true, name: true } } },
      });
      const [posts, comments, likes, messages, conversations, connections, assistantThreads, sampleRequests, quoteRequests, quotes, products, notifications, lastMsg, lastPost, lastThread] = await Promise.all([
        db.post.count({ where: { authorId: id } }),
        db.postComment.count({ where: { authorId: id } }),
        db.postLike.count({ where: { userId: id } }),
        db.message.count({ where: { senderId: id } }),
        db.conversation.count({ where: { OR: [{ userAId: id }, { userBId: id }] } }),
        db.connection.count({ where: { OR: [{ requesterId: id }, { addresseeId: id }] } }),
        db.assistantThread.count({ where: { userId: id } }),
        db.sampleRequest.count({ where: { requesterId: id } }),
        db.quoteRequest.count({ where: { buyerId: id } }),
        db.quote.count({ where: { sellerUserId: id } }),
        db.productDraft.count({ where: { userId: id } }),
        db.notification.count({ where: { userId: id } }),
        db.message.findFirst({ where: { senderId: id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
        db.post.findFirst({ where: { authorId: id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
        db.assistantThread.findFirst({ where: { userId: id }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
      ]);
      const times = [lastMsg?.createdAt, lastPost?.createdAt, lastThread?.updatedAt].filter((d): d is Date => !!d).map((d) => d.getTime());
      accounts.push({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        position: u.position,
        isAdmin: u.isAdmin,
        phone: maskPhone(u.phone),
        company: u.company,
        createdAt: u.createdAt,
        lastActive: times.length ? new Date(Math.max(...times)) : null,
        counts: { posts, comments, likes, messages, conversations, connections, assistantThreads, sampleRequests, quoteRequests, quotes, productDrafts: products, notifications },
      });
    }
    accounts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    groups.push({ phone: reason === 'telefon' ? maskPhone(key) : `${accounts[0].firstName} ${accounts[0].lastName}`, reason, accounts });
  }
  return groups;
}

export type MergeError = 'same_user' | 'user_not_found' | 'not_duplicates' | 'different_companies';
// sameName: telefonları farklı ama aynı firmada aynı adlı hesaplar (yönetici ayrıca onaylar).

// removeUserId hesabının tüm kayıtları keepUserId'ye taşınır, sonra removeUserId silinir. Tek işlem
// (transaction): bir adım hata verirse hiçbir şey değişmez.
export async function mergeAccounts(keepUserId: string, removeUserId: string, opts: { force?: boolean; sameName?: boolean } = {}, db: Db = defaultPrisma): Promise<{ ok: true } | { ok: false; error: MergeError }> {
  if (keepUserId === removeUserId) return { ok: false, error: 'same_user' };
  const [keep, remove] = await Promise.all([db.user.findUnique({ where: { id: keepUserId } }), db.user.findUnique({ where: { id: removeUserId } })]);
  if (!keep || !remove) return { ok: false, error: 'user_not_found' };
  const canonical = normalizePhone(keep.phone);
  const samePhone = canonical === normalizePhone(remove.phone);
  const sameNameCo = !!opts.sameName && !!keep.companyId && keep.companyId === remove.companyId && nameKey(keep.firstName, keep.lastName) === nameKey(remove.firstName, remove.lastName);
  if (!samePhone && !sameNameCo) return { ok: false, error: 'not_duplicates' };
  if (keep.companyId && remove.companyId && keep.companyId !== remove.companyId && !opts.force) return { ok: false, error: 'different_companies' };

  const K = keepUserId;
  const R = removeUserId;
  await db.$transaction(
    async (tx) => {
      // Bağlantılar: ikisi arasındaki bağlantı silinir; üçüncü kişiyle keep'in zaten bağlantısı varsa R'ninki silinir.
      await tx.connection.deleteMany({ where: { OR: [{ requesterId: K, addresseeId: R }, { requesterId: R, addresseeId: K }] } });
      for (const c of await tx.connection.findMany({ where: { OR: [{ requesterId: R }, { addresseeId: R }] } })) {
        const other = c.requesterId === R ? c.addresseeId : c.requesterId;
        const dup = await tx.connection.findFirst({ where: { OR: [{ requesterId: K, addresseeId: other }, { requesterId: other, addresseeId: K }] } });
        if (dup) {
          // Kabul edilmiş olan korunur.
          if (dup.status !== 'accepted' && c.status === 'accepted') await tx.connection.update({ where: { id: dup.id }, data: { status: 'accepted', respondedAt: c.respondedAt ?? new Date() } });
          await tx.connection.delete({ where: { id: c.id } });
        } else {
          await tx.connection.update({ where: { id: c.id }, data: c.requesterId === R ? { requesterId: K } : { addresseeId: K } });
        }
      }

      // Sohbetler: ikisi arasındaki sohbet (kendi kendine) silinir; üçüncü kişiyle ortak sohbet varsa mesajlar birleşir.
      const self = await tx.conversation.findUnique({ where: { userAId_userBId: canonicalPair(K, R) } });
      if (self) {
        const msgIds = (await tx.message.findMany({ where: { conversationId: self.id }, select: { id: true } })).map((m) => m.id);
        await tx.videoLink.updateMany({ where: { OR: [{ conversationId: self.id }, { messageId: { in: msgIds } }] }, data: { conversationId: null, messageId: null } });
        await tx.message.deleteMany({ where: { conversationId: self.id } });
        await tx.conversation.delete({ where: { id: self.id } });
      }
      for (const conv of await tx.conversation.findMany({ where: { OR: [{ userAId: R }, { userBId: R }] } })) {
        const other = conv.userAId === R ? conv.userBId : conv.userAId;
        const pair = canonicalPair(K, other);
        const target = await tx.conversation.findUnique({ where: { userAId_userBId: pair } });
        if (target) {
          await tx.message.updateMany({ where: { conversationId: conv.id }, data: { conversationId: target.id } });
          await tx.videoLink.updateMany({ where: { conversationId: conv.id }, data: { conversationId: target.id } });
          await tx.conversation.delete({ where: { id: conv.id } });
        } else {
          await tx.conversation.update({ where: { id: conv.id }, data: pair });
        }
      }

      // Tekil anahtarlı kayıtlar: keep'te aynısı varsa R'ninki silinir, yoksa taşınır.
      const favK = new Set((await tx.productFavorite.findMany({ where: { userId: K }, select: { productId: true } })).map((r) => r.productId));
      await tx.productFavorite.deleteMany({ where: { userId: R, productId: { in: [...favK] } } });
      await tx.productFavorite.updateMany({ where: { userId: R }, data: { userId: K } });
      const viewK = new Set((await tx.productView.findMany({ where: { userId: K }, select: { productId: true } })).map((r) => r.productId));
      await tx.productView.deleteMany({ where: { userId: R, productId: { in: [...viewK] } } });
      await tx.productView.updateMany({ where: { userId: R }, data: { userId: K } });
      const likeK = new Set((await tx.postLike.findMany({ where: { userId: K }, select: { postId: true } })).map((r) => r.postId));
      await tx.postLike.deleteMany({ where: { userId: R, postId: { in: [...likeK] } } });
      await tx.postLike.updateMany({ where: { userId: R }, data: { userId: K } });
      const repK = new Set((await tx.postReport.findMany({ where: { reporterId: K }, select: { postId: true } })).map((r) => r.postId));
      await tx.postReport.deleteMany({ where: { reporterId: R, postId: { in: [...repK] } } });
      await tx.postReport.updateMany({ where: { reporterId: R }, data: { reporterId: K } });
      const muteK = new Set((await tx.feedMute.findMany({ where: { userId: K }, select: { companyId: true } })).map((r) => r.companyId));
      await tx.feedMute.deleteMany({ where: { userId: R, companyId: { in: [...muteK] } } });
      await tx.feedMute.updateMany({ where: { userId: R }, data: { userId: K } });

      // Profil, fotoğraf, deneyim: keep'te yoksa R'ninki alınır, varsa R'ninki silinir.
      const extra: Prisma.UserUpdateInput = {};
      if (await tx.userAvatar.findUnique({ where: { userId: K } })) await tx.userAvatar.deleteMany({ where: { userId: R } });
      else if (await tx.userAvatar.findUnique({ where: { userId: R } })) {
        await tx.userAvatar.update({ where: { userId: R }, data: { userId: K } });
        extra.avatarUpdatedAt = remove.avatarUpdatedAt ?? new Date();
      }
      if (await tx.userProfile.findUnique({ where: { userId: K } })) await tx.userProfile.deleteMany({ where: { userId: R } });
      else await tx.userProfile.updateMany({ where: { userId: R }, data: { userId: K } });
      if ((await tx.userExperience.count({ where: { userId: K } })) > 0) await tx.userExperience.deleteMany({ where: { userId: R } });
      else await tx.userExperience.updateMany({ where: { userId: R }, data: { userId: K } });

      // Geri kalan sahiplikler doğrudan taşınır.
      await tx.sampleRequest.updateMany({ where: { requesterId: R }, data: { requesterId: K } });
      await tx.sampleRequestEvent.updateMany({ where: { actorId: R }, data: { actorId: K } });
      await tx.message.updateMany({ where: { senderId: R }, data: { senderId: K } });
      await tx.post.updateMany({ where: { authorId: R }, data: { authorId: K } });
      await tx.postComment.updateMany({ where: { authorId: R }, data: { authorId: K } });
      await tx.video.updateMany({ where: { ownerId: R }, data: { ownerId: K } });
      await tx.assistantThread.updateMany({ where: { userId: R }, data: { userId: K } });
      await tx.whatsAppInbound.updateMany({ where: { userId: R }, data: { userId: K } });
      await tx.notification.updateMany({ where: { userId: R }, data: { userId: K } });
      await tx.watchRule.updateMany({ where: { userId: R }, data: { userId: K } });
      await tx.quoteRequest.updateMany({ where: { buyerId: R }, data: { buyerId: K } });
      await tx.quote.updateMany({ where: { sellerUserId: R }, data: { sellerUserId: K } });
      await tx.companyQuestion.updateMany({ where: { askerId: R }, data: { askerId: K } });
      await tx.lookSearch.updateMany({ where: { userId: R }, data: { userId: K } });
      await tx.dealReview.updateMany({ where: { authorUserId: R }, data: { authorUserId: K } });
      await tx.invite.updateMany({ where: { inviterId: R }, data: { inviterId: K } });
      await tx.invite.updateMany({ where: { joinedUserId: R }, data: { joinedUserId: K } });
      await tx.pushSubscription.updateMany({ where: { userId: R }, data: { userId: K } });
      await tx.verificationRequest.updateMany({ where: { userId: R }, data: { userId: K } });
      await tx.rfq.updateMany({ where: { buyerId: R }, data: { buyerId: K } });
      await tx.tender.updateMany({ where: { buyerId: R }, data: { buyerId: K } });
      await tx.tenderOffer.updateMany({ where: { sellerUserId: R }, data: { sellerUserId: K } });
      await tx.deal.updateMany({ where: { buyerId: R }, data: { buyerId: K } });
      await tx.companyReference.updateMany({ where: { createdById: R }, data: { createdById: K } });
      await tx.productDraft.updateMany({ where: { userId: R }, data: { userId: K } });

      await tx.user.delete({ where: { id: R } });
      await tx.user.update({
        where: { id: K },
        data: {
          ...extra,
          phone: canonical,
          phoneVerified: keep.phoneVerified || remove.phoneVerified,
          isAdmin: keep.isAdmin || remove.isAdmin,
          ...(!keep.companyId && remove.companyId ? { company: { connect: { id: remove.companyId } } } : {}),
        },
      });
    },
    { timeout: 60_000 }
  );
  return { ok: true };
}
