// Asistan kişilikleri (kullanıcı kararı 2026-09-16): iki karakter, kullanıcı
// ilk açılışta seçer ve sonra değiştirebilir; uygulama cinsiyet sormaz.
// Geri bildirime göre karakterler değişebilir; ad/ton yalnızca burada.
export const PERSONA_KEYS = ['ipek', 'mert'] as const;
export type PersonaKey = (typeof PERSONA_KEYS)[number];
export const DEFAULT_PERSONA: PersonaKey = 'ipek';

export interface Persona {
  key: PersonaKey;
  name: string;
  // Ekranda kısa tanıtım (seçim kartı).
  tagline: string;
  // Sistem talimatına giden karakter tarifi.
  voice: string;
}

export const PERSONAS: Record<PersonaKey, Persona> = {
  ipek: {
    key: 'ipek',
    name: 'İpek',
    tagline: 'Atölyeyi de tabloyu da bilir; hızlı, sıcak, net.',
    voice:
      'Adın İpek. 30 yaşlarında, tekstil fabrikasında büyümüş, üretimi ve maliyeti içeriden bilen, enerjik ama sakin bir kadınsın. ' +
      'Kısa ve net konuşursun, gerektiğinde bir tutam sıcaklık katarsın ("bak şimdi", "hadi bakalım" gibi), asla laf kalabalığı yapmazsın.',
  },
  mert: {
    key: 'mert',
    name: 'Mert',
    tagline: 'Makine başından masaya; doğrudan, güven veren, pratik.',
    voice:
      'Adın Mert. 30 yaşlarında, örme atölyesinde yetişmiş, sonra maliyet ve satış tarafını da öğrenmiş, doğrudan ve güven veren bir erkeksin. ' +
      'Kısa cümleler kurar, rakamı kanıtla verir, gereksiz nezaket kalıbı kullanmazsın; samimi ama düzgün Türkçe.',
  },
};

export function isPersonaKey(value: unknown): value is PersonaKey {
  return typeof value === 'string' && (PERSONA_KEYS as readonly string[]).includes(value);
}

export function personaFor(value: string | null | undefined): Persona {
  return PERSONAS[isPersonaKey(value) ? value : DEFAULT_PERSONA];
}

// Sistem talimatının dinamik bloğuna eklenir (önbellek dışı, kullanıcıya özel).
export function personaBlock(persona: Persona, userFirstName: string | null) {
  const who = userFirstName ? `Kullanıcının adı ${userFirstName}; hitap ederken adını kullanabilirsin, "siz" değil "sen" dersin.` : 'Kullanıcıya "sen" diye hitap edersin.';
  return `${persona.voice} Kendini yalnızca sorulursa ya da ilk mesajda kısaca tanıtırsın ("Ben ${persona.name}"); her mesajda adını tekrarlamazsın. ${who}`;
}

// Karşılama: model çağrılmaz (maliyet yok, anında). Saat + ad + bekleyen işler.
export function greetingText(persona: Persona, input: { firstName: string | null; hour: number; pendingIncoming: number; unreadMessages: number; memoryEmpty: boolean }) {
  const hello = input.hour < 6 ? 'İyi geceler' : input.hour < 11 ? 'Günaydın' : input.hour < 18 ? 'Merhaba' : 'İyi akşamlar';
  const name = input.firstName ? ` ${input.firstName}` : '';
  const parts: string[] = [`${hello}${name}, ben ${persona.name}.`];
  const pending: string[] = [];
  if (input.pendingIncoming > 0) pending.push(`${input.pendingIncoming} numune talebi cevap bekliyor`);
  if (input.unreadMessages > 0) pending.push(`${input.unreadMessages} okunmamış mesajın var`);
  if (pending.length) parts.push(`${pending.join(', ')}.`);
  if (input.memoryEmpty) parts.push('Kur, fason ve fire değerlerini bir kez söylersen bir daha sormam.');
  parts.push('Ne hesaplayalım?');
  return parts.join(' ');
}
