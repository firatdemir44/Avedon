import { Prisma } from '@prisma/client';
import { prisma } from './db';

// Sohbet kaydında userAId her zaman userBId'den küçüktür. Bu sayede iki kişi
// arasındaki sohbet, hangi taraftan bakılırsa bakılsın tek bir unique anahtarla
// bulunur — çift yönlü OR sorgusuna ve mükerrer sohbet kaydına gerek kalmaz.
export function canonicalPair(x: string, y: string): { userAId: string; userBId: string } {
  return x < y ? { userAId: x, userBId: y } : { userAId: y, userBId: x };
}

export const PARTICIPANT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  position: true,
  company: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

export function isParticipant(conversation: { userAId: string; userBId: string }, userId: string): boolean {
  return conversation.userAId === userId || conversation.userBId === userId;
}

export function otherParticipantId(conversation: { userAId: string; userBId: string }, meId: string): string {
  return conversation.userAId === meId ? conversation.userBId : conversation.userAId;
}

// Çağıran taraf bağlantı/kendine-mesaj/kullanıcı-var-mı kontrollerini yapmış olmalı.
export async function findOrCreateConversation(meId: string, otherId: string) {
  const pair = canonicalPair(meId, otherId);

  const existing = await prisma.conversation.findUnique({
    where: { userAId_userBId: pair },
  });
  if (existing) return existing;

  try {
    return await prisma.conversation.create({ data: pair });
  } catch (err) {
    // Eşzamanlı iki istek aynı sohbeti oluşturmaya çalışmış olabilir.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const created = await prisma.conversation.findUnique({ where: { userAId_userBId: pair } });
      if (created) return created;
    }
    throw err;
  }
}
