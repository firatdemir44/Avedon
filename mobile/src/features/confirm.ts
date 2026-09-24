import { Alert, Platform } from 'react-native';
import { haptics } from './haptics';
import { tr } from '../i18n';

// Geri alınamaz işlemlerden önce onay. react-native-web'in Alert.alert'i boş
// bir fonksiyon: web'de hiçbir şey göstermiyor ve düğme geri çağrıları hiç
// çalışmıyordu. Canlı web sürümünde gönderi silme, yorum silme ve doğrulanmış
// firma adı değiştirme bu yüzden sessizce hiçbir şey yapmıyordu.
// Web'de tarayıcının kendi onay kutusu, telefonda sistem penceresi.
export function confirmAction({
  title,
  message,
  confirmLabel = tr('Tamam'),
  cancelLabel = tr('Vazgeç'),
  destructive = false,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  if (Platform.OS === 'web') {
    const browser = globalThis as { confirm?: (text: string) => boolean };
    return Promise.resolve(typeof browser.confirm === 'function' ? browser.confirm(`${title}\n\n${message}`) : false);
  }

  if (destructive) haptics.warning();
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      // Android'de pencere dışına dokunup kapatmak "vazgeç" sayılır.
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
