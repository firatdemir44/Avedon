import crypto from 'crypto';
import { prisma } from './db';
import { notify } from './notifications';

// Davet mekaniği (Faz 2, Adım 4): "tedarikçini / müşterini davet et". Davet kişiye özel bir kod ve
// paylaşım bağlantısıdır (WhatsApp'tan gönderilir). Davet edilen kayıt olunca:
//  - davette telefon yazılıysa ve kayıt olan numara AYNIYSA: iki kişi doğrudan bağlantılı olur
//    (davet eden o kişiyi adıyla çağırmıştı; karşı taraf da bağlantıya dokunup kaydolarak kabul etti),
//  - telefon yazılmadıysa ya da farklıysa (bağlantı başkasına iletilmiş olabilir): yeni kullanıcıdan
//    davet edene BEKLEYEN bağlantı isteği düşer, davet eden onaylar.
// Kod yazılmasa bile, kayıt olan numaraya açık bir davet varsa aynı kural işler.
export const MAX_INVITES_PER_DAY = 20;
export const MAX_JOINS_PER_OPEN_INVITE = 5;

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newInviteCode() {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

const publicBase = () => (process.env.PUBLIC_WEB_URL ?? 'https://avedon-blond.vercel.app').replace(/\/+$/, '');
export const inviteUrl = (code: string) => `${publicBase()}/?davet=${code}`;

export function inviteShareText(inviterName: string, companyName: string | null, code: string, relation: string) {
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
export async function applyInvitesOnRegistration(newUser: { id: string; phone: string; firstName: string; lastName: string }, inviteCode?: string | null) {
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

    const direct = phoneMatches;
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
    await notify(invite.inviterId, {
      kind: 'invite_joined',
      title: '{name} davetinizle katıldı',
      vars: { name: `${newUser.firstName} ${newUser.lastName}` },
      body: direct ? 'Artık bağlantınız; ürünlerini görebilir, mesaj yazabilirsiniz.' : 'Bağlantı isteği gönderdi; onaylarsanız bağlantınız olur.',
      data: { userId: newUser.id, inviteId: invite.id },
    });
  }
}
