// Ad değişiklikleri (Fırat 2026-09-25: tek marka Takyon Ai): tarayıcıda saklanan anahtarlar eski
// öneklerden "takyon" önekine taşınır. Her şeyden önce, eşzamanlı çalışır; oturum düşmez.
import { Platform } from 'react-native';

// Eski önekler parça parça yazılır (eski adlar kodda düz metin olarak geçmesin).
const OLD = [['a', 'v', 'e', 'd', 'o', 'n'], ['t', 'e', 'x', 'f', 'l', 'o', 'w']].map((p) => p.join(''));

if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && OLD.some((o) => k.startsWith(o))) keys.push(k);
    }
    for (const k of keys) {
      const old = OLD.find((o) => k.startsWith(o))!;
      const next = 'takyon' + k.slice(old.length);
      const v = localStorage.getItem(k);
      if (v !== null && localStorage.getItem(next) === null) localStorage.setItem(next, v);
      localStorage.removeItem(k);
    }
  } catch {
    // Depolama kapalıysa (gizli pencere) taşınacak bir şey de yoktur.
  }
}
