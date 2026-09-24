// Rehberden kişi seçme (davet). Web'de Contact Picker API: Android Chrome destekler;
// iPhone Safari ve masaüstü desteklemez (o zaman düğme gizlenir, kullanıcı numarayı yazar).
// Native (Expo) sürümde expo-contacts eklenince burası genişletilir.
import { Platform } from 'react-native';

type ContactsNav = { contacts?: { select: (props: string[], opts?: { multiple?: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> } };

export const canPickContact = () =>
  Platform.OS === 'web' && typeof navigator !== 'undefined' && !!(navigator as unknown as ContactsNav).contacts?.select;

export async function pickContact(): Promise<{ name: string; phone: string } | null> {
  const api = (navigator as unknown as ContactsNav).contacts;
  if (!api) return null;
  const [c] = await api.select(['name', 'tel'], { multiple: false });
  if (!c) return null;
  // Birden çok numara varsa cep (05…/+905…) olanı tercih edilir.
  const tels = (c.tel ?? []).map((t) => t.trim()).filter(Boolean);
  const mobile = tels.find((t) => /^(\+?90)?\s*0?\s*5/.test(t.replace(/[\s()-]/g, ''))) ?? tels[0] ?? '';
  return { name: (c.name ?? [])[0]?.trim() ?? '', phone: mobile };
}
