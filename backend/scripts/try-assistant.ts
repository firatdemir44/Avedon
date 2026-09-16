// Gerçek modelle asistanı elle denemek için (ücretli çağrı!). Çalışan yerel
// sunucuya karşı, ilk firma kullanıcısının oturumuyla yeni bir sohbet açar ve
// verilen soruları sırayla gönderir:
//   node --env-file=.env --import tsx scripts/try-assistant.ts "30/1 Ne iplik kaç tex?" "peki 60/2?"
//   COMPANY_ID=... ile firma seçilir; THREAD_ID=... ile var olan sohbete devam edilir.
import { PrismaClient } from '@prisma/client';
import { signSessionToken } from '../src/auth';

const prisma = new PrismaClient();
const BASE = process.env.API_BASE ?? 'http://localhost:4000/api';

async function main() {
  const questions = process.argv.slice(2);
  if (!questions.length) throw new Error('kullanım: try-assistant.ts "soru 1" ["soru 2" ...]');
  const user = await prisma.user.findFirst({ where: process.env.COMPANY_ID ? { companyId: process.env.COMPANY_ID } : { companyId: { not: null } } });
  if (!user) throw new Error('firma kullanıcısı yok');
  const headers = { Authorization: `Bearer ${signSessionToken(user.id)}`, 'Content-Type': 'application/json' };

  let threadId = process.env.THREAD_ID;
  if (!threadId) {
    const res = await fetch(`${BASE}/assistant/threads`, { method: 'POST', headers });
    threadId = ((await res.json()) as any).thread.id;
    console.log('sohbet', threadId);
  }

  for (const q of questions) {
    console.log(`\n> ${q}`);
    const t0 = Date.now();
    const res = await fetch(`${BASE}/assistant/threads/${threadId}/messages`, { method: 'POST', headers, body: JSON.stringify({ text: q }) });
    const json = (await res.json()) as any;
    console.log(`durum ${res.status}, ${Date.now() - t0} ms, jeton`, json.usage);
    if (json.message) {
      console.log(json.message.text);
      for (const c of json.message.toolCalls ?? []) console.log(`  [araç ${c.name}] ${c.summary}`);
      for (const s of json.message.memorySuggestions ?? []) console.log(`  [hafıza önerisi] ${s.label} = ${JSON.stringify(s.value)} (${s.reason})`);
    } else {
      console.log(JSON.stringify(json));
    }
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
