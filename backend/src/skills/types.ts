// Beceri sözleşmesi (yol haritası §5, Faz 1 planı Adım 4).
//
// Bir beceri = girdi şeması (zod/v4, alan açıklamaları Türkçe) + saf hesap +
// sonucu anlatma kalıbı. Şemalar zod/v4 ile yazılır çünkü Adım 5'te asistan
// aynı şemaları `betaZodTool` ile doğrudan araç olarak kaydedecek ve
// `z.toJSONSchema` ile listeleyecek; JSON şema elle yazılmaz.
//
// İlke: model hesap yapmaz. Rakam yalnızca `run`'dan çıkar; `summarize` bu
// rakamları Türkçe cümleye döker, asistan bu metnin dışında sayı söylemez.
import * as z from 'zod/v4';

export type SkillInputSchema = z.ZodObject<z.ZodRawShape>;

export interface Skill<I extends SkillInputSchema = SkillInputSchema, O = unknown> {
  // Makine adı (URL ve araç adı): camelCase, ör. "fabricPricing".
  name: string;
  // Ekran adı: "Kumaş maliyeti".
  title: string;
  // Asistan için: ne yapar, hangi soruda kullanılır, neyi YAPMAZ.
  description: string;
  // Kısa formül özeti (kullanıcıya "nasıl hesaplandı" için).
  formula: string;
  inputSchema: I;
  // Saf ve senkron: girdi → çıktı. Hata fırlatmaz; anlamsız girdi şemada yakalanır.
  run: (input: z.infer<I>) => O;
  // Sonucu Türkçe anlatma: yalnızca çıktıdaki sayılar, yuvarlanmış.
  summarize: (input: z.infer<I>, output: O) => string;
}

// Kayıt listesi için tür silinmiş hali (run parametresi kontra-varyant, Skill<...> ortak türe atanamaz).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySkill = Skill<any, any>;

export function defineSkill<I extends SkillInputSchema, O>(skill: Skill<I, O>): Skill<I, O> {
  return skill;
}

// Ekran/asistan metni için yuvarlama: 1.234,5 biçimi (tr-TR).
export function fmt(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return '-';
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}
