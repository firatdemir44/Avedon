// Sunucu İngilizce sözlüğü: Türkçe metin → İngilizce. Alan dosyaları birleştirilir.
import { server } from './server';

export const EN: Record<string, string> = {
  ...server,
};
