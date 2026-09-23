// Firma rehberi tohumu (2026-09-23): data/directory/*.json dosyalarındaki herkese açık birlik/dernek
// üye listeleri (yalnızca unvan, kategori, il, web, kaynak) açılışta rehbere SAHİPSİZ firma olarak
// eklenir. importCompanies aynı adlı firmayı atladığı için her açılışta tekrar çalışması zararsız;
// yine de kaynağın satırları zaten eklenmişse hiç sorgu yapılmadan geçilir.
import fs from 'fs';
import path from 'path';
import { prisma } from './db';
import { MAX_IMPORT_ROWS, importCompanies, type ImportRow } from './directory';

const DIR = path.join(__dirname, '..', 'data', 'directory');

export async function seedDirectoryFromFiles() {
  if (!fs.existsSync(DIR)) return;
  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
    let rows: ImportRow[];
    try {
      rows = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
    } catch (err) {
      console.error('[directory-seed] okunamadı', file, (err as Error).message);
      continue;
    }
    if (!rows.length) continue;
    const source = rows[0].source ?? '';
    const existing = source ? await prisma.company.count({ where: { source } }) : 0;
    // Kaynağın satırlarının çoğu zaten varsa (mükerrer adlar atlandığı için tam eşitlik beklenmez) geç.
    if (existing >= rows.length * 0.8) continue;
    let created = 0;
    for (let i = 0; i < rows.length; i += MAX_IMPORT_ROWS) {
      const r = await importCompanies(rows.slice(i, i + MAX_IMPORT_ROWS));
      created += r.created;
    }
    console.log(`[directory-seed] ${file}: ${created} firma eklendi (${rows.length} satır)`);
  }
}
