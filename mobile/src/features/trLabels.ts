// Sabit etiket listelerini dil değişince doğru gösterecek hale getirir: saklanan
// Türkçe metin değişmez, okunan değer (getter) her okunuşta tr() ile çevrilir.
// Böylece `.label` okuyan mevcut ekranlar dokunulmadan çalışır.
import { tr } from '../i18n';

function def(target: object, key: PropertyKey, text: string) {
  Object.defineProperty(target, key, { get: () => tr(text), enumerable: true, configurable: true });
}

/**
 * Dizi: string öğeler ya da nesnelerin `keys` alanları (varsayılan 'label') çevrilir.
 * Nesne: `keys` verilmezse bütün string değerleri çevrilir.
 */
export function trLabels<T extends object>(value: T, keys?: readonly string[]): T {
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      if (typeof item === 'string') def(value, i, item);
      else if (item && typeof item === 'object') trLabels(item as object, keys ?? ['label']);
    });
    return value;
  }
  for (const k of Object.keys(value)) {
    const v = (value as Record<string, unknown>)[k];
    if (typeof v === 'string' && (!keys || keys.includes(k))) def(value, k, v);
  }
  return value;
}
