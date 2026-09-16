// Telefon numaralarının kayıt/OTP/giriş boyunca tutarlı karşılaştırılabilmesi için
// tek bir normalizasyon noktası. Ülke kodu varsaymıyor, sadece görünüm farklarını
// (boşluk, tire, parantez) temizliyor.
export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, '');
}

// WhatsApp (Meta Cloud API) numaraları artı işaretsiz E.164 rakamlarıdır:
// "905321234567". Kullanıcı kayıtlarında Türkiye numarası "05321234567"
// biçiminde durur. İki yön de burada; whatsapp.ts ve webhook aynı kuralı kullanır.
export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `90${digits.slice(1)}`;
  return digits;
}

// Gelen WhatsApp numarasının veritabanında eşleşebileceği yazımlar: Türkiye için
// "0XXXXXXXXXX", ayrıca ham rakamlar ve "+" ile başlayan hali (yabancı numara ya da
// farklı kaydedilmiş kullanıcı).
export function phoneCandidatesFromWhatsApp(waNumber: string): string[] {
  const digits = waNumber.replace(/\D/g, '');
  const out = new Set<string>([digits, `+${digits}`]);
  if (digits.startsWith('90') && digits.length === 12) out.add(`0${digits.slice(2)}`);
  return [...out];
}
