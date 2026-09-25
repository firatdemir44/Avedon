import fs from 'node:fs';
import path from 'node:path';

// Canlıda verinin gerçekten kalıcı diske yazılıp yazılmadığını dışarıdan
// görebilmek için (/api/health). Render'ın ücretsiz/geçici dosya sisteminde
// SQLite her yeniden yayında siliniyor; kalıcı disk ise ayrı bir bağlama
// noktası olarak takılıyor. Bir klasörün kök dizinle aynı aygıtta olmaması
// (stat.dev farklı) orada ayrı bir diskin bağlı olduğunu gösterir.
// Gizli bilgi içermez: yalnızca dosya yolu ve evet/hayır.

export interface StorageInfo {
  databasePath: string | null;
  databaseExists: boolean;
  separateDisk: boolean | null;
}

export function resolveSqlitePath(url: string | undefined): string | null {
  if (!url || !url.startsWith('file:')) return null;
  const raw = url.slice('file:'.length);
  // Prisma göreli SQLite yollarını schema.prisma'nın klasörüne göre çözer.
  // Bu dosya hem src/ hem dist/ altından çalıştığı için ../prisma iki durumda da doğru.
  return path.isAbsolute(raw) ? raw : path.resolve(__dirname, '..', 'prisma', raw);
}

export function getStorageInfo(): StorageInfo {
  const databasePath = resolveSqlitePath(process.env.DATABASE_URL);
  if (!databasePath) {
    return { databasePath: null, databaseExists: false, separateDisk: null };
  }

  let separateDisk: boolean | null = null;
  try {
    const dirDevice = fs.statSync(path.dirname(databasePath)).dev;
    const rootDevice = fs.statSync(path.parse(databasePath).root).dev;
    separateDisk = dirDevice !== rootDevice;
  } catch {
    // Klasör yoksa disk de bağlı değildir; bilinmiyor olarak bırakılıyor.
  }

  return { databasePath, databaseExists: fs.existsSync(databasePath), separateDisk };
}
