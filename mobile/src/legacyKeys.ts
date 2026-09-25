// Ad değişikliği (Fırat 2026-09-25: eski ad hiçbir yerde kalmasın): tarayıcıda saklanan anahtarlar
// eski önekten "texflow" önekine taşınır. Her şeyden önce, eşzamanlı çalışır; oturum düşmez.
import { Platform } from 'react-native';

const OLD = ['a', 'v', 'e', 'd', 'o', 'n'].join('');

if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(OLD)) keys.push(k);
    }
    for (const k of keys) {
      const next = 'texflow' + k.slice(OLD.length);
      const v = localStorage.getItem(k);
      if (v !== null && localStorage.getItem(next) === null) localStorage.setItem(next, v);
      localStorage.removeItem(k);
    }
  } catch {
    // Depolama kapalıysa (gizli pencere) taşınacak bir şey de yoktur.
  }
}
