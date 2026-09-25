import fs from 'node:fs';
import path from 'node:path';
import { resolveSqlitePath } from '../storageCheck';

// Texart saklama (TEXART.md §2): her iş kendi klasöründe — orijinal + çıktılar + işlem kaydı.
// Klasör veritabanının yanında durur; canlıda Render kalıcı diski (/var/data/texart), yerelde
// backend/prisma/texart (gitignore). Orijinal hiç silinmez; işlem her zaman ondan yeniden üretilir.

export function texartRoot() {
  if (process.env.TEXART_DIR) return process.env.TEXART_DIR;
  const db = resolveSqlitePath(process.env.DATABASE_URL);
  return path.join(db ? path.dirname(db) : path.resolve(__dirname, '..', '..', 'prisma'), 'texart');
}

// İş id'si cuid; yol dışına çıkmayı önlemek için yalnız harf/rakam kabul edilir.
function jobDir(jobId: string) {
  if (!/^[a-z0-9]{10,40}$/i.test(jobId)) throw new Error('invalid_job_id');
  return path.join(texartRoot(), jobId);
}

export async function saveOriginal(jobId: string, buf: Buffer, ext: string) {
  const dir = jobDir(jobId);
  await fs.promises.mkdir(dir, { recursive: true });
  const name = `orijinal.${ext}`;
  await fs.promises.writeFile(path.join(dir, name), buf);
  return name;
}

export async function readOriginal(jobId: string, name: string) {
  return fs.promises.readFile(path.join(jobDir(jobId), name));
}

export async function writeOutput(jobId: string, name: string, buf: Buffer | string, ext: string) {
  const dir = jobDir(jobId);
  await fs.promises.mkdir(dir, { recursive: true });
  const file = `${name}.${ext}`;
  await fs.promises.writeFile(path.join(dir, file), buf);
  return file;
}

/** Dışarı verilebilecek dosya: yalnız bilinen adlar (orijinal + çıktılar), iş klasörü içinden. */
export function publicFilePath(jobId: string, file: string) {
  if (!/^(orijinal|katalog|katalog_2x|yakin_plan|renk_cipi|islem_kaydi)\.(jpg|png|webp|json)$/.test(file)) return null;
  let dir: string;
  try {
    dir = jobDir(jobId);
  } catch {
    return null;
  }
  const p = path.join(dir, file);
  return fs.existsSync(p) ? p : null;
}

export async function storeStatus() {
  const root = texartRoot();
  try {
    await fs.promises.mkdir(root, { recursive: true });
    await fs.promises.access(root, fs.constants.W_OK);
    return { writable: true };
  } catch {
    return { writable: false };
  }
}
