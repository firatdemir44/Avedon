import crypto from 'crypto';
import { prisma } from './db';
import { notify, notifyMany } from './notifications';

// Davet mekaniği (Faz 2, Adım 4): "tedarikçini / müşterini davet et". Davet kişiye özel bir kod ve
// paylaşım bağlantısıdır (WhatsApp'tan gönderilir). Davet edilen kayıt olunca:
//  - davette telefon yazılıysa ve kayıt olan numara AYNIYSA: iki kişi doğrudan bağlantılı olur
//    (davet eden o kişiyi adıyla çağırmıştı; karşı taraf da bağlantıya dokunup kaydolarak kabul etti),
//  - telefon yazılmadıysa ya da farklıysa (bağlantı başkasına iletilmiş olabilir): yeni kullanıcıdan
//    davet edene BEKLEYEN bağlantı isteği düşer, davet eden onaylar.
// Kod yazılmasa bile, kayıt olan numaraya açık bir davet varsa aynı kural işler.
export const MAX_INVITES_PER_DAY = 20;
export const MAX_JOINS_PER_OPEN_INVITE = 5;
// Ekip arkadaşı daveti: davet edilen, davet edenin firmasına çalışan olarak katılır.
export const TEAM_RELATION = 'ekip';

export type TeamInviteResult =
  | { ok: true; inviteId: string; companyId: string; accountType: 'konfeksiyon' | 'uretici' }
  | { ok: false; error: 'invite_not_found' | 'invite_used' | 'invite_phone_mismatch' | 'inviter_has_no_company' }
  | null; // ekip daveti değil (ya da kod yok): normal kayıt

// Kayıtta kod bir ekip davetiyse firmayı çözer. İptal edilmiş davet geçmez; telefonu yazılı davet yalnızca
// o numarayla kullanılır (firmaya katılmak bağlantıdan güçlü bir yetki: iletilmiş bağlantıyla başkası
// firmaya giremesin); telefonsuz davet en fazla MAX_JOINS_PER_OPEN_INVITE kişi katar.
export async function resolveTeamInvite(inviteCode: string | null | undefined, phone: string): Promise<TeamInviteResult> {
  const code = (inviteCode ?? '').trim().toUpperCase();
  if (!code) return null;
  const invite = await prisma.invite.findUnique({ where: { code } });
  if (!invite || invite.relation !== TEAM_RELATION) return null;
  if (invite.status === 'cancelled') return { ok: false, error: 'invite_not_found' };
  if (invite.inviteePhone) {
    if (invite.inviteePhone !== phone) return { ok: false, error: 'invite_phone_mismatch' };
    if (invite.status === 'joined') return { ok: false, error: 'invite_used' };
  } else if (invite.joinCount >= MAX_JOINS_PER_OPEN_INVITE) return { ok: false, error: 'invite_used' };
  const inviter = await prisma.user.findUnique({ where: { id: invite.inviterId }, select: { companyId: true, accountType: true } });
  const companyId = invite.inviterCompanyId ?? inviter?.companyId ?? null;
  if (!inviter || !companyId) return { ok: false, error: 'inviter_has_no_company' };
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!company) return { ok: false, error: 'inviter_has_no_company' };
  return { ok: true, inviteId: invite.id, companyId, accountType: inviter.accountType === 'konfeksiyon' ? 'konfeksiyon' : 'uretici' };
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newInviteCode() {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

const publicBase = () => (process.env.PUBLIC_WEB_URL ?? 'https://avedon-blond.vercel.app').replace(/\/+$/, '');
export const inviteUrl = (code: string) => `${publicBase()}/?davet=${code}`;

export function inviteShareText(inviterName: string, companyName: string | null, code: string, relation: string) {
  if (relation === TEAM_RELATION && companyName) return `Takyon'da ${companyName} ekibine katıl: ${inviteUrl(code)}\nDavet kodu: ${code}`;
  const who = companyName ? `${inviterName} (${companyName})` : inviterName;
  const why =
    relation === 'tedarikci'
      ? 'Ürünlerinizi ve stoklarınızı oradan takip etmek, numune ve teklif isteklerimi oradan iletmek istiyorum.'
      : relation === 'musteri'
        ? 'Ürünlerimi, stoklarımı ve yeni kalitelerimi oradan görebilir, numune ve teklif isteyebilirsiniz.'
        : 'Tekstil firmalarının ürün, numune ve teklif işlerini yürüttüğü bir platform.';
  return `Merhaba, ben ${who}. Sizi Takyon'a davet ediyorum. ${why}\n\nKayıt: ${inviteUrl(code)}\nDavet kodu: ${code}`;
}

// Kayıt tamamlanınca çağrılır (register.ts). Hata kaydı bozmaz; çağıran yutar.
export async function applyInvitesOnRegistration(newUser: { id: string; phone: string; firstName: string; lastName: string; companyId?: string | null }, inviteCode?: string | null) {
  const code = (inviteCode ?? '').trim().toUpperCase();
  const candidates = await prisma.invite.findMany({
    where: { status: { in: ['pending', 'joined'] }, OR: [...(code ? [{ code }] : []), { inviteePhone: newUser.phone }] },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const handledInviters = new Set<string>();
  for (const invite of candidates) {
    if (invite.inviterId === newUser.id || handledInviters.has(invite.inviterId)) continue;
    const phoneMatches = !!invite.inviteePhone && invite.inviteePhone === newUser.phone;
    const byCode = !!code && invite.code === code;
    // Telefonu belirli davet başka numarayla kullanılırsa (bağlantı iletilmiş olabilir) yalnızca kodla
    // geldiyse işlenir ve doğrudan bağlantı yerine BEKLEYEN istek oluşur (aşağıda direct = false).
    if (invite.inviteePhone && !phoneMatches && !byCode) continue;
    // Numarası eşleşmeyen katılımlar (açık davet ya da iletilmiş bağlantı) sınırlıdır.
    if (!phoneMatches && invite.joinCount >= MAX_JOINS_PER_OPEN_INVITE) continue;
    handledInviters.add(invite.inviterId);

    // Yalnızca kişi gerçekten bu davetle firmaya katıldıysa (kodla gelmeyen kayıt firmaya girmez).
    const team = invite.relation === TEAM_RELATION && !!newUser.companyId && newUser.companyId === invite.inviterCompanyId;
    // Ekip davetinde kişi firmaya katıldı (resolveTeamInvite doğruladı): bağlantı doğrudan kurulur.
    const direct = phoneMatches || team;
    const existing = await prisma.connection.findFirst({
      where: { OR: [{ requesterId: invite.inviterId, addresseeId: newUser.id }, { requesterId: newUser.id, addresseeId: invite.inviterId }] },
    });
    if (!existing) {
      await prisma.connection.create({
        data: direct
          ? { requesterId: invite.inviterId, addresseeId: newUser.id, status: 'accepted', respondedAt: new Date() }
          : { requesterId: newUser.id, addresseeId: invite.inviterId, status: 'pending' },
      });
    }
    await prisma.invite.update({
      where: { id: invite.id },
      data: { status: 'joined', joinedUserId: invite.joinedUserId ?? newUser.id, joinedAt: invite.joinedAt ?? new Date(), joinCount: { increment: 1 } },
    });
    if (team) {
      // Davet eden dahil firmadaki herkese tek bildirim.
      const staff = invite.inviterCompanyId
        ? await prisma.user.findMany({ where: { companyId: invite.inviterCompanyId, id: { not: newUser.id } }, select: { id: true } })
        : [];
      await notifyMany([invite.inviterId, ...staff.map((u) => u.id)], {
        kind: 'invite_joined',
        title: '{name} ekibinize katıldı',
        vars: { name: `${newUser.firstName} ${newUser.lastName}` },
        body: 'Firmanıza çalışan olarak katıldı; ürünleri ve talepleri birlikte yönetebilirsiniz.',
        data: { userId: newUser.id, inviteId: invite.id },
      });
      continue;
    }
    await notify(invite.inviterId, {
      kind: 'invite_joined',
      title: '{name} davetinizle katıldı',
      vars: { name: `${newUser.firstName} ${newUser.lastName}` },
      body: direct ? 'Artık bağlantınız; ürünlerini görebilir, mesaj yazabilirsiniz.' : 'Bağlantı isteği gönderdi; onaylarsanız bağlantınız olur.',
      data: { userId: newUser.id, inviteId: invite.id },
    });
  }
}
