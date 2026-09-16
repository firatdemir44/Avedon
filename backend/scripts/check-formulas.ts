// Sunucu ve uygulamadaki hesap formülü kopyalarının aynı olduğunu doğrular
// (Faz 1, Adım 4 kararı: formüller mobilde de kalır, backend doğruluk kaynağı,
// iki dosya birebir aynı metin olmalı). Satır sonu farkı (CRLF/LF) göz ardı edilir.
// Çalıştırma (backend klasöründe): npx tsx scripts/check-formulas.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER = resolve(__dirname, '../src/domain/calc/formulas.ts');
const MOBILE = resolve(__dirname, '../../mobile/src/features/calculators/formulas.ts');

const lines = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n').split('\n');

const server = lines(SERVER);
const mobile = lines(MOBILE);

for (let i = 0; i < Math.max(server.length, mobile.length); i++) {
  if (server[i] === mobile[i]) continue;
  console.error('FORMÜLLER FARKLI: backend/src/domain/calc/formulas.ts ile mobile/src/features/calculators/formulas.ts eşitlenmeli.');
  console.error(`İlk fark ${i + 1}. satırda:`);
  console.error(`  backend: ${server[i] === undefined ? '(satır yok)' : JSON.stringify(server[i])}`);
  console.error(`  mobil  : ${mobile[i] === undefined ? '(satır yok)' : JSON.stringify(mobile[i])}`);
  process.exit(1);
}

console.log(`Formül kopyaları aynı (${server.length} satır).`);
