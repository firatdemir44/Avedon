import { prisma } from '../db';
import { runPipeline } from './pipeline';
import { readOriginal, writeOutput } from './store';

// Asenkron iş kuyruğu (TEXART.md §2): süreç içinde, tek seferde bir iş (görüntü işleme CPU/bellek
// yoğun; Render Starter'da paralel iş belleği aşar). Durum veritabanında tutulduğu için yeniden
// başlatmada yarım kalan işler kuyruğa geri alınır.

const pending: string[] = [];
let running = false;

export function enqueueTexartJob(id: string) {
  if (!pending.includes(id)) pending.push(id);
  void drain();
}

async function drain() {
  if (running) return;
  running = true;
  try {
    for (let id = pending.shift(); id; id = pending.shift()) await processJob(id);
  } finally {
    running = false;
  }
}

export async function processJob(id: string) {
  const job = await prisma.texartJob.findUnique({ where: { id } });
  if (!job || (job.status !== 'kuyrukta' && job.status !== 'isleniyor')) return;
  await prisma.texartJob.update({ where: { id }, data: { status: 'isleniyor' } });
  try {
    const result = await runPipeline(await readOriginal(id, job.originalName));
    if (result.durum === 'yeniden_cekim') {
      await prisma.texartJob.update({
        where: { id },
        data: {
          status: 'yeniden_cekim',
          metricsJson: JSON.stringify(result.olcumler),
          warningsJson: JSON.stringify(result.uyarilar),
          logJson: JSON.stringify(result.islem_kaydi),
        },
      });
      return;
    }
    const outputs: Record<string, string> = {};
    for (const [name, buf] of Object.entries(result.ciktilar)) {
      if (buf) outputs[name] = await writeOutput(id, name, buf, name === 'renk_cipi' ? 'png' : 'jpg');
    }
    const record = { ciktilar: outputs, renkler: result.renkler, olcumler: result.olcumler, uyarilar: result.uyarilar, islem_kaydi: result.islem_kaydi };
    await writeOutput(id, 'islem_kaydi', JSON.stringify(record, null, 2), 'json');
    await prisma.texartJob.update({
      where: { id },
      data: {
        status: 'tamam',
        width: result.boyut.width,
        height: result.boyut.height,
        outputsJson: JSON.stringify({ dosyalar: outputs, renkler: result.renkler }),
        metricsJson: JSON.stringify(result.olcumler),
        warningsJson: JSON.stringify(result.uyarilar),
        logJson: JSON.stringify(result.islem_kaydi),
      },
    });
  } catch (err) {
    console.error('[texart] iş hatası', id, err);
    await prisma.texartJob.update({ where: { id }, data: { status: 'hata', error: String((err as Error)?.message ?? err).slice(0, 300) } });
  }
}

/** Açılışta: yarım kalan işler kuyruğa geri. */
export async function startTexartWorker() {
  const rows = await prisma.texartJob.findMany({
    where: { status: { in: ['kuyrukta', 'isleniyor'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  rows.forEach((r) => enqueueTexartJob(r.id));
  return rows.length;
}

export async function texartHealth() {
  const [kuyrukta, isleniyor, tamam, yeniden_cekim, hata] = await Promise.all(
    ['kuyrukta', 'isleniyor', 'tamam', 'yeniden_cekim', 'hata'].map((status) => prisma.texartJob.count({ where: { status } }))
  );
  return { kuyrukta, isleniyor, tamam, yeniden_cekim, hata };
}
