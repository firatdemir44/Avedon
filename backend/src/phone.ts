// Telefon numarasının TEK kanonik biçimi (2026-09-24, çift hesap hatası: "05389325527" ile
// "+905389325527" ayrı kişi sanılıyordu). Kayıt, OTP, giriş, davet ve WhatsApp eşleşmesi hep
// buradan geçer; veritabanında da yalnızca bu biçim durur (phoneNormalize.ts eski kayıtları çevirir).
//   Türkiye → ulusal biçim "0XXXXXXXXXX" (11 hane): +90…, 0090…, 90… (12 hane), 5… (10 hane), 05…
//   Diğer ülkeler → "+" + rakamlar ("00" öneki "+" sayılır).
export function normalizePhone(raw: string): string {
  const s = String(raw ?? '').trim();
  let digits = s.replace(/\D/g, '');
  if (!digits) return '';
  let international = s.replace(/[\s\-().]/g, '').startsWith('+');
  if (!international && digits.startsWith('00')) {
    digits = digits.slice(2);
    international = true;
  }
  if (international) {
    if (digits.startsWith('90') && digits.length === 12) return `0${digits.slice(2)}`;
    return `+${digits}`;
  }
  if (digits.startsWith('90') && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.length === 10 && /^[2-5]/.test(digits)) return `0${digits}`;
  if (digits.startsWith('0')) return digits;
  // Artısız, Türkiye kalıbına uymayan uzun numara: ülke kodlu yazılmış sayılır.
  return digits.length >= 11 ? `+${digits}` : digits;
}

// Kanonik biçimde mi? (başlangıç işi ve testler)
export function isCanonicalPhone(phone: string): boolean {
  return normalizePhone(phone) === phone;
}

// WhatsApp (Meta Cloud API) numaraları artı işaretsiz E.164 rakamlarıdır: "905321234567".
export function toWhatsAppNumber(phone: string): string {
  const p = normalizePhone(phone);
  if (p.startsWith('+')) return p.slice(1);
  if (p.startsWith('0')) return `90${p.slice(1)}`;
  return p;
}

// Gelen WhatsApp numarasının veritabanında eşleşebileceği yazımlar: önce kanonik biçim; ayrıca
// normalizasyondan önce kaydedilmiş olabilecek eski yazımlar (ham rakam, "+" ile).
export function phoneCandidatesFromWhatsApp(waNumber: string): string[] {
  const digits = waNumber.replace(/\D/g, '');
  return [...new Set<string>([normalizePhone(`+${digits}`), digits, `+${digits}`])];
}

// Yönetici ekranı için: son 4 hane dışında gizli.
export function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  return `${'•'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
}
