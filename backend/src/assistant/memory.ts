import { prisma } from '../db';
import { MEMORY_KEYS, memoryKeyDef } from './memoryKeys';

export interface MemoryEntry {
  key: string;
  label: string;
  hint: string;
  kind: 'number' | 'text' | 'list';
  value: unknown;
  updatedAt: Date;
}

function parseValue(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}

// Firmanın kayıtlı varsayılanları, bilinen anahtar sırasıyla.
export async function readMemory(companyId: string): Promise<MemoryEntry[]> {
  const rows = await prisma.companyMemory.findMany({ where: { companyId } });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out: MemoryEntry[] = [];
  for (const def of MEMORY_KEYS) {
    const row = byKey.get(def.key);
    if (!row) continue;
    out.push({ key: def.key, label: def.label, hint: def.hint, kind: def.kind, value: parseValue(row.valueJson), updatedAt: row.updatedAt });
  }
  return out;
}

export async function writeMemory(companyId: string, key: string, value: unknown): Promise<MemoryEntry> {
  const def = memoryKeyDef(key);
  if (!def) throw new Error('unknown_memory_key');
  const row = await prisma.companyMemory.upsert({
    where: { companyId_key: { companyId, key } },
    create: { companyId, key, valueJson: JSON.stringify(value) },
    update: { valueJson: JSON.stringify(value) },
  });
  return { key, label: def.label, hint: def.hint, kind: def.kind, value, updatedAt: row.updatedAt };
}

export async function deleteMemory(companyId: string, key: string) {
  await prisma.companyMemory.deleteMany({ where: { companyId, key } });
}
