// Beceri kaydı: asistan (Adım 5) araçlarını buradan üretir, /api/skills buradan
// listeler ve çalıştırır. Yeni beceri = yeni dosya + bu listeye bir satır.
// Pasaport çıkarımı (skills/passportExtract) LLM çağıran, eşzamansız bir
// beceridir; bu deterministik kayda girmez, asistan onu ayrı araç olarak ekler.
import * as z from 'zod/v4';
import { fabricGsmKnit } from './calc/fabricGsmKnit';
import { fabricGsmSample } from './calc/fabricGsmSample';
import { fabricLengthWeight } from './calc/fabricLengthWeight';
import { fabricPricing } from './calc/fabricPricing';
import { yarnRequirement } from './calc/yarnRequirement';
import { quoteDraft } from './calc/quoteDraft';
import { garmentCost } from './calc/garmentCost';
import { knitProduction } from './calc/knitProduction';
import { yarnCount } from './calc/yarnCount';
import { yarnCountFromSample } from './calc/yarnCountFromSample';
import { yarnUsage } from './calc/yarnUsage';
import { yarnUsageRatio } from './calc/yarnUsageRatio';
import type { AnySkill } from './types';
import { t, type Lang } from '../i18n';

export * from './types';

export const SKILLS: readonly AnySkill[] = [
  fabricPricing,
  knitProduction,
  yarnCount,
  yarnCountFromSample,
  yarnUsageRatio,
  fabricGsmSample,
  fabricGsmKnit,
  garmentCost,
  yarnUsage,
  fabricLengthWeight,
  yarnRequirement,
  quoteDraft,
];

const byName = new Map<string, AnySkill>(SKILLS.map((s) => [s.name, s]));

export function getSkill(name: string): AnySkill | null {
  return byName.get(name) ?? null;
}

export interface SkillListing {
  name: string;
  title: string;
  description: string;
  formula: string;
  inputSchema: unknown; // JSON şema (asistan aracı ve ileride web formu için)
}

export function listSkills(lang?: Lang): SkillListing[] {
  return SKILLS.map((s) => ({
    name: s.name,
    title: t(lang, s.title),
    description: t(lang, s.description),
    formula: s.formula,
    inputSchema: z.toJSONSchema(s.inputSchema),
  }));
}

export type SkillRunResult =
  | { ok: true; output: unknown; summary: string }
  | { ok: false; error: 'invalid_input'; details: z.core.$ZodIssue[] };

// Girdi doğrulanır (varsayılanlar doldurulur), saf hesap çalışır, özet üretilir.
export function runSkill(skill: AnySkill, rawInput: unknown, lang?: Lang): SkillRunResult {
  const parsed = skill.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i: z.core.$ZodIssue) => ({ ...i, message: t(lang, i.message) }));
    return { ok: false, error: 'invalid_input', details };
  }
  const output = skill.run(parsed.data);
  return { ok: true, output, summary: skill.summarize(parsed.data, output, lang) };
}
