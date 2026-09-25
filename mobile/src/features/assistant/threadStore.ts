import AsyncStorage from '@react-native-async-storage/async-storage';

// Asistan sohbetinin kendisi SUNUCUDA saklanır; cihazda yalnızca "en son hangi
// sohbetteydik" bilgisi durur. Böylece uygulama kapanıp açılınca aynı sohbet
// geri gelir, başka bir cihazdan girildiğinde de sohbet listesi sunucudan
// okunur (kayıp yok).
//
// Sohbet listesi ekranı bir sohbet seçtiğinde burayı yazar ve geri döner;
// asistan ekranı odaklandığında burayı okur. Nested (sekme içi) rota
// parametresi taşımak yerine bu yol seçildi: web'de de aynı çalışıyor ve
// React Navigation'ın iç içe params birleştirme kurallarına bağımlı değil.
const STORAGE_KEY = 'takyon.assistant.threadId';

// undefined: henüz diskten okunmadı. null: sohbet yok (yeni sohbet).
let cached: string | null | undefined;

export function peekAssistantThreadId(): string | null | undefined {
  return cached;
}

export async function readAssistantThreadId(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    cached = (await AsyncStorage.getItem(STORAGE_KEY)) ?? null;
  } catch {
    cached = null;
  }
  return cached;
}

export async function writeAssistantThreadId(threadId: string | null): Promise<void> {
  cached = threadId;
  try {
    if (threadId) await AsyncStorage.setItem(STORAGE_KEY, threadId);
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Depolama yoksa sohbet yine de bu oturum boyunca (cached) sürer.
  }
}
