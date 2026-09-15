import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// Titreşim sözlüğü (tasarım 4. aşama, denetim FINDING-011). Her ekran kendi
// titreşimini seçmesin diye anlamlar burada sabit:
//   selection → seçim değişti (çip, sekme, birim değiştirme)
//   light     → hafif, anında onay (beğen)
//   success   → önemli bir işlem sunucuda tamamlandı (kaydet, talep et, sil).
//               Sohbet mesajı ve yorum gibi sık yapılan işlemlerde YOK: her
//               gönderişte titreşim rahatsız eder; onlarda yalnızca `error`.
//   warning   → geri alınamaz bir işlemin onayı istendi (silmeden önce)
//   error     → işlem başarısız oldu
// Basmanın kendisi titreşmez: basma geri bildirimi görsel (basılı durum).
// Her dokunuşta titreşim yorucu olur ve anlamını yitirir.
//
// Web'de kapalı: masaüstü tarayıcıda titreşim donanımı yok, telefon
// tarayıcısında ise sayfa titreşimi uygulama hissi vermiyor.
// Hata yutulur: iOS Düşük Güç Modu'nda veya sistem titreşimi kapalıyken
// motor hiçbir şey yapmaz (SDK 57 dokümanı); bu bir uygulama hatası değil.
const enabled = Platform.OS !== 'web';

function run(effect: () => Promise<void>) {
  if (!enabled) return;
  effect().catch(() => {});
}

export const haptics = {
  selection: () => run(() => Haptics.selectionAsync()),
  light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
