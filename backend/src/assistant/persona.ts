// Asistan kimliği (kullanıcı kararı 2026-09-23): İpek/Mert karakterleri kaldırıldı;
// tek kimlik "Takyon asistanı". User.assistantPersona sütunu duruyor ama kullanılmıyor.
export const ASSISTANT_NAME = 'Takyon asistanı';

// Eski uygulama sürümleri /persona uçlarını çağırıyor; çökmemeleri için tek seçenek.
export const LEGACY_PERSONA_KEY = 'ipek';

export function identityBlock(userFirstName: string | null) {
  const who = userFirstName
    ? `Kullanıcının adı ${userFirstName}; hitap ederken adını kullanabilirsin, "siz" değil "sen" dersin.`
    : 'Kullanıcıya "sen" diye hitap edersin.';
  return (
    `Senin adın ${ASSISTANT_NAME}. Tekstili, üretimi ve maliyeti bilen, sıcak ve güven veren bir yardımcısın. ` +
    'Akıcı, doğal, konuşur gibi bir Türkçe kullanırsın; kısa cümleler kurar, laf kalabalığı yapmazsın. ' +
    `Kendini yalnızca sorulursa ya da ilk mesajda kısaca tanıtırsın ("Ben ${ASSISTANT_NAME}"); her mesajda adını tekrarlamazsın. ${who}`
  );
}

export const GREETING_CLOSE = 'Kumaş ya da iplik bulmak, maliyet hesaplamak, firmalara sormak, ihracat pazarı aramak… Bugün sana nasıl yardımcı olayım?';

// Karşılama: model çağrılmaz (maliyet yok, anında). Saat + ad + bekleyen işler.
export function greetingText(input: { firstName: string | null; hour: number; pendingIncoming: number; unreadMessages: number; memoryEmpty: boolean }) {
  const hello = input.hour < 6 ? 'İyi geceler' : input.hour < 11 ? 'Günaydın' : input.hour < 18 ? 'Merhaba' : 'İyi akşamlar';
  const name = input.firstName ? ` ${input.firstName}` : '';
  const parts: string[] = [`${hello}${name}, ben ${ASSISTANT_NAME}.`];
  const pending: string[] = [];
  if (input.pendingIncoming > 0) pending.push(`${input.pendingIncoming} numune talebi cevap bekliyor`);
  if (input.unreadMessages > 0) pending.push(`${input.unreadMessages} okunmamış mesajın var`);
  if (pending.length) parts.push(`${pending.join(', ')}.`);
  if (input.memoryEmpty) parts.push('Fason ve fire değerlerini bir kez söylersen bir daha sormam.');
  // Asistan yalnız hesap aracı değil (Fırat 2026-09-24): kumaş/iplik bulur, firmalara sorar, pazar araştırır.
  parts.push(GREETING_CLOSE);
  return parts.join(' ');
}
