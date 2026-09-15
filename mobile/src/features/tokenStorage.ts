import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// Oturum jetonunun saklandığı yer.
// Telefonda: expo-secure-store (Android Keystore / iOS Keychain, şifreli).
// Web'de: expo-secure-store'un web uygulaması YOK (SDK 57 dokümanı: yalnızca
// Android, iOS, tvOS) — çağrılar "getValueWithKeyAsync is not a function" ile
// patlıyordu ve web'de sayfa yenilenince oturum düşüyordu. Web'de tarayıcıda
// şifreli bir depo bulunmadığı için AsyncStorage'a (localStorage) düşülüyor.
// Bilinen ödünleşim: localStorage'daki jeton, sayfaya script enjekte edilirse
// okunabilir; bunun gerçek çözümü httpOnly çerez ile sunucu tarafında oturum.
const isWeb = Platform.OS === 'web';

export function getStoredToken(key: string): Promise<string | null> {
  return isWeb ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key);
}

export function setStoredToken(key: string, value: string): Promise<void> {
  return isWeb ? AsyncStorage.setItem(key, value) : SecureStore.setItemAsync(key, value);
}

export function deleteStoredToken(key: string): Promise<void> {
  return isWeb ? AsyncStorage.removeItem(key) : SecureStore.deleteItemAsync(key);
}
