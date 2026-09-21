import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Davet bağlantısı (Faz 2, Adım 4): sunucu kayıt bağlantısını
// `https://.../?davet=KOD` biçiminde üretiyor (backend/src/invites.ts inviteUrl).
// Uygulama açılışında bu parametre yakalanır ve cihaza yazılır; kayıt akışı
// "Davet kodu" alanını oradan doldurur, kayıt bitince kod silinir.
const STORAGE_KEY = 'avedon.inviteCode';

// Kodlar A-Z ve 2-9 karakterlerinden oluşuyor (I, L, O, 0, 1 yok) ve 8 hane.
// Yine de sunucu doğrulamasına güveniyoruz: burada yalnızca kabaca temizliyoruz.
export function normalizeInviteCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase().slice(0, 32);
}

function codeFromUrl(url: string): string {
  // URL sınıfı hem web'de hem Hermes'te var; yine de bozuk bağlantıda patlamasın.
  try {
    const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
    if (!query) return '';
    for (const part of query.split('&')) {
      const [key, value] = part.split('=');
      if (key === 'davet' && value) return normalizeInviteCode(decodeURIComponent(value));
    }
  } catch {
    return '';
  }
  return '';
}

export async function readStoredInviteCode(): Promise<string> {
  try {
    return normalizeInviteCode((await AsyncStorage.getItem(STORAGE_KEY)) ?? '');
  } catch {
    return '';
  }
}

export async function clearStoredInviteCode(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sessiz: kodun silinememesi kaydı etkilemez.
  }
}

// Uygulama açılışında bir kez çağrılır (App.tsx). Web'de adres çubuğundaki
// `?davet=`, telefonda açılış bağlantısındaki aynı parametre okunur; adres
// çubuğu temizlenmez (gerekmiyor). Hata olursa sessizce geçilir.
export async function captureInviteCodeFromUrl(): Promise<void> {
  try {
    let url = '';
    if (Platform.OS === 'web') {
      url = (globalThis as { location?: { search?: string } }).location?.search ?? '';
      if (url && !url.startsWith('?')) url = `?${url}`;
    } else {
      url = (await Linking.getInitialURL()) ?? '';
    }
    const code = codeFromUrl(url);
    if (code) await AsyncStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Sessiz.
  }
}
