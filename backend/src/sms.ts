// SMS ile OTP gönderimi. whatsapp.ts ile aynı desen: gerçek bir sağlayıcı
// (örn. Twilio) yapılandırılmamışsa sessizce konsola loglar, sistemin geri
// kalanı etkilenmez.
//
// Gerçek bir sağlayıcı eklemek için (örnek: Twilio):
//   TWILIO_ACCOUNT_SID=...
//   TWILIO_AUTH_TOKEN=...
//   TWILIO_FROM_NUMBER=...
// bu üçü env'de tanımlıysa aşağıdaki isSmsConfigured true olacak şekilde
// güncelleyip callTwilioApi gibi bir fonksiyon eklemek yeterli.

export const isSmsConfigured = false;

export async function sendOtpSms(phone: string, code: string): Promise<void> {
  if (!isSmsConfigured) {
    console.log(`[sms] yapılandırılmamış, kod gönderilmedi -> ${phone}: ${code}`);
    return;
  }
  // Gerçek sağlayıcı buraya eklenecek.
}
