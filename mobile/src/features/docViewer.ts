import { Linking, Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Sertifika / test raporu belgesi PDF olabilir. Fotoğraf belgeler eskisi gibi
// uygulama içindeki görüntüleyicide açılır; PDF'i RN'in Image bileşeni
// çizemediği için burada dışarıda açılır.

const base64ToBytes = (base64: string): Uint8Array => {
  const decode = (globalThis as { atob?: (data: string) => string }).atob;
  if (!decode) throw new Error('base64_unsupported');
  const binary = decode(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/**
 * `data:application/pdf;base64,...` biçimindeki belgeyi açar.
 * Web: blob URL ile yeni sekme (data URL'i tarayıcılar doğrudan açmıyor).
 * Telefon: önbelleğe dosya olarak yazılır, sistem paylaşma/açma ekranı gelir.
 */
export async function openPdfDataUrl(dataUrl: string, fileName = 'belge.pdf'): Promise<void> {
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;

  if (Platform.OS === 'web') {
    const browser = globalThis as unknown as {
      URL: typeof URL;
      open?: (url: string, target?: string) => unknown;
    };
    const blob = new Blob([base64ToBytes(base64) as unknown as BlobPart], { type: 'application/pdf' });
    const url = browser.URL.createObjectURL(blob);
    const opened = browser.open?.(url, '_blank');
    if (!opened) {
      // Açılır pencere engellendiyse indirme bağlantısı olarak tetikle.
      const doc = (globalThis as unknown as { document?: Document }).document;
      if (doc) {
        const link = doc.createElement('a');
        link.href = url;
        link.download = fileName;
        doc.body.appendChild(link);
        link.click();
        doc.body.removeChild(link);
      }
    }
    setTimeout(() => browser.URL.revokeObjectURL(url), 60_000);
    return;
  }

  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(base64ToBytes(base64));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    return;
  }
  await Linking.openURL(file.uri);
}
