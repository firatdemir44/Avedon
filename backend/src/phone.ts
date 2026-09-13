// Telefon numaralarının kayıt/OTP/giriş boyunca tutarlı karşılaştırılabilmesi için
// tek bir normalizasyon noktası. Ülke kodu varsaymıyor, sadece görünüm farklarını
// (boşluk, tire, parantez) temizliyor.
export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, '');
}
